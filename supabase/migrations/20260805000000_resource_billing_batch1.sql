-- Resource Billing Batch 1: HQ Commercial Policy Foundation + Ledger RPCs
-- Additive only — no existing functions, tables, or behavior changed.

-- 1. consume_resource_credit_v2 — same logic as v1 but returns TABLE(ok boolean, txn_id uuid)
--    Old consume_resource_credit() is UNCHANGED. All 4 existing callers unaffected.
CREATE OR REPLACE FUNCTION public.consume_resource_credit_v2(
  p_tenant_id uuid,
  p_workspace_id uuid,
  p_credit_type text,
  p_amount numeric DEFAULT 1,
  p_description text DEFAULT ''
)
RETURNS TABLE(ok boolean, txn_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id uuid;
  v_balance   numeric;
  v_new_txn_id uuid;
BEGIN
  SELECT id INTO v_wallet_id
  FROM resource_wallets
  WHERE tenant_id = p_tenant_id AND workspace_id = p_workspace_id
  LIMIT 1;

  IF v_wallet_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid;
    RETURN;
  END IF;

  IF p_credit_type = 'AI' THEN
    SELECT ai_credits INTO v_balance FROM resource_wallets WHERE id = v_wallet_id;
  ELSIF p_credit_type = 'OCR' THEN
    SELECT ocr_credits INTO v_balance FROM resource_wallets WHERE id = v_wallet_id;
  ELSE
    v_balance := 9999;
  END IF;

  IF v_balance IS NULL OR v_balance < p_amount THEN
    RETURN QUERY SELECT false, NULL::uuid;
    RETURN;
  END IF;

  IF p_credit_type = 'AI' THEN
    UPDATE resource_wallets SET ai_credits = ai_credits - p_amount WHERE id = v_wallet_id;
  ELSIF p_credit_type = 'OCR' THEN
    UPDATE resource_wallets SET ocr_credits = ocr_credits - p_amount WHERE id = v_wallet_id;
  END IF;

  INSERT INTO resource_wallet_transactions (wallet_id, credit_type, activity_type, amount, description)
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
