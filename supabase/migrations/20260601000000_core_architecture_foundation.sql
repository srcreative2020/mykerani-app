-- ============================================================================
-- MYKERANI Database Hardening Migration Script
-- Module: Core Architecture Foundation (Tenants, Workspaces, Financial Ledger,
--         Evidence, AI Learning Layer, Financial Intelligence, Audit Ledger)
-- Created At: 2026-06-01 (back-dated so it runs before all later migrations
--             that reference these tables)
-- Description: Foundation Stabilization Priority 4 — Migration Source of
--              Truth. This codifies, as a versioned Supabase migration, the
--              core schema that was previously defined only as markdown
--              prose in DATABASE_ARCHITECTURE_V1_2.md and applied at server
--              startup by parsing that file's fenced ```sql blocks
--              (server.ts runDatabaseInitialization "Step A"). The markdown
--              file remains as documentation only; this migration is now
--              the single source of truth for this schema going forward.
--              All statements are idempotent — these tables already exist
--              on the live project (created by the prior markdown-driven
--              bootstrap), so this migration is a no-op there and a full
--              bootstrap on any fresh environment.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. EXTENSIONS
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. CORE TENANT & WORKSPACE HIERARCHY
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tenant_category') THEN
    CREATE TYPE tenant_category AS ENUM ('HQ', 'DEMO', 'USER');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    category tenant_category NOT NULL DEFAULT 'USER',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uniq_tenant_workspace_slug UNIQUE (tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_workspaces_tenant_id ON workspaces(tenant_id);

-- ----------------------------------------------------------------------------
-- 2. RESOURCE WALLET & SUBSCRIPTION PLANS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    monthly_price_myr NUMERIC(15, 4) NOT NULL DEFAULT 0.0000,
    annual_price_myr NUMERIC(15, 4) NOT NULL DEFAULT 0.0000,
    ai_credits_allowance BIGINT NOT NULL DEFAULT 0,
    ocr_credits_allowance BIGINT NOT NULL DEFAULT 0,
    storage_credits_allowance_mb BIGINT NOT NULL DEFAULT 0,
    notification_credits_allowance BIGINT NOT NULL DEFAULT 0,
    features JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS tenant_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    plan_id UUID REFERENCES subscription_plans(id) NOT NULL,
    status VARCHAR(50) NOT NULL,
    current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    is_trial BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS resource_wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    ai_credits_balance BIGINT DEFAULT 0 NOT NULL,
    ocr_credits_balance BIGINT DEFAULT 0 NOT NULL,
    storage_used_bytes BIGINT DEFAULT 0 NOT NULL,
    storage_limit_bytes BIGINT DEFAULT 0 NOT NULL,
    notification_credits_balance BIGINT DEFAULT 0 NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uniq_workspace_wallet UNIQUE (workspace_id)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'credit_type') THEN
    CREATE TYPE credit_type AS ENUM ('AI', 'OCR', 'STORAGE', 'NOTIFICATION');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'credit_activity_type') THEN
    CREATE TYPE credit_activity_type AS ENUM ('ALLOCATION', 'USAGE', 'REFUND', 'ADJUSTMENT');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS resource_wallet_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id UUID REFERENCES resource_wallets(id) ON DELETE CASCADE NOT NULL,
    credit_type credit_type NOT NULL,
    activity_type credit_activity_type NOT NULL,
    amount BIGINT NOT NULL,
    cost_myr NUMERIC(15, 4) DEFAULT 0.0000 NOT NULL,
    description VARCHAR(255),
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rwt_wallet_id ON resource_wallet_transactions(wallet_id);

-- ----------------------------------------------------------------------------
-- 3. COST GOVERNANCE & HQ PROFITABILITY MONITORING
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hq_infrastructure_costs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resource_key VARCHAR(100) UNIQUE NOT NULL,
    cost_price_myr NUMERIC(19, 6) NOT NULL,
    provider_name VARCHAR(100) NOT NULL,
    effective_from TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL
);

CREATE TABLE IF NOT EXISTS hq_supplier_service_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id),
    workspace_id UUID REFERENCES workspaces(id),
    resource_key VARCHAR(100) NOT NULL,
    units_used NUMERIC(15, 4) NOT NULL,
    calculated_cost_myr NUMERIC(19, 4) NOT NULL,
    raw_api_response JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hq_usage_analytics ON hq_supplier_service_logs(tenant_id, created_at);

