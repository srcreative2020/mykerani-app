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

---

## 6. REPOSITORY ARCHITECTURE

### 6.1 Complete Repository Map

After enhancement, the Financial Context Repository contains these repositories, each with unlimited records:

```
Financial Context Repository
├── Personal Repository          → personal_profiles (existing, 1:1 per workspace)
├── Family Repository            → dependents (existing, 1:N)
├── Business Repository          → businesses (existing, 1:N)
│   └── Branch Repository        → business_branches (existing, 1:N per business)
├── Vehicle Repository           → vehicles (existing, 1:N)
├── Asset Repository             → asset_purchases (existing, 1:N)
├── Owner Equity Repository      → owner_transactions (existing, 1:N)
├── Bank Account Repository      → bank_accounts (existing, 1:N, loaded by FinancialRecordsContext)
├── Cash Account Repository      → cash_accounts (existing, 1:N, loaded by FinancialRecordsContext)
├── Loan Repository              → debts (existing, 1:N, loaded by FinancialRecordsContext)
├── Commitment Repository        → financial_commitments (existing, 1:N, loaded by FinancialRecordsContext)
├── Evidence Repository          → financial_evidence_packages (existing, 1:N, extended to profile entities)
├── Learning Memory Repository   → ocr_learned_patterns (existing, 1:N)
├── Staff Repository             → user_role_assignments (existing, 1:N)
├── Customer Repository          → profile_customers (NEW, 1:N)
├── Supplier Repository          → profile_suppliers (NEW, 1:N)
├── Property Repository          → profile_properties (NEW, 1:N)
├── Insurance Repository         → profile_insurance (NEW, 1:N)
└── Investment Repository        → profile_investments (NEW, 1:N)
```

### 6.2 Repository Design Principles

Each repository follows these locked requirements:

1. **All information is optional** — no field is required to save a record (except workspace_id)
2. **Unlimited records** — no artificial limit on rows per workspace
3. **Multiple input methods** — records can be created via:
   - Manual form entry in the profile UI
   - AI Chat suggestion → User Confirm → Save (auto-populated)
   - OCR document processing → User Confirm → Save
   - Bank statement import → User Confirm → Save
4. **AI Suggest → User Confirm → Save** — no profile record is ever created without explicit user confirmation (per MYKERANI Constitution)
5. **Financial Evidence Attachment** — every repository entity can have evidence packages attached
6. **Many-to-many relationships** — see Section 10 for relationship architecture
7. **Context only** — repository data provides context TO the AI and financial engines; it never creates or modifies financial transactions automatically
8. **No redundancy** — bank accounts, cash accounts, debts, and commitments are NOT duplicated; they remain in their existing tables and are loaded by `FinancialRecordsContext`. The Financial Profile simply reads them for context.

### 6.3 New Tables — Column Specifications

#### `profile_customers`
```sql
CREATE TABLE profile_customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
```
Index: `idx_profile_customers_workspace` on `workspace_id`
RLS: workspace-in-tenant OR HQ (same pattern as `businesses`)

#### `profile_suppliers`
```sql
CREATE TABLE profile_suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
```
Same index/RLS pattern.

#### `profile_properties`
```sql
CREATE TABLE profile_properties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  property_name VARCHAR(255) NOT NULL,
  property_type VARCHAR(50),  -- 'RESIDENTIAL', 'COMMERCIAL', 'LAND', 'OTHER'
  address TEXT,
  purchase_value_myr NUMERIC(19,4),
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
```

#### `profile_insurance`
```sql
CREATE TABLE profile_insurance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  policy_name VARCHAR(255) NOT NULL,
  insurance_type VARCHAR(50),  -- 'LIFE', 'HEALTH', 'VEHICLE', 'PROPERTY', 'BUSINESS', 'OTHER'
  provider VARCHAR(255),
  policy_number VARCHAR(100),
  premium_amount_myr NUMERIC(19,4),
  premium_frequency VARCHAR(20),  -- 'MONTHLY', 'QUARTERLY', 'YEARLY', 'ONE-TIME'
  coverage_amount_myr NUMERIC(19,4),
  start_date DATE,
  end_date DATE,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
```

#### `profile_investments`
```sql
CREATE TABLE profile_investments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  investment_name VARCHAR(255) NOT NULL,
  investment_type VARCHAR(50),  -- 'STOCK', 'UNIT_TRUST', 'ETF', 'FIXED_DEPOSIT', 'CRYPTO', 'REAL_ESTATE', 'OTHER'
  institution VARCHAR(255),
  account_number VARCHAR(100),
  current_value_myr NUMERIC(19,4),
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
```

All 5 new tables follow the exact same pattern: UUID PK, `workspace_id` FK with CASCADE, `is_active` flag, timestamp triggers, and RLS policies matching the `businesses` table pattern (SELECT/INSERT for workspace members, UPDATE for workspace members + HQ, DELETE for TENANT_OWNER/HQ_OWNER only).

---

## 7. DATA FLOW ARCHITECTURE

### 7.1 Current Data Flow (Broken)

