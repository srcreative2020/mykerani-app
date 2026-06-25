# MYKERANI Financial Profile Enhancement — Implementation Blueprint

**Status:** DESIGN REVIEW — AWAITING OWNER APPROVAL
**Date:** 2026-06-26
**Author:** Opencode Agent
**Locked Requirements Source:** Owner-approved Financial Profile Enhancement principles (external specification)

---

## 1. CURRENT ARCHITECTURE REVIEW

### 1.1 Existing Profile Tables

The current Financial Profile module spans 6 Supabase tables across 3 migrations:

| Table | Migration | Key | Purpose |
|-------|-----------|-----|---------|
| `personal_profiles` | `20260618120000` | `workspace_id` (1:1) | Personal identity: name, DOB, marital status, occupation, monthly income, dependents count, notes |
| `business_profiles` | `20260618120000` | `workspace_id` (1:1) | Legacy single-business profile: industry, branch name, business type, registration no, notes |
| `businesses` | `20260622000000` | `id` (1:N) | Multi-business: business name, industry, type, registration no, notes, is_active |
| `business_branches` | `20260622000000` | `id` (1:N per business) | Branches per business: branch name, location, is_active |
| `vehicles` | `20260618120000` | `id` (1:N) | Vehicle registry: name, plate number, vehicle type, ownership (PERSONAL/BUSINESS), is_active |
| `dependents` | `20260618120000` | `id` (1:N) | Family dependents: name, relationship, date of birth |
| `asset_purchases` | `20260618130000` | `id` (1:N) | Asset purchases: asset name, category, amount, date, vendor, notes |
| `owner_transactions` | `20260618130000` | `id` (1:N) | Owner equity: type (CAPITAL_INJECTION/DRAWING), amount, date, description |

All tables are workspace-scoped via `workspace_id` FK to `workspaces`, with RLS policies enforcing tenant isolation (hardened in `20260801000000`).

### 1.2 Existing Service Layer

`src/lib/profileData.ts` (387 lines) provides full CRUD for all 6 profile entity types. The pattern is:
- `canPersist(workspaceId, isMockUser)` gate → Supabase path vs localStorage fallback
- Each entity has load/add/update/delete functions
- Snake_case ↔ camelCase mapping at the service boundary
- No RPCs — direct table reads/writes via the Supabase client

`src/lib/assetOwnerData.ts` (253 lines) provides CRUD for `asset_purchases` and `owner_transactions` using the same dual-path pattern, but reads via RPCs (`get_asset_purchases`, `get_owner_transactions`) for SECURITY DEFINER membership checks.

### 1.3 Existing UI

The profile UI lives in `OwnerDashboard.tsx` under `morePage === "myProfile"` (lines 3187–3507), containing 11 card sections:
1. Account header (name, email, mobile, alternate number)
2. Intro note (fields are optional, more data = smarter AI)
3. Profil Peribadi (personal profile fields)
4. Profil Perniagaan (multi-business CRUD + branch management)
5. Maklumat Syarikat (company master data: registration, tax, industry, address, billing/support contacts)
6. Save Profiles button
7. Kenderaan (vehicles with PERSONAL/BUSINESS ownership)
8. Tanggungan (dependents)
9. Belian Aset (asset purchases — read-only, auto-populated by AI)
10. Transaksi Pemilik (owner transactions — read-only, auto-populated by AI)
11. Footer note (loan info in existing Hutang module)

`StaffHomeScreen.tsx` shows a **read-only** subset: personal profile summary card + workspace name. Staff cannot edit profile data.

### 1.4 Existing AI Context Pipeline

The AI context is assembled **client-side** at each call site and sent as a flat `financialContext` object to `/api/ai/assistant`. The server injects it into the system prompt as 11 numbered sections:

