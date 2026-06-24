-- HQ Phase 2 — Billing Operations: close the Plan Change Journey.
--
-- change_subscription_plan() (20260618090000_wallet_governance_layer.sql)
-- already correctly resizes AI/OCR/storage/notification wallet
-- entitlements via sync_wallet_entitlement/apply_entitlement_delta — that
-- resource-impact leg of the journey was already closed. What was
-- missing, found while tracing the full Payment/Plan Change Journey end
-- to end: no audit_logs record of the plan change, and no tenant
-- notification — the tenant's wallet balance changes underneath them
-- with zero visibility into why. This closes both, inside the same
-- transaction as the plan/status update and wallet resize.
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
  v_old_plan_name text;
  v_new_plan_name text;
  v_old_allowance bigint;
  v_new_allowance bigint;
  v_event text;
  v_ws record;
  v_exists boolean;
  v_actor_email text;
  v_actor_role text;
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

  SELECT name INTO v_old_plan_name FROM public.subscription_plans WHERE id = v_old_plan_id;
  SELECT name INTO v_new_plan_name FROM public.subscription_plans WHERE id = p_new_plan_id;

  SELECT email, role INTO v_actor_email, v_actor_role
  FROM public.user_role_assignments WHERE user_id = auth.uid()::text AND tenant_id IN (
    SELECT tenant_id FROM public.tenants WHERE category = 'HQ'
  ) LIMIT 1;

  INSERT INTO public.audit_logs (user_id, user_email, user_role, tenant_id, module, action, old_value, new_value)
  VALUES (
    auth.uid()::text, coalesce(v_actor_email, 'hq'), coalesce(v_actor_role, 'HQ'), p_tenant_id,
    'Billing Operations', CASE WHEN v_event = 'new' THEN 'CREATE' ELSE 'UPDATE' END,
    jsonb_build_object('plan', v_old_plan_name, 'status', NULL),
    jsonb_build_object('plan', v_new_plan_name, 'status', p_status, 'event', v_event, 'reason', p_reason)
  );

  FOR v_ws IN SELECT id FROM public.workspaces WHERE tenant_id = p_tenant_id LOOP
    INSERT INTO public.workspace_notifications (workspace_id, tenant_id, category, title, message, metadata)
    VALUES (
      v_ws.id, p_tenant_id, 'BILLING',
      CASE WHEN v_event = 'upgrade' THEN 'Pelan dinaik taraf' WHEN v_event = 'downgrade' THEN 'Pelan diturunkan' ELSE 'Pelan langganan ditetapkan' END,
      format('Pelan langganan syarikat anda telah ditukar ke "%s". Kuota AI, OCR dan storan telah dikemas kini secara automatik.', coalesce(v_new_plan_name, 'pelan baharu')),
      jsonb_build_object('tenant_id', p_tenant_id, 'event', v_event, 'new_plan', v_new_plan_name)
    );
  END LOOP;

  RETURN true;
END;
$function$;

-- Register with the Approval Center dispatcher (Module 6) so HQ can also
-- route plan changes through dual approval when desired (e.g. high-value
-- downgrades/refund-adjacent changes); direct RPC calls from hqService
-- remain available for routine, low-risk plan changes — gating every
-- plan change behind dual approval would be disproportionate friction for
-- routine upgrades, unlike suspension which is binary and high-blast-radius.
CREATE OR REPLACE FUNCTION public.execute_pending_hq_action(p_action_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_action_type text;
  v_target_id uuid;
  v_payload jsonb;
begin
  select action_type, target_id, payload into v_action_type, v_target_id, v_payload
  from public.pending_hq_actions where id = p_action_id;

  if v_action_type = 'staff_suspend' then
    update public.profiles set is_suspended = true where id = v_target_id;
  elsif v_action_type = 'staff_reactivate' then
    update public.profiles set is_suspended = false where id = v_target_id;
  elsif v_action_type = 'tenant_suspend' then
    perform public.set_tenant_suspended(v_target_id, true);
  elsif v_action_type = 'tenant_reactivate' then
    perform public.set_tenant_suspended(v_target_id, false);
  elsif v_action_type = 'plan_change' then
    perform public.change_subscription_plan(
      v_target_id,
      (v_payload->>'new_plan_id')::uuid,
      v_payload->>'status',
      coalesce(v_payload->>'reason', 'HQ plan change (approved)')
    );
  else
    raise exception 'No registered execution for action_type %', v_action_type;
  end if;
end;
$function$;
