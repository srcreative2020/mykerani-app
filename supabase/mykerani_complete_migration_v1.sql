-- ============================================================================
-- MYKERANI Complete Migration v1.0
-- Generated: 2026-06-16
-- Description: Complete database schema for MyKerani Financial AI Assistant.
--              Consolidates DATABASE_ARCHITECTURE_V1_2.md + all migration files
--              into correct dependency order.
-- ============================================================================


-- ============================================================================
-- SECTION 1: EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ============================================================================
-- SECTION 2: CUSTOM TYPES (ENUM)
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE tenant_category AS ENUM ('HQ', 'DEMO', 'USER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE credit_type AS ENUM ('AI', 'OCR', 'STORAGE', 'NOTIFICATION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE credit_activity_type AS ENUM ('ALLOCATION', 'USAGE', 'REFUND', 'ADJUSTMENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE ledger_category_type AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE bank_account_type AS ENUM ('SAVINGS', 'CURRENT', 'CREDIT_CARD', 'INVESTMENT', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE debt_class AS ENUM ('TERM_LOAN', 'CREDIT_LINE', 'MORTGAGE', 'HIRE_PURCHASE', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Migration #2 version: includes DAILY and ONE-TIME
DO $$ BEGIN
    CREATE TYPE commitment_recurrence_type AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'ONE-TIME');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- DB Architecture evidence doc type (full set)
DO $$ BEGIN
    CREATE TYPE evidence_doc_type AS ENUM ('RECEIPT', 'INVOICE', 'BANK_STATEMENT', 'CONTRACT', 'AX_TAX_FILE', 'SUPPORTING_DOC');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Migration #3 evidence document type (simplified)
DO $$ BEGIN
    CREATE TYPE evidence_document_type AS ENUM ('RECEIPT', 'INVOICE', 'STATEMENT', 'SUPPORTING_DOC');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE pattern_frequency_type AS ENUM ('WEEKLY', 'BI_WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'COMPLEX');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE insight_criticality AS ENUM ('INFORMATION', 'WARNING', 'CRITICAL', 'OPPORTUNITY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- SECTION 3: CORE TABLES
-- ============================================================================

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


-- ============================================================================
-- SECTION 4: FINANCIAL TABLES
-- ============================================================================

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

-- Migration #2 version: TEXT description, full ENUM with DAILY + ONE-TIME
CREATE TABLE IF NOT EXISTS financial_commitments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    description TEXT NOT NULL,
    contract_number VARCHAR(100),
    obligee_name VARCHAR(255) NOT NULL,
    amount_per_interval_myr NUMERIC(19, 4) NOT NULL CHECK (amount_per_interval_myr > 0),
    recurrence commitment_recurrence_type NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_end_after_start CHECK (end_date IS NULL OR end_date >= start_date)
);


-- ============================================================================
-- SECTION 5: AI LEARNING TABLES
-- ============================================================================

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

-- Migration #7
CREATE TABLE IF NOT EXISTS ocr_learned_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    vendor_name VARCHAR(150) NOT NULL,
    category VARCHAR(100) NOT NULL,
    record_type VARCHAR(50) NOT NULL,
    confidence_score DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    occurrence_count INTEGER NOT NULL DEFAULT 1,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uniq_workspace_vendor UNIQUE (workspace_id, vendor_name)
);


-- ============================================================================
-- SECTION 6: EVIDENCE & DOCUMENT TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS evidence_bundles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    bundle_name VARCHAR(150) NOT NULL,
    description TEXT,
    audit_locked BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

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

-- Migration #3: simplified evidence record (complements evidence_bundles/evidence_documents)
CREATE TABLE IF NOT EXISTS financial_evidence_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    document_type evidence_document_type NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    upload_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    related_record_type VARCHAR(50) NULL,
    related_record_id VARCHAR(100) NULL,
    notes TEXT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);


-- ============================================================================
-- SECTION 7: AUDIT TABLES
-- ============================================================================

-- Immutable Audit Ledger: SHA-256 hash chain (DB Architecture)
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

-- Audit Logs: simplified operational log (Migration #5)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(100) NOT NULL,
    user_email VARCHAR(255) NOT NULL,
    user_role VARCHAR(50) NOT NULL,
    tenant_id UUID NOT NULL,
    workspace_id UUID,
    module VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    old_value JSONB,
    new_value JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ============================================================================
-- SECTION 8: SYSTEM TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_role_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    tenant_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_tenant_user_role UNIQUE (tenant_id, email)
);

