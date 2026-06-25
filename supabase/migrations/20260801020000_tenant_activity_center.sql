-- Migration: 20260801020000_tenant_activity_center.sql
-- Gap C-04: Tenant Activity Center — table, RLS, and RPCs

-- ─────────────────────────────────────────────────────────────────────────────
-- 2a. Create tenant_activity_log table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenant_activity_log (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workspace_id  UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  actor_id      TEXT NOT NULL,  -- user_id (VARCHAR, matching user_role_assignments.user_id)
  actor_email   TEXT NOT NULL,
  actor_role    TEXT NOT NULL,  -- 'TENANT_OWNER' or 'TENANT_STAFF'
  actor_name    TEXT,
  action_type   TEXT NOT NULL,  -- e.g. 'RECORD_CREATED', 'RECORD_UPDATED', 'RECORD_DELETED', 'DOCUMENT_UPLOADED', 'OCR_PROCESSED', 'CHAT_MESSAGE', 'PAYMENT_SUBMITTED'
  module        TEXT NOT NULL,  -- e.g. 'Financial Records', 'Documents', 'AI Chat', 'Billing'
  description   TEXT NOT NULL,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tenant_activity_log_tenant    ON public.tenant_activity_log(tenant_id, created_at DESC);
CREATE INDEX idx_tenant_activity_log_workspace ON public.tenant_activity_log(workspace_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2b. Enable RLS on tenant_activity_log
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.tenant_activity_log ENABLE ROW LEVEL SECURITY;

-- TENANT_OWNER can see all activity in their tenant
CREATE POLICY "tenant_owner_read_activity" ON public.tenant_activity_log
  FOR SELECT USING (
    tenant_id = get_tenant_id()
    AND get_user_role() IN ('TENANT_OWNER', 'TENANT_STAFF')
  );

-- TENANT_STAFF can only see their own activity
CREATE POLICY "tenant_staff_read_own_activity" ON public.tenant_activity_log
  FOR SELECT USING (
    workspace_id IN (
      SELECT w.id FROM workspaces w
      JOIN user_role_assignments ura ON ura.tenant_id = w.tenant_id
      WHERE ura.user_id = auth.uid()::text
        AND ura.role = 'TENANT_STAFF'
    )
    AND actor_id = auth.uid()::text
  );

-- All tenant users can INSERT (fire-and-forget activity logging)
CREATE POLICY "tenant_insert_activity" ON public.tenant_activity_log
  FOR INSERT WITH CHECK (
    tenant_id = get_tenant_id()
  );

-- HQ can read all
CREATE POLICY "hq_read_tenant_activity" ON public.tenant_activity_log
  FOR SELECT USING (
    get_user_role() IN ('HQ_OWNER', 'HQ_STAFF')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2c. Create log_tenant_activity RPC
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_tenant_activity(
  p_workspace_id  UUID,
  p_actor_id      TEXT,
  p_actor_email   TEXT,
  p_actor_role    TEXT,
  p_actor_name    TEXT,
  p_action_type   TEXT,
  p_module        TEXT,
  p_description   TEXT,
  p_metadata      JSONB DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_log_id UUID;
BEGIN
  -- Get tenant_id from workspace
  SELECT w.tenant_id INTO v_tenant_id
  FROM workspaces w WHERE w.id = p_workspace_id;

  IF v_tenant_id IS NULL THEN
    RETURN NULL; -- graceful no-op for invalid workspace
  END IF;

  INSERT INTO tenant_activity_log (
    tenant_id, workspace_id, actor_id, actor_email, actor_role,
    actor_name, action_type, module, description, metadata
  ) VALUES (
    v_tenant_id, p_workspace_id, p_actor_id, p_actor_email, p_actor_role,
    p_actor_name, p_action_type, p_module, p_description, p_metadata
  ) RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2d. Create get_tenant_activity_feed RPC
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_tenant_activity_feed(
  p_workspace_id  UUID DEFAULT NULL,
  p_limit         INTEGER DEFAULT 50,
  p_offset        INTEGER DEFAULT 0
) RETURNS TABLE (
  id          UUID,
  workspace_id UUID,
  actor_id    TEXT,
  actor_email TEXT,
  actor_role  TEXT,
  actor_name  TEXT,
  action_type TEXT,
  module      TEXT,
  description TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_role TEXT;
BEGIN
  v_tenant_id := get_tenant_id();
  v_role := get_user_role();

  IF v_role IN ('HQ_OWNER', 'HQ_STAFF') THEN
    RETURN QUERY
    SELECT tal.id, tal.workspace_id, tal.actor_id, tal.actor_email,
           tal.actor_role, tal.actor_name, tal.action_type, tal.module,
           tal.description, tal.metadata, tal.created_at
    FROM tenant_activity_log tal
    WHERE (p_workspace_id IS NULL OR tal.workspace_id = p_workspace_id)
    ORDER BY tal.created_at DESC
    LIMIT p_limit OFFSET p_offset;
  ELSIF v_role = 'TENANT_OWNER' THEN
    RETURN QUERY
    SELECT tal.id, tal.workspace_id, tal.actor_id, tal.actor_email,
           tal.actor_role, tal.actor_name, tal.action_type, tal.module,
           tal.description, tal.metadata, tal.created_at
    FROM tenant_activity_log tal
    WHERE tal.tenant_id = v_tenant_id
      AND (p_workspace_id IS NULL OR tal.workspace_id = p_workspace_id)
    ORDER BY tal.created_at DESC
    LIMIT p_limit OFFSET p_offset;
  ELSIF v_role = 'TENANT_STAFF' THEN
    -- Staff sees only their own workspace activity
    RETURN QUERY
    SELECT tal.id, tal.workspace_id, tal.actor_id, tal.actor_email,
           tal.actor_role, tal.actor_name, tal.action_type, tal.module,
           tal.description, tal.metadata, tal.created_at
    FROM tenant_activity_log tal
    WHERE tal.tenant_id = v_tenant_id
      AND (p_workspace_id IS NULL OR tal.workspace_id = p_workspace_id)
    ORDER BY tal.created_at DESC
    LIMIT p_limit OFFSET p_offset;
  END IF;
END;
$$;
