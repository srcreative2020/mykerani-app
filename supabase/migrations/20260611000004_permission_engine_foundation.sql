-- ============================================================================
-- MYKERANI Database Hardening Migration Script
-- Module: Permission Engine Foundation (Roles, User Assignment, Matrix, Isolation)
-- Created At: 2026-06-11
-- Description: Establishes database structures for role assignments and permission
--              matrices. Implements strict RLS policies ensuring tenant/workspace
--              boundaries are maintained, restricting write access to tenant admins.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SCHEMAS & TABLES CREATION
-- ----------------------------------------------------------------------------

-- Role Assignment Table
CREATE TABLE IF NOT EXISTS public.user_role_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(100) NOT NULL, -- Supports actual Supabase Auth UUID and Mock Sandbox usernames
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL, -- HQ_ADMIN, HQ_SUPPORT, HQ_AUDITOR, TENANT_OWNER, TENANT_ADMIN, MANAGER, STAFF, VIEWER
    tenant_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_tenant_user_role UNIQUE (tenant_id, email)
);

-- Permission Matrices Configuration Table
CREATE TABLE IF NOT EXISTS public.permission_matrices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role VARCHAR(50) NOT NULL UNIQUE,
    permissions JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ----------------------------------------------------------------------------
-- 2. ENABLE ROW LEVEL SECURITY (RLS)
-- ----------------------------------------------------------------------------
ALTER TABLE public.user_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_matrices ENABLE ROW LEVEL SECURITY;


-- ----------------------------------------------------------------------------
-- 3. RESET SECURITY POLICIES FOR ASSIGNMENTS & MATRICES
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "select_role_assignments_policy" ON public.user_role_assignments;
DROP POLICY IF EXISTS "insert_role_assignments_policy" ON public.user_role_assignments;
DROP POLICY IF EXISTS "update_role_assignments_policy" ON public.user_role_assignments;
DROP POLICY IF EXISTS "delete_role_assignments_policy" ON public.user_role_assignments;

DROP POLICY IF EXISTS "select_permission_matrices_policy" ON public.permission_matrices;
DROP POLICY IF EXISTS "write_permission_matrices_policy" ON public.permission_matrices;


-- ----------------------------------------------------------------------------
-- 4. IMPLEMENT TENANT ISOLATION ON USER ROLE ASSIGNMENTS
-- ----------------------------------------------------------------------------

-- SELECT: Users can retrieve role assignments belonging to their active tenant context. HQ_ADMINs bypass globally.
CREATE POLICY "select_role_assignments_policy" ON public.user_role_assignments
    FOR SELECT TO authenticated
    USING (
        tenant_id = public.get_tenant_id() 
        OR public.get_user_role() IN ('HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR')
    );

-- INSERT: Only Tenant Owners, Tenant Admins, or HQ_ADMIN/HQ_SUPPORT can assign roles within their tenant boundary.
CREATE POLICY "insert_role_assignments_policy" ON public.user_role_assignments
    FOR INSERT TO authenticated
    WITH CHECK (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('TENANT_OWNER', 'TENANT_ADMIN'))
        OR public.get_user_role() IN ('HQ_ADMIN', 'HQ_SUPPORT')
    );

-- UPDATE: Only Tenant Owners, Tenant Admins, or HQ_ADMINs can update roles within their tenant boundary.
CREATE POLICY "update_role_assignments_policy" ON public.user_role_assignments
    FOR UPDATE TO authenticated
    USING (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('TENANT_OWNER', 'TENANT_ADMIN'))
        OR public.get_user_role() = 'HQ_ADMIN'
    )
    WITH CHECK (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('TENANT_OWNER', 'TENANT_ADMIN'))
        OR public.get_user_role() = 'HQ_ADMIN'
    );

-- DELETE: Admins can remove role assignments from their assigned tenant context.
CREATE POLICY "delete_role_assignments_policy" ON public.user_role_assignments
    FOR DELETE TO authenticated
    USING (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('TENANT_OWNER', 'TENANT_ADMIN'))
        OR public.get_user_role() = 'HQ_ADMIN'
    );


