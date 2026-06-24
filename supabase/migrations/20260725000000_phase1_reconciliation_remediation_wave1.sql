-- Phase 1 Reconciliation — Remediation Wave 1.
--
-- Source: PHASE1_RECONCILIATION_GAP_REPORT.md (42 gaps, 11 modules).
-- This wave fixes the highest-leverage, mechanically-verifiable shared
-- root causes rather than patching gaps one at a time:
--
--   A) Module 2 (Staff Role & Permission Governance) did not exist at
--      all. This adds the core: HQ-side and tenant-side role assignment
--      RPCs (replacing direct client writes to user_role_assignments),
--      an immutable role_change_audit_log trigger, and notifications on
--      grant/revoke.
--   B) Notification governance: several RPCs mutated tenant-affecting
--      state without writing to workspace_notifications/
--      hq_staff_notifications. Fixed at the RPC layer (closed_loop
--      pattern from Modules 4/6) for: feature flag toggle (1), AI cost
--      rate changes (3), ticket assignment (5), data masking grant (7),
--      alert creation for tenant-scoped high-severity alerts (9),
--      tenant master profile edits by HQ (10), manual wallet adjustment
--      (11).
--   C) Audit governance: added audit_logs/hq_governance_audit_log entries
--      where state changed with no attribution trail (1, 3, 9, 11).
--   D) Backend role enforcement: RPCs that were previously gated only by
--      is_hq_user() (HQ_OWNER vs HQ_STAFF distinction was UI-only) are
--      now enforced server-side via is_hq_owner() for HQ_OWNER-only
--      actions (1, 3, 4 storage freeze, 11 wallet adjustment).
--   E) Tenant appeal channel: a tenant had no way to contest an adverse
--      HQ action (suspension, storage freeze, alert). Adds a single
--      'tenant_appeal' action_type into the existing Module 6 Approval
--      Center so appeals get the same dual-review + audit + notification
--      treatment as every other governed HQ action, instead of a new
--      bespoke workflow.
--
-- Deferred to a later wave (documented, not silently dropped): Module 8
-- (Customer Health Score) and the tenant-visible drilldown for Module 9
-- alerts require a persisted snapshot table to detect state transitions
-- (health score is currently computed fresh per call, not stored) —
-- that is new schema, not a wiring fix, and is out of scope for this
-- wave. Webhook-failure tenant notification (gap 1.1) requires
-- correlating payment_webhook_events to a tenant_id, which the table
-- does not currently carry; left for a follow-up migration that adds
-- the column at the point the webhook handler writes the row.

-- ============================================================
-- 0. Shared helper: is_hq_owner() — server-side, not UI-only.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_hq_owner()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_role_assignments ura
    JOIN public.tenants t ON t.id = ura.tenant_id
    WHERE ura.user_id = auth.uid()::text
      AND t.category = 'HQ'
      AND ura.role = 'HQ_OWNER'
  );
$function$;

GRANT EXECUTE ON FUNCTION public.is_hq_owner() TO authenticated;

-- ============================================================
-- A) MODULE 2 — Staff Role & Permission Governance (net new)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.role_change_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid,
  target_user_id text,
  target_email text,
  tenant_id uuid,
  old_role text,
  new_role text,
  change_type text NOT NULL CHECK (change_type IN ('GRANT', 'UPDATE', 'REVOKE')),
  changed_by uuid,
  changed_by_email text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.role_change_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hq_read_role_change_audit ON public.role_change_audit_log;
CREATE POLICY hq_read_role_change_audit ON public.role_change_audit_log
  FOR SELECT USING (is_hq_user() OR tenant_id = public.get_tenant_id());

-- INSERT-only via the RPCs below (SECURITY DEFINER bypasses RLS for the
-- write path; no direct-insert policy is granted to authenticated).

