-- ============================================================
-- PHASE 1 RECONCILIATION — CLOSE REMAINING GAPS
-- Closes gap 5.5 (legacy HQ ticket-creation path with no tenant_id) and
-- gap 1.5's UI wiring (already RPC'd in Wave 2, now actually used by the
-- HQ Console toggle instead of the direct single-owner write).
--
-- 5.5: hq_create_support_ticket_for_tenant() replaces the legacy
-- support_tickets direct-insert path (hqService.createSupportTicket(),
-- now removed) that allowed HQ staff to create a ticket with no
-- tenant_id, making it invisible to the tenant it was about. This
-- function requires an explicit, valid p_tenant_id and is the only
-- HQ-side ticket-creation path going forward.
-- ============================================================

CREATE OR REPLACE FUNCTION public.hq_create_support_ticket_for_tenant(
  p_tenant_id uuid,
  p_subject text,
  p_summary text,
  p_priority text DEFAULT 'medium',
  p_category text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_tenant_name character varying;
  v_id uuid;
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;

  select name into v_tenant_name from public.tenants where id = p_tenant_id and category = 'USER';
  if v_tenant_name is null then
    raise exception 'Invalid tenant: tenant_id must reference an existing customer tenant';
  end if;

  if p_priority not in ('critical', 'high', 'medium', 'low') then
    p_priority := 'medium';
  end if;

  insert into public.support_tickets (tenant_id, customer_name, subject, priority, status, summary, category, created_by, sla_due_at)
  values (p_tenant_id, v_tenant_name, p_subject, p_priority, 'open', p_summary, p_category, auth.uid(), now() + (support_ticket_sla_hours(p_priority) || ' hours')::interval)
  returning id into v_id;

  perform public.notify_tenant_ticket_update(v_id, 'status', 'Tiket sokongan baharu telah dibuka oleh HQ bagi pihak anda.');

  return v_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.hq_create_support_ticket_for_tenant(uuid, text, text, text, text) TO authenticated;
