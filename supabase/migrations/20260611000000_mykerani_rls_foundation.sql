-- ============================================================================
-- MYKERANI Database Hardening Migration Script
-- Row Level Security (RLS) Foundation
-- Created At: 2026-06-11
-- Description: Enables RLS across all organizational and financial tables,
--              restricting read/write operations to authenticated user context
--              bound by tenant_id and workspace_id to satisfy isolation mandates.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SECURITY CONTEXT HELPER FUNCTIONS
-- ----------------------------------------------------------------------------

-- Helper function to extract user tenant_id safely from the Supabase JWT claims
CREATE OR REPLACE FUNCTION public.get_tenant_id()
RETURNS UUID AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'tenantId',
    ''
  )::uuid;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper function to extract user security role safely from the Supabase JWT claims
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS VARCHAR AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role'),
    'TENANT_ADMIN'
  )::varchar;
$$ LANGUAGE sql STABLE SECURITY DEFINER;


-- ----------------------------------------------------------------------------
-- 2. TENANTS TABLE SECURITY POLICY
-- ----------------------------------------------------------------------------
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- SELECT policy: Users can only read their assigned tenant. HQ admins bypass.
CREATE POLICY tenants_select_policy ON tenants
    FOR SELECT TO authenticated
    USING (id = public.get_tenant_id() OR public.get_user_role() = 'HQ_ADMIN');

-- INSERT policy: Allow authenticated registration and onboarding of new tenants.
CREATE POLICY tenants_insert_policy ON tenants
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- UPDATE policy: Users can update details within their assigned tenant. HQ admins bypass.
CREATE POLICY tenants_update_policy ON tenants
    FOR UPDATE TO authenticated
    USING (id = public.get_tenant_id() OR public.get_user_role() = 'HQ_ADMIN')
    WITH CHECK (id = public.get_tenant_id() OR public.get_user_role() = 'HQ_ADMIN');

-- DELETE policy: Relational deletion restricted strictly to HQ Admins for organizational maintenance.
CREATE POLICY tenants_delete_policy ON tenants
    FOR DELETE TO authenticated
    USING (public.get_user_role() = 'HQ_ADMIN');


-- ----------------------------------------------------------------------------
-- 3. WORKSPACES TABLE SECURITY POLICY
-- ----------------------------------------------------------------------------
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

-- SELECT policy: Users can only view workspaces mapping directly to their tenant boundary.
CREATE POLICY workspaces_select_policy ON workspaces
    FOR SELECT TO authenticated
    USING (tenant_id = public.get_tenant_id() OR public.get_user_role() = 'HQ_ADMIN');

-- INSERT policy: Prevent cross-tenant injections during custom workspace creations.
CREATE POLICY workspaces_insert_policy ON workspaces
    FOR INSERT TO authenticated
    WITH CHECK (tenant_id = public.get_tenant_id() OR public.get_user_role() = 'HQ_ADMIN');

-- UPDATE policy: Workspace configuration changes are localized to tenants.
CREATE POLICY workspaces_update_policy ON workspaces
    FOR UPDATE TO authenticated
    USING (tenant_id = public.get_tenant_id() OR public.get_user_role() = 'HQ_ADMIN')
    WITH CHECK (tenant_id = public.get_tenant_id() OR public.get_user_role() = 'HQ_ADMIN');

-- DELETE policy: Restricted strictly to Tenant Admin roles of the specific tenant/HQ control.
CREATE POLICY workspaces_delete_policy ON workspaces
    FOR DELETE TO authenticated
    USING (
        (tenant_id = public.get_tenant_id() AND (public.get_user_role() IN ('TENANT_ADMIN', 'OWNER')))
        OR public.get_user_role() = 'HQ_ADMIN'
    );


-- ----------------------------------------------------------------------------
-- 4. PHYSICAL CASH ACCOUNTS SECURITY POLICY
-- ----------------------------------------------------------------------------
ALTER TABLE cash_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY cash_accounts_select_policy ON cash_accounts
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY cash_accounts_insert_policy ON cash_accounts
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY cash_accounts_update_policy ON cash_accounts
    FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN')
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY cash_accounts_delete_policy ON cash_accounts
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');