| Server Prompt Section | Source | Sent by OwnerDashboard `sendChat`? | Sent by StaffHomeScreen `sendChat`? |
|----------------------|--------|-------------------------------------|--------------------------------------|
| Workspace/Tenant identity | `activeWorkspace`/`activeTenant` | ✅ | ✅ |
| 1. Financial Records | `financialContext.financialEvents` | ✅ | ✅ |
| 2. Cash Accounts | `financialContext.cashAccounts` | ❌ NOT SENT | ❌ NOT SENT |
| 3. Bank Accounts | `financialContext.bankAccounts` | ❌ NOT SENT | ❌ NOT SENT |
| 4. Debt Records | `financialContext.debtRecords` | ❌ NOT SENT | ❌ NOT SENT |
| 5. Recurring Commitments | `financialContext.financialCommitments` | ❌ NOT SENT | ❌ NOT SENT |
| 6. Evidence Packages | `financialContext.financialEvidencePackages` | ❌ NOT SENT | ❌ NOT SENT |
| 7. OCR Learned Patterns | `financialContext.ocrLearnedPatterns` | ❌ NOT SENT | ❌ NOT SENT |
| 8. Personal Profile | `financialContext.personalProfile` | ✅ | ✅ |
| 9. Business Profile(s) | `financialContext.businesses` (fallback: `businessProfile`) | ✅ | ✅ (sends both) |
| 10. Vehicles | `financialContext.vehicles` | ✅ | ✅ |
| 11. Dependents | `financialContext.dependents` | ✅ | ✅ |

**Critical finding:** Only 5 of 11 context sections are actually populated by the call sites. Sections 2–7 (cash accounts, bank accounts, debts, commitments, evidence packages, OCR patterns) are present in the server prompt but receive `[]` because no call site includes them in the `financialContext` payload.

### 1.5 Existing Financial Tables (Non-Profile)

These tables already exist and hold transaction-level financial data, loaded by `FinancialRecordsContext`:

| Table | Loaded By | Data |
|-------|-----------|------|
| `income_records` | FinancialRecordsContext → `financialEvents` | Income transactions |
| `expense_records` | FinancialRecordsContext → `financialEvents` | Expense transactions |
| `receivables` | FinancialRecordsContext → `financialEvents` | Outstanding invoices |
| `payables` | FinancialRecordsContext → `financialEvents` | Outstanding bills |
| `debts` | FinancialRecordsContext → `debtRecords` | Loans |
| `bank_accounts` | FinancialRecordsContext → `bankAccounts` | Bank account registry |
| `cash_accounts` | FinancialRecordsContext → `cashAccounts` | Cash box registry |
| `financial_commitments` | FinancialRecordsContext → `financialCommitments` | Recurring obligations |
| `financial_evidence_packages` | FinancialRecordsContext → `financialEvidencePackages` | Document evidence links |
| `ocr_learned_patterns` | FinancialRecordsContext → `ocrLearnedPatterns` | AI learning memory |
| `general_ledger_categories` | FinancialRecordsContext → category map | Chart of accounts |

These are transaction-level tables, NOT profile/repository tables. The Financial Profile Enhancement must NOT duplicate or replace these — it must provide context TO them.

---

## 2. CURRENT WEAKNESSES

### 2.1 Fragmented AI Context Assembly

The `financialContext` object is constructed ad-hoc at each call site with no shared builder. Four call sites exist, each sending a different subset:

| Call Site | Fields Sent | Missing vs. Full Set |
|-----------|-------------|----------------------|
| OwnerDashboard `sendChat` | activeTenant, activeWorkspace, financialEvents, personalProfile, businesses, vehicles, dependents | cashAccounts, bankAccounts, debtRecords, financialCommitments, financialEvidencePackages, ocrLearnedPatterns, businessBranches |
| OwnerDashboard `sendSupport` | activeTenant, activeWorkspace, financialEvents | Everything except identity + events |
| StaffHomeScreen `sendChat` | activeTenant, activeWorkspace, financialEvents, personalProfile, businessProfile, businesses, vehicles, dependents | cashAccounts, bankAccounts, debtRecords, financialCommitments, financialEvidencePackages, ocrLearnedPatterns, businessBranches |
| StaffHomeScreen `sendSupport` | activeTenant, activeWorkspace, financialEvents | Everything except identity + events |

