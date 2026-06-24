-- HQ Foundation Module 9: HQ Alert Center.
-- buildHQNotifs() in src/lib/notifications.ts computed alerts client-side
-- from already-fetched data and stored them in localStorage keyed per HQ
-- user (`mykerani_notifs_<scopeId>`) — invisible across HQ staff, lost on
-- cache clear, and re-derived fresh (no persistent audit trail of what
-- fired when). This adds a real persistent, shared alert store with an
-- HQ-triggered (never autonomous) refresh that scans live signals already
-- computed elsewhere in this phase (customer health, storage freeze,
-- payment webhook failures) and raises de-duplicated alert rows.

CREATE TABLE IF NOT EXISTS public.hq_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('high', 'medium', 'low')),
  tenant_id uuid REFERENCES public.tenants(id),
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.hq_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hq_manage_alerts ON public.hq_alerts;
CREATE POLICY hq_manage_alerts ON public.hq_alerts
  FOR ALL USING (is_hq_user()) WITH CHECK (is_hq_user());

CREATE INDEX IF NOT EXISTS idx_hq_alerts_unresolved ON public.hq_alerts(alert_type, tenant_id) WHERE resolved_at IS NULL;

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