CREATE TABLE IF NOT EXISTS public.permission_matrices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role VARCHAR(50) NOT NULL UNIQUE,
    permissions JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.workspace_storage_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL UNIQUE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    provider_type VARCHAR(50) NOT NULL DEFAULT 'HQ_MANAGED',
    connection_status VARCHAR(50) NOT NULL DEFAULT 'CONNECTED',
    storage_type VARCHAR(50) NOT NULL DEFAULT 'HQ_STORAGE',
    last_sync TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS public.workspace_notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL UNIQUE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    enable_in_app BOOLEAN NOT NULL DEFAULT true,
    enable_email BOOLEAN NOT NULL DEFAULT true,
    enable_push BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS public.workspace_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    category VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'UNREAD',
    recipient_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

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


-- ============================================================================
-- SECTION 9: INDEXES
-- ============================================================================

-- Core
CREATE INDEX IF NOT EXISTS idx_workspaces_tenant_id ON workspaces(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rwt_wallet_id ON resource_wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_hq_usage_analytics ON hq_supplier_service_logs(tenant_id, created_at);

-- Financial
CREATE INDEX IF NOT EXISTS idx_financial_commitments_workspace ON financial_commitments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_financial_commitments_active ON financial_commitments(workspace_id, is_active);

-- Evidence
CREATE INDEX IF NOT EXISTS idx_financial_evidence_workspace ON financial_evidence_packages(workspace_id);
CREATE INDEX IF NOT EXISTS idx_financial_evidence_relations ON financial_evidence_packages(workspace_id, related_record_type, related_record_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_uniq_income_bundle ON ledger_evidence_mappings(income_record_id) WHERE income_record_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_uniq_expense_bundle ON ledger_evidence_mappings(expense_record_id) WHERE expense_record_id IS NOT NULL;

-- AI
CREATE INDEX IF NOT EXISTS idx_ai_pattern_analysis ON ai_transaction_patterns(workspace_id, next_expected_date);
CREATE INDEX IF NOT EXISTS idx_ocr_learned_patterns_workspace ON ocr_learned_patterns(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ocr_learned_patterns_vendor ON ocr_learned_patterns(workspace_id, vendor_name);

-- Audit
CREATE INDEX IF NOT EXISTS idx_audit_ledger_workspace ON immutable_audit_ledger(workspace_id);

-- System
CREATE INDEX IF NOT EXISTS idx_workspace_storage_providers_workspace_id ON public.workspace_storage_providers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_storage_providers_tenant_id ON public.workspace_storage_providers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workspace_notif_pref_workspace_id ON public.workspace_notification_preferences(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_notif_pref_tenant_id ON public.workspace_notification_preferences(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workspace_notif_workspace_id ON public.workspace_notifications(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_notif_tenant_id ON public.workspace_notifications(tenant_id);


-- ============================================================================
-- SECTION 10: FUNCTIONS & TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_tenant_id()
RETURNS UUID AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'tenantId',
    ''
  )::uuid;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS VARCHAR AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role'),
    'COMPANY_STAFF'
  )::varchar;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION set_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

CREATE OR REPLACE TRIGGER trg_update_financial_commitments_timestamp
    BEFORE UPDATE ON financial_commitments
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_column();

CREATE OR REPLACE TRIGGER trg_update_financial_evidence_packages_timestamp
    BEFORE UPDATE ON financial_evidence_packages
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_column();

CREATE OR REPLACE TRIGGER trg_update_ocr_learned_patterns_timestamp
    BEFORE UPDATE ON ocr_learned_patterns
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_column();


-- ============================================================================
-- SECTION 11: RLS POLICIES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 11.1 STORAGE BUCKET
-- ----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'evidence-packages',
    'evidence-packages',
    false,
    10485760,
    ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf', 'text/csv']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf', 'text/csv'];

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_evidence_policy" ON storage.objects;
DROP POLICY IF EXISTS "insert_evidence_policy" ON storage.objects;
DROP POLICY IF EXISTS "update_evidence_policy" ON storage.objects;
DROP POLICY IF EXISTS "delete_evidence_policy" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated select for owned tenant workspaces" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated insert for owned tenant workspaces" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated update for owned tenant workspaces" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete for owned tenant workspaces" ON storage.objects;

CREATE POLICY "select_evidence_policy" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'evidence-packages' AND
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id::text = split_part(name, '/', 1)
              AND (workspaces.tenant_id = public.get_tenant_id() OR public.get_user_role() = 'HQ_ADMIN')
        )
    );

CREATE POLICY "insert_evidence_policy" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'evidence-packages' AND
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id::text = split_part(name, '/', 1)
              AND (workspaces.tenant_id = public.get_tenant_id() OR public.get_user_role() = 'HQ_ADMIN')
        )
    );

