-- Phase 4 continuation: Module 10 (Commercial Governance config + approval
-- thresholds), Module 11 (Production Governance — idempotency keys +
-- scheduled job monitoring), Module 12 (Commercial Analytics — append-only
-- event stream), Module 8 (Customer Success — playbooks + unified 360 read),
-- and Promotions (discount/trial/wallet-credit codes). All HQ-side writes to
-- global commercial config route through the existing pending_hq_actions
-- dual-approval inbox — never a direct table write.

-- ═══ MODULE 12: Commercial Analytics — append-only event stream ═══
create table if not exists public.commercial_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  tenant_id uuid,
  workspace_id uuid,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists idx_commercial_events_type_time on public.commercial_events (event_type, occurred_at desc);
create index if not exists idx_commercial_events_tenant on public.commercial_events (tenant_id, occurred_at desc);
alter table public.commercial_events enable row level security;
create policy commercial_events_hq_select on public.commercial_events for select to authenticated using (public.is_hq_user());

create or replace function public.record_commercial_event(p_event_type text, p_tenant_id uuid, p_workspace_id uuid, p_payload jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = 'public' as $$
declare v_id uuid;
begin
  insert into public.commercial_events (event_type, tenant_id, workspace_id, payload)
  values (p_event_type, p_tenant_id, p_workspace_id, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.record_commercial_event(text, uuid, uuid, jsonb) to authenticated;

create or replace function public.get_commercial_events(p_event_type text default null, p_limit integer default 200)
returns table (id uuid, event_type text, tenant_id uuid, tenant_name text, workspace_id uuid, payload jsonb, occurred_at timestamptz)
language sql stable security definer set search_path = 'public' as $$
  select e.id, e.event_type, e.tenant_id, t.name, e.workspace_id, e.payload, e.occurred_at
  from public.commercial_events e
  left join public.tenants t on t.id = e.tenant_id
  where public.is_hq_user()
    and (p_event_type is null or e.event_type = p_event_type)
  order by e.occurred_at desc
  limit greatest(1, least(p_limit, 1000));
$$;
grant execute on function public.get_commercial_events(text, integer) to authenticated;

create or replace function public.get_plan_distribution()
returns table (plan_name text, tenant_count bigint, mrr_myr numeric)
language sql stable security definer set search_path = 'public' as $$
  select p.name, count(s.id), coalesce(sum(p.monthly_price_myr), 0)
  from public.tenant_subscriptions s
  join public.subscription_plans p on p.id = s.plan_id
  where s.status = 'active' and public.is_hq_user()
  group by p.name;
$$;
grant execute on function public.get_plan_distribution() to authenticated;

-- ═══ MODULE 10: Commercial Governance — versioned config + thresholds ═══
create table if not exists public.commercial_config_items (
  id uuid primary key default gen_random_uuid(),
  config_key text not null,
  scope text not null check (scope in ('global','plan','tenant')),
  scope_id uuid,
  value jsonb not null,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_commercial_config_lookup on public.commercial_config_items (config_key, scope, scope_id) where is_active;
alter table public.commercial_config_items enable row level security;
create policy commercial_config_hq_select on public.commercial_config_items for select to authenticated using (public.is_hq_user());

create table if not exists public.commercial_approval_thresholds (
  action_type text primary key,
  value_threshold_myr numeric,
  requires_dual_approval boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.commercial_approval_thresholds enable row level security;
create policy commercial_thresholds_hq_select on public.commercial_approval_thresholds for select to authenticated using (public.is_hq_user());

create or replace function public.get_config_value(p_key text, p_scope text default 'global', p_scope_id uuid default null)
returns jsonb language sql stable security definer set search_path = 'public' as $$
  select value from public.commercial_config_items
  where config_key = p_key and scope = p_scope
    and (scope_id = p_scope_id or (scope_id is null and p_scope_id is null))
    and is_active
  order by created_at desc limit 1;
$$;
grant execute on function public.get_config_value(text, text, uuid) to authenticated;

create or replace function public.apply_commercial_config_upsert(p_payload jsonb)
returns void language plpgsql security definer set search_path = 'public' as $$
begin
  update public.commercial_config_items set is_active = false
  where config_key = p_payload->>'config_key'
    and scope = p_payload->>'scope'
    and (scope_id::text = p_payload->>'scope_id' or (scope_id is null and p_payload->>'scope_id' is null))
    and is_active;

  insert into public.commercial_config_items (config_key, scope, scope_id, value, created_by)
  values (
    p_payload->>'config_key', p_payload->>'scope',
    nullif(p_payload->>'scope_id','')::uuid,
    p_payload->'value', auth.uid()
  );
end;
$$;

create or replace function public.apply_approval_threshold_upsert(p_payload jsonb)
returns void language plpgsql security definer set search_path = 'public' as $$
begin
  insert into public.commercial_approval_thresholds (action_type, value_threshold_myr, requires_dual_approval, updated_at)
  values (p_payload->>'action_type', (p_payload->>'value_threshold_myr')::numeric, coalesce((p_payload->>'requires_dual_approval')::boolean, true), now())
  on conflict (action_type) do update set
    value_threshold_myr = excluded.value_threshold_myr,
    requires_dual_approval = excluded.requires_dual_approval,
    updated_at = now();
end;
$$;

create or replace function public.get_commercial_config_items()
returns table (id uuid, config_key text, scope text, scope_id uuid, value jsonb, created_at timestamptz)
language sql stable security definer set search_path = 'public' as $$
  select id, config_key, scope, scope_id, value, created_at
  from public.commercial_config_items
  where is_active and public.is_hq_user()
  order by config_key, scope;
$$;
grant execute on function public.get_commercial_config_items() to authenticated;

create or replace function public.get_commercial_approval_thresholds()
returns table (action_type text, value_threshold_myr numeric, requires_dual_approval boolean)
language sql stable security definer set search_path = 'public' as $$
  select action_type, value_threshold_myr, requires_dual_approval
  from public.commercial_approval_thresholds
  where public.is_hq_user()
  order by action_type;
$$;
grant execute on function public.get_commercial_approval_thresholds() to authenticated;

-- ═══ PROMOTIONS — discount/trial/wallet-credit codes, closed-loop redemption ═══
create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  kind text not null check (kind in ('wallet_credit','trial_extension_days')),
  credit_type credit_type,
  amount numeric not null check (amount > 0),
  max_redemptions integer,
  redemptions_count integer not null default 0,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.promotions enable row level security;
create policy promotions_authenticated_select on public.promotions for select to authenticated using (is_active);

create table if not exists public.promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id),
  tenant_id uuid not null,
  workspace_id uuid not null,
  redeemed_by uuid,
  redeemed_at timestamptz not null default now(),
  result jsonb,
  unique (promotion_id, tenant_id)
);
alter table public.promotion_redemptions enable row level security;
create policy promotion_redemptions_hq_select on public.promotion_redemptions for select to authenticated using (public.is_hq_user());

create or replace function public.apply_promotion_upsert(p_payload jsonb)
returns void language plpgsql security definer set search_path = 'public' as $$
begin
  insert into public.promotions (code, kind, credit_type, amount, max_redemptions, expires_at, created_by)
  values (
    upper(p_payload->>'code'), p_payload->>'kind',
    (p_payload->>'credit_type')::credit_type,
    (p_payload->>'amount')::numeric,
    nullif(p_payload->>'max_redemptions','')::integer,
    nullif(p_payload->>'expires_at','')::timestamptz,
    auth.uid()
  )
  on conflict (code) do update set
    kind = excluded.kind, credit_type = excluded.credit_type, amount = excluded.amount,
    max_redemptions = excluded.max_redemptions, expires_at = excluded.expires_at, is_active = true;
end;
$$;

create or replace function public.apply_promotion_deactivate(p_target_id uuid)
returns void language plpgsql security definer set search_path = 'public' as $$
begin
  update public.promotions set is_active = false where id = p_target_id;
end;
$$;

create or replace function public.redeem_promotion(p_code text, p_tenant_id uuid, p_workspace_id uuid)
returns jsonb language plpgsql security definer set search_path = 'public' as $$
declare
  v_promo public.promotions;
  v_ok boolean;
begin
  if not exists (
    select 1 from public.user_role_assignments ura
    where ura.user_id = auth.uid()::text and ura.tenant_id = p_tenant_id and ura.role = 'TENANT_OWNER'
  ) then
    raise exception 'Permission denied: TENANT_OWNER access required';
  end if;

  select * into v_promo from public.promotions where code = upper(p_code) and is_active for update;
  if v_promo.id is null then
    raise exception 'Kod promosi tidak sah atau tidak aktif';
  end if;
  if v_promo.expires_at is not null and v_promo.expires_at < now() then
    raise exception 'Kod promosi telah tamat tempoh';
  end if;
  if v_promo.max_redemptions is not null and v_promo.redemptions_count >= v_promo.max_redemptions then
    raise exception 'Kod promosi telah mencapai had penebusan';
  end if;
  if exists (select 1 from public.promotion_redemptions where promotion_id = v_promo.id and tenant_id = p_tenant_id) then
    raise exception 'Kod promosi ini telah ditebus oleh syarikat anda';
  end if;

  if v_promo.kind = 'wallet_credit' then
    v_ok := public.allocate_wallet_credits(p_tenant_id, p_workspace_id, v_promo.credit_type, v_promo.amount::bigint, 'Promosi: ' || v_promo.code, 'promotion');
  elsif v_promo.kind = 'trial_extension_days' then
    update public.tenant_subscriptions
    set current_period_end = current_period_end + (v_promo.amount::text || ' days')::interval
    where tenant_id = p_tenant_id;
    v_ok := true;
  end if;

  update public.promotions set redemptions_count = redemptions_count + 1 where id = v_promo.id;
  insert into public.promotion_redemptions (promotion_id, tenant_id, workspace_id, redeemed_by, result)
  values (v_promo.id, p_tenant_id, p_workspace_id, auth.uid(), jsonb_build_object('ok', v_ok, 'kind', v_promo.kind, 'amount', v_promo.amount));

  perform public.record_commercial_event('promotion_redeemed', p_tenant_id, p_workspace_id,
    jsonb_build_object('code', v_promo.code, 'kind', v_promo.kind, 'amount', v_promo.amount));

  insert into public.workspace_notifications (workspace_id, tenant_id, category, title, message, metadata)
  values (p_workspace_id, p_tenant_id, 'BILLING', 'Promosi berjaya ditebus',
    'Kod ' || v_promo.code || ' telah berjaya digunakan.',
    jsonb_build_object('code', v_promo.code, 'kind', v_promo.kind));

  return jsonb_build_object('ok', v_ok, 'kind', v_promo.kind, 'amount', v_promo.amount);
end;
$$;
grant execute on function public.redeem_promotion(text, uuid, uuid) to authenticated;

create or replace function public.get_active_promotions()
returns table (id uuid, code text, kind text, credit_type credit_type, amount numeric, max_redemptions integer, redemptions_count integer, expires_at timestamptz)
language sql stable as $$
  select id, code, kind, credit_type, amount, max_redemptions, redemptions_count, expires_at
  from public.promotions where is_active order by created_at desc;
$$;
grant execute on function public.get_active_promotions() to authenticated;

-- ═══ MODULE 11: Production Governance — idempotency + job monitoring ═══
create table if not exists public.commercial_idempotency_keys (
  idempotency_key text primary key,
  request_hash text not null,
  response jsonb,
  created_at timestamptz not null default now()
);
alter table public.commercial_idempotency_keys enable row level security;
create policy commercial_idem_hq_select on public.commercial_idempotency_keys for select to authenticated using (public.is_hq_user());

create or replace function public.check_and_reserve_idempotency_key(p_key text, p_request_hash text)
returns jsonb language plpgsql security definer set search_path = 'public' as $$
declare v_existing public.commercial_idempotency_keys;
begin
  select * into v_existing from public.commercial_idempotency_keys where idempotency_key = p_key;
  if v_existing.idempotency_key is not null then
    if v_existing.request_hash <> p_request_hash then
      raise exception 'Idempotency key reused with a different request payload';
    end if;
    return jsonb_build_object('replayed', true, 'response', v_existing.response);
  end if;
  insert into public.commercial_idempotency_keys (idempotency_key, request_hash) values (p_key, p_request_hash);
  return jsonb_build_object('replayed', false);
end;
$$;
grant execute on function public.check_and_reserve_idempotency_key(text, text) to authenticated;

create or replace function public.record_idempotency_response(p_key text, p_response jsonb)
returns void language plpgsql security definer set search_path = 'public' as $$
begin
  update public.commercial_idempotency_keys set response = p_response where idempotency_key = p_key;
end;
$$;
grant execute on function public.record_idempotency_response(text, jsonb) to authenticated;

create table if not exists public.scheduled_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','success','failed')),
  error text
);
alter table public.scheduled_job_runs enable row level security;
create policy scheduled_job_runs_hq_select on public.scheduled_job_runs for select to authenticated using (public.is_hq_user());

create or replace function public.get_scheduled_job_runs(p_limit integer default 50)
returns table (id uuid, job_name text, started_at timestamptz, finished_at timestamptz, status text, error text)
language sql stable security definer set search_path = 'public' as $$
  select id, job_name, started_at, finished_at, status, error
  from public.scheduled_job_runs
  where public.is_hq_user()
  order by started_at desc limit greatest(1, least(p_limit, 500));
$$;
grant execute on function public.get_scheduled_job_runs(integer) to authenticated;

-- ═══ MODULE 8: Customer Success Center — playbooks + unified 360 read ═══
create table if not exists public.customer_success_playbooks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  max_health_score integer not null,
  condition text,
  recommended_action text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.customer_success_playbooks enable row level security;
create policy playbooks_hq_select on public.customer_success_playbooks for select to authenticated using (public.is_hq_user());

insert into public.customer_success_playbooks (name, max_health_score, condition, recommended_action) values
  ('Risiko Tinggi', 40, 'health_score < 40', 'Hubungi pelanggan segera — risiko churn tinggi. Semak sebab skor kesihatan rendah dan tawarkan bantuan.'),
  ('Akaun Tidak Aktif', 60, 'inactive_days >= 14', 'Hantar peringatan penggunaan — akaun tidak aktif lebih 14 hari.'),
  ('Tiket Sokongan Terbuka', 70, 'open_tickets > 0', 'Susulan tiket sokongan terbuka untuk pastikan diselesaikan tepat waktu.')
on conflict do nothing;

create or replace function public.get_recommended_actions()
returns table (tenant_id uuid, tenant_name text, health_score integer, playbook_name text, recommended_action text)
language sql stable security definer set search_path = 'public' as $$
  select h.tenant_id, t.name, h.score, pb.name, pb.recommended_action
  from public.get_hq_customer_health_scores() h
  join public.tenants t on t.id = h.tenant_id
  join public.customer_success_playbooks pb
    on pb.is_active and h.score <= pb.max_health_score
  where public.is_hq_user()
  order by h.score asc;
$$;
grant execute on function public.get_recommended_actions() to authenticated;

create or replace function public.get_customer_360(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = 'public' as $$
declare v_result jsonb;
begin
  if not public.is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;
  select jsonb_build_object(
    'tenant', (select jsonb_build_object('id', t.id, 'name', t.name) from public.tenants t where t.id = p_tenant_id),
    'subscription', (select jsonb_build_object('plan_id', s.plan_id, 'status', s.status, 'current_period_end', s.current_period_end)
                      from public.tenant_subscriptions s where s.tenant_id = p_tenant_id),
    'wallet', (select jsonb_build_object('ai_credits_balance', w.ai_credits_balance, 'ocr_credits_balance', w.ocr_credits_balance, 'storage_limit_bytes', w.storage_limit_bytes)
               from public.resource_wallets w join public.workspaces ws on ws.id = w.workspace_id where ws.tenant_id = p_tenant_id limit 1),
    'open_tickets', (select count(*) from public.support_tickets st where st.tenant_id = p_tenant_id and st.status in ('open','in_progress')),
    'recent_payments', (select coalesce(jsonb_agg(jsonb_build_object('amount_myr', pt.amount_myr, 'status', pt.status, 'created_at', pt.created_at)), '[]'::jsonb)
                         from (select * from public.payment_transactions where tenant_id = p_tenant_id order by created_at desc limit 5) pt)
  ) into v_result;
  return v_result;
end;
$$;
grant execute on function public.get_customer_360(uuid) to authenticated;

-- Extend the generic dual-approval dispatcher with the new governance/promotion action types.
create or replace function public.execute_pending_hq_action(p_action_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
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
  elsif v_action_type = 'addon_package_upsert' then
    perform public.apply_addon_package_upsert(v_payload);
  elsif v_action_type = 'addon_package_deactivate' then
    perform public.apply_addon_package_deactivate(v_target_id);
  elsif v_action_type = 'commercial_config_upsert' then
    perform public.apply_commercial_config_upsert(v_payload);
  elsif v_action_type = 'approval_threshold_upsert' then
    perform public.apply_approval_threshold_upsert(v_payload);
  elsif v_action_type = 'promotion_upsert' then
    perform public.apply_promotion_upsert(v_payload);
  elsif v_action_type = 'promotion_deactivate' then
    perform public.apply_promotion_deactivate(v_target_id);
  else
    raise exception 'No registered execution for action_type %', v_action_type;
  end if;
end;
$function$;
