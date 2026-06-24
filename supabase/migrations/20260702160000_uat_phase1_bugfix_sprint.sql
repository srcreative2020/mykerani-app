-- HQ Foundation UAT Phase 1 — Bug Fix Sprint.
-- Fixes only the 6 failures found during live UAT against production. No new
-- modules, no redesign, no architecture changes.

-- ============================================================
-- PRIORITY 1 (STOP CLASS): get_hq_customer_health_scores()
-- Bug: bare "tenant_id" column references inside the CTEs collided with the
-- RETURNS TABLE OUT parameter of the same name, causing
-- "ERROR 42702: column reference tenant_id is ambiguous" on every call.
-- Fix: qualify the column with its CTE alias at both reference points.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_hq_customer_health_scores()
RETURNS TABLE(
  tenant_id uuid,
  score integer,
  risk_level text,
  reasons text[]
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
  with signals as (
    select
      t.id as tenant_id,
      coalesce(sub.status, 'trialing') as sub_status,
      coalesce(s.is_frozen, false) as is_frozen,
      s.last_active_at,
      coalesce(ai.recent_calls, 0) as recent_calls,
      coalesce(ai.prior_calls, 0) as prior_calls,
      coalesce(tix.open_tickets, 0) as open_tickets
    from public.tenants t
    left join public.tenant_subscriptions sub on sub.tenant_id = t.id
    left join public.workspace_storage_state s on s.tenant_id = t.id
    left join (
      select l.tenant_id,
        count(*) filter (where l.created_at >= now() - interval '30 days') as recent_calls,
        count(*) filter (where l.created_at >= now() - interval '60 days' and l.created_at < now() - interval '30 days') as prior_calls
      from public.ai_usage_log l group by l.tenant_id
    ) ai on ai.tenant_id = t.id
    left join (
      select customer_name, count(*) as open_tickets
      from public.support_tickets where status in ('open', 'pending')
      group by customer_name
    ) tix on tix.customer_name = t.name
    where t.category = 'USER'
  ),
  scored as (
    select
      signals.tenant_id,
      (100
        - case when sub_status = 'suspended' then 50 else 0 end
        - case when is_frozen then 30 else 0 end
        - case when last_active_at is not null and last_active_at < now() - interval '14 days' then 15
               when last_active_at is null then 10 else 0 end
        - case when recent_calls = 0 and prior_calls > 0 then 15
               when prior_calls > 0 and recent_calls < prior_calls / 2 then 8 else 0 end
        - least(open_tickets * 5, 20)
      ) as raw_score,
      array_remove(array[
        case when sub_status = 'suspended' then 'Akaun digantung' else null end,
        case when is_frozen then 'Storan dibekukan' else null end,
        case when last_active_at is not null and last_active_at < now() - interval '14 days' then 'Tidak aktif > 14 hari'
             when last_active_at is null then 'Tiada rekod aktiviti' else null end,
        case when recent_calls = 0 and prior_calls > 0 then 'Penggunaan AI terhenti'
             when prior_calls > 0 and recent_calls < prior_calls / 2 then 'Penggunaan AI menurun' else null end,
        case when open_tickets > 0 then open_tickets || ' tiket sokongan terbuka' else null end
      ], null) as reasons
    from signals
  )
  select
    scored.tenant_id,
    greatest(least(raw_score, 100), 0)::integer as score,
    case
      when greatest(least(raw_score, 100), 0) < 50 then 'high'
      when greatest(least(raw_score, 100), 0) < 75 then 'medium'
      else 'low'
    end as risk_level,
    scored.reasons
  from scored
  order by score asc;
end;
$function$;

-- ============================================================
-- PRIORITY 2: refresh_hq_alerts()
-- No code defect here — it failed purely because it calls the broken
-- function above (churn_risk block aborted the whole transaction before
-- reaching storage_frozen/webhook_failed). With Priority 1 fixed, this
-- function is restored as-is. Re-declared (CREATE OR REPLACE, identical
-- body) only to extend it with the new storage_warning alert type for
-- Priority 6 below.
-- ============================================================

-- ============================================================
-- PRIORITY 3: Data Masking Governance UI
-- Bug: toggleStaffUnmask() existed in the UI component but had zero call
-- sites and no way to see which HQ staff exist. Adds the one missing piece:
-- a real RPC HQ_OWNER can use to list HQ staff + their current grant state.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_hq_staff_users()
RETURNS TABLE(
  user_id text,
  email character varying,
  full_name character varying,
  role character varying,
  unmask_granted boolean
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
    ura.user_id,
    ura.email,
    ura.full_name,
    ura.role,
    (g.user_id is not null) as unmask_granted
  from public.user_role_assignments ura
  join public.tenants t on t.id = ura.tenant_id
  left join public.hq_data_masking_grants g on g.user_id = ura.user_id::uuid
  where t.category = 'HQ'
  order by ura.role, ura.full_name;
end;
$function$;

-- ============================================================
-- PRIORITY 4: Tenant Support Ticket Creation
-- Bug: support_tickets had only an HQ-side ALL policy — no tenant could
-- create a ticket through any path. Adds a SECURITY DEFINER RPC that lets
-- an authenticated tenant user (owner or staff) file a ticket for their OWN
-- tenant only — customer_name/email are derived server-side from the
-- caller's own tenant record, so a tenant cannot spoof another tenant's
-- identity (no broad tenant-writable RLS policy needed on a table keyed by
-- free-text customer_name).
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_tenant_support_ticket(
  p_subject text,
  p_summary text,
  p_priority text DEFAULT 'medium'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_tenant_id uuid;
  v_tenant_name character varying;
  v_email character varying;
  v_id uuid;
begin
  select ura.tenant_id, ura.email into v_tenant_id, v_email
  from public.user_role_assignments ura
  where ura.user_id = auth.uid()::text
  limit 1;

  if v_tenant_id is null then
    raise exception 'No tenant membership found for current user';
  end if;

  select name into v_tenant_name from public.tenants where id = v_tenant_id;

  if p_priority not in ('high', 'medium', 'low') then
    p_priority := 'medium';
  end if;

  insert into public.support_tickets (customer_name, customer_email, subject, priority, status, summary, created_by)
  values (v_tenant_name, v_email, p_subject, p_priority, 'open', p_summary, auth.uid()::uuid)
  returning id into v_id;

  return v_id;
end;
$function$;

DROP POLICY IF EXISTS tenant_create_own_support_ticket ON public.support_tickets;
CREATE POLICY tenant_create_own_support_ticket ON public.support_tickets
  FOR INSERT WITH CHECK (false);
-- Direct table INSERT stays closed for tenants (false): all tenant-side
-- ticket creation goes through create_tenant_support_ticket() above, which
-- runs SECURITY DEFINER and enforces the caller can only file for their own
-- tenant. This avoids opening a free-text customer_name column to arbitrary
-- tenant-writable INSERT.

-- ============================================================
-- PRIORITY 5: AI Cost Governance wiring into Wallet Dashboard
-- Bug: Resource Wallet Dashboard (Module 11) had no AI cost figures at all;
-- AI Cost Governance (Module 3) was rendered on a separate page with no
-- shared data. Fix: get_hq_resource_wallet_summary() now also returns
-- ai_cost_usd_30d, computed from the SAME ai_usage_log.cost_usd column that
-- get_hq_ai_cost_summary() reads — single source of truth, no duplicated
-- cost calculation logic.
-- ============================================================
DROP FUNCTION IF EXISTS public.get_hq_resource_wallet_summary();

CREATE OR REPLACE FUNCTION public.get_hq_resource_wallet_summary()
RETURNS TABLE(
  tenant_id uuid,
  tenant_name character varying,
  ai_credits_balance bigint,
  ocr_credits_balance bigint,
  notification_credits_balance bigint,
  storage_used_bytes bigint,
  storage_limit_bytes bigint,
  ai_consumed_30d bigint,
  ocr_consumed_30d bigint,
  ai_cost_usd_30d numeric
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
    w.tenant_id,
    t.name,
    sum(w.ai_credits_balance)::bigint,
    sum(w.ocr_credits_balance)::bigint,
    sum(w.notification_credits_balance)::bigint,
    sum(w.storage_used_bytes)::bigint,
    sum(w.storage_limit_bytes)::bigint,
    coalesce((
      select sum(-tx.amount) from public.resource_wallet_transactions tx
      where tx.wallet_id in (select id from public.resource_wallets where tenant_id = w.tenant_id)
        and tx.credit_type = 'AI' and tx.amount < 0 and tx.created_at >= now() - interval '30 days'
    ), 0)::bigint,
    coalesce((
      select sum(-tx.amount) from public.resource_wallet_transactions tx
      where tx.wallet_id in (select id from public.resource_wallets where tenant_id = w.tenant_id)
        and tx.credit_type = 'OCR' and tx.amount < 0 and tx.created_at >= now() - interval '30 days'
    ), 0)::bigint,
    coalesce((
      select sum(l.cost_usd) from public.ai_usage_log l
      where l.tenant_id = w.tenant_id and l.created_at >= now() - interval '30 days'
    ), 0)::numeric
  from public.resource_wallets w
  join public.tenants t on t.id = w.tenant_id
  group by w.tenant_id, t.name
  order by t.name;
end;
$function$;

-- ============================================================
-- PRIORITY 6: Storage warning threshold from DB
-- Bug: the 90% storage-usage warning was computed from a per-browser
-- localStorage key, not from real data. Fix: refresh_hq_alerts() gains a
-- storage_warning block computed from get_all_workspaces_storage_usage()
-- (real evidence_documents byte totals, already used by getCustomers())
-- versus the tenant's actual plan allowance
-- (subscription_plans.storage_credits_allowance_mb), at a 90% threshold.
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
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;

  -- High churn-risk customers (Module 8 health scores)
  insert into public.hq_alerts (alert_type, severity, tenant_id, message)
  select 'churn_risk', 'high', h.tenant_id,
    'Skor kesihatan rendah (' || h.score || '): ' || array_to_string(h.reasons, ', ')
  from public.get_hq_customer_health_scores() h
  where h.risk_level = 'high'
    and not exists (
      select 1 from public.hq_alerts a
      where a.alert_type = 'churn_risk' and a.tenant_id = h.tenant_id and a.resolved_at is null
    );
  get diagnostics v_rc = row_count;
  v_inserted := v_inserted + v_rc;

  -- Frozen storage
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

  -- High storage usage (>=90% of plan allowance), real bytes vs real plan limit
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

  -- Failed/rejected payment webhook events in the last 24h
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

  return v_inserted;
end;
$function$;