CREATE POLICY "update_evidence_policy" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'evidence-packages' AND
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id::text = split_part(name, '/', 1)
              AND (workspaces.tenant_id = public.get_tenant_id() OR public.get_user_role() = 'HQ_ADMIN')
        )
    )
    WITH CHECK (
        bucket_id = 'evidence-packages' AND
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id::text = split_part(name, '/', 1)
              AND (workspaces.tenant_id = public.get_tenant_id() OR public.get_user_role() = 'HQ_ADMIN')
        )
    );

CREATE POLICY "delete_evidence_policy" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'evidence-packages' AND
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id::text = split_part(name, '/', 1)
              AND (workspaces.tenant_id = public.get_tenant_id() OR public.get_user_role() = 'HQ_ADMIN')
        )
    );

-- ----------------------------------------------------------------------------
-- 11.2 ENABLE RLS ON ALL TABLES
-- ----------------------------------------------------------------------------

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE general_ledger_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE income_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE payables ENABLE ROW LEVEL SECURITY;
ALTER TABLE debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_evidence_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE immutable_audit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_matrices ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocr_learned_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_storage_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_notifications ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 11.3 DROP STALE POLICIES (safe — idempotent)
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS general_ledger_categories_select_policy ON general_ledger_categories;
DROP POLICY IF EXISTS general_ledger_categories_insert_policy ON general_ledger_categories;
DROP POLICY IF EXISTS general_ledger_categories_update_policy ON general_ledger_categories;
DROP POLICY IF EXISTS general_ledger_categories_delete_policy ON general_ledger_categories;
DROP POLICY IF EXISTS immutable_audit_ledger_select_policy ON immutable_audit_ledger;
DROP POLICY IF EXISTS immutable_audit_ledger_insert_policy ON immutable_audit_ledger;
DROP POLICY IF EXISTS "select_role_assignments_policy" ON public.user_role_assignments;
DROP POLICY IF EXISTS "insert_role_assignments_policy" ON public.user_role_assignments;
DROP POLICY IF EXISTS "update_role_assignments_policy" ON public.user_role_assignments;
DROP POLICY IF EXISTS "delete_role_assignments_policy" ON public.user_role_assignments;
DROP POLICY IF EXISTS "select_permission_matrices_policy" ON public.permission_matrices;
DROP POLICY IF EXISTS "write_permission_matrices_policy" ON public.permission_matrices;
DROP POLICY IF EXISTS "select_audit_logs_policy" ON public.audit_logs;
DROP POLICY IF EXISTS "insert_audit_logs_policy" ON public.audit_logs;
DROP POLICY IF EXISTS workspace_storage_providers_select_policy ON public.workspace_storage_providers;
DROP POLICY IF EXISTS workspace_storage_providers_insert_policy ON public.workspace_storage_providers;
DROP POLICY IF EXISTS workspace_storage_providers_update_policy ON public.workspace_storage_providers;
DROP POLICY IF EXISTS workspace_storage_providers_delete_policy ON public.workspace_storage_providers;
DROP POLICY IF EXISTS workspace_notif_pref_select_policy ON public.workspace_notification_preferences;
DROP POLICY IF EXISTS workspace_notif_pref_insert_policy ON public.workspace_notification_preferences;
DROP POLICY IF EXISTS workspace_notif_pref_update_policy ON public.workspace_notification_preferences;
DROP POLICY IF EXISTS workspace_notif_pref_delete_policy ON public.workspace_notification_preferences;
DROP POLICY IF EXISTS workspace_notif_select_policy ON public.workspace_notifications;
DROP POLICY IF EXISTS workspace_notif_insert_policy ON public.workspace_notifications;
DROP POLICY IF EXISTS workspace_notif_update_policy ON public.workspace_notifications;
DROP POLICY IF EXISTS workspace_notif_delete_policy ON public.workspace_notifications;

