-- ============================================================================
-- MYKERANI Database Hardening Migration Script
-- Module: Fix get_tenant_id()/get_user_role() relying solely on stale JWT claims
-- Created At: 2026-06-21
-- Description: get_tenant_id() and get_user_role() (used by ~290 RLS policies
--              across the schema, including evidence_documents and
--              storage.objects) read tenantId/role exclusively from
--              request.jwt.claims -> user_metadata. A Supabase Auth JWT is a
--              snapshot taken at sign-in/refresh time — if a user's
--              auth.users.raw_user_meta_data was set/changed after their
--              current session token was issued, or the client is holding an
--              older cached session, these functions silently return NULL,
--              causing every tenant/workspace-scoped RLS policy to deny
--              access ("new row violates row-level security policy"),
--              reproduced for the real (non-mock) test account
--              owner@mykerani.my when uploading documents.
--              is_hq_user() already avoids this by querying
--              user_role_assignments directly via auth.uid() — this migration
--              brings get_tenant_id()/get_user_role() in line with that
--              proven pattern, using the JWT claim as a fast-path and falling
--              back to the user_role_assignments table (source of truth) when
--              the claim is missing.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT COALESCE(
    NULLIF(
      current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'tenantId',
      ''
    )::uuid,
    (SELECT ura.tenant_id FROM public.user_role_assignments ura WHERE ura.user_id = auth.uid()::text LIMIT 1)
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS character varying
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role'),
    (SELECT ura.role FROM public.user_role_assignments ura WHERE ura.user_id = auth.uid()::text LIMIT 1),
    'TENANT_STAFF'
  )::varchar;
$function$;