-- ----------------------------------------------------------------------------
-- 4. FINANCIAL MODULES (Default Currency: MYR)
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ledger_category_type') THEN
    CREATE TYPE ledger_category_type AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS general_ledger_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(150) NOT NULL,
    code VARCHAR(50) NOT NULL,
    type ledger_category_type NOT NULL,
    is_system_default BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uniq_workspace_category_code UNIQUE (workspace_id, code)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bank_account_type') THEN
    CREATE TYPE bank_account_type AS ENUM ('SAVINGS', 'CURRENT', 'CREDIT_CARD', 'INVESTMENT', 'OTHER');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    bank_name VARCHAR(150) NOT NULL,
    account_name VARCHAR(150) NOT NULL,
    account_number VARCHAR(100) NOT NULL,
    account_type bank_account_type NOT NULL,
    currency_code VARCHAR(3) DEFAULT 'MYR' NOT NULL,
    current_balance_myr NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uniq_workspace_bank_acc UNIQUE (workspace_id, account_number)
);

CREATE TABLE IF NOT EXISTS cash_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(150) NOT NULL,
    physical_location VARCHAR(255),
    current_balance_myr NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS income_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    category_id UUID REFERENCES general_ledger_categories(id) NOT NULL,
    source_bank_account_id UUID REFERENCES bank_accounts(id),
    source_cash_account_id UUID REFERENCES cash_accounts(id),
    payer_name VARCHAR(255),
    amount_myr NUMERIC(19, 4) NOT NULL,
    transaction_date DATE NOT NULL,
    reference_number VARCHAR(100),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS expense_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    category_id UUID REFERENCES general_ledger_categories(id) NOT NULL,
    payment_bank_account_id UUID REFERENCES bank_accounts(id),
    payment_cash_account_id UUID REFERENCES cash_accounts(id),
    recipient_vendor_name VARCHAR(255),
    amount_myr NUMERIC(19, 4) NOT NULL,
    tax_amount_myr NUMERIC(19, 4) DEFAULT 0.0000 NOT NULL,
    transaction_date DATE NOT NULL,
    reference_number VARCHAR(100),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS receivables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    invoice_number VARCHAR(100) NOT NULL,
    invoice_date DATE NOT NULL,
    due_date DATE NOT NULL,
    total_amount_myr NUMERIC(19, 4) NOT NULL,
    paid_amount_myr NUMERIC(19, 4) DEFAULT 0.0000 NOT NULL,
    status VARCHAR(50) DEFAULT 'UNPAID' NOT NULL,
    category_id UUID REFERENCES general_ledger_categories(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uniq_workspace_receivable_inv UNIQUE (workspace_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS payables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    vendor_name VARCHAR(255) NOT NULL,
    bill_number VARCHAR(100) NOT NULL,
    bill_date DATE NOT NULL,
    due_date DATE NOT NULL,
    total_amount_myr NUMERIC(19, 4) NOT NULL,
    paid_amount_myr NUMERIC(19, 4) DEFAULT 0.0000 NOT NULL,
    status VARCHAR(50) DEFAULT 'UNPAID' NOT NULL,
    category_id UUID REFERENCES general_ledger_categories(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uniq_workspace_payable_bill UNIQUE (workspace_id, bill_number)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'debt_class') THEN
    CREATE TYPE debt_class AS ENUM ('TERM_LOAN', 'CREDIT_LINE', 'MORTGAGE', 'HIRE_PURCHASE', 'OTHER');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS debts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    lender_name VARCHAR(150) NOT NULL,
    debt_type debt_class NOT NULL,
    principal_amount_myr NUMERIC(19, 4) NOT NULL,
    outstanding_balance_myr NUMERIC(19, 4) NOT NULL,
    annual_interest_rate NUMERIC(6, 4) NOT NULL,
    origination_date DATE NOT NULL,
    maturity_date DATE,
    monthly_payment_myr NUMERIC(19, 4) DEFAULT 0.0000 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'commitment_recurrence_type') THEN
    CREATE TYPE commitment_recurrence_type AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS financial_commitments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    description VARCHAR(255) NOT NULL,
    contract_number VARCHAR(100),
    obligee_name VARCHAR(255) NOT NULL,
    amount_per_interval_myr NUMERIC(19, 4) NOT NULL,
    recurrence commitment_recurrence_type NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ----------------------------------------------------------------------------
-- 5. FINANCIAL EVIDENCE PACKAGE (FEP)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evidence_bundles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    bundle_name VARCHAR(150) NOT NULL,
    description TEXT,
    audit_locked BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'evidence_doc_type') THEN
    CREATE TYPE evidence_doc_type AS ENUM ('RECEIPT', 'INVOICE', 'BANK_STATEMENT', 'CONTRACT', 'AX_TAX_FILE', 'SUPPORTING_DOC');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS evidence_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    bundle_id UUID REFERENCES evidence_bundles(id) ON DELETE SET NULL,
    file_path_supabase VARCHAR(1024) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    document_type evidence_doc_type NOT NULL,
    ocr_parsed_content JSONB DEFAULT '{}'::jsonb NOT NULL,
    ocr_confidence NUMERIC(5, 2),
    uploaded_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger_evidence_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    bundle_id UUID REFERENCES evidence_bundles(id) ON DELETE CASCADE NOT NULL,
    income_record_id UUID REFERENCES income_records(id) ON DELETE CASCADE,
    expense_record_id UUID REFERENCES expense_records(id) ON DELETE CASCADE,
    receivable_id UUID REFERENCES receivables(id) ON DELETE CASCADE,
    payable_id UUID REFERENCES payables(id) ON DELETE CASCADE,
    debt_id UUID REFERENCES debts(id) ON DELETE CASCADE,
    commitment_id UUID REFERENCES financial_commitments(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT check_single_ledger_target CHECK (
        (income_record_id IS NOT NULL)::integer +
        (expense_record_id IS NOT NULL)::integer +
        (receivable_id IS NOT NULL)::integer +
        (payable_id IS NOT NULL)::integer +
        (debt_id IS NOT NULL)::integer +
        (commitment_id IS NOT NULL)::integer = 1
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_uniq_income_bundle ON ledger_evidence_mappings (income_record_id) WHERE income_record_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_uniq_expense_bundle ON ledger_evidence_mappings (expense_record_id) WHERE expense_record_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 6. AI LEARNING LAYER
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspace_memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    category_overrides JSONB DEFAULT '{}'::jsonb NOT NULL,
    conversational_preferences JSONB DEFAULT '{}'::jsonb NOT NULL,
    systemic_context_weights JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uniq_workspace_memo UNIQUE (workspace_id)
);

CREATE TABLE IF NOT EXISTS ai_learned_vendors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    standard_name VARCHAR(255) NOT NULL,
    matching_aliases VARCHAR(255)[] NOT NULL DEFAULT '{}'::VARCHAR[],
    predicted_ledger_category_id UUID REFERENCES general_ledger_categories(id),
    default_tax_rate NUMERIC(5, 4) DEFAULT 0.0000,
    confidence_score NUMERIC(5, 2) DEFAULT 100.00 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uniq_workspace_vendor_std UNIQUE (workspace_id, standard_name)
);