-- ----------------------------------------------------------------------------
-- 11.4 TENANTS
-- ----------------------------------------------------------------------------

CREATE POLICY tenants_select_policy ON tenants FOR SELECT TO authenticated
    USING (id = public.get_tenant_id() OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY tenants_insert_policy ON tenants FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY tenants_update_policy ON tenants FOR UPDATE TO authenticated
    USING (id = public.get_tenant_id() OR public.get_user_role() = 'HQ_ADMIN')
    WITH CHECK (id = public.get_tenant_id() OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY tenants_delete_policy ON tenants FOR DELETE TO authenticated
    USING (public.get_user_role() = 'HQ_ADMIN');

-- ----------------------------------------------------------------------------
-- 11.5 WORKSPACES
-- ----------------------------------------------------------------------------

CREATE POLICY workspaces_select_policy ON workspaces FOR SELECT TO authenticated
    USING (tenant_id = public.get_tenant_id() OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY workspaces_insert_policy ON workspaces FOR INSERT TO authenticated
    WITH CHECK (tenant_id = public.get_tenant_id() OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY workspaces_update_policy ON workspaces FOR UPDATE TO authenticated
    USING (tenant_id = public.get_tenant_id() OR public.get_user_role() = 'HQ_ADMIN')
    WITH CHECK (tenant_id = public.get_tenant_id() OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY workspaces_delete_policy ON workspaces FOR DELETE TO authenticated
    USING (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('COMPANY_OWNER', 'COMPANY_ADMIN'))
        OR public.get_user_role() = 'HQ_ADMIN'
    );

-- ----------------------------------------------------------------------------
-- 11.6 FINANCIAL TABLES (bank_accounts, cash_accounts, income_records,
--      expense_records, receivables, payables, debts)
-- ----------------------------------------------------------------------------

CREATE POLICY bank_accounts_select_policy ON bank_accounts FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');
CREATE POLICY bank_accounts_insert_policy ON bank_accounts FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');
CREATE POLICY bank_accounts_update_policy ON bank_accounts FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN')
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');
CREATE POLICY bank_accounts_delete_policy ON bank_accounts FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY cash_accounts_select_policy ON cash_accounts FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');
CREATE POLICY cash_accounts_insert_policy ON cash_accounts FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');
CREATE POLICY cash_accounts_update_policy ON cash_accounts FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN')
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');
CREATE POLICY cash_accounts_delete_policy ON cash_accounts FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY income_records_select_policy ON income_records FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');
CREATE POLICY income_records_insert_policy ON income_records FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');
CREATE POLICY income_records_update_policy ON income_records FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN')
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');
CREATE POLICY income_records_delete_policy ON income_records FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY expense_records_select_policy ON expense_records FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');
CREATE POLICY expense_records_insert_policy ON expense_records FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');
CREATE POLICY expense_records_update_policy ON expense_records FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN')
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');
CREATE POLICY expense_records_delete_policy ON expense_records FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY receivables_select_policy ON receivables FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');
CREATE POLICY receivables_insert_policy ON receivables FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');
CREATE POLICY receivables_update_policy ON receivables FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN')
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');
CREATE POLICY receivables_delete_policy ON receivables FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY payables_select_policy ON payables FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');
CREATE POLICY payables_insert_policy ON payables FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');
CREATE POLICY payables_update_policy ON payables FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN')
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');
CREATE POLICY payables_delete_policy ON payables FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

CREATE POLICY debts_select_policy ON debts FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');
CREATE POLICY debts_insert_policy ON debts FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');
CREATE POLICY debts_update_policy ON debts FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN')
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');
CREATE POLICY debts_delete_policy ON debts FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

-- ----------------------------------------------------------------------------
-- 11.7 GENERAL LEDGER CATEGORIES
-- ----------------------------------------------------------------------------

CREATE POLICY general_ledger_categories_select_policy ON general_ledger_categories FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');
CREATE POLICY general_ledger_categories_insert_policy ON general_ledger_categories FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');
CREATE POLICY general_ledger_categories_update_policy ON general_ledger_categories FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN')
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');
CREATE POLICY general_ledger_categories_delete_policy ON general_ledger_categories FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

-- ----------------------------------------------------------------------------
-- 11.8 FINANCIAL COMMITMENTS
-- ----------------------------------------------------------------------------

CREATE POLICY financial_commitments_select_policy ON financial_commitments FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');
CREATE POLICY financial_commitments_insert_policy ON financial_commitments FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');
CREATE POLICY financial_commitments_update_policy ON financial_commitments FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN')
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');
CREATE POLICY financial_commitments_delete_policy ON financial_commitments FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

-- ----------------------------------------------------------------------------
-- 11.9 FINANCIAL EVIDENCE PACKAGES
-- ----------------------------------------------------------------------------

CREATE POLICY financial_evidence_packages_select_policy ON financial_evidence_packages FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');
CREATE POLICY financial_evidence_packages_insert_policy ON financial_evidence_packages FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');
CREATE POLICY financial_evidence_packages_update_policy ON financial_evidence_packages FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN')
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');
CREATE POLICY financial_evidence_packages_delete_policy ON financial_evidence_packages FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

-- ----------------------------------------------------------------------------
-- 11.10 IMMUTABLE AUDIT LEDGER
-- ----------------------------------------------------------------------------

CREATE POLICY immutable_audit_ledger_select_policy ON immutable_audit_ledger FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() IN ('HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR'));
CREATE POLICY immutable_audit_ledger_insert_policy ON immutable_audit_ledger FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() IN ('HQ_ADMIN', 'HQ_SUPPORT'));

-- ----------------------------------------------------------------------------
-- 11.11 AUDIT LOGS
-- ----------------------------------------------------------------------------

CREATE POLICY "select_audit_logs_policy" ON public.audit_logs FOR SELECT TO authenticated
    USING (tenant_id = public.get_tenant_id() OR public.get_user_role() IN ('HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR'));
CREATE POLICY "insert_audit_logs_policy" ON public.audit_logs FOR INSERT TO authenticated
    WITH CHECK (tenant_id = public.get_tenant_id() OR public.get_user_role() IN ('HQ_ADMIN', 'HQ_SUPPORT'));

-- ----------------------------------------------------------------------------
-- 11.12 OCR LEARNED PATTERNS
-- ----------------------------------------------------------------------------

CREATE POLICY ocr_learned_patterns_select_policy ON ocr_learned_patterns FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');
CREATE POLICY ocr_learned_patterns_insert_policy ON ocr_learned_patterns FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');
CREATE POLICY ocr_learned_patterns_update_policy ON ocr_learned_patterns FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN')
    WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');
CREATE POLICY ocr_learned_patterns_delete_policy ON ocr_learned_patterns FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_id AND workspaces.tenant_id = public.get_tenant_id()) OR public.get_user_role() = 'HQ_ADMIN');

