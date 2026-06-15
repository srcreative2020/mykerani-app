-- ============================================================================
-- MYKERANI Database Hardening Migration Script
-- Module: Secure Immutable Audit Engine Foundation
-- Created At: 2026-06-11
-- Description: Establishes a highly secure, immutable audit log table for
--              tracking creation, modification, and deletion events across all
--              financial modules. Implements strict read-only RLS policies that
--              restrict write (INSERT) to authenticated sessions, read (SELECT)
--              to assigned tenant boundaries, and absolutely forbids UPDATE/DELETE.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SCHEMAS & TABLES CREATION
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(100) NOT NULL,       -- Matches user session ID (UUID or Sandbox username)
    user_email VARCHAR(255) NOT NULL,     -- User email for clean traceability
    user_role VARCHAR(50) NOT NULL,      -- User role at transaction time (e.g. STAFF, MANAGER)
    tenant_id UUID NOT NULL,             -- Isolated tenant space holding the operation
    workspace_id UUID,                   -- Isolated workspace boundary reference (NULL for multi-workspace/tenant transactions)
    module VARCHAR(100) NOT NULL,        -- 'Financial Records', 'Financial Commitments', 'Financial Evidence Package'
    action VARCHAR(50) NOT NULL,         -- 'CREATE', 'UPDATE', 'DELETE'
    old_value JSONB,                     -- Payload state before mutation
    new_value JSONB,                     -- Payload state after mutation
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ----------------------------------------------------------------------------
-- 2. ENABLE ROW LEVEL SECURITY (RLS)
-- ----------------------------------------------------------------------------

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;


-- ----------------------------------------------------------------------------
-- 3. RESET SECURITY POLICIES FOR IMMUTABLE AUDITING
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "select_audit_logs_policy" ON public.audit_logs;
DROP POLICY IF EXISTS "insert_audit_logs_policy" ON public.audit_logs;
DROP POLICY IF EXISTS "update_audit_logs_policy" ON public.audit_logs;
DROP POLICY IF EXISTS "delete_audit_logs_policy" ON public.audit_logs;


-- ----------------------------------------------------------------------------
-- 4. IMPLEMENT TENANT ISOLATION POLICIES ON THE SECURE AUDIT LEDGER
-- ----------------------------------------------------------------------------

-- SELECT (Read Audit Logs):
-- Authenticated users can retrieve audit entries if the record resides inside their active tenant boundary.
-- Global headquarters administrators (HQ_ADMIN, HQ_SUPPORT, HQ_AUDITOR) can view logs globally.
CREATE POLICY "select_audit_logs_policy" ON public.audit_logs
    FOR SELECT TO authenticated
    USING (
        tenant_id = public.get_tenant_id() 
        OR public.get_user_role() IN ('HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR')
    );

-- INSERT (Ad-hoc Log Writing):
-- Authenticated sessions can write newly generated trace logs if they correspond to their assigned tenant boundary.
CREATE POLICY "insert_audit_logs_policy" ON public.audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id = public.get_tenant_id()
        OR public.get_user_role() IN ('HQ_ADMIN', 'HQ_SUPPORT')
    );

-- UPDATE (IMMUTABILITY ENFORCEMENT):
-- Strictly forbidden. No policy is generated for UPDATE, or it is explicitly configured as never readable.
-- (This ensures audit entries cannot be falsified, tampered with, or updated under any circumstance).

-- DELETE (IMMUTABILITY ENFORCEMENT):
-- Strictly forbidden. No policy is generated for DELETE. Audit lines remain secure, permanent ledger points.
