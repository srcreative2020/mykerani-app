# MYKERANI UI/UX Architecture V1.0

This design specification details the workspace-level visual, route, and interactive architecture for **MYKERANI (AI Financial Assistant)**. 

The user experience is designed for high-density professional telemetry, clarity in financial bookkeeping, contextual AI interactions, and strict workspace isolation. The UI/UX architecture directly anchors to the locked Database Schema V1.2, locked Module Architecture V1.0, and locked API Architecture V1.0.

---

## 1. User Journey Map

```
┌─────────────────┐      ┌─────────────────────────┐      ┌───────────────────────────┐
│   1. LANDING    │      │    2. AUTH & ONBOARD    │      │    3. INITIALIZE STATE    │
│  Public Portal  ├─────►│  Supabase Auth Router  ├─────►│ Initialize Default Ledger │
└─────────────────┘      └─────────────────────────┘      └─────────────┬─────────────┘
                                                                        │
┌─────────────────┐      ┌─────────────────────────┐      ┌─────────────▼─────────────┐
│ 6. RUN FORECAST │      │   5. UPLOAD EVIDENCE    │      │    4. CORE WORKSPACE      │
│ AI Advisor Loop │◄─────┤ Bound to Ledger Entry  │◄─────┤   Analytics Dashboard     │
└─────────────────┘      └─────────────────────────┘      └───────────────────────────┘
```

1. **Discovery & Authenticate**: The user lands on a clean, off-white authentication gateway, utilizing secure password entry or federated tokens.
2. **Context Selection**: The system immediately detects the tenant boundary and displays user-accessible workspaces (e.g., "Company A", "Personal Cash Book").
3. **Primary Operations**: The user accesses the active workspace's master dashboard, observing visual reporting figures configured dynamically via MYR precision fields.
4. **AI-Assisted Verification**: The user uploads evidence files (receipts/invoices). The server-side Gemini system parses parameters, proposes ledger entries, and logs transaction patterns.
5. **Ledger Locking**: The user confirms the record. The background system writes changes to the database and recalculates the SHA-256 block values for the immutable audit tracker.

---

## 2. Navigation Structure

To maintain a consistent environment across workspaces, navigation is split into three main areas:

### A. Global App Rail (Always Left-Pinned)
* **Workspace Selector Dropdown**: Switcher interface transitioning users between active company boundaries.
* **Master App Navigation Navigation Elements**:
  * Dashboard (`/dashboard`)
  * Financial Core Ledgers (`/financials/*`)
  * Evidence Center (`/evidence`)
  * Real-Time Assistant (`/assistant`)
  * Security & Audit Logs (`/audit`)
* **Utilities Footer**:
  * Resource Wallet Balance Indicator (`/wallet`)
  * Notifications Center Toggle Panel
  * Direct User Account Settings (`/settings`)

### B. HQ Admin Rail (Subdomain Pinned, HQ Administrators Only)
* **Platform Metrics Overview** (`/hq`)
* **Subscriptions Scheme Control** (`/hq/subscription-plans`)
* **Service Infrastructure Pricing Editor** (`/hq/infrastructure-costs`)
* **System Margin Auditor** (`/hq/supplier-service-logs`)

---

## 3. Screen Architecture & Interactive Maps

---

### Screen 3.1: Workspace Analytics Dashboard (`/dashboard`)

#### Purpose
The primary landing surface of an active workspace. Visually aggregates financial metrics, remaining resource wallet quotas, pending debt balances, upcoming commitments, and live financial strategic insights.

#### User Actions
* Adjust dashboard view range (Current Month, Last 30 Days, Fiscal Year).
* Click strategic insight cards to read deep-dive recommendations.
* Dismiss resolved strategic or tax notifications.
* Toggle predictive forecasting trendlines overlay on reporting charts.

#### AI Actions
* **Predictive Cash Runways Projection**: Computes predictive runway curves over 30, 60, and 90-day durations using logged financial commitment timelines.
* **Strategic Insights Dispatcher**: Generates text warnings or fiscal recommendations based on liquidity benchmarks.

#### Data Sources
* `financial_intelligence_snapshots`, `financial_strategic_insights`, `resource_wallets`

#### Navigation Rules
* Clicking "Upload Invoice" navigates to the *Financial Evidence Package Center*.
* Clicking "Add Financial Entry" prompts the *Financial Ledger Editor Modal*.

