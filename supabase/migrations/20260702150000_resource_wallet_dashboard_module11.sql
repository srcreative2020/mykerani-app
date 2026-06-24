-- HQ Foundation Module 11: Resource Wallet Dashboard.
-- resource_wallets / resource_wallet_transactions are real, production
-- tables already consumed tenant-side (src/lib/aiCredits.ts,
-- src/lib/storageQuota.ts) — but HQ has zero visibility into wallet
-- balances or consumption across tenants. This adds the one missing
-- piece: an HQ-side aggregation RPC.

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
  ocr_consumed_30d bigint
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
    sum(w.ai_credits_balance)::bigint,
    sum(w.ocr_credits_balance)::bigint,
    sum(w.notification_credits_balance)::bigint,
    sum(w.storage_used_bytes)::bigint,
    sum(w.storage_limit_bytes)::bigint,
    coalesce((
      select sum(-tx.amount) from public.resource_wallet_transactions tx
      where tx.wallet_id in (select id from public.resource_wallets where tenant_id = w.tenant_id)
        and tx.credit_type = 'AI' and tx.amount < 0 and tx.created_at >= now() - interval '30 days'
    ), 0)::bigint,
    coalesce((
      select sum(-tx.amount) from public.resource_wallet_transactions tx
      where tx.wallet_id in (select id from public.resource_wallets where tenant_id = w.tenant_id)
        and tx.credit_type = 'OCR' and tx.amount < 0 and tx.created_at >= now() - interval '30 days'
    ), 0)::bigint
  from public.resource_wallets w
  join public.tenants t on t.id = w.tenant_id
  group by w.tenant_id, t.name
  order by t.name;
end;
$function$;
