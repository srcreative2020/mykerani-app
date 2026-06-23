-- ============================================================================
-- MYKERANI Database Hardening Migration Script
-- Module: Phase 2C — Cross-Source Duplicate Detection
-- Created At: 2026-06-30
-- Description: Additive, backward-compatible foundation for detecting
--              duplicate transactions that originate from different sources
--              (e.g. the same expense entered once via OCR receipt and again
--              via bank statement import). This migration:
--                1. Adds an explicit source_system column to the four
--                   financial record tables, backfilled to 'MANUAL' for all
--                   pre-existing rows (the only safe backfill — we do NOT
--                   infer source from reference number prefixes, filenames,
--                   or descriptions, per explicit product instruction).
--                2. Creates a new additive `duplicate_flags` table acting as
--                   the Review Queue for system-suggested duplicate pairs.
--                   Nothing in this migration or the engine that populates
--                   this table may delete/merge/void/hide a financial
--                   record — only an explicit user review action may set
--                   CONFIRMED_DUPLICATE or REVIEWED_NOT_DUPLICATE.
--              Per the Owner/Staff Parity Rule, duplicate detection is ONE
--              shared engine — this table has no Owner-only/Staff-only RLS
--              split, mirroring the tenant-isolation policy shape used by
--              ocr_learned_patterns / event_logs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. source_system on the four financial record tables
-- ----------------------------------------------------------------------------
ALTER TABLE public.income_records
    ADD COLUMN IF NOT EXISTS source_system TEXT;
ALTER TABLE public.expense_records
    ADD COLUMN IF NOT EXISTS source_system TEXT;
ALTER TABLE public.receivables
    ADD COLUMN IF NOT EXISTS source_system TEXT;
ALTER TABLE public.payables
    ADD COLUMN IF NOT EXISTS source_system TEXT;

-- Backfill: the only safe default for every existing row is 'MANUAL' — we
-- have no reliable signal for what actually created historical rows, and we
-- were explicitly told not to guess from reference_number/description/etc.
UPDATE public.income_records SET source_system = 'MANUAL' WHERE source_system IS NULL;
UPDATE public.expense_records SET source_system = 'MANUAL' WHERE source_system IS NULL;
UPDATE public.receivables SET source_system = 'MANUAL' WHERE source_system IS NULL;
UPDATE public.payables SET source_system = 'MANUAL' WHERE source_system IS NULL;

-- Now safe to enforce NOT NULL with a DEFAULT for all future inserts that
-- don't explicitly specify a source_system (defensive — the app always
-- passes one explicitly, defaulting to 'MANUAL' itself).
ALTER TABLE public.income_records
    ALTER COLUMN source_system SET DEFAULT 'MANUAL',
    ALTER COLUMN source_system SET NOT NULL;
ALTER TABLE public.expense_records
    ALTER COLUMN source_system SET DEFAULT 'MANUAL',
    ALTER COLUMN source_system SET NOT NULL;
ALTER TABLE public.receivables
    ALTER COLUMN source_system SET DEFAULT 'MANUAL',
    ALTER COLUMN source_system SET NOT NULL;
ALTER TABLE public.payables
    ALTER COLUMN source_system SET DEFAULT 'MANUAL',
    ALTER COLUMN source_system SET NOT NULL;

ALTER TABLE public.income_records
    DROP CONSTRAINT IF EXISTS chk_income_records_source_system;
ALTER TABLE public.income_records
    ADD CONSTRAINT chk_income_records_source_system
    CHECK (source_system IN ('OCR','BANK_STATEMENT','AI_CHAT','VOICE_NOTE','MANUAL'));

ALTER TABLE public.expense_records
    DROP CONSTRAINT IF EXISTS chk_expense_records_source_system;
ALTER TABLE public.expense_records
    ADD CONSTRAINT chk_expense_records_source_system
    CHECK (source_system IN ('OCR','BANK_STATEMENT','AI_CHAT','VOICE_NOTE','MANUAL'));

ALTER TABLE public.receivables
    DROP CONSTRAINT IF EXISTS chk_receivables_source_system;
ALTER TABLE public.receivables
    ADD CONSTRAINT chk_receivables_source_system
    CHECK (source_system IN ('OCR','BANK_STATEMENT','AI_CHAT','VOICE_NOTE','MANUAL'));

ALTER TABLE public.payables
    DROP CONSTRAINT IF EXISTS chk_payables_source_system;
ALTER TABLE public.payables
    ADD CONSTRAINT chk_payables_source_system
    CHECK (source_system IN ('OCR','BANK_STATEMENT','AI_CHAT','VOICE_NOTE','MANUAL'));

-- ----------------------------------------------------------------------------
-- 2. Bucketing indexes for the candidate-pair scan
-- (workspace_id, amount_myr, transaction_date) is not covered by any
-- existing index — business_id/branch_id indexes are single-column only.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_income_records_dup_bucket
    ON public.income_records(workspace_id, amount_myr, transaction_date);