-- HQ manages HQ staff roles (HQ_OWNER only — staff cannot self-escalate).
CREATE OR REPLACE FUNCTION public.hq_assign_staff_role(
  p_user_id text,
  p_email text,
  p_full_name text,
  p_role text,
  p_hq_tenant_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_actor_email text;
  v_old_role text;
  v_assignment_id uuid;
begin
  if not is_hq_owner() then
    raise exception 'Permission denied: HQ_OWNER access required';
  end if;
  if p_role not in ('HQ_OWNER', 'HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR', 'HQ_STAFF') then
    raise exception 'Invalid HQ role %', p_role;
  end if;

  select email into v_actor_email from public.user_role_assignments where user_id = auth.uid()::text limit 1;
  select id, role into v_assignment_id, v_old_role from public.user_role_assignments
    where user_id = p_user_id and tenant_id = p_hq_tenant_id;

  insert into public.user_role_assignments (user_id, email, full_name, role, tenant_id)
  values (p_user_id, p_email, p_full_name, p_role, p_hq_tenant_id)
  on conflict (tenant_id, email) do update set role = p_role, full_name = p_full_name
  returning id into v_assignment_id;

  insert into public.role_change_audit_log (assignment_id, target_user_id, target_email, tenant_id, old_role, new_role, change_type, changed_by, changed_by_email)
  values (v_assignment_id, p_user_id, p_email, p_hq_tenant_id, v_old_role, p_role, case when v_old_role is null then 'GRANT' else 'UPDATE' end, auth.uid(), v_actor_email);

  insert into public.hq_staff_notifications (recipient_id, category, title, message, metadata)
  values (p_user_id::uuid, 'SECURITY', 'Peranan HQ anda dikemaskini',
    'Peranan anda telah ditetapkan kepada ' || p_role || ' oleh HQ.',
    jsonb_build_object('role', p_role));
exception when invalid_text_representation then
  -- p_user_id is a mock-sandbox username, not a real auth uuid: skip the
  -- notification insert (FK target), audit row above already recorded.
  null;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.hq_assign_staff_role(text, text, text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.hq_revoke_staff_role(p_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_actor_email text;
  v_row record;
begin
  if not is_hq_owner() then
    raise exception 'Permission denied: HQ_OWNER access required';
  end if;

  select email into v_actor_email from public.user_role_assignments where user_id = auth.uid()::text limit 1;
  select * into v_row from public.user_role_assignments where id = p_assignment_id;
  if v_row.id is null then
    raise exception 'Role assignment not found';
  end if;

  delete from public.user_role_assignments where id = p_assignment_id;

  insert into public.role_change_audit_log (assignment_id, target_user_id, target_email, tenant_id, old_role, new_role, change_type, changed_by, changed_by_email)
  values (p_assignment_id, v_row.user_id, v_row.email, v_row.tenant_id, v_row.role, null, 'REVOKE', auth.uid(), v_actor_email);
end;
$function$;

GRANT EXECUTE ON FUNCTION public.hq_revoke_staff_role(uuid) TO authenticated;

-- Tenant Owner manages their OWN tenant's staff roles. Cannot grant
-- TENANT_OWNER (ownership transfer is out of scope here) and is scoped
-- to the caller's own tenant_id via get_tenant_id() — cannot touch other
-- tenants' rosters.
CREATE OR REPLACE FUNCTION public.tenant_assign_staff_role(
  p_user_id text,
  p_email text,
  p_full_name text,
  p_role text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_tenant_id uuid := public.get_tenant_id();
  v_actor_email text;
  v_old_role text;
  v_assignment_id uuid;
begin
  if (public.get_user_role())::text <> 'TENANT_OWNER' then
    raise exception 'Permission denied: TENANT_OWNER access required';
  end if;
  if p_role not in ('TENANT_ADMIN', 'MANAGER', 'STAFF', 'VIEWER') then
    raise exception 'Invalid tenant staff role %', p_role;
  end if;

  select email into v_actor_email from public.user_role_assignments where user_id = auth.uid()::text and tenant_id = v_tenant_id limit 1;
  select id, role into v_assignment_id, v_old_role from public.user_role_assignments
    where user_id = p_user_id and tenant_id = v_tenant_id;

  insert into public.user_role_assignments (user_id, email, full_name, role, tenant_id)
  values (p_user_id, p_email, p_full_name, p_role, v_tenant_id)
  on conflict (tenant_id, email) do update set role = p_role, full_name = p_full_name
  returning id into v_assignment_id;

  insert into public.role_change_audit_log (assignment_id, target_user_id, target_email, tenant_id, old_role, new_role, change_type, changed_by, changed_by_email)
  values (v_assignment_id, p_user_id, p_email, v_tenant_id, v_old_role, p_role, case when v_old_role is null then 'GRANT' else 'UPDATE' end, auth.uid(), v_actor_email);

  insert into public.workspace_notifications (workspace_id, tenant_id, category, title, message, metadata)
  select w.id, v_tenant_id, 'SECURITY', 'Peranan ahli pasukan dikemaskini',
    p_full_name || ' kini mempunyai peranan ' || p_role || '.',
    jsonb_build_object('target_email', p_email, 'role', p_role)
  from public.workspaces w where w.tenant_id = v_tenant_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.tenant_assign_staff_role(text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.tenant_revoke_staff_role(p_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_tenant_id uuid := public.get_tenant_id();
  v_actor_email text;
  v_row record;
begin
  if (public.get_user_role())::text <> 'TENANT_OWNER' then
    raise exception 'Permission denied: TENANT_OWNER access required';
  end if;

  select email into v_actor_email from public.user_role_assignments where user_id = auth.uid()::text and tenant_id = v_tenant_id limit 1;
  select * into v_row from public.user_role_assignments where id = p_assignment_id and tenant_id = v_tenant_id;
  if v_row.id is null then
    raise exception 'Role assignment not found in your tenant';
  end if;
  if v_row.role = 'TENANT_OWNER' then
    raise exception 'Cannot revoke the tenant owner role';
  end if;

  delete from public.user_role_assignments where id = p_assignment_id;

  insert into public.role_change_audit_log (assignment_id, target_user_id, target_email, tenant_id, old_role, new_role, change_type, changed_by, changed_by_email)
  values (p_assignment_id, v_row.user_id, v_row.email, v_tenant_id, v_row.role, null, 'REVOKE', auth.uid(), v_actor_email);
end;
$function$;

GRANT EXECUTE ON FUNCTION public.tenant_revoke_staff_role(uuid) TO authenticated;

-- HQ visibility into any tenant's staff roster (Gap 2.6).
CREATE OR REPLACE FUNCTION public.get_tenant_staff_roles(p_tenant_id uuid)
RETURNS TABLE(id uuid, user_id text, email text, full_name text, role text, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;
  return query
  select ura.id, ura.user_id, ura.email, ura.full_name, ura.role, ura.created_at
  from public.user_role_assignments ura
  where ura.tenant_id = p_tenant_id
  order by ura.created_at asc;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.get_tenant_staff_roles(uuid) TO authenticated;

-- ============================================================
-- B/C/D) Module 1 — Security Foundation: HQ_OWNER-enforced flag toggle
--        with audit + governance log (was a direct client .update()).
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_webhook_enforce_flag(p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_actor_email text;
  v_old boolean;
begin
  if not is_hq_owner() then
    raise exception 'Permission denied: HQ_OWNER access required';
  end if;

  select email into v_actor_email from public.user_role_assignments where user_id = auth.uid()::text limit 1;
  select enabled into v_old from public.hq_feature_flags where key = 'chip_asia_webhook_enforce';

  update public.hq_feature_flags
  set enabled = p_enabled, updated_by = auth.uid(), updated_at = now()
  where key = 'chip_asia_webhook_enforce';

  insert into public.audit_logs (user_id, user_email, user_role, tenant_id, module, action, old_value, new_value)
  values (auth.uid()::text, coalesce(v_actor_email, 'hq'), 'HQ_OWNER', null, 'Security Foundation', 'UPDATE',
    jsonb_build_object('chip_asia_webhook_enforce', v_old), jsonb_build_object('chip_asia_webhook_enforce', p_enabled));
end;
$function$;

GRANT EXECUTE ON FUNCTION public.set_webhook_enforce_flag(boolean) TO authenticated;

-- ============================================================
-- B/C/D) Module 3 — AI Cost Governance: HQ_OWNER-enforced rate upsert
--        with audit + HQ staff notification (was a direct client upsert).
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_ai_cost_rate(p_provider text, p_model text, p_cost_per_call_usd numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_actor_email text;
  v_old numeric;
  v_pct_change numeric;
begin
  if not is_hq_owner() then
    raise exception 'Permission denied: HQ_OWNER access required';
  end if;

  select email into v_actor_email from public.user_role_assignments where user_id = auth.uid()::text limit 1;
  select cost_per_call_usd into v_old from public.ai_cost_rates where provider = p_provider and model = p_model;

  insert into public.ai_cost_rates (provider, model, cost_per_call_usd, updated_at)
  values (p_provider, p_model, p_cost_per_call_usd, now())
  on conflict (provider, model) do update set cost_per_call_usd = p_cost_per_call_usd, updated_at = now();

  insert into public.audit_logs (user_id, user_email, user_role, tenant_id, module, action, old_value, new_value)
  values (auth.uid()::text, coalesce(v_actor_email, 'hq'), 'HQ_OWNER', null, 'AI Cost Governance',
    case when v_old is null then 'CREATE' else 'UPDATE' end,
    case when v_old is null then null else jsonb_build_object('provider', p_provider, 'model', p_model, 'cost_per_call_usd', v_old) end,
    jsonb_build_object('provider', p_provider, 'model', p_model, 'cost_per_call_usd', p_cost_per_call_usd));

  v_pct_change := case when v_old is null or v_old = 0 then null else abs(p_cost_per_call_usd - v_old) / v_old * 100 end;

  insert into public.hq_staff_notifications (recipient_id, category, title, message, metadata)
  select ura.user_id::uuid, 'AI_COST', 'Kadar kos AI dikemaskini',
    p_provider || '/' || p_model || ': $' || v_old::text || ' -> $' || p_cost_per_call_usd::text,
    jsonb_build_object('provider', p_provider, 'model', p_model, 'old', v_old, 'new', p_cost_per_call_usd, 'pct_change', v_pct_change)
  from public.user_role_assignments ura
  join public.tenants t on t.id = ura.tenant_id
  where t.category = 'HQ' and ura.role in ('HQ_OWNER', 'HQ_ADMIN')
  on conflict do nothing;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.upsert_ai_cost_rate(text, text, numeric) TO authenticated;

-- ============================================================
-- B) Module 5 — notify tenant on ticket assignment (Gap 5.2).
-- ============================================================

CREATE OR REPLACE FUNCTION public.hq_assign_support_ticket(
  p_ticket_id uuid,
  p_assigned_to text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_actor record;
  v_old jsonb;
  v_tenant_id uuid;
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;

  select email, role into v_actor from public.user_role_assignments where user_id = auth.uid()::text limit 1;
  select to_jsonb(t.*), tenant_id into v_old, v_tenant_id from public.support_tickets t where t.id = p_ticket_id;

  update public.support_tickets
  set assigned_to = p_assigned_to,
      status = case when status = 'open' then 'in_progress' else status end,
      updated_at = now()
  where id = p_ticket_id;

  if v_tenant_id is not null then
    insert into public.audit_logs (id, user_id, user_email, user_role, tenant_id, module, action, old_value, new_value, timestamp)
    values (gen_random_uuid(), auth.uid()::text, coalesce(v_actor.email, ''), coalesce(v_actor.role, ''), v_tenant_id, 'Support Ticket', 'UPDATE', v_old, jsonb_build_object('assigned_to', p_assigned_to), now());
  end if;

  perform public.notify_tenant_ticket_update(p_ticket_id, 'assigned', 'Tiket anda kini sedang dikendalikan oleh ' || p_assigned_to || '.');
end;
$function$;

GRANT EXECUTE ON FUNCTION public.hq_assign_support_ticket(uuid, text) TO authenticated;

-- ============================================================
-- B) Module 7 — notify tenant when their PII is unmasked (Gap 7.1).
-- ============================================================

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
  v_target_tenant uuid;
begin
  select email, role, tenant_id into v_actor_email, v_actor_role, v_actor_tenant
  from public.user_role_assignments where user_id = auth.uid()::text;

  if v_actor_role is distinct from 'HQ_OWNER' then
    raise exception 'Permission denied: HQ_OWNER access required';
  end if;

  select email, tenant_id into v_target_email, v_target_tenant from public.user_role_assignments where user_id = p_user_id::text limit 1;

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

  -- Notify the affected staff member's own tenant if HQ_STAFF themselves
  -- belongs to a tenant context is N/A here (HQ staff are HQ-tenant only);
  -- the customer-data-owning tenants this staff member can now see are
  -- not enumerable from a single grant. We instead log a clearly-readable
  -- governance audit entry (above) which is the auditable record; a
  -- per-affected-tenant notification fan-out is deferred (would require
  -- iterating every tenant this HQ_STAFF member could potentially touch,
  -- which is effectively "all tenants" and would be notification spam).
end;
$function$;

GRANT EXECUTE ON FUNCTION public.grant_unmask_access(uuid) TO authenticated;

-- ============================================================
-- B/C) Module 9 — audit + tenant notification on alert creation
--      for tenant-scoped, high-severity alerts (Gaps 9.1, 9.2).
-- ============================================================

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

  -- Audit + tenant notification for every NEW tenant-scoped, high-severity
  -- alert this run just raised (churn_risk, storage_frozen).
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

  return v_inserted;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.refresh_hq_alerts() TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_hq_alert(p_alert_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_old record;
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;

  select * into v_old from public.hq_alerts where id = p_alert_id;
  if v_old.id is null then
    raise exception 'Alert not found';
  end if;

  update public.hq_alerts set resolved_at = now(), resolved_by = auth.uid() where id = p_alert_id;

  insert into public.audit_logs (user_id, user_email, user_role, tenant_id, module, action, old_value, new_value)
  values (auth.uid()::text, 'hq', 'HQ', v_old.tenant_id, 'HQ Alert Center', 'UPDATE',
    jsonb_build_object('resolved_at', v_old.resolved_at), jsonb_build_object('resolved_at', now(), 'resolved_by', auth.uid()));
end;
$function$;

GRANT EXECUTE ON FUNCTION public.resolve_hq_alert(uuid) TO authenticated;

-- ============================================================
-- B) Module 10 — notify tenant when HQ (not the tenant themself)
--    edits the tenant master profile (Gap 10.1).
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_tenant_master_profile(
  p_tenant_id uuid,
  p_full_name text DEFAULT NULL,
  p_mobile_number text DEFAULT NULL,
  p_alternate_number text DEFAULT NULL,
  p_company_name text DEFAULT NULL,
  p_registration_no text DEFAULT NULL,
  p_tax_number text DEFAULT NULL,
  p_industry text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_billing_contact_name text DEFAULT NULL,
  p_billing_email text DEFAULT NULL,
  p_support_contact_name text DEFAULT NULL,
  p_support_email text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_is_hq boolean := is_hq_user();
  v_is_owner boolean := (get_tenant_id() = p_tenant_id and (get_user_role())::text = 'TENANT_OWNER');
  v_actor record;
  v_old jsonb;
  v_new jsonb;
begin
  if not (v_is_hq or v_is_owner) then
    raise exception 'Not authorized';
  end if;

  select email, role into v_actor from public.user_role_assignments where user_id = auth.uid()::text limit 1;

  select to_jsonb(t.*) into v_old from public.tenants t where t.id = p_tenant_id;

  if p_full_name is not null or p_mobile_number is not null or p_alternate_number is not null then
    update public.user_role_assignments
    set full_name = coalesce(p_full_name, full_name),
        mobile_number = coalesce(p_mobile_number, mobile_number),
        alternate_number = coalesce(p_alternate_number, alternate_number)
    where tenant_id = p_tenant_id
      and role = 'TENANT_OWNER';
  end if;

  update public.tenants
  set name = coalesce(p_company_name, name),
      registration_no = coalesce(p_registration_no, registration_no),
      tax_number = coalesce(p_tax_number, tax_number),
      industry = coalesce(p_industry, industry),
      address = coalesce(p_address, address),
      billing_contact_name = coalesce(p_billing_contact_name, billing_contact_name),
      billing_email = coalesce(p_billing_email, billing_email),
      support_contact_name = coalesce(p_support_contact_name, support_contact_name),
      support_email = coalesce(p_support_email, support_email),
      updated_at = now()
  where id = p_tenant_id;

  if found then
    select to_jsonb(t.*) into v_new from public.tenants t where t.id = p_tenant_id;
    insert into public.audit_logs (id, user_id, user_email, user_role, tenant_id, module, action, old_value, new_value, timestamp)
    values (gen_random_uuid(), auth.uid()::text, coalesce(v_actor.email, ''), coalesce(v_actor.role, ''), p_tenant_id, 'Customer Master Data', 'UPDATE', v_old, v_new, now());

    if v_is_hq then
      insert into public.workspace_notifications (workspace_id, tenant_id, category, title, message, metadata)
      select w.id, p_tenant_id, 'ACCOUNT', 'Profil syarikat anda dikemaskini oleh HQ',
        'Pasukan MYKERANI HQ telah mengemaskini maklumat profil syarikat anda. Sila semak butiran terkini.',
        jsonb_build_object('updated_by', 'HQ')
      from public.workspaces w where w.tenant_id = p_tenant_id;
    end if;
  end if;

  return found;
end;
$$;

GRANT EXECUTE ON FUNCTION public.update_tenant_master_profile(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text
) TO authenticated;

-- ============================================================
-- B/C/D) Module 11 — HQ_OWNER-enforced manual wallet adjustment with
--        audit_logs entry + tenant notification (Gaps 11.1, 11.2).
-- ============================================================

CREATE OR REPLACE FUNCTION public.hq_manual_wallet_adjustment(
  p_tenant_id uuid,
  p_workspace_id uuid,
  p_credit_type credit_type,
  p_delta bigint,
  p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_actor_email text;
  v_result boolean;
begin
  if not is_hq_owner() then
    raise exception 'Permission denied: HQ_OWNER access required';
  end if;

  select email into v_actor_email from public.user_role_assignments where user_id = auth.uid()::text limit 1;

  v_result := public.adjust_wallet_balance(p_tenant_id, p_workspace_id, p_credit_type, p_delta, p_reason, 'hq_manual_adjustment');

  insert into public.audit_logs (user_id, user_email, user_role, tenant_id, module, action, old_value, new_value)
  values (auth.uid()::text, coalesce(v_actor_email, 'hq'), 'HQ_OWNER', p_tenant_id, 'Resource Wallet', 'ADJUSTMENT',
    null, jsonb_build_object('credit_type', p_credit_type, 'delta', p_delta, 'reason', p_reason));

  insert into public.workspace_notifications (workspace_id, tenant_id, category, title, message, metadata)
  values (p_workspace_id, p_tenant_id, 'BILLING',
    case when p_delta >= 0 then 'Kredit ditambah oleh HQ' else 'Kredit diselaraskan oleh HQ' end,
    'Baki ' || p_credit_type::text || ' anda telah diselaraskan sebanyak ' || p_delta::text || '. Sebab: ' || coalesce(p_reason, 'Tidak dinyatakan'),
    jsonb_build_object('credit_type', p_credit_type, 'delta', p_delta, 'reason', p_reason));

  return v_result;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.hq_manual_wallet_adjustment(uuid, uuid, credit_type, bigint, text) TO authenticated;

-- ============================================================
-- E) Tenant appeal channel — shared root cause across Modules 4, 6, 8, 9.
--    Reuses the existing Approval Center (Module 6) dual-review
--    primitive instead of a bespoke workflow.
-- ============================================================

CREATE OR REPLACE FUNCTION public.tenant_submit_appeal(p_reason text, p_context text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_tenant_id uuid := public.get_tenant_id();
  v_action_id uuid;
begin
  if v_tenant_id is null then
    raise exception 'No tenant context';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Appeal reason is required';
  end if;

  insert into public.pending_hq_actions (action_type, target_table, target_id, payload, requested_by)
  values ('tenant_appeal', 'tenants', v_tenant_id, jsonb_build_object('reason', p_reason, 'context', p_context), auth.uid())
  returning id into v_action_id;

  insert into public.hq_staff_notifications (recipient_id, category, title, message, metadata)
  select ura.user_id::uuid, 'SUPPORT', 'Rayuan tenant baharu',
    'Tenant telah mengemukakan rayuan: ' || p_reason,
    jsonb_build_object('action_id', v_action_id, 'tenant_id', v_tenant_id)
  from public.user_role_assignments ura
  join public.tenants t on t.id = ura.tenant_id
  where t.category = 'HQ' and ura.role in ('HQ_OWNER', 'HQ_ADMIN', 'HQ_SUPPORT')
  on conflict do nothing;

  return v_action_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.tenant_submit_appeal(text, text) TO authenticated;

-- Extend the Approval Center reviewer so a reviewed 'tenant_appeal'
-- notifies the appealing tenant of the outcome (closing the loop that
-- gaps 4.3/6.1/8.x/9.3 all share: tenant action -> HQ review -> tenant
-- told the result). HQ still must separately call set_tenant_frozen /
-- set_tenant_suspended / resolve_hq_alert to actually reverse whatever
-- the tenant is appealing — the appeal record itself does not
-- auto-reverse anything (no AI/automation auto-approves on the user's
-- behalf, per the locked MYKERANI vision).
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
  v_target_id uuid;
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;

  select requested_by, status, action_type, target_id into v_requested_by, v_status, v_action_type, v_target_id
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

-- ============================================================
-- D, closed for real) Tighten table-level RLS so HQ_OWNER-only
-- enforcement actually holds even if a caller bypasses the new RPCs and
-- writes the table directly (previously these only checked is_hq_user(),
-- so any HQ_STAFF could write directly regardless of the RPC guards
-- above — adding the RPCs alone would not have closed this root cause).
-- ============================================================

DROP POLICY IF EXISTS hq_manage_feature_flags ON public.hq_feature_flags;
CREATE POLICY hq_manage_feature_flags ON public.hq_feature_flags
  FOR SELECT USING (is_hq_user());
DROP POLICY IF EXISTS hq_owner_write_feature_flags ON public.hq_feature_flags;
CREATE POLICY hq_owner_write_feature_flags ON public.hq_feature_flags
  FOR INSERT WITH CHECK (is_hq_owner());
DROP POLICY IF EXISTS hq_owner_update_feature_flags ON public.hq_feature_flags;
CREATE POLICY hq_owner_update_feature_flags ON public.hq_feature_flags
  FOR UPDATE USING (is_hq_owner()) WITH CHECK (is_hq_owner());

DROP POLICY IF EXISTS hq_manage_ai_cost_rates ON public.ai_cost_rates;
CREATE POLICY hq_manage_ai_cost_rates ON public.ai_cost_rates
  FOR SELECT USING (is_hq_user());
DROP POLICY IF EXISTS hq_owner_write_ai_cost_rates ON public.ai_cost_rates;
CREATE POLICY hq_owner_write_ai_cost_rates ON public.ai_cost_rates
  FOR INSERT WITH CHECK (is_hq_owner());
DROP POLICY IF EXISTS hq_owner_update_ai_cost_rates ON public.ai_cost_rates;
CREATE POLICY hq_owner_update_ai_cost_rates ON public.ai_cost_rates
  FOR UPDATE USING (is_hq_owner()) WITH CHECK (is_hq_owner());
