-- Tenant owners/staff were silently blocked from reading data they need to see:
--
-- 1. payment_gateway_settings only had policies for is_hq_user(), so a tenant's
--    own .select() for chip_asia_enabled/manual_payment_enabled always came back
--    empty (RLS denies, no error) — the Chip Asia option never appeared even
--    after HQ correctly configured and enabled it.
-- 2. resource_wallets had RLS enabled but zero policies, denying everyone except
--    service_role — so the tenant-side AI credit balance and storage usage reads
--    (useAiCredits, useStorageQuota) always silently failed and showed stale
--    defaults, making it look like usage was never being deducted/tracked.

CREATE POLICY tenant_read_payment_gateway_settings ON public.payment_gateway_settings
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY tenant_read_own_resource_wallet ON public.resource_wallets
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE workspaces.id = resource_wallets.workspace_id
        AND workspaces.tenant_id = public.get_tenant_id()
    )
    OR public.is_hq_user()
  );

-- Harden get_workspace_storage_usage(): it was SECURITY DEFINER with no caller
-- ownership check, so any authenticated user could pass an arbitrary
-- workspace_id and read/recompute another tenant's storage usage.
CREATE OR REPLACE FUNCTION public.get_workspace_storage_usage(p_workspace_id uuid)
RETURNS TABLE(workspace_id uuid, total_bytes bigint, file_count bigint)
LANGUAGE plpgsql
VOLATILE
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
