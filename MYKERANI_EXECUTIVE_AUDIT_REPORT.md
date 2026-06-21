# MyKerani — Executive Project Audit Report

**Prepared:** 2026-06-21
**Scope:** Full-codebase audit (source code, database, UI, AI, workflows, APIs, storage, architecture)
**Method:** Direct repository inspection, `git log`, `npx tsc --noEmit`, Supabase schema/migration review.

---

## 1. PROJECT OVERVIEW

| Field | Value |
|---|---|
| **Project Name** | MyKerani ("Cakap. Upload. Sahkan." — Talk. Upload. Confirm.) |
| **Current Version** | 0.0.0 in `package.json` (pre-release internal versioning; not yet semantically versioned — `package.json` `name` field is still the scaffold default `react-example`, not rebranded) |
| **Project Purpose** | A Malaysian SME bookkeeping app built around one formula: **AI Suggests → User Confirms → AI Learns**. A non-accountant business owner talks to an AI clerk, uploads a receipt/voice note/photo, and confirms a suggested financial entry — the AI never auto-approves, auto-edits, auto-deletes, pays, or decides unilaterally. Scope is locked to 100% financial record-keeping (no HR/CRM/POS/inventory). |
| **Current Development Status** | Active daily development. Core 14-category financial transaction taxonomy, multi-tenant architecture, AI router, OCR, evidence packages, billing/wallet governance, and event/audit logging are all implemented and wired to real Supabase data — no mock data paths remain in the primary flows. |
| **Completion Percentage** | **~80%** toward a stable V1.0. Core financial engine, AI suggest/confirm/learn loop, multi-tenant RLS, billing enforcement, and HQ admin console are functionally complete. Gaps remain in bank-statement reconciliation depth, situation-bank-style AI memory, a few dangling TypeScript type mismatches, and branding/versioning polish. |

---

## 2. CORE PRODUCT STATUS

| Feature | Purpose | Status | Completion % |
|---|---|---|---|
| Multi-tenant workspace architecture | Isolate each company's (tenant's) financial data, with per-business sub-workspaces | Completed | 95% |
| 14-category transaction taxonomy (Income/Expense/Receivable/Payable/Debt/Commitment/Cash/Bank/Asset/Owner Txn/etc.) | Cover every real SME financial event type | Completed | 100% |
| AI Suggest → Confirm → Learn chat loop | Core product formula; conversational entry point for non-accountants | Completed | 90% |
| OCR document engine | Extract merchant/amount/date/category from receipts/invoices | Completed | 85% |
| Voice note transcription | Let users speak a transaction instead of typing | Completed (newly wired this session) | 80% |
| OCR/vendor pattern learning | Improve future suggestions from confirmed transactions | Completed | 85% |
| Financial Knowledge Bank | HQ-curated cross-tenant vendor→category mappings to bootstrap new tenants' AI accuracy | Completed | 75% |
| Evidence Package compiler | ZIP bundle of receipts/invoices for bank/LHDN/accountant requests | Completed | 90% |
| Financial Reports & Analytics + Export (CSV/Excel/PDF/JSON) | Statutory and management reporting, full data portability | Completed | 90% |
| Bank statement auto-matching | De-duplicate manual entries against bank statement lines | In Progress | 50% |
| Financial health scoring & anomaly alerts | Proactive advisory (runway, spending anomalies, missing evidence) | Completed | 80% |
| LHDN Tax Readiness & Bank/Financing Readiness checklists | Closing the "14-category vision" compliance gaps | Completed | 85% |
| Resource wallet / billing governance (AI credits, storage quota) | Meter and enforce subscription plan usage | Completed | 80% |
| Chip Asia payment gateway + manual slip approval | Real subscription payments | Completed | 75% |
| HQ Console (AI Router, plans, customers, payment settings, audit) | Platform operator control plane | Completed | 85% |
| Audit logging (mutations) + Event logging (system events) | Compliance trail, separated by design | Completed | 90% |
| Role-based permission matrix (Owner/Staff × module CRUD) | Fine-grained in-tenant access control | Completed | 85% |
| Profile System (personal/business/vehicle/dependent) | Disambiguate AI transaction ownership, enrich tax context | Completed | 80% |
| Multi-business support | One tenant operating several businesses/branches | Completed | 75% |
| BYOS (Bring Your Own Storage: Drive/OneDrive/Dropbox) | Storage flexibility beyond HQ-hosted storage | In Progress | 40% (UI present, provider integrations not fully verified end-to-end) |
| Public marketing landing page + CMS | Acquisition funnel, HQ-editable content | Completed | 90% |
| Situation Bank (named feature) | N/A — not implemented under this name | **Disabled / Not Implemented** | 0% (functionally substituted by Knowledge Bank, see §10) |

---

## 3. USER SIDE FEATURES

"User" here = any authenticated tenant user (Owner or Staff) interacting with their own company's data.

