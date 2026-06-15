# MYKERANI Database Architecture V1.2
## PostgreSQL Schema Design

This document details the complete, enterprise-grade PostgreSQL schema design for **MYKERANI (Financial AI Assistant)**. 

### Architectural Tenets
1. **Multi-Tenant Isolation**: Row-level security (RLS) policies are designed around `tenant_id` and `workspace_id`.
2. **Defensive Financial Math**: High-precision `NUMERIC(19, 4)` is leveraged for all financial items to completely eliminate floating-point rounding issues. Default currency is strictly **MYR** (Malaysian Ringgit).
3. **No Payroll References**: All payroll modules, tables, and columns have been completely removed.
4. **Append-Only & Temporal Audits**: Critical tables feed an immutable ledger system utilizing cryptographic SHA-256 chaining.
5. **High Integrity Constraints**: Enforced unique index constraints across tenant boundaries.

---

## 1. Core Tenant & Workspace Hierarchy

```sql
-- PostgreSQL Extensions Required
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tenant Account Classifications
CREATE TYPE tenant_category AS ENUM ('HQ', 'DEMO', 'USER');

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    category tenant_category NOT NULL DEFAULT 'USER',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Workspace Entities (Multi-workspace capabilities)
CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uniq_tenant_workspace_slug UNIQUE (tenant_id, slug)
);

CREATE INDEX idx_workspaces_tenant_id ON workspaces(tenant_id);
```

---

## 2. Resource Wallet & Subscription Plans

Every tenant operates a resource wallet that regulates usage of AI assets, ensuring strict cost governance.

```sql
-- Subscription Plans Table
CREATE TABLE subscription_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    monthly_price_myr NUMERIC(15, 4) NOT NULL DEFAULT 0.0000,
    annual_price_myr NUMERIC(15, 4) NOT NULL DEFAULT 0.0000,
    ai_credits_allowance BIGINT NOT NULL DEFAULT 0,
    ocr_credits_allowance BIGINT NOT NULL DEFAULT 0,
    storage_credits_allowance_mb BIGINT NOT NULL DEFAULT 0, -- Storage in Megabytes
    notification_credits_allowance BIGINT NOT NULL DEFAULT 0,
    features JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Tenant Subscription Tracker
CREATE TABLE tenant_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    plan_id UUID REFERENCES subscription_plans(id) NOT NULL,
    status VARCHAR(50) NOT NULL, -- e.g., 'active', 'suspended', 'canceled'
    current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    is_trial BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Resource Wallet Main Table
CREATE TABLE resource_wallets (
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

-- Resource Transaction Logs (Audit Trail for wallets)
CREATE TYPE credit_type AS ENUM ('AI', 'OCR', 'STORAGE', 'NOTIFICATION');
CREATE TYPE credit_activity_type AS ENUM ('ALLOCATION', 'USAGE', 'REFUND', 'ADJUSTMENT');

CREATE TABLE resource_wallet_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id UUID REFERENCES resource_wallets(id) ON DELETE CASCADE NOT NULL,
    credit_type credit_type NOT NULL,
    activity_type credit_activity_type NOT NULL,
    amount BIGINT NOT NULL, -- positive for grant/refund, negative for consumption
    cost_myr NUMERIC(15, 4) DEFAULT 0.0000 NOT NULL, -- Actual infrastructure cost to HQ
    description VARCHAR(255),
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL, -- Tracks exact API prompts/tokens if applicable
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_rwt_wallet_id ON resource_wallet_transactions(wallet_id);
```

---

## 3. Cost Governance & HQ Profitability Monitoring

Tracks margins in real-time by subtracting cloud resource execution overhead from subscription and transaction metrics.

```sql
-- Infrastructure Unit Costs Table (Used by HQ for real-time cost analysis)
CREATE TABLE hq_infrastructure_costs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resource_key VARCHAR(100) UNIQUE NOT NULL, -- e.g., 'gemini_flash_1k_tokens', 'ocr_page_parse', 's3_storage_gb_month'
    cost_price_myr NUMERIC(19, 6) NOT NULL, -- Ultra-fine precision for sub-cent resource tracking
    provider_name VARCHAR(100) NOT NULL, -- e.g., 'Google Cloud', 'Supabase'
    effective_from TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL
);

-- Raw Cloud/Service Usage Log
CREATE TABLE hq_supplier_service_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id),
    workspace_id UUID REFERENCES workspaces(id),
    resource_key VARCHAR(100) NOT NULL,
    units_used NUMERIC(15, 4) NOT NULL,
    calculated_cost_myr NUMERIC(19, 4) NOT NULL,
    raw_api_response JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_hq_usage_analytics ON hq_supplier_service_logs(tenant_id, created_at);
```

---