-- ----------------------------------------------------------------------------
-- 11.13 USER ROLE ASSIGNMENTS
-- ----------------------------------------------------------------------------

CREATE POLICY "select_role_assignments_policy" ON public.user_role_assignments FOR SELECT TO authenticated
    USING (tenant_id = public.get_tenant_id() OR public.get_user_role() IN ('HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR'));
CREATE POLICY "insert_role_assignments_policy" ON public.user_role_assignments FOR INSERT TO authenticated
    WITH CHECK (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('COMPANY_OWNER', 'COMPANY_ADMIN'))
        OR public.get_user_role() IN ('HQ_ADMIN', 'HQ_SUPPORT')
    );
CREATE POLICY "update_role_assignments_policy" ON public.user_role_assignments FOR UPDATE TO authenticated
    USING (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('COMPANY_OWNER', 'COMPANY_ADMIN'))
        OR public.get_user_role() = 'HQ_ADMIN'
    )
    WITH CHECK (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('COMPANY_OWNER', 'COMPANY_ADMIN'))
        OR public.get_user_role() = 'HQ_ADMIN'
    );
CREATE POLICY "delete_role_assignments_policy" ON public.user_role_assignments FOR DELETE TO authenticated
    USING (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('COMPANY_OWNER', 'COMPANY_ADMIN'))
        OR public.get_user_role() = 'HQ_ADMIN'
    );

