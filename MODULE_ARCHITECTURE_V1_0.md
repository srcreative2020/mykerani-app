# MYKERANI Module Architecture V1.0

This document defines the module design for **MYKERANI (AI Financial Assistant)**. Built on a locked, multi-tenant database schema (V1.2), this architecture isolatively handles tenant operations, streamlines user workspaces, monitors operational margins at the Headquarters (HQ) level, and implements real-time financial assistance without violating data constraints.

---

## Module Relationship Graph

```
                   ┌──────────────────────────────────────┐
                   │          HQ Control Module           │
                   └──────────────────┬───────────────────┘
                                      │
                 ┌────────────────────┼────────────────────┐
                 ▼                    ▼                    ▼
       ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
       │   Demo Module    │  │Tenant/User Module│  │Workspace Module  │
       └──────────────────┘  └────────┬─────────┘  └────────┬─────────┘
                                      │                     │
                     ┌────────────────┴─────────────────────┼────────────────┐
                     ▼                                      ▼                ▼
       ┌────────────────────────┐             ┌────────────────────────┐  ┌────────────────────────┐
       │Subscription & Billing  │             │   Financial Module     │  │   Resource Wallet     │
       └─────────────┬──────────┘             └─────────────┬──────────┘  └────────────────────────┘
                     │                                      │
                     ▼                                      ▼
       ┌────────────────────────┐             ┌────────────────────────┐
       │  Notification Router   │             │   Evidence Package     │
       └────────────────────────┘             └─────────────┬──────────┘
                                                            │
                                                            ▼
                                              ┌────────────────────────┐
                                              │  AI Financial Assistant│
                                              │    (Learning/Intel)    │
                                              └─────────────┬──────────┘
                                                            │
                                             ┌──────────────┴──────────────┐
                                             ▼                             ▼
                              ┌────────────────────────┐     ┌────────────────────────┐
                              │    Reporting Module    │     │Immutable Audit Ledger  │
                              └────────────────────────┘     └────────────────────────┘
```

---

## 1. HQ Control Module

### Purpose
Acts as the ultimate administrative governance system for the MYKERANI platform owner. Allows control-plane operators to configure subscription products, monitor aggregate profitability, measure physical API dependency costs in real-time, and review secure security and audit ledger state.

### Features
* Subscriptions & Base Tier manager.
* Supplier Unit Cost dashboard (mapping costs for third-party services like Gemini tokens and OCR parses).
* Operational Margin tracking of active tenants vs. actual software costs.
* Platform Audit Ledger inspector (detects hash collisions or tamper attempts in the immutable ledger).

### Database Tables Used
* `tenants` (monitoring categories)
* `subscription_plans` (master setup)
* `hq_infrastructure_costs` (unit cost baseline)
* `hq_supplier_service_logs` (actual resource consumption costs)

### User Actions (HQ Admin Only)
* Update active subscription fee schemes.
* Reconfigure base cloud consumption prices in `hq_infrastructure_costs` based on live Google/Supabase metrics.
* Flag anomalous tenant consumption patterns.

### AI Actions
* **HQ Margin Anomaly Flagging**: Scans total usage logs across the system and flags tenants consuming non-proportional credits relative to their paid brackets.

### HQ Visibility
* **Complete Systemic Visibility**: Absolute read-only dashboard covering total usage, platform margins, and health.

---

## 2. Demo Account Module

### Purpose
Provides a sandbox for sales presentations, user test-driving, and tutorials. Uses pre-configured, immutable datasets loaded under a specialized DEMO tenant tag.

### Features
* One-click demo resetting (restores default test-wallet status and transactions).
* Safe execution flow ensuring AI calls are mock-grounded to save live API charges or isolated with strict limits.
* Walkthrough guide triggers.

### Database Tables Used
* `tenants` (specifically `category = 'DEMO'`)
* `workspaces` (Demo workspaces)
* `resource_wallets` (repopulated periodically on reset)
* All core Financial tables (`income_records`, `expense_records`, `receivables`, `payables`, etc. containing demo metrics).

