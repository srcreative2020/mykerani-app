# MYKERANI Development Roadmap V1.0

This development roadmap outlines the technical progression, build steps, and acceptance parameters required to deliver **MYKERANI (AI Financial Assistant)** as an enterprise-grade SaaS platform from start to deployment. 

The roadmap is structured in 12 sequential implementation phases to ensure complete alignment with our locked architectures (System, Database V1.2, Module V1.0, API V1.0, and UI/UX V1.0).

---

## Roadmap Overview

```
┌─────────────────────────────────┐
│   PHASE 1: Core Foundation      │
└────────────────┬────────────────┘
                 ▼
┌─────────────────────────────────┐
│   PHASE 2: Auth & Multi-Tenant  │
└────────────────┬────────────────┘
                 ▼
┌─────────────────────────────────┐
│   PHASE 3: Workspace Management │
└────────────────┬────────────────┘
                 ▼
┌─────────────────────────────────┐
│   PHASE 4: Financial Records    │
└────────────────┬────────────────┘
                 ▼
┌─────────────────────────────────┐
│   PHASE 5: Evidence Package     │
└────────────────┬────────────────┘
                 ▼
┌─────────────────────────────────┐
│   PHASE 6: AI Assistant (Core)  │
└────────────────┬────────────────┘
                 ▼
┌─────────────────────────────────┐
│   PHASE 7: Resource Wallet      │
└────────────────┬────────────────┘
                 ▼
┌─────────────────────────────────┐
│   PHASE 8: Subscription & Billing│
└────────────────┬────────────────┘
                 ▼
┌─────────────────────────────────┐
│   PHASE 9: Notification Router  │
└────────────────┬────────────────┘
                 ▼
┌─────────────────────────────────┐
│   PHASE 10: Reporting & Intel   │
└────────────────┬────────────────┘
                 ▼
┌─────────────────────────────────┐
│   PHASE 11: HQ Governance       │
└────────────────┬────────────────┘
                 ▼
┌─────────────────────────────────┐
│   PHASE 12: Audit Hardening     │
└─────────────────────────────────┘
```

---

## PHASE 1: Core Foundation

### Objectives
Establish the base repository setup, baseline server/client dev environments, styling token library, global layout components, and database connection pools.

* **Modules Included**: Shared Infrastructure Core.
* **Database Tables Used**: None.
* **APIs Used**: None.
* **UI Screens Used**: None (System Shell layout, Loading cards scaffolding).
* **Dependencies**: React 19, Vite 6, Node.js, Express, Lucide React, Tailwind CSS 4, Motion.
* **Acceptance Criteria**:
  * Development server starts without errors and binds to port `3000`.
  * Multi-workspace CSS theme variables (defaulting to clean modern layout) compile.
  * DB connection pool verifies connectivity using PostgreSQL connections.

---

## PHASE 2: Authentication & Multi Tenant

### Objectives
Create the top-tier account boundaries. Integrated with Supabase Auth to isolate customer organization paths completely at the API layer.

* **Modules Included**: Tenant/User Module.
* **Database Tables Used**: `tenants`.
* **APIs Used**: Authentication APIs, Tenant APIs.
* **UI Screens Used**: Screen 3.2: Account Authentication Gateway.
* **Dependencies**: Supabase Auth client, jsonwebtoken (server-side decoder), cookies library.
* **Acceptance Criteria**:
  * Users can register accounts, login, and query fresh JWT tokens safely.
  * Active sessions contain `tenant_id` and role metadata values embedded in token payloads.
  * Unauthenticated requests to tenant-scoped assets trigger standard 401 HTTP unauthorized errors.

---

## PHASE 3: Workspace Management

### Objectives
Introduce secondary workspace isolation. Enable users to compartment their active accounts (e.g. personal vs company books) with complete header security checking.

