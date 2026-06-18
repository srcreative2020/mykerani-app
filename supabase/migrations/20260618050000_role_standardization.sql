-- ============================================================================
-- MYKERANI Database Hardening Migration Script
-- Module: Role Standardization (Foundation Stabilization Priority 2)
-- Created At: 2026-06-18
-- Description: Collapses the legacy 8-value role taxonomy (HQ_ADMIN,
--              HQ_SUPPORT, HQ_AUDITOR, TENANT_ADMIN, OWNER, MANAGER, STAFF,
--              VIEWER) down to the 4 canonical roles defined in
--              MYKERANI_CONSTITUTION.md / src/types.ts UserRole:
--                HQ_OWNER, HQ_STAFF, TENANT_OWNER, TENANT_STAFF
--
-- Mapping applied throughout:
--   HQ_ADMIN     -> HQ_OWNER
--   HQ_SUPPORT   -> HQ_STAFF
--   HQ_AUDITOR   -> HQ_STAFF
--   TENANT_ADMIN -> TENANT_OWNER
--   OWNER        -> TENANT_OWNER
--   MANAGER      -> TENANT_STAFF
--   STAFF        -> TENANT_STAFF
--   VIEWER       -> TENANT_STAFF
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SECURITY CONTEXT HELPER FUNCTION — least-privilege canonical default
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS VARCHAR AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role'),
    'TENANT_STAFF'
  )::varchar;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 2. TENANTS / WORKSPACES / LEDGER TABLES (20260611000000_mykerani_rls_foundation.sql)
-- ----------------------------------------------------------------------------
ALTER POLICY tenants_select_policy ON tenants
    USING (id = public.get_tenant_id() OR public.get_user_role() = 'HQ_OWNER');

ALTER POLICY tenants_update_policy ON tenants
    USING (id = public.get_tenant_id() OR public.get_user_role() = 'HQ_OWNER')
    WITH CHECK (id = public.get_tenant_id() OR public.get_user_role() = 'HQ_OWNER');

ALTER POLICY tenants_delete_policy ON tenants
    USING (public.get_user_role() = 'HQ_OWNER');

ALTER POLICY workspaces_select_policy ON workspaces
    USING (tenant_id = public.get_tenant_id() OR public.get_user_role() = 'HQ_OWNER');

ALTER POLICY workspaces_insert_policy ON workspaces
    WITH CHECK (tenant_id = public.get_tenant_id() OR public.get_user_role() = 'HQ_OWNER');

ALTER POLICY workspaces_update_policy ON workspaces
    USING (tenant_id = public.get_tenant_id() OR public.get_user_role() = 'HQ_OWNER')
    WITH CHECK (tenant_id = public.get_tenant_id() OR public.get_user_role() = 'HQ_OWNER');

ALTER POLICY workspaces_delete_policy ON workspaces
    USING (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() = 'TENANT_OWNER')
        OR public.get_user_role() = 'HQ_OWNER'
    );

ALTER POLICY cash_accounts_select_policy ON cash_accounts
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER');
ALTER POLICY cash_accounts_insert_policy ON cash_accounts
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER');
ALTER POLICY cash_accounts_update_policy ON cash_accounts
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER')
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER');
ALTER POLICY cash_accounts_delete_policy ON cash_accounts
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER');

ALTER POLICY bank_accounts_select_policy ON bank_accounts
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER');
ALTER POLICY bank_accounts_insert_policy ON bank_accounts
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER');
ALTER POLICY bank_accounts_update_policy ON bank_accounts
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER')
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER');
ALTER POLICY bank_accounts_delete_policy ON bank_accounts
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER');

ALTER POLICY income_records_select_policy ON income_records
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER');
ALTER POLICY income_records_insert_policy ON income_records
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER');
ALTER POLICY income_records_update_policy ON income_records
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER')
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER');
ALTER POLICY income_records_delete_policy ON income_records
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER');

