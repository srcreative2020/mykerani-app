-- HQ Phase 2 — close the real Payment Journey (manual slip approval +
-- CHIP Asia webhook finalization) and the Storage Freeze enforcement
-- gap, both found while auditing remaining modules for ecosystem
-- closure.
--
-- Root cause: review_payment_transaction() and
-- finalize_chip_asia_transaction() (20260618090000_wallet_governance_layer.sql)
-- already correctly sync the wallet on approval/success via
-- sync_wallet_entitlement — that leg was closed. But neither writes
-- audit_logs, and neither notifies the tenant. Worse: on a failed
-- payment, finalize_chip_asia_transaction() silently suspends the
-- tenant's subscription with zero notification — the exact same
-- silent-suspension failure mode already fixed for HQ-initiated
-- suspension in 20260724020000, but reachable here through an
-- unrelated path (a failed webhook) that was never touched.
--
-- set_tenant_frozen() (20260702040000) has the same shape: it flips
-- workspace_storage_state.is_frozen (which blocks uploads — checked
-- elsewhere in the storage path) with no audit_logs row and no
-- notification, so a tenant whose uploads start failing has no way to
-- learn why.

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

  v_period_end := now() + interval '30 days';

  UPDATE public.payment_transactions
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
   WHERE id = p_transaction_id;

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

  SELECT email, role INTO v_actor_email, v_actor_role
  FROM public.user_role_assignments WHERE user_id = auth.uid()::text AND tenant_id IN (
    SELECT tenant_id FROM public.tenants WHERE category = 'HQ'
  ) LIMIT 1;

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

  v_period_end := now() + interval '30 days';

  UPDATE public.payment_transactions
     SET status = CASE WHEN p_success THEN 'success' ELSE 'failed' END,
         chip_asia_reference = COALESCE(p_reference, chip_asia_reference), updated_at = now()
   WHERE id = p_transaction_id;

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

CREATE OR REPLACE FUNCTION public.set_tenant_frozen(p_tenant_id uuid, p_is_frozen boolean, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_actor_email text;
  v_actor_role text;
  v_ws record;
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;

  insert into public.workspace_storage_state (tenant_id, is_frozen, frozen_reason, updated_at)
  values (p_tenant_id, p_is_frozen, coalesce(p_reason, ''), now())
  on conflict (tenant_id) do update set
    is_frozen = p_is_frozen,
    frozen_reason = coalesce(p_reason, ''),
    updated_at = now();

  select email, role into v_actor_email, v_actor_role
  from public.user_role_assignments where user_id = auth.uid()::text and tenant_id in (
    select tenant_id from public.tenants where category = 'HQ'
  ) limit 1;

  insert into public.audit_logs (user_id, user_email, user_role, tenant_id, module, action, old_value, new_value)
  values (
    auth.uid()::text, coalesce(v_actor_email, 'hq'), coalesce(v_actor_role, 'HQ'), p_tenant_id,
    'Storage Governance', 'UPDATE',
    jsonb_build_object('is_frozen', not p_is_frozen),
    jsonb_build_object('is_frozen', p_is_frozen, 'reason', p_reason)
  );

  for v_ws in select id from public.workspaces where tenant_id = p_tenant_id loop
    insert into public.workspace_notifications (workspace_id, tenant_id, category, title, message, metadata)
    values (
      v_ws.id, p_tenant_id, 'STORAGE',
      case when p_is_frozen then 'Storan dibeku' else 'Storan diaktifkan semula' end,
      case
        when p_is_frozen then format('Storan syarikat anda telah dibekukan oleh MYKERANI HQ. Muat naik dokumen baharu dihalang sehingga isu diselesaikan. Sebab: %s', coalesce(p_reason, 'tidak dinyatakan'))
        else 'Storan syarikat anda telah diaktifkan semula. Muat naik dokumen boleh diteruskan.'
      end,
      jsonb_build_object('tenant_id', p_tenant_id, 'is_frozen', p_is_frozen)
    );
  end loop;
end;
$function$;