### User Actions
* Explore pre-populated visual dashboards and interact with the AI Assistant.
* Simulate registering receipts/expenses.
* Perform a "Demo Reset" to sweep all custom workspace changes back to baseline configuration.

### AI Actions
* Generate interactive mock insights using dedicated, constrained instruction guidelines.
* Respond to sample general ledger queries within simulated parameters safely.

### HQ Visibility
* **Full Developer Visibility**: Monitoring interactions within demo instances to optimize user-onboarding funnels.

---

## 3. Tenant/User Module

### Purpose
Represents the locked user isolation tier. Controls tenant metadata, manages authentication integration, partitions cross-tenant communication paths, and binds users strictly to their tenant organizations.

### Features
* Secure authentication mapping with Supabase Auth schema.
* Cross-tenant separation enforcement.
* Multi-user teammate invitation workflows within a single tenant organizational structure.

### Database Tables Used
* `tenants` (specifically `category = 'USER'`)
* `tenant_subscriptions` (current active license association)

### User Actions
* Modify tenant metadata (billing address, legal organization name).
* Invite additional company administrators or financial recorders.
* Terminate user access sessions across instruments.

### AI Actions
* None (strictly an infrastructural/membership routing gatekeeper).

### HQ Visibility
* Basic metadata tracking (creation events, tenant category classifications). HQ has absolutely no access to raw customer users' authentication credentials or active financial user keys.

---

## 4. Workspace Module

### Purpose
Regulates the secondary structural isolation boundary model. Each tenant of MYKERANI can create isolated compartments ("Workspaces") such as "Personal", "Company A", "Company B", or "Startup Subsidiary" to completely segregate accounting books, reports, learning models, and bank structures.

### Features
* Workspace switcher UI framework.
* Default baseline assets initialization on new workspace creation.
* Independent parameter switches per isolated workspace directory.

### Database Tables Used
* `workspaces`
* `general_ledger_categories` (initialization on creation of the workspace)
* `resource_wallets` (isolated workspace credit boundaries)

### User Actions
* Switch active business context workspace.
* Provision a new workspace boundary (e.g., adding "Company B LLC" to their profile).
* Archive or rename individual workspaces.

### AI Actions
* None (acts as logical context routing wrapper for incoming AI requests).

### HQ Visibility
* Anonymous usage monitoring (total workspace count per tenant, active list metrics).

---

## 5. Financial Module

### Purpose
The primary transaction record module containing ledgers tracking cash, bank balances, debts, payables, receivables, and commitments. Designed strictly for high-precision local storage with no payroll functionality.

### Features
* Core financial books logging (Income, Expense, Receivables, Payables, Debt ledger entries).
* Complex Future Recurring outflow calculations (Financial Commitments tracker).
* Bank Account profiles and manual Cash Register safe balance tracking.

### Database Tables Used
* `general_ledger_categories`
* `bank_accounts`
* `cash_accounts`
* `income_records`
* `expense_records`
* `receivables`
* `payables`
* `debts`
* `financial_commitments`

### User Actions
* Manually register and review transaction records (income vs. expense lists).
* Capture and catalog receivables, payables, and outstanding debts.
* Track bank balances and cash registries manually.

### AI Actions
* **Categorization Engine**: Automatically proposes logical standard ledger structures to assign to newly added transaction entries based on metadata context weights.
* **Duplication Alert System**: Identifies identical double entries submitted close in sequence.

### HQ Visibility
* Absolutely zero raw transaction data visibility. Aggregate system performance records only.

---

## 6. AI Financial Assistant Module (Learning & Intelligence)

### Purpose
Acts as the algorithmic "brain" processing raw workspace inputs, compiling contextual strategic health insights, analyzing periodic trends, and logging matching transaction patterns.

### Features
* Real-time conversational AI loop anchored strictly within workspace and tenant bounds.
* Periodic Financial Strategic Insights compiling (warning, opportunities, runway calculations).
* Anomaly and pattern anomaly detection engines.

