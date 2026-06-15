-- ============================================================================
-- MYKERANI Database Hardening Migration Script
-- Module: OCR Learning Layer Patterns Database schema
-- Created At: 2026-06-13
-- Description: Sets up schema for OCR Learned Patterns and configures strict
--              organizational-isolated RLS policies.
-- ============================================================================

-- 1. CREATE OCR LEARNED PATTERNS TABLE
CREATE TABLE IF NOT EXISTS ocr_learned_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    vendor_name VARCHAR(150) NOT NULL,
    category VARCHAR(100) NOT NULL,
    record_type VARCHAR(50) NOT NULL, -- 'INCOME' | 'EXPENSE'
    confidence_score DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    occurrence_count INTEGER NOT NULL DEFAULT 1,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uniq_workspace_vendor UNIQUE (workspace_id, vendor_name)
);

-- 2. INDEXES FOR ISOLATED PERFORMANCE 
CREATE INDEX IF NOT EXISTS idx_ocr_learned_patterns_workspace ON ocr_learned_patterns(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ocr_learned_patterns_vendor ON ocr_learned_patterns(workspace_id, vendor_name);

-- 3. HARDEN SECURITY VIA ROW LEVEL SECURITY (RLS)
ALTER TABLE ocr_learned_patterns ENABLE ROW LEVEL SECURITY;

-- 4. RLS POLICY CLAUSES: PREVENT TENANT CROSS-INJECTIONS & WORKSPACE CREEPING

-- SELECT POLICY: Only users inside the matching tenant space can view patterns
CREATE POLICY ocr_learned_patterns_select_policy ON ocr_learned_patterns
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
CREATE POLICY ocr_learned_patterns_insert_policy ON ocr_learned_patterns
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM workspaces 
            WHERE workspaces.id = workspace_id 
              AND workspaces.tenant_id = public.get_tenant_id()
        ) 
        OR public.get_user_role() = 'HQ_ADMIN'
    );

-- UPDATE POLICY: Only allow updating patterns bound inside matching tenant container
CREATE POLICY ocr_learned_patterns_update_policy ON ocr_learned_patterns
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
CREATE POLICY ocr_learned_patterns_delete_policy ON ocr_learned_patterns
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM workspaces 
            WHERE workspaces.id = workspace_id 
              AND workspaces.tenant_id = public.get_tenant_id()
        ) 
        OR public.get_user_role() = 'HQ_ADMIN'
    );

-- 5. AUTO-TIMESTAMP UPDATE TRIGGER SETUP
CREATE OR REPLACE TRIGGER trg_update_ocr_learned_patterns_timestamp
    BEFORE UPDATE ON ocr_learned_patterns
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_column();