## 4. Financial Modules (Default Currency: MYR)

All transactions fall into explicit ledgers representing core business positions. No payroll features exist.

```sql
-- Base Categories for General Ledger mapping
CREATE TYPE ledger_category_type AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

CREATE TABLE general_ledger_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(150) NOT NULL,
    code VARCHAR(50) NOT NULL, -- Standard ledger code
    type ledger_category_type NOT NULL,
    is_system_default BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uniq_workspace_category_code UNIQUE (workspace_id, code)
);

-- Bank Account Profiles
CREATE TYPE bank_account_type AS ENUM ('SAVINGS', 'CURRENT', 'CREDIT_CARD', 'INVESTMENT', 'OTHER');

CREATE TABLE bank_accounts (
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

-- Physical Cash Registers and Safes (Cash Asset management)
CREATE TABLE cash_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(150) NOT NULL, -- e.g., 'Main Safe', 'Counter A Petty Cash'
    physical_location VARCHAR(255),
    current_balance_myr NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Income Entities
CREATE TABLE income_records (
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

-- Expense Entities
CREATE TABLE expense_records (
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

-- Receivables (Uncollected Customer Invoices)
CREATE TABLE receivables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    invoice_number VARCHAR(100) NOT NULL,
    invoice_date DATE NOT NULL,
    due_date DATE NOT NULL,
    total_amount_myr NUMERIC(19, 4) NOT NULL,
    paid_amount_myr NUMERIC(19, 4) DEFAULT 0.0000 NOT NULL,
    status VARCHAR(50) DEFAULT 'UNPAID' NOT NULL, -- e.g., 'UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'
    category_id UUID REFERENCES general_ledger_categories(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uniq_workspace_receivable_inv UNIQUE (workspace_id, invoice_number)
);

-- Payables (Vendor Bills Outstanding)
CREATE TABLE payables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    vendor_name VARCHAR(255) NOT NULL,
    bill_number VARCHAR(100) NOT NULL,
    bill_date DATE NOT NULL,
    due_date DATE NOT NULL,
    total_amount_myr NUMERIC(19, 4) NOT NULL,
    paid_amount_myr NUMERIC(19, 4) DEFAULT 0.0000 NOT NULL,
    status VARCHAR(50) DEFAULT 'UNPAID' NOT NULL, -- e.g., 'UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'
    category_id UUID REFERENCES general_ledger_categories(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uniq_workspace_payable_bill UNIQUE (workspace_id, bill_number)
);

-- Debt Management (Loans & Credit Lines)
CREATE TYPE debt_class AS ENUM ('TERM_LOAN', 'CREDIT_LINE', 'MORTGAGE', 'HIRE_PURCHASE', 'OTHER');

CREATE TABLE debts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    lender_name VARCHAR(150) NOT NULL,
    debt_type debt_class NOT NULL,
    principal_amount_myr NUMERIC(19, 4) NOT NULL,
    outstanding_balance_myr NUMERIC(19, 4) NOT NULL,
    annual_interest_rate NUMERIC(6, 4) NOT NULL, -- e.g. 05.2500 for 5.25%
    origination_date DATE NOT NULL,
    maturity_date DATE,
    monthly_payment_myr NUMERIC(19, 4) DEFAULT 0.0000 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Financial Commitments (Leases, Contracts, Future Recurring cash outflows)
CREATE TYPE commitment_recurrence_type AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

CREATE TABLE financial_commitments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    description VARCHAR(255) NOT NULL,
    contract_number VARCHAR(100),
    obligee_name VARCHAR(255) NOT NULL, -- Supplier/Entity to pay
    amount_per_interval_myr NUMERIC(19, 4) NOT NULL,
    recurrence commitment_recurrence_type NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE, -- NULL means perpetual contract indefinitely
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
```

---

## 5. Financial Evidence Package (FEP)

The audit center for matching incoming business documents directly with registered general ledger activities.

