-- ============================================================================
-- MYKERANI Database Migration Script
-- Module: Secure Workspace Storage Provider Registry
-- Created At: 2026-06-14
-- Description: Establishes the workspace storage provider registry for 
--              multi-tenant isolated BYOS (Bring Your Own Storage) / Storage Foundation.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.workspace_storage_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL UNIQUE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    provider_type VARCHAR(50) NOT NULL DEFAULT 'HQ_MANAGED', -- 'HQ_MANAGED' | 'GOOGLE_DRIVE' | 'ONEDRIVE' | 'DROPBOX'
    connection_status VARCHAR(50) NOT NULL DEFAULT 'CONNECTED', -- 'CONNECTED' | 'DISCONNECTED'
    storage_type VARCHAR(50) NOT NULL DEFAULT 'HQ_STORAGE', -- 'HQ_STORAGE' | 'CLOUD_PROVIDER'
    last_sync TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Index for high-integrity queries
CREATE INDEX IF NOT EXISTS idx_workspace_storage_providers_workspace_id ON public.workspace_storage_providers (workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_storage_providers_tenant_id ON public.workspace_storage_providers (tenant_id);

-- Enable RLS
ALTER TABLE public.workspace_storage_providers ENABLE ROW LEVEL SECURITY;

-- Reset and drop previous policies
DROP POLICY IF EXISTS workspace_storage_providers_select_policy ON public.workspace_storage_providers;
DROP POLICY IF EXISTS workspace_storage_providers_insert_policy ON public.workspace_storage_providers;
DROP POLICY IF EXISTS workspace_storage_providers_update_policy ON public.workspace_storage_providers;
DROP POLICY IF EXISTS workspace_storage_providers_delete_policy ON public.workspace_storage_providers;

-- SELECT policy: Authenticated users can query storage settings if within parent tenant boundaries
CREATE POLICY workspace_storage_providers_select_policy ON public.workspace_storage_providers
    FOR SELECT TO authenticated
    USING (
        tenant_id = public.get_tenant_id()
        OR public.get_user_role() IN ('HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR')
    );

-- INSERT policy: restricted to HQ_ADMIN, TENANT_OWNER, TENANT_ADMIN within parent tenant boundaries
CREATE POLICY workspace_storage_providers_insert_policy ON public.workspace_storage_providers
    FOR INSERT TO authenticated
    WITH CHECK (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('HQ_ADMIN', 'TENANT_OWNER', 'TENANT_ADMIN'))
        OR public.get_user_role() = 'HQ_ADMIN'
    );

-- UPDATE policy: restricted to HQ_ADMIN, TENANT_OWNER, TENANT_ADMIN within parent tenant boundaries
CREATE POLICY workspace_storage_providers_update_policy ON public.workspace_storage_providers
    FOR UPDATE TO authenticated
    USING (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('HQ_ADMIN', 'TENANT_OWNER', 'TENANT_ADMIN'))
        OR public.get_user_role() = 'HQ_ADMIN'
    )
    WITH CHECK (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('HQ_ADMIN', 'TENANT_OWNER', 'TENANT_ADMIN'))
        OR public.get_user_role() = 'HQ_ADMIN'
    );

-- DELETE policy: restricted to HQ_ADMIN, TENANT_OWNER, TENANT_ADMIN within parent tenant boundaries
CREATE POLICY workspace_storage_providers_delete_policy ON public.workspace_storage_providers
    FOR DELETE TO authenticated
    USING (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('HQ_ADMIN', 'TENANT_OWNER', 'TENANT_ADMIN'))
        OR public.get_user_role() = 'HQ_ADMIN'
    );
