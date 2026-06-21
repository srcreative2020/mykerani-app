-- MYKERANI Financial Knowledge Bank / Memory Engine.
--
-- Platform-owned reference data (per CLAUDE.md Data Ownership Rule, HQ owns
-- "Platform / AI Models / Metadata" — this is metadata that improves AI
-- suggestions, never tenant financial records). It contains pre-loaded
-- financial scenarios (vendor/keyword -> suggested classification) that the
-- AI assistant matches against BEFORE falling back to generic guessing, and
-- a gap log of real user inputs that did not match any scenario or learned
-- vendor pattern, so HQ can keep expanding the bank over time.
--
-- AI Suggests -> User Confirms -> AI Learns: this table only ever feeds
-- SUGGESTIONS into the chat response payload. It is never used to
-- auto-create, auto-edit or auto-approve any financial record.

CREATE TABLE IF NOT EXISTS public.knowledge_bank_scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_code VARCHAR(50) UNIQUE,
    category VARCHAR(30) NOT NULL CHECK (category IN (
        'INDIVIDUAL', 'MICRO_BUSINESS', 'SME', 'MULTI_COMPANY', 'FINANCING', 'AUDIT', 'RECOVERY'
    )),
    title TEXT NOT NULL,
    keywords TEXT[] NOT NULL DEFAULT '{}',
    suggested_type VARCHAR(20) CHECK (suggested_type IN (
        'INCOME', 'EXPENSE', 'DEBT', 'RECEIVABLE', 'PAYABLE', 'COMMITMENT', 'ASSET_PURCHASE', 'OWNER_TRANSACTION'
    )),
    suggested_category TEXT,
    suggested_documents TEXT[] NOT NULL DEFAULT '{}',
    base_confidence NUMERIC(3,2) NOT NULL DEFAULT 0.70 CHECK (base_confidence >= 0 AND base_confidence <= 1),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_kb_scenarios_keywords ON public.knowledge_bank_scenarios USING GIN (keywords);
CREATE INDEX IF NOT EXISTS idx_kb_scenarios_category ON public.knowledge_bank_scenarios (category);

CREATE OR REPLACE FUNCTION public.touch_kb_scenario_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_kb_scenario_updated_at ON public.knowledge_bank_scenarios;
CREATE TRIGGER trg_touch_kb_scenario_updated_at
    BEFORE UPDATE ON public.knowledge_bank_scenarios
    FOR EACH ROW EXECUTE FUNCTION public.touch_kb_scenario_updated_at();

ALTER TABLE public.knowledge_bank_scenarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kb_scenarios_select_policy ON public.knowledge_bank_scenarios;
DROP POLICY IF EXISTS kb_scenarios_hq_write_policy ON public.knowledge_bank_scenarios;

-- Every authenticated user can read active scenarios — these are generic
-- suggestion seeds, not tenant-specific financial records.
CREATE POLICY kb_scenarios_select_policy ON public.knowledge_bank_scenarios
    FOR SELECT TO authenticated
    USING (is_active OR public.is_hq_user());

-- Only HQ can curate the knowledge bank.
CREATE POLICY kb_scenarios_hq_write_policy ON public.knowledge_bank_scenarios
    FOR ALL TO authenticated
    USING (public.is_hq_user())
    WITH CHECK (public.is_hq_user());

GRANT SELECT ON public.knowledge_bank_scenarios TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_bank_scenarios TO service_role;

-- ── Knowledge Bank Gaps ─────────────────────────────────────────────────────
-- Logged (server-side, service role only) whenever a real financial chat
-- transaction was detected but matched no knowledge_bank_scenarios row and
-- no OCR learned vendor pattern — i.e. a situation the Knowledge Bank does
-- not yet cover. HQ reviews these to decide which new scenarios to add.

CREATE TABLE IF NOT EXISTS public.knowledge_bank_gaps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID,
    workspace_id UUID,
    raw_text TEXT NOT NULL,
    detected_type VARCHAR(20),
    detected_amount NUMERIC(14,2),
    related_party TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'REVIEWED', 'RESOLVED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_kb_gaps_status ON public.knowledge_bank_gaps (status, created_at DESC);

ALTER TABLE public.knowledge_bank_gaps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kb_gaps_hq_select_policy ON public.knowledge_bank_gaps;
DROP POLICY IF EXISTS kb_gaps_hq_update_policy ON public.knowledge_bank_gaps;

CREATE POLICY kb_gaps_hq_select_policy ON public.knowledge_bank_gaps
    FOR SELECT TO authenticated
    USING (public.is_hq_user());

CREATE POLICY kb_gaps_hq_update_policy ON public.knowledge_bank_gaps
    FOR UPDATE TO authenticated
    USING (public.is_hq_user())
    WITH CHECK (public.is_hq_user());

-- No INSERT/DELETE policy for authenticated — gaps are written exclusively
-- by the server via the service-role key, mirroring event_logs/audit_logs.
GRANT SELECT, UPDATE ON public.knowledge_bank_gaps TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_bank_gaps TO service_role;