---

### Screen 3.2: Account Authentication Gateway (`/auth/login`)

#### Purpose
The entry portal to isolate user sessions, process credentials, and retrieve secure tenant validation scopes.

#### User Actions
* Enter secure user email credentials and password.
* Toggle federated single sign-on (OAuth).
* Submit recovery request tickets for lost password updates.

#### AI Actions
* None (strictly locked infrastructure routing gate).

#### Data Sources
* Supabase Authentication API

#### Navigation Rules
* On successful authentication, automatically routes to the *Tenant Workspace Selector Screen*.

---

### Screen 3.3: Tenant Workspace Selector (`/workspaces/select`)

#### Purpose
Intercepts authenticated users post-login to guarantee clear workspace isolation selection before presenting financial record books.

#### User Actions
* Browse and select from the active roster of company and personal workspaces mapped to the tenant account.
* Initialize a new workspace, specifying name, slug, and base operating parameters.
* Set a workspace as "Default" for automatic dashboard mapping on future logins.

#### AI Actions
* None (logical isolation gate).

#### Data Sources
* `workspaces`, `tenants`

#### Navigation Rules
* Clicking on any workspace profile sets headers and routes user directly to `Screen 3.1: Workspace Analytics Dashboard`.

---

### Screen 3.4: Financial Ledger Console (`/financials`)

#### Purpose
An interactive list view enabling control of income records, expense items, receivables balance registers, payables schedules, active bank accounts, cash registers, and outstanding debts.

#### User Actions
* Filter logs by ledger classification codes, payment bank accounts, or date fields.
* Manually log ledger lines (specifying currency values in MYR, tax items, references, and descriptions).
* Register physical cash transfers between safes and bank profiles.
* Trigger edit actions on outstanding payables or receivables to mark partial payments.

#### AI Actions
* **Ledger Auto-Categorization Recommendation**: Recommends appropriate ledger-category classifications (e.g., matching "Tenaga Nasional" to a standard Utility ledger code) during entry drafting.
* **Anomaly Flagging**: Visually highlights entries that deviate from established business cash behaviors or detect possible duplicate submissions.

#### Data Sources
* `income_records`, `expense_records`, `receivables`, `payables`, `debts`, `bank_accounts`, `cash_accounts`

#### Navigation Rules
* Each transaction row has an "Evidence" indicator that links to its mapped file in the *Evidence Modal View*.

---

### Screen 3.5: Financial Evidence Package Center (`/evidence`)

#### Purpose
Assigned focal terminal for uploading, managing, and indexing billing documentation, invoices, contracts, and matching receipts.

#### User Actions
* Upload electronic copies of receipts, tax files, contract PDFs, and invoice documents (Drag and Drop / File Browser input triggers).
* Compile documents into named "Evidence Bundles".
* Bind raw documents to corresponding workspace transaction rows.

#### AI Actions
* **AI OCR Data Parser**: Converts imported PDFs or images, extracts standard values (tax rates, totals, vendor names, reference keys, transaction dates), and updates form values with visual parsing scores.

#### Data Sources
* `evidence_documents`, `evidence_bundles`, `ledger_evidence_mappings`

#### Navigation Rules
* Select a bundle to launch the *Transaction Alignment Interface*, matching unmatched parsed items to draft ledger lines.

---

### Screen 3.6: AI Financial Assistant Terminal (`/assistant`)

#### Purpose
A focused, full-height conversation terminal for interacting with the localized Gemini financial context engine.

#### User Actions
* Enter voice or text prompts (e.g., "Draft our operating expenses vs. revenue forecast tables for Q2").
* Execute smart quick-action chips ("Check cash runway", "Log a new MYR 50.00 cash expense", "Detect ledger duplicates").
* Apply suggestions directly to ledger configurations.

#### AI Actions
* **Interactive Context Generation**: Synthesized, real-time responses incorporating local general ledger histories, bank accounts, and learned vendor memory.
* **Action Framing**: Outputs valid actions (e.g. proposing to construct a transaction row) that the client code can safely interpret and present as actionable UI prompts.

#### Data Sources
* `workspace_memories`, `ai_learned_vendors`, `ai_learned_customers`, `ai_transaction_patterns`, plus complete Workspace financial ledger tables.

#### Navigation Rules
* Strictly sandboxed within active `/assistant` routes. Users must manually toggle sidebar views to transition back to core financial registers.