| Feature | Purpose | Status | Flow | Screens Used |
|---|---|---|---|---|
| AI Chat Assistant | Talk to an AI clerk in Bahasa Melayu/English to record transactions | Completed | User types or attaches receipt/voice → AI replies with suggestion → user taps Confirm/Edit/Reject → record saved to ledger, AI pattern updated | `OwnerDashboard.tsx`, `StaffHomeScreen.tsx`, `AIFinancialAssistant.tsx` |
| Receipt/Document Upload via Chat | Attach a photo/PDF and have AI read it | Completed (this session) | Attach file → uploaded to `evidence_documents` → `/api/ocr/analyze` extracts fields → fields injected into AI's response context → AI proposes a transaction | Same as above |
| Voice Note in Chat | Speak a transaction instead of typing | Completed (this session) | Record audio → `/api/ai/transcribe` (Whisper) → transcript injected into AI context → AI proposes a transaction | Same as above |
| Manual Transaction Entry | Add income/expense/etc. without AI | Completed | Form-based entry on each ledger tab; also feeds `learnOcrPattern()` | `FinancialRecordsConsole.tsx` |
| Document Archive ("Dokumen" tab) | Browse/paginate all uploaded evidence docs | Completed | List with pagination, ZIP folder export | `OwnerDashboard.tsx` |
| Chat Archive ("Arkib Perbualan") | Review full chat history across sessions, separate from the always-fresh active thread | Completed (Phase 2 fix this engagement) | Active thread resets each login; archive merges all historical + active messages by `id` | `OwnerDashboard.tsx`, `StaffHomeScreen.tsx` |
| Financial Reports & Export | View/export Income Statement, Cashflow, LHDN/Bank readiness, etc. | Completed | Select report → generate → export CSV/Excel/PDF/JSON, logged as an EXPORT event | `FinancialReportsAnalytics.tsx` |
| Profile (Personal/Business/Vehicle/Dependent) | Give AI context to disambiguate ambiguous transactions (e.g., "whose car is this fuel for?") | Completed | Edit forms persisted to Supabase; read by AI assistant prompt | `OwnerDashboard.tsx` "Profil Saya" tab, `StaffHomeScreen.tsx` (read-only) |
| AI Credits & Storage Usage view | See current usage against plan allowance | Completed (RLS bug fixed this session) | Reads `resource_wallets` directly; "Beli Kredit"/"Beli Storan"/"Lihat Penggunaan" buttons now wired to real actions | `OwnerDashboard.tsx` "Lagi" → resources |
| Notifications | Alerts for low storage, AI credit exhaustion, financial health risk, missing evidence | Completed | Generated server/client-side, stored in `workspace_notifications` | `NotificationCenterConsole.tsx` |

---

## 4. OWNER FEATURES

"Owner" = `TENANT_OWNER` role — full control over their company's workspace(s).

| Function | Purpose | Status | Flow | Dependencies |
|---|---|---|---|---|
| Staff account creation | Add staff users to the workspace | Completed | Owner triggers `/api/admin/create-staff` (role-checked server-side) → temp password issued | `user_role_assignments`, Supabase Auth |
| Permission matrix management | Set per-module CRUD permissions for staff | Completed | `PermissionSettingsConsole.tsx` UI → writes `permission_matrices` | `PermissionContext.tsx` |
| Full workspace backup/restore (JSON) | Disaster recovery / data portability, satisfying the Data Ownership Rule | Completed | Owner-only export of all record types as JSON; restore re-imports | `MyKeraniBackupRecovery.tsx` |
| Billing/subscription management | View/upgrade plan, pay via Chip Asia or manual slip | Completed | Plan selection → `/api/payments/chip-asia/init` or manual upload → webhook/HQ-approval finalizes | `paymentService.ts`, `tenant_subscriptions` |
| Multi-business management | Create/manage multiple businesses & branches under one tenant | Completed | CRUD via Profile system; transactions tagged with `business_id` | `businesses`, `business_branches` tables |
| Evidence Package compilation | Bundle receipts/invoices into a ZIP for external parties | Completed | Select date range/category → server zips matching `evidence_documents` | `FinancialEvidencePackage.tsx` |
| Financial Commitments management | Track recurring obligations (loans, subscriptions, retainers) | Completed | CRUD UI, feeds cashflow forecast | `FinancialCommitmentsManager.tsx` |
| Asset purchases & Owner transactions | Record durable asset buys and capital injection/drawing | Completed | Closes the final 2 of the 14 transaction categories | `assetOwnerData.ts` |
| Audit log review | See who changed what, when | Completed | Read-only `AuditConsole.tsx` view of `audit_logs`/`immutable_audit_ledger` | `AuditContext.tsx` |

---

## 5. HQ FEATURES

"HQ" = platform operator roles (`HQ_OWNER`/`HQ_STAFF`) — manage MyKerani itself, never customer financial data ownership.

