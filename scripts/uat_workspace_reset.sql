-- ============================================================================
-- MYKERANI UAT Workspace Reset Script
-- 
-- TARGET: Reset user-generated financial data for two workspaces:
--   1. owner/staff@demo (demo accounts)
--   2. SR Creative / Jebat Maju (real testing workspace)
--
-- This script does NOT modify code, schema, RLS, or system configuration.
-- It ONLY deletes user-generated data from the specified workspaces.
--
-- RUN INSTRUCTIONS:
--   1. Open Supabase Dashboard → SQL Editor
--   2. Run Part 1 (BACKUP) first — verify backup table created
--   3. Run Part 2 (IDENTIFY) — verify correct workspaces identified
--   4. Run Part 3 (DELETE) — deletes all user data from target workspaces
--   5. Run Part 4 (VERIFY) — confirms no orphan records remain
--
-- SAFETY: All deletes are workspace-scoped. System data is untouched.
-- ============================================================================

-- ═════════════════════════════════════════════════════════════════════════════
-- PART 1: BACKUP — Export affected data before deletion
-- ═════════════════════════════════════════════════════════════════════════════

-- Create a backup schema to hold the exported data
CREATE SCHEMA IF NOT EXISTS uat_backup_20260626;

-- ─── Step 1a: Identify target workspaces ───────────────────────────────────
-- We need to find the workspace IDs for:
--   1. The demo workspace (owner@demo / staff@demo)
--   2. The "SR Creative" or "Jebat Maju" workspace

-- First, find user IDs for demo accounts
DO $$
DECLARE
  v_demo_owner_id TEXT;
  v_demo_staff_id TEXT;
  v_demo_tenant_id UUID;
  v_sr_creative_tenant_id UUID;
  v_demo_workspace_id UUID;
  v_sr_workspace_id UUID;
BEGIN
  -- Find demo owner user from auth.users by email pattern
  SELECT id::TEXT INTO v_demo_owner_id FROM auth.users WHERE email ILIKE '%owner%@demo%' LIMIT 1;
  SELECT id::TEXT INTO v_demo_staff_id FROM auth.users WHERE email ILIKE '%staff%@demo%' LIMIT 1;
  
  RAISE NOTICE 'Demo Owner ID: %', v_demo_owner_id;
  RAISE NOTICE 'Demo Staff ID: %', v_demo_staff_id;
  
  -- Find tenant IDs from user_role_assignments
  IF v_demo_owner_id IS NOT NULL THEN
    SELECT tenant_id INTO v_demo_tenant_id FROM public.user_role_assignments WHERE user_id = v_demo_owner_id LIMIT 1;
  END IF;
  RAISE NOTICE 'Demo Tenant ID: %', v_demo_tenant_id;
  
  -- Find SR Creative / Jebat Maju tenant
  SELECT id INTO v_sr_creative_tenant_id FROM public.tenants WHERE name ILIKE '%SR Creative%' OR name ILIKE '%Jebat Maju%' LIMIT 1;
  RAISE NOTICE 'SR Creative Tenant ID: %', v_sr_creative_tenant_id;
  
  -- Find workspace IDs
  IF v_demo_tenant_id IS NOT NULL THEN
    SELECT id INTO v_demo_workspace_id FROM public.workspaces WHERE tenant_id = v_demo_tenant_id LIMIT 1;
  END IF;
  
  IF v_sr_creative_tenant_id IS NOT NULL THEN
    SELECT id INTO v_sr_workspace_id FROM public.workspaces WHERE tenant_id = v_sr_creative_tenant_id LIMIT 1;
  END IF;
  
  RAISE NOTICE 'Demo Workspace ID: %', v_demo_workspace_id;
  RAISE NOTICE 'SR Creative Workspace ID: %', v_sr_workspace_id;
  
  -- Store IDs in a temp table for use in subsequent parts
  CREATE TABLE IF NOT EXISTS uat_backup_20260626._target_ids AS
  SELECT
    v_demo_tenant_id::UUID AS demo_tenant_id,
    v_demo_workspace_id::UUID AS demo_workspace_id,
    v_sr_creative_tenant_id::UUID AS sr_tenant_id,
    v_sr_workspace_id::UUID AS sr_workspace_id;