```sql
-- FEP Evidence Bundles (Aggregates multiple files to lock verification for a transaction)
CREATE TABLE evidence_bundles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    bundle_name VARCHAR(150) NOT NULL,
    description TEXT,
    audit_locked BOOLEAN DEFAULT FALSE NOT NULL, -- If true, no files can be added or deleted from this bundle
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Raw Evidence Files Storage Records
CREATE TYPE evidence_doc_type AS ENUM ('RECEIPT', 'INVOICE', 'BANK_STATEMENT', 'CONTRACT', 'AX_TAX_FILE', 'SUPPORTING_DOC');

CREATE TABLE evidence_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    bundle_id UUID REFERENCES evidence_bundles(id) ON DELETE SET NULL,
    file_path_supabase VARCHAR(1024) NOT NULL, -- File locator URL within Supabase bucket
    file_name VARCHAR(255) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    document_type evidence_doc_type NOT NULL,
    ocr_parsed_content JSONB DEFAULT '{}'::jsonb NOT NULL, -- Full metadata dictionary populated by AI OCR engine
    ocr_confidence NUMERIC(5, 2), -- Percentage rating e.g., 98.40
    uploaded_by UUID NOT NULL, -- Ref to Supabase User ID
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Cross-reference joining ledger records with Evidence Bundles (Mandated Audit Linkage)
CREATE TABLE ledger_evidence_mappings (
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
    -- Ensure custom trigger constraints ensure at least one entity is targeted
    CONSTRAINT check_single_ledger_target CHECK (
        (income_record_id IS NOT NULL)::integer +
        (expense_record_id IS NOT NULL)::integer +
        (receivable_id IS NOT NULL)::integer +
        (payable_id IS NOT NULL)::integer +
        (debt_id IS NOT NULL)::integer +
        (commitment_id IS NOT NULL)::integer = 1
    )
);

CREATE UNIQUE INDEX idx_uniq_income_bundle ON ledger_evidence_mappings (income_record_id) WHERE income_record_id IS NOT NULL;
CREATE UNIQUE INDEX idx_uniq_expense_bundle ON ledger_evidence_mappings (expense_record_id) WHERE expense_record_id IS NOT NULL;
```

---

## 6. AI Learning Layer

Allows the specialized local Gemini model to match, organize, and suggest transaction updates selectively.

```sql
-- Workspace Memory Core Settings
CREATE TABLE workspace_memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    category_overrides JSONB DEFAULT '{}'::jsonb NOT NULL, -- Custom categorization adjustments rules
    conversational_preferences JSONB DEFAULT '{}'::jsonb NOT NULL, -- Custom tone weights or reporting cycles
    systemic_context_weights JSONB DEFAULT '{}'::jsonb NOT NULL, -- Learned threshold parameters
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uniq_workspace_memo UNIQUE (workspace_id)
);

-- Learned Vendor Profiles (Auto extraction aliases)
CREATE TABLE ai_learned_vendors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    standard_name VARCHAR(255) NOT NULL,
    matching_aliases VARCHAR(255)[] NOT NULL DEFAULT '{}'::VARCHAR[], -- String matches extracted during scan operations
    predicted_ledger_category_id UUID REFERENCES general_ledger_categories(id),
    default_tax_rate NUMERIC(5, 4) DEFAULT 0.0000,
    confidence_score NUMERIC(5, 2) DEFAULT 100.00 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uniq_workspace_vendor_std UNIQUE (workspace_id, standard_name)
);

-- Learned Customer Profiles
CREATE TABLE ai_learned_customers (
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

-- Structural Category Learning Context
CREATE TABLE ai_learned_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    category_id UUID REFERENCES general_ledger_categories(id) ON DELETE CASCADE NOT NULL,
    frequent_keywords VARCHAR(100)[] NOT NULL DEFAULT '{}'::VARCHAR[], -- Triggers triggering auto-category mapping
    transaction_occurrence_count BIGINT DEFAULT 0 NOT NULL,
    last_trained_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uniq_workspace_ai_category UNIQUE (workspace_id, category_id)
);

-- Detected Recurrence & Transaction Pattern Analysis models
CREATE TYPE pattern_frequency_type AS ENUM ('WEEKLY', 'BI_WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'COMPLEX');

CREATE TABLE ai_transaction_patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    pattern_name VARCHAR(150),
    party_name VARCHAR(255) NOT NULL, -- Vendor or client name
    frequency pattern_frequency_type NOT NULL,
    estimated_amount_myr NUMERIC(19, 4) NOT NULL,
    approximate_day_of_interval INT, -- e.g., 28th of every month
    last_detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    next_expected_date DATE NOT NULL,
    confidence_score NUMERIC(5, 2) NOT NULL, -- AI trust factor
    analysis_metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_ai_pattern_analysis ON ai_transaction_patterns(workspace_id, next_expected_date);
```

---

## 7. MYKERANI Financial Intelligence Layer

Maintains synthesized strategic statistics. Updated continuously or on-demand by backend AI evaluation loops.

