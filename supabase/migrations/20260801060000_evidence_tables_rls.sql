-- Gap L-07: RLS for evidence_bundles, evidence_documents, and ledger_evidence_mappings.
-- These tables exist in the DB (from migration 1) but are not yet used from client code.
-- Adding RLS now ensures proper tenant isolation if/when they are used in Phase 3.

-- evidence_bundles
ALTER TABLE IF EXISTS public.evidence_bundles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant can read own evidence_bundles" ON public.evidence_bundles;
CREATE POLICY "Tenant can read own evidence_bundles"
  ON public.evidence_bundles FOR SELECT
  USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "Tenant can insert own evidence_bundles" ON public.evidence_bundles;
CREATE POLICY "Tenant can insert own evidence_bundles"
  ON public.evidence_bundles FOR INSERT
  WITH CHECK (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "Tenant can update own evidence_bundles" ON public.evidence_bundles;
CREATE POLICY "Tenant can update own evidence_bundles"
  ON public.evidence_bundles FOR UPDATE
  USING (tenant_id = public.get_tenant_id())
  WITH CHECK (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "HQ can read all evidence_bundles" ON public.evidence_bundles;
CREATE POLICY "HQ can read all evidence_bundles"
  ON public.evidence_bundles FOR SELECT
  USING (public.is_hq_user());

-- evidence_documents
ALTER TABLE IF EXISTS public.evidence_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant can read own evidence_documents" ON public.evidence_documents;
CREATE POLICY "Tenant can read own evidence_documents"
  ON public.evidence_documents FOR SELECT
  USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "Tenant can insert own evidence_documents" ON public.evidence_documents;
CREATE POLICY "Tenant can insert own evidence_documents"
  ON public.evidence_documents FOR INSERT
  WITH CHECK (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "Tenant can update own evidence_documents" ON public.evidence_documents;
CREATE POLICY "Tenant can update own evidence_documents"
  ON public.evidence_documents FOR UPDATE
  USING (tenant_id = public.get_tenant_id())
  WITH CHECK (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "HQ can read all evidence_documents" ON public.evidence_documents;
CREATE POLICY "HQ can read all evidence_documents"
  ON public.evidence_documents FOR SELECT
  USING (public.is_hq_user());

-- ledger_evidence_mappings
ALTER TABLE IF EXISTS public.ledger_evidence_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant can read own ledger_evidence_mappings" ON public.ledger_evidence_mappings;
CREATE POLICY "Tenant can read own ledger_evidence_mappings"
  ON public.ledger_evidence_mappings FOR SELECT
  USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "Tenant can insert own ledger_evidence_mappings" ON public.ledger_evidence_mappings;
CREATE POLICY "Tenant can insert own ledger_evidence_mappings"
  ON public.ledger_evidence_mappings FOR INSERT
  WITH CHECK (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "Tenant can update own ledger_evidence_mappings" ON public.ledger_evidence_mappings;
CREATE POLICY "Tenant can update own ledger_evidence_mappings"
  ON public.ledger_evidence_mappings FOR UPDATE
  USING (tenant_id = public.get_tenant_id())
  WITH CHECK (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "HQ can read all ledger_evidence_mappings" ON public.ledger_evidence_mappings;
CREATE POLICY "HQ can read all ledger_evidence_mappings"
  ON public.ledger_evidence_mappings FOR SELECT
  USING (public.is_hq_user());