---

### Screen 3.7: Resource Wallet & Billing Monitor (`/settings/billing`)

#### Purpose
Enables tenants to monitor consumption margins, view credit metrics, and purchase plan expansions.

#### User Actions
* View actual, near real-time breakdowns of spent and remaining credits (AI compute units, tax OCR processed frames, and database file storage MBs).
* Upgrade active plans or purchase credit add-on blocks.
* Review historic invoices list.

#### AI Actions
* None.

#### Data Sources
* `resource_wallets`, `resource_wallet_transactions`, `tenant_subscriptions`, `subscription_plans`

#### Navigation Rules
* "Purchase plans" buttons route immediately through secure external billing gateways.

---

### Screen 3.8: Notifications Dispatcher Panel (Slide-Over Panel)

#### Purpose
A sliding workspace overlay presenting high-priority security, payment, operational, and AI-predicted cash flow anomaly alerts.

#### User Actions
* Process notification cards (dismiss vs. drill down into source accounts).
* Refine dashboard message routing filters.

#### AI Actions
* **Urgent Cash Runways Warn Trigger**: Dispatches automatic panel warns if a company's Cash Runway projection dips below 3 operating periods.

#### Data Sources
* `financial_anomalies_logs`, `financial_commitments`

#### Navigation Rules
* Dismiss operations immediately slides the list panel back out of active screen view boundaries.

---

### Screen 3.9: Immutable Ledger Auditor Portal (`/audit`)

#### Purpose
A secure diagnostics environment displaying historical record modification timelines and proving database ledger integrity.

#### User Actions
* Review the sequential historical edit-trail timeline, detailing preceding values, actors, and creation timestamps.
* Trigger a manual "Workspace Cryptographic Verification Scanner" checking the state of all database table hash chains.

#### AI Actions
* None.

#### Data Sources
* `immutable_audit_ledger`

#### Navigation Rules
* Access to this portal is restricted to users holding administrative roles.

---

### Screen 3.10: HQ Admin Control Desk `/hq` (Special Subdomain Restricted)

#### Purpose
The administrative console for MYKERANI administrators, providing tools to customize subscriptions, configure supplier pricing models, and monitor platform health.

#### User Actions
* Configure global plans, credit allocations, and subscription schemes.
* Adjust baseline supplier pricing formulas (Gemini pricing parameters, OCR transaction estimates).
* Audit global platform performance margin maps.

#### AI Actions
* **Platform Profitability Forecaster**: Evaluates global revenue records against operational resource logs to generate 30-day corporate margin projections.

#### Data Sources
* `hq_infrastructure_costs`, `hq_supplier_service_logs`, `subscription_plans`, `tenants`

#### Navigation Rules
* Strictly isolated on separate subdomain paths. Users with standard tenant profiles cannot register these paths.

---

## 4. Key UX Operational Flows

### A. The Document Upload & AI Coding Alignment Flow

```
[ User drops Bill PDF ] 
         │
         ▼
[ FEP OCR processes file ] ──► (Uses 1 OCR Credit) 
         │
         ▼
[ AI presents Draft Ledger Card ] 
         │
         ▼
[ User Reviews and Approves Parameters ] 
         │
         ├──────────────────────────────────────────┐
         ▼                                          ▼
[ Write rows to cash book ]              [ Compute SHA-256 block ]
                                                    │
                                                    ▼
                                         [ Secure on Audit Ledger ]
```

### B. The Contextual AI Investigation Flow

```
[ User inputs query: "Run forecast" ]
         │
         ▼
[ Load Current Workspace Scope Parameters ]
  - Bank assets
  - Receivables
  - Commitments
  - Learn patterns
         │
         ▼
[ Query is packaged inside secure system guides ]
         │
         ▼
[ Gemini generates response content ] ──► (Uses AI Credits)
         │
         ▼
[ SSE formats text response & interactive action chips in UI ]
```

### C. Workspace Switching Isolation Flow

```
[ User selects "Company B" from Selector Dropdown ]
         │
         ▼
[ Clear Local Scope States & Active Memory Indexes ]
         │
         ▼
[ Switch X-Workspace-Id HTTP Header ]
         │
         ▼
[ Load target dataset & check workspace resource wallet limits ]
         │
         ▼
[ Re-render Dashboard & clear Assistant Session Context ]
```