| Function | Purpose | Status | Flow | Dependencies |
|---|---|---|---|---|
| AI Router configuration | Configure/prioritize AI providers (Gemini, OpenAI, Anthropic, DeepSeek, xAI, Mistral, Groq, Alibaba) by cost/availability | Completed | HQ sets provider keys/priority → server cascades fallback on call failure | `HQConsoleShell.tsx`, server `getAiProviderCandidates()` |
| Payment gateway settings | Enable/configure Chip Asia, toggle manual payment | Completed (RLS bug fixed this session — tenants previously couldn't even read whether Chip Asia was enabled) | HQ sets brand ID/secret key/toggle → now correctly readable tenant-side | `payment_gateway_settings` table |
| Subscription plan management | Define plans (Starter/Pro/Enterprise), AI credit allowance, storage quota | Completed | CRUD UI → `subscription_plans` | `HQConsoleShell.tsx` |
| Customer/tenant management | View tenant list, suspend/approve accounts, manual payment approval | Completed | HQ reviews pending manual payments, approves/rejects | `tenant_subscriptions` |
| Knowledge Bank curation | Maintain cross-tenant vendor→category mappings to bootstrap AI accuracy for new tenants | Completed | HQ reviews `knowledge_bank_gaps` (unmatched vendors logged by AI) and adds `knowledge_bank_scenarios` | `knowledge_bank_*` tables |
| Event/Audit log monitoring | Operational visibility, troubleshooting, cost tracking | Completed | Read-only console views | `event_logs`, `audit_logs` |
| Public site CMS | Edit landing page pricing, FAQ, logo, social links | Completed | HQ edits → `site_settings`/`faq_items` → rendered on `LandingPage.tsx` | `hqService.ts` |
| Database admin tools | Initialize/verify schema, check RLS/table/bucket status | Completed | `/api/admin/db/*` endpoints, HQ-gated | `server.ts` |
| Per-user AI usage tracking + suspend/approve | Cost control and abuse prevention | Completed | HQ views per-user AI usage, can suspend accounts mid-cycle | `resource_wallets`, `consumeResourceCredit()` |

---

## 6. AI FEATURES

| Capability | Status | How It Works | Current Limitations |
|---|---|---|---|
| **Natural Language Processing** | Completed | Multi-provider LLM router (`/api/ai/assistant`); accepts free-text query + structured `financialContext` (tenant, workspace, records, profiles); returns structured JSON (`text`, `financialIntent`, `suggestions`, `highlights`, `linkedRecordIds`) | Single-turn context window per request — no persistent vector memory; relies on re-sending recent chat + financial context each call, which bounds how much history the model can reason over |
| **Financial Classification** | Completed | AI proposes record type (14-category taxonomy), category, amount, party from chat text or OCR/transcription output; user must confirm before it's written | Classification quality depends on the underlying LLM provider currently in rotation; no per-tenant fine-tuning, only prompt-injected learned patterns |
| **Financial Memory** | Completed (pattern-based, not vector/embedding-based) | `ocr_learned_patterns` table stores vendor→category→type mappings per workspace with confidence score and occurrence count; injected into every AI prompt | Memory is fuzzy-matched key-value, not semantic/embedding search — won't generalize to novel phrasing of an already-known vendor as gracefully as a vector store would |
| **Archive Learning** | Completed (de facto) | Confirmed transactions strengthen `ocr_learned_patterns` (`occurrence_count++`); chat archive persists across sessions for user reference, but is not itself fed back into AI prompts as a learning signal | Chat archive is for human review, not yet an AI training/memory input — "archive learning" is partial: pattern learning happens, but it isn't sourced from the chat archive specifically |
| **Situation Bank** | **Not implemented under this name** | No table/module literally named "situation bank" exists. The closest functional analog is the **Financial Knowledge Bank** (`knowledge_bank_scenarios` + `knowledge_bank_gaps`) — HQ-curated, cross-tenant vendor/keyword scenarios used to bootstrap AI suggestions before falling back to generic reasoning | See §10 for full detail — this is the single biggest naming/scope gap against the requested audit structure |
| **OCR** | Completed | `/api/ocr/analyze` calls a vision-capable LLM with a base64 image/PDF, returns structured fields; gated by AI credit consumption | Vision LLM accuracy varies by provider in rotation; no dedicated OCR-specific model (e.g., AWS Textract/Google Document AI) — relies entirely on general-purpose vision LLMs |
| **Receipt Processing** | Completed | Receipt photo → OCR extraction → fields surface in chat or `OCREngineConsole.tsx` for review → confirm writes to ledger + evidence document | No batch/multi-receipt upload in one action; one file per attachment |
| **Bank Statement Processing** | In Progress (50%) | Auto-match logic exists to de-duplicate bank statement lines against already-recorded manual entries | No dedicated bulk bank-statement-PDF parser/importer UI confirmed; matching logic exists but the full upload→extract→reconcile pipeline is less mature than the receipt pipeline |
| **Validation Engine** | Completed | RLS policies + server-side tenant/workspace ownership checks on every API route; immutable audit ledger (hash-chained) for tamper-evidence | "Validation" here is access/integrity validation, not a dedicated financial-logic validation engine (e.g., double-entry balance checks) — worth clarifying expectations against this term |
| **Confidence Engine** | Completed | `ocr_learned_patterns.confidence_score` (0.70 base, rises with `occurrence_count`); Knowledge Bank scenarios carry a `base_confidence`; surfaced to users as a percentage on suggestion cards | Confidence score is a heuristic (occurrence-based), not a calibrated statistical/ML confidence estimate |

---

## 7. USER PROFILE SYSTEM

**Profile fields (`PersonalProfile`):** `fullName`, `dateOfBirth`, `maritalStatus`, `occupation`, `monthlyIncomeMyr`, `dependentsCount`, `notes`.

**Business profile fields (`BusinessProfile` / `Business`):** `industry`, `branchName`, `businessType`, `registrationNo`, `notes`; multi-business model adds `businessName`, `isActive` per business, plus `BusinessBranch` (`branchName`, `location`, `isActive`).

**Vehicle profile fields (`Vehicle`):** `name`, `plateNumber`, `vehicleType`, `ownership` (`PERSONAL`|`BUSINESS`), `isActive`.

**Family profile fields (`Dependent`):** `name`, `relationship`, `dateOfBirth`.

**How AI uses profile information:** The full profile bundle (personal + business + vehicles + dependents) is injected into the AI assistant's `financialContext` on every chat call. This lets the AI disambiguate ownership questions it would otherwise have to ask the user about — e.g., distinguishing a personal vs. business vehicle fuel expense, or recognizing a named dependent referenced in conversation — directly supporting the "AI Suggests" step without forcing repetitive clarification.

---

## 8. FINANCIAL MEMORY SYSTEM

**What data is stored:** Per-workspace vendor pattern rows in `ocr_learned_patterns`: `vendor_name`, `category`, `record_type`, `confidence_score`, `occurrence_count`, `last_updated`.

**How memory works:** Every confirmed transaction (manual entry or AI chat confirmation) calls `learnOcrPattern()`. Vendor names are normalized (`vendorMatchKey()` strips legal suffixes like "Sdn Bhd"/"Berhad" and punctuation) and fuzzy-matched (`isFuzzyVendorMatch()`) against existing patterns. A match increments `occurrence_count` and refreshes `confidence_score`/`last_updated`; no match creates a new pattern row at a 0.70 base confidence.

**How memory is used by AI:** The server injects each workspace's `ocr_learned_patterns` as JSON into the AI system prompt before every chat/OCR call, with explicit priority: **this tenant's learned patterns > HQ Knowledge Bank scenarios > generic LLM reasoning**. This is the literal implementation of the "AI Learns" step in the product's core formula — each user confirmation measurably improves future suggestion accuracy for that specific tenant.

---

## 9. ARCHIVE SYSTEM

**How archive works:** Two independent archives exist: (1) **Chat Archive** ("Arkib Perbualan") — merges the full historical `ai_chat_messages` table with the live in-session thread (which is intentionally reset to empty on every login, per the Phase 2 fix this engagement) into a single de-duplicated, date-grouped view for human review. (2) **Document Archive** ("Dokumen" tab) — paginated browse of all `evidence_documents` ever uploaded to the workspace, with ZIP-folder export support.

**What is archived:** All chat messages (user + AI), all uploaded receipts/invoices/statements/voice notes (as evidence documents with full metadata), and all confirmed financial records (immutably, via `audit_logs`/`immutable_audit_ledger`).

**How AI uses archives:** Currently the AI does **not** re-read the chat archive or document archive as a memory source for future conversations — archives are for human/compliance review only. The AI's actual "memory" channel is the separate `ocr_learned_patterns` table (§8), not the archive itself. This is a meaningful distinction worth flagging: "archive" and "AI memory" are two different systems in the current implementation, even though a user might assume the chat history itself is what the AI is "remembering."

---

## 10. SITUATION BANK

**Current implementation:** No table, file, or UI component literally named "situation bank" exists anywhere in the codebase (confirmed via direct search). The closest functional equivalent is the **Financial Knowledge Bank**, added in migration `20260621020000_financial_knowledge_bank.sql`, consisting of two tables:
- `knowledge_bank_scenarios` — HQ-curated, cross-tenant vendor/keyword → classification mappings, each with a `base_confidence`.
- `knowledge_bank_gaps` — an automatically-populated log of vendors/transactions the AI could not match against either a tenant's own learned patterns or the Knowledge Bank, surfaced to HQ as a backlog for expanding scenario coverage.

**Number of situations:** Not independently verified in this audit (requires a live row count via Supabase, which was not queried this pass — flagged as a follow-up item, see §18).

**How AI uses the (functional) situation/knowledge bank:** `fetchKnowledgeBankMatches()` runs server-side before the AI call; matched scenarios are injected into the prompt as a second-priority signal (after the tenant's own learned patterns, before generic reasoning), and any unmatched transaction is logged to `knowledge_bank_gaps` for HQ review/curation — a deliberate human-in-the-loop expansion mechanism rather than autonomous self-expansion.

**Recommendation:** If "Situation Bank" is a planned/expected feature distinct from Knowledge Bank (e.g., broader non-vendor situational reasoning like "if cash account is negative and rent is due in 3 days, suggest X"), it does not exist yet and should be scoped as new work rather than assumed-complete.

---

## 11. RECEIPT SYSTEM

**Upload flow:** User attaches an image/PDF (chat attachment or dedicated "Muat Naik" tab) → file uploaded to Supabase Storage via `uploadDocument()` → row created in `evidence_documents` with full metadata (uploader, size, type, workspace).

**OCR flow:** Base64 data URL sent to `/api/ocr/analyze` → server selects a vision-capable LLM via the AI Router cascade → extracts `merchantName`, `date`, `amount`, `suggestedCategory`, `confidenceScore` → AI credit deducted via `consumeResourceCredit()` → on no confident match, gap logged to `knowledge_bank_gaps`.

**Matching flow:** Extracted vendor name is checked against the workspace's `ocr_learned_patterns` first, then the Knowledge Bank — informing the suggested category/type before the user even sees the suggestion card.

**Evidence flow:** The uploaded file remains linked in `evidence_documents` regardless of whether the user confirms a transaction from it, supporting later compilation into an Evidence Package ZIP for banks/LHDN/accountants.

**Current limitations:**
- One file per upload action — no true multi-receipt batch processing.
- OCR accuracy is bounded by whichever general-purpose vision LLM is currently first in the provider cascade — no receipt-specialized OCR model.
- No explicit duplicate-receipt detection (e.g., re-uploading the same receipt twice creates two evidence documents and could prompt two transaction suggestions).

---

## 12. BANK STATEMENT SYSTEM

**Upload flow:** Shares the same evidence document upload pipeline as receipts (no separate dedicated bank-statement uploader UI confirmed in this audit pass).

**Extraction flow:** Relies on the same OCR/vision-LLM pipeline rather than a statement-specific tabular parser; line-item extraction quality from multi-page bank statement PDFs was not verified live in this audit.

**Matching flow:** An auto-matching mechanism exists (git history: "Auto-match bank statement transactions against existing records to avoid double-counting") to prevent a manually-entered transaction and its corresponding bank statement line from both being recorded as separate records.

**Validation flow:** Matched/unmatched status is surfaced for user review rather than auto-resolved — consistent with the "AI Suggests → User Confirms" mandate (no silent auto-merge).

**Current limitations:**
- This is the least mature pipeline in the product relative to receipts — flagged in §2 at ~50% completion.
- No confirmed support for common Malaysian bank statement export formats beyond generic PDF/image OCR (e.g., no CSV import path for banks that offer one).
- Multi-page statement handling and large-table extraction accuracy were not independently load-tested in this audit.

---

## 13. DATABASE AUDIT

**Migration count:** 40 SQL files, spanning `20260601000000` through `20260626000000` (most recent: `fix_tenant_billing_rls_gaps.sql`, applied this engagement).

**Master table list (57 tables), grouped by domain:**

| Domain | Tables |
|---|---|
| Core financial ledger | `income_records`, `expense_records`, `receivables`, `payables`, `debts`, `financial_commitments`, `financial_evidence_packages` |
| Accounts | `bank_accounts`, `cash_accounts` |
| Tenancy | `tenants`, `workspaces` |
| Audit/compliance | `audit_logs`, `immutable_audit_ledger`, `event_logs` |
| OCR/learning | `ocr_learned_patterns`, `ai_learned_categories`, `ai_learned_customers`, `ai_learned_vendors`, `ai_transaction_patterns` |
| AI/knowledge | `ai_chat_messages`, `knowledge_bank_scenarios`, `knowledge_bank_gaps` |
| Profile/metadata | `personal_profiles`, `business_profiles`, `businesses`, `business_branches`, `vehicles`, `dependents`, `profiles` |
| Storage | `workspace_storage_providers`, `workspace_notification_preferences`, `workspace_notifications` |
| Permissions | `user_role_assignments`, `permission_matrices` |
| Billing | `subscription_plans`, `tenant_subscriptions`, `resource_wallets`, `payment_gateway_settings`* |
| Evidence | `evidence_documents`, `evidence_bundles`, `ledger_evidence_mappings` |
| Financial intelligence | `financial_anomalies_logs`, `financial_intelligence_snapshots`, `financial_strategic_insights` |
| HQ operations | `hq_infrastructure_costs`, `hq_supplier_service_logs` |
| Shared/legacy | `general_ledger_categories`, `workspace_memories` |
| Public site | `site_settings`, `faq_items` |
| Deprecated (schema present, not wired) | `companies`, `company_members`, `team_invitations`, `transactions`, `documents`, `bills` |
| Asset/owner | `asset_purchases`, `owner_transactions` |

\* `payment_gateway_settings` exists live in production but **has no corresponding `CREATE TABLE` in any migration file** — confirmed via repo-wide grep returning zero matches. It was created out-of-band (likely directly in Supabase Studio). This is a genuine schema-tracking gap: a fresh `/api/admin/db/initialize` run against a clean database would **not** recreate this table, breaking the payment flow on any disaster-recovery rebuild.

**Relationships:** Standard tenant-scoped FK pattern throughout — every financial/document/profile table carries `workspace_id` → `workspaces.tenant_id` → `tenants.id`. RLS policies enforce this via the shared `get_tenant_id()` / `is_hq_user()` helper functions rather than relying on FK constraints alone for isolation.

**Missing tables:** `payment_gateway_settings` is missing from migration history (see above) — the table itself is not missing from the database, but its **definition is missing from version control**, which is the actual risk.

**Unused/dormant tables:** `companies`, `company_members`, `team_invitations`, `transactions`, `documents`, `bills` are explicitly deprecated (per migration `20260618060000_deprecate_orphaned_tables.sql` and the git commit "Drop 9 dormant tables never wired to the AI pipeline or app code") — these represent an earlier company-centric schema superseded by the tenant/workspace model. `ai_learned_categories`, `ai_learned_customers`, `ai_learned_vendors`, `ai_transaction_patterns` appear alongside the now-primary `ocr_learned_patterns` table — worth verifying whether all four are still actively read, or are remnants from an earlier iteration of the learning system that should also be deprecated for clarity.

**Risks:**
1. **`payment_gateway_settings` not in migrations** — disaster-recovery / fresh-environment risk (highest priority, see §16/§18).
2. **RLS gaps recur** — this engagement alone found and fixed two previously-undetected RLS gaps (`payment_gateway_settings` tenant SELECT, `resource_wallets` zero policies). This suggests new tables should be checked against an RLS-policy-coverage test as a standing practice, not just ad hoc discovery.
3. **Legacy `ai_learned_*` tables** — possible redundancy with `ocr_learned_patterns` increases audit/maintenance surface without clear necessity confirmed.

---

## 14. PAGE INVENTORY

| Page | Purpose | Status |
|---|---|---|
| `LandingPage.tsx` | Public marketing site: pricing (HQ-editable), FAQ, CTA | Completed |
| `LoginScreen.tsx` | Auth entry point; demo account quick-login (HQ Owner, HQ Staff, Tenant demo); role-based post-login routing | Completed |
| `OwnerDashboard.tsx` | Primary tenant owner workspace: AI chat, ledger tabs, reports, evidence, backup, profile, billing/resources | Completed |
| `StaffHomeScreen.tsx` | Tenant staff workspace: AI chat, read-only ledger view, profile (read-only), permitted-module access | Completed |
| `HQConsoleShell.tsx` (routed as HQ's main shell) | HQ operator control plane: AI Router, plans, customers, payments, audit/event logs, site CMS | Completed |

---

## 15. API INVENTORY

| API | Purpose | Status |
|---|---|---|
| `GET /api/health` | Liveness check | Completed |
| `POST /api/admin/db/status` | HQ-only DB/table/bucket/RLS inventory check | Completed |
| `POST /api/admin/db/initialize` | HQ-only: run all migrations in order on a target DB | Completed (gap: would not recreate `payment_gateway_settings`, see §13) |
| `POST /api/admin/db/verify` | HQ-only end-to-end production readiness check | Completed |
| `POST /api/admin/create-staff` | Create HQ_STAFF/TENANT_STAFF account server-side | Completed |
| `POST /api/ocr/analyze` | Document OCR extraction via AI Router | Completed |
| `POST /api/ai/transcribe` | Voice note transcription via OpenAI Whisper | Completed (added this engagement) |
| `POST /api/ai/assistant` | Main AI chat endpoint (financial intent, suggestions) | Completed |
| `POST /api/payments/chip-asia/init` | Initiate Chip Asia checkout | Completed |
| `POST /api/payments/chip-asia/webhook` | Chip Asia payment callback, signature-verified | Completed |
| `GET /*` (catch-all) | Serve built frontend / Vite dev proxy | Completed |

---

## 16. CURRENT KNOWN ISSUES

**Bugs (fixed this engagement, noted for the record):**
- Chip Asia payment option never appeared tenant-side due to an RLS gap on `payment_gateway_settings` (no tenant SELECT policy) — **fixed**.
- `resource_wallets` had RLS enabled with zero policies — AI credits/storage usage silently failed to load for every tenant — **fixed**.
- Chat-attached images/PDFs/voice notes were never actually read by the AI (it only saw a filename) — **fixed**.
- Chat history reverted to an old thread after refresh instead of showing a fresh "Chat Baharu" view — **fixed**.
- "Beli Kredit"/"Beli Storan"/"Lihat Penggunaan" buttons had no `onClick` handlers — **fixed**.

**Open bugs / technical debt:**
- **29 pre-existing TypeScript errors** (confirmed live via `npx tsc --noEmit -p .`), concentrated in:
  - `server.ts` — two duplicate function implementations.
  - `FinancialRecordsConsole.tsx` — a tab-state union type missing several variants (`ai_assistant`, `storage`, `notifications`) that the code actually sets/compares against, producing ~20 of the 29 errors alone.
  - `App.tsx` / `MyKeraniAppTabs.tsx` — `categoryCode` used but not declared on the `FinancialEvent` type.
  - `AuditConsole.tsx` — `"Backup & Recovery"` module label not in the `ModuleName` union.
  - `FinancialCommitmentsManager.tsx` — a commitment-creation call site missing the required `workspaceId` field.
  - `FinancialRecordsContext.tsx` — two call sites passing `CashAccount[]`/`BankAccount[]` where `BankAccount[]`/`DebtRecord[]` is expected.
  - These do not currently block `npm run build` (Vite/esbuild are more permissive than `tsc --noEmit`), but they represent real, accumulating type-safety debt and should be burned down rather than treated as a permanent baseline.
- `payment_gateway_settings` table has no migration file — disaster-recovery gap (see §13).
- Bank statement reconciliation pipeline is materially less mature than the receipt pipeline (~50% vs ~85%).
- BYOS storage provider integrations (Drive/OneDrive/Dropbox) have UI scaffolding but end-to-end functionality was not independently verified.
- "Situation Bank" as a named, distinct feature does not exist — only the functionally-similar Knowledge Bank.
- Chat archive and AI memory are two separate systems that could be confused as one — worth clarifying in user-facing copy or product docs to avoid expectation mismatch ("does the AI remember our past chats?" → currently: not directly, only learned vendor patterns).
- `package.json` project name is still the Vite scaffold default (`react-example`), not rebranded to MyKerani — cosmetic but worth fixing before any external-facing build artifact inspection.

**Incomplete features:** Bank statement bulk import/reconciliation, BYOS storage providers, Situation Bank (if distinct from Knowledge Bank is actually desired).

---

## 17. DEVELOPMENT HISTORY

Based on `git log` (last 100 commits), development has proceeded in clear thematic waves:

1. **Foundation** — Supabase connection, HQ routing, demo-ID fixes, dashboard wiring to real data.
2. **AI Router & multi-provider** — moved off a single hardcoded Gemini model to a real HQ-configurable cascade across Gemini/OpenAI/Anthropic/DeepSeek/xAI/Mistral/Groq/Alibaba, fixing a broken `gemini-3.5-flash` reference along the way.
3. **Resource governance & billing** — wallet ledger, AI/OCR credit enforcement, storage freeze thresholds, real Chip Asia + manual payment flows, per-user usage tracking with HQ suspend/approve.
4. **Schema modernization** — standardized roles to `HQ_OWNER`/`HQ_STAFF`/`TENANT_OWNER`/`TENANT_STAFF`, deprecated 9 dormant company-centric tables, made Supabase migrations the source of truth.
5. **Core financial engine completion sprint** — closed out the full 14-category transaction taxonomy (added PAYABLE, then Asset Purchase and Owner Transaction as the final two categories), added LHDN Tax Readiness and Bank/Financing Readiness reports as "the last gap in the 14-category vision."
6. **Profile System (Fasa 2)** — personal/business profiles, vehicles, dependents, staff read-only view, AI disambiguation wiring, later evolved into full multi-business/branch support.
7. **Financial Knowledge Bank / Memory Engine** — cross-tenant vendor learning, suggest-first AI behavior (stopped asking for missing vendor names reflexively), proactive advisory alerts (health risk, spending anomalies, missing evidence).
8. **Evidence & compliance hardening** — Evidence Package ZIP compiler, accounting audit trail, RLS fixes for Dokumen upload, JWT staleness fix in tenant-scoping RLS functions.
9. **Most recent wave (this engagement)** — chat attachment OCR/transcription wiring, chat-history-on-refresh fix, dead billing button fixes, and the `payment_gateway_settings`/`resource_wallets` RLS gap fixes.

**Features removed:** The 9 dormant company-centric tables (`companies`, `company_members`, `team_invitations`, `transactions`, `documents`, `bills` plus others) and a "dummy AI Configuration panel" placeholder UI were explicitly removed once their real replacements existed — a healthy pattern of deleting superseded code rather than letting it accumulate.

---

## 18. TOP 20 NEXT PRIORITIES

Ranked by impact (highest first):

1. **Add a migration for `payment_gateway_settings`** — currently undocumented in version control; any DB rebuild/disaster recovery silently loses the entire payment configuration table. Highest-impact, lowest-effort fix.
2. **Run a systematic RLS coverage audit across all 57 tables** — two RLS gaps were found and fixed only because users reported visible breakage. A proactive `pg_policies` vs. `pg_class.relrowsecurity` sweep (the method used to diagnose this engagement's bugs) should become a standing pre-release check, not a reactive one.
3. **Resolve the 29 outstanding TypeScript errors**, prioritizing `FinancialRecordsConsole.tsx`'s tab-state union (the largest single cluster) — these represent real latent bugs (e.g., comparisons that can never be true) even though the build currently tolerates them.
4. **Mature the bank statement reconciliation pipeline** to parity with the receipt pipeline — currently the weakest major financial workflow at ~50% completion.
5. **Decide and scope "Situation Bank"** explicitly — either formally rename/extend the Knowledge Bank to cover the intended scope, or scope it as genuinely new work; don't leave it ambiguous against product requirements.
6. **Verify BYOS storage providers end-to-end** (Drive/OneDrive/Dropbox) or de-scope/hide the UI until they are real — avoids a "cosmetic feature" risk explicitly prohibited by CLAUDE.md.
7. **Add automated duplicate-receipt detection** in the upload pipeline to prevent double evidence/transaction suggestions.
8. **Clarify in-product messaging on AI memory vs. chat archive** so users don't assume the AI "remembers" past conversations beyond learned vendor patterns.
9. **Audit and likely deprecate the legacy `ai_learned_categories`/`ai_learned_customers`/`ai_learned_vendors`/`ai_transaction_patterns` tables** if `ocr_learned_patterns` has fully superseded them — reduces schema confusion and audit surface.
10. **Rebrand `package.json` `name` field** from `react-example` to a MyKerani-specific identifier — small but visible to anyone inspecting build artifacts.
11. **Add multi-receipt batch upload** to the chat attachment and Dokumen upload flows.
12. **Independently load-test multi-page bank statement OCR extraction** before promoting that pipeline to "completed" status.
13. **Quantify Knowledge Bank coverage** (row count, gap-resolution rate) to know whether HQ curation is keeping pace with `knowledge_bank_gaps` growth.
14. **Formalize a confidence-score calibration review** — current confidence is occurrence-count heuristic, not statistically validated; consider periodic sampling against actual user-correction rates.
15. **Add a pre-release "fresh DB rebuild" smoke test** (run `/api/admin/db/initialize` against an empty database and verify the app boots clean) to catch schema-tracking gaps like #1 automatically going forward.
16. **Review the merge of `evidence_documents`-based RLS hardening** for `get_workspace_storage_usage()` (done this engagement) against any other SECURITY DEFINER functions in the schema for the same "no caller ownership check" pattern.
17. **Document the role taxonomy and permission matrix** in user-facing HQ console help text — currently implicit in code only.
18. **Add automated regression tests** around the AI suggest/confirm/learn loop — currently verified manually/by user report; a flaky regression here directly undermines the core product promise.
19. **Tighten Chip Asia webhook failure handling** — confirm retry/idempotency behavior on duplicate or out-of-order webhook delivery (not independently verified this audit).
20. **Plan a versioning strategy** — move off `0.0.0` to real semantic versioning ahead of any external rollout, tied to migration/schema version tracking for support purposes.

---

## 19. PROJECT HEALTH SCORE

| Dimension | Score (/10) | Rationale |
|---|---|---|
| User Experience | 7 | Core chat-first flow is strong and on-vision; several previously-dead buttons/flows recently fixed; still some friction around bank statements and storage providers |
| Architecture | 8 | Clean tenant/workspace model, consistent RLS pattern, clear separation of audit vs. event logs, AI Router abstraction is well-designed |
| Database | 6.5 | Sound schema and RLS posture overall, but the undocumented `payment_gateway_settings` table and recurring RLS gaps are real, recurring risk patterns |
| Security | 7 | Strong RLS-by-default culture and SECURITY DEFINER hardening practice (evidenced by this engagement's fixes), but the discovery method (user complaint, not proactive audit) is a process gap |
| AI | 7.5 | Suggest→Confirm→Learn loop is genuinely implemented end-to-end with real multi-provider routing and real pattern learning; "Situation Bank" naming gap and lack of semantic memory are the main shortfalls |
| Financial Engine | 8.5 | Full 14-category taxonomy, commitments, asset/owner transactions, LHDN/bank readiness reports — comprehensive and clearly the most mature subsystem |
| OCR | 7 | Functional and wired into both receipts and now (this engagement) chat attachments; limited by general-purpose vision LLM accuracy rather than a specialized OCR model |
| Reporting | 8 | Full export format coverage (CSV/Excel/PDF/JSON), statutory-readiness reports, real data behind every report |
| HQ | 7.5 | Comprehensive control plane (AI Router, billing, customers, CMS, audit) — payment gateway RLS gap was a notable blind spot now resolved |
| **Overall** | **7.5 / 10** | A genuinely substantial, real (non-mock) financial product with a coherent architecture and an authentically-implemented AI core loop, held back primarily by schema-tracking discipline, a cluster of type errors, and one materially underdeveloped pipeline (bank statements) |

---

## 20. EXECUTIVE SUMMARY

**What is working well:** The product's central differentiator — AI Suggests → User Confirms → AI Learns — is not aspirational marketing copy, it is a real, working loop: a user can speak or photograph a transaction, have it OCR'd/transcribed, see an AI-proposed classification informed by both their own confirmed history and an HQ-curated cross-tenant knowledge bank, and confirm or correct it, with that confirmation measurably improving future suggestions. The financial engine itself is comprehensive (full 14-category taxonomy, evidence packages, compliance-readiness reports), multi-tenant isolation is consistently enforced via RLS, and the HQ control plane gives the platform operator real levers (AI provider routing, billing, customer management) without ever touching customer financial data ownership — in direct compliance with the locked Data Ownership Rule in CLAUDE.md.

**What is not working / underdeveloped:** Bank statement reconciliation lags significantly behind receipt processing. Two non-trivial RLS gaps (payment settings, resource wallets) went undetected until users reported visible breakage — a pattern that should not repeat. 29 TypeScript errors persist, mostly in one file's tab-state typing, representing latent (if currently non-fatal) bugs. The `payment_gateway_settings` table's absence from migration history is a silent disaster-recovery risk.

**What is missing:** A feature literally matching "Situation Bank" as requested in this audit's structure does not exist — only the functionally-adjacent Knowledge Bank. BYOS storage provider integrations have UI but unverified depth. There's no proactive, automated RLS-coverage test, no fresh-database rebuild smoke test, and no automated regression suite around the AI confirm/learn loop — all of which would have caught this engagement's bugs before users did.

**What should be done next:** In order — version-control the missing payment settings table, run a full proactive RLS audit across all 57 tables, burn down the 29 TypeScript errors (especially the `FinancialRecordsConsole.tsx` cluster), bring bank statement processing to parity with receipts, and explicitly resolve the Situation Bank naming/scope question with stakeholders before assuming it's either done or not needed. These five actions address the highest-risk and highest-ambiguity gaps identified in this audit with the least relative effort.
