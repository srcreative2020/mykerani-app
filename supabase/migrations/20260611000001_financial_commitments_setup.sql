-- ============================================================================
-- MYKERANI Database Hardening Migration Script
-- Module: Financial Commitments Module Setup & Row Level Security (RLS) policies
-- Created At: 2026-06-11
-- Description: Sets up the structural schema for financial commitments (rent,
--              long-term utilities, internet, leasing, insurance contracts) 
--              and configures strict organizational-isolated RLS policies.
-- ============================================================================

-- 1. CREATE ENUM AND STRUCTURES SAFELY IF NOT PRESENT
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'commitment_recurrence_type') THEN
        CREATE TYPE commitment_recurrence_type AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'ONE-TIME');
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. CREATE FINANCIAL COMMITMENTS TABLE
CREATE TABLE IF NOT EXISTS financial_commitments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    description TEXT NOT NULL,
    contract_number VARCHAR(100),
    obligee_name VARCHAR(255) NOT NULL, -- Supplier/Entity to pay (e.g. TNB, Telekom, landlord)
    amount_per_interval_myr NUMERIC(19, 4) NOT NULL CHECK (amount_per_interval_myr > 0),
    recurrence commitment_recurrence_type NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NULL, -- Null means perpetual contract indefinitely
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_end_after_start CHECK (end_date IS NULL OR end_date >= start_date)
);

-- 3. INDEXES FOR ISOLATED PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_financial_commitments_workspace ON financial_commitments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_financial_commitments_active ON financial_commitments(workspace_id, is_active);

-- 4. HARDEN SECURITY VIA ROW LEVEL SECURITY (RLS)
ALTER TABLE financial_commitments ENABLE ROW LEVEL SECURITY;

-- 5. RLS POLICY CLAUSES: PREVENT TENANT CROSS-INJECTIONS & WORKSPACE CREEPING
-- Extract tenant_id from public.get_tenant_id() established in Foundation RLS migration

-- SELECT POLICY: Only users inside the matching tenant space can view commitments
CREATE POLICY financial_commitments_select_policy ON financial_commitments
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
CREATE POLICY financial_commitments_insert_policy ON financial_commitments
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM workspaces 
            WHERE workspaces.id = workspace_id 
              AND workspaces.tenant_id = public.get_tenant_id()
        ) 
        OR public.get_user_role() = 'HQ_ADMIN'
    );

-- UPDATE POLICY: Only allow updating commitments bound inside matching tenant container
CREATE POLICY financial_commitments_update_policy ON financial_commitments
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
CREATE POLICY financial_commitments_delete_policy ON financial_commitments
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
CREATE OR REPLACE FUNCTION set_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_update_financial_commitments_timestamp
    BEFORE UPDATE ON financial_commitments
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_column();
