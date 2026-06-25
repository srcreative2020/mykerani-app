-- ============================================================================
-- Financial Profile Enhancement — Wave 2: 3 New Junction Tables
-- Blueprint: docs/superpowers/specs/2026-06-26-financial-profile-enhancement-design.md
--
-- Creates: vehicle_businesses, bank_account_businesses, property_businesses
-- Pattern: UUID PK, dual FK with CASCADE, workspace_id for RLS,
--          UNIQUE constraint on the pair
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- vehicle_businesses — M:N between vehicles and businesses
-- A vehicle can serve multiple businesses (delivery vehicle shared across businesses)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vehicle_businesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE NOT NULL,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT uniq_vehicle_business UNIQUE (vehicle_id, business_id)
);

CREATE INDEX idx_vehicle_businesses_workspace ON public.vehicle_businesses(workspace_id);
CREATE INDEX idx_vehicle_businesses_vehicle ON public.vehicle_businesses(vehicle_id);
CREATE INDEX idx_vehicle_businesses_business ON public.vehicle_businesses(business_id);

ALTER TABLE public.vehicle_businesses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vehicle_businesses_select_policy ON public.vehicle_businesses;
CREATE POLICY vehicle_businesses_select_policy ON public.vehicle_businesses
  FOR SELECT TO authenticated USING (
    workspace_id IN (SELECT id FROM public.workspaces WHERE tenant_id = public.get_tenant_id())
    OR public.get_user_role() IN ('HQ_OWNER','HQ_STAFF')
  );

DROP POLICY IF EXISTS vehicle_businesses_insert_policy ON public.vehicle_businesses;
CREATE POLICY vehicle_businesses_insert_policy ON public.vehicle_businesses
  FOR INSERT TO authenticated WITH CHECK (
    workspace_id IN (SELECT id FROM public.workspaces WHERE tenant_id = public.get_tenant_id())
  );

DROP POLICY IF EXISTS vehicle_businesses_delete_policy ON public.vehicle_businesses;
CREATE POLICY vehicle_businesses_delete_policy ON public.vehicle_businesses
  FOR DELETE TO authenticated USING (
    (workspace_id IN (SELECT id FROM public.workspaces WHERE tenant_id = public.get_tenant_id())
     AND public.get_user_role() = 'TENANT_OWNER')
    OR public.get_user_role() = 'HQ_OWNER'
  );

GRANT SELECT, INSERT, DELETE ON public.vehicle_businesses TO authenticated;
GRANT ALL ON public.vehicle_businesses TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- bank_account_businesses — M:N between bank_accounts and businesses
-- A bank account may serve multiple businesses
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bank_account_businesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bank_account_id UUID REFERENCES public.bank_accounts(id) ON DELETE CASCADE NOT NULL,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT uniq_bankacc_business UNIQUE (bank_account_id, business_id)
);

CREATE INDEX idx_bank_account_businesses_workspace ON public.bank_account_businesses(workspace_id);
CREATE INDEX idx_bank_account_businesses_bank ON public.bank_account_businesses(bank_account_id);
CREATE INDEX idx_bank_account_businesses_business ON public.bank_account_businesses(business_id);

ALTER TABLE public.bank_account_businesses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bank_account_businesses_select_policy ON public.bank_account_businesses;
CREATE POLICY bank_account_businesses_select_policy ON public.bank_account_businesses
  FOR SELECT TO authenticated USING (
    workspace_id IN (SELECT id FROM public.workspaces WHERE tenant_id = public.get_tenant_id())
    OR public.get_user_role() IN ('HQ_OWNER','HQ_STAFF')
  );

DROP POLICY IF EXISTS bank_account_businesses_insert_policy ON public.bank_account_businesses;
CREATE POLICY bank_account_businesses_insert_policy ON public.bank_account_businesses
  FOR INSERT TO authenticated WITH CHECK (
    workspace_id IN (SELECT id FROM public.workspaces WHERE tenant_id = public.get_tenant_id())
  );

DROP POLICY IF EXISTS bank_account_businesses_delete_policy ON public.bank_account_businesses;
CREATE POLICY bank_account_businesses_delete_policy ON public.bank_account_businesses
  FOR DELETE TO authenticated USING (
    (workspace_id IN (SELECT id FROM public.workspaces WHERE tenant_id = public.get_tenant_id())
     AND public.get_user_role() = 'TENANT_OWNER')
    OR public.get_user_role() = 'HQ_OWNER'
  );

GRANT SELECT, INSERT, DELETE ON public.bank_account_businesses TO authenticated;
GRANT ALL ON public.bank_account_businesses TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- property_businesses — M:N between profile_properties and businesses
-- A property can be associated with multiple businesses
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.property_businesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID REFERENCES public.profile_properties(id) ON DELETE CASCADE NOT NULL,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT uniq_property_business UNIQUE (property_id, business_id)
);

CREATE INDEX idx_property_businesses_workspace ON public.property_businesses(workspace_id);
CREATE INDEX idx_property_businesses_property ON public.property_businesses(property_id);
CREATE INDEX idx_property_businesses_business ON public.property_businesses(business_id);

ALTER TABLE public.property_businesses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS property_businesses_select_policy ON public.property_businesses;
CREATE POLICY property_businesses_select_policy ON public.property_businesses
  FOR SELECT TO authenticated USING (
    workspace_id IN (SELECT id FROM public.workspaces WHERE tenant_id = public.get_tenant_id())
    OR public.get_user_role() IN ('HQ_OWNER','HQ_STAFF')
  );

DROP POLICY IF EXISTS property_businesses_insert_policy ON public.property_businesses;
CREATE POLICY property_businesses_insert_policy ON public.property_businesses
  FOR INSERT TO authenticated WITH CHECK (
    workspace_id IN (SELECT id FROM public.workspaces WHERE tenant_id = public.get_tenant_id())
  );

DROP POLICY IF EXISTS property_businesses_delete_policy ON public.property_businesses;
CREATE POLICY property_businesses_delete_policy ON public.property_businesses
  FOR DELETE TO authenticated USING (
    (workspace_id IN (SELECT id FROM public.workspaces WHERE tenant_id = public.get_tenant_id())
     AND public.get_user_role() = 'TENANT_OWNER')
    OR public.get_user_role() = 'HQ_OWNER'
  );

GRANT SELECT, INSERT, DELETE ON public.property_businesses TO authenticated;
GRANT ALL ON public.property_businesses TO service_role;