-- Resource Billing Batch 2 Gaps: Single Source of Truth for cost estimates + HQ Storage summary
-- Additive only — no existing tables or behavior changed.

-- ============================================================
-- WS4 + WS5: Seed avg cost config keys into commercial_config_items
-- These become the Single Source of Truth for cost estimates used by
-- both get_hq_resource_profit_summary (WS4) and TenantResourceLedger (WS5).
-- ============================================================
INSERT INTO commercial_config_items (config_key, scope, scope_id, value, is_active)
SELECT v.config_key, v.scope, v.scope_id, v.value, true
FROM (VALUES
  ('avg_ai_cost_usd',  'global', NULL::uuid, '{"cost": 0.002}'::jsonb),
  ('avg_ocr_cost_usd', 'global', NULL::uuid, '{"cost": 0.001}'::jsonb)
) AS v(config_key, scope, scope_id, value)
WHERE NOT EXISTS (
  SELECT 1 FROM commercial_config_items c
  WHERE c.config_key = v.config_key AND c.scope = 'global' AND c.scope_id IS NULL
);

-- ============================================================
-- WS4: Update get_hq_resource_profit_summary to read avg costs from
-- commercial_config_items (not ai_cost_rates which is empty).
-- commercial_config_items is now the approved Single Source of Truth
-- for billing estimation rates.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_hq_resource_profit_summary(
  p_days integer DEFAULT 30
)
RETURNS TABLE(
  credit_type           text,
  usage_count           bigint,
  avg_cost_usd          numeric,
  total_cost_usd        numeric,
  markup_pct            numeric,
  billing_usd_myr_rate  numeric,
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
  -- Read all rates from commercial_config_items (Single Source of Truth)
  SELECT COALESCE((value->>'rate')::numeric, 4.45)  INTO v_usd_myr
    FROM commercial_config_items WHERE config_key = 'billing_usd_myr_rate' AND is_active LIMIT 1;
  SELECT COALESCE((value->>'pct')::numeric,  300)   INTO v_markup_ai
    FROM commercial_config_items WHERE config_key = 'markup_ai_pct'        AND is_active LIMIT 1;
  SELECT COALESCE((value->>'pct')::numeric,  500)   INTO v_markup_ocr
    FROM commercial_config_items WHERE config_key = 'markup_ocr_pct'       AND is_active LIMIT 1;
  SELECT COALESCE((value->>'cost')::numeric, 0.002) INTO v_avg_ai
    FROM commercial_config_items WHERE config_key = 'avg_ai_cost_usd'      AND is_active LIMIT 1;
  SELECT COALESCE((value->>'cost')::numeric, 0.001) INTO v_avg_ocr
    FROM commercial_config_items WHERE config_key = 'avg_ocr_cost_usd'     AND is_active LIMIT 1;

  v_usd_myr    := COALESCE(v_usd_myr,    4.45);
  v_markup_ai  := COALESCE(v_markup_ai,  300);
  v_markup_ocr := COALESCE(v_markup_ocr, 500);
  v_avg_ai     := COALESCE(v_avg_ai,     0.002);
  v_avg_ocr    := COALESCE(v_avg_ocr,    0.001);

  RETURN QUERY
  WITH col_usage AS (
    SELECT
      t.credit_type::text                  AS col_ctype,
      COUNT(*)                             AS col_cnt
    FROM resource_wallet_transactions t
    WHERE t.activity_type::text = 'USAGE'
      AND t.created_at >= now() - (p_days || ' days')::interval
      AND t.credit_type::text IN ('AI', 'OCR')
    GROUP BY t.credit_type::text
  )
  SELECT
    u.col_ctype,
    u.col_cnt,
    CASE u.col_ctype WHEN 'AI' THEN v_avg_ai ELSE v_avg_ocr END                                        AS avg_cost_usd,
    u.col_cnt * CASE u.col_ctype WHEN 'AI' THEN v_avg_ai ELSE v_avg_ocr END                            AS total_cost_usd,
    CASE u.col_ctype WHEN 'AI' THEN v_markup_ai ELSE v_markup_ocr END                                  AS markup_pct,
    v_usd_myr,
    -- Hasil Sumber = kos * (1 + markup%) * kadar_usd_myr
    u.col_cnt * (CASE u.col_ctype WHEN 'AI' THEN v_avg_ai ELSE v_avg_ocr END)
              * (1 + CASE u.col_ctype WHEN 'AI' THEN v_markup_ai ELSE v_markup_ocr END / 100)
              * v_usd_myr                                                                               AS estimated_revenue_myr,
    -- Kos Sumber = kos_pembekal * kadar_usd_myr
    u.col_cnt * (CASE u.col_ctype WHEN 'AI' THEN v_avg_ai ELSE v_avg_ocr END) * v_usd_myr             AS estimated_cost_myr,
    -- Margin = Hasil - Kos
    u.col_cnt * (CASE u.col_ctype WHEN 'AI' THEN v_avg_ai ELSE v_avg_ocr END)
              * (CASE u.col_ctype WHEN 'AI' THEN v_markup_ai ELSE v_markup_ocr END / 100)
              * v_usd_myr                                                                               AS estimated_margin_myr
  FROM col_usage u;
END;
$$;

-- ============================================================
-- WS3: get_hq_storage_ledger_summary — HQ view of storage usage
-- per workspace from resource_wallet_transactions (same source as
-- tenant ledger → ensures ledger tenant dan HQ konsisten).
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_hq_storage_ledger_summary()
RETURNS TABLE(
  workspace_id       uuid,
  workspace_name     text,
  tenant_id          uuid,
  tenant_name        text,
  total_upload_bytes bigint,
  total_delete_bytes bigint,
  net_bytes          bigint,
  upload_count       bigint,
  delete_count       bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH col_storage AS (
    SELECT
      rw.workspace_id                                           AS col_workspace_id,
      SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END)    AS col_upload_bytes,
      SUM(CASE WHEN t.amount < 0 THEN t.amount ELSE 0 END)    AS col_delete_bytes,
      SUM(t.amount)                                            AS col_net_bytes,
      COUNT(CASE WHEN t.amount > 0 THEN 1 END)                AS col_upload_count,
      COUNT(CASE WHEN t.amount < 0 THEN 1 END)                AS col_delete_count
    FROM resource_wallet_transactions t
    JOIN resource_wallets rw ON rw.id = t.wallet_id
    WHERE t.credit_type::text = 'STORAGE'
    GROUP BY rw.workspace_id
  )
  SELECT
    s.col_workspace_id,
    COALESCE(w.name, s.col_workspace_id::text)    AS workspace_name,
    w.tenant_id,
    COALESCE(ten.name, w.tenant_id::text)         AS tenant_name,
    s.col_upload_bytes,
    s.col_delete_bytes,
    s.col_net_bytes,
    s.col_upload_count,
    s.col_delete_count
  FROM col_storage s
  LEFT JOIN workspaces w    ON w.id = s.col_workspace_id
  LEFT JOIN tenants    ten  ON ten.id = w.tenant_id
  ORDER BY s.col_net_bytes DESC;
END;
$$;
