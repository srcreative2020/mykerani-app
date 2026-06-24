-- HQ Phase 2 — Module: HQ Approval Center.
-- Extends the existing dual-approval primitive (pending_hq_actions /
-- review_pending_hq_action, from 20260702080000_security_foundation_module1.sql)
-- so it is actually usable as a generic HQ approval inbox: any HQ user can
-- submit a gated action, and approval now executes the real effect instead
-- of only flipping a status column. No new tables — pending_hq_actions
-- already carries requester/reviewer/timestamps/note, which is itself the
-- audit trail for this module.

-- 1. Submission entrypoint. Any HQ user may submit; execution never happens
-- here — only on approval, and never by the same user who submitted it.
CREATE OR REPLACE FUNCTION public.submit_pending_hq_action(
  p_action_type text, p_target_table text, p_target_id uuid, p_payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;
  if p_action_type is null or length(trim(p_action_type)) = 0 then
    raise exception 'action_type is required';
  end if;

  insert into public.pending_hq_actions (action_type, target_table, target_id, payload, requested_by)
  values (p_action_type, p_target_table, p_target_id, coalesce(p_payload, '{}'::jsonb), auth.uid())
  returning id into v_id;

  return v_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.submit_pending_hq_action(text, text, uuid, jsonb) TO authenticated;

-- 2. Execution dispatcher — applies the real effect of an approved action.
-- Known action_types today (Phase 2 build order: Approval Center lands
-- before Staff Management, so it must already support staff actions):
--   'staff_suspend'    payload: {} (target_id = profiles.id)
--   'staff_reactivate' payload: {} (target_id = profiles.id)
-- Unknown action_types are recorded as approved/rejected on
-- pending_hq_actions but raise if approved, since there is no registered
-- effect to run — this prevents an approval from silently doing nothing.
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
  else
    raise exception 'No registered execution for action_type %', v_action_type;
  end if;
end;
$function$;

-- 3. Review now executes the action on approval, inside the same
-- transaction as the status flip — an approval that fails to execute is
-- rolled back, so pending_hq_actions never shows "approved" for an action
-- that didn't actually happen.
CREATE OR REPLACE FUNCTION public.review_pending_hq_action(
  p_action_id uuid, p_approve boolean, p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_requested_by uuid;
  v_status text;
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;

  select requested_by, status into v_requested_by, v_status
  from public.pending_hq_actions where id = p_action_id;

  if v_requested_by is null then
    raise exception 'Pending action not found';
  end if;
  if v_status <> 'pending' then
    raise exception 'Pending action already reviewed';
  end if;
  if v_requested_by = auth.uid() then
    raise exception 'Dual approval required: requester may not approve their own action';
  end if;

  update public.pending_hq_actions
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = coalesce(p_note, '')
  where id = p_action_id;

  if p_approve then
    perform public.execute_pending_hq_action(p_action_id);
  end if;
end;
$function$;

-- 4. Read-side helper for the Approval Center inbox UI — joins requester/
-- reviewer emails in so the UI doesn't need a second round trip per row.
CREATE OR REPLACE FUNCTION public.get_pending_hq_actions(p_status text DEFAULT 'pending')
RETURNS TABLE (
  id uuid,
  action_type text,
  target_table text,
  target_id uuid,
  payload jsonb,
  requested_by uuid,
  requested_by_email text,
  requested_at timestamptz,
  status text,
  reviewed_by uuid,
  reviewed_by_email text,
  reviewed_at timestamptz,
  review_note text
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
  select
    a.id, a.action_type, a.target_table, a.target_id, a.payload,
    a.requested_by, rp.email, a.requested_at,
    a.status, a.reviewed_by, vp.email, a.reviewed_at, a.review_note
  from public.pending_hq_actions a
  left join auth.users rp on rp.id = a.requested_by
  left join auth.users vp on vp.id = a.reviewed_by
  where p_status is null or a.status = p_status
  order by a.requested_at desc;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.execute_pending_hq_action(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_hq_actions(text) TO authenticated;