**Impact:** The AI never sees the user's bank accounts, cash accounts, debts, commitments, evidence, or learned patterns when generating transaction suggestions. This means the AI cannot:
- Suggest which bank/cash account a transaction belongs to
- Detect internal transfers (needs bank account awareness)
- Consider existing debt obligations when advising
- Factor in recurring commitments
- Reference previously confirmed patterns (its own learning memory)

### 2.2 Business Branches Are Invisible to AI

`business_branches` are collected, stored, and editable in the UI. But they are:
- Never sent in `financialContext` by any call site
- Not mentioned in any section of the server prompt
- Only used client-side post-AI by `matchOwnBusinessAndBranch()` for business/branch pre-fill

The AI has no awareness of branches when generating suggestions. It cannot suggest "this expense belongs to the KL branch" because it doesn't know branches exist.

### 2.3 No Central Context Builder

There is no `buildFinancialContext()` function. Each screen manually assembles the object. When a new profile entity is added, every call site must be individually updated — and history shows they weren't (sections 2–7 have been empty since launch).

### 2.4 Profile Repositories Missing

The locked requirements specify the Financial Profile must be a complete Financial Context Repository. Current repositories vs. required:

| Repository | Exists? | Current State |
|-----------|---------|---------------|
| Personal | ✅ | `personal_profiles` table — complete |
| Family/Dependents | ✅ | `dependents` table — complete |
| Businesses | ✅ | `businesses` table — complete |
| Branches | ✅ | `business_branches` table — exists but not sent to AI |
| Vehicles | ✅ | `vehicles` table — complete |
| Bank Accounts | ✅ | `bank_accounts` table — exists, loaded by FinancialRecordsContext, NOT sent to AI |
| Loans/Debts | ✅ | `debts` table — exists, loaded by FinancialRecordsContext, NOT sent to AI |
| Financial Commitments | ✅ | `financial_commitments` table — exists, loaded by FinancialRecordsContext, NOT sent to AI |
| Asset Purchases | ✅ | `asset_purchases` table — exists, recently migrated to Supabase |
| Owner Transactions | ✅ | `owner_transactions` table — exists, recently migrated to Supabase |
| Staff | ✅ | `user_role_assignments` table — exists, used by PermissionContext |
| Properties | ❌ | No table exists |
| Insurance | ❌ | No table exists |
| Investments | ❌ | No table exists |
| Customers | ⚠️ | `receivables.customer_name` is free-text, no customer master table |
| Suppliers | ⚠️ | `payables.vendor_name` is free-text, no supplier master table |
| Internal Transfer Context | ❌ | `internalTransferDetection.ts` works on raw amounts but has no profile awareness |
| Financial Evidence | ✅ | `financial_evidence_packages` table — exists, NOT sent to AI |

### 2.5 Customer/Supplier Data is Free-Text

Receivables use `customer_name VARCHAR(255)` — no FK to a customer master table. Payables use `vendor_name VARCHAR(255)` — no FK to a supplier master table. This means:
- AI cannot reliably match transactions to known customers/suppliers
- No customer 360 view at the tenant level
- Duplicate customer names are not detected
- Customer/supplier history cannot be aggregated

### 2.6 No Evidence Attachment on Profile Entities

Financial Evidence Packages (`financial_evidence_packages`) can be linked to transactions (income/expense/receivable/payable/debt/commitment). But there is no way to attach evidence to profile entities — e.g., attaching a vehicle registration document to a vehicle, or an insurance policy to an insurance record.

### 2.7 No Financial Completeness Reminder for Profile Data

`financialCompletenessEngine.ts` judges completeness of financial RECORDS (category coverage, bank coverage, evidence coverage, historical coverage). It does NOT judge profile completeness — e.g., "you have 3 businesses but no bank accounts linked" or "you have vehicles but no insurance records."

