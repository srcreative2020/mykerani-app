-- ============================================================================
-- MYKERANI Database Migration
-- Module: Multi-Business Support
-- Description: Converts the single-business-per-workspace `business_profiles`
--              singleton into a multi-row `businesses` table (many per
--              workspace, CRUD), plus `business_branches` (many per
--              business). Modeled exactly on the existing `vehicles` table
--              pattern. `business_profiles` is left in place (not dropped)
--              to avoid destructive migration; app code stops using it.
-- ============================================================================

-- 1. BUSINESSES (many per workspace)
CREATE TABLE IF NOT EXISTS public.businesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    business_name VARCHAR(255) NOT NULL,
    industry VARCHAR(255),
    business_type VARCHAR(100),
    registration_no VARCHAR(100),
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 2. BUSINESS BRANCHES (many per business)
CREATE TABLE IF NOT EXISTS public.business_branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    branch_name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_businesses_workspace ON public.businesses(workspace_id);
CREATE INDEX IF NOT EXISTS idx_businesses_workspace_active ON public.businesses(workspace_id, is_active);
CREATE INDEX IF NOT EXISTS idx_business_branches_workspace ON public.business_branches(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_branches_business ON public.business_branches(business_id);

-- 4. RLS — tenant-isolated, fully mutable (same pattern as vehicles/dependents
-- in 20260618120000_profile_system.sql).
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_branches ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['businesses', 'business_branches']
    LOOP
        EXECUTE format($f$
            DROP POLICY IF EXISTS %1$I_select_policy ON public.%1$I;
            CREATE POLICY %1$I_select_policy ON public.%1$I
                FOR SELECT TO authenticated
                USING (
                    EXISTS (
                        SELECT 1 FROM public.workspaces
                        WHERE workspaces.id = %1$I.workspace_id
                          AND workspaces.tenant_id = public.get_tenant_id()
                    )
                    OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF', 'HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR')
                );

            DROP POLICY IF EXISTS %1$I_insert_policy ON public.%1$I;
            CREATE POLICY %1$I_insert_policy ON public.%1$I
                FOR INSERT TO authenticated
                WITH CHECK (
                    EXISTS (
                        SELECT 1 FROM public.workspaces
                        WHERE workspaces.id = %1$I.workspace_id
                          AND workspaces.tenant_id = public.get_tenant_id()
                    )
                );

            DROP POLICY IF EXISTS %1$I_update_policy ON public.%1$I;
            CREATE POLICY %1$I_update_policy ON public.%1$I
                FOR UPDATE TO authenticated
                USING (
                    EXISTS (
                        SELECT 1 FROM public.workspaces
                        WHERE workspaces.id = %1$I.workspace_id
                          AND workspaces.tenant_id = public.get_tenant_id()
                    )
                )
                WITH CHECK (
                    EXISTS (
                        SELECT 1 FROM public.workspaces
                        WHERE workspaces.id = %1$I.workspace_id
                          AND workspaces.tenant_id = public.get_tenant_id()
                    )
                );

            DROP POLICY IF EXISTS %1$I_delete_policy ON public.%1$I;
            CREATE POLICY %1$I_delete_policy ON public.%1$I
                FOR DELETE TO authenticated
                USING (
                    EXISTS (
                        SELECT 1 FROM public.workspaces
                        WHERE workspaces.id = %1$I.workspace_id
                          AND workspaces.tenant_id = public.get_tenant_id()
                    )
                );
        $f$, t);
    END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.businesses, public.business_branches TO authenticated, service_role;

-- 5. AUTO-TIMESTAMP TRIGGERS (set_updated_at_column already exists from
-- 20260611000001_financial_commitments_setup.sql)
CREATE OR REPLACE TRIGGER trg_update_businesses_timestamp
    BEFORE UPDATE ON public.businesses
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_column();

CREATE OR REPLACE TRIGGER trg_update_business_branches_timestamp
    BEFORE UPDATE ON public.business_branches
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_column();

-- 6. DATA MIGRATION — carry forward any existing singleton business_profiles
-- rows into the new multi-row businesses table so no data is lost.
-- business_profiles never had a name field (only branch_name/industry), so
-- fall back through branch_name -> industry -> a generic default.
INSERT INTO public.businesses (workspace_id, business_name, industry, business_type, registration_no, notes)
SELECT workspace_id,
       COALESCE(branch_name, industry, 'Bisnes Utama'),
       industry,
       business_type,
       registration_no,
       notes
FROM public.business_profiles
WHERE NOT EXISTS (
    SELECT 1 FROM public.businesses b WHERE b.workspace_id = business_profiles.workspace_id
);