* **Modules Included**: Workspace Module.
* **Database Tables Used**: `workspaces`, `general_ledger_categories` (initialization records).
* **APIs Used**: Workspace APIs.
* **UI Screens Used**: Screen 3.3: Tenant Workspace Selector.
* **Dependencies**: Dropdown switcher state managers, Express route validation middleware.
* **Acceptance Criteria**:
  * Clicking selected workspaces correctly toggles the `X-Workspace-Id` header across HTTP agents.
  * Instantiating new workspaces initializes the full standard system general ledger category list.
  * Users are blocked from performing cross-workspace parameter tuning.

---

## PHASE 4: Financial Records

### Objectives
Design and implement the high-precision cash transaction bookkeeping registers. Supports assets tracker, debt models, and recurring intervals logic with MYR math stability.

* **Modules Included**: Financial Module.
* **Database Tables Used**: `bank_accounts`, `cash_accounts`, `income_records`, `expense_records`, `receivables`, `payables`, `debts`, `financial_commitments`.
* **APIs Used**: Financial Record APIs.
* **UI Screens Used**: Screen 3.4: Financial Ledger Console, Income/Expense Editor Modals.
* **Dependencies**: Big.js or high-precision decimal representation wrapper (Decimal.js type checks).
* **Acceptance Criteria**:
  * Financial records compile using `NUMERIC(19, 4)` precision database storage. No floats permitted.
  * Operations correctly impact total cash register and bank account balances on modification.
  * Recurring commitments update active scheduling calendars without calculation overflow.

---

## PHASE 5: Financial Evidence Package

### Objectives
Build secure file aggregation logic. Create the landing area for invoices, Receipts, bank logs, and contracts, triggering AI background processing flows.

* **Modules Included**: Financial Evidence Package (FEP) Module.
* **Database Tables Used**: `evidence_bundles`, `evidence_documents`, `ledger_evidence_mappings`.
* **APIs Used**: Financial Evidence APIs.
* **UI Screens Used**: Screen 3.5: Financial Evidence Package Center, Document Binder Overlay.
* **Dependencies**: Supabase Storage modules, mime-types.
* **Acceptance Criteria**:
  * File uploads complete successfully using tenant/workspace container routing directory structures.
  * Standard sizes are verified, rejecting files exceeding 15MB or unsupported shapes.
  * Mapping evidence files to specific ledger rows locks document records, protecting against deletions.

---

## PHASE 6: AI Financial Assistant (Core)

### Objectives
Synthesize the conversational assistant and background intelligent engines using server-side Gemini structures. Includes vendor extraction, recurrence pattern spotting, and workspace memories.

* **Modules Included**: AI Financial Assistant Module.
* **Database Tables Used**: `workspace_memories`, `ai_learned_vendors`, `ai_learned_customers`, `ai_learned_categories`, `ai_transaction_patterns`.
* **APIs Used**: AI Assistant APIs.
* **UI Screens Used**: Screen 3.6: AI Financial Assistant Terminal.
* **Dependencies**: `@google/genai` Node SDK, Server-Sent Events (SSE) stream utilities.
* **Acceptance Criteria**:
  * Conversational terminal streams answers contextually utilizing live general ledger states.
  * Learned vendors system successfully captures alternate aliases on transaction creation.
  * Periodic pattern evaluation successfully isolates recurring bill cycles (e.g., matching a monthly payment) to create pattern models.

---

## PHASE 7: Resource Wallet

### Objectives
Protect infrastructure operational profits by maintaining credit balances tracking token lengths, parsed OCR slides, and storage bytes.

* **Modules Included**: Resource Wallet Module.
* **Database Tables Used**: `resource_wallets`, `resource_wallet_transactions`.
* **APIs Used**: Resource Wallet APIs.
* **UI Screens Used**: Screen 3.7: Resource Wallet & Billing Monitor.
* **Dependencies**: Token counting algorithm utilities (tiktoken / server-side metadata scanners).
* **Acceptance Criteria**:
  * Every execution of Gemini queries counts consumed tokens and subtracts credit bounds.
  * OCR file uploads securely reduce available credits balance within active workspaces.
  * Exhausting resources triggers standard HTTP 402 Limit Exceeded gate-blocks on AI utilities.

---

## PHASE 8: Subscription & Billing