---

## 3. GAP ANALYSIS

### 3.1 Critical Gaps (Must Fix)

| ID | Gap | Impact | Category |
|----|-----|--------|----------|
| G-01 | No central `buildFinancialContext()` function | AI context assembled differently at each call site; sections 2-7 always empty | Architecture |
| G-02 | Bank accounts, cash accounts, debts, commitments, evidence, OCR patterns not sent to AI | AI cannot suggest account assignment, detect internal transfers, consider debt obligations, reference learning memory | AI Context |
| G-03 | Business branches not sent to AI | AI cannot suggest branch-level attribution for multi-branch businesses | AI Context |
| G-04 | No customer master table | Customer matching is unreliable; no tenant-level customer 360 | Master Data |
| G-05 | No supplier master table | Supplier matching is unreliable; no supplier history aggregation | Master Data |

### 3.2 High Gaps (Should Fix)

| ID | Gap | Impact | Category |
|----|-----|--------|----------|
| G-06 | No properties repository | Property-related transactions (rental income, property maintenance) cannot be contextually matched | Repository |
| G-07 | No insurance repository | Insurance premium transactions cannot be matched to policies; no insurance awareness in AI suggestions | Repository |
| G-08 | No investments repository | Investment-related income (dividends, capital gains) cannot be distinguished from business income | Repository |
| G-09 | No evidence attachment on profile entities | Cannot attach documents (registration certs, insurance policies, investment statements) to profile records | Attachment |
| G-10 | No profile completeness reminder | Users don't know their profile is incomplete; AI context quality silently degrades | Completeness |

### 3.3 Medium Gaps (Enhance)

| ID | Gap | Impact | Category |
|----|-----|--------|----------|
| G-11 | Internal transfer detection has no profile awareness | Cannot distinguish "transfer between my business accounts" from "transfer between personal and business" | AI Context |
| G-12 | No many-to-many relationship between vehicles and businesses | A vehicle owned by BUSINESS can serve multiple branches; current schema is 1:1 (vehicle → ownership) | Relationship |
| G-13 | No many-to-many relationship between bank accounts and businesses | A bank account may serve multiple businesses; current schema has no business link on bank_accounts | Relationship |
| G-14 | Profile data not visible to Staff in edit mode | Staff can only view personal profile summary; cannot contribute to profile enrichment | Owner-Staff |
| G-15 | Staff `sendChat` sends `businessProfile` (legacy) alongside `businesses` | Potential confusion if both are populated with different data | Consistency |

### 3.4 Low Gaps (Polish)

| ID | Gap | Impact | Category |
|----|-----|--------|----------|
| G-16 | No "default business" concept on workspace | AI must guess which business a transaction belongs to when multiple exist | UX |
| G-17 | `financialContext` shape is untyped | No TypeScript interface validates the payload; additions/removals are silent | Type Safety |
| G-18 | `sendSupport` sends minimal context (no profile) | Support AI cannot personalize responses with user's business context | AI Context |

---

## 4. EXISTING REUSABLE IMPLEMENTATION

Before building anything new, the following existing implementations must be REUSED, not duplicated:

### 4.1 Reusable Tables (No New Tables Needed)

| Table | Reuse For |
|-------|-----------|
| `personal_profiles` | Personal repository — complete |
| `businesses` | Business repository — complete |
| `business_branches` | Branch repository — complete (just needs AI wiring) |
| `vehicles` | Vehicle repository — complete |
| `dependents` | Family repository — complete |
| `bank_accounts` | Bank account repository — complete (already loaded by FinancialRecordsContext) |
| `cash_accounts` | Cash account repository — complete (already loaded by FinancialRecordsContext) |
| `debts` | Loan repository — complete (already loaded by FinancialRecordsContext) |
| `financial_commitments` | Commitment repository — complete (already loaded by FinancialRecordsContext) |
| `financial_evidence_packages` | Evidence attachment — complete (extend to profile entities) |
| `asset_purchases` | Asset repository — complete |
| `owner_transactions` | Owner equity repository — complete |
| `user_role_assignments` | Staff repository — complete |
| `ocr_learned_patterns` | AI learning memory — complete |

