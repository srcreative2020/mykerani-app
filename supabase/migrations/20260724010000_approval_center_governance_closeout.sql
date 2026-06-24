-- HQ Phase 2 — Module 6 governance closeout (HQ Approval Center).
-- Closes 2 of the 4 outstanding items from the Module 6 revalidation:
--   1. Immutable audit trail (pending_hq_actions is a mutable workflow
--      record; this adds a true append-only log alongside it).
--   2. Notification to the affected HQ staff user on approval outcome.
-- Production Verification remains open (no live Supabase project
-- reachable from this dev environment) and is tracked separately.

-- 1. Immutable governance audit log — insert-only, no UPDATE/DELETE policy,
-- mirroring the audit_logs/event_logs immutability posture. One row per
-- reviewed decision (not per submission — the decision is the governance
-- event; the request itself is already captured by pending_hq_actions).
CREATE TABLE IF NOT EXISTS public.hq_governance_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pending_action_id uuid NOT NULL REFERENCES public.pending_hq_actions(id),
  action_type text NOT NULL,
  target_table text,
  target_id uuid,
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  requested_by uuid NOT NULL,
  reviewed_by uuid NOT NULL,
  review_note text,
  decided_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hq_governance_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hq_read_governance_audit_log ON public.hq_governance_audit_log;
CREATE POLICY hq_read_governance_audit_log ON public.hq_governance_audit_log
  FOR SELECT USING (is_hq_user());

-- Insert only via the SECURITY DEFINER function below — no direct INSERT
-- policy for authenticated users, so the trail cannot be forged by an
-- ordinary HQ session, only appended by review_pending_hq_action() itself.

GRANT SELECT ON public.hq_governance_audit_log TO authenticated;

-- 2. HQ-internal notifications. workspace_notifications requires a
-- tenant_id/workspace_id (tenant-scoped); HQ staff accounts have neither,
-- so a separate minimal table is needed for HQ-internal notices.
CREATE TABLE IF NOT EXISTS public.hq_staff_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL,
  category text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'UNREAD' CHECK (status IN ('UNREAD', 'READ')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hq_staff_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hq_staff_notif_select ON public.hq_staff_notifications;
CREATE POLICY hq_staff_notif_select ON public.hq_staff_notifications
  FOR SELECT USING (recipient_id = auth.uid() OR is_hq_user());

DROP POLICY IF EXISTS hq_staff_notif_mark_read ON public.hq_staff_notifications;
CREATE POLICY hq_staff_notif_mark_read ON public.hq_staff_notifications
  FOR UPDATE USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());

GRANT SELECT, UPDATE ON public.hq_staff_notifications TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_hq_staff_notification_read(p_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.hq_staff_notifications SET status = 'READ' WHERE id = p_id AND recipient_id = auth.uid();
$function$;

GRANT EXECUTE ON FUNCTION public.mark_hq_staff_notification_read(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_hq_staff_notifications()
RETURNS SETOF public.hq_staff_notifications
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT * FROM public.hq_staff_notifications WHERE recipient_id = auth.uid() ORDER BY created_at DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.get_my_hq_staff_notifications() TO authenticated;

-- 3. review_pending_hq_action now writes the immutable audit row and
-- notifies the affected user, in the same transaction as the decision and
-- the executed effect — all three succeed together or the whole review
-- rolls back.
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
  v_action_type text;
  v_target_table text;
  v_target_id uuid;
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;

  select requested_by, status, action_type, target_table, target_id
  into v_requested_by, v_status, v_action_type, v_target_table, v_target_id
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

  insert into public.hq_governance_audit_log
    (pending_action_id, action_type, target_table, target_id, decision, requested_by, reviewed_by, review_note)
  values
    (p_action_id, v_action_type, v_target_table, v_target_id,
     case when p_approve then 'approved' else 'rejected' end,
     v_requested_by, auth.uid(), p_note);

  if p_approve then
    perform public.execute_pending_hq_action(p_action_id);
  end if;

  if v_action_type in ('staff_suspend', 'staff_reactivate') and v_target_id is not null then
    insert into public.hq_staff_notifications (recipient_id, category, title, message, metadata)
    values (
      v_target_id,
      'SECURITY',
      case
        when not p_approve then 'Permintaan akaun ditolak'
        when v_action_type = 'staff_suspend' then 'Akaun anda digantung'
        else 'Akaun anda diaktifkan semula'
      end,
      case
        when not p_approve then 'Permintaan tindakan ke atas akaun anda telah ditolak oleh kelulusan HQ kedua.'
        when v_action_type = 'staff_suspend' then 'Akaun HQ anda telah digantung berikutan kelulusan dua peringkat HQ.'
        else 'Akaun HQ anda telah diaktifkan semula berikutan kelulusan dua peringkat HQ.'
      end,
      jsonb_build_object('pending_action_id', p_action_id, 'action_type', v_action_type)
    );
  end if;
end;
$function$;