ALTER POLICY expense_records_select_policy ON expense_records
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER');
ALTER POLICY expense_records_insert_policy ON expense_records
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER');
ALTER POLICY expense_records_update_policy ON expense_records
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER')
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER');
ALTER POLICY expense_records_delete_policy ON expense_records
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER');

ALTER POLICY receivables_select_policy ON receivables
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER');
ALTER POLICY receivables_insert_policy ON receivables
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER');
ALTER POLICY receivables_update_policy ON receivables
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER')
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER');
ALTER POLICY receivables_delete_policy ON receivables
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER');

ALTER POLICY payables_select_policy ON payables
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER');
ALTER POLICY payables_insert_policy ON payables
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER');
ALTER POLICY payables_update_policy ON payables
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER')
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER');
ALTER POLICY payables_delete_policy ON payables
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER');

ALTER POLICY debts_select_policy ON debts
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER');
ALTER POLICY debts_insert_policy ON debts
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER');
ALTER POLICY debts_update_policy ON debts
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER')
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER');
ALTER POLICY debts_delete_policy ON debts
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER');

ALTER POLICY general_ledger_categories_select_policy ON general_ledger_categories
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER');
ALTER POLICY general_ledger_categories_insert_policy ON general_ledger_categories
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER');
ALTER POLICY general_ledger_categories_update_policy ON general_ledger_categories
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER')
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER');
ALTER POLICY general_ledger_categories_delete_policy ON general_ledger_categories
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_OWNER');

ALTER POLICY immutable_audit_ledger_select_policy ON immutable_audit_ledger
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF'));
ALTER POLICY immutable_audit_ledger_insert_policy ON immutable_audit_ledger
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF'));

-- ----------------------------------------------------------------------------
-- 3. WORKSPACE STORAGE PROVIDERS (20260614000001_workspace_storage_providers.sql)
-- ----------------------------------------------------------------------------
ALTER POLICY workspace_storage_providers_select_policy ON public.workspace_storage_providers
    USING (tenant_id = public.get_tenant_id() OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF'));
ALTER POLICY workspace_storage_providers_insert_policy ON public.workspace_storage_providers
    WITH CHECK (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('HQ_OWNER', 'TENANT_OWNER'))
        OR public.get_user_role() = 'HQ_OWNER'
    );
ALTER POLICY workspace_storage_providers_update_policy ON public.workspace_storage_providers
    USING (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('HQ_OWNER', 'TENANT_OWNER'))
        OR public.get_user_role() = 'HQ_OWNER'
    )
    WITH CHECK (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('HQ_OWNER', 'TENANT_OWNER'))
        OR public.get_user_role() = 'HQ_OWNER'
    );
ALTER POLICY workspace_storage_providers_delete_policy ON public.workspace_storage_providers
    USING (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('HQ_OWNER', 'TENANT_OWNER'))
        OR public.get_user_role() = 'HQ_OWNER'
    );

-- ----------------------------------------------------------------------------
-- 4. AUDIT ENGINE FOUNDATION (20260611000005_audit_engine_foundation.sql)
-- ----------------------------------------------------------------------------
ALTER POLICY "select_audit_logs_policy" ON public.audit_logs
    USING (tenant_id = public.get_tenant_id() OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF'));
ALTER POLICY "insert_audit_logs_policy" ON public.audit_logs
    WITH CHECK (tenant_id = public.get_tenant_id() OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF'));

-- ----------------------------------------------------------------------------
-- 5. FINANCIAL EVIDENCE PACKAGES (20260611000002_financial_evidence_packages_setup.sql)
-- ----------------------------------------------------------------------------
ALTER POLICY financial_evidence_packages_select_policy ON financial_evidence_packages
    USING (
        EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id())
        OR public.get_user_role() = 'HQ_OWNER'
    );
ALTER POLICY financial_evidence_packages_insert_policy ON financial_evidence_packages
    WITH CHECK (
        EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id())
        OR public.get_user_role() = 'HQ_OWNER'
    );
