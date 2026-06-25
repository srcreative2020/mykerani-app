-- ============================================================
-- PHASE 1 RECONCILIATION — REGRESSION FIX
-- Two functions lost coverage when Wave 1 (20260725000000) did a
-- CREATE OR REPLACE without carrying forward prior logic. Both
-- regressions were caught by independent verification after Wave 2 was
-- applied, confirmed directly against live production via
-- pg_get_functiondef before this fix.
--
-- 1. review_pending_hq_action() — Wave 1's replacement dropped:
--      - the hq_governance_audit_log insert (every dual-approval
--        decision since Wave 1 has gone unaudited)
--      - perform execute_pending_hq_action(p_action_id) (approved
--        actions — staff_suspend/reactivate, tenant_suspend/reactivate,
--        plan_change, and Wave 2's webhook_enforce_change — were never
--        actually executed on approval; only pending_hq_actions.status
--        flipped to 'approved')
--      - the staff_suspend/staff_reactivate notification to the
--        affected staff member
--    Wave 1's only addition (tenant_appeal notification) is preserved.
--
-- 2. refresh_hq_alerts() — Wave 1's replacement dropped the
--    storage_warning block (90%+ storage usage vs plan allowance,
--    introduced in 20260702160000_uat_phase1_bugfix_sprint.sql).
--    Wave 2's wallet_low + webhook_failed escalation additions are
--    preserved.
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

