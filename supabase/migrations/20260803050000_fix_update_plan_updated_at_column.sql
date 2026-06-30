-- ============================================================================
-- Fix: HQ Package Catalog Save silently failing.
--
-- Root cause (reproduced live against production with the exact HQ owner's
-- auth context, see verification below): update_subscription_plan_and_sync()'s
-- UPDATE statement sets `updated_at = now()`, but public.subscription_plans
-- has NO `updated_at` column (only `created_at`). Every call to this RPC
-- threw:
--   ERROR: 42703: column "updated_at" of relation "subscription_plans" does
--   not exist
-- Postgres rolled back the entire UPDATE (and the whole function, including
-- the wallet-delta loop) on every single invocation. hqService.updatePlan()
-- received this as a Supabase `error` and returned `false`, but its only
-- caller, HQConsoleShell.tsx's savePlan(), does
-- `await hqService.updatePlan(...)` without checking the boolean result, so
-- the UI proceeded to reloadPlans() (re-fetching the unchanged old row) and
-- closed the modal as if the save had succeeded. This is why "Simpan
-- Perubahan" appeared to work but the Package Catalog (and every subscribed
-- tenant's wallet, since the apply_entitlement_delta loop after the UPDATE
-- never ran either) kept the old AI/OCR values.
--
-- Fix: drop the `updated_at = now()` assignment -- there is no such column
-- to update, and adding one is out of scope (no other code reads/writes it,
-- and the table already tracks `created_at`). No other line in this
-- function is touched. Wallet/ledger logic (apply_entitlement_delta) is
-- unchanged.
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
    features = p_features
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
