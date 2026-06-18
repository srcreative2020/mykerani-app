-- ============================================================================
-- MYKERANI Database Hardening Migration Script
-- Module: Schema Standardization — Deprecate Orphaned Tables
-- Created At: 2026-06-18
-- Description: Foundation Stabilization Priority 3. Removes the unwired,
--              company-centric alternate data model introduced by
--              20260616000000_deepseek_schema_update.sql. Confirmed via
--              repo-wide search that none of companies, company_members,
--              team_invitations, transactions, documents, bills are
--              queried anywhere in src/ or server.ts — the live app uses
--              tenants/workspaces and the canonical financial-record
--              tables (income_records, expense_records, receivables,
--              payables, debts, etc.) instead.
--
--              public.profiles is KEPT — it is part of the canonical
--              table list, actively read by src/lib/hqService.ts and
--              server.ts (is_suspended check), and its row-per-signup
--              population trigger (handle_new_user on auth.users) is
--              the only thing that populates it, so that trigger and
--              its underlying function are also kept.
-- ============================================================================

DROP TABLE IF EXISTS public.bills CASCADE;
DROP TABLE IF EXISTS public.documents CASCADE;
DROP TABLE IF EXISTS public.transactions CASCADE;
DROP TABLE IF EXISTS public.team_invitations CASCADE;
DROP TABLE IF EXISTS public.company_members CASCADE;
DROP TABLE IF EXISTS public.companies CASCADE;
