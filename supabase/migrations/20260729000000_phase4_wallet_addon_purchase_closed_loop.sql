-- ============================================================
-- PHASE 4 — REAL ADD-ON / TOP-UP PURCHASE (CLOSED LOOP)
-- Per MYKERANI_GOVERNANCE_EXTENSION.md and
-- MYKERANI_ECOSYSTEM_GOVERNANCE_PRINCIPLE.md.
--
-- Closes a real defect: OwnerDashboard's "Add-On Storage" modal and the
-- AI-credit "Beli Kredit" action only mutated client-side/localStorage
-- state (storageQuota.applyAddon()) with no payment, no wallet ledger
-- entry, no audit, no notification — a cosmetic feature standing in for
-- a real one, which CLAUDE.md's General Rule prohibits.
--
-- This migration extends the EXISTING payment_transactions /
-- resource_wallets / resource_wallet_transactions infrastructure (Phase 1
-- wallet ledger + Phase 1 payment gateway/manual-approval modules) to
-- support a second transaction kind, 'addon', alongside the existing
-- 'plan_subscription' kind — reusing the same dual-rail (manual slip /
-- CHIP Asia) payment and HQ-approval flow already proven for plan
-- purchases, per the Reuse Rule: no new payment system, no new wallet
-- system, no duplicate approval mechanism.
-- ============================================================

-- 1. Extend payment_transactions to support addon purchases alongside
--    plan-subscription purchases.
ALTER TABLE public.payment_transactions
  ALTER COLUMN plan_id DROP NOT NULL;

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS kind character varying(20) NOT NULL DEFAULT 'plan_subscription',
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS addon_credit_type credit_type,
  ADD COLUMN IF NOT EXISTS addon_credit_amount bigint,
  ADD COLUMN IF NOT EXISTS addon_label text;

ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_kind_shape_chk;

ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_kind_shape_chk CHECK (
    (kind = 'plan_subscription' AND plan_id IS NOT NULL)
    OR (
      kind = 'addon'
      AND workspace_id IS NOT NULL
      AND addon_credit_type IS NOT NULL
      AND addon_credit_amount IS NOT NULL
      AND addon_credit_amount > 0
      AND addon_label IS NOT NULL
    )
  );

-- 2. Tenant-initiated addon purchase request — mirrors
--    create_payment_transaction()'s ownership check exactly.
CREATE OR REPLACE FUNCTION public.create_addon_purchase(
  p_tenant_id uuid,
  p_workspace_id uuid,
  p_credit_type credit_type,
  p_credit_amount bigint,
  p_amount_myr numeric,
  p_label text,
  p_method character varying,
  p_slip_path text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
  if not exists (
    select 1 from public.user_role_assignments ura
    where ura.user_id = auth.uid()::text and ura.tenant_id = p_tenant_id and ura.role = 'TENANT_OWNER'
  ) then
    raise exception 'Permission denied: tenant owner access required';
  end if;

  if not exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.tenant_id = p_tenant_id) then
    raise exception 'Invalid workspace: workspace must belong to tenant';
  end if;

  if p_credit_amount is null or p_credit_amount <= 0 then
    raise exception 'create_addon_purchase: p_credit_amount must be positive';
  end if;

  insert into public.payment_transactions (
    tenant_id, plan_id, amount_myr, method, slip_path, submitted_by, status,
    kind, workspace_id, addon_credit_type, addon_credit_amount, addon_label
  )
  values (
    p_tenant_id, null, p_amount_myr, p_method, p_slip_path, auth.uid(), 'pending',
    'addon', p_workspace_id, p_credit_type, p_credit_amount, p_label
  )
  returning id into v_id;

  return v_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.create_addon_purchase(uuid, uuid, credit_type, bigint, numeric, text, character varying, text) TO authenticated;