### Objectives
Deploy standard platform billing systems. Connect plan constraints back to active user portfolios to enforce storage, allocation, and credit balance limits.

* **Modules Included**: Subscription & Billing Module.
* **Database Tables Used**: `subscription_plans`, `tenant_subscriptions`.
* **APIs Used**: Subscription APIs.
* **UI Screens Used**: Settings subscription manager console interfaces.
* **Dependencies**: Stripe CLI, Stripe SDK integration hooks.
* **Acceptance Criteria**:
  * Upgrading subscriptions in the billing screen successfully alters active credit allotments.
  * Plan expiration triggers platform-wide restrictions, keeping accounts read-only.
  * Billing details and historic invoice PDFs are compiled and served securely per tenant.

---

## PHASE 9: Notification Router

### Objectives
Add structural alerts. Wire up interactive workspace events, commitments timeline alarms, and detected ledger error flags.

* **Modules Included**: Notification Router Module.
* **Database Tables Used**: `financial_commitments`, `workspace_memories` (target targets mapping).
* **APIs Used**: Notification APIs.
* **UI Screens Used**: Screen 3.8: Notifications Dispatcher Panel (Slide-Over Panel).
* **Dependencies**: WebSockets server utilities (or SSE polling routers) inside Cloud Run.
* **Acceptance Criteria**:
  * Entering commitment ranges schedules alarm slots that correctly send notifications when due.
  * Users can dismiss notifications from the slide-over dashboard panel.

---

## PHASE 10: Reporting & Financial Intelligence

### Objectives
Introduce data analytics layers. Generate operational profit & loss sheets, burn graphs, runway forecast charts, and flag double entries.

* **Modules Included**: Reporting Module.
* **Database Tables Used**: `financial_intelligence_snapshots`, `financial_strategic_insights`, `financial_anomalies_logs`.
* **APIs Used**: Reporting APIs.
* **UI Screens Used**: Screen 3.1: Workspace Analytics Dashboard (Visual report cards segment).
* **Dependencies**: Recharts element bundles, mathematical aggregate helpers.
* **Acceptance Criteria**:
  * Cash runway and liquidity equations write periodic evaluation logs to intelligence tables.
  * Visual reporting widgets display real-time projections leveraging Recharts modules.
  * Strategic insights cards correctly detail instructions using clean multi-level markdown.

---

## PHASE 11: HQ Governance

### Objectives
Build platform-wide pricing controls, monitor system infrastructure margins, and track tenant resource usage curves.

* **Modules Included**: HQ Control Module.
* **Database Tables Used**: `hq_infrastructure_costs`, `hq_supplier_service_logs`, `subscription_plans`, `tenants`.
* **APIs Used**: HQ APIs.
* **UI Screens Used**: Screen 3.10: HQ Admin Control Desk.
* **Dependencies**: High-performance system admin visualizers, secure routing tables.
* **Acceptance Criteria**:
  * HQ staff can successfully configure baseline provider cost indexes.
  * Service logs correctly map real-time API margins for active customer profiles.
  * Access is isolated exclusively to the administrative subdomain path.

---

## PHASE 12: Audit Hardening & Production Release

### Objectives
Enforce write-auditing on all financial transactions. Apply PL/pgSQL database triggers to calculate chained SHA-256 blocks for immutable logging, and run final security penetration sweeps.

* **Modules Included**: Backup & Recovery Module (Immutable Audit Trail Engine).
* **Database Tables Used**: `immutable_audit_ledger` plus all monitored Financial tables.
* **APIs Used**: Audit APIs.
* **UI Screens Used**: Screen 3.9: Immutable Ledger Auditor Portal.
* **Dependencies**: OpenSSL digest algorithms.
* **Acceptance Criteria**:
  * Creating, updating, or deleting any transaction writes a secure block payload to the audit ledger.
  * Every entry records the exact preceding SHA-256 block hash, successfully constructing the cryptographic chain.
  * Manual integrity scanners verify ledger consistency and alert administrators in case of tamper events.
  * The production build script (`npm run build`) compiles cleanly and runs seamlessly in Cloud Run.