ALTER POLICY financial_evidence_packages_update_policy ON financial_evidence_packages
    USING (
        EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id())
        OR public.get_user_role() = 'HQ_OWNER'
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id())
        OR public.get_user_role() = 'HQ_OWNER'
    );
ALTER POLICY financial_evidence_packages_delete_policy ON financial_evidence_packages
    USING (
        EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id())
        OR public.get_user_role() = 'HQ_OWNER'
    );

-- ----------------------------------------------------------------------------
-- 6. OCR LEARNING LAYER (20260613000000_ocr_learning_layer_setup.sql)
-- ----------------------------------------------------------------------------
ALTER POLICY ocr_learned_patterns_select_policy ON ocr_learned_patterns
    USING (
        EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id())
        OR public.get_user_role() = 'HQ_OWNER'
    );
ALTER POLICY ocr_learned_patterns_insert_policy ON ocr_learned_patterns
    WITH CHECK (
        EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id())
        OR public.get_user_role() = 'HQ_OWNER'
    );
ALTER POLICY ocr_learned_patterns_update_policy ON ocr_learned_patterns
    USING (
        EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id())
        OR public.get_user_role() = 'HQ_OWNER'
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id())
        OR public.get_user_role() = 'HQ_OWNER'
    );
ALTER POLICY ocr_learned_patterns_delete_policy ON ocr_learned_patterns
    USING (
        EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id())
        OR public.get_user_role() = 'HQ_OWNER'
    );

-- ----------------------------------------------------------------------------
-- 7. STORAGE SECURITY HARDENING (20260611000003_storage_security_hardening.sql)
-- ----------------------------------------------------------------------------
ALTER POLICY "select_evidence_policy" ON storage.objects
    USING (
        bucket_id = 'evidence-packages' AND (
            EXISTS (
                SELECT 1 FROM public.workspaces
                WHERE workspaces.id::text = split_part(name, '/', 1)
                  AND (workspaces.tenant_id = public.get_tenant_id() OR public.get_user_role() = 'HQ_OWNER')
            )
        )
    );
ALTER POLICY "insert_evidence_policy" ON storage.objects
    WITH CHECK (
        bucket_id = 'evidence-packages' AND (
            EXISTS (
                SELECT 1 FROM public.workspaces
                WHERE workspaces.id::text = split_part(name, '/', 1)
                  AND (workspaces.tenant_id = public.get_tenant_id() OR public.get_user_role() = 'HQ_OWNER')
            )
        )
    );
ALTER POLICY "update_evidence_policy" ON storage.objects
    USING (
        bucket_id = 'evidence-packages' AND (
            EXISTS (
                SELECT 1 FROM public.workspaces
                WHERE workspaces.id::text = split_part(name, '/', 1)
                  AND (workspaces.tenant_id = public.get_tenant_id() OR public.get_user_role() = 'HQ_OWNER')
            )
        )
    )
    WITH CHECK (
        bucket_id = 'evidence-packages' AND (
            EXISTS (
                SELECT 1 FROM public.workspaces
                WHERE workspaces.id::text = split_part(name, '/', 1)
                  AND (workspaces.tenant_id = public.get_tenant_id() OR public.get_user_role() = 'HQ_OWNER')
            )
        )
    );
ALTER POLICY "delete_evidence_policy" ON storage.objects
    USING (
        bucket_id = 'evidence-packages' AND (
            EXISTS (
                SELECT 1 FROM public.workspaces
                WHERE workspaces.id::text = split_part(name, '/', 1)
                  AND (workspaces.tenant_id = public.get_tenant_id() OR public.get_user_role() = 'HQ_OWNER')
            )
        )
    );

