-- ============================================================================
-- MYKERANI Database Migration Script
-- Module: Secure Notification Router Center & Preferences
-- Created At: 2026-06-14
-- Description: Sets up preferences and isolated notifications schemas.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.workspace_notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL UNIQUE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    enable_in_app BOOLEAN NOT NULL DEFAULT true,
    enable_email BOOLEAN NOT NULL DEFAULT true,
    enable_push BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS public.workspace_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    category VARCHAR(50) NOT NULL, -- e.g. 'FINANCIAL_RECORD', 'RECEIVABLE', 'PAYABLE', 'COMMITMENT', 'BACKUP', 'STORAGE', 'SECURITY', 'SYSTEM'
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'UNREAD', -- 'UNREAD', 'READ', 'ARCHIVED'
    recipient_id UUID, -- Optional direct binding, default null (workspace level alerts)
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_workspace_notif_pref_workspace_id ON public.workspace_notification_preferences (workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_notif_pref_tenant_id ON public.workspace_notification_preferences (tenant_id);
CREATE INDEX IF NOT EXISTS idx_workspace_notif_workspace_id ON public.workspace_notifications (workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_notif_tenant_id ON public.workspace_notifications (tenant_id);

-- Enable RLS
ALTER TABLE public.workspace_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_notifications ENABLE ROW LEVEL SECURITY;

-- Reset policies
DROP POLICY IF EXISTS workspace_notif_pref_select_policy ON public.workspace_notification_preferences;
DROP POLICY IF EXISTS workspace_notif_pref_insert_policy ON public.workspace_notification_preferences;
DROP POLICY IF EXISTS workspace_notif_pref_update_policy ON public.workspace_notification_preferences;
DROP POLICY IF EXISTS workspace_notif_pref_delete_policy ON public.workspace_notification_preferences;

-- Preferences Policies
CREATE POLICY workspace_notif_pref_select_policy ON public.workspace_notification_preferences
    FOR SELECT TO authenticated
    USING (
        tenant_id = public.get_tenant_id()
        OR public.get_user_role() IN ('HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR')
    );

CREATE POLICY workspace_notif_pref_insert_policy ON public.workspace_notification_preferences
    FOR INSERT TO authenticated
    WITH CHECK (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('HQ_ADMIN', 'TENANT_OWNER', 'TENANT_ADMIN'))
        OR public.get_user_role() = 'HQ_ADMIN'
    );

CREATE POLICY workspace_notif_pref_update_policy ON public.workspace_notification_preferences
    FOR UPDATE TO authenticated
    USING (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('HQ_ADMIN', 'TENANT_OWNER', 'TENANT_ADMIN'))
        OR public.get_user_role() = 'HQ_ADMIN'
    )
    WITH CHECK (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('HQ_ADMIN', 'TENANT_OWNER', 'TENANT_ADMIN'))
        OR public.get_user_role() = 'HQ_ADMIN'
    );

CREATE POLICY workspace_notif_pref_delete_policy ON public.workspace_notification_preferences
    FOR DELETE TO authenticated
    USING (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('HQ_ADMIN', 'TENANT_OWNER', 'TENANT_ADMIN'))
        OR public.get_user_role() = 'HQ_ADMIN'
    );

-- Notifications Policies
DROP POLICY IF EXISTS workspace_notif_select_policy ON public.workspace_notifications;
DROP POLICY IF EXISTS workspace_notif_insert_policy ON public.workspace_notifications;
DROP POLICY IF EXISTS workspace_notif_update_policy ON public.workspace_notifications;
DROP POLICY IF EXISTS workspace_notif_delete_policy ON public.workspace_notifications;

-- All authenticated members can select notifications on their active tenant/workspace
CREATE POLICY workspace_notif_select_policy ON public.workspace_notifications
    FOR SELECT TO authenticated
    USING (
        tenant_id = public.get_tenant_id()
        OR public.get_user_role() IN ('HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR')
    );

-- Any authenticated member can insert advisory alerts (for background processes or user prompts)
CREATE POLICY workspace_notif_insert_policy ON public.workspace_notifications
    FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id = public.get_tenant_id()
        OR public.get_user_role() IN ('HQ_ADMIN', 'HQ_SUPPORT')
    );

-- Users can update notifications status (Read/Archived) on their tenant
CREATE POLICY workspace_notif_update_policy ON public.workspace_notifications
    FOR UPDATE TO authenticated
    USING (
        tenant_id = public.get_tenant_id()
        OR public.get_user_role() IN ('HQ_ADMIN', 'HQ_SUPPORT')
    )
    WITH CHECK (
        tenant_id = public.get_tenant_id()
        OR public.get_user_role() IN ('HQ_ADMIN', 'HQ_SUPPORT')
    );

-- Restricted delete
CREATE POLICY workspace_notif_delete_policy ON public.workspace_notifications
    FOR DELETE TO authenticated
    USING (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('HQ_ADMIN', 'TENANT_OWNER', 'TENANT_ADMIN'))
        OR public.get_user_role() = 'HQ_ADMIN'
    );