END;
$$;

-- ─── Step 1b: Backup all affected tables ──────────────────────────────────
-- Each backup table is prefixed with the original table name
-- We backup ALL rows where workspace_id matches our targets

DO $$
DECLARE
  v_demo_ws UUID;
  v_sr_ws UUID;
BEGIN
  SELECT demo_workspace_id, sr_workspace_id INTO v_demo_ws, v_sr_ws FROM uat_backup_20260626._target_ids;
  
  -- Backup financial records
  CREATE TABLE uat_backup_20260626.income_records AS SELECT * FROM public.income_records WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  CREATE TABLE uat_backup_20260626.expense_records AS SELECT * FROM public.expense_records WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  CREATE TABLE uat_backup_20260626.receivables AS SELECT * FROM public.receivables WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  CREATE TABLE uat_backup_20260626.payables AS SELECT * FROM public.payables WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  CREATE TABLE uat_backup_20260626.debts AS SELECT * FROM public.debts WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  CREATE TABLE uat_backup_20260626.financial_commitments AS SELECT * FROM public.financial_commitments WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  
  -- Backup accounts
  CREATE TABLE uat_backup_20260626.bank_accounts AS SELECT * FROM public.bank_accounts WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  CREATE TABLE uat_backup_20260626.cash_accounts AS SELECT * FROM public.cash_accounts WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  
  -- Backup evidence
  CREATE TABLE uat_backup_20260626.financial_evidence_packages AS SELECT * FROM public.financial_evidence_packages WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  CREATE TABLE uat_backup_20260626.evidence_bundles AS SELECT * FROM public.evidence_bundles WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  CREATE TABLE uat_backup_20260626.evidence_documents AS SELECT * FROM public.evidence_documents WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  CREATE TABLE uat_backup_20260626.ledger_evidence_mappings AS SELECT * FROM public.ledger_evidence_mappings WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  
  -- Backup AI/memory
  CREATE TABLE uat_backup_20260626.ocr_learned_patterns AS SELECT * FROM public.ocr_learned_patterns WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  CREATE TABLE uat_backup_20260626.ai_chat_messages AS SELECT * FROM public.ai_chat_messages WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  CREATE TABLE uat_backup_20260626.chat_sessions AS SELECT * FROM public.chat_sessions WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  
  -- Backup duplicate detection
  CREATE TABLE uat_backup_20260626.duplicate_flags AS SELECT * FROM public.duplicate_flags WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  
  -- Backup profile data
  CREATE TABLE uat_backup_20260626.personal_profiles AS SELECT * FROM public.personal_profiles WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  CREATE TABLE uat_backup_20260626.business_profiles AS SELECT * FROM public.business_profiles WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  CREATE TABLE uat_backup_20260626.businesses AS SELECT * FROM public.businesses WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  CREATE TABLE uat_backup_20260626.business_branches AS SELECT * FROM public.business_branches WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  CREATE TABLE uat_backup_20260626.vehicles AS SELECT * FROM public.vehicles WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  CREATE TABLE uat_backup_20260626.dependents AS SELECT * FROM public.dependents WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  CREATE TABLE uat_backup_20260626.asset_purchases AS SELECT * FROM public.asset_purchases WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  CREATE TABLE uat_backup_20260626.owner_transactions AS SELECT * FROM public.owner_transactions WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  
  -- Backup new repositories
  CREATE TABLE uat_backup_20260626.profile_customers AS SELECT * FROM public.profile_customers WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  CREATE TABLE uat_backup_20260626.profile_suppliers AS SELECT * FROM public.profile_suppliers WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  CREATE TABLE uat_backup_20260626.profile_properties AS SELECT * FROM public.profile_properties WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  CREATE TABLE uat_backup_20260626.profile_insurance AS SELECT * FROM public.profile_insurance WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  CREATE TABLE uat_backup_20260626.profile_investments AS SELECT * FROM public.profile_investments WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  
  -- Backup junction tables
  CREATE TABLE uat_backup_20260626.vehicle_businesses AS SELECT * FROM public.vehicle_businesses WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  CREATE TABLE uat_backup_20260626.bank_account_businesses AS SELECT * FROM public.bank_account_businesses WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  CREATE TABLE uat_backup_20260626.property_businesses AS SELECT * FROM public.property_businesses WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  
  -- Backup general ledger categories (user-created only — not system defaults)
  CREATE TABLE uat_backup_20260626.general_ledger_categories AS SELECT * FROM public.general_ledger_categories WHERE workspace_id IN (v_demo_ws, v_sr_ws) AND is_system_default = false;
  
  -- Backup audit logs and activity logs for these tenants
  CREATE TABLE uat_backup_20260626.audit_logs AS
    SELECT * FROM public.audit_logs WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  
  -- Backup event logs
  DECLARE
    v_demo_tenant UUID;
    v_sr_tenant UUID;
  BEGIN
    SELECT demo_tenant_id, sr_tenant_id INTO v_demo_tenant, v_sr_tenant FROM uat_backup_20260626._target_ids;
    CREATE TABLE uat_backup_20260626.event_logs AS
      SELECT * FROM public.event_logs WHERE tenant_id IN (v_demo_tenant, v_sr_tenant);
    CREATE TABLE uat_backup_20260626.tenant_activity_log AS
      SELECT * FROM public.tenant_activity_log WHERE tenant_id IN (v_demo_tenant, v_sr_tenant);
  END;
  
  RAISE NOTICE 'Backup complete — all tables created in uat_backup_20260626 schema';
