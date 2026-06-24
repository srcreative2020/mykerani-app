-- HQ Phase 2 — net-new Module: HQ Activity Center.
--
-- Approved as a distinct Phase 2 module (not a rename/alias of HQ Alert
-- Center, which is an automated threshold-trigger system). Activity Center
-- is an HQ-wide aggregated feed of every governance-relevant action already
-- recorded across the ecosystem this session — audit_logs (tenant-scoped
-- mutations, readable HQ-wide per its existing RLS policy) and
-- hq_governance_audit_log (HQ-internal dual-approval decisions) — plus a
-- per-HQ-user "last seen" cursor so HQ staff can tell what's new since they
-- last looked. This module adds no new source of truth; it is a read/
-- visibility layer over sources that are already real and already audited.
--
-- HQ Impact: every HQ_OWNER/HQ_STAFF gets a single feed instead of having
-- to separately check Customer Operations, Billing, Storage, Staff, Data
-- Masking, Support — directly closes the "HQ visibility" validation item.
-- Tenant Impact: none — this is a pure HQ-side aggregation; every
-- underlying event already notified its tenant at the source (closed
-- earlier this session). Notification impact: HQ-internal only, via the
-- existing hq_staff_notifications table is not needed here (the feed model
-- is pull/unseen-count, not push). Audit impact: read-only, writes nothing
-- to audit_logs itself (would be circular). Resource/Billing impact: none.

CREATE TABLE IF NOT EXISTS public.hq_activity_views (
  user_id uuid PRIMARY KEY,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hq_activity_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hq_activity_views_own_row ON public.hq_activity_views;
CREATE POLICY hq_activity_views_own_row ON public.hq_activity_views
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.hq_activity_views TO authenticated;

-- Unified feed: audit_logs rows visible to HQ (per its existing select
-- policy: HQ_OWNER/HQ_STAFF see every tenant's mutations) unioned with
-- hq_governance_audit_log decisions. source_table lets the UI route to the
-- right detail context without guessing from module text.
CREATE OR REPLACE FUNCTION public.get_hq_activity_feed(p_limit integer DEFAULT 50)
RETURNS TABLE (
  source_table text,
  event_id uuid,
  occurred_at timestamptz,
  actor_email text,
  actor_role text,
  module text,
  action text,
  tenant_id uuid,
  detail jsonb
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
  select * from (
    select
      'audit_logs'::text as source_table,
      a.id as event_id,
      a.timestamp as occurred_at,
      a.user_email::text as actor_email,
      a.user_role::text as actor_role,
      a.module::text as module,
      a.action::text as action,
      a.tenant_id,
      jsonb_build_object('old_value', a.old_value, 'new_value', a.new_value) as detail
    from public.audit_logs a
    union all
    select
      'hq_governance_audit_log'::text as source_table,
      g.id as event_id,
      g.decided_at as occurred_at,
      ru.email::text as actor_email,
      'HQ'::text as actor_role,
      'HQ Approval Center'::text as module,
      g.decision::text as action,
      null::uuid as tenant_id,
      jsonb_build_object('action_type', g.action_type, 'target_table', g.target_table, 'target_id', g.target_id, 'review_note', g.review_note) as detail
    from public.hq_governance_audit_log g
    left join auth.users ru on ru.id = g.reviewed_by
  ) feed
  order by occurred_at desc
  limit coalesce(p_limit, 50);
end;
$function$;

GRANT EXECUTE ON FUNCTION public.get_hq_activity_feed(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_hq_activity_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;

  insert into public.hq_activity_views (user_id, last_seen_at)
  values (auth.uid(), now())
  on conflict (user_id) do update set last_seen_at = now();
end;
$function$;

GRANT EXECUTE ON FUNCTION public.mark_hq_activity_seen() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_hq_activity_unseen_count()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_last_seen timestamptz;
  v_count integer;
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;

  select last_seen_at into v_last_seen from public.hq_activity_views where user_id = auth.uid();

  if v_last_seen is null then
    select count(*) into v_count from public.audit_logs where "timestamp" > now() - interval '30 days';
    return v_count;
  end if;

  select
    (select count(*) from public.audit_logs where "timestamp" > v_last_seen)
    + (select count(*) from public.hq_governance_audit_log where decided_at > v_last_seen)
  into v_count;

  return v_count;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.get_hq_activity_unseen_count() TO authenticated;
