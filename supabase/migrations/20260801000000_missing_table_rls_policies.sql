-- ============================================================================
-- MYKERANI Database Hardening Migration Script
-- Module: Missing / Hardened RLS Policies
-- Created At: 2026-08-01
-- Description: Closes two categories of RLS gaps discovered during the
--              Tenant Ecosystem Remediation audit:
--
--   1. personal_profiles, business_profiles, vehicles, dependents,
--      businesses, business_branches — these tables already have
--      SELECT/INSERT/UPDATE/DELETE policies (20260618120000 and
--      20260622000000), but their DELETE policies allow any authenticated
--      workspace member to delete rows.  The correct intent is that only
--      TENANT_OWNER (or HQ_OWNER) may delete.  This migration replaces the
--      existing DELETE policies with role-restricted ones, and also adds the
--      HQ_OWNER escape hatch to UPDATE policies that were missing it.
--
--   2. asset_purchases, owner_transactions — these tables (created in
--      20260618130000) have SELECT/INSERT/DELETE but are entirely missing an
--      UPDATE policy, so any UPDATE attempt is silently blocked by RLS.
--      This migration adds the missing UPDATE policies.
--
-- All statements are idempotent (DROP POLICY IF EXISTS before CREATE POLICY).
-- ============================================================================

-- ============================================================================
-- SECTION 1: personal_profiles
-- PK = workspace_id (one row per workspace).
-- RLS already enabled in 20260618120000_profile_system.sql — no-op here.
-- ============================================================================
ALTER TABLE public.personal_profiles ENABLE ROW LEVEL SECURITY;

-- SELECT: own workspace (via tenant membership) OR any HQ role
DROP POLICY IF EXISTS personal_profiles_select_policy ON public.personal_profiles;
CREATE POLICY personal_profiles_select_policy ON public.personal_profiles
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = personal_profiles.workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
        OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF', 'HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR')
    );

-- INSERT: own workspace only
DROP POLICY IF EXISTS personal_profiles_insert_policy ON public.personal_profiles;
CREATE POLICY personal_profiles_insert_policy ON public.personal_profiles
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = personal_profiles.workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
    );

-- UPDATE: own workspace OR HQ_OWNER
DROP POLICY IF EXISTS personal_profiles_update_policy ON public.personal_profiles;
CREATE POLICY personal_profiles_update_policy ON public.personal_profiles
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = personal_profiles.workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
        OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF', 'HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR')
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = personal_profiles.workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
        OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF', 'HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR')
    );

-- DELETE: TENANT_OWNER of own workspace OR HQ_OWNER
DROP POLICY IF EXISTS personal_profiles_delete_policy ON public.personal_profiles;
CREATE POLICY personal_profiles_delete_policy ON public.personal_profiles
    FOR DELETE TO authenticated
    USING (
        (
            EXISTS (
                SELECT 1 FROM public.workspaces
                WHERE workspaces.id = personal_profiles.workspace_id
                  AND workspaces.tenant_id = public.get_tenant_id()
            )
            AND public.get_user_role() = 'TENANT_OWNER'
        )
        OR public.get_user_role() = 'HQ_OWNER'
    );

-- ============================================================================
-- SECTION 2: business_profiles
-- PK = workspace_id (one row per workspace).
-- RLS already enabled in 20260618120000_profile_system.sql — no-op here.
-- ============================================================================
ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;

-- SELECT
DROP POLICY IF EXISTS business_profiles_select_policy ON public.business_profiles;
CREATE POLICY business_profiles_select_policy ON public.business_profiles
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = business_profiles.workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
        OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF', 'HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR')
    );

-- INSERT
DROP POLICY IF EXISTS business_profiles_insert_policy ON public.business_profiles;
CREATE POLICY business_profiles_insert_policy ON public.business_profiles
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = business_profiles.workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
    );

-- UPDATE
DROP POLICY IF EXISTS business_profiles_update_policy ON public.business_profiles;
CREATE POLICY business_profiles_update_policy ON public.business_profiles
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = business_profiles.workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
        OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF', 'HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR')
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = business_profiles.workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
        OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF', 'HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR')
    );

-- DELETE: TENANT_OWNER OR HQ_OWNER
DROP POLICY IF EXISTS business_profiles_delete_policy ON public.business_profiles;
CREATE POLICY business_profiles_delete_policy ON public.business_profiles
    FOR DELETE TO authenticated
    USING (
        (
            EXISTS (
                SELECT 1 FROM public.workspaces
                WHERE workspaces.id = business_profiles.workspace_id
                  AND workspaces.tenant_id = public.get_tenant_id()
            )
            AND public.get_user_role() = 'TENANT_OWNER'
        )
        OR public.get_user_role() = 'HQ_OWNER'
    );