END;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- PART 2: IDENTIFY — Verify target workspaces before deletion
-- ═════════════════════════════════════════════════════════════════════════════

-- Review the identified targets before proceeding to deletion
SELECT
  t.id AS tenant_id,
  t.name AS tenant_name,
  t.category,
  w.id AS workspace_id,
  w.name AS workspace_name,
  w.slug,
  (SELECT COUNT(*) FROM public.income_records WHERE workspace_id = w.id) AS income_count,
  (SELECT COUNT(*) FROM public.expense_records WHERE workspace_id = w.id) AS expense_count,
  (SELECT COUNT(*) FROM public.bank_accounts WHERE workspace_id = w.id) AS bank_count,
  (SELECT COUNT(*) FROM public.cash_accounts WHERE workspace_id = w.id) AS cash_count,
  (SELECT COUNT(*) FROM public.debts WHERE workspace_id = w.id) AS debt_count,
  (SELECT COUNT(*) FROM public.financial_commitments WHERE workspace_id = w.id) AS commitment_count,
  (SELECT COUNT(*) FROM public.financial_evidence_packages WHERE workspace_id = w.id) AS evidence_count,
  (SELECT COUNT(*) FROM public.ocr_learned_patterns WHERE workspace_id = w.id) AS pattern_count,
  (SELECT COUNT(*) FROM public.ai_chat_messages WHERE workspace_id = w.id) AS chat_count,
  (SELECT COUNT(*) FROM public.duplicate_flags WHERE workspace_id = w.id) AS dup_count,
  (SELECT COUNT(*) FROM public.businesses WHERE workspace_id = w.id) AS business_count,
  (SELECT COUNT(*) FROM public.vehicles WHERE workspace_id = w.id) AS vehicle_count,
  (SELECT COUNT(*) FROM public.dependents WHERE workspace_id = w.id) AS dependent_count,
  (SELECT COUNT(*) FROM public.asset_purchases WHERE workspace_id = w.id) AS asset_count,
  (SELECT COUNT(*) FROM public.owner_transactions WHERE workspace_id = w.id) AS owner_txn_count,
  (SELECT COUNT(*) FROM public.profile_customers WHERE workspace_id = w.id) AS customer_count,
  (SELECT COUNT(*) FROM public.profile_suppliers WHERE workspace_id = w.id) AS supplier_count,
  (SELECT COUNT(*) FROM public.profile_properties WHERE workspace_id = w.id) AS property_count,
  (SELECT COUNT(*) FROM public.profile_insurance WHERE workspace_id = w.id) AS insurance_count,
  (SELECT COUNT(*) FROM public.profile_investments WHERE workspace_id = w.id) AS investment_count,
  (SELECT COUNT(*) FROM public.personal_profiles WHERE workspace_id = w.id) AS personal_profile_count