```
User Input (Chat/OCR/Upload)
       ↓
Client builds financialContext MANUALLY (incomplete)
  OwnerDashboard.sendChat:  { events, profile, businesses, vehicles, dependents }
  StaffHomeScreen.sendChat: { events, profile, businessProfile, businesses, vehicles, dependents }
  (MISSING: bankAccounts, cashAccounts, debts, commitments, evidence, patterns, branches)
       ↓
POST /api/ai/assistant { query, financialContext, userId }
       ↓
Server builds system prompt from financialContext (sections 2-7 get [])
       ↓
LLM generates suggestion (BLIND to bank accounts, debts, commitments, patterns)
       ↓
Client receives suggestion
       ↓
User confirms → FinancialRecord saved → AI learns pattern
```

### 7.2 Enhanced Data Flow (Target)

```
User Input (Chat/OCR/Upload/Voice/Camera)
       ↓
Client calls buildFinancialContext() — SINGLE SHARED BUILDER
  Loads ALL repositories:
    ✅ events, cashAccounts, bankAccounts, debts, commitments, evidence, patterns
    ✅ personalProfile, businesses, businessBranches, vehicles, dependents
    ✅ assetPurchases, ownerTransactions
    ✅ customers, suppliers, properties, insurancePolicies, investments
       ↓
POST /api/ai/assistant { query, financialContext, userId }
       ↓
Server builds system prompt — ALL 17 SECTIONS POPULATED
       ↓
LLM generates suggestion with FULL CONTEXT
  - Can suggest bank account assignment
  - Can detect internal transfers (knows accounts)
  - Can consider debt obligations
  - Can reference learned patterns (memory)
  - Can suggest branch attribution
  - Can match customers/suppliers by name
  - Can reference insurance premiums
  - Can distinguish investment income from business income
       ↓
Client receives suggestion
       ↓
Post-LLM enrichment (existing):
  - businessMatching.ts → pre-fills businessId/branchId
  - evaluateAccountingSuggestion() → accounting recommendation banner
  - NEW: customerMatching.ts → pre-fills customerId if name matches master
  - NEW: supplierMatching.ts → pre-fills supplierId if name matches master
       ↓
User confirms → FinancialRecord saved → AI learns pattern → tenant_activity_log updated
```

### 7.3 Input Engine Unified Flow

Every input engine follows the SAME flow:

```
┌─────────────────────────────────────────────────────────────────────┐
│ INPUT ENGINE (AI Chat / Voice / OCR / Camera / Receipt / Invoice /  │
│ Bank Statement / Quotation / Contract / PDF / Image / Document)    │
└──────────────────────────┬──────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────────────┐
│ buildFinancialContext() — loads ALL repositories from workspace      │
│ Returns: FinancialContextPayload (typed, complete)                   │
└──────────────────────────┬───────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────────────┐
│ EXISTING FINANCIAL RECORDS — from FinancialRecordsContext            │
│ (events, accounts, debts, commitments, evidence, patterns)          │
└──────────────────────────┬───────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────────────┐
│ AI SUGGESTION — LLM with full context (17 prompt sections)           │
└──────────────────────────┬───────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────────────┐
│ USER CONFIRMATION — User reviews and confirms (never auto-saved)     │
└──────────────────────────┬───────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────────────┐
│ FINANCIAL RECORD SAVED — via FinancialRecordsContext                  │
└──────────────────────────┬───────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────────────┐
│ AI LEARNING — OCR pattern learned, tenant_activity_log updated         │
└──────────────────────────────────────────────────────────────────────┘
```

This flow is IDENTICAL across every input engine. The only variable is HOW the user inputs data (text, voice, image, document) — the context assembly, AI call, confirmation, and learning steps are shared.

---

## 8. AI CONTEXT ARCHITECTURE

### 8.1 Context Priority Order (Existing — Preserved)

The server prompt already defines a SUGGEST-FIRST priority order. This order is preserved:

1. **User Profile** (personal, business, vehicles, dependents) — highest priority
2. **Workspace/Tenant** identity
3. **Financial Events** (existing records)
4. **OCR Learned Patterns** (tenant's own learning memory)
5. **Knowledge Bank** (cross-tenant curated scenarios)
6. **World knowledge** (LLM's general knowledge)

### 8.2 Context Matching Engines

Each repository feeds a specific matching capability:

| Repository | AI Matching Capability | Existing Engine? |
|-----------|----------------------|-----------------|
| Businesses + Branches | Business/branch attribution on transactions | ✅ `businessMatching.ts` |
| Vehicles | Vehicle ownership disambiguation (personal vs business) | ✅ Server prompt section 10 |
| Customers | Customer name → customer master record match | ❌ NEW: `customerMatching.ts` |
| Suppliers | Supplier name → supplier master record match | ❌ NEW: `supplierMatching.ts` |
| Bank Accounts | Suggest which account a transaction belongs to | ❌ NEW (via populated context) |
| Debts | Reference loan obligations in suggestions | ❌ NEW (via populated context) |
| Commitments | Flag transactions matching recurring obligations | ❌ NEW (via populated context) |
| Properties | Property-related transaction matching | ❌ NEW (via populated context) |
| Insurance | Insurance premium transaction matching | ❌ NEW (via populated context) |
| Investments | Investment income classification | ❌ NEW (via populated context) |
| OCR Patterns | Vendor → category auto-suggest | ✅ Server prompt section 7 + `transactionRecoveryEngine.ts` |

### 8.3 New Matching Engines (Minimal)

Two new lightweight matching functions, modeled on `businessMatching.ts`:

#### `customerMatching.ts`
```typescript
export function matchCustomer(
  text: string,
  customers: Customer[]
): Customer | undefined
```
- Normalizes text and customer names (reuses `normalizeForMatch` from `businessMatching.ts`)
- Returns the first matching active customer by name containment
- Used post-LLM to pre-fill `customerId` on receivable suggestions

#### `supplierMatching.ts`
```typescript
export function matchSupplier(
  text: string,
  suppliers: Supplier[]
): Supplier | undefined
```
- Same pattern for payables

These are pure functions — no DB, no I/O, no React. They run client-side after the AI returns suggestions, exactly like `matchOwnBusinessAndBranch()` does today.

### 8.4 Internal Transfer Context Enhancement

Currently `internalTransferDetection.ts` detects transfers purely by amount+date+account match. The enhancement adds profile awareness:

```typescript
export function detectInternalTransfersWithContext(
  transactions: ImportedBankTransaction[],
  bankAccounts: BankAccount[],
  cashAccounts: CashAccount[],
  businesses: Business[],
  businessBranches: Record<string, BusinessBranch[]>
): InternalTransferMatch[]
```

This enhanced version can determine:
- Transfer between two accounts of the same business → "internal transfer" (exclude from income/expense)
- Transfer between personal and business accounts → "owner transaction" (classify as CAPITAL_INJECTION/DRAWING)
- Transfer between two different businesses → "inter-business transfer" (flag for review)

This does NOT replace the existing `detectInternalTransfers()` — it wraps it with a profile-aware layer. The existing function remains for backward compatibility.

---

## 9. INPUT ENGINE ARCHITECTURE

### 9.1 Input Engine Matrix

| Input Engine | Current Status | Profile Context Used? | Enhancement |
|-------------|---------------|----------------------|-------------|
| AI Chat | ✅ Working | Partial (5/17 sections) | Wire full context via `buildFinancialContext()` |
| Voice Notes | ✅ Working (transcribed to chat) | Same as AI Chat | Inherits enhancement from AI Chat |
| OCR (Receipt/Invoice/Statement) | ✅ Working | Uses `transactionRecoveryEngine` (learned patterns + KB) | Pass full profile context to recovery engine |
| Camera Capture | ✅ Works via OCR pipeline | Same as OCR | Inherits OCR enhancement |
| Receipt Upload | ✅ Works via `FinancialEvidencePackage` | None | Add profile context to upload processing |
| Invoice Upload | ✅ Works via OCR | Same as OCR | Inherits OCR enhancement |
| Bank Statement Upload | ✅ Works via `bankStatementImport` + `HistoricalRecoveryWorkspace` | Uses `transactionRecoveryEngine` + `internalTransferDetection` | Add profile-aware internal transfer detection |
| Quotation Upload | ⚠️ Treated as document | None | No change — quotations are not financial records (out of scope per Constitution) |
| Contract Upload | ⚠️ Treated as document | None | No change — contracts are not financial records (out of scope per Constitution) |
| PDF Upload | ✅ Works via OCR | Same as OCR | Inherits OCR enhancement |
| Image Upload | ✅ Works via OCR | Same as OCR | Inherits OCR enhancement |
| Document Module | ✅ `DocumentsManager` component | None | No change — document module is evidence storage, not transaction creation |

### 9.2 Key Insight: Most Enhancements Are Automatic

Because `buildFinancialContext()` is a single shared function, most input engines automatically benefit from the enhanced context WITHOUT any per-engine changes. The only engines needing direct modification are:

1. **AI Chat** (OwnerDashboard + StaffHomeScreen `sendChat`) — replace manual `financialContext` with `buildFinancialContext()`
2. **Bank Statement Import** — pass profile data to the internal transfer detection
3. **OCR Pipeline** — pass profile data to the recovery engine

All other engines (voice, camera, receipt, invoice, PDF, image) inherit enhancements through the shared AI chat flow.

---

## 10. RELATIONSHIP ARCHITECTURE

### 10.1 Current Relationships (Explicit FKs)

| Entity | Relates To | FK Column | Type |
|--------|-----------|-----------|------|
| `business_branches` | `businesses` | `business_id` | 1:N (business → branches) |
| `income_records` | `businesses` | `business_id` | N:1 (income → business, nullable) |
| `income_records` | `business_branches` | `branch_id` | N:1 (income → branch, nullable) |
| `expense_records` | `businesses` | `business_id` | N:1 (expense → business, nullable) |
| `expense_records` | `business_branches` | `branch_id` | N:1 (expense → branch, nullable) |
| `receivables` | `businesses` | `business_id` | N:1 (receivable → business, nullable) |
| `payables` | `businesses` | `business_id` | N:1 (payable → business, nullable) |
| `debts` | `businesses` | `business_id` | N:1 (debt → business, nullable) |
| `financial_commitments` | `businesses` | `business_id` | N:1 (commitment → business, nullable) |
| `ocr_learned_patterns` | `businesses` | `business_id` | N:1 (pattern → business, nullable) |
| `ocr_learned_patterns` | `business_branches` | `branch_id` | N:1 (pattern → branch, nullable) |
| `financial_evidence_packages` | (free-text) | `related_record_type` + `related_record_id` | Polymorphic |

### 10.2 New Relationships (Explicit FKs)

| Entity | Relates To | FK Column | Type |
|--------|-----------|-----------|------|
| `income_records` | `profile_customers` | `customer_id` (NEW) | N:1 (income → customer, nullable) |
| `receivables` | `profile_customers` | `customer_id` (NEW) | N:1 (receivable → customer, nullable) |
| `expense_records` | `profile_suppliers` | `supplier_id` (NEW) | N:1 (expense → supplier, nullable) |
| `payables` | `profile_suppliers` | `supplier_id` (NEW) | N:1 (payable → supplier, nullable) |

### 10.3 Many-to-Many Relationships (New Junction Tables)

Some relationships are genuinely many-to-many and require junction tables:

#### `vehicle_businesses` (Vehicle ↔ Business)
```sql
CREATE TABLE vehicle_businesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE NOT NULL,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT uniq_vehicle_business UNIQUE (vehicle_id, business_id)
);
```
Purpose: A vehicle can serve multiple businesses (delivery vehicle shared across businesses). The existing `vehicles.ownership` field remains for PERSONAL vehicles (not in this junction).

#### `bank_account_businesses` (Bank Account ↔ Business)
```sql
CREATE TABLE bank_account_businesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE CASCADE NOT NULL,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT uniq_bankacc_business UNIQUE (bank_account_id, business_id)
);
```
Purpose: A bank account may serve multiple businesses. The internal transfer detector uses this to determine if a transfer is inter-business or intra-business.

#### `property_businesses` (Property ↔ Business)
```sql
CREATE TABLE property_businesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID REFERENCES profile_properties(id) ON DELETE CASCADE NOT NULL,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT uniq_property_business UNIQUE (property_id, business_id)
);
```
Purpose: A property can be associated with multiple businesses (e.g., a commercial lot shared by two businesses).

All junction tables follow the same pattern: UUID PK, dual FK with CASCADE, workspace_id for RLS, unique constraint on the pair.

---

## 11. ATTACHMENT ARCHITECTURE

### 11.1 Current Attachment System

The existing `financial_evidence_packages` table uses a polymorphic link pattern:

```
financial_evidence_packages:
  - related_record_type: VARCHAR(50)  -- e.g. "INCOME", "EXPENSE", "RECEIVABLE", "PAYABLE", "DEBT", "COMMITMENT"
  - related_record_id:   VARCHAR(100) -- UUID of the related record
```

This pattern is **extensible by design** — no schema change is needed to attach evidence to new entity types. The `related_record_type` is free-text, so new values can be added without migration.

### 11.2 Extension to Profile Entities

New `related_record_type` values for profile evidence:
- `"VEHICLE"` — vehicle registration documents, photos
- `"PROPERTY"` — property deeds, valuation reports
- `"INSURANCE"` — policy documents, premium receipts
- `"INVESTMENT"` — investment account statements
- `"CUSTOMER"` — customer contracts, KYC documents
- `"SUPPLIER"` — supplier agreements, vendor forms
- `"BUSINESS"` — business registration certificates
- `"BRANCH"` — branch permits, leases
- `"PERSONAL_PROFILE"` — IC/passport copies

### 11.3 Attachment Flow (Reused)

```
User uploads document
       ↓
documentStorage.uploadDocument() → uploads to Supabase Storage bucket
       ↓
Returns file_url
       ↓
linkEvidenceToRecord({ workspaceId, documentType, fileName, fileUrl, relatedRecordType, relatedRecordId })
       ↓
financial_evidence_packages INSERT (polymorphic, RLS-scoped)
       ↓
Audit log written (existing)
```

This flow is **unchanged** — the only addition is new `relatedRecordType` values passed by the UI when attaching evidence to profile entities.

### 11.4 No New Storage Buckets

All evidence files continue to use the existing `evidence-packages` Supabase Storage bucket. No new buckets are needed. RLS on the bucket already enforces tenant isolation via the storage policies defined in migration `20260611000003`.

---

## 12. MASTER DATA ARCHITECTURE

### 12.1 Master Data Principle

Per the locked requirements and `MYKERANI_TENANT_ECOSYSTEM_GOVERNANCE_PRINCIPLE.md` (Master Data Rule): **one authoritative master record per entity across all modules.**

### 12.2 Current Master Data Status

| Entity | Master Table | Used By | Gap |
|--------|-------------|---------|-----|
| Tenant | `tenants` | All modules | ✅ No gap |
| Workspace | `workspaces` | All modules | ✅ No gap |
| User/Staff | `user_role_assignments` | Auth, Permission | ✅ No gap |
| Business | `businesses` | Transactions, OCR, AI | ✅ No gap |
| Branch | `business_branches` | Transactions, OCR | ⚠️ Not sent to AI |
| Vehicle | `vehicles` | Transactions, AI | ✅ No gap |
| Bank Account | `bank_accounts` | Transactions | ⚠️ Not sent to AI |
| Cash Account | `cash_accounts` | Transactions | ⚠️ Not sent to AI |
| Debt | `debts` | Reports, AI | ⚠️ Not sent to AI |
| Commitment | `financial_commitments` | Reports, AI | ⚠️ Not sent to AI |
| Customer | ❌ None | `receivables.customer_name` is free-text | ❌ No master |
| Supplier | ❌ None | `payables.vendor_name` is free-text | ❌ No master |
| Property | ❌ None | N/A | ❌ No master |
| Insurance | ❌ None | N/A | ❌ No master |
| Investment | ❌ None | N/A | ❌ No master |

### 12.3 Master Data Migration Strategy

For customers and suppliers, the migration is **non-breaking**:

1. Create `profile_customers` and `profile_suppliers` tables
2. Add nullable `customer_id` FK to `receivables` and `income_records`
3. Add nullable `supplier_id` FK to `payables` and `expense_records`
4. Existing `customer_name`/`vendor_name` columns remain (backward compatible)
5. A data migration script (run once) extracts distinct customer/supplier names from existing records and creates master entries, then links them back

```sql
-- Example: seed customers from existing receivables
INSERT INTO profile_customers (workspace_id, name)
SELECT DISTINCT workspace_id, customer_name
FROM receivables
WHERE customer_name IS NOT NULL AND customer_name != ''
ON CONFLICT DO NOTHING;
```

After seeding, the AI can match by name and pre-fill the `customer_id`/`supplier_id` FK on new transactions. Existing transactions remain unlinked (no forced migration) — the AI suggests links going forward.

### 12.4 No HQ-Level Customer Master Duplication

HQ already has `get_hq_customer_health_scores` and `get_customer_360` that aggregate tenant-level data. These operate on `tenants` (the tenant IS the customer from HQ's perspective). The new `profile_customers` table is TENANT-LEVEL customer master data (the tenant's own customers) — this is a different entity entirely. No duplication.

---

## 13. ECOSYSTEM IMPACT ANALYSIS

### 13.1 Ecosystem Impact Matrix

| System | Impact | Nature |
|--------|--------|--------|
| HQ Owner | None — HQ operates on tenant-level, not profile-level | No change |
| HQ Staff | None — same as HQ Owner | No change |
| Tenant Owner | Enhanced — full profile UI with new repositories + full AI context | Additive |
| Tenant Staff | Enhanced — read access to profile data + full AI context in chat | Additive |
| Workspace | None — workspace remains the isolation boundary | No change |
| Customer Master Data | NEW — `profile_customers` table | Additive |
| Financial Records | Enhanced — `customer_id`/`supplier_id` FKs (nullable) | Additive, non-breaking |
| AI Credits | None — same credit consumption per AI call | No change |
| OCR Credits | None — same OCR consumption | No change |
| Storage | Minimal — new tables occupy negligible storage | Negligible |
| Resource Wallet | None — no new resource consumption | No change |
| Financial Evidence | Extended — new `relatedRecordType` values | Additive |
| Audit Logs | Extended — new audit triggers on new tables | Additive |
| Notifications | Extended — profile completeness reminders | Additive |
| Approval Workflows | None — profile data doesn't require approval | No change |
| Customer 360 (HQ) | None — HQ Customer 360 operates on tenants, not tenant-customers | No change |
| Support | None — support tickets are tenant-level, not profile-level | No change |
| Reports | Enhanced — more profile context available for report generation | Additive |
| Activity Center | Extended — profile CRUD actions logged to `tenant_activity_log` | Additive |

### 13.2 Disconnected Workflow Check

Per `MYKERANI_ECOSYSTEM_GOVERNANCE_PRINCIPLE.md` §3: "if a workflow becomes disconnected from a system it should plausibly touch, that workflow has FAILED ecosystem review."

| New Workflow | Touches | Connected? |
|-------------|--------|-----------|
| Profile CRUD (new repositories) | Audit, Notifications, Activity Center | ✅ Via existing patterns |
| AI Chat with full context | Financial Records, AI Credits, OCR Credits (if attachment), Activity Center | ✅ All connected |
| Customer/Supplier matching | Financial Records (receivables/payables), AI Suggestions | ✅ Connected |
| Evidence attachment to profile | Storage, Evidence Packages, Audit | ✅ Connected |
| Profile completeness reminder | Notifications, Financial Completeness Engine | ✅ Connected |
| Internal transfer with profile awareness | Bank Accounts, Businesses, AI Suggestions | ✅ Connected |

No disconnected workflows identified.

---

## 14. HQ ↔ TENANT IMPACT

### 14.1 Impact Assessment

| Area | HQ Side | Tenant Side | Sync Needed? |
|------|---------|-------------|--------------|
| Profile tables | HQ can read all via RLS (`is_hq_user()` bypass) | Tenant reads/writes own workspace data | No — RLS handles isolation |
| New repositories | HQ can view tenant's profile data for support/audit | Tenant owns and manages all profile data | No — same pattern as existing |
| Customer/Supplier master | HQ has no equivalent — `profile_customers` is tenant-level only | Tenant manages own customers/suppliers | No — different concepts |
| AI context | HQ uses AI Router settings, not tenant financial context | Tenant uses `buildFinancialContext()` | No — different concerns |
| Audit | New tables need audit triggers (same pattern as existing) | Tenant audit_logs + tenant_activity_log | ✅ Existing patterns |
| Notifications | None | Profile completeness reminders | No |
| RLS | All new tables must have HQ read-all + tenant workspace-scoped policies | Standard | ✅ Per migration plan |

### 14.2 No HQ Duplication

The Financial Profile Enhancement does NOT create any HQ-side equivalent of profile data. The locked requirements specify Financial Profile is the tenant's context repository — HQ does not manage tenant profile data. HQ's existing Customer 360, Health Scores, and Resource Wallet operate on tenant-level aggregates, not tenant profile data.

---

## 15. OWNER ↔ STAFF IMPACT

### 15.1 Owner-Staff Parity Compliance

Per `MYKERANI_OWNER_STAFF_PARITY_RULE.md`: Owner and Staff must NEVER have different financial engines. The Financial Profile Enhancement maintains this:

| Capability | Owner | Staff | Same Engine? |
|-----------|-------|-------|-------------|
| View profile repositories | ✅ Full edit UI | ✅ Read-only view | ✅ Same `profileData.ts` service |
| AI Chat with full context | ✅ `buildFinancialContext()` | ✅ Same builder | ✅ Same function |
| AI Suggestion confirmation | ✅ Can save profile suggestions | ✅ Can save profile suggestions | ✅ Same `FinancialRecordsContext` |
| Evidence attachment | ✅ Can attach to profile entities | ✅ Can attach (if permission allows) | ✅ Same `linkEvidenceToRecord()` |
| Customer/Supplier matching | ✅ Auto-match on suggestions | ✅ Auto-match on suggestions | ✅ Same `customerMatching.ts`/`supplierMatching.ts` |
| Profile completeness reminder | ✅ Receives notifications | ✅ Receives notifications | ✅ Same `NotificationContext` |
| Profile CRUD | ✅ Full create/edit/delete | ⚠️ Read-only by default | ⚠️ Configurable via `hasPermission()` |

### 15.2 Staff Profile Access

Staff currently see a read-only summary of `personalProfile` in the More tab. Enhancement:
- Staff see all profile repositories (businesses, vehicles, customers, suppliers, etc.) in read-only mode
- Staff CAN create/edit profile records if `hasPermission('Financial Records', 'create')` returns true (reuse existing permission matrix)
- Staff chat uses the same `buildFinancialContext()` as Owner — no context asymmetry

### 15.3 Activity Center Logging

All profile CRUD operations (from both Owner and Staff) log to `tenant_activity_log` via `logTenantActivity()`:
- `actionType: 'PROFILE_CREATED'`, `'PROFILE_UPDATED'`, `'PROFILE_DELETED'`
- `module: 'Financial Profile'`
- `description`: includes entity type and name

This extends the existing activity logging pattern already used for financial records.

---

## 16. DATABASE IMPACT

### 16.1 New Tables (5)

| Table | Migration File | Purpose |
|-------|---------------|---------|
| `profile_customers` | `20260803000000_financial_profile_repositories.sql` | Customer master data |
| `profile_suppliers` | Same migration | Supplier master data |
| `profile_properties` | Same migration | Property/real estate registry |
| `profile_insurance` | Same migration | Insurance policy registry |
| `profile_investments` | Same migration | Investment registry |

Each follows the exact `businesses` table pattern:
- UUID PK + `uuid_generate_v4()`
- `workspace_id` FK → `workspaces` with `ON DELETE CASCADE`
- `is_active BOOLEAN DEFAULT true`
- `created_at` + `updated_at` TIMESTAMPTZ with trigger
- RLS: SELECT/INSERT/UPDATE for workspace members, DELETE for TENANT_OWNER/HQ_OWNER only
- GRANT SELECT/INSERT/UPDATE/DELETE to `authenticated`, all to `service_role`
- Index on `workspace_id`

### 16.2 New Junction Tables (3)

| Table | Migration File | Purpose |
|-------|---------------|---------|
| `vehicle_businesses` | `20260803010000_financial_profile_junctions.sql` | Vehicle ↔ Business M:N |
| `bank_account_businesses` | Same migration | Bank Account ↔ Business M:N |
| `property_businesses` | Same migration | Property ↔ Business M:N |

Each follows: UUID PK, dual FK with CASCADE, `workspace_id` for RLS, UNIQUE constraint on the pair, GRANT to `authenticated`.

### 16.3 Column Additions (Existing Tables)

| Table | New Column | Migration File | Type | Nullable |
|-------|-----------|---------------|------|----------|
| `receivables` | `customer_id` | `20260803020000_financial_profile_foreign_keys.sql` | UUID FK → `profile_customers` | YES |
| `payables` | `supplier_id` | Same migration | UUID FK → `profile_suppliers` | YES |
| `income_records` | `customer_id` | Same migration | UUID FK → `profile_customers` | YES |
| `expense_records` | `supplier_id` | Same migration | UUID FK → `profile_suppliers` | YES |

All new columns are nullable — existing records are unaffected. No data migration is forced; the AI suggests links going forward.

### 16.4 Index Additions

```sql
CREATE INDEX idx_receivables_customer ON receivables(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_payables_supplier ON payables(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX idx_income_customer ON income_records(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_expense_supplier ON expense_records(supplier_id) WHERE supplier_id IS NOT NULL;
```

### 16.5 Total Migration Count

| # | Migration | Scope |
|---|-----------|-------|
| 1 | `20260803000000_financial_profile_repositories.sql` | 5 new tables + RLS + triggers + indexes |
| 2 | `20260803010000_financial_profile_junctions.sql` | 3 junction tables + RLS + indexes |
| 3 | `20260803020000_financial_profile_foreign_keys.sql` | 4 nullable FK columns + partial indexes |
| 4 | `20260803030000_financial_profile_seed.sql` | Optional: seed customers/suppliers from existing receivables/payables (non-destructive) |

All migrations are **additive** — no DROP statements, no column removals, no type changes to existing columns. Rollback is safe (see Section 23).

---

## 17. RPC IMPACT

### 17.1 No New RPCs Required

The existing profile data access pattern uses direct Supabase client reads/writes (not RPCs) for most profile entities. The new repositories follow the same pattern:

- `profileData.ts` functions read/write directly via `supabase.from('profile_customers').select(...)` etc.
- RLS enforces isolation (no need for SECURITY DEFINER wrappers)
- The only existing RPCs are `get_asset_purchases` and `get_owner_transactions` (for `asset_purchases`/`owner_transactions` which have stricter membership checks)

### 17.2 Optional: `get_full_financial_profile` RPC

An optional SERVER-SIDE RPC could load ALL profile data in a single round-trip:

```sql
CREATE OR REPLACE FUNCTION get_full_financial_profile(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'personalProfile', (SELECT to_jsonb(p) FROM personal_profiles p WHERE p.workspace_id = p_workspace_id),
    'businesses', (SELECT COALESCE(jsonb_agg(to_jsonb(b)), '[]') FROM businesses b WHERE b.workspace_id = p_workspace_id),
    'branches', (SELECT COALESCE(jsonb_agg(to_jsonb(br)), '[]') FROM business_branches br WHERE br.workspace_id = p_workspace_id),
    'vehicles', (SELECT COALESCE(jsonb_agg(to_jsonb(v)), '[]') FROM vehicles v WHERE v.workspace_id = p_workspace_id),
    'dependents', (SELECT COALESCE(jsonb_agg(to_jsonb(d)), '[]') FROM dependents d WHERE d.workspace_id = p_workspace_id),
    'customers', (SELECT COALESCE(jsonb_agg(to_jsonb(c)), '[]') FROM profile_customers c WHERE c.workspace_id = p_workspace_id),
    'suppliers', (SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]') FROM profile_suppliers s WHERE s.workspace_id = p_workspace_id),
    'properties', (SELECT COALESCE(jsonb_agg(to_jsonb(pr)), '[]') FROM profile_properties pr WHERE pr.workspace_id = p_workspace_id),
    'insurance', (SELECT COALESCE(jsonb_agg(to_jsonb(i)), '[]') FROM profile_insurance i WHERE i.workspace_id = p_workspace_id),
    'investments', (SELECT COALESCE(jsonb_agg(to_jsonb(inv)), '[]') FROM profile_investments inv WHERE inv.workspace_id = p_workspace_id)
  ) INTO v_result;
  RETURN v_result;
END;
$$;
```

**Benefit:** `buildFinancialContext()` makes 1 RPC call instead of 10+ separate `supabase.from(...).select(...)` calls, reducing latency on slow connections.

**Decision:** Include as optional optimization. The client-side builder works without it (multiple parallel selects). The RPC is a performance enhancement, not a functional requirement.

### 17.3 No Changes to Existing RPCs

All existing RPCs (`get_asset_purchases`, `get_owner_transactions`, `log_tenant_activity`, `get_tenant_activity_feed`, wallet RPCs, billing RPCs) remain unchanged. The Financial Profile Enhancement is purely additive at the RPC level.

---

## 18. SERVICE IMPACT

### 18.1 New Service Files (3)

| File | Purpose | Lines (est.) |
|------|---------|-------------|
| `src/lib/buildFinancialContext.ts` | Central context builder — loads ALL repositories and assembles `FinancialContextPayload` | ~150 |
| `src/lib/customerMatching.ts` | Customer name matching (pure function, same pattern as `businessMatching.ts`) | ~60 |
| `src/lib/supplierMatching.ts` | Supplier name matching (pure function) | ~60 |

### 18.2 Modified Service Files (3)

| File | Change | Nature |
|------|--------|--------|
| `src/lib/profileData.ts` | Add CRUD functions for `profile_customers`, `profile_suppliers`, `profile_properties`, `profile_insurance`, `profile_investments` + junction table management | Additive — new functions appended, existing functions unchanged |
| `src/lib/financialCompletenessEngine.ts` | Add `computeProfileCompleteness()` function | Additive — new export, existing function unchanged |
| `src/lib/internalTransferDetection.ts` | Add `detectInternalTransfersWithContext()` wrapper that uses business/account associations | Additive — new export, existing function unchanged |

### 18.3 Unchanged Service Files

| File | Why Unchanged |
|------|---------------|
| `src/lib/assetOwnerData.ts` | Already migrated to Supabase, no changes needed |
| `src/lib/businessMatching.ts` | Works as-is; new matching functions are separate files |
| `src/lib/transactionRecoveryEngine.ts` | Works as-is; profile context flows through `buildFinancialContext()` |
| `src/lib/financialHealth.ts` | Works as-is; reads from typed collections, not profile directly |
| `src/lib/paymentService.ts` | No billing impact |
| `src/lib/hqService.ts` | No HQ service changes needed |
| `src/lib/storageQuota.ts` | No storage changes |
| `src/lib/aiCredits.ts` | No credit system changes |

---

## 19. UI IMPACT

### 19.1 Modified UI Files (3)

| File | Change |
|------|--------|
| `src/screens/OwnerDashboard.tsx` | Replace manual `financialContext` in `sendChat` with `buildFinancialContext()`. Add new profile repository cards (customers, suppliers, properties, insurance, investments) in the `myProfile` section. Add evidence attachment buttons on profile entities. |
| `src/screens/StaffHomeScreen.tsx` | Replace manual `financialContext` in `sendChat` with `buildFinancialContext()`. Add read-only profile repository views in the More tab. |
| `server.ts` | Extend system prompt with sections 12-17 (branches, properties, insurance, investments, customers, suppliers). |

### 19.2 New UI Sections (OwnerDashboard)

Added to the `myProfile` section (after existing Tanggungan card, before Belian Aset):

```
12. Pelanggan (Customers) — CRUD card with name, email, phone, address, notes
13. Pembekal (Suppliers) — CRUD card with name, email, phone, address, notes
14. Hartanah (Properties) — CRUD card with property name, type, address, value, notes
15. Insurans (Insurance) — CRUD card with policy name, type, provider, premium, coverage
16. Pelaburan (Investments) — CRUD card with name, type, institution, value
```

Each card follows the existing `businesses` CRUD card pattern (list + add form + edit form + delete with confirm).

### 19.3 Evidence Attachment UI

Each profile entity card gets a "📎 Lampiran" button (same pattern as support ticket attachments):
- Click → file picker → `uploadDocument()` → `linkEvidenceToRecord()` with `relatedRecordType: "VEHICLE"` etc.
- Existing evidence packages for the entity are listed below the card

### 19.4 No New Screens

No new routes, no new modals, no new pages. All new repositories live within the existing `myProfile` More tab. All new UI is additive within the existing layout.

### 19.5 Profile Completeness Banner

A new banner at the top of the `myProfile` section shows profile completeness:
- "Profil anda 75% lengkap. Tambah maklumat insurans dan pelaburan untuk konteks AI yang lebih baik."
- Color: amber if < 80%, green if ≥ 80%
- Links to incomplete sections

---

## 20. NOTIFICATION IMPACT

### 20.1 New Notification Type: Profile Completeness Reminder

| Field | Value |
|-------|-------|
| `category` | `'PROFILE'` |
| `title` | `'Lengkapkan Profil Kewangan Anda'` |
| `message` | `'Profil kewangan anda [X]% lengkap. Tambah [missing repositories] untuk bantuan AI yang lebih tepat.'` |
| `status` | `'UNREAD'` |
| `metadata` | `{ completenessPct, missingRepos: [...] }` |

Generated by `NotificationContext.generateDynamicAdvisoryAlerts()` when `computeProfileCompleteness()` drops below a threshold (configurable, default 80%). Respects `preferences.enableInApp`.

### 20.2 Existing Notifications (Unchanged)

- Staff financial action notifications (DB triggers) — unchanged
- HQ wallet adjustment notifications — unchanged
- Payment approval notifications — unchanged
- Support ticket notifications — unchanged
- Advisory alerts (commitments, receivables, payables, health) — unchanged

### 20.3 Activity Center Logging for Profile Actions

All profile CRUD operations log to `tenant_activity_log`:
```
actionType: 'PROFILE_CREATED' | 'PROFILE_UPDATED' | 'PROFILE_DELETED'
module: 'Financial Profile'
description: '[Entity type] [entity name] [action verb]'
```

This extends the existing `logTenantActivity()` calls already used for financial records. No new RPC needed.

---

## 21. AUDIT IMPACT

### 21.1 New Audit Triggers

All 5 new tables get the same audit trigger pattern as `asset_purchases`/`owner_transactions` (from migration `20260802000000`):

```sql
CREATE TRIGGER trg_audit_profile_customers
  AFTER INSERT OR UPDATE OR DELETE ON public.profile_customers
  FOR EACH ROW EXECUTE FUNCTION public.audit_asset_owner_action();
```

The existing `audit_asset_owner_action()` function is generic enough to handle any table (it uses `TG_TABLE_NAME` for the module label and `to_jsonb(OLD/NEW)` for the values). It just needs to be attached to each new table.

### 21.2 Junction Table Auditing

Junction tables (`vehicle_businesses`, `bank_account_businesses`, `property_businesses`) are relationship links, not financial records. They do NOT get audit triggers — their CREATE/DELETE is implicit in the profile CRUD operations that manage them. This matches the existing pattern (e.g., `ocr_learned_patterns` has no audit trigger, only `financial_commitments` and `debts` do).

### 21.3 Existing Audit Trail (Unchanged)

- `audit_logs` table — unchanged, same structure, same RLS
- `event_logs` — unchanged
- `hq_governance_audit_log` — unchanged (no HQ-side governance for profile data)
- `tenant_activity_log` — extended with `PROFILE_*` action types (additive)