-- ----------------------------------------------------------------------------
-- 11.14 PERMISSION MATRICES
-- ----------------------------------------------------------------------------

CREATE POLICY "select_permission_matrices_policy" ON public.permission_matrices FOR SELECT TO authenticated
    USING (true);
CREATE POLICY "write_permission_matrices_policy" ON public.permission_matrices FOR ALL TO authenticated
    USING (public.get_user_role() = 'HQ_ADMIN')
    WITH CHECK (public.get_user_role() = 'HQ_ADMIN');

-- ----------------------------------------------------------------------------
-- 11.15 WORKSPACE STORAGE PROVIDERS
-- ----------------------------------------------------------------------------

CREATE POLICY workspace_storage_providers_select_policy ON public.workspace_storage_providers FOR SELECT TO authenticated
    USING (tenant_id = public.get_tenant_id() OR public.get_user_role() IN ('HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR'));
CREATE POLICY workspace_storage_providers_insert_policy ON public.workspace_storage_providers FOR INSERT TO authenticated
    WITH CHECK (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('HQ_ADMIN', 'COMPANY_OWNER', 'COMPANY_ADMIN'))
        OR public.get_user_role() = 'HQ_ADMIN'
    );
CREATE POLICY workspace_storage_providers_update_policy ON public.workspace_storage_providers FOR UPDATE TO authenticated
    USING (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('HQ_ADMIN', 'COMPANY_OWNER', 'COMPANY_ADMIN'))
        OR public.get_user_role() = 'HQ_ADMIN'
    )
    WITH CHECK (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('HQ_ADMIN', 'COMPANY_OWNER', 'COMPANY_ADMIN'))
        OR public.get_user_role() = 'HQ_ADMIN'
    );
CREATE POLICY workspace_storage_providers_delete_policy ON public.workspace_storage_providers FOR DELETE TO authenticated
    USING (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('HQ_ADMIN', 'COMPANY_OWNER', 'COMPANY_ADMIN'))
        OR public.get_user_role() = 'HQ_ADMIN'
    );

-- ----------------------------------------------------------------------------
-- 11.16 WORKSPACE NOTIFICATION PREFERENCES
-- ----------------------------------------------------------------------------

CREATE POLICY workspace_notif_pref_select_policy ON public.workspace_notification_preferences FOR SELECT TO authenticated
    USING (tenant_id = public.get_tenant_id() OR public.get_user_role() IN ('HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR'));
CREATE POLICY workspace_notif_pref_insert_policy ON public.workspace_notification_preferences FOR INSERT TO authenticated
    WITH CHECK (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('HQ_ADMIN', 'COMPANY_OWNER', 'COMPANY_ADMIN'))
        OR public.get_user_role() = 'HQ_ADMIN'
    );
CREATE POLICY workspace_notif_pref_update_policy ON public.workspace_notification_preferences FOR UPDATE TO authenticated
    USING (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('HQ_ADMIN', 'COMPANY_OWNER', 'COMPANY_ADMIN'))
        OR public.get_user_role() = 'HQ_ADMIN'
    )
    WITH CHECK (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('HQ_ADMIN', 'COMPANY_OWNER', 'COMPANY_ADMIN'))
        OR public.get_user_role() = 'HQ_ADMIN'
    );
CREATE POLICY workspace_notif_pref_delete_policy ON public.workspace_notification_preferences FOR DELETE TO authenticated
    USING (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('HQ_ADMIN', 'COMPANY_OWNER', 'COMPANY_ADMIN'))
        OR public.get_user_role() = 'HQ_ADMIN'
    );

-- ----------------------------------------------------------------------------
-- 11.17 WORKSPACE NOTIFICATIONS
-- ----------------------------------------------------------------------------

CREATE POLICY workspace_notif_select_policy ON public.workspace_notifications FOR SELECT TO authenticated
    USING (tenant_id = public.get_tenant_id() OR public.get_user_role() IN ('HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR'));
CREATE POLICY workspace_notif_insert_policy ON public.workspace_notifications FOR INSERT TO authenticated
    WITH CHECK (tenant_id = public.get_tenant_id() OR public.get_user_role() IN ('HQ_ADMIN', 'HQ_SUPPORT'));
