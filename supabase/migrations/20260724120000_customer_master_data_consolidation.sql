-- Customer Master Data Consolidation
--
-- Prior state: HQ Customer List / Customer360 / Tenant Profile each only had
-- partial, scattered customer identity fields (see UAT defect investigation).
-- No single record held mobile/alternate number, company registration/tax
-- info, address, or billing/support contact details. This migration adds the
-- missing fields to the two tables that ARE already authoritative:
--   - user_role_assignments: PERSON identity (full_name, email + new mobile/
--     alternate number) -- already read by AuthContext/PermissionContext and,
--     since the prior fix, by hqService.getCustomers().
--   - tenants: ACCOUNT/COMPANY identity (name + new registration/tax/
--     industry/address/billing/support fields) -- already the one row per
--     customer that HQ and tenant both resolve from.
-- workspaces.workspace_type is added for completeness (workspace TYPE was
-- previously onboarding-only UX state, never persisted).

alter table public.user_role_assignments
  add column if not exists mobile_number text,
  add column if not exists alternate_number text;

alter table public.tenants
  add column if not exists registration_no text,
  add column if not exists tax_number text,
  add column if not exists industry text,
  add column if not exists address text,
  add column if not exists billing_contact_name text,
  add column if not exists billing_email text,
  add column if not exists support_contact_name text,
  add column if not exists support_email text;

alter table public.workspaces
  add column if not exists workspace_type text;

-- Single RPC used by BOTH HQ (editing any tenant) and the tenant owner
-- (editing their own tenant) so there is exactly one write path into the
-- master record, satisfying the no-duplicate-identity-data rule.
create or replace function public.update_tenant_master_profile(
  p_tenant_id uuid,
  p_full_name text default null,
  p_mobile_number text default null,
  p_alternate_number text default null,
  p_company_name text default null,
  p_registration_no text default null,
  p_tax_number text default null,
  p_industry text default null,
  p_address text default null,
  p_billing_contact_name text default null,
  p_billing_email text default null,
  p_support_contact_name text default null,
  p_support_email text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
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
  end if;

  return found;
end;
$$;

grant execute on function public.update_tenant_master_profile(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text
) to authenticated;

-- Tenants can read+update their own row's new fields (RLS already allows
-- broad select via existing tenant policies; this adds the missing update path
-- for the owner's own row so the RPC's "found" check and any direct select
-- both work under RLS).
do $$
begin
  if not exists (
    select 1 from pg_policy where polname = 'tenant_owner_update_own_tenant' and polrelid = 'public.tenants'::regclass
  ) then
    create policy tenant_owner_update_own_tenant on public.tenants
      for update
      using (id = get_tenant_id() and (get_user_role())::text = 'TENANT_OWNER')
      with check (id = get_tenant_id() and (get_user_role())::text = 'TENANT_OWNER');
  end if;
end $$;