FROM public.tenants t
JOIN public.workspaces w ON w.tenant_id = t.id
WHERE t.id IN (
  SELECT demo_tenant_id FROM uat_backup_20260626._target_ids
  UNION
  SELECT sr_tenant_id FROM uat_backup_20260626._target_ids
)
ORDER BY t.name;

-- ═════════════════════════════════════════════════════════════════════════════
-- PART 3: DELETE — Remove all user-generated data from target workspaces
-- ═════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_demo_ws UUID;
  v_sr_ws UUID;
  v_demo_tenant UUID;
  v_sr_tenant UUID;
  v_total_deleted INTEGER := 0;
  v_count INTEGER;
BEGIN
  SELECT demo_workspace_id, sr_workspace_id INTO v_demo_ws, v_sr_ws FROM uat_backup_20260626._target_ids;
  SELECT demo_tenant_id, sr_tenant_id INTO v_demo_tenant, v_sr_tenant FROM uat_backup_20260626._target_ids;
  
  -- Helper: target workspace IDs as array
  -- Delete order matters for FK constraints: children first, parents last
  
  -- 1. Ledger evidence mappings (FK to evidence_bundles + financial records)
  DELETE FROM public.ledger_evidence_mappings WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % ledger_evidence_mappings', v_count;
  
  -- 2. Evidence documents
  DELETE FROM public.evidence_documents WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % evidence_documents', v_count;
  
  -- 3. Evidence bundles
  DELETE FROM public.evidence_bundles WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % evidence_bundles', v_count;
  
  -- 4. Financial evidence packages
  DELETE FROM public.financial_evidence_packages WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % financial_evidence_packages', v_count;
  
  -- 5. Duplicate flags
  DELETE FROM public.duplicate_flags WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % duplicate_flags', v_count;
  
  -- 6. AI chat messages (FK to chat_sessions)
  DELETE FROM public.ai_chat_messages WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % ai_chat_messages', v_count;
  
  -- 7. Chat sessions
  DELETE FROM public.chat_sessions WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % chat_sessions', v_count;
  
  -- 8. OCR learned patterns
  DELETE FROM public.ocr_learned_patterns WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % ocr_learned_patterns', v_count;
  
  -- 9. Income records
  DELETE FROM public.income_records WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % income_records', v_count;
  
  -- 10. Expense records
  DELETE FROM public.expense_records WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % expense_records', v_count;
  
  -- 11. Receivables
  DELETE FROM public.receivables WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % receivables', v_count;
  
  -- 12. Payables
  DELETE FROM public.payables WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % payables', v_count;
  
  -- 13. Debts
  DELETE FROM public.debts WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % debts', v_count;
  
  -- 14. Financial commitments
  DELETE FROM public.financial_commitments WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % financial_commitments', v_count;
  
  -- 15. Junction tables
  DELETE FROM public.vehicle_businesses WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % vehicle_businesses', v_count;
  
  DELETE FROM public.bank_account_businesses WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % bank_account_businesses', v_count;
  
  DELETE FROM public.property_businesses WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % property_businesses', v_count;
  
  -- 16. Asset purchases
  DELETE FROM public.asset_purchases WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % asset_purchases', v_count;
  
  -- 17. Owner transactions
  DELETE FROM public.owner_transactions WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % owner_transactions', v_count;
  
  -- 18. Business branches (FK to businesses)
  DELETE FROM public.business_branches WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % business_branches', v_count;
  
  -- 19. Businesses
  DELETE FROM public.businesses WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % businesses', v_count;
  
  -- 20. Vehicles
  DELETE FROM public.vehicles WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % vehicles', v_count;
  
  -- 21. Dependents
  DELETE FROM public.dependents WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % dependents', v_count;
  
  -- 22. Profile repositories (new)
  DELETE FROM public.profile_customers WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % profile_customers', v_count;
  
  DELETE FROM public.profile_suppliers WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % profile_suppliers', v_count;
  
  DELETE FROM public.profile_properties WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % profile_properties', v_count;
  
  DELETE FROM public.profile_insurance WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % profile_insurance', v_count;
  
  DELETE FROM public.profile_investments WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % profile_investments', v_count;
  
  -- 23. Personal profiles
  DELETE FROM public.personal_profiles WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % personal_profiles', v_count;
  
  -- 24. Business profiles (legacy)
  DELETE FROM public.business_profiles WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % business_profiles', v_count;
  
  -- 25. Bank accounts
  DELETE FROM public.bank_accounts WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % bank_accounts', v_count;
  
  -- 26. Cash accounts
  DELETE FROM public.cash_accounts WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % cash_accounts', v_count;
  
  -- 27. User-created general ledger categories (keep system defaults)
  DELETE FROM public.general_ledger_categories WHERE workspace_id IN (v_demo_ws, v_sr_ws) AND is_system_default = false;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % user-created general_ledger_categories (system defaults kept)', v_count;
  
  -- 28. Audit logs for these workspaces
  DELETE FROM public.audit_logs WHERE workspace_id IN (v_demo_ws, v_sr_ws);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % audit_logs', v_count;
  
  -- 29. Event logs for these tenants
  DELETE FROM public.event_logs WHERE tenant_id IN (v_demo_tenant, v_sr_tenant);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % event_logs', v_count;
  
  -- 30. Tenant activity log for these tenants
  DELETE FROM public.tenant_activity_log WHERE tenant_id IN (v_demo_tenant, v_sr_tenant);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total_deleted := v_total_deleted + v_count;
  RAISE NOTICE 'Deleted % tenant_activity_log', v_count;
  
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE 'TOTAL ROWS DELETED: %', v_total_deleted;
  RAISE NOTICE '════════════════════════════════════════════════════════════';