### 4.2 Reusable Services

| Service | Reuse For |
|---------|-----------|
| `src/lib/profileData.ts` | All profile CRUD — extend, don't replace |
| `src/lib/assetOwnerData.ts` | Asset/owner transaction CRUD — already migrated |
| `src/lib/businessMatching.ts` | Business/branch matching for AI suggestions — extend with customer/supplier matching |
| `src/lib/internalTransferDetection.ts` | Internal transfer detection — extend with profile awareness |
| `src/lib/transactionRecoveryEngine.ts` | Recovery suggestions — extend with profile context |
| `src/lib/financialCompletenessEngine.ts` | Completeness scoring — extend with profile completeness dimensions |

### 4.3 Reusable Context Providers

| Provider | Reuse For |
|----------|-----------|
| `FinancialRecordsContext` | Already loads bank accounts, cash accounts, debts, commitments, evidence, OCR patterns — these just need to flow into `financialContext` |
| `PermissionContext` | Already manages role assignments — reuse for Staff profile access control |
| `AuditContext` | Already provides `writeAuditLog` — reuse for all profile mutations |
| `NotificationContext` | Already provides notification generation — reuse for profile completeness reminders |

### 4.4 Reusable UI Patterns

| Pattern | Source | Reuse For |
|---------|--------|-----------|
| Multi-entity CRUD card (businesses + branches) | OwnerDashboard lines 3253-3360 | Template for new repositories (properties, insurance, investments, customers, suppliers) |
| Read-only auto-populated list (asset purchases, owner transactions) | OwnerDashboard lines 3475-3503 | Template for AI-populated profile entities |
| Profile save with loading state | OwnerDashboard `saveProfiles` handler | Reuse for all profile saves |
| `canPersist()` gate | `profileData.ts` line 74 | Reuse for all new repositories |

### 4.5 Reusable Server-Side Components

| Component | Reuse For |
|-----------|-----------|
| Server prompt sections 1-11 | Already defined in `server.ts:1405-1455` — just need to populate sections 2-7 from the client |
| `fetchKnowledgeBankMatches()` | Already queries cross-tenant knowledge — reuse as-is |
| `evaluateAccountingSuggestion()` | Post-LLM accounting rules layer — reuse as-is |
| `generateFallbackAssistantResponse()` | Fallback when AI is unavailable — extend to read profile data |

---

## 5. REQUIRED ARCHITECTURE IMPROVEMENTS

### 5.1 Central Financial Context Builder

Create ONE function that assembles the complete `financialContext` object from all available data sources. All call sites must use this builder instead of manually constructing the payload.

**New file:** `src/lib/buildFinancialContext.ts`

**Purpose:** Single source of truth for what the AI sees. Eliminates the "forgot to include bank accounts" class of bugs permanently.

