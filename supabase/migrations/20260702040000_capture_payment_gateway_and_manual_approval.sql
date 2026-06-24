-- Repository capture of production-only migration "payment_gateway_and_manual_approval"
-- (remote version 20260618004135), plus the dependent function set_tenant_frozen()
-- (used by HQ tenant-freeze actions on top of workspace_storage_state). Idempotent.

CREATE OR REPLACE FUNCTION public.create_payment_transaction(
  p_tenant_id uuid, p_plan_id uuid, p_amount_myr numeric,
  p_method character varying, p_slip_path text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
  if not exists (
    select 1 from public.user_role_assignments ura
    where ura.user_id = auth.uid()::text and ura.tenant_id = p_tenant_id and ura.role = 'TENANT_OWNER'
  ) then
    raise exception 'Permission denied: tenant owner access required';
  end if;

  insert into public.payment_transactions (tenant_id, plan_id, amount_myr, method, slip_path, submitted_by, status)
  values (p_tenant_id, p_plan_id, p_amount_myr, p_method, p_slip_path, auth.uid(), 'pending')
  returning id into v_id;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_pending_payment_approvals()
RETURNS TABLE(
  id uuid, tenant_id uuid, tenant_name character varying, plan_id uuid,
  plan_name character varying, amount_myr numeric, method character varying,
  slip_path text, submitted_by_name text, submitted_by_email text, created_at timestamptz
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
  select pt.id, pt.tenant_id, t.name, pt.plan_id, sp.name, pt.amount_myr, pt.method, pt.slip_path,
         coalesce(pr.full_name, ''), coalesce(pr.email, ''), pt.created_at
  from public.payment_transactions pt
  join public.tenants t on t.id = pt.tenant_id
  join public.subscription_plans sp on sp.id = pt.plan_id
  left join public.profiles pr on pr.id = pt.submitted_by
  where pt.status = 'pending'
  order by pt.created_at asc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_tenant_frozen(p_tenant_id uuid, p_is_frozen boolean, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;
  insert into public.workspace_storage_state (tenant_id, is_frozen, frozen_reason, updated_at)
  values (p_tenant_id, p_is_frozen, coalesce(p_reason, ''), now())
  on conflict (tenant_id) do update set
    is_frozen = p_is_frozen,
    frozen_reason = coalesce(p_reason, ''),
    updated_at = now();
end;
$function$;

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hq_all_payment_transactions ON public.payment_transactions;
CREATE POLICY hq_all_payment_transactions ON public.payment_transactions
  FOR ALL USING (is_hq_user());

DROP POLICY IF EXISTS tenant_owner_insert_payment_transactions ON public.payment_transactions;
CREATE POLICY tenant_owner_insert_payment_transactions ON public.payment_transactions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_role_assignments ura
      WHERE (ura.user_id)::text = (auth.uid())::text
        AND ura.tenant_id = payment_transactions.tenant_id
        AND (ura.role)::text = 'TENANT_OWNER'::text
    ) AND submitted_by = auth.uid()
  );

DROP POLICY IF EXISTS tenant_select_own_payment_transactions ON public.payment_transactions;
CREATE POLICY tenant_select_own_payment_transactions ON public.payment_transactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_role_assignments ura
      WHERE (ura.user_id)::text = (auth.uid())::text
        AND ura.tenant_id = payment_transactions.tenant_id
    )
  );

ALTER TABLE public.payment_gateway_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hq_select_payment_settings ON public.payment_gateway_settings;
CREATE POLICY hq_select_payment_settings ON public.payment_gateway_settings
  FOR SELECT USING (is_hq_user());

DROP POLICY IF EXISTS hq_update_payment_settings ON public.payment_gateway_settings;
CREATE POLICY hq_update_payment_settings ON public.payment_gateway_settings
  FOR UPDATE USING (is_hq_user());

DROP POLICY IF EXISTS tenant_read_payment_gateway_settings ON public.payment_gateway_settings;
CREATE POLICY tenant_read_payment_gateway_settings ON public.payment_gateway_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);
