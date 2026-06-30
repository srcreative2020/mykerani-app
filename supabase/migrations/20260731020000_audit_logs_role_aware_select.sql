-- GAP-M1: audit_logs currently lets every tenant member (Owner and Staff
-- alike) read the tenant's full audit history. Narrow it so Staff only see
-- their own actions, matching how Staff have narrower visibility elsewhere
-- in the app; Owners and HQ roles keep full tenant/global visibility.
DROP POLICY IF EXISTS select_audit_logs_policy ON public.audit_logs;

CREATE POLICY select_audit_logs_policy ON public.audit_logs
  FOR SELECT
  USING (
    (get_user_role())::text IN ('HQ_OWNER', 'HQ_STAFF')
    OR (
      tenant_id = get_tenant_id()
      AND (
        (get_user_role())::text = 'TENANT_OWNER'
        OR user_id = auth.uid()::text
      )
    )
  );