CREATE POLICY workspace_notif_update_policy ON public.workspace_notifications FOR UPDATE TO authenticated
    USING (tenant_id = public.get_tenant_id() OR public.get_user_role() IN ('HQ_ADMIN', 'HQ_SUPPORT'))
    WITH CHECK (tenant_id = public.get_tenant_id() OR public.get_user_role() IN ('HQ_ADMIN', 'HQ_SUPPORT'));
CREATE POLICY workspace_notif_delete_policy ON public.workspace_notifications FOR DELETE TO authenticated
    USING (
        (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('HQ_ADMIN', 'COMPANY_OWNER', 'COMPANY_ADMIN'))
        OR public.get_user_role() = 'HQ_ADMIN'
    );


-- ============================================================================
-- SECTION 12: PERMISSION SEED DATA
-- ============================================================================

INSERT INTO public.permission_matrices (role, permissions) VALUES
('HQ_ADMIN', '{
  "Financial Records":          {"read": true,  "create": true,  "update": true,  "delete": true},
  "Financial Commitments":      {"read": true,  "create": true,  "update": true,  "delete": true},
  "Financial Forecast":         {"read": true,  "create": true,  "update": true,  "delete": true},
  "Financial Evidence Package": {"read": true,  "create": true,  "update": true,  "delete": true},
  "User Management":            {"read": true,  "create": true,  "update": true,  "delete": true},
  "Workspace Settings":         {"read": true,  "create": true,  "update": true,  "delete": true}
}'),
('HQ_SUPPORT', '{
  "Financial Records":          {"read": true,  "create": false, "update": false, "delete": false},
  "Financial Commitments":      {"read": true,  "create": false, "update": false, "delete": false},
  "Financial Forecast":         {"read": true,  "create": false, "update": false, "delete": false},
  "Financial Evidence Package": {"read": true,  "create": false, "update": false, "delete": false},
  "User Management":            {"read": true,  "create": false, "update": false, "delete": false},
  "Workspace Settings":         {"read": true,  "create": false, "update": false, "delete": false}
}'),
('HQ_AUDITOR', '{
  "Financial Records":          {"read": true,  "create": false, "update": false, "delete": false},
  "Financial Commitments":      {"read": true,  "create": false, "update": false, "delete": false},
  "Financial Forecast":         {"read": true,  "create": false, "update": false, "delete": false},
  "Financial Evidence Package": {"read": true,  "create": false, "update": false, "delete": false},
  "User Management":            {"read": true,  "create": false, "update": false, "delete": false},
  "Workspace Settings":         {"read": true,  "create": false, "update": false, "delete": false}
}'),
('COMPANY_OWNER', '{
  "Financial Records":          {"read": true,  "create": true,  "update": true,  "delete": true},
  "Financial Commitments":      {"read": true,  "create": true,  "update": true,  "delete": true},
  "Financial Forecast":         {"read": true,  "create": true,  "update": true,  "delete": true},
  "Financial Evidence Package": {"read": true,  "create": true,  "update": true,  "delete": true},
  "User Management":            {"read": true,  "create": true,  "update": true,  "delete": true},
  "Workspace Settings":         {"read": true,  "create": true,  "update": true,  "delete": true}
}'),
('COMPANY_ADMIN', '{
  "Financial Records":          {"read": true,  "create": true,  "update": true,  "delete": false},
  "Financial Commitments":      {"read": true,  "create": true,  "update": true,  "delete": false},
  "Financial Forecast":         {"read": true,  "create": true,  "update": true,  "delete": false},
  "Financial Evidence Package": {"read": true,  "create": true,  "update": true,  "delete": false},
  "User Management":            {"read": true,  "create": true,  "update": true,  "delete": false},
  "Workspace Settings":         {"read": true,  "create": false, "update": true,  "delete": false}
}'),
('COMPANY_STAFF', '{
  "Financial Records":          {"read": true,  "create": true,  "update": false, "delete": false},
  "Financial Commitments":      {"read": true,  "create": false, "update": false, "delete": false},
  "Financial Forecast":         {"read": false, "create": false, "update": false, "delete": false},
  "Financial Evidence Package": {"read": true,  "create": true,  "update": false, "delete": false},
  "User Management":            {"read": false, "create": false, "update": false, "delete": false},
  "Workspace Settings":         {"read": false, "create": false, "update": false, "delete": false}
}')
ON CONFLICT (role) DO UPDATE SET permissions = EXCLUDED.permissions;
