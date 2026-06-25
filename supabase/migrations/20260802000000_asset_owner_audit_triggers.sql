-- Audit triggers for asset_purchases and owner_transactions (M-14)
-- These financial tables had no audit trail. Now all mutations are logged.

CREATE OR REPLACE FUNCTION public.audit_asset_owner_action()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_user_id TEXT;
  v_user_email TEXT;
  v_user_role TEXT;
  v_action VARCHAR(50);
  v_module VARCHAR(100);
BEGIN
  v_user_id := auth.uid()::text;
  SELECT email, role INTO v_user_email, v_user_role
  FROM user_role_assignments WHERE user_id = v_user_id LIMIT 1;

  SELECT w.tenant_id INTO v_tenant_id
  FROM workspaces w
  WHERE w.id = COALESCE(NEW.workspace_id, OLD.workspace_id);

  IF TG_OP = 'INSERT' THEN
    v_action := 'CREATE';
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE';
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
  END IF;

  v_module := CASE TG_TABLE_NAME
    WHEN 'asset_purchases' THEN 'Asset Purchases'
    WHEN 'owner_transactions' THEN 'Owner Transactions'
    ELSE TG_TABLE_NAME
  END;

  INSERT INTO audit_logs (
    user_id, user_email, user_role, tenant_id,
    workspace_id, module, action, old_value, new_value
  ) VALUES (
    v_user_id, COALESCE(v_user_email, 'unknown'), COALESCE(v_user_role, 'unknown'),
    v_tenant_id, COALESCE(NEW.workspace_id, OLD.workspace_id),
    v_module, v_action,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_audit_asset_purchases
  AFTER INSERT OR UPDATE OR DELETE ON public.asset_purchases
  FOR EACH ROW EXECUTE FUNCTION public.audit_asset_owner_action();

CREATE TRIGGER trg_audit_owner_transactions
  AFTER INSERT OR UPDATE OR DELETE ON public.owner_transactions
  FOR EACH ROW EXECUTE FUNCTION public.audit_asset_owner_action();