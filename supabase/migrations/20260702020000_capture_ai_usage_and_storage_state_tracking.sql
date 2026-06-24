-- Repository capture of production-only migrations "ai_usage_and_storage_state_real_tracking"
-- (20260617235158) and "harden_get_workspace_storage_usage_ownership_check" (20260621153453).
-- Idempotent.

ALTER TABLE public.workspace_storage_state ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.workspace_storage_state ADD COLUMN IF NOT EXISTS is_frozen boolean NOT NULL DEFAULT false;
ALTER TABLE public.workspace_storage_state ADD COLUMN IF NOT EXISTS frozen_reason text NOT NULL DEFAULT '';
ALTER TABLE public.workspace_storage_state ADD COLUMN IF NOT EXISTS last_active_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.workspace_storage_state ADD COLUMN IF NOT EXISTS inactive_days_limit integer NOT NULL DEFAULT 30;
ALTER TABLE public.workspace_storage_state ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.workspace_storage_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hq_manage_storage_state ON public.workspace_storage_state;
CREATE POLICY hq_manage_storage_state ON public.workspace_storage_state
  FOR ALL USING (is_hq_user()) WITH CHECK (is_hq_user());

DROP POLICY IF EXISTS tenant_read_own_storage_state ON public.workspace_storage_state;
CREATE POLICY tenant_read_own_storage_state ON public.workspace_storage_state
  FOR SELECT USING (tenant_id IN (
    SELECT ura.tenant_id FROM public.user_role_assignments ura
    WHERE (ura.user_id)::text = (auth.uid())::text
  ));

DROP POLICY IF EXISTS tenant_read_own_ai_usage ON public.ai_usage_log;
CREATE POLICY tenant_read_own_ai_usage ON public.ai_usage_log
  FOR SELECT USING (
    is_hq_user() OR (tenant_id IN (
      SELECT ura.tenant_id FROM public.user_role_assignments ura
      WHERE (ura.user_id)::text = (auth.uid())::text
    ))
  );

-- Current (hardened) definition: validates caller is HQ or owns the workspace
-- before exposing storage usage, then syncs resource_wallets.storage_used_bytes.
CREATE OR REPLACE FUNCTION public.get_workspace_storage_usage(p_workspace_id uuid)
RETURNS TABLE(workspace_id uuid, total_bytes bigint, file_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total bigint;
  v_count bigint;
BEGIN
  IF NOT (
    public.is_hq_user()
    OR EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE workspaces.id = p_workspace_id
        AND workspaces.tenant_id = public.get_tenant_id()
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to read storage usage for this workspace';
  END IF;

  SELECT COALESCE(SUM(file_size_bytes), 0)::bigint, COUNT(*)::bigint
    INTO v_total, v_count
    FROM public.evidence_documents
   WHERE workspace_id = p_workspace_id;

  UPDATE public.resource_wallets SET storage_used_bytes = v_total, updated_at = now() WHERE workspace_id = p_workspace_id;

  RETURN QUERY SELECT p_workspace_id, v_total, v_count;
END;
$function$;