CREATE INDEX IF NOT EXISTS idx_expense_records_dup_bucket
    ON public.expense_records(workspace_id, amount_myr, transaction_date);
CREATE INDEX IF NOT EXISTS idx_receivables_dup_bucket
    ON public.receivables(workspace_id, total_amount_myr, invoice_date);
CREATE INDEX IF NOT EXISTS idx_payables_dup_bucket
    ON public.payables(workspace_id, total_amount_myr, bill_date);

-- ----------------------------------------------------------------------------
-- 3. duplicate_flags — the Review Queue
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.duplicate_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    record_a_type TEXT NOT NULL,
    record_a_id UUID NOT NULL,
    record_b_type TEXT NOT NULL,
    record_b_id UUID NOT NULL,
    score NUMERIC(5, 4) NOT NULL,
    classification TEXT NOT NULL DEFAULT 'POSSIBLE_DUPLICATE'
        CHECK (classification IN ('UNIQUE','POSSIBLE_DUPLICATE','LIKELY_DUPLICATE','CONFIRMED_DUPLICATE','REVIEWED_NOT_DUPLICATE')),
    factor_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    reviewed_by_user_id UUID NULL,
    reviewed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uniq_duplicate_flag_pair
        UNIQUE (workspace_id, record_a_type, record_a_id, record_b_type, record_b_id)
);

CREATE INDEX IF NOT EXISTS idx_duplicate_flags_workspace_classification
    ON public.duplicate_flags(workspace_id, classification);

CREATE OR REPLACE TRIGGER trg_update_duplicate_flags_timestamp
    BEFORE UPDATE ON public.duplicate_flags
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_column();

-- ----------------------------------------------------------------------------
-- 4. RLS — mirrors ocr_learned_patterns / event_logs tenant-isolation shape.
-- No Owner-only or Staff-only split: any authenticated user belonging to the
-- workspace's tenant (Owner or Staff) gets full read/write, per the
-- Owner/Staff Parity Rule (Duplicate Detection is a listed shared engine).
-- ----------------------------------------------------------------------------
ALTER TABLE public.duplicate_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS duplicate_flags_select_policy ON public.duplicate_flags;
DROP POLICY IF EXISTS duplicate_flags_insert_policy ON public.duplicate_flags;
DROP POLICY IF EXISTS duplicate_flags_update_policy ON public.duplicate_flags;

CREATE POLICY duplicate_flags_select_policy ON public.duplicate_flags
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
        OR public.get_user_role() = 'HQ_OWNER'
    );

CREATE POLICY duplicate_flags_insert_policy ON public.duplicate_flags
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
        OR public.get_user_role() = 'HQ_OWNER'
    );

-- UPDATE is required for review decisions (classification/reviewed_by/
-- reviewed_at) — no DELETE policy is defined; flags are never deleted by the
-- app, keeping the review trail intact (consistent with audit/event log
-- immutability posture elsewhere, just update-able instead of fully
-- immutable since "mark reviewed" is a legitimate, intentional mutation).
CREATE POLICY duplicate_flags_update_policy ON public.duplicate_flags
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
        OR public.get_user_role() = 'HQ_OWNER'
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
        OR public.get_user_role() = 'HQ_OWNER'
    );

GRANT SELECT, INSERT, UPDATE ON public.duplicate_flags TO authenticated, service_role;

-- ============================================================================
-- ROLLBACK (manual, for reference — not executed automatically):
--
-- DROP TRIGGER IF EXISTS trg_update_duplicate_flags_timestamp ON public.duplicate_flags;
-- DROP POLICY IF EXISTS duplicate_flags_select_policy ON public.duplicate_flags;
-- DROP POLICY IF EXISTS duplicate_flags_insert_policy ON public.duplicate_flags;
-- DROP POLICY IF EXISTS duplicate_flags_update_policy ON public.duplicate_flags;
-- DROP TABLE IF EXISTS public.duplicate_flags;
--
-- DROP INDEX IF EXISTS idx_income_records_dup_bucket;
-- DROP INDEX IF EXISTS idx_expense_records_dup_bucket;
-- DROP INDEX IF EXISTS idx_receivables_dup_bucket;
-- DROP INDEX IF EXISTS idx_payables_dup_bucket;
--
-- ALTER TABLE public.income_records DROP CONSTRAINT IF EXISTS chk_income_records_source_system;
-- ALTER TABLE public.expense_records DROP CONSTRAINT IF EXISTS chk_expense_records_source_system;
-- ALTER TABLE public.receivables DROP CONSTRAINT IF EXISTS chk_receivables_source_system;
-- ALTER TABLE public.payables DROP CONSTRAINT IF EXISTS chk_payables_source_system;
--
-- ALTER TABLE public.income_records DROP COLUMN IF EXISTS source_system;
-- ALTER TABLE public.expense_records DROP COLUMN IF EXISTS source_system;
-- ALTER TABLE public.receivables DROP COLUMN IF EXISTS source_system;
-- ALTER TABLE public.payables DROP COLUMN IF EXISTS source_system;
-- ============================================================================
