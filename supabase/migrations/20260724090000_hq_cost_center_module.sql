-- HQ Phase 2 — net-new Module: HQ Cost Center.
--
-- Approved as a distinct Phase 2 module (not a rename/alias of AI Cost
-- Governance, which manages per-call AI cost *rates*, or Resource Wallet
-- Dashboard, which tracks per-tenant credit balances). Cost Center is a
-- platform-level financial summary for HQ: real AI spend (read from
-- ai_usage_log.cost_usd, the same column AI Cost Governance writes — reused
-- as a read-only data source, not reimplemented) blended with real
-- platform revenue (active tenant_subscriptions joined to
-- subscription_plans.monthly_price_myr) plus a new ledger for HQ's own
-- manually-entered operating costs (infra/hosting/vendor fees), which has
-- no existing source table anywhere in the schema.
--
-- Real Data Rule: margin is computed only from real rows — no fabricated
-- historical month buckets. AI cost is bucketed by ai_usage_log.created_at
-- (confirmed present). Revenue is today's active-subscription snapshot
-- (current MRR), not back-dated; the summary explicitly labels it as a
-- snapshot rather than implying audited historical monthly billing.
--
-- HQ Impact: gives HQ owners a real margin view (MRR vs AI cost vs
-- recorded operating cost) — the standing gap was that financial health
-- conversations had no operating-cost side at all. Tenant Impact: none —
-- entirely an HQ-internal platform financial summary; no tenant-scoped
-- table is touched. Notification impact: none (read/record module, not an
-- alerting one — HQ Alert Center already owns threshold-based alerting and
-- is explicitly not duplicated here). Audit impact: every operating-cost
-- entry write is audited. Resource/Billing impact: read-only against
-- billing data; writes nothing back to tenant_subscriptions/ai_usage_log.

CREATE TABLE IF NOT EXISTS public.hq_operating_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('infrastructure', 'vendor', 'staffing', 'marketing', 'other')),
  description text NOT NULL,
  amount_myr numeric NOT NULL CHECK (amount_myr >= 0),
  incurred_on date NOT NULL,
  recorded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hq_operating_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hq_manage_operating_costs ON public.hq_operating_costs;
CREATE POLICY hq_manage_operating_costs ON public.hq_operating_costs
  FOR ALL USING (is_hq_user()) WITH CHECK (is_hq_user());

GRANT SELECT, INSERT, DELETE ON public.hq_operating_costs TO authenticated;

CREATE OR REPLACE FUNCTION public.record_hq_operating_cost(
  p_category text, p_description text, p_amount_myr numeric, p_incurred_on date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_actor_email text;
  v_actor_role text;
  v_actor_tenant uuid;
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;

  insert into public.hq_operating_costs (category, description, amount_myr, incurred_on, recorded_by)
  values (p_category, p_description, p_amount_myr, p_incurred_on, auth.uid())
  returning id into v_id;

  select email, role, tenant_id into v_actor_email, v_actor_role, v_actor_tenant
  from public.user_role_assignments where user_id = auth.uid()::text and tenant_id in (
    select tenant_id from public.tenants where category = 'HQ'
  ) limit 1;

  insert into public.audit_logs (user_id, user_email, user_role, tenant_id, module, action, old_value, new_value)
  values (
    auth.uid()::text, coalesce(v_actor_email, 'hq'), coalesce(v_actor_role, 'HQ'), v_actor_tenant,
    'Cost Center', 'CREATE',
    null,
    jsonb_build_object('id', v_id, 'category', p_category, 'description', p_description, 'amount_myr', p_amount_myr, 'incurred_on', p_incurred_on)
  );

  return v_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.record_hq_operating_cost(text, text, numeric, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_hq_operating_cost(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_old record;
  v_actor_email text;
  v_actor_role text;
  v_actor_tenant uuid;
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;

  select * into v_old from public.hq_operating_costs where id = p_id;
  if v_old.id is null then
    raise exception 'Operating cost entry not found';
  end if;

  delete from public.hq_operating_costs where id = p_id;

  select email, role, tenant_id into v_actor_email, v_actor_role, v_actor_tenant
  from public.user_role_assignments where user_id = auth.uid()::text and tenant_id in (
    select tenant_id from public.tenants where category = 'HQ'
  ) limit 1;

  insert into public.audit_logs (user_id, user_email, user_role, tenant_id, module, action, old_value, new_value)
  values (
    auth.uid()::text, coalesce(v_actor_email, 'hq'), coalesce(v_actor_role, 'HQ'), v_actor_tenant,
    'Cost Center', 'DELETE',
    jsonb_build_object('id', v_old.id, 'category', v_old.category, 'description', v_old.description, 'amount_myr', v_old.amount_myr, 'incurred_on', v_old.incurred_on),
    null
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION public.delete_hq_operating_cost(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_hq_operating_costs(p_limit integer DEFAULT 100)
RETURNS SETOF public.hq_operating_costs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;
  return query select * from public.hq_operating_costs order by incurred_on desc limit coalesce(p_limit, 100);
end;
$function$;

GRANT EXECUTE ON FUNCTION public.get_hq_operating_costs(integer) TO authenticated;

-- Platform-level revenue/cost/margin summary. mrr_myr is a live snapshot of
-- active subscriptions (real, not fabricated history); ai_cost_usd_30d is
-- real spend from ai_usage_log over the trailing 30 days; operating_cost_myr_30d
-- is real recorded entries over the trailing 30 days. ai_cost is converted
-- to MYR using ai_router_settings.usd_myr (same conversion rate already
-- used platform-wide) so margin is a single comparable currency.
CREATE OR REPLACE FUNCTION public.get_hq_cost_center_summary()
RETURNS TABLE (
  mrr_myr numeric,
  ai_cost_usd_30d numeric,
  ai_cost_myr_30d numeric,
  operating_cost_myr_30d numeric,
  usd_myr_rate numeric,
  estimated_margin_myr_30d numeric,
  active_subscriptions bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_mrr numeric;
  v_ai_cost_usd numeric;
  v_op_cost numeric;
  v_rate numeric;
  v_active bigint;
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;

  select coalesce(sum(sp.monthly_price_myr), 0), count(*)
  into v_mrr, v_active
  from public.tenant_subscriptions ts
  join public.subscription_plans sp on sp.id = ts.plan_id
  where ts.status = 'active';

  select coalesce(sum(l.cost_usd), 0) into v_ai_cost_usd
  from public.ai_usage_log l
  where l.created_at > now() - interval '30 days';

  select coalesce(sum(c.amount_myr), 0) into v_op_cost
  from public.hq_operating_costs c
  where c.incurred_on > (now() - interval '30 days')::date;

  select coalesce(usd_myr, 4.45) into v_rate from public.ai_router_settings order by updated_at desc limit 1;
  v_rate := coalesce(v_rate, 4.45);

  return query select
    v_mrr,
    v_ai_cost_usd,
    v_ai_cost_usd * v_rate,
    v_op_cost,
    v_rate,
    v_mrr - (v_ai_cost_usd * v_rate) - v_op_cost,
    v_active;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.get_hq_cost_center_summary() TO authenticated;
