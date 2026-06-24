-- HQ Foundation Module 8: Customer Health Score.
-- The HQ Console "attention" flag (churn-risk indicator) was hardcoded `false`
-- for every real tenant in getCustomers() — it never reflected any actual
-- signal. This migration computes a real composite health score from
-- existing signals already tracked in production: subscription status
-- (suspension), storage freeze state, inactivity, AI engagement (usage
-- trend), and open support tickets.

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
      select tenant_id,
        count(*) filter (where created_at >= now() - interval '30 days') as recent_calls,
        count(*) filter (where created_at >= now() - interval '60 days' and created_at < now() - interval '30 days') as prior_calls
      from public.ai_usage_log group by tenant_id
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
      tenant_id,
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
    tenant_id,
    greatest(least(raw_score, 100), 0)::integer as score,
    case
      when greatest(least(raw_score, 100), 0) < 50 then 'high'
      when greatest(least(raw_score, 100), 0) < 75 then 'medium'
      else 'low'
    end as risk_level,
    reasons
  from scored
  order by score asc;
end;
$function$;