-- ----------------------------------------------------------------------------
-- 8. FINANCIAL COMMITMENTS (20260611000001_financial_commitments_setup.sql)
-- ----------------------------------------------------------------------------
ALTER POLICY financial_commitments_select_policy ON financial_commitments
    USING (
        EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id())
        OR public.get_user_role() = 'HQ_OWNER'
    );
ALTER POLICY financial_commitments_insert_policy ON financial_commitments
    WITH CHECK (
        EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id())
        OR public.get_user_role() = 'HQ_OWNER'
    );
ALTER POLICY financial_commitments_update_policy ON financial_commitments
    USING (
        EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id())
        OR public.get_user_role() = 'HQ_OWNER'
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id())
        OR public.get_user_role() = 'HQ_OWNER'
    );
ALTER POLICY financial_commitments_delete_policy ON financial_commitments
    USING (
        EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id())
        OR public.get_user_role() = 'HQ_OWNER'
    );

-- ----------------------------------------------------------------------------
-- 9. NOTIFICATION CENTER (20260614000002_notification_center_setup.sql)
-- ----------------------------------------------------------------------------
ALTER POLICY workspace_notif_pref_select_policy ON public.workspace_notification_preferences
    USING (tenant_id = public.get_tenant_id() OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF'));
ALTER POLICY workspace_notif_pref_insert_policy ON public.workspace_notification_preferences
    WITH CHECK (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('HQ_OWNER', 'TENANT_OWNER'))
        OR public.get_user_role() = 'HQ_OWNER'
    );
ALTER POLICY workspace_notif_pref_update_policy ON public.workspace_notification_preferences
    USING (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('HQ_OWNER', 'TENANT_OWNER'))
        OR public.get_user_role() = 'HQ_OWNER'
    )
    WITH CHECK (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('HQ_OWNER', 'TENANT_OWNER'))
        OR public.get_user_role() = 'HQ_OWNER'
    );
ALTER POLICY workspace_notif_pref_delete_policy ON public.workspace_notification_preferences
    USING (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('HQ_OWNER', 'TENANT_OWNER'))
        OR public.get_user_role() = 'HQ_OWNER'
    );

ALTER POLICY workspace_notif_select_policy ON public.workspace_notifications
    USING (tenant_id = public.get_tenant_id() OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF'));
ALTER POLICY workspace_notif_insert_policy ON public.workspace_notifications
    WITH CHECK (tenant_id = public.get_tenant_id() OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF'));
ALTER POLICY workspace_notif_update_policy ON public.workspace_notifications
    USING (tenant_id = public.get_tenant_id() OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF'))
    WITH CHECK (tenant_id = public.get_tenant_id() OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF'));
ALTER POLICY workspace_notif_delete_policy ON public.workspace_notifications
    USING (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('HQ_OWNER', 'TENANT_OWNER'))
        OR public.get_user_role() = 'HQ_OWNER'
    );

-- ----------------------------------------------------------------------------
-- 10. PERMISSION ENGINE FOUNDATION (20260611000004_permission_engine_foundation.sql)
-- ----------------------------------------------------------------------------
ALTER POLICY "select_role_assignments_policy" ON public.user_role_assignments
    USING (
        tenant_id = public.get_tenant_id()
        OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF')
    );
ALTER POLICY "insert_role_assignments_policy" ON public.user_role_assignments
    WITH CHECK (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() = 'TENANT_OWNER')
        OR public.get_user_role() = 'HQ_OWNER'
    );
ALTER POLICY "update_role_assignments_policy" ON public.user_role_assignments
    USING (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() = 'TENANT_OWNER')
        OR public.get_user_role() = 'HQ_OWNER'
    )
    WITH CHECK (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() = 'TENANT_OWNER')
        OR public.get_user_role() = 'HQ_OWNER'
    );
ALTER POLICY "delete_role_assignments_policy" ON public.user_role_assignments
    USING (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() = 'TENANT_OWNER')
        OR public.get_user_role() = 'HQ_OWNER'
    );
