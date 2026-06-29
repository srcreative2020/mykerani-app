-- ============================================================
-- MYKERANI — RESET SEMUA DATA TRANSAKSI
-- Padam semua data operasi, kekalkan akaun, profil, syarikat,
-- team, role & permission, settings.
-- ============================================================

-- Kekalkan: auth.users, user_role_assignments, tenants, workspaces,
-- profiles, personal_profiles, businesses, business_profiles,
-- business_branches, vehicles, dependents, subscription_plans,
-- tenant_subscriptions, resource_wallets, permission_matrices,
-- workspace_storage_providers, company_members, team_invitations,
-- companies, site_settings, commercial_config_items,
-- commercial_approval_thresholds, hq_* config tables,
-- support_tickets (jika ada tiket sokongan yang berkekalan)

-- ============================================================
-- 1. DATA TRANSAKSI KEWANGAN
-- ============================================================
DELETE FROM income_records;
DELETE FROM expense_records;
DELETE FROM receivables;
DELETE FROM payables;
DELETE FROM debts;
DELETE FROM financial_commitments;
DELETE FROM asset_purchases;
DELETE FROM owner_transactions;
DELETE FROM transactions;

-- ============================================================
-- 2. BUKTI & DOKUMEN
-- ============================================================
DELETE FROM financial_evidence_packages;
DELETE FROM ledger_evidence_mappings;
DELETE FROM evidence_documents;
DELETE FROM evidence_bundles;
DELETE FROM documents;

-- ============================================================
-- 3. AI CHAT & MEMORY
-- ============================================================
DELETE FROM ai_chat_messages;
DELETE FROM chat_sessions;
DELETE FROM ai_transaction_patterns;
DELETE FROM ai_learned_categories;
DELETE FROM ai_learned_customers;
DELETE FROM ai_learned_vendors;
DELETE FROM ocr_learned_patterns;
DELETE FROM workspace_memories;
DELETE FROM financial_intelligence_snapshots;
DELETE FROM financial_strategic_insights;
DELETE FROM financial_anomalies_logs;

-- ============================================================
-- 4. NOTIFICATIONS
-- ============================================================
DELETE FROM workspace_notifications;
DELETE FROM workspace_notification_preferences;

-- ============================================================
-- 5. AUDIT & LOGS (transaksi sahaja, bukan system config)
-- ============================================================
DELETE FROM audit_logs;
DELETE FROM event_logs;
DELETE FROM tenant_activity_log;
DELETE FROM duplicate_flags;
DELETE FROM hq_activity_views;

-- ============================================================
-- 6. PAYMENT & BILLING TRANSACTIONS (bukan plan/wallet config)
-- ============================================================
DELETE FROM payment_webhook_events;
DELETE FROM promotion_redemptions;
DELETE FROM resource_wallet_transactions;

-- ============================================================
-- 7. PROFILE SECONDARY DATA (pelanggan/pembekal/hartanah)
-- ============================================================
DELETE FROM profile_customers;
DELETE FROM profile_suppliers;
DELETE FROM profile_properties;
DELETE FROM property_businesses;
DELETE FROM profile_insurance;
DELETE FROM profile_investments;
DELETE FROM vehicle_businesses;
DELETE FROM bank_account_businesses;

-- ============================================================
-- 8. GENERAL LEDGER (kategori yang dicipta semasa transaksi)
-- ============================================================
DELETE FROM general_ledger_categories;

-- ============================================================
-- 9. SUPPORT TICKET TRANSACTIONS (replies, notes, attachments)
-- ============================================================
DELETE FROM support_ticket_attachments;
DELETE FROM support_ticket_internal_notes;
DELETE FROM support_ticket_replies;
DELETE FROM support_tickets;

-- ============================================================
-- 10. HQ OPERATIONAL DATA (snapshots, alerts, staff notifications)
-- ============================================================
DELETE FROM hq_customer_health_snapshots;
DELETE FROM hq_alerts;
DELETE FROM hq_staff_notifications;
DELETE FROM hq_governance_audit_log;
DELETE FROM hq_data_masking_grants;
DELETE FROM pending_hq_actions;
DELETE FROM role_change_audit_log;
DELETE FROM scheduled_job_runs;

-- ============================================================
-- 11. COMMERCIAL EVENTS & IDEMPOTENCY KEYS
-- ============================================================
DELETE FROM commercial_events;
DELETE FROM commercial_idempotency_keys;

-- ============================================================
-- 12. IMMUTABLE AUDIT LEDGER (transaksi sahaja)
-- ============================================================
DELETE FROM immutable_audit_ledger;

-- ============================================================
-- RESET resource_wallets BALANCES TO PLAN DEFAULTS
-- (kekalkan baris, reset baki ke elaun penuh)
-- ============================================================
UPDATE resource_wallets
SET ai_credits_balance = (
  SELECT COALESCE(s.ai_credits_allowance, 500)
  FROM tenant_subscriptions ts
  JOIN subscription_plans s ON s.id = ts.plan_id
  WHERE ts.tenant_id = resource_wallets.tenant_id
  LIMIT 1
),
ocr_credits_balance = (
  SELECT COALESCE(s.ocr_credits_allowance, 100)
  FROM tenant_subscriptions ts
  JOIN subscription_plans s ON s.id = ts.plan_id
  WHERE ts.tenant_id = resource_wallets.tenant_id
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM tenant_subscriptions ts
  WHERE ts.tenant_id = resource_wallets.tenant_id
);

-- Jika tiada subscription, reset ke nilai default
UPDATE resource_wallets
SET ai_credits_balance = 500,
    ocr_credits_balance = 100
WHERE NOT EXISTS (
  SELECT 1 FROM tenant_subscriptions ts
  WHERE ts.tenant_id = resource_wallets.tenant_id
);

-- ============================================================
-- SELESAI
-- ============================================================