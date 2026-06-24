-- HQ Phase 2 — close the Staff Creation gap found while auditing
-- /api/admin/create-staff: new HQ_STAFF and TENANT_STAFF accounts were
-- provisioned with zero audit trail and zero notification to anyone —
-- existing HQ admins had no way to know a new HQ_STAFF account was
-- created except by noticing it in a list, and an existing tenant
-- team had no way to know a new staff member had joined except by
-- noticing them in a list. server.ts now writes audit_logs directly
-- (fire-and-forget) and calls these two RPCs to notify the right
-- audience for each case.

CREATE OR REPLACE FUNCTION public.notify_hq_staff_of_new_account(
  p_new_email text,
  p_new_full_name text,
  p_created_by text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_recipient record;
begin
  for v_recipient in
    select ura.user_id
    from public.user_role_assignments ura
    join public.tenants t on t.id = ura.tenant_id
    where t.category = 'HQ' and ura.role in ('HQ_OWNER', 'HQ_STAFF')
      and ura.email is distinct from p_new_email
  loop
    insert into public.hq_staff_notifications (recipient_id, category, title, message, metadata)
    values (
      v_recipient.user_id::uuid, 'STAFF',
      'Akaun HQ Staf baharu dicipta',
      format('%s telah cipta akaun HQ Staf baharu untuk %s (%s).', p_created_by, p_new_full_name, p_new_email),
      jsonb_build_object('new_email', p_new_email, 'created_by', p_created_by)
    );
  end loop;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.notify_hq_staff_of_new_account(text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.notify_tenant_team_of_new_staff(
  p_tenant_id uuid,
  p_new_email text,
  p_new_full_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_ws record;
begin
  for v_ws in select id from public.workspaces where tenant_id = p_tenant_id loop
    insert into public.workspace_notifications (workspace_id, tenant_id, category, title, message, metadata)
    values (
      v_ws.id, p_tenant_id, 'TEAM',
      'Staf baharu disertai pasukan',
      format('%s (%s) telah ditambah sebagai staf syarikat anda.', p_new_full_name, p_new_email),
      jsonb_build_object('new_email', p_new_email)
    );
  end loop;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.notify_tenant_team_of_new_staff(uuid, text, text) TO authenticated, service_role;
