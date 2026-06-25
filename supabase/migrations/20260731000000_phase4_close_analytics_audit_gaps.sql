-- Phase 4 continuation: close two Closed Loop Rule gaps identified after the
-- Module 8/10/11/12/Promotions migration —
-- 1) redeem_promotion() had no audit_logs entry (a wallet/subscription
--    mutation with no audit trail).
-- 2) review_payment_transaction()/finalize_chip_asia_transaction() (the two
--    existing addon/plan purchase closed loops) never called
--    record_commercial_event(), so Module 12's analytics stream never saw
--    real purchase/approval activity.
-- Both functions are re-declared in full (CREATE OR REPLACE) with only the
-- new step added — no other behavior changes.

CREATE OR REPLACE FUNCTION public.redeem_promotion(p_code text, p_tenant_id uuid, p_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
declare
  v_promo public.promotions;
  v_ok boolean;
  v_actor_email text;
  v_actor_role text;
begin
  if not exists (
    select 1 from public.user_role_assignments ura
    where ura.user_id = auth.uid()::text and ura.tenant_id = p_tenant_id and ura.role = 'TENANT_OWNER'
  ) then
    raise exception 'Permission denied: TENANT_OWNER access required';
  end if;

  select * into v_promo from public.promotions where code = upper(p_code) and is_active for update;
  if v_promo.id is null then
    raise exception 'Kod promosi tidak sah atau tidak aktif';
  end if;
  if v_promo.expires_at is not null and v_promo.expires_at < now() then
    raise exception 'Kod promosi telah tamat tempoh';
  end if;
  if v_promo.max_redemptions is not null and v_promo.redemptions_count >= v_promo.max_redemptions then
    raise exception 'Kod promosi telah mencapai had penebusan';
  end if;
  if exists (select 1 from public.promotion_redemptions where promotion_id = v_promo.id and tenant_id = p_tenant_id) then
    raise exception 'Kod promosi ini telah ditebus oleh syarikat anda';
  end if;

  if v_promo.kind = 'wallet_credit' then
    v_ok := public.allocate_wallet_credits(p_tenant_id, p_workspace_id, v_promo.credit_type, v_promo.amount::bigint, 'Promosi: ' || v_promo.code, 'promotion');
  elsif v_promo.kind = 'trial_extension_days' then
    update public.tenant_subscriptions
    set current_period_end = current_period_end + (v_promo.amount::text || ' days')::interval
    where tenant_id = p_tenant_id;
    v_ok := true;
  end if;

  update public.promotions set redemptions_count = redemptions_count + 1 where id = v_promo.id;
  insert into public.promotion_redemptions (promotion_id, tenant_id, workspace_id, redeemed_by, result)
  values (v_promo.id, p_tenant_id, p_workspace_id, auth.uid(), jsonb_build_object('ok', v_ok, 'kind', v_promo.kind, 'amount', v_promo.amount));

  select email, role into v_actor_email, v_actor_role
  from public.user_role_assignments where user_id = auth.uid()::text and tenant_id = p_tenant_id limit 1;

  insert into public.audit_logs (user_id, user_email, user_role, tenant_id, workspace_id, module, action, old_value, new_value)
  values (
    auth.uid()::text, coalesce(v_actor_email, ''), coalesce(v_actor_role, 'TENANT_OWNER'), p_tenant_id, p_workspace_id,
    'Billing Operations', 'UPDATE',
    jsonb_build_object('promotion_code', v_promo.code, 'redeemed', false),
    jsonb_build_object('promotion_code', v_promo.code, 'redeemed', true, 'kind', v_promo.kind, 'amount', v_promo.amount)
  );

  perform public.record_commercial_event('promotion_redeemed', p_tenant_id, p_workspace_id,
    jsonb_build_object('code', v_promo.code, 'kind', v_promo.kind, 'amount', v_promo.amount));

  insert into public.workspace_notifications (workspace_id, tenant_id, category, title, message, metadata)
  values (p_workspace_id, p_tenant_id, 'BILLING', 'Promosi berjaya ditebus',
    'Kod ' || v_promo.code || ' telah berjaya digunakan.',
    jsonb_build_object('code', v_promo.code, 'kind', v_promo.kind));

  return jsonb_build_object('ok', v_ok, 'kind', v_promo.kind, 'amount', v_promo.amount);
end;
$$;
GRANT EXECUTE ON FUNCTION public.redeem_promotion(text, uuid, uuid) TO authenticated;

-- review_payment_transaction: add record_commercial_event after each branch's
-- existing audit_logs insert. Full function re-declared, no other change.
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

    PERFORM public.record_commercial_event(
      CASE WHEN p_approve THEN 'addon_purchase_approved' ELSE 'addon_purchase_rejected' END,
      v_tx.tenant_id, v_tx.workspace_id,
      jsonb_build_object('transaction_id', p_transaction_id, 'addon_label', v_tx.addon_label, 'amount_myr', v_tx.amount_myr)
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

  PERFORM public.record_commercial_event(
    CASE WHEN p_approve THEN 'plan_subscription_approved' ELSE 'plan_subscription_rejected' END,
    v_tx.tenant_id, null,
    jsonb_build_object('transaction_id', p_transaction_id, 'plan', v_plan_name, 'amount_myr', v_tx.amount_myr)
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

-- finalize_chip_asia_transaction: same addition for the CHIP Asia webhook path.
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

    PERFORM public.record_commercial_event(
      CASE WHEN p_success THEN 'addon_purchase_chip_asia_success' ELSE 'addon_purchase_chip_asia_failed' END,
      v_tx.tenant_id, v_tx.workspace_id,
      jsonb_build_object('transaction_id', p_transaction_id, 'addon_label', v_tx.addon_label, 'reference', p_reference)
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

  PERFORM public.record_commercial_event(
    CASE WHEN p_success THEN 'plan_subscription_chip_asia_success' ELSE 'plan_subscription_chip_asia_failed' END,
    v_tx.tenant_id, null,
    jsonb_build_object('transaction_id', p_transaction_id, 'plan', v_plan_name, 'reference', p_reference)
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
