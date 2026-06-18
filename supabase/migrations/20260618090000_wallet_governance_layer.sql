-- ============================================================================
-- MYKERANI Resource Governance Layer — Foundation Completion Sprint
-- Created At: 2026-06-18
-- Builds directly on top of Phase 1 (20260618070000_wallet_ledger_phase1.sql):
-- ensure_resource_wallet / consume_resource_credit / allocate_wallet_credits
-- are reused unchanged. This migration adds the remaining RPC surface needed
-- for subscription sync, upgrade/downgrade, renewal, topup, HQ manual
-- adjustment, reconciliation, and storage single-source-of-truth alignment.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. adjust_wallet_balance — the general positive-OR-negative mutation RPC.
--    allocate_wallet_credits stays positive-only/ALLOCATION-typed (topups,
--    renewals, new subscriptions). This one records activity_type ADJUSTMENT
--    and is used for downgrade clawback and HQ manual corrections. Clamps so
--    a balance can never go negative and a storage limit can never drop
--    below bytes already in use — the clamped (not requested) delta is what
--    gets written to the ledger, so balance == SUM(transactions) always holds.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.adjust_wallet_balance(
  p_tenant_id uuid,
  p_workspace_id uuid,
  p_credit_type credit_type,
  p_delta bigint,
  p_reason text,
  p_source text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wallet_id uuid;
  v_is_internal boolean;
  v_current bigint;
  v_floor bigint;
  v_new bigint;
  v_actual_delta bigint;
BEGIN
  IF p_delta = 0 THEN
    RETURN true;
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'adjust_wallet_balance: p_reason is mandatory for audit accountability';
  END IF;

  SELECT is_internal INTO v_is_internal FROM public.tenants WHERE id = p_tenant_id;
  IF v_is_internal IS TRUE THEN
    RAISE EXCEPTION 'adjust_wallet_balance: tenant % is internal and must never hold a wallet', p_tenant_id;
  END IF;

  PERFORM public.ensure_resource_wallet(p_tenant_id, p_workspace_id);

  SELECT id INTO v_wallet_id FROM public.resource_wallets WHERE workspace_id = p_workspace_id FOR UPDATE;
  IF v_wallet_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_credit_type = 'AI' THEN
    SELECT ai_credits_balance INTO v_current FROM public.resource_wallets WHERE id = v_wallet_id;
    v_floor := 0;
    v_new := greatest(v_floor, v_current + p_delta);
    UPDATE public.resource_wallets SET ai_credits_balance = v_new, updated_at = now() WHERE id = v_wallet_id;
  ELSIF p_credit_type = 'OCR' THEN
    SELECT ocr_credits_balance INTO v_current FROM public.resource_wallets WHERE id = v_wallet_id;
    v_floor := 0;
    v_new := greatest(v_floor, v_current + p_delta);
    UPDATE public.resource_wallets SET ocr_credits_balance = v_new, updated_at = now() WHERE id = v_wallet_id;
  ELSIF p_credit_type = 'NOTIFICATION' THEN
    SELECT notification_credits_balance INTO v_current FROM public.resource_wallets WHERE id = v_wallet_id;
    v_floor := 0;
    v_new := greatest(v_floor, v_current + p_delta);
    UPDATE public.resource_wallets SET notification_credits_balance = v_new, updated_at = now() WHERE id = v_wallet_id;
  ELSIF p_credit_type = 'STORAGE' THEN
    SELECT storage_limit_bytes, storage_used_bytes INTO v_current, v_floor FROM public.resource_wallets WHERE id = v_wallet_id;
    v_new := greatest(v_floor, v_current + p_delta);
    UPDATE public.resource_wallets SET storage_limit_bytes = v_new, updated_at = now() WHERE id = v_wallet_id;
  ELSE
    RETURN false;
  END IF;

  v_actual_delta := v_new - v_current;
  IF v_actual_delta <> 0 THEN
    INSERT INTO public.resource_wallet_transactions (wallet_id, credit_type, activity_type, amount, description, metadata)
    VALUES (
      v_wallet_id, p_credit_type, 'ADJUSTMENT', v_actual_delta, p_reason,
      jsonb_build_object('source', p_source, 'reason', p_reason, 'requested_delta', p_delta)
    );
  END IF;

  RETURN true;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 2. apply_entitlement_delta + sync_wallet_entitlement
--    Shared logic for "make this workspace's wallet match this plan", used by
--    new subscriptions, upgrades, downgrades, and renewals alike so all four
--    paths share one auditable code path instead of four divergent ones.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_entitlement_delta(
  p_tenant_id uuid,
  p_workspace_id uuid,
  p_credit_type credit_type,
  p_delta bigint,
  p_event text,
  p_source text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_delta = 0 THEN
    RETURN;
  ELSIF p_delta > 0 THEN
    PERFORM public.allocate_wallet_credits(p_tenant_id, p_workspace_id, p_credit_type, p_delta, format('Entitlement sync (%s)', p_event), p_source);
  ELSE
    PERFORM public.adjust_wallet_balance(p_tenant_id, p_workspace_id, p_credit_type, p_delta, format('Entitlement sync (%s)', p_event), p_source);
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_wallet_entitlement(
  p_tenant_id uuid,
  p_workspace_id uuid,
  p_old_plan_id uuid,
  p_new_plan_id uuid,
  p_event text, -- 'new' | 'upgrade' | 'downgrade' | 'renewal'
  p_source text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old public.subscription_plans;
  v_new public.subscription_plans;
  v_old_ai bigint := 0; v_old_ocr bigint := 0; v_old_notif bigint := 0; v_old_storage bigint := 0;
  v_cur_ai bigint; v_cur_ocr bigint; v_cur_notif bigint; v_cur_storage bigint;
  v_delta_ai bigint; v_delta_ocr bigint; v_delta_notif bigint; v_delta_storage bigint;
BEGIN
  SELECT * INTO v_new FROM public.subscription_plans WHERE id = p_new_plan_id;
  IF v_new.id IS NULL THEN
    RAISE EXCEPTION 'sync_wallet_entitlement: unknown plan %', p_new_plan_id;
  END IF;

  IF p_old_plan_id IS NOT NULL THEN
    SELECT * INTO v_old FROM public.subscription_plans WHERE id = p_old_plan_id;
    IF v_old.id IS NOT NULL THEN
      v_old_ai := v_old.ai_credits_allowance;
      v_old_ocr := v_old.ocr_credits_allowance;
      v_old_notif := v_old.notification_credits_allowance;
      v_old_storage := v_old.storage_credits_allowance_mb * 1024 * 1024;
    END IF;
  END IF;

  PERFORM public.ensure_resource_wallet(p_tenant_id, p_workspace_id);

  IF p_event = 'renewal' THEN
    -- Renewal tops the wallet back up to the full plan allowance. It never
    -- claws back unused balance — only upgrades/downgrades adjust by delta.
    SELECT ai_credits_balance, ocr_credits_balance, notification_credits_balance, storage_limit_bytes
      INTO v_cur_ai, v_cur_ocr, v_cur_notif, v_cur_storage
      FROM public.resource_wallets WHERE workspace_id = p_workspace_id;

    v_delta_ai := greatest(0, v_new.ai_credits_allowance - coalesce(v_cur_ai, 0));
    v_delta_ocr := greatest(0, v_new.ocr_credits_allowance - coalesce(v_cur_ocr, 0));
    v_delta_notif := greatest(0, v_new.notification_credits_allowance - coalesce(v_cur_notif, 0));
    v_delta_storage := greatest(0, (v_new.storage_credits_allowance_mb * 1024 * 1024) - coalesce(v_cur_storage, 0));
  ELSE
    v_delta_ai := v_new.ai_credits_allowance - v_old_ai;
    v_delta_ocr := v_new.ocr_credits_allowance - v_old_ocr;
    v_delta_notif := v_new.notification_credits_allowance - v_old_notif;
    v_delta_storage := (v_new.storage_credits_allowance_mb * 1024 * 1024) - v_old_storage;
  END IF;

  PERFORM public.apply_entitlement_delta(p_tenant_id, p_workspace_id, 'AI', v_delta_ai, p_event, p_source);
  PERFORM public.apply_entitlement_delta(p_tenant_id, p_workspace_id, 'OCR', v_delta_ocr, p_event, p_source);
  PERFORM public.apply_entitlement_delta(p_tenant_id, p_workspace_id, 'NOTIFICATION', v_delta_notif, p_event, p_source);
  PERFORM public.apply_entitlement_delta(p_tenant_id, p_workspace_id, 'STORAGE', v_delta_storage, p_event, p_source);
END;
$function$;

-- ----------------------------------------------------------------------------
-- 3. change_subscription_plan — Upgrade Handling + Downgrade Handling.
--    HQ-only (mirrors set_tenant_frozen/set_user_suspended's is_hq_user()
--    gate). Replaces the previous direct, unsynced tenant_subscriptions
--    writes in hqService.upsertCustomerSubscription.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.change_subscription_plan(
  p_tenant_id uuid,
  p_new_plan_id uuid,
  p_status text,
  p_reason text DEFAULT 'HQ plan change'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old_plan_id uuid;
  v_old_allowance bigint;
  v_new_allowance bigint;
  v_event text;
  v_ws record;
  v_exists boolean;
BEGIN
  IF NOT is_hq_user() THEN
    RAISE EXCEPTION 'Permission denied: HQ access required';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND is_internal = true) INTO v_exists;
  IF v_exists THEN
    RAISE EXCEPTION 'change_subscription_plan: tenant % is internal and must never hold a subscription/wallet', p_tenant_id;
  END IF;

  SELECT plan_id INTO v_old_plan_id FROM public.tenant_subscriptions WHERE tenant_id = p_tenant_id FOR UPDATE;

  IF v_old_plan_id IS NULL THEN
    INSERT INTO public.tenant_subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)
    VALUES (p_tenant_id, p_new_plan_id, p_status, now(), now() + interval '30 days');
    v_event := 'new';
  ELSE
    UPDATE public.tenant_subscriptions SET plan_id = p_new_plan_id, status = p_status, updated_at = now() WHERE tenant_id = p_tenant_id;
    SELECT ai_credits_allowance INTO v_old_allowance FROM public.subscription_plans WHERE id = v_old_plan_id;
    SELECT ai_credits_allowance INTO v_new_allowance FROM public.subscription_plans WHERE id = p_new_plan_id;
    v_event := CASE WHEN v_new_allowance >= coalesce(v_old_allowance, 0) THEN 'upgrade' ELSE 'downgrade' END;
  END IF;

  FOR v_ws IN SELECT id FROM public.workspaces WHERE tenant_id = p_tenant_id LOOP
    PERFORM public.sync_wallet_entitlement(p_tenant_id, v_ws.id, v_old_plan_id, p_new_plan_id, v_event, 'hq_plan_change');
  END LOOP;

  RETURN true;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 4. Renewal Framework
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_subscription_renewal(
  p_tenant_id uuid,
  p_source text DEFAULT 'renewal_framework'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sub record;
  v_ws record;
  v_new_start timestamptz;
  v_new_end timestamptz;
BEGIN
  SELECT * INTO v_sub FROM public.tenant_subscriptions WHERE tenant_id = p_tenant_id AND status = 'active' FOR UPDATE;
  IF v_sub.id IS NULL THEN
    RETURN false;
  END IF;

  v_new_start := v_sub.current_period_end;
  v_new_end := v_new_start + interval '30 days';

  UPDATE public.tenant_subscriptions
     SET current_period_start = v_new_start, current_period_end = v_new_end, updated_at = now()
   WHERE id = v_sub.id;

  FOR v_ws IN SELECT id FROM public.workspaces WHERE tenant_id = p_tenant_id LOOP
    PERFORM public.sync_wallet_entitlement(p_tenant_id, v_ws.id, v_sub.plan_id, v_sub.plan_id, 'renewal', p_source);
  END LOOP;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_due_subscription_renewals()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rec record;
  v_count int := 0;
BEGIN
  FOR v_rec IN
    SELECT tenant_id FROM public.tenant_subscriptions WHERE status = 'active' AND current_period_end <= now()
  LOOP
    PERFORM public.process_subscription_renewal(v_rec.tenant_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 5. Topup Framework — tenant-initiated credit purchase. Callable by the
--    tenant's own TENANT_OWNER (self-service) or HQ (on the customer's
--    behalf), mirroring create_payment_transaction's ownership check.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.topup_wallet_credits(
  p_tenant_id uuid,
  p_workspace_id uuid,
  p_credit_type credit_type,
  p_amount bigint,
  p_reason text DEFAULT 'Credit topup purchase'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    is_hq_user()
    OR EXISTS (
      SELECT 1 FROM public.user_role_assignments ura
      WHERE ura.user_id = auth.uid()::text AND ura.tenant_id = p_tenant_id AND ura.role = 'TENANT_OWNER'
    )
  ) THEN
    RAISE EXCEPTION 'Permission denied: tenant owner or HQ access required';
  END IF;

  RETURN public.allocate_wallet_credits(p_tenant_id, p_workspace_id, p_credit_type, p_amount, p_reason, 'topup_purchase');
END;
$function$;

-- ----------------------------------------------------------------------------
-- 6. HQ Manual Adjustment Framework
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hq_manual_wallet_adjustment(
  p_tenant_id uuid,
  p_workspace_id uuid,
  p_credit_type credit_type,
  p_delta bigint,
  p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_hq_user() THEN
    RAISE EXCEPTION 'Permission denied: HQ access required';
  END IF;
  RETURN public.adjust_wallet_balance(p_tenant_id, p_workspace_id, p_credit_type, p_delta, p_reason, 'hq_manual_adjustment');
END;
$function$;

-- ----------------------------------------------------------------------------
-- 7. Wallet Reconciliation Controls
--    recorded_value vs ledger_sum must always match. HQ-only read.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_wallet_balances()
RETURNS TABLE(
  wallet_id uuid,
  tenant_id uuid,
  credit_type credit_type,
  recorded_value bigint,
  ledger_sum bigint,
  discrepancy bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT w.id, w.tenant_id, t.ct, t.recorded,
         coalesce((SELECT sum(amount) FROM public.resource_wallet_transactions rwt WHERE rwt.wallet_id = w.id AND rwt.credit_type = t.ct), 0),
         t.recorded - coalesce((SELECT sum(amount) FROM public.resource_wallet_transactions rwt WHERE rwt.wallet_id = w.id AND rwt.credit_type = t.ct), 0)
  FROM public.resource_wallets w
  CROSS JOIN LATERAL (
    VALUES
      ('AI'::credit_type, w.ai_credits_balance),
      ('OCR'::credit_type, w.ocr_credits_balance),
      ('NOTIFICATION'::credit_type, w.notification_credits_balance),
      ('STORAGE'::credit_type, w.storage_limit_bytes)
  ) AS t(ct, recorded)
  WHERE is_hq_user();
$function$;

-- ----------------------------------------------------------------------------
-- 8. Wire wallet sync into the two existing payment-approval paths that
--    previously wrote tenant_subscriptions directly without touching the
--    wallet at all (review_payment_transaction — manual slip approval —
--    and finalize_chip_asia_transaction's ad-hoc UPSERT). Both now go
--    through sync_wallet_entitlement so every credit type (AI/OCR/STORAGE/
--    NOTIFICATION) gets a proper, auditable ledger row instead of a silent
--    balance overwrite.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_payment_transaction(p_transaction_id uuid, p_approve boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tx public.payment_transactions;
  v_period_end timestamptz;
  v_old_plan_id uuid;
  v_ws record;
BEGIN
  IF NOT is_hq_user() THEN
    RAISE EXCEPTION 'Permission denied: HQ access required';
  END IF;

  SELECT * INTO v_tx FROM public.payment_transactions WHERE id = p_transaction_id AND status = 'pending';
  IF v_tx.id IS NULL THEN
    RETURN false;
  END IF;

  v_period_end := now() + interval '30 days';

  UPDATE public.payment_transactions
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
   WHERE id = p_transaction_id;

  IF p_approve THEN
    SELECT plan_id INTO v_old_plan_id FROM public.tenant_subscriptions WHERE tenant_id = v_tx.tenant_id;

    INSERT INTO public.tenant_subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)
    VALUES (v_tx.tenant_id, v_tx.plan_id, 'active', now(), v_period_end)
    ON CONFLICT (tenant_id) DO UPDATE SET
      plan_id = v_tx.plan_id, status = 'active',
      current_period_start = now(), current_period_end = v_period_end, updated_at = now();

    FOR v_ws IN SELECT id FROM public.workspaces WHERE tenant_id = v_tx.tenant_id LOOP
      PERFORM public.sync_wallet_entitlement(
        v_tx.tenant_id, v_ws.id, v_old_plan_id, v_tx.plan_id,
        CASE WHEN v_old_plan_id IS NULL THEN 'new' ELSE 'renewal' END,
        'manual_payment_approval'
      );
    END LOOP;
  END IF;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_chip_asia_transaction(p_transaction_id uuid, p_success boolean, p_reference text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tx public.payment_transactions;
  v_period_end timestamptz;
  v_old_plan_id uuid;
  v_ws record;
BEGIN
  SELECT * INTO v_tx FROM public.payment_transactions WHERE id = p_transaction_id AND method = 'chip_asia';
  IF v_tx.id IS NULL THEN
    RETURN false;
  END IF;

  v_period_end := now() + interval '30 days';

  UPDATE public.payment_transactions
     SET status = CASE WHEN p_success THEN 'success' ELSE 'failed' END,
         chip_asia_reference = COALESCE(p_reference, chip_asia_reference), updated_at = now()
   WHERE id = p_transaction_id;

  IF p_success THEN
    SELECT plan_id INTO v_old_plan_id FROM public.tenant_subscriptions WHERE tenant_id = v_tx.tenant_id;

    INSERT INTO public.tenant_subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)
    VALUES (v_tx.tenant_id, v_tx.plan_id, 'active', now(), v_period_end)
    ON CONFLICT (tenant_id) DO UPDATE SET
      plan_id = v_tx.plan_id, status = 'active',
      current_period_start = now(), current_period_end = v_period_end, updated_at = now();

    FOR v_ws IN SELECT id FROM public.workspaces WHERE tenant_id = v_tx.tenant_id LOOP
      PERFORM public.sync_wallet_entitlement(
        v_tx.tenant_id, v_ws.id, v_old_plan_id, v_tx.plan_id,
        CASE WHEN v_old_plan_id IS NULL THEN 'new' ELSE 'renewal' END,
        'chip_asia_payment'
      );
    END LOOP;
  ELSE
    UPDATE public.tenant_subscriptions SET status = 'suspended', updated_at = now() WHERE tenant_id = v_tx.tenant_id;
  END IF;

  RETURN true;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 9. Storage single-source-of-truth: every time real usage is computed, sync
--    it into resource_wallets.storage_used_bytes so Billing/HQ/enforcement
--    all read the same number. No-op if the workspace has no wallet row yet
--    (e.g. internal HQ tenant), so this never creates a wallet as a side
--    effect of a read.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_workspace_storage_usage(p_workspace_id uuid)
RETURNS TABLE(workspace_id uuid, total_bytes bigint, file_count bigint)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total bigint;
  v_count bigint;
BEGIN
  SELECT COALESCE(SUM(file_size_bytes), 0)::bigint, COUNT(*)::bigint
    INTO v_total, v_count
    FROM public.evidence_documents
   WHERE workspace_id = p_workspace_id;

  UPDATE public.resource_wallets SET storage_used_bytes = v_total, updated_at = now() WHERE workspace_id = p_workspace_id;

  RETURN QUERY SELECT p_workspace_id, v_total, v_count;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 10. Backfill: give the operational tenant's existing tenant_subscriptions
--     row notification credits too (the Phase 1 backfill only allocated
--     AI/OCR/STORAGE — notification_credits_balance was left at 0 even
--     though GROWTH allows 500/month). Idempotency-guarded.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_wallet_id uuid;
  v_already boolean;
BEGIN
  SELECT id INTO v_wallet_id FROM public.resource_wallets WHERE workspace_id = '492deb49-357d-4818-bfea-da82a592e9df'::uuid;

  SELECT EXISTS (
    SELECT 1 FROM public.resource_wallet_transactions
     WHERE wallet_id = v_wallet_id AND credit_type = 'NOTIFICATION' AND metadata->>'source' = 'migration_backfill_notification'
  ) INTO v_already;

  IF NOT v_already THEN
    PERFORM public.allocate_wallet_credits(
      'dd586904-0c10-4d76-96ad-8f7895df5abe'::uuid,
      '492deb49-357d-4818-bfea-da82a592e9df'::uuid,
      'NOTIFICATION'::credit_type,
      500,
      'GROWTH plan notification allowance was never allocated in the Phase 1 backfill',
      'migration_backfill_notification'
    );
  END IF;
END $$;
