-- ============================================================
-- BUG FIX: get_pending_hq_actions() — type mismatch on email columns
--
-- Root cause: auth.users.email is character varying(255) but the
-- function return type declared both requested_by_email and
-- reviewed_by_email as text. PostgreSQL raises:
--   "Returned type character varying(255) does not match expected
--    type text in column 7"
-- This caused every call from the Supabase JS client to throw,
-- and getPendingHqActions() silently returned [] — making the
-- Pusat Kelulusan HQ always appear empty even though records
-- existed in pending_hq_actions.
--
-- Fix: explicit ::text cast on both email expressions in the
-- RETURN QUERY. No schema changes, no logic changes.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_pending_hq_actions(p_status text DEFAULT 'pending')
RETURNS TABLE (
  id uuid,
  action_type text,
  target_table text,
  target_id uuid,
  payload jsonb,
  requested_by uuid,
  requested_by_email text,
  requested_at timestamptz,
  status text,
  reviewed_by uuid,
  reviewed_by_email text,
  reviewed_at timestamptz,
  review_note text
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
    a.id, a.action_type, a.target_table, a.target_id, a.payload,
    a.requested_by, rp.email::text, a.requested_at,
    a.status, a.reviewed_by, vp.email::text, a.reviewed_at, a.review_note
  from public.pending_hq_actions a
  left join auth.users rp on rp.id = a.requested_by
  left join auth.users vp on vp.id = a.reviewed_by
  where p_status is null or a.status = p_status
  order by a.requested_at desc;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.get_pending_hq_actions(text) TO authenticated;
