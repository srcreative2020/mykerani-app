-- HQ Phase 2 — Customer Operations: real tenant suspension closed loop.
--
-- Root cause found while wiring the Suspension Journey end-to-end:
-- hqService.setCustomerStatus() only updated tenant_subscriptions.status
-- (a label) directly from the client, with no approval gate, no audit
-- record, no tenant notification, and — critically — no actual access
-- enforcement. Access enforcement (AI/OCR/upload blocking) is driven by
-- profiles.is_suspended (see server.ts is-suspended check), which a
-- "Suspend Tenant" action never touched. A tenant could be shown as
-- "suspended" on the HQ dashboard while every user under it kept full
-- product access. This migration closes that gap for real, not just
-- the status label.

CREATE OR REPLACE FUNCTION public.set_tenant_suspended(p_tenant_id uuid, p_suspended boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_old_status text;
  v_new_status text := case when p_suspended then 'suspended' else 'active' end;
  v_actor_email text;
  v_actor_role text;
  v_workspace record;
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;

  select status into v_old_status from public.tenant_subscriptions where tenant_id = p_tenant_id;

  update public.tenant_subscriptions set status = v_new_status, updated_at = now() where tenant_id = p_tenant_id;

  -- Real access enforcement: flip is_suspended for every user under this
  -- tenant, not just the subscription status label.
  update public.profiles
  set is_suspended = p_suspended
  where id::text in (select user_id from public.user_role_assignments where tenant_id = p_tenant_id);

  select email, role into v_actor_email, v_actor_role
  from public.user_role_assignments where user_id = auth.uid()::text and tenant_id in (
    select tenant_id from public.tenants where category = 'HQ'
  ) limit 1;

  insert into public.audit_logs (user_id, user_email, user_role, tenant_id, module, action, old_value, new_value)
  values (
    auth.uid()::text, coalesce(v_actor_email, 'hq'), coalesce(v_actor_role, 'HQ'), p_tenant_id,
    'Customer Operations', 'UPDATE',
    jsonb_build_object('status', v_old_status),
    jsonb_build_object('status', v_new_status)
  );

  for v_workspace in select id from public.workspaces where tenant_id = p_tenant_id loop
    insert into public.workspace_notifications (workspace_id, tenant_id, category, title, message, metadata)
    values (
      v_workspace.id, p_tenant_id, 'SECURITY',
      case when p_suspended then 'Akaun digantung' else 'Akaun diaktifkan semula' end,
      case
        when p_suspended then 'Akaun syarikat anda telah digantung oleh MYKERANI HQ. Akses AI, OCR dan muat naik dihadkan sehingga isu diselesaikan. Sila hubungi sokongan.'
        else 'Akaun syarikat anda telah diaktifkan semula. Semua ciri kini boleh digunakan seperti biasa.'
      end,
      jsonb_build_object('tenant_id', p_tenant_id, 'suspended', p_suspended)
    );
  end loop;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.set_tenant_suspended(uuid, boolean) TO authenticated;

-- Register with the Approval Center dispatcher (Module 6) — tenant
-- suspension is sensitive enough to require the same dual-approval gate
-- as staff suspension.
CREATE OR REPLACE FUNCTION public.execute_pending_hq_action(p_action_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_action_type text;
  v_target_id uuid;
begin
  select action_type, target_id into v_action_type, v_target_id
  from public.pending_hq_actions where id = p_action_id;

  if v_action_type = 'staff_suspend' then
    update public.profiles set is_suspended = true where id = v_target_id;
  elsif v_action_type = 'staff_reactivate' then
    update public.profiles set is_suspended = false where id = v_target_id;
  elsif v_action_type = 'tenant_suspend' then
    perform public.set_tenant_suspended(v_target_id, true);
  elsif v_action_type = 'tenant_reactivate' then
    perform public.set_tenant_suspended(v_target_id, false);
  else
    raise exception 'No registered execution for action_type %', v_action_type;
  end if;
end;
$function$;
