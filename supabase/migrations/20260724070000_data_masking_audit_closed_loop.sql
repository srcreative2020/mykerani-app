-- HQ Phase 2 — close the Data Masking Governance audit gap.
--
-- grantUnmaskAccess()/revokeUnmaskAccess() (hqService.ts) wrote directly
-- to hq_data_masking_grants from the client — an upsert for grant, a hard
-- DELETE for revoke. The same standard already applied to
-- pending_hq_actions in Module 6 ("a mutable workflow record is not a
-- true audit trail") applies here even more directly: revoke is a DELETE,
-- so the fact a PII-unmask grant ever existed, who granted it, and who
-- revoked it disappears from the system entirely once revoked. Moves
-- both operations into SECURITY DEFINER RPCs that also write an
-- immutable audit_logs row.

CREATE OR REPLACE FUNCTION public.grant_unmask_access(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_actor_email text;
  v_actor_role text;
  v_actor_tenant uuid;
  v_target_email text;
begin
  select email, role, tenant_id into v_actor_email, v_actor_role, v_actor_tenant
  from public.user_role_assignments where user_id = auth.uid()::text;

  if v_actor_role is distinct from 'HQ_OWNER' then
    raise exception 'Permission denied: HQ_OWNER access required';
  end if;

  select email into v_target_email from public.user_role_assignments where user_id = p_user_id::text limit 1;

  insert into public.hq_data_masking_grants (user_id, granted_by, granted_at)
  values (p_user_id, auth.uid(), now())
  on conflict (user_id) do update set granted_by = auth.uid(), granted_at = now();

  insert into public.audit_logs (user_id, user_email, user_role, tenant_id, module, action, old_value, new_value)
  values (
    auth.uid()::text, coalesce(v_actor_email, 'hq'), v_actor_role, v_actor_tenant,
    'Data Masking Governance', 'CREATE',
    null,
    jsonb_build_object('target_user_id', p_user_id, 'target_email', v_target_email, 'unmask_granted', true)
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION public.grant_unmask_access(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_unmask_access(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_actor_email text;
  v_actor_role text;
  v_actor_tenant uuid;
  v_target_email text;
begin
  select email, role, tenant_id into v_actor_email, v_actor_role, v_actor_tenant
  from public.user_role_assignments where user_id = auth.uid()::text;

  if v_actor_role is distinct from 'HQ_OWNER' then
    raise exception 'Permission denied: HQ_OWNER access required';
  end if;

  select email into v_target_email from public.user_role_assignments where user_id = p_user_id::text limit 1;

  delete from public.hq_data_masking_grants where user_id = p_user_id;

  insert into public.audit_logs (user_id, user_email, user_role, tenant_id, module, action, old_value, new_value)
  values (
    auth.uid()::text, coalesce(v_actor_email, 'hq'), v_actor_role, v_actor_tenant,
    'Data Masking Governance', 'DELETE',
    jsonb_build_object('target_user_id', p_user_id, 'target_email', v_target_email, 'unmask_granted', true),
    jsonb_build_object('target_user_id', p_user_id, 'target_email', v_target_email, 'unmask_granted', false)
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION public.revoke_unmask_access(uuid) TO authenticated;
