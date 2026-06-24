-- HQ Phase 2 — close the Support Ticket Journey.
--
-- Root cause: support_tickets has no tenant_id column — only a free-text
-- customer_name — and its only RLS policy is is_hq_user(). A tenant who
-- files a ticket via create_tenant_support_ticket() (SECURITY DEFINER,
-- bypasses RLS to insert) can never read the ticket back: no SELECT
-- policy grants them access, and there is no column to scope one by.
-- Concretely: Tenant Action -> HQ Visibility (ok) -> HQ Workflow (ok) ->
-- HQ Action/reply (ok) -> Tenant Visibility: FAIL. This closes that.

ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant_id ON public.support_tickets(tenant_id);

-- Backfill is not possible from customer_name alone (free text, no
-- reliable join key) — existing rows created before this migration remain
-- tenant_id = NULL and stay HQ-only visible, which matches their actual
-- provenance (most were created via the HQ-side createSupportTicket path,
-- not the tenant-side RPC). Only tickets filed through
-- create_tenant_support_ticket() going forward get a real tenant_id.

CREATE OR REPLACE FUNCTION public.create_tenant_support_ticket(
  p_subject text,
  p_summary text,
  p_priority text DEFAULT 'medium'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_tenant_id uuid;
  v_tenant_name character varying;
  v_email character varying;
  v_id uuid;
begin
  select ura.tenant_id, ura.email into v_tenant_id, v_email
  from public.user_role_assignments ura
  where ura.user_id = auth.uid()::text
  limit 1;

  if v_tenant_id is null then
    raise exception 'No tenant membership found for current user';
  end if;

  select name into v_tenant_name from public.tenants where id = v_tenant_id;

  if p_priority not in ('high', 'medium', 'low') then
    p_priority := 'medium';
  end if;

  insert into public.support_tickets (tenant_id, customer_name, customer_email, subject, priority, status, summary, created_by)
  values (v_tenant_id, v_tenant_name, v_email, p_subject, p_priority, 'open', p_summary, auth.uid()::uuid)
  returning id into v_id;

  return v_id;
end;
$function$;

-- Tenant-side read access — own tenant's tickets and replies only.
-- Owner and Staff share user_role_assignments membership on the same
-- tenant_id, so this policy gives both identical visibility (parity is
-- automatic, not role-filtered).
DROP POLICY IF EXISTS tenant_read_own_support_tickets ON public.support_tickets;
CREATE POLICY tenant_read_own_support_tickets ON public.support_tickets
  FOR SELECT USING (
    tenant_id IS NOT NULL AND tenant_id IN (
      SELECT tenant_id FROM public.user_role_assignments WHERE user_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS tenant_read_own_support_ticket_replies ON public.support_ticket_replies;
CREATE POLICY tenant_read_own_support_ticket_replies ON public.support_ticket_replies
  FOR SELECT USING (
    ticket_id IN (
      SELECT id FROM public.support_tickets WHERE tenant_id IN (
        SELECT tenant_id FROM public.user_role_assignments WHERE user_id = auth.uid()::text
      )
    )
  );

-- Notify the tenant on HQ reply / status change — without this, the loop
-- still breaks even with read access, since nothing tells the tenant a
-- reply arrived; they would have to keep manually re-checking.
CREATE OR REPLACE FUNCTION public.notify_tenant_ticket_update(p_ticket_id uuid, p_kind text, p_detail text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_tenant_id uuid;
  v_subject text;
  v_ws record;
begin
  select tenant_id, subject into v_tenant_id, v_subject from public.support_tickets where id = p_ticket_id;
  if v_tenant_id is null then
    return; -- ticket has no tenant linkage (HQ-created, pre-migration, or HQ-internal) — nothing to notify
  end if;

  for v_ws in select id from public.workspaces where tenant_id = v_tenant_id loop
    insert into public.workspace_notifications (workspace_id, tenant_id, category, title, message, metadata)
    values (
      v_ws.id, v_tenant_id, 'SUPPORT',
      case when p_kind = 'reply' then 'Balasan baharu untuk tiket sokongan' else 'Status tiket sokongan dikemas kini' end,
      format('Tiket "%s": %s', coalesce(v_subject, ''), p_detail),
      jsonb_build_object('ticket_id', p_ticket_id, 'kind', p_kind)
    );
  end loop;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.notify_tenant_ticket_update(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.hq_reply_support_ticket(p_ticket_id uuid, p_author text, p_reply_text text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;

  insert into public.support_ticket_replies (ticket_id, author, reply_text)
  values (p_ticket_id, p_author, p_reply_text);

  update public.support_tickets set status = 'pending', updated_at = now() where id = p_ticket_id;

  perform public.notify_tenant_ticket_update(p_ticket_id, 'reply', p_reply_text);
end;
$function$;

GRANT EXECUTE ON FUNCTION public.hq_reply_support_ticket(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.hq_update_support_ticket_status(p_ticket_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;
  if p_status not in ('open', 'pending', 'resolved') then
    raise exception 'Invalid status %', p_status;
  end if;

  update public.support_tickets set status = p_status, updated_at = now() where id = p_ticket_id;

  perform public.notify_tenant_ticket_update(
    p_ticket_id, 'status',
    case p_status when 'resolved' then 'Tiket telah diselesaikan.' when 'open' then 'Tiket dibuka semula.' else 'Tiket sedang diproses.' end
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION public.hq_update_support_ticket_status(uuid, text) TO authenticated;