-- ----------------------------------------------------------------------------
-- 5. BANK ACCOUNTS SECURITY POLICY
-- ----------------------------------------------------------------------------
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY bank_accounts_select_policy ON bank_accounts
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY bank_accounts_insert_policy ON bank_accounts
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY bank_accounts_update_policy ON bank_accounts
    FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN')
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY bank_accounts_delete_policy ON bank_accounts
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');


-- ----------------------------------------------------------------------------
-- 6. INCOME RECORDS SECURITY POLICY
-- ----------------------------------------------------------------------------
ALTER TABLE income_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY income_records_select_policy ON income_records
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY income_records_insert_policy ON income_records
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY income_records_update_policy ON income_records
    FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN')
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY income_records_delete_policy ON income_records
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');


-- ----------------------------------------------------------------------------
-- 7. EXPENSE RECORDS SECURITY POLICY
-- ----------------------------------------------------------------------------
ALTER TABLE expense_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY expense_records_select_policy ON expense_records
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY expense_records_insert_policy ON expense_records
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY expense_records_update_policy ON expense_records
    FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN')
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY expense_records_delete_policy ON expense_records
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');


-- ----------------------------------------------------------------------------
-- 8. RECEIVABLES SECURITY POLICY
-- ----------------------------------------------------------------------------
ALTER TABLE receivables ENABLE ROW LEVEL SECURITY;

CREATE POLICY receivables_select_policy ON receivables
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY receivables_insert_policy ON receivables
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY receivables_update_policy ON receivables
    FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN')
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY receivables_delete_policy ON receivables
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');


-- ----------------------------------------------------------------------------
-- 9. PAYABLES SECURITY POLICY
-- ----------------------------------------------------------------------------
ALTER TABLE payables ENABLE ROW LEVEL SECURITY;

CREATE POLICY payables_select_policy ON payables
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY payables_insert_policy ON payables
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY payables_update_policy ON payables
    FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN')
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY payables_delete_policy ON payables
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');


-- ----------------------------------------------------------------------------
-- 10. DEBT SECURITY POLICY
-- ----------------------------------------------------------------------------
ALTER TABLE debts ENABLE ROW LEVEL SECURITY;

CREATE POLICY debts_select_policy ON debts
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY debts_insert_policy ON debts
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY debts_update_policy ON debts
    FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN')
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY debts_delete_policy ON debts
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');


-- ----------------------------------------------------------------------------
-- 11. GENERAL LEDGER CATEGORIES SECURITY POLICY
-- ----------------------------------------------------------------------------
ALTER TABLE general_ledger_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS general_ledger_categories_select_policy ON general_ledger_categories;
DROP POLICY IF EXISTS general_ledger_categories_insert_policy ON general_ledger_categories;
DROP POLICY IF EXISTS general_ledger_categories_update_policy ON general_ledger_categories;
DROP POLICY IF EXISTS general_ledger_categories_delete_policy ON general_ledger_categories;

CREATE POLICY general_ledger_categories_select_policy ON general_ledger_categories
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY general_ledger_categories_insert_policy ON general_ledger_categories
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY general_ledger_categories_update_policy ON general_ledger_categories
    FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN')
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY general_ledger_categories_delete_policy ON general_ledger_categories
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');


-- ----------------------------------------------------------------------------
-- 12. IMMUTABLE AUDIT LEDGER SECURITY POLICY
-- ----------------------------------------------------------------------------
ALTER TABLE immutable_audit_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS immutable_audit_ledger_select_policy ON immutable_audit_ledger;
DROP POLICY IF EXISTS immutable_audit_ledger_insert_policy ON immutable_audit_ledger;

CREATE POLICY immutable_audit_ledger_select_policy ON immutable_audit_ledger
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() IN ('HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR'));

CREATE POLICY immutable_audit_ledger_insert_policy ON immutable_audit_ledger
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() IN ('HQ_ADMIN', 'HQ_SUPPORT'));

