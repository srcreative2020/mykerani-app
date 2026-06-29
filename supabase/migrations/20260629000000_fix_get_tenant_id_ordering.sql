-- ============================================================================
-- MYKERANI Database Hardening Migration Script
-- Module: Fix get_tenant_id() ambiguous row selection
-- Created At: 2026-06-29
-- Description: get_tenant_id() (see 20260621000000_fix_get_tenant_id_jwt_staleness.sql)
--              falls back to user_role_assignments when the JWT claim is missing.
--              That fallback query had no ORDER BY, so when a user has multiple
--              role assignments (e.g. after being moved between tenants) the
--              function could return any of them non-deterministically. This
--              migration drops and recreates get_tenant_id() with an explicit
--              ORDER BY created_at DESC so the most recently created
--              assignment wins, matching the application's expectation that
--              the latest assignment is the active one.
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_tenant_id();

CREATE FUNCTION public.get_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT COALESCE(
    NULLIF(
      current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'tenantId',
      ''
    )::uuid,
    (SELECT ura.tenant_id FROM public.user_role_assignments ura WHERE ura.user_id = auth.uid()::text ORDER BY ura.created_at DESC LIMIT 1)
  );
$function$;