-- Extends get_hq_resource_wallet_summary() (HQ Console's Resource Wallet /
-- Purchase Approval / Subscription-Package tenant list) with the same
-- Package Quota / Purchased Top-up / Usage breakdown that
-- get_resource_wallet_breakdown() exposes per-workspace, so HQ's
-- tenant-level view uses the identical formula shape instead of only the
-- raw balance/limit columns. ai_credits_balance/ocr_credits_balance/
-- storage_used_bytes/storage_limit_bytes (the ground-truth "remaining"
-- inputs) are unchanged and still summed across the tenant's workspaces;
-- this only adds the topup/quota decomposition on top, tenant-wide.
DROP FUNCTION IF EXISTS public.get_hq_resource_wallet_summary();

CREATE OR REPLACE FUNCTION public.get_hq_resource_wallet_summary()
RETURNS TABLE(
  tenant_id uuid,
  tenant_name character varying,
  ai_credits_balance bigint,
  ocr_credits_balance bigint,
  notification_credits_balance bigint,
  storage_used_bytes bigint,
  storage_limit_bytes bigint,
  ai_consumed_30d bigint,
  ocr_consumed_30d bigint,
  ai_cost_usd_30d numeric,
  ai_purchased_topup bigint,
  ocr_purchased_topup bigint,
  storage_purchased_topup bigint,
  ai_package_quota bigint,
  ocr_package_quota bigint,
  storage_package_quota bigint
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
  select
    w.tenant_id,
    t.name,
    sum(w.ai_credits_balance)::bigint as ai_credits_balance,
    sum(w.ocr_credits_balance)::bigint as ocr_credits_balance,
    sum(w.notification_credits_balance)::bigint as notification_credits_balance,
    sum(w.storage_used_bytes)::bigint as storage_used_bytes,
    sum(w.storage_limit_bytes)::bigint as storage_limit_bytes,
    coalesce((
      select sum(-tx.amount) from public.resource_wallet_transactions tx
      where tx.wallet_id in (select rw.id from public.resource_wallets rw where rw.tenant_id = w.tenant_id)
        and tx.credit_type = 'AI' and tx.amount < 0 and tx.created_at >= now() - interval '30 days'
    ), 0)::bigint as ai_consumed_30d,
    coalesce((
      select sum(-tx.amount) from public.resource_wallet_transactions tx
      where tx.wallet_id in (select rw.id from public.resource_wallets rw where rw.tenant_id = w.tenant_id)
        and tx.credit_type = 'OCR' and tx.amount < 0 and tx.created_at >= now() - interval '30 days'
    ), 0)::bigint as ocr_consumed_30d,
    coalesce((
      select sum(l.cost_usd) from public.ai_usage_log l
      where l.tenant_id = w.tenant_id and l.created_at >= now() - interval '30 days'
    ), 0)::numeric as ai_cost_usd_30d,
    coalesce((
      select sum(tx.amount) from public.resource_wallet_transactions tx
      where tx.wallet_id in (select rw.id from public.resource_wallets rw where rw.tenant_id = w.tenant_id)
        and tx.credit_type = 'AI' and tx.activity_type = 'ALLOCATION'
        and tx.metadata->>'source' in ('topup_purchase', 'addon_purchase_approval')
    ), 0)::bigint as ai_purchased_topup,
    coalesce((
      select sum(tx.amount) from public.resource_wallet_transactions tx
      where tx.wallet_id in (select rw.id from public.resource_wallets rw where rw.tenant_id = w.tenant_id)
        and tx.credit_type = 'OCR' and tx.activity_type = 'ALLOCATION'
        and tx.metadata->>'source' in ('topup_purchase', 'addon_purchase_approval')
    ), 0)::bigint as ocr_purchased_topup,
    coalesce((
      select sum(tx.amount) from public.resource_wallet_transactions tx
      where tx.wallet_id in (select rw.id from public.resource_wallets rw where rw.tenant_id = w.tenant_id)
        and tx.credit_type = 'STORAGE' and tx.activity_type = 'ALLOCATION'
        and tx.metadata->>'source' in ('topup_purchase', 'addon_purchase_approval')
    ), 0)::bigint as storage_purchased_topup,
    -- package_quota = remaining + usage - purchased_topup, same algebraic
    -- derivation as get_resource_wallet_breakdown(), summed tenant-wide.
    (
      sum(w.ai_credits_balance)
      + coalesce((
          select sum(-tx.amount) from public.resource_wallet_transactions tx
          where tx.wallet_id in (select rw.id from public.resource_wallets rw where rw.tenant_id = w.tenant_id)
            and tx.credit_type = 'AI' and tx.activity_type = 'USAGE'
        ), 0)
      - coalesce((
          select sum(tx.amount) from public.resource_wallet_transactions tx
          where tx.wallet_id in (select rw.id from public.resource_wallets rw where rw.tenant_id = w.tenant_id)
            and tx.credit_type = 'AI' and tx.activity_type = 'ALLOCATION'
            and tx.metadata->>'source' in ('topup_purchase', 'addon_purchase_approval')
        ), 0)
    )::bigint as ai_package_quota,
    (
      sum(w.ocr_credits_balance)
      + coalesce((
          select sum(-tx.amount) from public.resource_wallet_transactions tx
          where tx.wallet_id in (select rw.id from public.resource_wallets rw where rw.tenant_id = w.tenant_id)
            and tx.credit_type = 'OCR' and tx.activity_type = 'USAGE'
        ), 0)
      - coalesce((
          select sum(tx.amount) from public.resource_wallet_transactions tx
          where tx.wallet_id in (select rw.id from public.resource_wallets rw where rw.tenant_id = w.tenant_id)
            and tx.credit_type = 'OCR' and tx.activity_type = 'ALLOCATION'
            and tx.metadata->>'source' in ('topup_purchase', 'addon_purchase_approval')
        ), 0)
    )::bigint as ocr_package_quota,
    (
      greatest(0::bigint, sum(w.storage_limit_bytes) - sum(w.storage_used_bytes))
      + sum(w.storage_used_bytes)
      - coalesce((
          select sum(tx.amount) from public.resource_wallet_transactions tx
          where tx.wallet_id in (select rw.id from public.resource_wallets rw where rw.tenant_id = w.tenant_id)
            and tx.credit_type = 'STORAGE' and tx.activity_type = 'ALLOCATION'
            and tx.metadata->>'source' in ('topup_purchase', 'addon_purchase_approval')
        ), 0)
    )::bigint as storage_package_quota
  from public.resource_wallets w
  join public.tenants t on t.id = w.tenant_id
  group by w.tenant_id, t.name
  order by t.name;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.get_hq_resource_wallet_summary() TO authenticated;
