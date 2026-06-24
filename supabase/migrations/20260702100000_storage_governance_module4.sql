-- HQ Foundation Module 4: Storage Governance.
-- storage_governance_settings already existed (captured earlier) but had zero
-- client wiring and no enforcement path — the "inactiveDays" control in the
-- HQ Console was a cosmetic local-only number, never read from or written to
-- this table, and nothing ever actually froze inactive workspace storage.
-- This migration adds the one missing real piece: an HQ-triggered (never
-- autonomous) enforcement RPC that applies the configured freeze_days to
-- workspace_storage_state.

CREATE OR REPLACE FUNCTION public.enforce_storage_governance()
RETURNS TABLE(tenant_id uuid, action text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_freeze_days integer;
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;

  select coalesce(freeze_days, 30) into v_freeze_days
  from public.storage_governance_settings where id = 'global';

  v_freeze_days := coalesce(v_freeze_days, 30);

  return query
  with frozen as (
    update public.workspace_storage_state s
    set is_frozen = true,
        frozen_reason = 'storage_governance_auto: inactive ' || v_freeze_days || '+ days',
        updated_at = now()
    where s.is_frozen = false
      and s.last_active_at < now() - (v_freeze_days || ' days')::interval
    returning s.tenant_id
  )
  select frozen.tenant_id, 'frozen'::text from frozen;
end;
$function$;