-- ============================================================================
-- SECTION 3: vehicles (workspace_id FK, many per workspace)
-- RLS already enabled in 20260618120000_profile_system.sql — no-op here.
-- ============================================================================
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

-- SELECT
DROP POLICY IF EXISTS vehicles_select_policy ON public.vehicles;
CREATE POLICY vehicles_select_policy ON public.vehicles
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = vehicles.workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
        OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF', 'HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR')
    );

-- INSERT
DROP POLICY IF EXISTS vehicles_insert_policy ON public.vehicles;
CREATE POLICY vehicles_insert_policy ON public.vehicles
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = vehicles.workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
    );

-- UPDATE
DROP POLICY IF EXISTS vehicles_update_policy ON public.vehicles;
CREATE POLICY vehicles_update_policy ON public.vehicles
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = vehicles.workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
        OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF', 'HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR')
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = vehicles.workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
        OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF', 'HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR')
    );

-- DELETE: TENANT_OWNER OR HQ_OWNER
DROP POLICY IF EXISTS vehicles_delete_policy ON public.vehicles;
CREATE POLICY vehicles_delete_policy ON public.vehicles
    FOR DELETE TO authenticated
    USING (
        (
            EXISTS (
                SELECT 1 FROM public.workspaces
                WHERE workspaces.id = vehicles.workspace_id
                  AND workspaces.tenant_id = public.get_tenant_id()
            )
            AND public.get_user_role() = 'TENANT_OWNER'
        )
        OR public.get_user_role() = 'HQ_OWNER'
    );

-- ============================================================================
-- SECTION 4: dependents (workspace_id FK, many per workspace)
-- RLS already enabled in 20260618120000_profile_system.sql — no-op here.
-- ============================================================================
ALTER TABLE public.dependents ENABLE ROW LEVEL SECURITY;

-- SELECT
DROP POLICY IF EXISTS dependents_select_policy ON public.dependents;
CREATE POLICY dependents_select_policy ON public.dependents
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = dependents.workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
        OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF', 'HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR')
    );

-- INSERT
DROP POLICY IF EXISTS dependents_insert_policy ON public.dependents;
CREATE POLICY dependents_insert_policy ON public.dependents
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = dependents.workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
    );

-- UPDATE
DROP POLICY IF EXISTS dependents_update_policy ON public.dependents;
CREATE POLICY dependents_update_policy ON public.dependents
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = dependents.workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
        OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF', 'HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR')
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = dependents.workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
        OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF', 'HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR')
    );

-- DELETE: TENANT_OWNER OR HQ_OWNER
DROP POLICY IF EXISTS dependents_delete_policy ON public.dependents;
CREATE POLICY dependents_delete_policy ON public.dependents
    FOR DELETE TO authenticated
    USING (
        (
            EXISTS (
                SELECT 1 FROM public.workspaces
                WHERE workspaces.id = dependents.workspace_id
                  AND workspaces.tenant_id = public.get_tenant_id()
            )
            AND public.get_user_role() = 'TENANT_OWNER'
        )
        OR public.get_user_role() = 'HQ_OWNER'
    );

-- ============================================================================
-- SECTION 5: businesses (workspace_id FK, many per workspace)
-- RLS already enabled in 20260622000000_multi_business_support.sql — no-op here.
-- ============================================================================
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

-- SELECT
DROP POLICY IF EXISTS businesses_select_policy ON public.businesses;
CREATE POLICY businesses_select_policy ON public.businesses
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = businesses.workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
        OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF', 'HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR')
    );

-- INSERT: workspace-in-tenant (any authenticated member)
DROP POLICY IF EXISTS businesses_insert_policy ON public.businesses;
CREATE POLICY businesses_insert_policy ON public.businesses
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = businesses.workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
    );

-- UPDATE: own workspace OR HQ override
DROP POLICY IF EXISTS businesses_update_policy ON public.businesses;
CREATE POLICY businesses_update_policy ON public.businesses
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = businesses.workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
        OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF', 'HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR')
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = businesses.workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
        OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF', 'HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR')
    );

-- DELETE: TENANT_OWNER OR HQ_OWNER
DROP POLICY IF EXISTS businesses_delete_policy ON public.businesses;
CREATE POLICY businesses_delete_policy ON public.businesses
    FOR DELETE TO authenticated
    USING (
        (
            EXISTS (
                SELECT 1 FROM public.workspaces
                WHERE workspaces.id = businesses.workspace_id
                  AND workspaces.tenant_id = public.get_tenant_id()
            )
            AND public.get_user_role() = 'TENANT_OWNER'
        )
        OR public.get_user_role() = 'HQ_OWNER'
    );

