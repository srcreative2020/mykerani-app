-- HQ Foundation Module 3: AI Cost Governance.
-- Reuses existing ai_usage_log / ai_provider_configs / ai_router_settings.
-- Adds the one real missing piece: actual per-call cost tracking and a
-- cost-rate table HQ can edit, so spend is computed from real usage instead
-- of being inferred from request counts alone.

CREATE TABLE IF NOT EXISTS public.ai_cost_rates (
  provider text NOT NULL,
  model text NOT NULL,
  cost_per_call_usd numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, model)
);

ALTER TABLE public.ai_cost_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hq_manage_ai_cost_rates ON public.ai_cost_rates;
CREATE POLICY hq_manage_ai_cost_rates ON public.ai_cost_rates
  FOR ALL USING (is_hq_user()) WITH CHECK (is_hq_user());

ALTER TABLE public.ai_usage_log ADD COLUMN IF NOT EXISTS cost_usd numeric;

CREATE OR REPLACE FUNCTION public.get_hq_ai_cost_summary()
RETURNS TABLE(tenant_id uuid, tenant_name character varying, provider text, total_calls bigint, total_cost_usd numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;
  return query
  select l.tenant_id, t.name, l.provider, count(*)::bigint, coalesce(sum(l.cost_usd), 0)
  from public.ai_usage_log l
  join public.tenants t on t.id = l.tenant_id
  group by l.tenant_id, t.name, l.provider
  order by coalesce(sum(l.cost_usd), 0) desc;
end;
$function$;