**Signature:**
```typescript
interface FinancialContextPayload {
  // Identity
  activeTenant: { id: string; name: string; category?: string };
  activeWorkspace: { id: string; name: string; workspaceType?: string };
  // Financial Records (from FinancialRecordsContext)
  financialEvents: FinancialEvent[];
  cashAccounts: CashAccount[];
  bankAccounts: BankAccount[];
  debtRecords: DebtRecord[];
  financialCommitments: FinancialCommitment[];
  financialEvidencePackages: FinancialEvidencePackage[];
  ocrLearnedPatterns: OcrLearnedPattern[];
  // Profile Repository (from profileData.ts + assetOwnerData.ts)
  personalProfile: PersonalProfile;
  businesses: Business[];
  businessBranches: Record<string, BusinessBranch[]>; // keyed by businessId
  vehicles: Vehicle[];
  dependents: Dependent[];
  assetPurchases: AssetPurchase[];
  ownerTransactions: OwnerTransaction[];
  // New repositories (from new service functions)
  customers?: Customer[];
  suppliers?: Supplier[];
  properties?: PropertyRecord[];
  insurancePolicies?: InsurancePolicy[];
  investments?: Investment[];
}

function buildFinancialContext(params: {
  activeTenant: Tenant;
  activeWorkspace: Workspace;
  financialEvents: FinancialEvent[];
  cashAccounts: CashAccount[];
  bankAccounts: BankAccount[];
  debtRecords: DebtRecord[];
  financialCommitments: FinancialCommitment[];
  financialEvidencePackages: FinancialEvidencePackage[];
  ocrLearnedPatterns: OcrLearnedPattern[];
  personalProfile: PersonalProfile;
  businesses: Business[];
  vehicles: Vehicle[];
  dependents: Dependent[];
  assetPurchases: AssetPurchase[];
  ownerTransactions: OwnerTransaction[];
  workspaceId: string;
  isMockUser: boolean;
}): Promise<FinancialContextPayload>;
```

The builder loads `businessBranches`, `customers`, `suppliers`, `properties`, `insurancePolicies`, and `investments` from Supabase (or returns empty arrays if not yet migrated). This means the builder is the ONLY place that needs updating when a new repository is added — all call sites automatically benefit.

### 5.2 New Repository Tables (Minimal)

Only create tables for repositories that DON'T already exist. Do NOT recreate bank accounts, debts, vehicles, etc.

| New Table | Purpose | Columns (summary) |
|-----------|---------|-------------------|
| `profile_customers` | Customer master data | `workspace_id, name, email, phone, address, notes, is_active` |
| `profile_suppliers` | Supplier master data | `workspace_id, name, email, phone, address, notes, is_active` |
| `profile_properties` | Property/real estate registry | `workspace_id, property_name, property_type, address, purchase_value_myr, notes, is_active` |
| `profile_insurance` | Insurance policy registry | `workspace_id, policy_name, insurance_type, provider, policy_number, premium_amount_myr, premium_frequency, coverage_amount_myr, start_date, end_date, notes, is_active` |
| `profile_investments` | Investment registry | `workspace_id, investment_name, investment_type, institution, account_number, current_value_myr, notes, is_active` |

All follow the proven `businesses`/`vehicles` pattern: UUID PK, `workspace_id` FK, `is_active` flag, timestamp triggers, RLS via `get_tenant_id()`, GRANT to `authenticated`.

### 5.3 Profile Evidence Link Extension

Extend `financial_evidence_packages` to support profile entities as link targets. Currently the table has `related_record_type` (VARCHAR) and `related_record_id` (VARCHAR) — both are free-text. No schema change is needed. Just extend the client-side `linkEvidenceToRecord()` function in `FinancialRecordsContext` to accept new `relatedRecordType` values:
- `"VEHICLE"`, `"PROPERTY"`, `"INSURANCE"`, `"INVESTMENT"`, `"CUSTOMER"`, `"SUPPLIER"`

This reuses the existing table, existing RLS, existing storage bucket, and existing audit trail.

### 5.4 Profile Completeness Engine Extension

Extend `financialCompletenessEngine.ts` with a new function `computeProfileCompleteness()` that judges:
- Has at least 1 business? (for business workspaces)
- Has at least 1 bank account?
- Has vehicles linked to businesses (if multi-business)?
- Has insurance policies (if has vehicles/properties)?
- Has customer master records (if has receivables)?

This is additive — the existing `computeFinancialCompleteness()` is untouched.

### 5.5 Server Prompt Extension

Extend the server prompt (in `server.ts`) to add new sections for the new repositories:
- Section 12: Business Branches
- Section 13: Properties
- Section 14: Insurance Policies
- Section 15: Investments
- Section 16: Customer Master
- Section 17: Supplier Master

These are additive sections — existing sections 1-11 are not modified. The server reads from `financialContext` which is now fully populated by the central builder.