-- ============================================================================
-- SECTION 6: business_branches (workspace_id FK + business_id FK)
-- RLS already enabled in 20260622000000_multi_business_support.sql — no-op here.
-- ============================================================================
ALTER TABLE public.business_branches ENABLE ROW LEVEL SECURITY;

-- SELECT
DROP POLICY IF EXISTS business_branches_select_policy ON public.business_branches;
CREATE POLICY business_branches_select_policy ON public.business_branches
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = business_branches.workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
        OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF', 'HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR')
    );

-- INSERT: workspace-in-tenant
DROP POLICY IF EXISTS business_branches_insert_policy ON public.business_branches;
CREATE POLICY business_branches_insert_policy ON public.business_branches
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = business_branches.workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
    );

-- UPDATE: own workspace OR HQ override
DROP POLICY IF EXISTS business_branches_update_policy ON public.business_branches;
CREATE POLICY business_branches_update_policy ON public.business_branches
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = business_branches.workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
        OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF', 'HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR')
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = business_branches.workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
        OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF', 'HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR')
    );

-- DELETE: TENANT_OWNER OR HQ_OWNER
DROP POLICY IF EXISTS business_branches_delete_policy ON public.business_branches;
CREATE POLICY business_branches_delete_policy ON public.business_branches
    FOR DELETE TO authenticated
    USING (
        (
            EXISTS (
                SELECT 1 FROM public.workspaces
                WHERE workspaces.id = business_branches.workspace_id
                  AND workspaces.tenant_id = public.get_tenant_id()
            )
            AND public.get_user_role() = 'TENANT_OWNER'
        )
        OR public.get_user_role() = 'HQ_OWNER'
    );

-- ============================================================================
-- SECTION 7: asset_purchases — ADD MISSING UPDATE POLICY
-- SELECT/INSERT/DELETE already exist in 20260618130000_asset_owner_transactions.sql.
-- ============================================================================
ALTER TABLE public.asset_purchases ENABLE ROW LEVEL SECURITY;

-- UPDATE (net-new — was entirely absent)
DROP POLICY IF EXISTS asset_purchases_update_policy ON public.asset_purchases;
CREATE POLICY asset_purchases_update_policy ON public.asset_purchases
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = asset_purchases.workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
        OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF', 'HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR')
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = asset_purchases.workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
        OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF', 'HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR')
    );

-- Harden DELETE to TENANT_OWNER / HQ_OWNER only (replaces open workspace-member DELETE)
DROP POLICY IF EXISTS asset_purchases_delete_policy ON public.asset_purchases;
CREATE POLICY asset_purchases_delete_policy ON public.asset_purchases
    FOR DELETE TO authenticated
    USING (
        (
            EXISTS (
                SELECT 1 FROM public.workspaces
                WHERE workspaces.id = asset_purchases.workspace_id
                  AND workspaces.tenant_id = public.get_tenant_id()
            )
            AND public.get_user_role() = 'TENANT_OWNER'
        )
        OR public.get_user_role() = 'HQ_OWNER'
    );

-- Also grant UPDATE privilege to authenticated role (was not included in
-- original GRANT which only covered SELECT, INSERT, DELETE)
GRANT UPDATE ON public.asset_purchases TO authenticated, service_role;

-- ============================================================================
-- SECTION 8: owner_transactions — ADD MISSING UPDATE POLICY
-- SELECT/INSERT/DELETE already exist in 20260618130000_asset_owner_transactions.sql.
-- ============================================================================
ALTER TABLE public.owner_transactions ENABLE ROW LEVEL SECURITY;

-- UPDATE (net-new — was entirely absent)
DROP POLICY IF EXISTS owner_transactions_update_policy ON public.owner_transactions;
CREATE POLICY owner_transactions_update_policy ON public.owner_transactions
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = owner_transactions.workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
        OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF', 'HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR')
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = owner_transactions.workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
        OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF', 'HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR')
    );

-- Harden DELETE to TENANT_OWNER / HQ_OWNER only (replaces open workspace-member DELETE)
DROP POLICY IF EXISTS owner_transactions_delete_policy ON public.owner_transactions;
CREATE POLICY owner_transactions_delete_policy ON public.owner_transactions
    FOR DELETE TO authenticated
    USING (
        (
            EXISTS (
                SELECT 1 FROM public.workspaces
                WHERE workspaces.id = owner_transactions.workspace_id
                  AND workspaces.tenant_id = public.get_tenant_id()
            )
            AND public.get_user_role() = 'TENANT_OWNER'
        )
        OR public.get_user_role() = 'HQ_OWNER'
    );

-- Also grant UPDATE privilege to authenticated role (was not included in
-- original GRANT which only covered SELECT, INSERT, DELETE)
GRANT UPDATE ON public.owner_transactions TO authenticated, service_role;
