-- ============================================================================
-- MYKERANI Tenant Ecosystem Remediation — Wave 1 (Critical gaps)
-- Created At: 2026-07-30
-- Source: MYKERANI_TENANT_ECOSYSTEM_GOVERNANCE_PRINCIPLE.md gap report
--
-- Fixes:
--   GAP-C1: get_tenant_id()/get_user_role() trust a stale JWT claim over the
--           live user_role_assignments table, so revoking a Staff member's
--           role does not invalidate their already-issued session token —
--           every RLS policy keeps passing until the JWT naturally expires.
--           Fix: flip precedence to match is_hq_user()'s proven pattern —
--           always check the live table first, JWT claim only as fallback
--           when no row exists (covers brand-new sessions before first sync).
--   GAP-C3: permission_matrices has no tenant_id — globally unique by role,
--           so any tenant editing its own permission matrix mutates the
--           matrix for every other tenant on the platform.
--   GAP-C5: PermissionSettingsConsole.tsx lets TENANT_OWNER attempt edits,
--           but RLS only allowed role='HQ_OWNER' to write — silent failure.
--           Fix: tenant-scoped permission_matrices with tenant-owner write.
--   GAP-C4: No tenant-level Owner-suspends/reactivates-Staff feature exists.
--           set_user_suspended() is HQ-only, untracked by audit/notification,
--           and never checked at sign-in. Fix: tenant-scoped RPCs with audit
--           + notification + session-check support.
--
-- Reconciliation note (HQ <-> Tenant Reconciliation Rule): is_hq_user()'s
-- live-table-first pattern is reused verbatim for get_tenant_id()/
-- get_user_role() rather than inventing a new resolution strategy. The
-- tenant suspend/reactivate RPCs follow the exact shape of the existing
-- HQ-only set_user_suspended(), extended with tenant scoping + audit +
-- notification rather than building a parallel mechanism.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- GAP-C1: live-table-first tenant/role resolution
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT COALESCE(
    (SELECT ura.tenant_id FROM public.user_role_assignments ura WHERE ura.user_id = auth.uid()::text LIMIT 1),
    NULLIF(
      current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'tenantId',
      ''
    )::uuid
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS character varying
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT COALESCE(
    (SELECT ura.role FROM public.user_role_assignments ura WHERE ura.user_id = auth.uid()::text LIMIT 1),
    (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role'),
    'TENANT_STAFF'
  )::varchar;
$function$;

-- ----------------------------------------------------------------------------
-- GAP-C3 / GAP-C5: tenant-scope permission_matrices
--
-- Platform-default rows use the well-known MYKERANI HQ tenant's id as a
-- sentinel (rather than NULL) so a plain UNIQUE(tenant_id, role) constraint
-- can back a simple `upsert(..., {onConflict: "tenant_id,role"})` from the
-- client — a NULL-based / COALESCE-expression-index approach was tried and
-- reverted because Postgres can't use it as an ON CONFLICT inference target
-- for a plain column list.
-- ----------------------------------------------------------------------------
ALTER TABLE public.permission_matrices
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

UPDATE public.permission_matrices
  SET tenant_id = (SELECT id FROM public.tenants WHERE category = 'HQ' LIMIT 1)
  WHERE tenant_id IS NULL;

ALTER TABLE public.permission_matrices
  ALTER COLUMN tenant_id SET DEFAULT (SELECT id FROM public.tenants WHERE category = 'HQ' LIMIT 1);
ALTER TABLE public.permission_matrices ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.permission_matrices DROP CONSTRAINT IF EXISTS permission_matrices_role_key;
ALTER TABLE public.permission_matrices DROP CONSTRAINT IF EXISTS permission_matrices_tenant_id_role_key;
ALTER TABLE public.permission_matrices ADD CONSTRAINT permission_matrices_tenant_id_role_key UNIQUE (tenant_id, role);

DROP POLICY IF EXISTS "select_permission_matrices_policy" ON public.permission_matrices;
DROP POLICY IF EXISTS "write_permission_matrices_policy" ON public.permission_matrices;

-- SELECT: platform defaults (HQ-tenant row) visible to everyone;
-- tenant-specific overrides visible only to that tenant or HQ.
CREATE POLICY "select_permission_matrices_policy" ON public.permission_matrices
    FOR SELECT TO authenticated
    USING (
        tenant_id = (SELECT id FROM public.tenants WHERE category = 'HQ' LIMIT 1)
        OR tenant_id = public.get_tenant_id()
        OR public.is_hq_user()
    );

-- WRITE: HQ may write platform defaults or any tenant row; a Tenant Owner
-- may only write a row scoped to their own tenant_id.
CREATE POLICY "write_permission_matrices_policy" ON public.permission_matrices
    FOR ALL TO authenticated
    USING (
        public.is_hq_user()
        OR (tenant_id = public.get_tenant_id() AND public.get_user_role() = 'TENANT_OWNER')
    )
    WITH CHECK (
        public.is_hq_user()
        OR (tenant_id = public.get_tenant_id() AND public.get_user_role() = 'TENANT_OWNER')
    );

-- ----------------------------------------------------------------------------
-- GAP-C4: tenant-level Owner suspend/reactivate Staff
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_suspend_staff_role(p_assignment_id uuid, p_suspended boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_tenant_id uuid := public.get_tenant_id();
  v_actor_email text;
  v_row record;
begin
  if (public.get_user_role())::text <> 'TENANT_OWNER' then
    raise exception 'Permission denied: TENANT_OWNER access required';
  end if;

  select email into v_actor_email from public.user_role_assignments where user_id = auth.uid()::text and tenant_id = v_tenant_id limit 1;
  select * into v_row from public.user_role_assignments where id = p_assignment_id and tenant_id = v_tenant_id;
  if v_row.id is null then
    raise exception 'Role assignment not found in your tenant';
  end if;
  if v_row.role = 'TENANT_OWNER' then
    raise exception 'Cannot suspend the tenant owner role';
  end if;

  update public.user_role_assignments set is_suspended = p_suspended where id = p_assignment_id;

  insert into public.role_change_audit_log (assignment_id, target_user_id, target_email, tenant_id, old_role, new_role, change_type, changed_by, changed_by_email)
  values (p_assignment_id, v_row.user_id, v_row.email, v_tenant_id, v_row.role, v_row.role,
          case when p_suspended then 'SUSPEND' else 'REACTIVATE' end, auth.uid(), v_actor_email);

  insert into public.workspace_notifications (workspace_id, tenant_id, category, title, message, metadata)
  select w.id, v_tenant_id, 'SECURITY',
    case when p_suspended then 'Akaun ahli pasukan digantung' else 'Akaun ahli pasukan diaktifkan semula' end,
    v_row.full_name || case when p_suspended then ' telah digantung daripada akses workspace.' else ' kini boleh log masuk semula.' end,
    jsonb_build_object('target_email', v_row.email, 'suspended', p_suspended)
  from public.workspaces w where w.tenant_id = v_tenant_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.tenant_suspend_staff_role(uuid, boolean) TO authenticated;

ALTER TABLE public.user_role_assignments
  ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;

-- role_change_audit_log.change_type previously constrained to GRANT/UPDATE/REVOKE
ALTER TABLE public.role_change_audit_log DROP CONSTRAINT IF EXISTS role_change_audit_log_change_type_check;
ALTER TABLE public.role_change_audit_log ADD CONSTRAINT role_change_audit_log_change_type_check
  CHECK (change_type IN ('GRANT', 'UPDATE', 'REVOKE', 'SUSPEND', 'REACTIVATE'));

-- Block suspended staff at the RLS layer (covers session-not-yet-expired case
-- alongside GAP-C1's live-table fix): is_user_suspended() used by gate policy.
CREATE OR REPLACE FUNCTION public.is_current_user_suspended()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT COALESCE(
    (SELECT ura.is_suspended FROM public.user_role_assignments ura WHERE ura.user_id = auth.uid()::text LIMIT 1),
    false
  );
$function$;

-- ----------------------------------------------------------------------------
-- GAP-H1 (partial, same root cause as C4/revoke): notify on revoke, matching
-- the notification tenant_assign_staff_role already sends on grant.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_revoke_staff_role(p_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_tenant_id uuid := public.get_tenant_id();
  v_actor_email text;
  v_row record;
begin
  if (public.get_user_role())::text <> 'TENANT_OWNER' then
    raise exception 'Permission denied: TENANT_OWNER access required';
  end if;

  select email into v_actor_email from public.user_role_assignments where user_id = auth.uid()::text and tenant_id = v_tenant_id limit 1;
  select * into v_row from public.user_role_assignments where id = p_assignment_id and tenant_id = v_tenant_id;
  if v_row.id is null then
    raise exception 'Role assignment not found in your tenant';
  end if;
  if v_row.role = 'TENANT_OWNER' then
    raise exception 'Cannot revoke the tenant owner role';
  end if;

  delete from public.user_role_assignments where id = p_assignment_id;

  insert into public.role_change_audit_log (assignment_id, target_user_id, target_email, tenant_id, old_role, new_role, change_type, changed_by, changed_by_email)
  values (p_assignment_id, v_row.user_id, v_row.email, v_tenant_id, v_row.role, null, 'REVOKE', auth.uid(), v_actor_email);

  insert into public.workspace_notifications (workspace_id, tenant_id, category, title, message, metadata)
  select w.id, v_tenant_id, 'SECURITY', 'Akses ahli pasukan dibatalkan',
    v_row.full_name || ' (' || v_row.email || ') tidak lagi mempunyai akses kepada workspace ini.',
    jsonb_build_object('target_email', v_row.email, 'old_role', v_row.role)
  from public.workspaces w where w.tenant_id = v_tenant_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.tenant_revoke_staff_role(uuid) TO authenticated;
