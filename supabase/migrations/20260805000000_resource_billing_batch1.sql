-- Resource Billing Batch 1: HQ Commercial Policy Foundation + Ledger RPCs
-- Additive only — no existing functions, tables, or behavior changed.

-- 1. consume_resource_credit_v2 — faithful port of consume_resource_credit v1,
--    same logic but returns TABLE(ok boolean, txn_id uuid) instead of boolean.
--    Old consume_resource_credit() is UNCHANGED. All 4 existing callers unaffected.
CREATE OR REPLACE FUNCTION public.consume_resource_credit_v2(
  p_tenant_id    uuid,
  p_workspace_id uuid,
  p_credit_type  credit_type,
  p_amount       bigint  DEFAULT 1,
  p_description  text    DEFAULT NULL
)
RETURNS TABLE(ok boolean, txn_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id   uuid;
  v_balance     bigint;
  v_is_internal boolean;
  v_new_txn_id  uuid;
BEGIN
  -- Internal tenants bypass billing
  SELECT is_internal INTO v_is_internal FROM public.tenants WHERE id = p_tenant_id;
  IF v_is_internal IS TRUE THEN
    RETURN QUERY SELECT true, NULL::uuid;
    RETURN;
  END IF;

  -- Ensure wallet exists (mirrors original consume_resource_credit)
  PERFORM public.ensure_resource_wallet(p_tenant_id, p_workspace_id);

  -- Lock wallet row — same as original
  SELECT id,
    CASE p_credit_type
      WHEN 'AI'           THEN ai_credits_balance
      WHEN 'OCR'          THEN ocr_credits_balance
      WHEN 'NOTIFICATION' THEN notification_credits_balance
      ELSE 0
    END
  INTO v_wallet_id, v_balance
  FROM public.resource_wallets
  WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF v_wallet_id IS NULL OR v_balance < p_amount THEN
    RETURN QUERY SELECT false, NULL::uuid;
    RETURN;
  END IF;

  IF p_credit_type = 'AI' THEN
    UPDATE public.resource_wallets
      SET ai_credits_balance = ai_credits_balance - p_amount, updated_at = now()
      WHERE id = v_wallet_id;
  ELSIF p_credit_type = 'OCR' THEN
    UPDATE public.resource_wallets
      SET ocr_credits_balance = ocr_credits_balance - p_amount, updated_at = now()
      WHERE id = v_wallet_id;
  ELSIF p_credit_type = 'NOTIFICATION' THEN
    UPDATE public.resource_wallets
      SET notification_credits_balance = notification_credits_balance - p_amount, updated_at = now()
      WHERE id = v_wallet_id;
  ELSE
    RETURN QUERY SELECT false, NULL::uuid;
    RETURN;
  END IF;

  INSERT INTO public.resource_wallet_transactions (wallet_id, credit_type, activity_type, amount, description)
  VALUES (v_wallet_id, p_credit_type, 'USAGE', -p_amount, p_description)
  RETURNING id INTO v_new_txn_id;

  RETURN QUERY SELECT true, v_new_txn_id;
END;
$$;

-- 2. get_tenant_resource_ledger — paginated ledger with running balance per credit_type
CREATE OR REPLACE FUNCTION public.get_tenant_resource_ledger(
  p_workspace_id uuid,
  p_credit_type  text    DEFAULT NULL,
  p_limit        integer DEFAULT 50,
  p_offset       integer DEFAULT 0
)
RETURNS TABLE(
  txn_id        uuid,
  credit_type   text,
  activity_type text,
  amount        numeric,
  description   text,
  metadata      jsonb,
  created_at    timestamptz,
  running_balance numeric,
  job_ref       text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH wallet AS (
    SELECT id FROM resource_wallets WHERE workspace_id = p_workspace_id LIMIT 1
  ),
  txns AS (
    SELECT
      t.id,
      t.credit_type::text,
      t.activity_type::text,
      t.amount,
      t.description,
      t.metadata,
      t.created_at,
      COALESCE(t.metadata->>'job_ref', t.metadata->>'job_id') AS job_ref
    FROM resource_wallet_transactions t
    JOIN wallet w ON t.wallet_id = w.id
    WHERE (p_credit_type IS NULL OR t.credit_type::text = p_credit_type)
  ),
  ranked AS (
    SELECT *,
      SUM(amount) OVER (
        PARTITION BY credit_type
        ORDER BY created_at
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS running_balance
    FROM txns
  )
  SELECT
    r.id          AS txn_id,
    r.credit_type,
    r.activity_type,
    r.amount,
    r.description,
    r.metadata,
    r.created_at,
    r.running_balance,
    r.job_ref
  FROM ranked r
  ORDER BY r.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- 3. Seed 10 billing policy rows into commercial_config_items (idempotent)
INSERT INTO commercial_config_items (config_key, scope, scope_id, value, is_active)
SELECT v.config_key, v.scope, v.scope_id, v.value, true
FROM (VALUES
  ('billing_usd_myr_rate', 'global', NULL::uuid, '{"rate": 4.45}'::jsonb),
  ('markup_ai_pct',        'global', NULL::uuid, '{"pct": 300}'::jsonb),
  ('markup_ocr_pct',       'global', NULL::uuid, '{"pct": 500}'::jsonb),
  ('credit_per_ai_call',   'global', NULL::uuid, '{"factor": 1}'::jsonb),
  ('credit_per_ocr_page',  'global', NULL::uuid, '{"factor": 1}'::jsonb),
  ('min_charge_ai_myr',    'global', NULL::uuid, '{"min": 0.01}'::jsonb),
  ('min_charge_ocr_myr',   'global', NULL::uuid, '{"min": 0.005}'::jsonb),
  ('rounding_rule',        'global', NULL::uuid, '{"rule": "ceil"}'::jsonb),
  ('free_allowance_ai',    'global', NULL::uuid, '{"credits": 0}'::jsonb),
  ('promo_multiplier_ai',  'global', NULL::uuid, '{"multiplier": 1.0}'::jsonb)
) AS v(config_key, scope, scope_id, value)
WHERE NOT EXISTS (
  SELECT 1 FROM commercial_config_items c
  WHERE c.config_key = v.config_key
    AND c.scope = v.scope
    AND c.scope_id IS NOT DISTINCT FROM v.scope_id
);
