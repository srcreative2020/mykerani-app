-- ============================================================================
-- One-time catch-up synchronization: bring every existing tenant wallet's
-- AI / OCR / Storage quota in line with the CURRENT HQ Package Catalog
-- values, using the same apply_entitlement_delta() primitive the live sync
-- path uses (see 20260803030000_catalog_to_wallet_sync_fix.sql).
--
-- Why this is needed: before that fix, hqService.ts updatePlan() performed
-- a bare UPDATE on subscription_plans with no wallet fan-out, and no
-- resource_wallets row was ever created via sync_wallet_entitlement() for
-- the tenants in this dataset either (confirmed live: zero
-- resource_wallet_transactions rows with description LIKE 'Entitlement
-- sync%' exist for any tenant). Wallet balances/limits were seeded
-- independently of subscription_plans and have never been plan-synced, so
-- they currently disagree with the catalog by an arbitrary amount per
-- tenant/resource.
--
-- Method: for every (tenant, workspace) with an active subscription,
-- delta = current catalog allowance - current wallet balance/limit, applied
-- via apply_entitlement_delta() exactly as upgrade/downgrade/renewal do.
-- This is additive/subtractive through the existing ledger primitives, not
-- a direct UPDATE:
--   - Does NOT reset the wallet row (allocate_wallet_credits/
--     adjust_wallet_balance only ever add/subtract the computed delta).
--   - Does NOT delete or modify any existing resource_wallet_transactions
--     row -- only a new ALLOCATION/ADJUSTMENT row per affected resource is
--     appended, exactly like every other entitlement-sync event.
--   - Does NOT touch storage_used_bytes (actual usage) or any Purchased
--     Top-up/Usage ledger rows -- those have distinct sources/descriptions
--     ('topup_purchase', 'promotion', OCR/AI usage debits) untouched here.
--   - AI/OCR/STORAGE only, matching update_subscription_plan_and_sync()'s
--     scope (NOTIFICATION credits are not an HQ Package Catalog field).
-- ============================================================================
DO $$
DECLARE
  v_row RECORD;
  v_target_storage_bytes bigint;
  v_delta_ai bigint;
  v_delta_ocr bigint;
  v_delta_storage bigint;
  v_adjusted_count int := 0;
  v_examined_count int := 0;
BEGIN
  FOR v_row IN
    SELECT
      ts.tenant_id,
      w.id AS workspace_id,
      sp.ai_credits_allowance,
      sp.ocr_credits_allowance,
      sp.storage_credits_allowance_mb,
      rw.ai_credits_balance,
      rw.ocr_credits_balance,
      rw.storage_limit_bytes
    FROM public.tenant_subscriptions ts
    JOIN public.subscription_plans sp ON sp.id = ts.plan_id
    JOIN public.tenants t ON t.id = ts.tenant_id AND t.is_internal IS NOT TRUE
    JOIN public.workspaces w ON w.tenant_id = ts.tenant_id
    LEFT JOIN public.resource_wallets rw ON rw.workspace_id = w.id
  LOOP
    v_examined_count := v_examined_count + 1;

    -- Ensure a wallet row exists before reading/adjusting it (idempotent;
    -- a tenant with no wallet yet just gets one created at 0/0/0).
    PERFORM public.ensure_resource_wallet(v_row.tenant_id, v_row.workspace_id);

    SELECT ai_credits_balance, ocr_credits_balance, storage_limit_bytes
      INTO v_row.ai_credits_balance, v_row.ocr_credits_balance, v_row.storage_limit_bytes
      FROM public.resource_wallets
     WHERE workspace_id = v_row.workspace_id;

    v_target_storage_bytes := v_row.storage_credits_allowance_mb * 1024 * 1024;

    v_delta_ai := v_row.ai_credits_allowance - coalesce(v_row.ai_credits_balance, 0);
    v_delta_ocr := v_row.ocr_credits_allowance - coalesce(v_row.ocr_credits_balance, 0);
    v_delta_storage := v_target_storage_bytes - coalesce(v_row.storage_limit_bytes, 0);

    IF v_delta_ai <> 0 THEN
      PERFORM public.apply_entitlement_delta(v_row.tenant_id, v_row.workspace_id, 'AI', v_delta_ai, 'one_time_catalog_catchup_2026', 'hq_catalog_catchup_2026');
    END IF;
    IF v_delta_ocr <> 0 THEN
      PERFORM public.apply_entitlement_delta(v_row.tenant_id, v_row.workspace_id, 'OCR', v_delta_ocr, 'one_time_catalog_catchup_2026', 'hq_catalog_catchup_2026');
    END IF;
    IF v_delta_storage <> 0 THEN
      PERFORM public.apply_entitlement_delta(v_row.tenant_id, v_row.workspace_id, 'STORAGE', v_delta_storage, 'one_time_catalog_catchup_2026', 'hq_catalog_catchup_2026');
    END IF;

    IF v_delta_ai <> 0 OR v_delta_ocr <> 0 OR v_delta_storage <> 0 THEN
      v_adjusted_count := v_adjusted_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'One-time catalog catch-up: % workspace(s) examined, % adjusted', v_examined_count, v_adjusted_count;
END $$;
