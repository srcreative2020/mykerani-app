-- HQ Communication Center / Support Operations Redesign
--
-- UAT FAIL: existing support_tickets workflow lacked SLA tracking, ticket
-- detail data (internal notes, resolution notes, attachments), assignment
-- audit trail, and a workflow status model expressive enough for HQ to
-- triage at scale (open/pending/resolved was too coarse to distinguish
-- "awaiting customer" from "awaiting HQ" from "actively being worked").
--
-- This migration:
--   1. Expands priority to include 'critical'.
--   2. Expands status to: open, in_progress, awaiting_customer, awaiting_hq,
--      resolved, closed (mapping existing rows: pending -> awaiting_customer,
--      since hq_reply_support_ticket previously set 'pending' to mean
--      "HQ answered, waiting on the customer").
--   3. Adds SLA + lifecycle timestamp columns and a category/template key.
--   4. Adds support_ticket_attachments (tenant + HQ uploads) and
--      support_ticket_internal_notes (HQ-only, never visible to tenant).
--   5. Adds a storage bucket + RLS for ticket attachments.
--   6. Replaces/extends RPCs: assignment becomes an RPC (was a raw client
--      update) so it gets audit logging + notification like reply/status
--      already do; status RPC now stamps resolved_at/closed_at and accepts
--      the expanded status set; reply RPC stamps first_response_at and
--      moves status to awaiting_customer (replacing the old 'pending');
--      new RPCs for internal notes, resolution notes, and attachment
--      registration.

alter table public.support_tickets
  drop constraint if exists support_tickets_priority_check;
alter table public.support_tickets
  add constraint support_tickets_priority_check
  check (priority in ('critical', 'high', 'medium', 'low'));

update public.support_tickets set status = 'awaiting_customer' where status = 'pending';

alter table public.support_tickets
  drop constraint if exists support_tickets_status_check;
alter table public.support_tickets
  add constraint support_tickets_status_check
  check (status in ('open', 'in_progress', 'awaiting_customer', 'awaiting_hq', 'resolved', 'closed'));

alter table public.support_tickets
  add column if not exists category text,
  add column if not exists sla_due_at timestamptz,
  add column if not exists first_response_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists resolution_notes text;

create table if not exists public.support_ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_type text,
  uploaded_by text,
  uploaded_by_name text,
  created_at timestamptz not null default now()
);
create index if not exists idx_support_ticket_attachments_ticket_id on public.support_ticket_attachments(ticket_id);

