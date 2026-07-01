-- Resource Billing Batch 2: Storage Ledger + HQ Profit Summary
-- Additive only — no existing functions, tables, or behavior changed.

-- 1. log_storage_ledger_entry — writes USAGE/REFUND rows in resource_wallet_transactions
--    for file uploads (+bytes) and deletes (-bytes). Does NOT modify storage_used_bytes
--    (that is maintained by the existing sync RPCs). Pure ledger append.
CREATE OR REPLACE FUNCTION public.log_storage_ledger_entry(
  p_workspace_id  uuid,
  p_amount_bytes  bigint,
  p_activity_type text DEFAULT 'USAGE',
  p_description   text DEFAULT '',
  p_metadata      jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id uuid;
  v_txn_id    uuid;
BEGIN
  SELECT id INTO v_wallet_id
  FROM resource_wallets
  WHERE workspace_id = p_workspace_id
  LIMIT 1;

  IF v_wallet_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO resource_wallet_transactions (
    wallet_id, credit_type, activity_type, amount, description, metadata
  )
  VALUES (
    v_wallet_id,
    'STORAGE'::credit_type,
    p_activity_type::credit_activity_type,
    p_amount_bytes,
    p_description,
    p_metadata
  )
  RETURNING id INTO v_txn_id;

  RETURN v_txn_id;
END;
$$;

-- 2. get_hq_resource_profit_summary — HQ-only view of estimated revenue vs cost
--    Reads: resource_wallet_transactions USAGE counts, ai_cost_rates, commercial_config_items
--    Returns one row per credit_type with estimated cost and estimated revenue (MYR)
CREATE OR REPLACE FUNCTION public.get_hq_resource_profit_summary(
  p_days integer DEFAULT 30
)
RETURNS TABLE(
  credit_type          text,
  usage_count          bigint,
  avg_cost_usd         numeric,
  total_cost_usd       numeric,
  markup_pct           numeric,
  billing_usd_myr_rate numeric,
  estimated_revenue_myr numeric,
  estimated_cost_myr    numeric,
  estimated_margin_myr  numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usd_myr    numeric;
  v_markup_ai  numeric;
  v_markup_ocr numeric;
  v_avg_ai     numeric;
  v_avg_ocr    numeric;
BEGIN
  -- Fetch billing policy from commercial_config_items
  SELECT COALESCE((value->>'rate')::numeric, 4.45)  INTO v_usd_myr
    FROM commercial_config_items WHERE config_key = 'billing_usd_myr_rate' AND is_active LIMIT 1;
  SELECT COALESCE((value->>'pct')::numeric, 300)    INTO v_markup_ai
    FROM commercial_config_items WHERE config_key = 'markup_ai_pct'        AND is_active LIMIT 1;
  SELECT COALESCE((value->>'pct')::numeric, 500)    INTO v_markup_ocr
    FROM commercial_config_items WHERE config_key = 'markup_ocr_pct'       AND is_active LIMIT 1;

  v_usd_myr    := COALESCE(v_usd_myr,    4.45);
  v_markup_ai  := COALESCE(v_markup_ai,  300);
  v_markup_ocr := COALESCE(v_markup_ocr, 500);

  -- Avg AI/OCR cost per call from ai_cost_rates
  SELECT COALESCE(AVG(cost_per_call_usd), 0.002) INTO v_avg_ai  FROM ai_cost_rates WHERE provider IN ('openai','anthropic','gemini','deepseek');
  SELECT COALESCE(AVG(cost_per_call_usd), 0.001) INTO v_avg_ocr FROM ai_cost_rates WHERE provider IN ('openai','anthropic','gemini','deepseek');

  RETURN QUERY
  WITH usage AS (
    SELECT
      t.credit_type::text AS ctype,
      COUNT(*)            AS cnt
    FROM resource_wallet_transactions t
    WHERE t.activity_type = 'USAGE'
      AND t.created_at >= now() - (p_days || ' days')::interval
      AND t.credit_type::text IN ('AI', 'OCR')
    GROUP BY t.credit_type::text
  )
  SELECT
    u.ctype,
    u.cnt,
    CASE u.ctype WHEN 'AI' THEN v_avg_ai ELSE v_avg_ocr END,
    u.cnt * CASE u.ctype WHEN 'AI' THEN v_avg_ai ELSE v_avg_ocr END,
    CASE u.ctype WHEN 'AI' THEN v_markup_ai ELSE v_markup_ocr END,
    v_usd_myr,
    -- Revenue = cost * (1 + markup_pct/100) * usd_myr
    u.cnt * (CASE u.ctype WHEN 'AI' THEN v_avg_ai ELSE v_avg_ocr END)
          * (1 + CASE u.ctype WHEN 'AI' THEN v_markup_ai ELSE v_markup_ocr END / 100)
          * v_usd_myr,
    -- Cost = usage_count * avg_cost_usd * usd_myr
    u.cnt * (CASE u.ctype WHEN 'AI' THEN v_avg_ai ELSE v_avg_ocr END) * v_usd_myr,
    -- Margin = revenue - cost
    u.cnt * (CASE u.ctype WHEN 'AI' THEN v_avg_ai ELSE v_avg_ocr END)
          * (CASE u.ctype WHEN 'AI' THEN v_markup_ai ELSE v_markup_ocr END / 100)
          * v_usd_myr
  FROM usage u;
END;
$$;
