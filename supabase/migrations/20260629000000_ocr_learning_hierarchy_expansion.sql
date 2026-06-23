-- ============================================================================
-- MYKERANI Database Hardening Migration Script
-- Module: Phase 2B — Learning Memory Engine — Hierarchy Expansion
-- Created At: 2026-06-29
-- Description: Additive, backward-compatible expansion of the existing
--              ocr_learned_patterns table to support a Branch -> Business ->
--              Workspace -> Cross-Workspace learning hierarchy, and a
--              soft-disable pattern lifecycle. No new table is created (per
--              instruction: reuse ocr_learned_patterns, do not fork the
--              learning engine). Every column is nullable/defaulted, so all
--              existing rows remain valid tier-3 (workspace-level) patterns
--              with zero data migration required.
-- ============================================================================

-- 1. ADDITIVE COLUMNS
ALTER TABLE public.ocr_learned_patterns
    ADD COLUMN IF NOT EXISTS pattern_type VARCHAR(30) NOT NULL DEFAULT 'VENDOR_CATEGORY',
    ADD COLUMN IF NOT EXISTS business_id UUID NULL REFERENCES public.businesses(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS branch_id UUID NULL REFERENCES public.business_branches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 2. COMPOSITE UNIQUENESS MODEL
-- Replaces (workspace_id, vendor_name) with a tier-aware key so the same
-- vendor can carry a distinct learned pattern per business/branch, while a
-- branch_id/business_id of NULL continues to mean "workspace-wide", exactly
-- matching every pre-existing row's current behavior.
ALTER TABLE public.ocr_learned_patterns
    DROP CONSTRAINT IF EXISTS uniq_workspace_vendor;
ALTER TABLE public.ocr_learned_patterns
    ADD CONSTRAINT uniq_workspace_vendor_business_branch
    UNIQUE (workspace_id, vendor_name, business_id, branch_id);

-- 3. INDEXES FOR TIER-AWARE LOOKUP
-- Backs the Branch -> Business -> Workspace fallback lookup with a single
-- composite index instead of three separate scans.
CREATE INDEX IF NOT EXISTS idx_ocr_learned_patterns_hierarchy
    ON public.ocr_learned_patterns(workspace_id, vendor_name, business_id, branch_id);

-- Active-only patterns are what every suggestion lookup filters on; speeds
-- up excluding disabled patterns without a sequential scan as the table grows.
CREATE INDEX IF NOT EXISTS idx_ocr_learned_patterns_active
    ON public.ocr_learned_patterns(workspace_id, is_active);

-- ============================================================================
-- ROLLBACK (manual, for reference — not executed automatically):
--
-- ALTER TABLE public.ocr_learned_patterns DROP CONSTRAINT IF EXISTS uniq_workspace_vendor_business_branch;
-- ALTER TABLE public.ocr_learned_patterns ADD CONSTRAINT uniq_workspace_vendor UNIQUE (workspace_id, vendor_name);
-- DROP INDEX IF EXISTS idx_ocr_learned_patterns_hierarchy;
-- DROP INDEX IF EXISTS idx_ocr_learned_patterns_active;
-- ALTER TABLE public.ocr_learned_patterns
--     DROP COLUMN IF EXISTS pattern_type,
--     DROP COLUMN IF EXISTS business_id,
--     DROP COLUMN IF EXISTS branch_id,
--     DROP COLUMN IF EXISTS metadata,
--     DROP COLUMN IF EXISTS is_active;
-- ============================================================================