### Database Tables Used
* `workspace_memories`
* `ai_learned_vendors`
* `ai_learned_customers`
* `ai_learned_categories`
* `ai_transaction_patterns`
* `financial_intelligence_snapshots`
* `financial_strategic_insights`
* `financial_anomalies_logs`

### User Actions
* Ask MYKERANI general queries (e.g., "What was our highest utility expense in Company A last month?").
* Clear strategic workspace insight guidelines or resolve logged transaction anomalies.
* Adjust local system parameters (e.g., teaching the model custom vendor rules).

### AI Actions
* **Financial Health Computations**: Runs background updates analyzing liquidity, operating cash flows, burn rates, runway forecasts, and strategic suggestions.
* **Continuous Pattern Extraction**: Identifies recurring bills or contract structures from payables and ledger records and appends them to pattern lists.
* **Memory Update Engine**: Updates custom learning context aliases dynamically during manual correction events.

### HQ Visibility
* Anonymous statistical dashboards detailing overall AI query frequencies, average model request processing latency, and feedback loops performance metrics.

---

## 7. Resource Wallet Module

### Purpose
Safeguards and manages tokenized credit units (AI, OCR, Storage, and Notification credits), ensuring usage does not exceed defined plan quotas to preserve platform profitability.

### Features
* Near real-time credit checking (rejects AI or OCR processes when balances are exhausted).
* Precise wallet balance logging.
* Automated credit consumption triggers tracking individual service operations.

### Database Tables Used
* `resource_wallets`
* `resource_wallet_transactions`
* `hq_supplier_service_logs`

### User Actions
* View current active system credit allowances (AI, OCR parses, storage megabytes remaining).
* Inspect clean logs tracking consumption history events.
* Purchase on-demand credit expansions (triggering payment gates).

### AI Actions
* Automatically calculate token length counts during API completions and push consumption values directly to wallet decrement triggers.

### HQ Visibility
* **Direct Administrative Control**: Administrators can manually audit credit allocations, identify heavy resource consumers, and issue refunds or manual wallet grants.

---

## 8. Subscription & Billing Module

### Purpose
Maintains pricing consistency across plans and updates individual tenant plan assignments in response to billing events.

### Features
* Plans definition list.
* Tenant subscription period validation gates.
* Multi-tier access structures (Free vs. Venture vs. Enterprise tiers).

### Database Tables Used
* `subscription_plans`
* `tenant_subscriptions`

### User Actions
* Select, upgrade, or cancel active subscription configurations.
* Modify card details and payment accounts.
* Download previous membership invoice files.

### AI Actions
* None (operates as a strict rules-based financial boundary).

### HQ Visibility
* Access to gross transaction volumes, conversion performance indicators, churn ratios, and active MRR/ARR charts.

---

## 9. Financial Evidence Package (FEP) Module

### Purpose
The document organization layer verifying financial operations. Binds uploaded invoices, bank receipt files, and contracts with respective general ledger transactions.

### Features
* Secure multi-file drag-and-drop file upload engine feeding isolated Supabase storage buckets.
* Automatic AI OCR metadata parser (extracting dates, vendors, tax, totals).
* Tamper-proof audit block state mappings (prevents deleting evidence once matched to locked general ledger entries).

### Database Tables Used
* `evidence_bundles`
* `evidence_documents`
* `ledger_evidence_mappings`

### User Actions
* Process uploads (receipt png, invoice pdf documents).
* Compile related documents into named "Evidence Bundles".
* Connect bundles directly to register events (e.g., linking a supplier invoice to a payable ledger card).

### AI Actions
* **OCR Metadata Parsing Engine**: Processes uploaded documents using Google Vision/Gemini features, identifies standard vendor metadata blocks, extracts price items, and calculates optical model parsing confidence.

### HQ Visibility
* Anonymous storage volume metrics (aggregate global storage in standard bytes utilized across active instances). Zero direct preview access to raw document files or personal transaction invoices.