ALTER POLICY "write_permission_matrices_policy" ON public.permission_matrices
    USING (public.get_user_role() = 'HQ_OWNER')
    WITH CHECK (public.get_user_role() = 'HQ_OWNER');

-- Comment on column documenting the role taxonomy update for future readers.
COMMENT ON COLUMN public.user_role_assignments.role IS
  'Canonical role: HQ_OWNER, HQ_STAFF, TENANT_OWNER, or TENANT_STAFF.';

-- Re-point any existing rows still carrying a legacy role value to their
-- canonical equivalent (defense-in-depth: covers rows written before this
-- migration, e.g. via direct DB seeding rather than the app's signup/
-- create-staff flows).
UPDATE public.user_role_assignments SET role = 'HQ_OWNER' WHERE role = 'HQ_ADMIN';
UPDATE public.user_role_assignments SET role = 'HQ_STAFF' WHERE role IN ('HQ_SUPPORT', 'HQ_AUDITOR');
UPDATE public.user_role_assignments SET role = 'TENANT_OWNER' WHERE role IN ('TENANT_ADMIN', 'OWNER');
UPDATE public.user_role_assignments SET role = 'TENANT_STAFF' WHERE role IN ('MANAGER', 'STAFF', 'VIEWER');

-- ----------------------------------------------------------------------------
-- 11. PERMISSION MATRICES SEED DATA — collapse to 4 canonical roles
-- ----------------------------------------------------------------------------
DELETE FROM public.permission_matrices
WHERE role NOT IN ('HQ_OWNER', 'HQ_STAFF', 'TENANT_OWNER', 'TENANT_STAFF');

INSERT INTO public.permission_matrices (role, permissions) VALUES
('HQ_OWNER', '{
  "Financial Records": {"read": true, "create": true, "update": true, "delete": true},
  "Financial Commitments": {"read": true, "create": true, "update": true, "delete": true},
  "Financial Forecast": {"read": true, "create": true, "update": true, "delete": true},
  "Financial Evidence Package": {"read": true, "create": true, "update": true, "delete": true}
}'),
('HQ_STAFF', '{
  "Financial Records": {"read": true, "create": true, "update": true, "delete": false},
  "Financial Commitments": {"read": true, "create": true, "update": true, "delete": false},
  "Financial Forecast": {"read": true, "create": true, "update": true, "delete": false},
  "Financial Evidence Package": {"read": true, "create": true, "update": true, "delete": false}
}'),
('TENANT_OWNER', '{
  "Financial Records": {"read": true, "create": true, "update": true, "delete": true},
  "Financial Commitments": {"read": true, "create": true, "update": true, "delete": true},
  "Financial Forecast": {"read": true, "create": true, "update": true, "delete": true},
  "Financial Evidence Package": {"read": true, "create": true, "update": true, "delete": true}
}'),
('TENANT_STAFF', '{
  "Financial Records": {"read": true, "create": true, "update": true, "delete": false},
  "Financial Commitments": {"read": true, "create": false, "update": false, "delete": false},
  "Financial Forecast": {"read": false, "create": false, "update": false, "delete": false},
  "Financial Evidence Package": {"read": true, "create": true, "update": true, "delete": false}
}')
ON CONFLICT (role) DO UPDATE SET permissions = EXCLUDED.permissions;

-- ----------------------------------------------------------------------------
-- 12. EVENT LOGS FOUNDATION (20260618040000_event_logs_foundation.sql)
-- Already canonical-first; drop the dangling legacy fallbacks.
-- ----------------------------------------------------------------------------
ALTER POLICY "select_event_logs_policy" ON public.event_logs
    USING (tenant_id = public.get_tenant_id() OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF'));
ALTER POLICY "insert_event_logs_policy" ON public.event_logs
    WITH CHECK (tenant_id = public.get_tenant_id() OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF'));
