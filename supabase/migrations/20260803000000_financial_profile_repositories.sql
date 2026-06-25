-- ============================================================================
-- Financial Profile Enhancement — Wave 1: 5 New Repository Tables
-- Blueprint: docs/superpowers/specs/2026-06-26-financial-profile-enhancement-design.md
-- 
-- Creates: profile_customers, profile_suppliers, profile_properties,
--          profile_insurance, profile_investments
-- Pattern: Identical to businesses table (UUID PK, workspace_id FK, is_active,
--          timestamp triggers, RLS via get_tenant_id(), GRANT to authenticated)
-- All statements are additive and non-breaking.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- profile_customers — Tenant-level customer master data
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profile_customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_profile_customers_workspace ON public.profile_customers(workspace_id);

ALTER TABLE public.profile_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profile_customers_select_policy ON public.profile_customers;
CREATE POLICY profile_customers_select_policy ON public.profile_customers
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workspaces WHERE id = profile_customers.workspace_id AND tenant_id = public.get_tenant_id())
    OR public.get_user_role() IN ('HQ_OWNER','HQ_STAFF')
  );

DROP POLICY IF EXISTS profile_customers_insert_policy ON public.profile_customers;
CREATE POLICY profile_customers_insert_policy ON public.profile_customers
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspaces WHERE id = profile_customers.workspace_id AND tenant_id = public.get_tenant_id())
  );

DROP POLICY IF EXISTS profile_customers_update_policy ON public.profile_customers;
CREATE POLICY profile_customers_update_policy ON public.profile_customers
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workspaces WHERE id = profile_customers.workspace_id AND tenant_id = public.get_tenant_id())
    OR public.get_user_role() IN ('HQ_OWNER','HQ_STAFF')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspaces WHERE id = profile_customers.workspace_id AND tenant_id = public.get_tenant_id())
    OR public.get_user_role() IN ('HQ_OWNER','HQ_STAFF')
  );

DROP POLICY IF EXISTS profile_customers_delete_policy ON public.profile_customers;
CREATE POLICY profile_customers_delete_policy ON public.profile_customers
  FOR DELETE TO authenticated USING (
    (EXISTS (SELECT 1 FROM public.workspaces WHERE id = profile_customers.workspace_id AND tenant_id = public.get_tenant_id())
     AND public.get_user_role() = 'TENANT_OWNER')
    OR public.get_user_role() = 'HQ_OWNER'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_customers TO authenticated;
GRANT ALL ON public.profile_customers TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- profile_suppliers — Tenant-level supplier master data
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profile_suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_profile_suppliers_workspace ON public.profile_suppliers(workspace_id);

ALTER TABLE public.profile_suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profile_suppliers_select_policy ON public.profile_suppliers;
CREATE POLICY profile_suppliers_select_policy ON public.profile_suppliers
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workspaces WHERE id = profile_suppliers.workspace_id AND tenant_id = public.get_tenant_id())
    OR public.get_user_role() IN ('HQ_OWNER','HQ_STAFF')
  );

DROP POLICY IF EXISTS profile_suppliers_insert_policy ON public.profile_suppliers;
CREATE POLICY profile_suppliers_insert_policy ON public.profile_suppliers
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspaces WHERE id = profile_suppliers.workspace_id AND tenant_id = public.get_tenant_id())
  );

DROP POLICY IF EXISTS profile_suppliers_update_policy ON public.profile_suppliers;
CREATE POLICY profile_suppliers_update_policy ON public.profile_suppliers
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workspaces WHERE id = profile_suppliers.workspace_id AND tenant_id = public.get_tenant_id())
    OR public.get_user_role() IN ('HQ_OWNER','HQ_STAFF')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspaces WHERE id = profile_suppliers.workspace_id AND tenant_id = public.get_tenant_id())
    OR public.get_user_role() IN ('HQ_OWNER','HQ_STAFF')
  );

