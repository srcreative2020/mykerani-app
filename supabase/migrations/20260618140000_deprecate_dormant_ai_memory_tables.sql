-- ============================================================================
-- MYKERANI Database Hardening Migration Script
-- Module: Schema Standardization — Deprecate Dormant AI/Memory Tables
-- Created At: 2026-06-18
-- Description: Confirmed via repo-wide search that none of these tables are
--              queried/written anywhere in src/ or server.ts. The live AI
--              learning loop is ocr_learned_patterns (read into the AI
--              system prompt and written by learnOcrPattern), which is
--              KEPT. These were schema placeholders from an earlier design
--              pass that were never wired to the app or the AI pipeline,
--              and all have 0 rows in production:
--                workspace_memories, ai_learned_vendors, ai_learned_customers,
--                ai_learned_categories, ai_transaction_patterns,
--                financial_intelligence_snapshots, financial_strategic_insights,
--                financial_anomalies_logs.
--              immutable_audit_ledger is also dropped: it is referenced only
--              by a diagnostic self-test route in server.ts (not the real
--              audit pipeline, which uses audit_logs), and that route already
--              guards on table existence so dropping it is safe.
-- ============================================================================

DROP TABLE IF EXISTS public.workspace_memories CASCADE;
DROP TABLE IF EXISTS public.ai_learned_vendors CASCADE;
DROP TABLE IF EXISTS public.ai_learned_customers CASCADE;
DROP TABLE IF EXISTS public.ai_learned_categories CASCADE;
DROP TABLE IF EXISTS public.ai_transaction_patterns CASCADE;
DROP TABLE IF EXISTS public.financial_intelligence_snapshots CASCADE;
DROP TABLE IF EXISTS public.financial_strategic_insights CASCADE;
DROP TABLE IF EXISTS public.financial_anomalies_logs CASCADE;
DROP TABLE IF EXISTS public.immutable_audit_ledger CASCADE;
