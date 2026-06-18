-- ============================================================================
-- MYKERANI Database Migration
-- Module: Profile System (Fasa 2) — Personal Profile, Business Profile,
--         Vehicles, Dependents.
-- Description: Structured, fully-optional, editable-anytime profile data the
--              AI Financial Clerk uses to disambiguate transactions (e.g.
--              "isi minyak RM50" -> ask which vehicle: Hilux (business) or
--              Myvi (personal)). Loan/financing profile data is NOT
--              duplicated here — it already exists in `debts`.
-- ============================================================================

-- 1. PERSONAL PROFILE (one row per workspace; all fields optional/skippable)
CREATE TABLE IF NOT EXISTS public.personal_profiles (
    workspace_id UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
    full_name VARCHAR(255),
    date_of_birth DATE,
    marital_status VARCHAR(30),
    occupation VARCHAR(255),
    monthly_income_myr NUMERIC(19, 4),
    dependents_count INTEGER,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 2. BUSINESS PROFILE (one row per workspace; all fields optional/skippable)
CREATE TABLE IF NOT EXISTS public.business_profiles (
    workspace_id UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
    industry VARCHAR(255),
    branch_name VARCHAR(255),
    business_type VARCHAR(100),
    registration_no VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 3. VEHICLES (many per workspace, tagged personal/business for disambiguation)
CREATE TABLE IF NOT EXISTS public.vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL, -- e.g. "Hilux", "Myvi"
    plate_number VARCHAR(50),
    vehicle_type VARCHAR(50), -- car, motorcycle, van, lorry...
    ownership VARCHAR(20) NOT NULL CHECK (ownership IN ('PERSONAL', 'BUSINESS')),
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 4. DEPENDENTS (many per workspace — family members relevant to income/expense context)
CREATE TABLE IF NOT EXISTS public.dependents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    relationship VARCHAR(100), -- spouse, child, parent...
    date_of_birth DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 5. INDEXES
CREATE INDEX IF NOT EXISTS idx_vehicles_workspace ON public.vehicles(workspace_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_workspace_active ON public.vehicles(workspace_id, is_active);
CREATE INDEX IF NOT EXISTS idx_dependents_workspace ON public.dependents(workspace_id);

-- 6. RLS — tenant-isolated, fully mutable (these are user-editable profile
-- settings, unlike audit/event logs which are immutable).
ALTER TABLE public.personal_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dependents ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['personal_profiles', 'business_profiles', 'vehicles', 'dependents']
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_profiles, public.business_profiles, public.vehicles, public.dependents TO authenticated, service_role;

-- 7. AUTO-TIMESTAMP TRIGGERS (set_updated_at_column already exists from
-- 20260611000001_financial_commitments_setup.sql)
CREATE OR REPLACE TRIGGER trg_update_personal_profiles_timestamp
    BEFORE UPDATE ON public.personal_profiles
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_column();

CREATE OR REPLACE TRIGGER trg_update_business_profiles_timestamp
    BEFORE UPDATE ON public.business_profiles
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_column();

CREATE OR REPLACE TRIGGER trg_update_vehicles_timestamp
    BEFORE UPDATE ON public.vehicles
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_column();