DROP POLICY IF EXISTS profile_suppliers_delete_policy ON public.profile_suppliers;
CREATE POLICY profile_suppliers_delete_policy ON public.profile_suppliers
  FOR DELETE TO authenticated USING (
    (EXISTS (SELECT 1 FROM public.workspaces WHERE id = profile_suppliers.workspace_id AND tenant_id = public.get_tenant_id())
     AND public.get_user_role() = 'TENANT_OWNER')
    OR public.get_user_role() = 'HQ_OWNER'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_suppliers TO authenticated;
GRANT ALL ON public.profile_suppliers TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- profile_properties — Property/real estate registry
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profile_properties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  property_name VARCHAR(255) NOT NULL,
  property_type VARCHAR(50),
  address TEXT,
  purchase_value_myr NUMERIC(19,4),
  notes TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_profile_properties_workspace ON public.profile_properties(workspace_id);

ALTER TABLE public.profile_properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profile_properties_select_policy ON public.profile_properties;
CREATE POLICY profile_properties_select_policy ON public.profile_properties
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workspaces WHERE id = profile_properties.workspace_id AND tenant_id = public.get_tenant_id())
    OR public.get_user_role() IN ('HQ_OWNER','HQ_STAFF')
  );

DROP POLICY IF EXISTS profile_properties_insert_policy ON public.profile_properties;
CREATE POLICY profile_properties_insert_policy ON public.profile_properties
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspaces WHERE id = profile_properties.workspace_id AND tenant_id = public.get_tenant_id())
  );

DROP POLICY IF EXISTS profile_properties_update_policy ON public.profile_properties;
CREATE POLICY profile_properties_update_policy ON public.profile_properties
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workspaces WHERE id = profile_properties.workspace_id AND tenant_id = public.get_tenant_id())
    OR public.get_user_role() IN ('HQ_OWNER','HQ_STAFF')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspaces WHERE id = profile_properties.workspace_id AND tenant_id = public.get_tenant_id())
    OR public.get_user_role() IN ('HQ_OWNER','HQ_STAFF')
  );

DROP POLICY IF EXISTS profile_properties_delete_policy ON public.profile_properties;
CREATE POLICY profile_properties_delete_policy ON public.profile_properties
  FOR DELETE TO authenticated USING (
    (EXISTS (SELECT 1 FROM public.workspaces WHERE id = profile_properties.workspace_id AND tenant_id = public.get_tenant_id())
     AND public.get_user_role() = 'TENANT_OWNER')
    OR public.get_user_role() = 'HQ_OWNER'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_properties TO authenticated;
GRANT ALL ON public.profile_properties TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- profile_insurance — Insurance policy registry
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profile_insurance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  policy_name VARCHAR(255) NOT NULL,
  insurance_type VARCHAR(50),
  provider VARCHAR(255),
  policy_number VARCHAR(100),
  premium_amount_myr NUMERIC(19,4),
  premium_frequency VARCHAR(20),
  coverage_amount_myr NUMERIC(19,4),
  start_date DATE,
  end_date DATE,
  notes TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_profile_insurance_workspace ON public.profile_insurance(workspace_id);

ALTER TABLE public.profile_insurance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profile_insurance_select_policy ON public.profile_insurance;
CREATE POLICY profile_insurance_select_policy ON public.profile_insurance
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workspaces WHERE id = profile_insurance.workspace_id AND tenant_id = public.get_tenant_id())
    OR public.get_user_role() IN ('HQ_OWNER','HQ_STAFF')
  );

DROP POLICY IF EXISTS profile_insurance_insert_policy ON public.profile_insurance;
CREATE POLICY profile_insurance_insert_policy ON public.profile_insurance
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspaces WHERE id = profile_insurance.workspace_id AND tenant_id = public.get_tenant_id())
  );

DROP POLICY IF EXISTS profile_insurance_update_policy ON public.profile_insurance;
CREATE POLICY profile_insurance_update_policy ON public.profile_insurance
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workspaces WHERE id = profile_insurance.workspace_id AND tenant_id = public.get_tenant_id())
    OR public.get_user_role() IN ('HQ_OWNER','HQ_STAFF')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspaces WHERE id = profile_insurance.workspace_id AND tenant_id = public.get_tenant_id())
    OR public.get_user_role() IN ('HQ_OWNER','HQ_STAFF')
  );