create table if not exists public.support_ticket_internal_notes (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author text not null,
  note text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_support_ticket_internal_notes_ticket_id on public.support_ticket_internal_notes(ticket_id);

alter table public.support_ticket_attachments enable row level security;
alter table public.support_ticket_internal_notes enable row level security;

drop policy if exists hq_manage_support_ticket_attachments on public.support_ticket_attachments;
create policy hq_manage_support_ticket_attachments on public.support_ticket_attachments
  for all using (is_hq_user()) with check (is_hq_user());

drop policy if exists tenant_read_own_support_ticket_attachments on public.support_ticket_attachments;
create policy tenant_read_own_support_ticket_attachments on public.support_ticket_attachments
  for select using (
    ticket_id in (
      select id from public.support_tickets where tenant_id in (
        select tenant_id from public.user_role_assignments where user_id = auth.uid()::text
      )
    )
  );

drop policy if exists tenant_insert_own_support_ticket_attachments on public.support_ticket_attachments;
create policy tenant_insert_own_support_ticket_attachments on public.support_ticket_attachments
  for insert with check (
    ticket_id in (
      select id from public.support_tickets where tenant_id in (
        select tenant_id from public.user_role_assignments where user_id = auth.uid()::text
      )
    )
  );

drop policy if exists hq_manage_support_ticket_internal_notes on public.support_ticket_internal_notes;
create policy hq_manage_support_ticket_internal_notes on public.support_ticket_internal_notes
  for all using (is_hq_user()) with check (is_hq_user());

insert into storage.buckets (id, name, public)
values ('support-attachments', 'support-attachments', false)
on conflict (id) do nothing;

drop policy if exists support_attachments_hq_all on storage.objects;
create policy support_attachments_hq_all on storage.objects
  for all using (bucket_id = 'support-attachments' and is_hq_user())
  with check (bucket_id = 'support-attachments' and is_hq_user());

drop policy if exists support_attachments_tenant_read on storage.objects;
create policy support_attachments_tenant_read on storage.objects
  for select using (
    bucket_id = 'support-attachments'
    and (storage.foldername(name))[1] = get_tenant_id()::text
  );

drop policy if exists support_attachments_tenant_write on storage.objects;
create policy support_attachments_tenant_write on storage.objects
  for insert with check (
    bucket_id = 'support-attachments'
    and (storage.foldername(name))[1] = get_tenant_id()::text
  );

-- SLA target: hours-to-due by priority, applied at ticket creation.
create or replace function public.support_ticket_sla_hours(p_priority text)
returns integer
language sql
immutable
as $function$
  select case p_priority
    when 'critical' then 4
    when 'high' then 8
    when 'medium' then 24
    else 48
  end;
$function$;

create or replace function public.create_tenant_support_ticket(
  p_subject text,
  p_summary text,
  p_priority text default 'medium',
  p_category text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  if p_priority not in ('critical', 'high', 'medium', 'low') then
    p_priority := 'medium';
  end if;

  insert into public.support_tickets (tenant_id, customer_name, customer_email, subject, priority, status, summary, category, created_by, sla_due_at)
  values (v_tenant_id, v_tenant_name, v_email, p_subject, p_priority, 'open', p_summary, p_category, auth.uid()::uuid, now() + (support_ticket_sla_hours(p_priority) || ' hours')::interval)
  returning id into v_id;

  return v_id;
end;
$function$;

grant execute on function public.create_tenant_support_ticket(text, text, text, text) to authenticated;

create or replace function public.hq_reply_support_ticket(
  p_ticket_id uuid,
  p_author text,
  p_reply_text text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor record;
  v_old jsonb;
  v_tenant_id uuid;
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;

  select email, role into v_actor from public.user_role_assignments where user_id = auth.uid()::text limit 1;
  select to_jsonb(t.*), tenant_id into v_old, v_tenant_id from public.support_tickets t where t.id = p_ticket_id;

  insert into public.support_ticket_replies (ticket_id, author, reply_text)
  values (p_ticket_id, p_author, p_reply_text);

  update public.support_tickets
  set status = 'awaiting_customer',
      first_response_at = coalesce(first_response_at, now()),
      updated_at = now()
  where id = p_ticket_id;

  if v_tenant_id is not null then
    insert into public.audit_logs (id, user_id, user_email, user_role, tenant_id, module, action, old_value, new_value, timestamp)
    values (gen_random_uuid(), auth.uid()::text, coalesce(v_actor.email, ''), coalesce(v_actor.role, ''), v_tenant_id, 'Support Ticket', 'UPDATE', v_old, jsonb_build_object('reply', p_reply_text), now());
  end if;

  perform public.notify_tenant_ticket_update(p_ticket_id, 'reply', p_reply_text);
end;
$function$;

grant execute on function public.hq_reply_support_ticket(uuid, text, text) to authenticated;

create or replace function public.hq_update_support_ticket_status(
  p_ticket_id uuid,
  p_status text,
  p_resolution_notes text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor record;
  v_old jsonb;
  v_tenant_id uuid;
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;
  if p_status not in ('open', 'in_progress', 'awaiting_customer', 'awaiting_hq', 'resolved', 'closed') then
    raise exception 'Invalid status %', p_status;
  end if;

  select email, role into v_actor from public.user_role_assignments where user_id = auth.uid()::text limit 1;
  select to_jsonb(t.*), tenant_id into v_old, v_tenant_id from public.support_tickets t where t.id = p_ticket_id;

  update public.support_tickets
  set status = p_status,
      resolution_notes = coalesce(p_resolution_notes, resolution_notes),
      resolved_at = case when p_status = 'resolved' then now() else resolved_at end,
      closed_at = case when p_status = 'closed' then now() else closed_at end,
      updated_at = now()
  where id = p_ticket_id;

  if v_tenant_id is not null then
    insert into public.audit_logs (id, user_id, user_email, user_role, tenant_id, module, action, old_value, new_value, timestamp)
    values (gen_random_uuid(), auth.uid()::text, coalesce(v_actor.email, ''), coalesce(v_actor.role, ''), v_tenant_id, 'Support Ticket', 'UPDATE', v_old, jsonb_build_object('status', p_status, 'resolution_notes', p_resolution_notes), now());
  end if;

  perform public.notify_tenant_ticket_update(
    p_ticket_id, 'status',
    case p_status
      when 'resolved' then 'Tiket telah diselesaikan.'
      when 'closed' then 'Tiket telah ditutup.'
      when 'open' then 'Tiket dibuka semula.'
      when 'in_progress' then 'Tiket sedang dalam proses.'
      when 'awaiting_hq' then 'Tiket menunggu tindakan pasukan HQ.'
      else 'Tiket sedang diproses.'
    end
  );
end;
$function$;

grant execute on function public.hq_update_support_ticket_status(uuid, text, text) to authenticated;

create or replace function public.hq_assign_support_ticket(
  p_ticket_id uuid,
  p_assigned_to text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor record;
  v_old jsonb;
  v_tenant_id uuid;
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;

  select email, role into v_actor from public.user_role_assignments where user_id = auth.uid()::text limit 1;
  select to_jsonb(t.*), tenant_id into v_old, v_tenant_id from public.support_tickets t where t.id = p_ticket_id;

  update public.support_tickets
  set assigned_to = p_assigned_to,
      status = case when status = 'open' then 'in_progress' else status end,
      updated_at = now()
  where id = p_ticket_id;

  if v_tenant_id is not null then
    insert into public.audit_logs (id, user_id, user_email, user_role, tenant_id, module, action, old_value, new_value, timestamp)
    values (gen_random_uuid(), auth.uid()::text, coalesce(v_actor.email, ''), coalesce(v_actor.role, ''), v_tenant_id, 'Support Ticket', 'UPDATE', v_old, jsonb_build_object('assigned_to', p_assigned_to), now());
  end if;
end;
$function$;

grant execute on function public.hq_assign_support_ticket(uuid, text) to authenticated;

create or replace function public.hq_add_ticket_internal_note(
  p_ticket_id uuid,
  p_author text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;

  insert into public.support_ticket_internal_notes (ticket_id, author, note)
  values (p_ticket_id, p_author, p_note);
end;
$function$;

grant execute on function public.hq_add_ticket_internal_note(uuid, text, text) to authenticated;

create or replace function public.add_ticket_attachment(
  p_ticket_id uuid,
  p_file_name text,
  p_file_path text,
  p_file_type text,
  p_uploaded_by_name text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tenant_id uuid;
  v_caller_tenant_id uuid;
  v_id uuid;
begin
  select tenant_id into v_tenant_id from public.support_tickets where id = p_ticket_id;
  select tenant_id into v_caller_tenant_id from public.user_role_assignments where user_id = auth.uid()::text limit 1;

  if not (is_hq_user() or (v_tenant_id is not null and v_tenant_id = v_caller_tenant_id)) then
    raise exception 'Not authorized';
  end if;

  insert into public.support_ticket_attachments (ticket_id, file_name, file_path, file_type, uploaded_by, uploaded_by_name)
  values (p_ticket_id, p_file_name, p_file_path, p_file_type, auth.uid()::text, p_uploaded_by_name)
  returning id into v_id;

  return v_id;
end;
$function$;

grant execute on function public.add_ticket_attachment(uuid, text, text, text, text) to authenticated;