---

## 10. Notification Router Module

### Purpose
Provides uniform alerts for business managers and financial operators through interactive workspace events and email workflows.

### Features
* In-app workspace bell notifications.
* Email digest dispatcher.
* Critical health/threshold warnings (e.g., automated overdraft warnings, commitment due dates).

### Database Tables Used
* `financial_commitments` (monitoring due dates)
* `workspace_memories` (retrieving notification target parameters)

### User Actions
* Configure communication profiles (daily summaries vs. weekly reporting cycles vs. vital anomaly notifications only).
* Archive and mark logs as processed.

### AI Actions
* **Critical Issue Escalation**: Flags detected cash anomalies, upcoming large commitment maturities, or near-overdraft bank status alerts directly to the workspace notification router queue.

### HQ Visibility
* Total global notifications dispatched volumes. No access to individual message payloads or email lists.

---

## 11. Reporting Module

### Purpose
Compiles standard, dynamic reports tracking cash flow velocity, operational profit and loss, current asset ratios, and commitments schedules.

### Features
* Interactive financial visualization widgets (using D3 or Recharts elements) showing trendlines.
* Custom interval reporting (quarterly summaries, fiscal year outlines).
* Real-time cash forecasting visualizer charts.

### Database Tables Used
* Core Financial records tables (`income_records`, `expense_records`, `receivables`, `payables`, `debts`, `financial_commitments`)
* `financial_intelligence_snapshots` (extracting pre-compiled cash runways and liquidity coefficients)

### User Actions
* Filter financial reports by custom dates or by selected general ledger code ranges.
* Request tailored export files of general ledger lines (e.g., CSV outputs).
* Toggle predictive simulation models (turning "on" predictive AI runway forecast models).

### AI Actions
* **Predictive Simulation Builder**: Constructs trend-matching forecasts for upcoming periods (e.g. projecting debt interest burdens and cash movements using recurring patterns).

### HQ Visibility
* Aggregate anonymized platform report metrics (e.g., total volume of transactions logged platform-wide relative to active users).

---

## 12. Backup & Recovery Module (Immutable Audit Trail Engine)

### Purpose
The ultimate core validation mechanism of the locked, multi-tenant system. Handles transactional history audits, prevents untracked system manipulation, and verifies hash-chain integrity continuously to ensure database tables are completely write-audited and tamper-evident.

### Features
* Real-time trigger intercepting updates across database financial record tables.
* Chained SHA-256 block ledger creation.
* Periodic cryptographic integrity auditing routines.

### Database Tables Used
* `immutable_audit_ledger`
* All financial tracking tables monitored by the audit triggers.

### User Actions
* View an immutable edit-history timeline detailing who adjusted database parameters, on what date, and from what prior parameters.
* Trigger a manual Workspace Integrity Hash Verification scan to assert that transaction history records are uncorrupted.

### AI Actions
* None (strictly ruled system-level cryptographic integrity module).

### HQ Visibility
* **Total Ledger Health Visibility**: System alerts indicating absolute baseline ledger consistency, tracking individual tenant tamper checks, and reporting audit collision values to cloud run controllers.

---

## Cross-Module Integration Flows

### Example: Uploading a Supplier Invoice & Updating Books
1. **User** drops an invoice in the **Financial Evidence Package (FEP) Module**.
2. FEP calls **Resource Wallet Module** to check and decrement `ocr_credits`.
3. FEP runs the **AI Financial Assistant Module**'s OCR service to parse total, tax, date, and supplier name.
4. FEP displays the extracted parameters in the **Financial Module** as a suggested draft payable.
5. **User** checks and clicks "Approve Payable".
6. The **Financial Module** writes the payable row, simultaneously writing a state payload snapshot to the **Backup & Recovery Module**.
7. **Backup & Recovery Module** computes the SHA-256 block chained to the antecedent hash, forever securing the transaction on the immutable ledger.