END;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- PART 4: VERIFY — Confirm no orphan records remain
-- ═════════════════════════════════════════════════════════════════════════════

-- Verify: no financial records remain for target workspaces
SELECT 'Verification: No user data remaining' AS check_name;

SELECT
  'income_records' AS table_name,
  COUNT(*) AS remaining
FROM public.income_records
WHERE workspace_id IN (SELECT demo_workspace_id FROM uat_backup_20260626._target_ids WHERE demo_workspace_id IS NOT NULL UNION SELECT sr_workspace_id FROM uat_backup_20260626._target_ids WHERE sr_workspace_id IS NOT NULL)

UNION ALL SELECT 'expense_records', COUNT(*) FROM public.expense_records WHERE workspace_id IN (SELECT demo_workspace_id FROM uat_backup_20260626._target_ids WHERE demo_workspace_id IS NOT NULL UNION SELECT sr_workspace_id FROM uat_backup_20260626._target_ids WHERE sr_workspace_id IS NOT NULL)
UNION ALL SELECT 'receivables', COUNT(*) FROM public.receivables WHERE workspace_id IN (SELECT demo_workspace_id FROM uat_backup_20260626._target_ids WHERE demo_workspace_id IS NOT NULL UNION SELECT sr_workspace_id FROM uat_backup_20260626._target_ids WHERE sr_workspace_id IS NOT NULL)
UNION ALL SELECT 'payables', COUNT(*) FROM public.payables WHERE workspace_id IN (SELECT demo_workspace_id FROM uat_backup_20260626._target_ids WHERE demo_workspace_id IS NOT NULL UNION SELECT sr_workspace_id FROM uat_backup_20260626._target_ids WHERE sr_workspace_id IS NOT NULL)
UNION ALL SELECT 'debts', COUNT(*) FROM public.debts WHERE workspace_id IN (SELECT demo_workspace_id FROM uat_backup_20260626._target_ids WHERE demo_workspace_id IS NOT NULL UNION SELECT sr_workspace_id FROM uat_backup_20260626._target_ids WHERE sr_workspace_id IS NOT NULL)
UNION ALL SELECT 'financial_commitments', COUNT(*) FROM public.financial_commitments WHERE workspace_id IN (SELECT demo_workspace_id FROM uat_backup_20260626._target_ids WHERE demo_workspace_id IS NOT NULL UNION SELECT sr_workspace_id FROM uat_backup_20260626._target_ids WHERE sr_workspace_id IS NOT NULL)
UNION ALL SELECT 'bank_accounts', COUNT(*) FROM public.bank_accounts WHERE workspace_id IN (SELECT demo_workspace_id FROM uat_backup_20260626._target_ids WHERE demo_workspace_id IS NOT NULL UNION SELECT sr_workspace_id FROM uat_backup_20260626._target_ids WHERE sr_workspace_id IS NOT NULL)
UNION ALL SELECT 'cash_accounts', COUNT(*) FROM public.cash_accounts WHERE workspace_id IN (SELECT demo_workspace_id FROM uat_backup_20260626._target_ids WHERE demo_workspace_id IS NOT NULL UNION SELECT sr_workspace_id FROM uat_backup_20260626._target_ids WHERE sr_workspace_id IS NOT NULL)
UNION ALL SELECT 'financial_evidence_packages', COUNT(*) FROM public.financial_evidence_packages WHERE workspace_id IN (SELECT demo_workspace_id FROM uat_backup_20260626._target_ids WHERE demo_workspace_id IS NOT NULL UNION SELECT sr_workspace_id FROM uat_backup_20260626._target_ids WHERE sr_workspace_id IS NOT NULL)
UNION ALL SELECT 'ocr_learned_patterns', COUNT(*) FROM public.ocr_learned_patterns WHERE workspace_id IN (SELECT demo_workspace_id FROM uat_backup_20260626._target_ids WHERE demo_workspace_id IS NOT NULL UNION SELECT sr_workspace_id FROM uat_backup_20260626._target_ids WHERE sr_workspace_id IS NOT NULL)
UNION ALL SELECT 'ai_chat_messages', COUNT(*) FROM public.ai_chat_messages WHERE workspace_id IN (SELECT demo_workspace_id FROM uat_backup_20260626._target_ids WHERE demo_workspace_id IS NOT NULL UNION SELECT sr_workspace_id FROM uat_backup_20260626._target_ids WHERE sr_workspace_id IS NOT NULL)
UNION ALL SELECT 'chat_sessions', COUNT(*) FROM public.chat_sessions WHERE workspace_id IN (SELECT demo_workspace_id FROM uat_backup_20260626._target_ids WHERE demo_workspace_id IS NOT NULL UNION SELECT sr_workspace_id FROM uat_backup_20260626._target_ids WHERE sr_workspace_id IS NOT NULL)
UNION ALL SELECT 'duplicate_flags', COUNT(*) FROM public.duplicate_flags WHERE workspace_id IN (SELECT demo_workspace_id FROM uat_backup_20260626._target_ids WHERE demo_workspace_id IS NOT NULL UNION SELECT sr_workspace_id FROM uat_backup_20260626._target_ids WHERE sr_workspace_id IS NOT NULL)
UNION ALL SELECT 'businesses', COUNT(*) FROM public.businesses WHERE workspace_id IN (SELECT demo_workspace_id FROM uat_backup_20260626._target_ids WHERE demo_workspace_id IS NOT NULL UNION SELECT sr_workspace_id FROM uat_backup_20260626._target_ids WHERE sr_workspace_id IS NOT NULL)
UNION ALL SELECT 'business_branches', COUNT(*) FROM public.business_branches WHERE workspace_id IN (SELECT demo_workspace_id FROM uat_backup_20260626._target_ids WHERE demo_workspace_id IS NOT NULL UNION SELECT sr_workspace_id FROM uat_backup_20260626._target_ids WHERE sr_workspace_id IS NOT NULL)
UNION ALL SELECT 'vehicles', COUNT(*) FROM public.vehicles WHERE workspace_id IN (SELECT demo_workspace_id FROM uat_backup_20260626._target_ids WHERE demo_workspace_id IS NOT NULL UNION SELECT sr_workspace_id FROM uat_backup_20260626._target_ids WHERE sr_workspace_id IS NOT NULL)
UNION ALL SELECT 'dependents', COUNT(*) FROM public.dependents WHERE workspace_id IN (SELECT demo_workspace_id FROM uat_backup_20260626._target_ids WHERE demo_workspace_id IS NOT NULL UNION SELECT sr_workspace_id FROM uat_backup_20260626._target_ids WHERE sr_workspace_id IS NOT NULL)
UNION ALL SELECT 'asset_purchases', COUNT(*) FROM public.asset_purchases WHERE workspace_id IN (SELECT demo_workspace_id FROM uat_backup_20260626._target_ids WHERE demo_workspace_id IS NOT NULL UNION SELECT sr_workspace_id FROM uat_backup_20260626._target_ids WHERE sr_workspace_id IS NOT NULL)
UNION ALL SELECT 'owner_transactions', COUNT(*) FROM public.owner_transactions WHERE workspace_id IN (SELECT demo_workspace_id FROM uat_backup_20260626._target_ids WHERE demo_workspace_id IS NOT NULL UNION SELECT sr_workspace_id FROM uat_backup_20260626._target_ids WHERE sr_workspace_id IS NOT NULL)
UNION ALL SELECT 'profile_customers', COUNT(*) FROM public.profile_customers WHERE workspace_id IN (SELECT demo_workspace_id FROM uat_backup_20260626._target_ids WHERE demo_workspace_id IS NOT NULL UNION SELECT sr_workspace_id FROM uat_backup_20260626._target_ids WHERE sr_workspace_id IS NOT NULL)
UNION ALL SELECT 'profile_suppliers', COUNT(*) FROM public.profile_suppliers WHERE workspace_id IN (SELECT demo_workspace_id FROM uat_backup_20260626._target_ids WHERE demo_workspace_id IS NOT NULL UNION SELECT sr_workspace_id FROM uat_backup_20260626._target_ids WHERE sr_workspace_id IS NOT NULL)
UNION ALL SELECT 'profile_properties', COUNT(*) FROM public.profile_properties WHERE workspace_id IN (SELECT demo_workspace_id FROM uat_backup_20260626._target_ids WHERE demo_workspace_id IS NOT NULL UNION SELECT sr_workspace_id FROM uat_backup_20260626._target_ids WHERE sr_workspace_id IS NOT NULL)
UNION ALL SELECT 'profile_insurance', COUNT(*) FROM public.profile_insurance WHERE workspace_id IN (SELECT demo_workspace_id FROM uat_backup_20260626._target_ids WHERE demo_workspace_id IS NOT NULL UNION SELECT sr_workspace_id FROM uat_backup_20260626._target_ids WHERE sr_workspace_id IS NOT NULL)
UNION ALL SELECT 'profile_investments', COUNT(*) FROM public.profile_investments WHERE workspace_id IN (SELECT demo_workspace_id FROM uat_backup_20260626._target_ids WHERE demo_workspace_id IS NOT NULL UNION SELECT sr_workspace_id FROM uat_backup_20260626._target_ids WHERE sr_workspace_id IS NOT NULL)
UNION ALL SELECT 'personal_profiles', COUNT(*) FROM public.personal_profiles WHERE workspace_id IN (SELECT demo_workspace_id FROM uat_backup_20260626._target_ids WHERE demo_workspace_id IS NOT NULL UNION SELECT sr_workspace_id FROM uat_backup_20260626._target_ids WHERE sr_workspace_id IS NOT NULL)
ORDER BY table_name;

