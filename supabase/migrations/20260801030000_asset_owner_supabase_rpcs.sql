-- Migration: 20260801030000_asset_owner_supabase_rpcs.sql
-- Gap C-05 (DB side): Asset Owner Supabase RPCs for asset_purchases and owner_transactions

-- ─────────────────────────────────────────────────────────────────────────────
-- 3a. Create get_asset_purchases RPC
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_asset_purchases(p_workspace_id UUID)
RETURNS SETOF public.asset_purchases
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM workspaces w
    JOIN user_role_assignments ura ON ura.tenant_id = w.tenant_id
    WHERE w.id = p_workspace_id AND ura.user_id = auth.uid()::text
  ) AND get_user_role() NOT IN ('HQ_OWNER', 'HQ_STAFF') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY SELECT * FROM asset_purchases WHERE workspace_id = p_workspace_id ORDER BY created_at DESC;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3b. Create get_owner_transactions RPC
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_owner_transactions(p_workspace_id UUID)
RETURNS SETOF public.owner_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM workspaces w
    JOIN user_role_assignments ura ON ura.tenant_id = w.tenant_id
    WHERE w.id = p_workspace_id AND ura.user_id = auth.uid()::text
  ) AND get_user_role() NOT IN ('HQ_OWNER', 'HQ_STAFF') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY SELECT * FROM owner_transactions WHERE workspace_id = p_workspace_id ORDER BY created_at DESC;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Grant EXECUTE to authenticated role
-- ─────────────────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.get_asset_purchases(UUID)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_owner_transactions(UUID) TO authenticated;