-- 3. Extend get_payment_transactions_for_tenant to surface addon rows
--    (the existing join on subscription_plans excluded any row with a
--    null plan_id, which would have silently hidden every addon
--    purchase from the tenant's own invoice/payment history).
DROP FUNCTION IF EXISTS public.get_payment_transactions_for_tenant(uuid);

CREATE OR REPLACE FUNCTION public.get_payment_transactions_for_tenant(p_tenant_id uuid)
RETURNS TABLE(
  id uuid, plan_name character varying, amount_myr numeric, method character varying,
  status character varying, slip_path text, chip_asia_reference text,
  created_at timestamp with time zone, reviewed_at timestamp with time zone,
  kind character varying, addon_label text, addon_credit_type credit_type, addon_credit_amount bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if not is_hq_user() and not exists (
    select 1 from public.user_role_assignments ura
    where ura.user_id = auth.uid()::text and ura.tenant_id = p_tenant_id
  ) then
    raise exception 'Permission denied';
  end if;
  return query
  select pt.id, sp.name, pt.amount_myr, pt.method, pt.status, pt.slip_path, pt.chip_asia_reference,
         pt.created_at, pt.reviewed_at, pt.kind, pt.addon_label, pt.addon_credit_type, pt.addon_credit_amount
  from public.payment_transactions pt
  left join public.subscription_plans sp on sp.id = pt.plan_id
  where pt.tenant_id = p_tenant_id
  order by pt.created_at desc;
end;
$function$;

-- 4a. get_pending_payment_approvals — same join-excludes-addon-rows defect
--     as get_payment_transactions_for_tenant; HQ must see addon
--     purchases in its approval queue (Approval Center / HQ Operations
--     visibility requirement) just as it sees plan purchases.
DROP FUNCTION IF EXISTS public.get_pending_payment_approvals();

CREATE OR REPLACE FUNCTION public.get_pending_payment_approvals()
RETURNS TABLE(
  id uuid, tenant_id uuid, tenant_name character varying, plan_id uuid,
  plan_name character varying, amount_myr numeric, method character varying,
  slip_path text, submitted_by_name text, submitted_by_email text, created_at timestamptz,
  kind character varying, addon_label text, addon_credit_type credit_type, addon_credit_amount bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;
  return query
  select pt.id, pt.tenant_id, t.name, pt.plan_id, sp.name, pt.amount_myr, pt.method, pt.slip_path,
         coalesce(pr.full_name, ''), coalesce(pr.email, ''), pt.created_at,
         pt.kind, pt.addon_label, pt.addon_credit_type, pt.addon_credit_amount
  from public.payment_transactions pt
  join public.tenants t on t.id = pt.tenant_id
  left join public.subscription_plans sp on sp.id = pt.plan_id
  left join public.profiles pr on pr.id = pt.submitted_by
  where pt.status = 'pending'
  order by pt.created_at asc;
end;
$function$;

-- 4b. review_payment_transaction — branch on kind. Plan-subscription
--    behavior is byte-for-byte unchanged; addon approval credits the
--    wallet via the existing allocate_wallet_credits() ledger function
--    instead of touching tenant_subscriptions.
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
  v_plan_name text;
  v_actor_email text;
  v_actor_role text;
BEGIN
  IF NOT is_hq_user() THEN
    RAISE EXCEPTION 'Permission denied: HQ access required';
  END IF;

  SELECT * INTO v_tx FROM public.payment_transactions WHERE id = p_transaction_id AND status = 'pending';
  IF v_tx.id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.payment_transactions
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
   WHERE id = p_transaction_id;

  SELECT email, role INTO v_actor_email, v_actor_role
  FROM public.user_role_assignments WHERE user_id = auth.uid()::text AND tenant_id IN (
    SELECT tenant_id FROM public.tenants WHERE category = 'HQ'
  ) LIMIT 1;

  IF v_tx.kind = 'addon' THEN
    IF p_approve THEN
      PERFORM public.allocate_wallet_credits(
        v_tx.tenant_id, v_tx.workspace_id, v_tx.addon_credit_type, v_tx.addon_credit_amount,
        format('Addon purchase approved: %s', v_tx.addon_label), 'addon_purchase_approval'
      );
    END IF;

    INSERT INTO public.audit_logs (user_id, user_email, user_role, tenant_id, module, action, old_value, new_value)
    VALUES (
      auth.uid()::text, coalesce(v_actor_email, 'hq'), coalesce(v_actor_role, 'HQ'), v_tx.tenant_id,
      'Billing Operations', 'UPDATE',
      jsonb_build_object('transaction_id', p_transaction_id, 'status', 'pending', 'kind', 'addon'),
      jsonb_build_object('transaction_id', p_transaction_id, 'status', CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END, 'addon_label', v_tx.addon_label)
    );

    INSERT INTO public.workspace_notifications (workspace_id, tenant_id, category, title, message, metadata)
    VALUES (
      v_tx.workspace_id, v_tx.tenant_id, 'BILLING',
      CASE WHEN p_approve THEN 'Tambahan diluluskan' ELSE 'Tambahan ditolak' END,
      CASE WHEN p_approve
        THEN format('Pembelian tambahan "%s" telah disahkan dan kredit telah ditambah ke wallet anda.', v_tx.addon_label)
        ELSE format('Pembelian tambahan "%s" ditolak oleh HQ. Sila semak semula atau hubungi sokongan.', v_tx.addon_label)
      END,
      jsonb_build_object('transaction_id', p_transaction_id, 'approved', p_approve)
    );

    RETURN true;
  END IF;

  -- kind = 'plan_subscription' — unchanged original behavior.
  v_period_end := now() + interval '30 days';

  SELECT name INTO v_plan_name FROM public.subscription_plans WHERE id = v_tx.plan_id;

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

  INSERT INTO public.audit_logs (user_id, user_email, user_role, tenant_id, module, action, old_value, new_value)
  VALUES (
    auth.uid()::text, coalesce(v_actor_email, 'hq'), coalesce(v_actor_role, 'HQ'), v_tx.tenant_id,
    'Billing Operations', 'UPDATE',
    jsonb_build_object('transaction_id', p_transaction_id, 'status', 'pending'),
    jsonb_build_object('transaction_id', p_transaction_id, 'status', CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END, 'plan', v_plan_name)
  );

  FOR v_ws IN SELECT id FROM public.workspaces WHERE tenant_id = v_tx.tenant_id LOOP
    INSERT INTO public.workspace_notifications (workspace_id, tenant_id, category, title, message, metadata)
    VALUES (
      v_ws.id, v_tx.tenant_id, 'BILLING',
      CASE WHEN p_approve THEN 'Pembayaran diluluskan' ELSE 'Pembayaran ditolak' END,
      CASE WHEN p_approve
        THEN format('Slip pembayaran anda untuk pelan "%s" telah disahkan. Akaun anda kini aktif.', coalesce(v_plan_name, 'pelan baharu'))
        ELSE format('Slip pembayaran anda untuk pelan "%s" ditolak oleh HQ. Sila semak semula atau hubungi sokongan.', coalesce(v_plan_name, ''))
      END,
      jsonb_build_object('transaction_id', p_transaction_id, 'approved', p_approve)
    );
  END LOOP;

  RETURN true;
END;
$function$;

-- 5. finalize_chip_asia_transaction — same branch-on-kind treatment for
--    the CHIP Asia webhook-driven path.
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
  v_plan_name text;
BEGIN
  SELECT * INTO v_tx FROM public.payment_transactions WHERE id = p_transaction_id AND method = 'chip_asia';
  IF v_tx.id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.payment_transactions
     SET status = CASE WHEN p_success THEN 'success' ELSE 'failed' END,
         chip_asia_reference = COALESCE(p_reference, chip_asia_reference), updated_at = now()
   WHERE id = p_transaction_id;

  IF v_tx.kind = 'addon' THEN
    IF p_success THEN
      PERFORM public.allocate_wallet_credits(
        v_tx.tenant_id, v_tx.workspace_id, v_tx.addon_credit_type, v_tx.addon_credit_amount,
        format('Addon purchase via CHIP Asia: %s', v_tx.addon_label), 'addon_chip_asia_payment'
      );
    END IF;

    INSERT INTO public.audit_logs (user_id, user_email, user_role, tenant_id, module, action, old_value, new_value)
    VALUES (
      'chip_asia_webhook', 'chip_asia_webhook', 'SYSTEM', v_tx.tenant_id,
      'Billing Operations', 'UPDATE',
      jsonb_build_object('transaction_id', p_transaction_id, 'status', 'pending', 'kind', 'addon'),
      jsonb_build_object('transaction_id', p_transaction_id, 'status', CASE WHEN p_success THEN 'success' ELSE 'failed' END, 'reference', p_reference, 'addon_label', v_tx.addon_label)
    );

    INSERT INTO public.workspace_notifications (workspace_id, tenant_id, category, title, message, metadata)
    VALUES (
      v_tx.workspace_id, v_tx.tenant_id, 'BILLING',
      CASE WHEN p_success THEN 'Tambahan berjaya' ELSE 'Tambahan gagal' END,
      CASE WHEN p_success
        THEN format('Pembayaran CHIP untuk tambahan "%s" berjaya. Kredit telah ditambah ke wallet anda.', v_tx.addon_label)
        ELSE format('Pembayaran CHIP untuk tambahan "%s" gagal diproses. Sila cuba lagi atau hubungi sokongan.', v_tx.addon_label)
      END,
      jsonb_build_object('transaction_id', p_transaction_id, 'success', p_success, 'reference', p_reference)
    );

    RETURN true;
  END IF;

  -- kind = 'plan_subscription' — unchanged original behavior.
  v_period_end := now() + interval '30 days';

  SELECT name INTO v_plan_name FROM public.subscription_plans WHERE id = v_tx.plan_id;

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

  INSERT INTO public.audit_logs (user_id, user_email, user_role, tenant_id, module, action, old_value, new_value)
  VALUES (
    'chip_asia_webhook', 'chip_asia_webhook', 'SYSTEM', v_tx.tenant_id,
    'Billing Operations', 'UPDATE',
    jsonb_build_object('transaction_id', p_transaction_id, 'status', 'pending'),
    jsonb_build_object('transaction_id', p_transaction_id, 'status', CASE WHEN p_success THEN 'success' ELSE 'failed' END, 'reference', p_reference, 'plan', v_plan_name)
  );

  FOR v_ws IN SELECT id FROM public.workspaces WHERE tenant_id = v_tx.tenant_id LOOP
    INSERT INTO public.workspace_notifications (workspace_id, tenant_id, category, title, message, metadata)
    VALUES (
      v_ws.id, v_tx.tenant_id, 'BILLING',
      CASE WHEN p_success THEN 'Pembayaran berjaya' ELSE 'Pembayaran gagal' END,
      CASE WHEN p_success
        THEN format('Pembayaran CHIP untuk pelan "%s" berjaya. Akaun anda kini aktif.', coalesce(v_plan_name, 'pelan baharu'))
        ELSE 'Pembayaran CHIP gagal diproses. Akaun anda telah digantung sehingga pembayaran berjaya. Sila cuba lagi atau hubungi sokongan.'
      END,
      jsonb_build_object('transaction_id', p_transaction_id, 'success', p_success, 'reference', p_reference)
    );
  END LOOP;

  RETURN true;
END;
$function$;
