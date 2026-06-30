-- ============================================================================
-- Fix: HQ Package Catalog → Tenant Wallet synchronization break.
-- Root cause: hqService.ts updatePlan() performed a bare UPDATE on
-- subscription_plans with no fan-out to existing tenant wallets, and no DB
-- trigger existed to compensate. Tenants already subscribed to a plan kept
-- their old wallet balance/limit forever after HQ edited that plan's
-- allowances in place. This RPC restores HQ Package Catalog as the single
-- source of truth: editing a plan's allowance now deltas every subscribed
-- tenant's wallet via the existing apply_entitlement_delta primitive
-- (same code path used by upgrade/downgrade/renewal), preserving Usage and
-- Purchased Top-up history (ledger-only, additive ADJUSTMENT/ALLOCATION
-- rows) and leaving Remaining to be recomputed from the updated balance.
--
-- sync_wallet_entitlement is NOT reused here: it looks up old/new plan rows
-- BY ID from subscription_plans, so if called after the catalog row is
-- already updated, both lookups would return the same new values and
-- produce a zero delta. This function instead captures the OLD allowance
-- values via SELECT ... FOR UPDATE before the UPDATE statement runs, then
-- calls apply_entitlement_delta directly per resource per workspace.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_subscription_plan_and_sync(
  p_plan_id uuid,
  p_name text,
  p_monthly_price_myr numeric,
  p_annual_price_myr numeric,
  p_ai_credits_allowance bigint,
  p_ocr_credits_allowance bigint,
  p_storage_credits_allowance_mb bigint,
  p_features jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old public.subscription_plans;
  v_delta_ai bigint;
  v_delta_ocr bigint;
  v_delta_storage bigint;
  v_ts record;
BEGIN
  IF NOT is_hq_user() THEN
    RAISE EXCEPTION 'Permission denied: HQ access required';
  END IF;

  SELECT * INTO v_old FROM public.subscription_plans WHERE id = p_plan_id FOR UPDATE;
  IF v_old.id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.subscription_plans SET
    name = p_name,
    monthly_price_myr = p_monthly_price_myr,
    annual_price_myr = p_annual_price_myr,
    ai_credits_allowance = p_ai_credits_allowance,
    ocr_credits_allowance = p_ocr_credits_allowance,
    storage_credits_allowance_mb = p_storage_credits_allowance_mb,
    features = p_features,
    updated_at = now()
  WHERE id = p_plan_id;

  v_delta_ai := p_ai_credits_allowance - v_old.ai_credits_allowance;
  v_delta_ocr := p_ocr_credits_allowance - v_old.ocr_credits_allowance;
  v_delta_storage := (p_storage_credits_allowance_mb - v_old.storage_credits_allowance_mb) * 1024 * 1024;

  IF v_delta_ai <> 0 OR v_delta_ocr <> 0 OR v_delta_storage <> 0 THEN
    FOR v_ts IN
      SELECT ts.tenant_id, w.id AS workspace_id
      FROM public.tenant_subscriptions ts
      JOIN public.workspaces w ON w.tenant_id = ts.tenant_id
      WHERE ts.plan_id = p_plan_id
    LOOP
      PERFORM public.apply_entitlement_delta(v_ts.tenant_id, v_ts.workspace_id, 'AI', v_delta_ai, 'catalog_update', 'hq_catalog_update');
      PERFORM public.apply_entitlement_delta(v_ts.tenant_id, v_ts.workspace_id, 'OCR', v_delta_ocr, 'catalog_update', 'hq_catalog_update');
      PERFORM public.apply_entitlement_delta(v_ts.tenant_id, v_ts.workspace_id, 'STORAGE', v_delta_storage, 'catalog_update', 'hq_catalog_update');
    END LOOP;
  END IF;

  RETURN true;
END;
$function$;
