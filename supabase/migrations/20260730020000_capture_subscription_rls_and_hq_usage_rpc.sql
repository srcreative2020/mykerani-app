-- ============================================================================
-- Repository capture of production-only changes (migration-file drift fix).
-- These were already applied directly to the live database in an earlier
-- session but never committed as migration files — a disaster-recovery gap:
-- a fresh `/api/admin/db/initialize` run would not recreate them.
-- Idempotent; matches live schema exactly (verified via Supabase MCP).
-- ============================================================================

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hq_manage_subscription_plans ON public.subscription_plans;
CREATE POLICY hq_manage_subscription_plans ON public.subscription_plans
  FOR ALL TO authenticated
  USING (is_hq_user())
  WITH CHECK (is_hq_user());

DROP POLICY IF EXISTS authenticated_read_subscription_plans ON public.subscription_plans;
CREATE POLICY authenticated_read_subscription_plans ON public.subscription_plans
  FOR SELECT TO authenticated
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS hq_manage_tenant_subscriptions ON public.tenant_subscriptions;
CREATE POLICY hq_manage_tenant_subscriptions ON public.tenant_subscriptions
  FOR ALL TO authenticated
  USING (is_hq_user())
  WITH CHECK (is_hq_user());

DROP POLICY IF EXISTS tenant_read_own_subscription ON public.tenant_subscriptions;
CREATE POLICY tenant_read_own_subscription ON public.tenant_subscriptions
  FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id());

CREATE OR REPLACE FUNCTION public.get_hq_user_usage()
 RETURNS TABLE(user_id uuid, email text, full_name text, role text, tenant_id text, tenant_name text, ai_usage_count integer, is_suspended boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    p.id as user_id,
    p.email,
    p.full_name,
    p.role,
    p.tenant_id,
    t.name as tenant_name,
    coalesce(u.usage_count, 0)::int as ai_usage_count,
    p.is_suspended
  from public.profiles p
  left join public.tenants t on t.id::text = p.tenant_id
  left join (
    select user_id, count(*)::int as usage_count
    from public.ai_usage_log
    where created_at >= date_trunc('month', now())
    group by user_id
  ) u on u.user_id = p.id
  where is_hq_user();
$function$;
