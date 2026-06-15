-- ============================================================================
-- MYKERANI Database Hardening Migration Script
-- Module: Financial Evidence Packages (Receipts, Invoices, Statements, Supporting Docs)
-- Created At: 2026-06-11
-- Description: Sets up structural schema for Financial Evidence Packages 
--              and configures strict organizational-isolated RLS policies.
-- ============================================================================

-- 1. CREATE ENUM AND STRUCTURES SAFELY IF NOT PRESENT
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'evidence_document_type') THEN
        CREATE TYPE evidence_document_type AS ENUM ('RECEIPT', 'INVOICE', 'STATEMENT', 'SUPPORTING_DOC');
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. CREATE FINANCIAL EVIDENCE PACKAGES TABLE
CREATE TABLE IF NOT EXISTS financial_evidence_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    document_type evidence_document_type NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL, -- Path/URL to the stored file
    upload_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    related_record_type VARCHAR(50) NULL, -- 'INCOME' | 'EXPENSE' | 'RECEIVABLE' | 'PAYABLE' | 'DEBT' | 'COMMITMENT'
    related_record_id VARCHAR(100) NULL, -- ID of the mapped transaction/event
    notes TEXT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 3. INDEXES FOR ISOLATED PERFORMANCE 
CREATE INDEX IF NOT EXISTS idx_financial_evidence_workspace ON financial_evidence_packages(workspace_id);
CREATE INDEX IF NOT EXISTS idx_financial_evidence_relations ON financial_evidence_packages(workspace_id, related_record_type, related_record_id);

-- 4. HARDEN SECURITY VIA ROW LEVEL SECURITY (RLS)
ALTER TABLE financial_evidence_packages ENABLE ROW LEVEL SECURITY;

-- 5. RLS POLICY CLAUSES: PREVENT TENANT CROSS-INJECTIONS & WORKSPACE CREEPING

-- SELECT POLICY: Only users inside the matching tenant space can view evidence packages
CREATE POLICY financial_evidence_packages_select_policy ON financial_evidence_packages
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM workspaces 
            WHERE workspaces.id = workspace_id 
              AND workspaces.tenant_id = public.get_tenant_id()
        ) 
        OR public.get_user_role() = 'HQ_ADMIN'
    );

-- INSERT POLICY: Assure injected values are bound within the user's tenant container
CREATE POLICY financial_evidence_packages_insert_policy ON financial_evidence_packages
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM workspaces 
            WHERE workspaces.id = workspace_id 
              AND workspaces.tenant_id = public.get_tenant_id()
        ) 
        OR public.get_user_role() = 'HQ_ADMIN'
    );

-- UPDATE POLICY: Only allow updating evidence packages bound inside matching tenant container
CREATE POLICY financial_evidence_packages_update_policy ON financial_evidence_packages
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM workspaces 
            WHERE workspaces.id = workspace_id 
              AND workspaces.tenant_id = public.get_tenant_id()
        ) 
        OR public.get_user_role() = 'HQ_ADMIN'
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM workspaces 
            WHERE workspaces.id = workspace_id 
              AND workspaces.tenant_id = public.get_tenant_id()
        ) 
        OR public.get_user_role() = 'HQ_ADMIN'
    );

-- DELETE POLICY: Deletions restricted strictly within authorized tenant workspace limits
CREATE POLICY financial_evidence_packages_delete_policy ON financial_evidence_packages
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM workspaces 
            WHERE workspaces.id = workspace_id 
              AND workspaces.tenant_id = public.get_tenant_id()
        ) 
        OR public.get_user_role() = 'HQ_ADMIN'
    );

-- 6. AUTO-TIMESTAMP UPDATE TRIGGER SETUP
CREATE OR REPLACE TRIGGER trg_update_financial_evidence_packages_timestamp
    BEFORE UPDATE ON financial_evidence_packages
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_column();
