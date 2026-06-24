-- Repository capture of production-only migration "payment_totals_by_tenant"
-- (remote version 20260618023457). Idempotent.

CREATE OR REPLACE FUNCTION public.get_payment_totals_by_tenant()
RETURNS TABLE(tenant_id uuid, total_paid_myr numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;
  return query
  select pt.tenant_id, sum(pt.amount_myr)
  from public.payment_transactions pt
  where pt.status in ('approved', 'success')
  group by pt.tenant_id;
end;
$function$;