-- ----------------------------------------------------------------------------
-- 5. IMPLEMENT ACCESS CONTROL ON GLOBAL PERMISSION MATRICES
-- ----------------------------------------------------------------------------

-- SELECT: All authenticated users can read the permission matrices.
CREATE POLICY "select_permission_matrices_policy" ON public.permission_matrices
    FOR SELECT TO authenticated
    USING (true);

-- WRITE (Insert, Update, Delete): Only HQ_ADMINs can customize the global matrix configuration.
CREATE POLICY "write_permission_matrices_policy" ON public.permission_matrices
    FOR ALL TO authenticated
    USING (public.get_user_role() = 'HQ_ADMIN')
    WITH CHECK (public.get_user_role() = 'HQ_ADMIN');


-- ----------------------------------------------------------------------------
-- 6. SEED DEFAULT DATA VALUES
-- ----------------------------------------------------------------------------

-- Seed default permissions matrices for all 8 roles
INSERT INTO public.permission_matrices (role, permissions) VALUES
('HQ_ADMIN', '{
  "Financial Records": {"read": true, "create": true, "update": true, "delete": true},
  "Financial Commitments": {"read": true, "create": true, "update": true, "delete": true},
  "Financial Forecast": {"read": true, "create": true, "update": true, "delete": true},
  "Financial Evidence Package": {"read": true, "create": true, "update": true, "delete": true}
}'),
('HQ_SUPPORT', '{
  "Financial Records": {"read": true, "create": true, "update": true, "delete": false},
  "Financial Commitments": {"read": true, "create": true, "update": true, "delete": false},
  "Financial Forecast": {"read": true, "create": true, "update": true, "delete": false},
  "Financial Evidence Package": {"read": true, "create": true, "update": true, "delete": false}
}'),
('HQ_AUDITOR', '{
  "Financial Records": {"read": true, "create": false, "update": false, "delete": false},
  "Financial Commitments": {"read": true, "create": false, "update": false, "delete": false},
  "Financial Forecast": {"read": true, "create": false, "update": false, "delete": false},
  "Financial Evidence Package": {"read": true, "create": false, "update": false, "delete": false}
}'),
('TENANT_OWNER', '{
  "Financial Records": {"read": true, "create": true, "update": true, "delete": true},
  "Financial Commitments": {"read": true, "create": true, "update": true, "delete": true},
  "Financial Forecast": {"read": true, "create": true, "update": true, "delete": true},
  "Financial Evidence Package": {"read": true, "create": true, "update": true, "delete": true}
}'),
('TENANT_ADMIN', '{
  "Financial Records": {"read": true, "create": true, "update": true, "delete": true},
  "Financial Commitments": {"read": true, "create": true, "update": true, "delete": true},
  "Financial Forecast": {"read": true, "create": true, "update": true, "delete": true},
  "Financial Evidence Package": {"read": true, "create": true, "update": true, "delete": true}
}'),
('MANAGER', '{
  "Financial Records": {"read": true, "create": true, "update": true, "delete": true},
  "Financial Commitments": {"read": true, "create": true, "update": true, "delete": true},
  "Financial Forecast": {"read": true, "create": false, "update": false, "delete": false},
  "Financial Evidence Package": {"read": true, "create": true, "update": true, "delete": true}
}'),
('STAFF', '{
  "Financial Records": {"read": true, "create": true, "update": true, "delete": false},
  "Financial Commitments": {"read": true, "create": false, "update": false, "delete": false},
  "Financial Forecast": {"read": false, "create": false, "update": false, "delete": false},
  "Financial Evidence Package": {"read": true, "create": true, "update": true, "delete": false}
}'),
('VIEWER', '{
  "Financial Records": {"read": true, "create": false, "update": false, "delete": false},
  "Financial Commitments": {"read": true, "create": false, "update": false, "delete": false},
  "Financial Forecast": {"read": true, "create": false, "update": false, "delete": false},
  "Financial Evidence Package": {"read": true, "create": false, "update": false, "delete": false}
}')
ON CONFLICT (role) DO UPDATE SET permissions = EXCLUDED.permissions;