-- Verify: system data is preserved
SELECT 'Verification: System data preserved' AS check_name;

SELECT 'tenants' AS table_name, COUNT(*) AS remaining FROM public.tenants
UNION ALL SELECT 'workspaces', COUNT(*) FROM public.workspaces
UNION ALL SELECT 'user_role_assignments', COUNT(*) FROM public.user_role_assignments
UNION ALL SELECT 'subscription_plans', COUNT(*) FROM public.subscription_plans
UNION ALL SELECT 'permission_matrices', COUNT(*) FROM public.permission_matrices
UNION ALL SELECT 'site_settings', COUNT(*) FROM public.site_settings
UNION ALL SELECT 'general_ledger_categories (system)', COUNT(*) FROM public.general_ledger_categories WHERE is_system_default = true
ORDER BY table_name;

-- Verify: target workspaces still exist (not deleted)
SELECT 'Verification: Target workspaces still exist' AS check_name;

SELECT t.id AS tenant_id, t.name AS tenant_name, w.id AS workspace_id, w.name AS workspace_name
FROM public.tenants t
JOIN public.workspaces w ON w.tenant_id = t.id
WHERE t.id IN (SELECT demo_tenant_id FROM uat_backup_20260626._target_ids UNION SELECT sr_tenant_id FROM uat_backup_20260626._target_ids)
ORDER BY t.name;