CREATE TABLE IF NOT EXISTS ai_learned_customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    standard_name VARCHAR(255) NOT NULL,
    matching_aliases VARCHAR(255)[] NOT NULL DEFAULT '{}'::VARCHAR[],
    predicted_ledger_category_id UUID REFERENCES general_ledger_categories(id),
    confidence_score NUMERIC(5, 2) DEFAULT 100.00 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uniq_workspace_customer_std UNIQUE (workspace_id, standard_name)
);

CREATE TABLE IF NOT EXISTS ai_learned_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    category_id UUID REFERENCES general_ledger_categories(id) ON DELETE CASCADE NOT NULL,
    frequent_keywords VARCHAR(100)[] NOT NULL DEFAULT '{}'::VARCHAR[],
    transaction_occurrence_count BIGINT DEFAULT 0 NOT NULL,
    last_trained_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uniq_workspace_ai_category UNIQUE (workspace_id, category_id)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pattern_frequency_type') THEN
    CREATE TYPE pattern_frequency_type AS ENUM ('WEEKLY', 'BI_WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'COMPLEX');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS ai_transaction_patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    pattern_name VARCHAR(150),
    party_name VARCHAR(255) NOT NULL,
    frequency pattern_frequency_type NOT NULL,
    estimated_amount_myr NUMERIC(19, 4) NOT NULL,
    approximate_day_of_interval INT,
    last_detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    next_expected_date DATE NOT NULL,
    confidence_score NUMERIC(5, 2) NOT NULL,
    analysis_metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_pattern_analysis ON ai_transaction_patterns(workspace_id, next_expected_date);

-- ----------------------------------------------------------------------------
-- 7. MYKERANI FINANCIAL INTELLIGENCE LAYER
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS financial_intelligence_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    calculated_on_date DATE NOT NULL,
    liquidity_ratio NUMERIC(10, 4) NOT NULL,
    runway_months NUMERIC(8, 2),
    monthly_burn_rate_myr NUMERIC(19, 4) NOT NULL,
    net_operating_cash_flow_myr NUMERIC(19, 4) NOT NULL,
    operating_leverage_ratio NUMERIC(10, 4),
    debt_to_equity_ratio NUMERIC(10, 4),
    forecasted_30d_cash_flow_myr NUMERIC(19, 4),
    forecasted_90d_cash_flow_myr NUMERIC(19, 4),
    raw_intelligence_payload JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uniq_workspace_intelligence_date UNIQUE (workspace_id, calculated_on_date)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'insight_criticality') THEN
    CREATE TYPE insight_criticality AS ENUM ('INFORMATION', 'WARNING', 'CRITICAL', 'OPPORTUNITY');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS financial_strategic_insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    title VARCHAR(255) NOT NULL,
    criticality insight_criticality NOT NULL,
    summary_markdown TEXT NOT NULL,
    associated_entities JSONB DEFAULT '{}'::jsonb NOT NULL,
    dismissed_by_user_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS financial_anomalies_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    expense_record_id UUID REFERENCES expense_records(id) ON DELETE CASCADE,
    income_record_id UUID REFERENCES income_records(id) ON DELETE CASCADE,
    suspicion_score NUMERIC(5, 2) NOT NULL,
    anomaly_reason VARCHAR(255) NOT NULL,
    resolved_by_user_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ----------------------------------------------------------------------------