CREATE OR REPLACE FUNCTION public.refresh_hq_alerts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_inserted integer := 0;
  v_rc integer;
  v_alert record;
  v_webhook_failed_count integer;
  v_latest_webhook_alert_id uuid;
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;

  insert into public.hq_alerts (alert_type, severity, tenant_id, message)
  select 'churn_risk', 'high', h.tenant_id,
    'Skor kesihatan rendah (' || h.score || '): ' || array_to_string(h.reasons, ', ')
  from public.get_hq_customer_health_scores() h
  where h.risk_level = 'high'
    and not exists (
      select 1 from public.hq_alerts a
      where a.alert_type = 'churn_risk' and a.tenant_id = h.tenant_id and a.resolved_at is null
    )
  returning * into v_alert;
  get diagnostics v_rc = row_count;
  v_inserted := v_inserted + v_rc;

  insert into public.hq_alerts (alert_type, severity, tenant_id, message)
  select 'storage_frozen', 'high', s.tenant_id, coalesce(s.frozen_reason, 'Storan dibekukan')
  from public.workspace_storage_state s
  where s.is_frozen = true
    and not exists (
      select 1 from public.hq_alerts a
      where a.alert_type = 'storage_frozen' and a.tenant_id = s.tenant_id and a.resolved_at is null
    );
  get diagnostics v_rc = row_count;
  v_inserted := v_inserted + v_rc;

  -- High storage usage (>=90% of plan allowance) — restored from
  -- 20260702160000_uat_phase1_bugfix_sprint.sql, dropped by Wave 1.
  insert into public.hq_alerts (alert_type, severity, tenant_id, message)
  select 'storage_warning', 'medium', u.tenant_id,
    'Storan ' || round((u.total_bytes::numeric / (p.storage_credits_allowance_mb * 1024 * 1024)) * 100) || '% digunakan'
  from public.get_all_workspaces_storage_usage() u
  join public.tenant_subscriptions sub on sub.tenant_id = u.tenant_id
  join public.subscription_plans p on p.id = sub.plan_id
  where p.storage_credits_allowance_mb > 0
    and u.total_bytes::numeric / (p.storage_credits_allowance_mb * 1024 * 1024) >= 0.90
    and not exists (
      select 1 from public.hq_alerts a
      where a.alert_type = 'storage_warning' and a.tenant_id = u.tenant_id and a.resolved_at is null
    );
  get diagnostics v_rc = row_count;
  v_inserted := v_inserted + v_rc;

  insert into public.hq_alerts (alert_type, severity, tenant_id, message)
  select 'webhook_failed', 'medium', null,
    count(*) || ' webhook Chip Asia gagal/tertolak dalam 24 jam lepas'
  from public.payment_webhook_events
  where verification_result = 'failed'
    and created_at >= now() - interval '24 hours'
  having count(*) > 0
    and not exists (
      select 1 from public.hq_alerts a
      where a.alert_type = 'webhook_failed' and a.tenant_id is null and a.resolved_at is null
        and a.created_at >= now() - interval '24 hours'
    );
  get diagnostics v_rc = row_count;
  v_inserted := v_inserted + v_rc;

  insert into public.hq_alerts (alert_type, severity, tenant_id, message)
  select 'wallet_low', 'medium', rw.tenant_id,
    format('Wallet AI tenant telah digunakan %s%% (baki %s daripada %s kredit).',
      round(100.0 * (sp.ai_credits_allowance - rw.ai_credits_balance) / sp.ai_credits_allowance, 0),
      rw.ai_credits_balance, sp.ai_credits_allowance)
  from public.resource_wallets rw
  join public.tenant_subscriptions ts on ts.tenant_id = rw.tenant_id
  join public.subscription_plans sp on sp.id = ts.plan_id
  where sp.ai_credits_allowance > 0
    and rw.ai_credits_balance::numeric <= sp.ai_credits_allowance * 0.2
    and not exists (
      select 1 from public.hq_alerts a
      where a.alert_type = 'wallet_low' and a.tenant_id = rw.tenant_id and a.resolved_at is null
        and a.created_at >= now() - interval '7 days'
    );
  get diagnostics v_rc = row_count;
  v_inserted := v_inserted + v_rc;

  for v_alert in
    select * from public.hq_alerts
    where severity = 'high' and tenant_id is not null
      and created_at >= now() - interval '5 seconds'
  loop
    insert into public.audit_logs (user_id, user_email, user_role, tenant_id, module, action, old_value, new_value)
    values (auth.uid()::text, 'hq', 'HQ', v_alert.tenant_id, 'HQ Alert Center', 'CREATE', null,
      jsonb_build_object('alert_type', v_alert.alert_type, 'severity', v_alert.severity, 'message', v_alert.message));

    insert into public.workspace_notifications (workspace_id, tenant_id, category, title, message, metadata)
    select w.id, v_alert.tenant_id, 'ALERT',
      case v_alert.alert_type
        when 'churn_risk' then 'Akaun anda memerlukan perhatian'
        when 'storage_frozen' then 'Storan anda dibekukan'
        else 'Amaran akaun'
      end,
      v_alert.message,
      jsonb_build_object('alert_id', v_alert.id, 'alert_type', v_alert.alert_type)
    from public.workspaces w where w.tenant_id = v_alert.tenant_id;
  end loop;

  select count(*) into v_webhook_failed_count from public.hq_alerts where alert_type = 'webhook_failed';
  if v_webhook_failed_count >= 3 then
    select id into v_latest_webhook_alert_id
    from public.hq_alerts
    where alert_type = 'webhook_failed' and resolved_at is null
    order by created_at desc
    limit 1;

    if v_latest_webhook_alert_id is not null then
      update public.hq_alerts
      set severity = 'high'
      where id = v_latest_webhook_alert_id and severity <> 'high';

      if found then
        insert into public.hq_staff_notifications (recipient_id, category, title, message, metadata)
        select ura.user_id::uuid, 'ALERT', 'Amaran webhook dinaikkan taraf',
          format('Kegagalan webhook Chip Asia telah berulang %s kali — keseriusan amaran dinaikkan kepada TINGGI.', v_webhook_failed_count),
          jsonb_build_object('alert_id', v_latest_webhook_alert_id, 'occurrence_count', v_webhook_failed_count)
        from public.user_role_assignments ura
        join public.tenants t on t.id = ura.tenant_id
        where t.category = 'HQ' and ura.role in ('HQ_OWNER', 'HQ_ADMIN')
        on conflict do nothing;
      end if;
    end if;
  end if;

  return v_inserted;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.refresh_hq_alerts() TO authenticated;