DROP POLICY IF EXISTS profile_insurance_delete_policy ON public.profile_insurance;
CREATE POLICY profile_insurance_delete_policy ON public.profile_insurance
  FOR DELETE TO authenticated USING (
    (EXISTS (SELECT 1 FROM public.workspaces WHERE id = profile_insurance.workspace_id AND tenant_id = public.get_tenant_id())
     AND public.get_user_role() = 'TENANT_OWNER')
    OR public.get_user_role() = 'HQ_OWNER'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_insurance TO authenticated;
GRANT ALL ON public.profile_insurance TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- profile_investments — Investment registry
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profile_investments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  investment_name VARCHAR(255) NOT NULL,
  investment_type VARCHAR(50),
  institution VARCHAR(255),
  account_number VARCHAR(100),
  current_value_myr NUMERIC(19,4),
  notes TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_profile_investments_workspace ON public.profile_investments(workspace_id);

ALTER TABLE public.profile_investments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profile_investments_select_policy ON public.profile_investments;
CREATE POLICY profile_investments_select_policy ON public.profile_investments
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workspaces WHERE id = profile_investments.workspace_id AND tenant_id = public.get_tenant_id())
    OR public.get_user_role() IN ('HQ_OWNER','HQ_STAFF')
  );

DROP POLICY IF EXISTS profile_investments_insert_policy ON public.profile_investments;
CREATE POLICY profile_investments_insert_policy ON public.profile_investments
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspaces WHERE id = profile_investments.workspace_id AND tenant_id = public.get_tenant_id())
  );

DROP POLICY IF EXISTS profile_investments_update_policy ON public.profile_investments;
CREATE POLICY profile_investments_update_policy ON public.profile_investments
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workspaces WHERE id = profile_investments.workspace_id AND tenant_id = public.get_tenant_id())
    OR public.get_user_role() IN ('HQ_OWNER','HQ_STAFF')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspaces WHERE id = profile_investments.workspace_id AND tenant_id = public.get_tenant_id())
    OR public.get_user_role() IN ('HQ_OWNER','HQ_STAFF')
  );

DROP POLICY IF EXISTS profile_investments_delete_policy ON public.profile_investments;
CREATE POLICY profile_investments_delete_policy ON public.profile_investments
  FOR DELETE TO authenticated USING (
    (EXISTS (SELECT 1 FROM public.workspaces WHERE id = profile_investments.workspace_id AND tenant_id = public.get_tenant_id())
     AND public.get_user_role() = 'TENANT_OWNER')
    OR public.get_user_role() = 'HQ_OWNER'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_investments TO authenticated;
GRANT ALL ON public.profile_investments TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Timestamp triggers for all 5 new tables (reuse existing pattern)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_touch_profile_customers BEFORE UPDATE ON public.profile_customers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_touch_profile_suppliers BEFORE UPDATE ON public.profile_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_touch_profile_properties BEFORE UPDATE ON public.profile_properties
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_touch_profile_insurance BEFORE UPDATE ON public.profile_insurance
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_touch_profile_investments BEFORE UPDATE ON public.profile_investments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Audit triggers (reuse existing audit_asset_owner_action function which
-- is generic — uses TG_TABLE_NAME and to_jsonb(OLD/NEW))
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TRIGGER trg_audit_profile_customers
  AFTER INSERT OR UPDATE OR DELETE ON public.profile_customers
  FOR EACH ROW EXECUTE FUNCTION public.audit_asset_owner_action();

CREATE TRIGGER trg_audit_profile_suppliers
  AFTER INSERT OR UPDATE OR DELETE ON public.profile_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.audit_asset_owner_action();

CREATE TRIGGER trg_audit_profile_properties
  AFTER INSERT OR UPDATE OR DELETE ON public.profile_properties
  FOR EACH ROW EXECUTE FUNCTION public.audit_asset_owner_action();

CREATE TRIGGER trg_audit_profile_insurance
  AFTER INSERT OR UPDATE OR DELETE ON public.profile_insurance
  FOR EACH ROW EXECUTE FUNCTION public.audit_asset_owner_action();

CREATE TRIGGER trg_audit_profile_investments
  AFTER INSERT OR UPDATE OR DELETE ON public.profile_investments
  FOR EACH ROW EXECUTE FUNCTION public.audit_asset_owner_action();