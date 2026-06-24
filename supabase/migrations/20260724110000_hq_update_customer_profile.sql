-- HQ Customer List "Edit" workflow was only persisting plan/status changes
-- (via change_subscription_plan), silently dropping the customer name edit.
-- This RPC lets HQ update the tenant owner's authoritative full_name
-- (user_role_assignments) so the Edit form's name field actually takes effect.
create or replace function public.hq_update_customer_profile(
  p_tenant_id uuid,
  p_full_name text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_hq_user() then
    raise exception 'Not authorized';
  end if;

  update public.user_role_assignments
  set full_name = p_full_name
  where tenant_id = p_tenant_id
    and role = 'TENANT_OWNER';

  return found;
end;
$$;

grant execute on function public.hq_update_customer_profile(uuid, text) to authenticated;