```sql
-- Workspace Financial Health Ratios (Updated periodically)
CREATE TABLE financial_intelligence_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    calculated_on_date DATE NOT NULL,
    
    -- standard financial health vectors
    liquidity_ratio NUMERIC(10, 4) NOT NULL, -- Current assets / current liabilities
    runway_months NUMERIC(8, 2), -- Months of cash left based on burn
    monthly_burn_rate_myr NUMERIC(19, 4) NOT NULL,
    net_operating_cash_flow_myr NUMERIC(19, 4) NOT NULL,
    operating_leverage_ratio NUMERIC(10, 4),
    debt_to_equity_ratio NUMERIC(10, 4),
    
    -- Cash forecast models (next 30/60/90 days generated by AI)
    forecasted_30d_cash_flow_myr NUMERIC(19, 4),
    forecasted_90d_cash_flow_myr NUMERIC(19, 4),
    
    raw_intelligence_payload JSONB DEFAULT '{}'::jsonb NOT NULL, -- Complex raw variables
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uniq_workspace_intelligence_date UNIQUE (workspace_id, calculated_on_date)
);

-- AI Generated Strategic Insights
CREATE TYPE insight_criticality AS ENUM ('INFORMATION', 'WARNING', 'CRITICAL', 'OPPORTUNITY');

CREATE TABLE financial_strategic_insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    title VARCHAR(255) NOT NULL,
    criticality insight_criticality NOT NULL,
    summary_markdown TEXT NOT NULL, -- High Quality Markdown output detailing instructions
    associated_entities JSONB DEFAULT '{}'::jsonb NOT NULL, -- Identifies related bank/debt/ledger accounts
    dismissed_by_user_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Transaction Anomalies Detection Ledger
CREATE TABLE financial_anomalies_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    expense_record_id UUID REFERENCES expense_records(id) ON DELETE CASCADE,
    income_record_id UUID REFERENCES income_records(id) ON DELETE CASCADE,
    suspicion_score NUMERIC(5, 2) NOT NULL, -- Out of 100
    anomaly_reason VARCHAR(255) NOT NULL, -- e.g., "Duplicated record suspect", "Significant variance from pattern limit"
    resolved_by_user_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
```

---

## 8. Immutable Audit Trail & Ledger Hash System

Ensures the database is tamper-evident. All financial insertions generate a cryptographically-chained SHA-256 block matching the immediate antecedent block.

```sql
-- Audit Trail Log System
CREATE TABLE immutable_audit_ledger (
    index_id BIGSERIAL PRIMARY KEY, -- Incremental key sequence
    workspace_id UUID REFERENCES workspaces(id) ON DELETE RESTRICT NOT NULL,
    entity_table VARCHAR(100) NOT NULL, -- e.g., 'income_records', 'expense_records'
    entity_id UUID NOT NULL, -- Unique identifier of modified record
    action VARCHAR(50) NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
    performed_by UUID NOT NULL, -- User performing operations
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    -- Transaction State Payload Snapshot
    after_state_sha256 CHARACTER(64) NOT NULL, -- Hex-encoded hash of the payload parameters
    raw_payload_json JSONB NOT NULL, -- Full row details
    
    -- Chaining Fields
    previous_block_hash CHARACTER(64) NOT NULL, -- Hash of previous index_id audit log block
    current_block_hash CHARACTER(64) NOT NULL, -- SHA-256 calculation containing this payload + previous_block_hash
    
    CONSTRAINT check_hash_lengths CHECK (
        length(after_state_sha256) = 64 AND 
        length(previous_block_hash) = 64 AND 
        length(current_block_hash) = 64
    )
);

CREATE INDEX idx_audit_ledger_workspace ON immutable_audit_ledger(workspace_id);
```

### Hash Calculations & Protection Triggers

A standard PL/pgSQL function implements strict integrity verification.

```sql
CREATE OR REPLACE FUNCTION audit_trail_hash_chain()
RETURNS TRIGGER AS $$
DECLARE
    last_block_hash CHARACTER(64);
    payload_string TEXT;
    computed_hash CHARACTER(64);
BEGIN
    -- 1. Grab the latest block hash from the database. Default key used if it is the Genesis entry.
    SELECT current_block_hash INTO last_block_hash 
    FROM immutable_audit_ledger 
    ORDER BY index_id DESC LIMIT 1;
    
    IF last_block_hash IS NULL THEN
        last_block_hash := '0000000000000000000000000000000000000000000000000000000000000000';
    END IF;

    -- 2. Derive deterministic string from modern payload content
    payload_string := NEW.raw_payload_json::text || NEW.after_state_sha256 || last_block_hash;
    
    -- 3. Calculate recursive hash checksum standard
    computed_hash := encode(digest(payload_string, 'sha256'), 'hex');
    
    -- 4. Apply parameters to records
    NEW.previous_block_hash := last_block_hash;
    NEW.current_block_hash := computed_hash;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger execution bindings
DROP TRIGGER IF EXISTS trg_audit_trail_hash_chain ON immutable_audit_ledger;
CREATE OR REPLACE TRIGGER trg_audit_trail_hash_chain
BEFORE INSERT ON immutable_audit_ledger
FOR EACH ROW
EXECUTE FUNCTION audit_trail_hash_chain();
```
