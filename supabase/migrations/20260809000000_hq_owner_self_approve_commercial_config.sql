-- ============================================================
-- HQ OWNER SELF-APPROVAL FOR COMMERCIAL CONFIG
--
-- The Architecture Lock (RESOURCE_BILLING_ARCHITECTURE_LOCK_V1.0.md)
-- mandates that commercial_config_items is written only via the
-- dual-approval process (pending_hq_actions → review → execute).
-- It does not mandate that the requester and approver must be
-- different persons — that was an implementation-level constraint
-- added to review_pending_hq_action().
--
-- HQ Owner is the system owner and the sole authority over
-- commercial configuration. Requiring HQ Owner to seek a second
-- HQ user to approve their own commercial config submissions is
-- operationally impractical and not required by the Architecture Lock.
--
-- Change: the anti-self-approval block in review_pending_hq_action()
-- is narrowed: it no longer fires when BOTH of these are true:
--   (a) the caller is HQ_OWNER (is_hq_owner() = true), AND
--   (b) the action type is 'commercial_config_upsert'
--
-- For all other action types (staff_suspend, tenant_suspend,
-- addon_package_upsert, promotion_upsert, etc.) the anti-self-approval
-- constraint remains fully in force.
--
-- Audit trail is FULLY preserved:
--   - pending_hq_actions record (status, reviewed_by, reviewed_at, review_note)
--   - hq_governance_audit_log insert (decision, requested_by, reviewed_by)
-- ============================================================

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

  -- Anti-self-approval: HQ Owner may approve their own commercial config
  -- submissions; all other action types still require a second reviewer.
  if v_requested_by = auth.uid() then
    if not (is_hq_owner() and v_action_type = 'commercial_config_upsert') then
      raise exception 'Dual approval required: requester may not approve their own action';
    end if;
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

  if v_action_type = 'tenant_appeal' then
    insert into public.workspace_notifications (workspace_id, tenant_id, category, title, message, metadata)
    select w.id, v_target_id, 'SUPPORT',
      case when p_approve then 'Rayuan anda diterima' else 'Rayuan anda ditolak' end,
      coalesce(p_note, case when p_approve then 'HQ telah menyemak rayuan anda dan akan mengambil tindakan susulan.' else 'HQ telah menyemak rayuan anda dan keputusan kekal.' end),
      jsonb_build_object('action_id', p_action_id, 'approved', p_approve)
    from public.workspaces w where w.tenant_id = v_target_id;
  end if;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.review_pending_hq_action(uuid, boolean, text) TO authenticated;
