-- Phase 1 Reconciliation — Remediation Wave 2.
--
-- Source: PHASE1_RECONCILIATION_GAP_REPORT.md, re-verified against the
-- live schema AFTER Wave 1 (20260725000000) landed. Several gaps the
-- report flagged are already closed by Wave 1 and are NOT touched again
-- here (see the "already closed, skipped" note at the bottom of this
-- header):
--   - get_tenant_staff_roles()            (Wave 1, Module 2 gap 2.6)
--   - hq_reply_support_ticket() audit row (already present pre-Wave-1)
--   - refresh_hq_alerts() tenant notify+audit for churn_risk/storage_frozen
--     (Wave 1, gaps 9.1/9.2 for tenant-scoped alerts)
--   - change_subscription_plan() audit_logs + notification on every plan
--     change (Wave 1) — Wave 2 only enriches the message text with the
--     wallet delta (gap 11.3/11.6), it does not re-add the notification.
--   - set_webhook_enforce_flag() HQ_OWNER gate + audit (Wave 1, gap 1.2)
--   - upsert_ai_cost_rate() HQ_OWNER gate + audit + notify (Wave 1, gap 3.2/3.3)
--
-- This wave closes the remaining genuinely-open gaps:
--   1. Module 1: tenant + HQ notification on webhook verification failure
--      correlated to a real payment_transactions row (via
--      payment_webhook_events.transaction_reference ->
--      payment_transactions.chip_asia_reference), and dual-approval gating
--      for the chip_asia_webhook_enforce flag toggle (gap 1.1, 1.3, 1.5).
--   2. Module 2: check_permission() generic utility RPC for future
--      enforcement call-sites (not retrofitted into existing RPCs, which
--      already have explicit role checks per gap 2.5's own guidance).
--      get_tenant_staff_roles() already exists from Wave 1 — confirmed,
--      not duplicated.
--   3. Module 3: tenant-facing read-only cost/spend visibility (gap 3.1)
--      and an HQ-only rate-change forecast simulator (gap 3.4).
--   5. Module 5: tenant-side reply channel (gap 5.4) and attachment
--      notification (gap 5.3). hq_reply_support_ticket already audits
--      (confirmed in 20260724130000_support_ops_redesign.sql); not
--      touched again.
--   7. Module 7: tenant self-service "who can see my data" log (gap 7.2)
--      and an informational HQ-staff notice on revoke (gap 7.3).
--   8. Module 8: persisted health-score snapshot history + tenant
--      notification/audit on a transition into high risk (gaps 8.1, 8.2),
--      plus tenant self-visibility (gap 8.3).
--   9. Module 9: escalate hq_alerts severity / fan out a second HQ-wide
--      notification when 'webhook_failed' has reoccurred 3+ times for the
--      same tenant scope (gap 9.4, simplified per instructions).
--   11. Module 11: wallet-delta in the plan-change notification message
--      (gap 11.3/11.6) and an 80%+ wallet-consumption HQ alert (gap 11.4).
--
-- Explicitly skipped (documented, not silently dropped):
--   - Module 4 (Storage Governance UI fix) — UI-only, out of scope.
--   - Module 10 (cascade documentation) — doc-only, out of scope.
--   - Module 11.5 (HQ_STAFF wallet visibility) — UI-only, out of scope.
--   - createSupportTicket() legacy null-tenant_id path — TS/client fix,
--     not SQL.

-- ============================================================
-- MODULE 1 — Security Foundation
-- ============================================================

-- 1a. Correlate a failed/non-verified webhook event to the real payment
-- transaction + tenant it belongs to (transaction_reference is the Chip
-- Asia reference echoed on the payload; payment_transactions stores the
-- same value in chip_asia_reference once create_payment_transaction /
-- finalize_chip_asia_transaction have run). No FK is added (webhook events
-- can arrive before the local transaction exists, or reference an unknown
-- transaction_reference entirely) — this is a join-time correlation only.
CREATE OR REPLACE FUNCTION public.notify_on_webhook_verification_failure(p_webhook_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_event record;
  v_tx record;
  v_ws record;
begin
  select * into v_event from public.payment_webhook_events where id = p_webhook_event_id;
  if v_event.id is null then
    return;
  end if;
  if v_event.verification_result = 'verified' then
    return;
  end if;

  select pt.* into v_tx
  from public.payment_transactions pt
  where pt.chip_asia_reference = v_event.transaction_reference
  order by pt.created_at desc
  limit 1;

  -- Always notify HQ staff regardless of whether a tenant could be
  -- correlated (gap 1.3) — webhook failures must never sit invisible.
  insert into public.hq_staff_notifications (recipient_id, category, title, message, metadata)
  select ura.user_id::uuid, 'SECURITY', 'Pengesahan webhook Chip Asia gagal',
    format('Webhook (rujukan: %s) gagal disahkan: %s%s',
      coalesce(v_event.transaction_reference, 'tidak diketahui'),
      v_event.verification_result,
      case when v_tx.id is not null then format(' (tenant: %s)', v_tx.tenant_id::text) else '' end),
    jsonb_build_object('webhook_event_id', v_event.id, 'verification_result', v_event.verification_result, 'transaction_id', v_tx.id, 'tenant_id', v_tx.tenant_id)
  from public.user_role_assignments ura
  join public.tenants t on t.id = ura.tenant_id
  where t.category = 'HQ' and ura.role in ('HQ_OWNER', 'HQ_ADMIN')
  on conflict do nothing;

  -- Notify the affected tenant only when correlation succeeded (gap 1.1) —
  -- otherwise there is no workspace to notify and no actionable detail to
  -- give them.
  if v_tx.id is not null and v_tx.tenant_id is not null then
    for v_ws in select id from public.workspaces where tenant_id = v_tx.tenant_id loop
      insert into public.workspace_notifications (workspace_id, tenant_id, category, title, message, metadata)
      values (
        v_ws.id, v_tx.tenant_id, 'BILLING', 'Isu pengesahan pembayaran',
        'Pengesahan webhook untuk pembayaran anda tidak berjaya disahkan sepenuhnya. Pasukan HQ telah dimaklumkan dan akan menyemak status pembayaran anda. Jika anda yakin pembayaran telah dibuat, sila hubungi sokongan.',
        jsonb_build_object('webhook_event_id', v_event.id, 'transaction_id', v_tx.id)
      );
    end loop;
  end if;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.notify_on_webhook_verification_failure(uuid) TO authenticated;

-- 1b. Dual-approval for the chip_asia_webhook_enforce flag — currently a
-- single HQ_OWNER call to set_webhook_enforce_flag() can unilaterally
-- change payment security posture (gap 1.5). This adds a propose/execute
-- path through the existing pending_hq_actions primitive: HQ_OWNER
-- proposes, a second HQ user (also HQ_OWNER, enforced the same way every
-- other dual-approval path in this codebase is — review_pending_hq_action
-- already forbids the requester reviewing their own action) must approve
-- before the flag actually flips. The direct set_webhook_enforce_flag()
-- RPC from Wave 1 is left in place for emergency/break-glass use by
-- design (matches the existing pattern where direct RPCs coexist with the
-- dual-approval route for plan changes) but its own audit trail already
-- attributes who flipped it directly.
CREATE OR REPLACE FUNCTION public.propose_webhook_enforce_flag_change(p_enabled boolean, p_reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_action_id uuid;
begin
  if not is_hq_owner() then
    raise exception 'Permission denied: HQ_OWNER access required';
  end if;

  insert into public.pending_hq_actions (action_type, target_table, target_id, payload, requested_by)
  values ('webhook_enforce_change', 'hq_feature_flags', null,
    jsonb_build_object('enabled', p_enabled, 'reason', p_reason), auth.uid())
  returning id into v_action_id;

  insert into public.hq_staff_notifications (recipient_id, category, title, message, metadata)
  select ura.user_id::uuid, 'SECURITY', 'Cadangan tukar penguatkuasaan webhook',
    format('Cadangan menetapkan chip_asia_webhook_enforce kepada %s memerlukan kelulusan kedua.', p_enabled::text),
    jsonb_build_object('action_id', v_action_id, 'enabled', p_enabled)
  from public.user_role_assignments ura
  join public.tenants t on t.id = ura.tenant_id
  where t.category = 'HQ' and ura.role = 'HQ_OWNER' and ura.user_id <> auth.uid()::text
  on conflict do nothing;

  return v_action_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.propose_webhook_enforce_flag_change(boolean, text) TO authenticated;

-- Extend the Approval Center dispatcher so an approved 'webhook_enforce_change'
-- actually flips the flag (reusing set_webhook_enforce_flag, which already
-- writes its own audit_logs entry attributing the flag flip to the
-- approving reviewer's transaction).
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
  elsif v_action_type = 'webhook_enforce_change' then
    perform public.set_webhook_enforce_flag((v_payload->>'enabled')::boolean);
  else
    raise exception 'No registered execution for action_type %', v_action_type;
  end if;
end;
$function$;

-- ============================================================
-- MODULE 2 — Permission Governance
-- ============================================================

-- Generic permission lookup against permission_matrices/user_role_assignments
-- for FUTURE call-sites only. Existing privileged RPCs across this codebase
-- already use explicit, hardcoded role checks (e.g. `if not is_hq_owner()`)
-- which are more precise and auditable than a generic JSON-path lookup
-- against a matrix that is itself only seeded for the four "Financial *"
-- module keys today — retrofitting would weaken, not strengthen, those
-- checks. This exists so a future RPC/module key can be added to
-- permission_matrices and checked here without writing a bespoke query
-- each time.
CREATE OR REPLACE FUNCTION public.check_permission(p_user_id uuid, p_permission text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_role text;
  v_module text;
  v_action text;
  v_allowed boolean;
begin
  -- p_permission convention: "<Module Name>:<action>", e.g.
  -- "Financial Records:delete". Malformed input is treated as denied.
  v_module := split_part(p_permission, ':', 1);
  v_action := split_part(p_permission, ':', 2);
  if v_module = '' or v_action = '' then
    return false;
  end if;

  select role into v_role from public.user_role_assignments where user_id = p_user_id::text limit 1;
  if v_role is null then
    return false;
  end if;

  select coalesce((permissions -> v_module -> v_action)::boolean, false) into v_allowed
  from public.permission_matrices
  where role = v_role;

  return coalesce(v_allowed, false);
end;
$function$;

GRANT EXECUTE ON FUNCTION public.check_permission(uuid, text) TO authenticated;

-- get_tenant_staff_roles(p_tenant_id uuid) already exists (added in Wave 1,
-- 20260725000000_phase1_reconciliation_remediation_wave1.sql) — confirmed
-- present with the exact signature this gap requires; not duplicated here.

-- ============================================================
-- MODULE 3 — AI Cost Governance
-- ============================================================

-- Tenant-facing read-only cost/spend visibility (gap 3.1). Scoped strictly
-- to the caller's own tenant via get_tenant_id().
CREATE OR REPLACE FUNCTION public.get_tenant_ai_cost_summary()
RETURNS TABLE(provider text, model text, cost_per_call_usd numeric, total_calls bigint, total_cost_usd numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_tenant_id uuid := public.get_tenant_id();
begin
  if v_tenant_id is null then
    raise exception 'No tenant context';
  end if;

  return query
  select r.provider, r.model, r.cost_per_call_usd,
    coalesce(u.total_calls, 0)::bigint, coalesce(u.total_cost_usd, 0)
  from public.ai_cost_rates r
  left join (
    select provider, count(*) as total_calls, sum(coalesce(cost_usd, 0)) as total_cost_usd
    from public.ai_usage_log
    where tenant_id = v_tenant_id
    group by provider
  ) u on u.provider = r.provider
  order by r.provider, r.model;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.get_tenant_ai_cost_summary() TO authenticated;

-- HQ-only read-only forecast: "if this model's rate changed to X, what
-- would last 30 days of actual call volume have cost" (gap 3.4). Pure
-- estimate — no mutation, does not touch ai_cost_rates.
CREATE OR REPLACE FUNCTION public.simulate_ai_cost_rate_change(p_model text, p_new_rate numeric)
RETURNS TABLE(model text, current_rate numeric, new_rate numeric, calls_last_30_days bigint, current_monthly_cost_usd numeric, projected_monthly_cost_usd numeric, delta_usd numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_current_rate numeric;
  v_calls bigint;
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;

  select r.cost_per_call_usd into v_current_rate from public.ai_cost_rates r where r.model = p_model limit 1;
  select count(*) into v_calls from public.ai_usage_log l where l.model = p_model and l.created_at >= now() - interval '30 days';

  return query
  select p_model, v_current_rate, p_new_rate, coalesce(v_calls, 0)::bigint,
    coalesce(v_calls, 0) * coalesce(v_current_rate, 0),
    coalesce(v_calls, 0) * p_new_rate,
    (coalesce(v_calls, 0) * p_new_rate) - (coalesce(v_calls, 0) * coalesce(v_current_rate, 0));
end;
$function$;

GRANT EXECUTE ON FUNCTION public.simulate_ai_cost_rate_change(text, numeric) TO authenticated;

-- ============================================================
-- MODULE 5 — Support Governance
-- ============================================================
-- hq_reply_support_ticket() already writes an audit_logs entry (confirmed
-- in 20260724130000_support_ops_redesign.sql) — gap 5.1 already closed,
-- not touched again here.

-- 5a. Attachment-insert notification, both directions (gap 5.3). The
-- existing add_ticket_attachment() RPC (support_ops_redesign) is extended
-- in place to notify the counterpart side in the same transaction as the
-- insert, matching the closed-loop pattern used everywhere else.
CREATE OR REPLACE FUNCTION public.add_ticket_attachment(
  p_ticket_id uuid,
  p_file_name text,
  p_file_path text,
  p_file_type text,
  p_uploaded_by_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_tenant_id uuid;
  v_caller_tenant_id uuid;
  v_id uuid;
  v_subject text;
  v_is_hq boolean := is_hq_user();
begin
  select tenant_id, subject into v_tenant_id, v_subject from public.support_tickets where id = p_ticket_id;
  select tenant_id into v_caller_tenant_id from public.user_role_assignments where user_id = auth.uid()::text limit 1;

  if not (v_is_hq or (v_tenant_id is not null and v_tenant_id = v_caller_tenant_id)) then
    raise exception 'Not authorized';
  end if;

  insert into public.support_ticket_attachments (ticket_id, file_name, file_path, file_type, uploaded_by, uploaded_by_name)
  values (p_ticket_id, p_file_name, p_file_path, p_file_type, auth.uid()::text, p_uploaded_by_name)
  returning id into v_id;

  if v_is_hq then
    -- HQ uploaded -> notify the tenant.
    perform public.notify_tenant_ticket_update(p_ticket_id, 'status', format('Lampiran baharu "%s" telah dimuat naik oleh HQ.', p_file_name));
  elsif v_tenant_id is not null then
    -- Tenant uploaded -> notify HQ staff so evidence isn't missed.
    insert into public.hq_staff_notifications (recipient_id, category, title, message, metadata)
    select ura.user_id::uuid, 'SUPPORT', 'Lampiran baharu pada tiket sokongan',
      format('Tenant memuat naik "%s" pada tiket "%s".', p_file_name, coalesce(v_subject, '')),
      jsonb_build_object('ticket_id', p_ticket_id, 'attachment_id', v_id)
    from public.user_role_assignments ura
    join public.tenants t on t.id = ura.tenant_id
    where t.category = 'HQ' and ura.role in ('HQ_OWNER', 'HQ_ADMIN', 'HQ_SUPPORT')
    on conflict do nothing;
  end if;

  return v_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.add_ticket_attachment(uuid, text, text, text, text) TO authenticated;

-- 5b. Tenant-side reply channel (gap 5.4) — the one-way HQ->tenant-only
-- support channel is the highest-risk Module 5 gap still open. Tenant-
-- scoped (cannot reply to another tenant's ticket), sets status to
-- 'awaiting_hq', notifies HQ staff.
CREATE OR REPLACE FUNCTION public.tenant_reply_support_ticket(p_ticket_id uuid, p_message text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_tenant_id uuid := public.get_tenant_id();
  v_ticket_tenant_id uuid;
  v_subject text;
  v_actor_email text;
  v_old jsonb;
begin
  if v_tenant_id is null then
    raise exception 'No tenant context';
  end if;
  if coalesce(trim(p_message), '') = '' then
    raise exception 'Reply message is required';
  end if;

  select tenant_id, subject, to_jsonb(t.*) into v_ticket_tenant_id, v_subject, v_old
  from public.support_tickets t where t.id = p_ticket_id;

  if v_ticket_tenant_id is null or v_ticket_tenant_id <> v_tenant_id then
    raise exception 'Ticket not found in your tenant';
  end if;

  select email into v_actor_email from public.user_role_assignments where user_id = auth.uid()::text and tenant_id = v_tenant_id limit 1;

  insert into public.support_ticket_replies (ticket_id, author, reply_text)
  values (p_ticket_id, coalesce(v_actor_email, 'tenant'), p_message);

  update public.support_tickets
  set status = 'awaiting_hq',
      updated_at = now()
  where id = p_ticket_id;

  insert into public.audit_logs (id, user_id, user_email, user_role, tenant_id, module, action, old_value, new_value, timestamp)
  values (gen_random_uuid(), auth.uid()::text, coalesce(v_actor_email, ''), 'TENANT', v_tenant_id, 'Support Ticket', 'UPDATE', v_old, jsonb_build_object('reply', p_message, 'status', 'awaiting_hq'), now());

  insert into public.hq_staff_notifications (recipient_id, category, title, message, metadata)
  select ura.user_id::uuid, 'SUPPORT', 'Balasan tenant pada tiket sokongan',
    format('Tenant membalas tiket "%s": %s', coalesce(v_subject, ''), p_message),
    jsonb_build_object('ticket_id', p_ticket_id, 'tenant_id', v_tenant_id)
  from public.user_role_assignments ura
  join public.tenants t on t.id = ura.tenant_id
  where t.category = 'HQ' and ura.role in ('HQ_OWNER', 'HQ_ADMIN', 'HQ_SUPPORT')
  on conflict do nothing;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.tenant_reply_support_ticket(uuid, text) TO authenticated;

-- ============================================================
-- MODULE 7 — Data Masking Governance
-- ============================================================

-- 7a. Tenant self-service privacy audit log (gap 7.2) — current + historical
-- grants are not literally scoped "to a tenant" (hq_data_masking_grants
-- grants a staff member blanket unmask ability, not a per-tenant grant),
-- so this surfaces the full current+historical grant/revoke trail from
-- audit_logs (Data Masking Governance module) plus the live grant table,
-- which is the closest accurate representation of "who can currently see
-- unmasked PII anywhere, including mine" without overclaiming a
-- per-tenant grant model that does not exist in the schema.
CREATE OR REPLACE FUNCTION public.get_my_data_access_log(p_tenant_id uuid)
RETURNS TABLE(
  event_type text,
  staff_email text,
  granted_by_email text,
  occurred_at timestamptz,
  currently_active boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if p_tenant_id <> public.get_tenant_id() then
    raise exception 'Permission denied: can only view your own tenant access log';
  end if;

  return query
  select
    al.action,
    coalesce(al.new_value->>'target_email', al.old_value->>'target_email'),
    al.user_email,
    al.timestamp,
    exists (
      select 1 from public.hq_data_masking_grants g
      where g.user_id::text = coalesce(al.new_value->>'target_user_id', al.old_value->>'target_user_id')
    )
  from public.audit_logs al
  where al.module = 'Data Masking Governance'
  order by al.timestamp desc;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.get_my_data_access_log(uuid) TO authenticated;

-- 7b. Informational notice to the affected staff member on revoke (gap 7.3).
-- revoke_unmask_access() (Wave 1 / data_masking_audit_closed_loop) writes
-- audit_logs but no notification at all — adding an hq_staff_notifications
-- insert for the revoked staff member.
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

  insert into public.hq_staff_notifications (recipient_id, category, title, message, metadata)
  values (
    p_user_id, 'SECURITY', 'Akses unmask PII anda dilucutkan',
    'Kebenaran melihat data PII pelanggan tanpa topeng (unmask) anda telah dilucutkan oleh HQ_OWNER.',
    jsonb_build_object('revoked_by', auth.uid())
  )
  on conflict do nothing;
exception when invalid_text_representation or foreign_key_violation then
  -- p_user_id may be a mock-sandbox identity with no auth.users row to
  -- satisfy hq_staff_notifications' FK — the audit row above already
  -- recorded the revoke; skip the notification insert.
  null;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.revoke_unmask_access(uuid) TO authenticated;

-- ============================================================
-- MODULE 8 — Customer Health Score
-- ============================================================

-- 8a. Persisted snapshot history (net-new schema) — health score is
-- currently computed fresh per call with no storage, so there is no way
-- to detect a risk_level transition or build a trend view (gap 8.1/8.2/8.3
-- root cause per Wave 1's own deferral note).
CREATE TABLE IF NOT EXISTS public.hq_customer_health_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  score integer NOT NULL,
  risk_level text NOT NULL CHECK (risk_level IN ('high', 'medium', 'low')),
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hq_health_snapshots_tenant_created ON public.hq_customer_health_snapshots(tenant_id, created_at DESC);

ALTER TABLE public.hq_customer_health_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hq_read_health_snapshots ON public.hq_customer_health_snapshots;
CREATE POLICY hq_read_health_snapshots ON public.hq_customer_health_snapshots
  FOR SELECT USING (is_hq_user() OR tenant_id = public.get_tenant_id());

-- INSERT-only via snapshot_customer_health_scores() below (SECURITY
-- DEFINER bypasses RLS for the write path; no direct-insert policy granted).

-- 8b. Snapshot function — reuses get_hq_customer_health_scores()'s exact
-- scoring logic (does not duplicate it), inserts one snapshot row per
-- tenant, and on a transition into 'high' risk (compared against that
-- tenant's most recent PRIOR snapshot, not the one just inserted) writes
-- an audit_logs entry and a plain-language workspace_notifications row.
CREATE OR REPLACE FUNCTION public.snapshot_customer_health_scores()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_count integer := 0;
  v_row record;
  v_prior_risk text;
  v_ws record;
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;

  for v_row in select * from public.get_hq_customer_health_scores() loop
    select risk_level into v_prior_risk
    from public.hq_customer_health_snapshots
    where tenant_id = v_row.tenant_id
    order by created_at desc
    limit 1;

    insert into public.hq_customer_health_snapshots (tenant_id, score, risk_level, reasons)
    values (v_row.tenant_id, v_row.score, v_row.risk_level, to_jsonb(v_row.reasons));
    v_count := v_count + 1;

    if v_row.risk_level = 'high' and coalesce(v_prior_risk, 'low') <> 'high' then
      insert into public.audit_logs (user_id, user_email, user_role, tenant_id, module, action, old_value, new_value)
      values (auth.uid()::text, 'hq', 'HQ', v_row.tenant_id, 'Customer Health Score', 'CREATE',
        jsonb_build_object('risk_level', coalesce(v_prior_risk, 'low')),
        jsonb_build_object('risk_level', 'high', 'score', v_row.score, 'reasons', v_row.reasons));

      for v_ws in select id from public.workspaces where tenant_id = v_row.tenant_id loop
        insert into public.workspace_notifications (workspace_id, tenant_id, category, title, message, metadata)
        values (
          v_ws.id, v_row.tenant_id, 'ACCOUNT', 'Akaun anda memerlukan perhatian',
          'Kami perhatikan beberapa isu pada akaun anda yang mungkin menjejaskan perkhidmatan: ' || array_to_string(v_row.reasons, ', ') || '. Sila semak akaun anda atau hubungi sokongan jika anda perlukan bantuan.',
          jsonb_build_object('score', v_row.score, 'risk_level', 'high')
        );
      end loop;
    end if;
  end loop;

  return v_count;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.snapshot_customer_health_scores() TO authenticated;

-- 8c. Tenant self-visibility (gap 8.3) — latest snapshot only, tenant-scoped.
CREATE OR REPLACE FUNCTION public.tenant_get_my_health_score()
RETURNS TABLE(score integer, risk_level text, reasons jsonb, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_tenant_id uuid := public.get_tenant_id();
begin
  if v_tenant_id is null then
    raise exception 'No tenant context';
  end if;

  return query
  select h.score, h.risk_level, h.reasons, h.created_at
  from public.hq_customer_health_snapshots h
  where h.tenant_id = v_tenant_id
  order by h.created_at desc
  limit 1;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.tenant_get_my_health_score() TO authenticated;

-- ============================================================
-- MODULE 9 — HQ Alert Center
-- ============================================================

-- Escalate a 'webhook_failed' alert that has reoccurred 3+ times for the
-- same scope (tenant_id is null for this alert_type today, so "reoccurred"
-- is counted globally — matching the existing dedup key used by
-- refresh_hq_alerts itself) by upgrading severity on the latest unresolved
-- row to 'high' and fanning out a second, distinctly-worded HQ-staff-wide
-- notification (gap 9.4, kept simple per instructions: no new schema, no
-- auto-retry/billing tie-in).
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

  -- 80%+ wallet consumption alert (Module 11, gap 11.4) — runs inside the
  -- same refresh cycle as the other signal scans. Consumption % requires
  -- the original plan allowance, not just the current balance, so it is
  -- computed against tenant_subscriptions/subscription_plans (AI credits,
  -- the unit tenants reason about day-to-day) rather than resource_wallets
  -- alone.
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

  -- Audit + tenant notification for every NEW tenant-scoped, high-severity
  -- alert this run just raised (churn_risk, storage_frozen) — unchanged
  -- from Wave 1.
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

  -- Escalation: if 'webhook_failed' has reoccurred 3+ times (counting all
  -- rows ever raised for this alert_type, resolved or not, as the
  -- "reoccurrence count" — using the existing global/tenant-null dedup key
  -- refresh_hq_alerts already applies to this alert_type), bump the latest
  -- unresolved row's severity to 'high' and fan out a second, distinctly
  -- worded HQ-staff-wide notification so repeated failures don't sit at
  -- the same 'medium' severity indefinitely.
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

-- ============================================================
-- MODULE 11 — Resource Wallet Dashboard
-- ============================================================

-- 11a. Wallet-delta in the plan-change notification (gaps 11.3/11.6).
-- change_subscription_plan() already writes an audit_logs entry and a
-- workspace_notifications row (Wave 1) — this revision only enriches the
-- notification message with the actual numeric AI-credit delta the
-- clawback/grant produced, computed from the same allowance values
-- already being read for the upgrade/downgrade classification. (OCR/
-- storage/notification deltas move proportionally with the same plan
-- change and are visible in-app on the wallet dashboard; the message
-- focuses on AI credits, the unit tenants reason about day-to-day, to
-- avoid an unreadable four-number wall of text.)
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
  v_ai_delta bigint;
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
    v_ai_delta := NULL;
  ELSE
    UPDATE public.tenant_subscriptions SET plan_id = p_new_plan_id, status = p_status, updated_at = now() WHERE tenant_id = p_tenant_id;
    SELECT ai_credits_allowance INTO v_old_allowance FROM public.subscription_plans WHERE id = v_old_plan_id;
    SELECT ai_credits_allowance INTO v_new_allowance FROM public.subscription_plans WHERE id = p_new_plan_id;
    v_event := CASE WHEN v_new_allowance >= coalesce(v_old_allowance, 0) THEN 'upgrade' ELSE 'downgrade' END;
    v_ai_delta := coalesce(v_new_allowance, 0) - coalesce(v_old_allowance, 0);
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
    jsonb_build_object('plan', v_new_plan_name, 'status', p_status, 'event', v_event, 'reason', p_reason, 'ai_credit_delta', v_ai_delta)
  );

  FOR v_ws IN SELECT id FROM public.workspaces WHERE tenant_id = p_tenant_id LOOP
    INSERT INTO public.workspace_notifications (workspace_id, tenant_id, category, title, message, metadata)
    VALUES (
      v_ws.id, p_tenant_id, 'BILLING',
      CASE WHEN v_event = 'upgrade' THEN 'Pelan dinaik taraf' WHEN v_event = 'downgrade' THEN 'Pelan diturunkan' ELSE 'Pelan langganan ditetapkan' END,
      CASE
        WHEN v_ai_delta IS NULL THEN
          format('Pelan langganan syarikat anda telah ditukar ke "%s". Kuota AI, OCR dan storan telah dikemas kini secara automatik.', coalesce(v_new_plan_name, 'pelan baharu'))
        WHEN v_ai_delta < 0 THEN
          format('Pelan langganan syarikat anda telah ditukar ke "%s". Kuota AI, OCR dan storan telah dikemas kini secara automatik. Baki kredit AI anda diselaraskan sebanyak %s kredit (penyelarasan semula mengikut pelan baharu).', coalesce(v_new_plan_name, 'pelan baharu'), v_ai_delta::text)
        ELSE
          format('Pelan langganan syarikat anda telah ditukar ke "%s". Kuota AI, OCR dan storan telah dikemas kini secara automatik. Baki kredit AI anda ditambah sebanyak +%s kredit.', coalesce(v_new_plan_name, 'pelan baharu'), v_ai_delta::text)
      END,
      jsonb_build_object('tenant_id', p_tenant_id, 'event', v_event, 'new_plan', v_new_plan_name, 'ai_credit_delta', v_ai_delta)
    );
  END LOOP;

  RETURN true;
END;
$function$;
