-- Repository capture of production-only changes applied directly to the live
-- database (remote migration history: fix_rls_tenants_workspaces_user_roles,
-- hq_read_all_tenants_workspaces, fix_hq_rls_for_console_data — 2026-06-17).
-- Idempotent: safe to (re)apply to any environment; mirrors current production state.

CREATE OR REPLACE FUNCTION public.is_hq_user()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_role_assignments ura
    JOIN public.tenants t ON t.id = ura.tenant_id
    WHERE ura.user_id = auth.uid()::text
      AND t.category = 'HQ'
  );
$function$;

-- tenants
DROP POLICY IF EXISTS hq_read_all_tenants ON public.tenants;
CREATE POLICY hq_read_all_tenants ON public.tenants
  FOR SELECT USING (is_hq_user());

DROP POLICY IF EXISTS tenants_delete_policy ON public.tenants;
CREATE POLICY tenants_delete_policy ON public.tenants
  FOR DELETE USING ((get_user_role())::text = 'HQ_OWNER'::text);

DROP POLICY IF EXISTS tenants_insert_policy ON public.tenants;
CREATE POLICY tenants_insert_policy ON public.tenants
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS tenants_select_policy ON public.tenants;
CREATE POLICY tenants_select_policy ON public.tenants
  FOR SELECT USING ((id = get_tenant_id()) OR ((get_user_role())::text = 'HQ_OWNER'::text));

DROP POLICY IF EXISTS tenants_update_policy ON public.tenants;
CREATE POLICY tenants_update_policy ON public.tenants
  FOR UPDATE USING ((id = get_tenant_id()) OR ((get_user_role())::text = 'HQ_OWNER'::text))
  WITH CHECK ((id = get_tenant_id()) OR ((get_user_role())::text = 'HQ_OWNER'::text));

DROP POLICY IF EXISTS users_insert_own_tenant ON public.tenants;
CREATE POLICY users_insert_own_tenant ON public.tenants
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS users_read_own_tenant ON public.tenants;
CREATE POLICY users_read_own_tenant ON public.tenants
  FOR SELECT USING (id IN (
    SELECT user_role_assignments.tenant_id FROM public.user_role_assignments
    WHERE (user_role_assignments.user_id)::text = (auth.uid())::text
  ));

-- workspaces
DROP POLICY IF EXISTS hq_read_all_workspaces ON public.workspaces;
CREATE POLICY hq_read_all_workspaces ON public.workspaces
  FOR SELECT USING (is_hq_user());

DROP POLICY IF EXISTS users_insert_own_workspace ON public.workspaces;
CREATE POLICY users_insert_own_workspace ON public.workspaces
  FOR INSERT WITH CHECK (tenant_id IN (
    SELECT user_role_assignments.tenant_id FROM public.user_role_assignments
    WHERE (user_role_assignments.user_id)::text = (auth.uid())::text
  ));

DROP POLICY IF EXISTS users_read_own_workspaces ON public.workspaces;
CREATE POLICY users_read_own_workspaces ON public.workspaces
  FOR SELECT USING (tenant_id IN (
    SELECT user_role_assignments.tenant_id FROM public.user_role_assignments
    WHERE (user_role_assignments.user_id)::text = (auth.uid())::text
  ));

DROP POLICY IF EXISTS workspaces_delete_policy ON public.workspaces;
CREATE POLICY workspaces_delete_policy ON public.workspaces
  FOR DELETE USING (((tenant_id = get_tenant_id()) AND ((get_user_role())::text = 'TENANT_OWNER'::text)) OR ((get_user_role())::text = 'HQ_OWNER'::text));

DROP POLICY IF EXISTS workspaces_insert_policy ON public.workspaces;
CREATE POLICY workspaces_insert_policy ON public.workspaces
  FOR INSERT WITH CHECK ((tenant_id = get_tenant_id()) OR ((get_user_role())::text = 'HQ_OWNER'::text));

DROP POLICY IF EXISTS workspaces_select_policy ON public.workspaces;
CREATE POLICY workspaces_select_policy ON public.workspaces
  FOR SELECT USING ((tenant_id = get_tenant_id()) OR ((get_user_role())::text = 'HQ_OWNER'::text));

DROP POLICY IF EXISTS workspaces_update_policy ON public.workspaces;
CREATE POLICY workspaces_update_policy ON public.workspaces
  FOR UPDATE USING ((tenant_id = get_tenant_id()) OR ((get_user_role())::text = 'HQ_OWNER'::text))
  WITH CHECK ((tenant_id = get_tenant_id()) OR ((get_user_role())::text = 'HQ_OWNER'::text));

-- user_role_assignments
DROP POLICY IF EXISTS hq_read_all_roles ON public.user_role_assignments;
CREATE POLICY hq_read_all_roles ON public.user_role_assignments
  FOR SELECT USING (is_hq_user());

DROP POLICY IF EXISTS delete_role_assignments_policy ON public.user_role_assignments;
CREATE POLICY delete_role_assignments_policy ON public.user_role_assignments
  FOR DELETE USING (((tenant_id = get_tenant_id()) AND ((get_user_role())::text = 'TENANT_OWNER'::text)) OR ((get_user_role())::text = 'HQ_OWNER'::text));

DROP POLICY IF EXISTS insert_role_assignments_policy ON public.user_role_assignments;
CREATE POLICY insert_role_assignments_policy ON public.user_role_assignments
  FOR INSERT WITH CHECK (((tenant_id = get_tenant_id()) AND ((get_user_role())::text = 'TENANT_OWNER'::text)) OR ((get_user_role())::text = 'HQ_OWNER'::text));

DROP POLICY IF EXISTS select_role_assignments_policy ON public.user_role_assignments;
CREATE POLICY select_role_assignments_policy ON public.user_role_assignments
  FOR SELECT USING ((tenant_id = get_tenant_id()) OR ((get_user_role())::text = ANY ((ARRAY['HQ_OWNER'::character varying, 'HQ_STAFF'::character varying])::text[])));

DROP POLICY IF EXISTS update_role_assignments_policy ON public.user_role_assignments;
CREATE POLICY update_role_assignments_policy ON public.user_role_assignments
  FOR UPDATE USING (((tenant_id = get_tenant_id()) AND ((get_user_role())::text = 'TENANT_OWNER'::text)) OR ((get_user_role())::text = 'HQ_OWNER'::text))
  WITH CHECK (((tenant_id = get_tenant_id()) AND ((get_user_role())::text = 'TENANT_OWNER'::text)) OR ((get_user_role())::text = 'HQ_OWNER'::text));

DROP POLICY IF EXISTS users_insert_own_role ON public.user_role_assignments;
CREATE POLICY users_insert_own_role ON public.user_role_assignments
  FOR INSERT WITH CHECK ((user_id)::text = (auth.uid())::text);

DROP POLICY IF EXISTS users_read_own_roles ON public.user_role_assignments;
CREATE POLICY users_read_own_roles ON public.user_role_assignments
  FOR SELECT USING ((user_id)::text = (auth.uid())::text);