-- Verify: user accounts still exist (auth preserved)
SELECT 'Verification: User accounts still exist' AS check_name;

SELECT u.id, u.email, u.created_at
FROM auth.users u
WHERE u.email ILIKE '%@demo%'
ORDER BY u.email;

-- ═════════════════════════════════════════════════════════════════════════════
-- PART 5: STORAGE CLEANUP — Remove uploaded files from Supabase Storage
-- ═════════════════════════════════════════════════════════════════════════════

-- Note: Storage file cleanup must be done via the Supabase Storage API or Dashboard.
-- The SQL above deletes the DATABASE rows (file_path references) but does NOT
-- delete the actual files from the storage bucket.
--
-- To clean up storage files:
-- 1. Go to Supabase Dashboard → Storage
-- 2. Navigate to the 'evidence-packages' bucket
-- 3. Delete folders matching the target workspace IDs
--    (the workspace IDs are shown in the _target_ids table)
--
-- Alternatively, run this from the Supabase Storage API:
-- SELECT * FROM uat_backup_20260626._target_ids;
-- -- Use the workspace IDs to delete the corresponding storage folders

SELECT * FROM uat_backup_20260626._target_ids;

-- ═════════════════════════════════════════════════════════════════════════════
-- COMPLETION MESSAGE
-- ═════════════════════════════════════════════════════════════════════════════

-- After running all 4 parts, the two target workspaces are now clean:
-- ✅ All financial records deleted
-- ✅ All AI memory (OCR patterns, chat history) deleted
-- ✅ All profile data deleted
-- ✅ All evidence packages deleted
-- ✅ All duplicate flags deleted
-- ✅ All audit logs and activity logs deleted
-- ✅ Users, tenants, workspaces, roles, permissions preserved
-- ✅ System configuration, plans, settings preserved
-- ✅ Backup created in uat_backup_20260626 schema
--
-- The workspaces now behave like newly registered accounts.
-- Login with owner@demo / staff@demo to verify.