-- 8. IMMUTABLE AUDIT TRAIL & LEDGER HASH SYSTEM
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS immutable_audit_ledger (
    index_id BIGSERIAL PRIMARY KEY,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE RESTRICT NOT NULL,
    entity_table VARCHAR(100) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    performed_by UUID NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    after_state_sha256 CHARACTER(64) NOT NULL,
    raw_payload_json JSONB NOT NULL,
    previous_block_hash CHARACTER(64) NOT NULL,
    current_block_hash CHARACTER(64) NOT NULL,
    CONSTRAINT check_hash_lengths CHECK (
        length(after_state_sha256) = 64 AND
        length(previous_block_hash) = 64 AND
        length(current_block_hash) = 64
    )
);

CREATE INDEX IF NOT EXISTS idx_audit_ledger_workspace ON immutable_audit_ledger(workspace_id);

CREATE OR REPLACE FUNCTION audit_trail_hash_chain()
RETURNS TRIGGER AS $$
DECLARE
    last_block_hash CHARACTER(64);
    payload_string TEXT;
    computed_hash CHARACTER(64);
BEGIN
    SELECT current_block_hash INTO last_block_hash
    FROM immutable_audit_ledger
    ORDER BY index_id DESC LIMIT 1;

    IF last_block_hash IS NULL THEN
        last_block_hash := '0000000000000000000000000000000000000000000000000000000000000000';
    END IF;

    payload_string := NEW.raw_payload_json::text || NEW.after_state_sha256 || last_block_hash;
    computed_hash := encode(digest(payload_string, 'sha256'), 'hex');

    NEW.previous_block_hash := last_block_hash;
    NEW.current_block_hash := computed_hash;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_trail_hash_chain ON immutable_audit_ledger;
CREATE TRIGGER trg_audit_trail_hash_chain
BEFORE INSERT ON immutable_audit_ledger
FOR EACH ROW
EXECUTE FUNCTION audit_trail_hash_chain();
