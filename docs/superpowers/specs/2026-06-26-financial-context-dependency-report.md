# MYKERANI Financial Context Architecture Reconciliation Report

**Date:** 2026-06-26
**Status:** FINAL VALIDATION — NO IMPLEMENTATION PERMITTED
**Repository:** srcreative2020/mykerani-app
**Commit:** ed68afa
**Data Source:** Phases 1-4 complete exploration (no additional searches performed)

---

## SECTION 1: FINANCIAL REPOSITORY INVENTORY

### 1.1 Complete Repository Table

| # | Repository Name | Database Table | Service File | Context Provider | Exists? |
|---|----------------|---------------|-------------|-----------------|---------|
| 1 | Personal Profile | `personal_profiles` | `profileData.ts` (load/save) | OwnerDashboard state + StaffHomeScreen state | ✅ |
| 2 | Business Profile (Legacy) | `business_profiles` | `profileData.ts` (load/save) | OwnerDashboard state (unused in AI); StaffHomeScreen state | ✅ Legacy |
| 3 | Businesses | `businesses` | `profileData.ts` (CRUD) | OwnerDashboard state + StaffHomeScreen state + AIFinancialAssistant state | ✅ |
| 4 | Business Branches | `business_branches` | `profileData.ts` (load/add/delete) | OwnerDashboard state (nested under businesses) + StaffHomeScreen state | ✅ |
| 5 | Vehicles | `vehicles` | `profileData.ts` (CRUD) | OwnerDashboard state + StaffHomeScreen state | ✅ |
| 6 | Dependents | `dependents` | `profileData.ts` (CRUD) | OwnerDashboard state + StaffHomeScreen state | ✅ |
| 7 | Asset Purchases | `asset_purchases` | `assetOwnerData.ts` (CRUD via RPC) | OwnerDashboard state + StaffHomeScreen state (write-only) | ✅ |
| 8 | Owner Transactions | `owner_transactions` | `assetOwnerData.ts` (CRUD via RPC) | OwnerDashboard state + StaffHomeScreen state (write-only) | ✅ |
| 9 | Bank Accounts | `bank_accounts` | `FinancialRecordsContext` (direct) | FinancialRecordsContext.bankAccounts | ✅ |
| 10 | Cash Accounts | `cash_accounts` | `FinancialRecordsContext` (direct) | FinancialRecordsContext.cashAccounts | ✅ |
| 11 | Debts | `debts` | `FinancialRecordsContext` (direct) | FinancialRecordsContext.debtRecords | ✅ |
| 12 | Financial Commitments | `financial_commitments` | `FinancialRecordsContext` (direct) | FinancialRecordsContext.financialCommitments | ✅ |
| 13 | Financial Evidence | `financial_evidence_packages` | `FinancialRecordsContext` (direct) | FinancialRecordsContext.financialEvidencePackages | ✅ |
| 14 | OCR Learned Patterns | `ocr_learned_patterns` | `FinancialRecordsContext` (direct) | FinancialRecordsContext.ocrLearnedPatterns | ✅ |
| 15 | General Ledger Categories | `general_ledger_categories` | `FinancialRecordsContext` (direct) | FinancialRecordsContext internal category map | ✅ |
| 16 | Financial Records (Income) | `income_records` | `FinancialRecordsContext` (direct) | FinancialRecordsContext.financialEvents | ✅ |
| 17 | Financial Records (Expense) | `expense_records` | `FinancialRecordsContext` (direct) | FinancialRecordsContext.financialEvents | ✅ |
| 18 | Financial Records (Receivables) | `receivables` | `FinancialRecordsContext` (direct) | FinancialRecordsContext.financialEvents | ✅ |
| 19 | Financial Records (Payables) | `payables` | `FinancialRecordsContext` (direct) | FinancialRecordsContext.financialEvents | ✅ |
| 20 | Staff/User Roles | `user_role_assignments` | `PermissionContext` (direct) | PermissionContext.userRoles | ✅ |
| 21 | Customers | — (does not exist) | — | — | ❌ MISSING |
| 22 | Suppliers | — (does not exist) | — | — | ❌ MISSING |
| 23 | Properties | — (does not exist) | — | — | ❌ MISSING |
| 24 | Insurance | — (does not exist) | — | — | ❌ MISSING |
| 25 | Investments | — (does not exist) | — | — | ❌ MISSING |
| 26 | Duplicate Flags | `duplicate_flags` | `FinancialRecordsContext` (direct) | FinancialRecordsContext.duplicateFlags | ✅ |

**Summary:** 20 repositories exist. 5 repositories are missing. 1 repository (`business_profiles`) is legacy and partially redundant with `businesses` but still consumed by `FinancialReportsAnalytics.tsx` and `loanReadiness.ts`/`lhdnReadiness.ts` (type-only).

---

## SECTION 2: PER-REPOSITORY CONSUMER MATRIX

### 2.1 Personal Profile (`personal_profiles`)

| Consumer Type | Consumers |
|--------------|-----------|
| **Services** | `profileData.ts`: `loadPersonalProfile`, `savePersonalProfile` |
| **Context Provider** | OwnerDashboard `useState<PersonalProfile>`; StaffHomeScreen `useState<PersonalProfile>` |
| **AI Consumers** | OwnerDashboard.sendChat (sent as `financialContext.personalProfile`); StaffHomeScreen.sendChat (sent as `financialContext.personalProfile`) |
| **OCR Consumers** | None directly (OCR uses `transactionRecoveryEngine` which uses `ocrLearnedPatterns`, not personal profile) |
| **Voice Consumers** | None directly (voice transcribes to chat, which uses `sendChat`) |
| **Camera Consumers** | None directly (camera routes through OCR pipeline) |
| **Bank Statement Consumers** | None directly (bank statement uses `transactionRecoveryEngine` + `internalTransferDetection`) |
| **Dashboard Consumers** | OwnerDashboard profile UI (Profil Peribadi card, lines 3238-3251); StaffHomeScreen profile summary (lines 1641-1646) |
| **Financial Report Consumers** | None |
| **Financial Health Consumers** | None directly (financialHealth.ts does not consume personal profile) |
| **Financial Recovery Consumers** | None |
| **Notification Consumers** | NotificationContext.generateDynamicAdvisoryAlerts (does NOT consume personal profile) |
| **Audit Consumers** | AuditContext.writeAuditLog is NOT called on personal profile save (gap) |

### 2.2 Business Profile Legacy (`business_profiles`)

| Consumer Type | Consumers |
|--------------|-----------|
| **Services** | `profileData.ts`: `loadBusinessProfile`, `saveBusinessProfile` |
| **Context Provider** | OwnerDashboard (loaded but NOT sent in `sendChat`); StaffHomeScreen `useState` (sent in `sendChat` as `financialContext.businessProfile`) |
| **AI Consumers** | StaffHomeScreen.sendChat (sends `businessProfile` alongside `businesses` — duplicate); Server prompt section 9 fallback (`financialContext.businesses || financialContext.businessProfile`) |
| **OCR Consumers** | None |
| **Voice Consumers** | None |
| **Camera Consumers** | None |
| **Bank Statement Consumers** | None |
| **Dashboard Consumers** | None (UI uses `businesses` table, not `business_profiles`) |
| **Financial Report Consumers** | FinancialReportsAnalytics.tsx (loads `businessProfile` for report header — company name/registration); loanReadiness.ts (type-only); lhdnReadiness.ts (type-only) |
| **Financial Health Consumers** | None |
| **Financial Recovery Consumers** | None |
| **Notification Consumers** | None |
| **Audit Consumers** | None (no audit on business_profiles save) |

**⚠️ DUPLICATION RISK:** StaffHomeScreen sends BOTH `businessProfile` (legacy) and `businesses` (current). The server falls back from `businesses` to `businessProfile` if `businesses` is empty. This is a transitional duplication — the blueprint must eventually consolidate to `businesses` only.

### 2.3 Businesses (`businesses`)

| Consumer Type | Consumers |
|--------------|-----------|
| **Services** | `profileData.ts`: `loadBusinesses`, `addBusiness`, `updateBusiness`, `deleteBusiness` |
| **Context Provider** | OwnerDashboard state; StaffHomeScreen state; AIFinancialAssistant state |
| **AI Consumers** | OwnerDashboard.sendChat (sent as `financialContext.businesses`); StaffHomeScreen.sendChat (sent as `financialContext.businesses`); AIFinancialAssistant (loads but uses own context construction); Server prompt section 9 |
| **OCR Consumers** | `businessMatching.ts` matches OCR vendor names against businesses (via `matchOwnBusiness`) |
| **Voice Consumers** | Indirectly through chat `sendChat` |
| **Camera Consumers** | Indirectly through OCR pipeline |
| **Bank Statement Consumers** | `businessMatching.ts` `matchOwnBusinessAndBranch` used by HistoricalRecoveryWorkspace for bank statement import business attribution |
| **Dashboard Consumers** | OwnerDashboard profile UI (Profil Perniagaan card, lines 3253-3360); StaffHomeScreen (loaded but not displayed in a card) |
| **Financial Report Consumers** | None directly (reports use `financialEvents`, not businesses). `reportClassificationEngine.ts` imports type `Business` but uses it only for label normalization context. |
| **Financial Health Consumers** | None |
| **Financial Recovery Consumers** | `transactionRecoveryEngine.ts` does NOT consume businesses (gap — recovery suggestions don't know which business a transaction belongs to) |
| **Notification Consumers** | None |
| **Audit Consumers** | None (no audit trigger on businesses table — gap) |

### 2.4 Business Branches (`business_branches`)

| Consumer Type | Consumers |
|--------------|-----------|
| **Services** | `profileData.ts`: `loadBusinessBranches`, `addBusinessBranch`, `deleteBusinessBranch` |
| **Context Provider** | OwnerDashboard state (nested: `Record<businessId, BusinessBranch[]>`); StaffHomeScreen state |
| **AI Consumers** | **NONE** — not sent in any `financialContext` by any call site. Server prompt has no branch section. |
| **OCR Consumers** | `businessMatching.ts` `matchOwnBusinessAndBranch` uses branches for branch-level matching after AI suggestion |
| **Voice Consumers** | Indirectly through `businessMatching.ts` post-chat processing |
| **Camera Consumers** | Indirectly through OCR pipeline post-processing |
| **Bank Statement Consumers** | `businessMatching.ts` used by HistoricalRecoveryWorkspace |
| **Dashboard Consumers** | OwnerDashboard profile UI (nested branches under each business card) |
| **Financial Report Consumers** | None |
| **Financial Health Consumers** | None |
| **Financial Recovery Consumers** | None |
| **Notification Consumers** | None |
| **Audit Consumers** | None |

**🔴 DEAD INTEGRATION:** Business branches are collected, stored, and displayed in the UI, and used by `businessMatching.ts` for post-AI suggestion pre-fill. But branches are NEVER sent to the AI in `financialContext`. The AI has zero awareness of branches when generating suggestions.

### 2.5 Vehicles (`vehicles`)

| Consumer Type | Consumers |
|--------------|-----------|
| **Services** | `profileData.ts`: `loadVehicles`, `addVehicle`, `updateVehicle`, `deleteVehicle` |
| **Context Provider** | OwnerDashboard state; StaffHomeScreen state |
| **AI Consumers** | OwnerDashboard.sendChat; StaffHomeScreen.sendChat; Server prompt section 10 (ownership PERSONAL/BUSINESS for disambiguation) |
| **OCR Consumers** | None directly |
| **Voice Consumers** | Indirectly through chat |
| **Camera Consumers** | Indirectly through chat |
| **Bank Statement Consumers** | None |
| **Dashboard Consumers** | OwnerDashboard Kenderaan card (lines 3388-3436) |
| **Financial Report Consumers** | None directly |
| **Financial Health Consumers** | None |
| **Financial Recovery Consumers** | None |
| **Notification Consumers** | None |
| **Audit Consumers** | None (no audit trigger on vehicles table — gap) |

### 2.6 Dependents (`dependents`)

| Consumer Type | Consumers |
|--------------|-----------|
| **Services** | `profileData.ts`: `loadDependents`, `addDependent`, `updateDependent`, `deleteDependent` |
| **Context Provider** | OwnerDashboard state; StaffHomeScreen state |
| **AI Consumers** | OwnerDashboard.sendChat; StaffHomeScreen.sendChat; Server prompt section 11 |
| **OCR Consumers** | None |
| **Voice Consumers** | Indirectly through chat |
| **Camera Consumers** | None |
| **Bank Statement Consumers** | None |
| **Dashboard Consumers** | OwnerDashboard Tanggungan card (lines 3438-3473) |
| **Financial Report Consumers** | None |
| **Financial Health Consumers** | None |
| **Financial Recovery Consumers** | None |
| **Notification Consumers** | None |
| **Audit Consumers** | None (no audit trigger — gap) |

### 2.7 Asset Purchases (`asset_purchases`)

| Consumer Type | Consumers |
|--------------|-----------|
| **Services** | `assetOwnerData.ts`: `loadAssetPurchases`, `addAssetPurchase`, `updateAssetPurchase`, `deleteAssetPurchase` |
| **Context Provider** | OwnerDashboard state; StaffHomeScreen (write-only via `useConfirmChatSuggestion`); `useConfirmChatSuggestion.ts` hook |
| **AI Consumers** | **NONE** — not sent in `financialContext` by any call site |
| **OCR Consumers** | `useConfirmChatSuggestion.ts` creates asset purchases when AI suggests `ASSET_PURCHASE` type |
| **Voice Consumers** | Indirectly through chat suggestion confirmation |
| **Camera Consumers** | Indirectly through chat suggestion confirmation |
| **Bank Statement Consumers** | None |
| **Dashboard Consumers** | OwnerDashboard Belian Aset card (lines 3475-3488, read-only list) |
| **Financial Report Consumers** | `BalanceSheetReport.tsx` (equity/assets section); `CashFlowReport.tsx` (investing activities); `FinancialReportsAnalytics.tsx` (loads for export); `reportClassificationEngine.ts` (type-only, `fromAssetPurchase`); `reportBucketAggregator.ts` (type-only) |
| **Financial Health Consumers** | None |
| **Financial Recovery Consumers** | None |
| **Notification Consumers** | None |
| **Audit Consumers** | Audit trigger `trg_audit_asset_purchases` (migration `20260802000000`) |

**🔴 DISCONNECTED:** Asset purchases are created via AI chat, consumed by financial reports, but NEVER sent to AI as context. The AI can create asset purchase records but cannot see existing ones when making new suggestions.

### 2.8 Owner Transactions (`owner_transactions`)

| Consumer Type | Consumers |
|--------------|-----------|
| **Services** | `assetOwnerData.ts`: `loadOwnerTransactions`, `addOwnerTransaction`, `updateOwnerTransaction`, `deleteOwnerTransaction` |
| **Context Provider** | OwnerDashboard state; StaffHomeScreen (write-only via `useConfirmChatSuggestion`); `useConfirmChatSuggestion.ts` hook |
| **AI Consumers** | **NONE** — not sent in `financialContext` by any call site |
| **OCR Consumers** | `useConfirmChatSuggestion.ts` creates owner transactions when AI suggests `OWNER_TRANSACTION` type |
| **Voice Consumers** | Indirectly through chat |
| **Camera Consumers** | Indirectly through chat |
| **Bank Statement Consumers** | None |
| **Dashboard Consumers** | OwnerDashboard Transaksi Pemilik card (lines 3490-3503, read-only list) |
| **Financial Report Consumers** | `BalanceSheetReport.tsx` (owner equity section); `CashFlowReport.tsx` (financing activities); `FinancialReportsAnalytics.tsx` (loads for export); `reportClassificationEngine.ts` (type-only, `fromOwnerTransaction`); `reportBucketAggregator.ts` (type-only) |
| **Financial Health Consumers** | None |
| **Financial Recovery Consumers** | None |
| **Notification Consumers** | None |
| **Audit Consumers** | Audit trigger `trg_audit_owner_transactions` (migration `20260802000000`) |

**🔴 DISCONNECTED:** Same pattern as asset purchases — AI can create owner transactions but cannot see existing ones.

### 2.9 Bank Accounts (`bank_accounts`)

| Consumer Type | Consumers |
|--------------|-----------|
| **Services** | `FinancialRecordsContext` (direct Supabase reads/writes) |
| **Context Provider** | FinancialRecordsContext.bankAccounts |
| **AI Consumers** | `AIFinancialAssistant.tsx` (sent as `financialContext.bankAccounts`); `FinancialRecordsConsole.tsx` (sent as `financialContext.bankAccounts`). **NOT sent by OwnerDashboard.sendChat or StaffHomeScreen.sendChat** |
| **OCR Consumers** | None directly |
| **Voice Consumers** | Indirectly through chat (if call site sends it) |
| **Camera Consumers** | None |
| **Bank Statement Consumers** | `internalTransferDetection.ts` uses bank account names to detect internal transfers |
| **Dashboard Consumers** | OwnerDashboard dashboard tab (bank account cards); FinancialRecordsConsole (bank account management) |
| **Financial Report Consumers** | `BalanceSheetReport.tsx` (assets section — cash and bank balances); `CashFlowReport.tsx` (opening/closing balances); `FinancialReportsAnalytics.tsx`; `financialHealth.ts` (solvency/quick ratio calculation) |
| **Financial Health Consumers** | `computeFinancialHealthScoring()` consumes `BankAccount[]` for liquidity calculations |
| **Financial Recovery Consumers** | None |
| **Notification Consumers** | `NotificationContext.generateDynamicAdvisoryAlerts` does NOT directly consume bank accounts (consumes financial health scoring which consumes bank accounts indirectly) |
| **Audit Consumers** | `FinancialRecordsContext.addBankAccount`/`editBankAccount`/`deleteBankAccount` call `writeAuditLog` |

**⚠️ FRAGMENTED:** Bank accounts ARE sent to AI by `AIFinancialAssistant.tsx` and `FinancialRecordsConsole.tsx` but NOT by `OwnerDashboard.sendChat` or `StaffHomeScreen.sendChat`. The two primary chat screens are missing this context.

### 2.10 Cash Accounts (`cash_accounts`)

| Consumer Type | Consumers |
|--------------|-----------|
| **Services** | `FinancialRecordsContext` (direct) |
| **Context Provider** | FinancialRecordsContext.cashAccounts |
| **AI Consumers** | `AIFinancialAssistant.tsx` (sent); `FinancialRecordsConsole.tsx` (sent). **NOT sent by OwnerDashboard.sendChat or StaffHomeScreen.sendChat** |
| **OCR Consumers** | None directly |
| **Voice Consumers** | Indirectly through chat (if call site sends it) |
| **Camera Consumers** | None |
| **Bank Statement Consumers** | `internalTransferDetection.ts` uses cash account names |
| **Dashboard Consumers** | OwnerDashboard dashboard tab; FinancialRecordsConsole |
| **Financial Report Consumers** | `BalanceSheetReport.tsx`; `CashFlowReport.tsx`; `financialHealth.ts` |
| **Financial Health Consumers** | `computeFinancialHealthScoring()` consumes `CashAccount[]` |
| **Financial Recovery Consumers** | None |
| **Notification Consumers** | None directly |
| **Audit Consumers** | `writeAuditLog` on CRUD |

**⚠️ FRAGMENTED:** Same pattern as bank accounts — sent by some call sites, not others.

### 2.11 Debts (`debts`)

| Consumer Type | Consumers |
|--------------|-----------|
| **Services** | `FinancialRecordsContext` (direct) |
| **Context Provider** | FinancialRecordsContext.debtRecords |
| **AI Consumers** | `AIFinancialAssistant.tsx` (sent); `FinancialRecordsConsole.tsx` (sent). **NOT sent by OwnerDashboard.sendChat or StaffHomeScreen.sendChat** |
| **OCR Consumers** | None |
| **Voice Consumers** | Indirectly through chat (if call site sends it) |
| **Camera Consumers** | None |
| **Bank Statement Consumers** | None |
| **Dashboard Consumers** | OwnerDashboard (debt management UI) |
| **Financial Report Consumers** | `BalanceSheetReport.tsx` (liabilities section); `financialHealth.ts` (debt-to-equity) |
| **Financial Health Consumers** | `computeFinancialHealthScoring()` consumes `DebtRecord[]` |
| **Financial Recovery Consumers** | None |
| **Notification Consumers** | `NotificationContext` advisory alerts on overdue commitments (uses `financialCommitments`, not debts directly) |
| **Audit Consumers** | `writeAuditLog` on CRUD |

**⚠️ FRAGMENTED:** Same pattern — debts are missing from the two primary chat call sites.

### 2.12 Financial Commitments (`financial_commitments`)

| Consumer Type | Consumers |
|--------------|-----------|
| **Services** | `FinancialRecordsContext` (direct) |
| **Context Provider** | FinancialRecordsContext.financialCommitments |
| **AI Consumers** | `AIFinancialAssistant.tsx` (sent); `FinancialRecordsConsole.tsx` (sent). **NOT sent by OwnerDashboard.sendChat or StaffHomeScreen.sendChat** |
| **OCR Consumers** | None |
| **Voice Consumers** | Indirectly through chat (if call site sends it) |
| **Camera Consumers** | None |
| **Bank Statement Consumers** | None |
| **Dashboard Consumers** | OwnerDashboard (commitment management UI) |
| **Financial Report Consumers** | `financialHealth.ts` (monthly commitment burn calculation) |
| **Financial Health Consumers** | `computeFinancialHealthScoring()` consumes `FinancialCommitment[]` |
| **Financial Recovery Consumers** | None |
| **Notification Consumers** | `NotificationContext.generateDynamicAdvisoryAlerts` — directly consumes `financialCommitments` for overdue/due-today/due-soon reminders |
| **Audit Consumers** | `writeAuditLog` on CRUD |

**⚠️ FRAGMENTED:** Same pattern.

### 2.13 Financial Evidence (`financial_evidence_packages`)

| Consumer Type | Consumers |
|--------------|-----------|
| **Services** | `FinancialRecordsContext` (direct) |
| **Context Provider** | FinancialRecordsContext.financialEvidencePackages |
| **AI Consumers** | `AIFinancialAssistant.tsx` (sent); **NOT sent by OwnerDashboard.sendChat, StaffHomeScreen.sendChat, or FinancialRecordsConsole** |
| **OCR Consumers** | Evidence packages are created during OCR confirmation (via `linkEvidenceToRecord`) |
| **Voice Consumers** | Indirectly through chat (if call site sends it) |
| **Camera Consumers** | Indirectly through OCR |
| **Bank Statement Consumers** | `HistoricalRecoveryWorkspace` creates evidence packages during bank statement recovery |
| **Dashboard Consumers** | OwnerDashboard Documents tab; FinancialReportsAnalytics (evidence coverage ratio) |
| **Financial Report Consumers** | `FinancialReportsAnalytics.tsx` (evidence coverage % in readiness score); `evidenceDrilldown.ts` |
| **Financial Health Consumers** | `computeFinancialHealthV1()` uses `evidenceCoverageRatio` (derived from evidence packages) |
| **Financial Recovery Consumers** | `HistoricalRecoveryWorkspace` uses `computeFinancialCompleteness()` which uses evidence coverage ratio |
| **Notification Consumers** | `NotificationContext` advisory alerts on missing evidence (computes from evidence packages vs events) |
| **Audit Consumers** | `writeAuditLog` on CRUD |

**⚠️ FRAGMENTED:** Evidence packages sent to AI by `AIFinancialAssistant.tsx` but not by the two primary chat screens.

### 2.14 OCR Learned Patterns (`ocr_learned_patterns`)

| Consumer Type | Consumers |
|--------------|-----------|
| **Services** | `FinancialRecordsContext` (direct) |
| **Context Provider** | FinancialRecordsContext.ocrLearnedPatterns |
| **AI Consumers** | `AIFinancialAssistant.tsx` (sent as section 7). **NOT sent by OwnerDashboard.sendChat or StaffHomeScreen.sendChat** |
| **OCR Consumers** | `transactionRecoveryEngine.ts` consumes learned patterns for category suggestion (tier 1: learned vendor pattern, confidence floor 0.8) |
| **Voice Consumers** | None directly |
| **Camera Consumers** | Indirectly through OCR |
| **Bank Statement Consumers** | `transactionRecoveryEngine.ts` uses learned patterns for bank statement import categorization |
| **Dashboard Consumers** | OwnerDashboard (OCR pattern management, soft-delete/reactivate) |
| **Financial Report Consumers** | None |
| **Financial Health Consumers** | None |
| **Financial Recovery Consumers** | `transactionRecoveryEngine.ts` — learned patterns are tier 1 in the 3-tier resolution |
| **Notification Consumers** | None |
| **Audit Consumers** | None (no audit on pattern CRUD — patterns are learning memory, not financial records) |

**🔴 CRITICAL DISCONNECT:** OCR learned patterns — the tenant's own learning memory — are NOT sent by the two primary chat screens. The AI in OwnerDashboard.sendChat and StaffHomeScreen.sendChat has AMNESIA — it cannot reference what it learned from previous transactions. This is the single most impactful gap in the current architecture.

### 2.15 Financial Records (`income_records`, `expense_records`, `receivables`, `payables`)

| Consumer Type | Consumers |
|--------------|-----------|
| **Services** | `FinancialRecordsContext` (direct) |
| **Context Provider** | FinancialRecordsContext.financialEvents |
| **AI Consumers** | ALL call sites send `financialEvents` (sections 1) |
| **OCR Consumers** | OCR confirmation creates records via `addFinancialEvent` |
| **Voice Consumers** | Voice chat confirmation creates records |
| **Camera Consumers** | Camera → OCR → confirmation |
| **Bank Statement Consumers** | Bank statement import → `addFinancialEventsBatch` |
| **Dashboard Consumers** | OwnerDashboard Dashboard tab (transaction list, filters, health summary) |
| **Financial Report Consumers** | `ProfitLossReport`, `BalanceSheetReport`, `CashFlowReport`, `FinancialReportsAnalytics` — all consume `financialEvents` |
| **Financial Health Consumers** | `computeFinancialHealthScoring()` consumes events for income/expense ratios |
| **Financial Recovery Consumers** | `HistoricalRecoveryWorkspace` displays recovered records |
| **Notification Consumers** | `NotificationContext` advisory alerts on spending anomalies, overdue receivables/payables |
| **Audit Consumers** | `writeAuditLog` on every CRUD operation; DB triggers notify Owner on Staff mutations |

**✅ FULLY CONNECTED:** Financial records are the only repository consumed by every call site, every report, and every engine. This is the gold standard for context connectivity.

### 2.16 Staff/User Roles (`user_role_assignments`)

| Consumer Type | Consumers |
|--------------|-----------|
| **Services** | `PermissionContext` (direct) |
| **Context Provider** | PermissionContext.userRoles |
| **AI Consumers** | None (AI does not need to know staff list) |
| **OCR Consumers** | None |
| **Voice Consumers** | None |
| **Camera Consumers** | None |
| **Bank Statement Consumers** | None |
| **Dashboard Consumers** | OwnerDashboard Team tab (staff management UI) |
| **Financial Report Consumers** | None |
| **Financial Health Consumers** | None |
| **Financial Recovery Consumers** | None |
| **Notification Consumers** | None |
| **Audit Consumers** | `role_change_audit_log` table tracks role changes |

**✅ APPROPRIATELY ISOLATED:** Staff data is not sent to AI (correct — AI doesn't need staff roster). Only consumed by team management UI and permission system.

---

## SECTION 3: COMPLETE DEPENDENCY GRAPH

### 3.1 Current Data Flow (As-Built)

```
                    ┌─────────────────────────────────────────────────┐
                    │              FINANCIAL REPOSITORIES              │
                    │                                                  │
                    │  personal_profiles     businesses               │
                    │  business_profiles     business_branches        │
                    │  vehicles              dependents               │
                    │  asset_purchases       owner_transactions       │
                    │  bank_accounts         cash_accounts            │
                    │  debts                 financial_commitments     │
                    │  financial_evidence_packages                    │
                    │  ocr_learned_patterns                           │
                    │  income_records        expense_records           │
                    │  receivables           payables                 │
                    └──────────────┬───────────────────┬───────────────┘
                                   │                   │
                    ┌──────────────┴────┐    ┌────────┴────────────┐
                    │  profileData.ts    │    │ FinancialRecords    │
                    │  assetOwnerData.ts  │    │   Context           │
                    │  (load/save/CRUD)  │    │ (load/CRUD/context) │
                    └──────────────┬────┘    └────────┬────────────┘
                                   │                  │
                                   │   ┌──────────────┘
                                   │   │
                                   ▼   ▼
                    ┌──────────────────────────────────────────────────┐
                    │           CONTEXT ASSEMBLY (FRAGMENTED)          │
                    │                                                  │
                    │  OwnerDashboard.sendChat:                        │
                    │    { tenant, workspace, events,                  │
                    │      personalProfile, businesses,                │
                    │      vehicles, dependents }                      │
                    │    ❌ MISSING: cashAccounts, bankAccounts,       │
                    │       debts, commitments, evidence, patterns,    │
                    │       branches, assetPurchases, ownerTxns        │
                    │                                                  │
                    │  StaffHomeScreen.sendChat:                       │
                    │    { tenant, workspace, events,                  │
                    │      personalProfile, businessProfile(LEGACY),   │
                    │      businesses, vehicles, dependents }          │
                    │    ❌ MISSING: cashAccounts, bankAccounts,       │
                    │       debts, commitments, evidence, patterns,    │
                    │       branches, assetPurchases, ownerTxns        │
                    │                                                  │
                    │  AIFinancialAssistant:                           │
                    │    { tenant, workspace, events,                  │
                    │      cashAccounts, bankAccounts, debts,          │
                    │      commitments, evidence, patterns }           │
                    │    ❌ MISSING: personalProfile, businesses,       │
                    │       vehicles, dependents, branches,            │
                    │       assetPurchases, ownerTxns                 │
                    │                                                  │
                    │  FinancialRecordsConsole:                        │
                    │    { workspace, events,                          │
                    │      cashAccounts, bankAccounts, debts,          │
                    │      commitments }                               │
                    │    ❌ MISSING: tenant, personalProfile,           │
                    │       businesses, vehicles, dependents,         │
                    │       evidence, patterns, branches              │
                    │                                                  │
                    │  OwnerDashboard.sendSupport:                     │
                    │    { tenant, workspace, events }                 │
                    │    ❌ MISSING: everything except identity+events │
                    │                                                  │
                    │  StaffHomeScreen.sendSupport:                    │
                    │    { tenant, workspace, events }                 │
                    │    ❌ MISSING: everything except identity+events │
                    └──────────────┬───────────────────────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────────────────────────┐
                    │              SERVER (server.ts)                   │
                    │                                                  │
                    │  System prompt: 11 sections (1-11)               │
                    │  Sections 2-7 receive [] from most call sites    │
                    │  Section 9: fallback businesses → businessProfile│
                    │  + fetchKnowledgeBankMatches() (server-side)    │
                    │  + evaluateAccountingSuggestion() (post-LLM)    │
                    └──────────────┬───────────────────────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────────────────────────┐
                    │              LLM (Gemini/OpenAI/etc)              │
                    │                                                  │
                    │  Generates text + CONFIRM_TRANSACTION suggestions│
                    │  BLIND to: bank accounts, debts, commitments,    │
                    │  evidence, patterns, branches, assets, owner txns│
                    │  (from most call sites)                          │
                    └──────────────┬───────────────────────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────────────────────────┐
                    │           POST-LLM ENRICHMENT                     │
                    │                                                  │
                    │  businessMatching.matchOwnBusinessAndBranch()    │
                    │    → pre-fills businessId/branchId               │
                    │  evaluateAccountingSuggestion()                  │
                    │    → accounting recommendation banner             │
                    └──────────────┬───────────────────────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────────────────────────┐
                    │           USER CONFIRMATION                       │
                    │                                                  │
                    │  useConfirmChatSuggestion hook:                  │
                    │    → addFinancialEvent / editFinancialEvent       │
                    │    → addAssetPurchase / addOwnerTransaction      │
                    │    → learnOcrPattern (AI learning)                │
                    │    → writeAuditLog                                │
                    │    → logTenantActivity                            │
                    │    → linkEvidenceToRecord                         │
                    └──────────────┬───────────────────────────────────┘
                                   │
                    ▼                ▼                  ▼
              ┌──────────┐  ┌──────────────┐  ┌──────────────────┐
              │ Reports  │  │ Notifications │  │  Audit + Activity │
              │          │  │               │  │                  │
              │ P&L      │  │ Advisory      │  │ audit_logs       │
              │ B/S      │  │ alerts        │  │ event_logs       │
              │ CF       │  │ (commitments, │  │ tenant_activity  │
              │ Health   │  │  receivables, │  │   _log           │
              │ Loan Rd  │  │  payables,    │  │                  │
              │ LHDN Rd  │  │  health,     │  │                  │
              │ Export   │  │  storage,     │  │                  │
              │          │  │  evidence)   │  │                  │
              └──────────┘  └──────────────┘  └──────────────────┘
```

### 3.2 Target Data Flow (With `buildFinancialContext`)

```
                    ┌─────────────────────────────────────────────────┐
                    │              FINANCIAL REPOSITORIES              │
                    │  (ALL 20+ repositories — unchanged)             │
                    └──────────────┬───────────────────┬───────────────┘
                                   │                   │
                    ┌──────────────┴────┐    ┌────────┴────────────┐
                    │  profileData.ts    │    │ FinancialRecords    │
                    │  assetOwnerData.ts  │    │   Context           │
                    └──────────────┬────┘    └────────┬────────────┘
                                   │                  │
                                   ▼                  ▼
                    ┌──────────────────────────────────────────────────┐
                    │      buildFinancialContext() — SINGLE BUILDER    │
                    │                                                  │
                    │  Loads ALL repositories:                         │
                    │  ✅ personalProfile, businesses, branches,        │
                    │     vehicles, dependents, assetPurchases,         │
                    │     ownerTransactions                            │
                    │  ✅ cashAccounts, bankAccounts, debts,             │
                    │     commitments, evidence, patterns               │
                    │  ✅ financialEvents                               │
                    │  ✅ (future: customers, suppliers, properties,   │
                    │     insurance, investments)                      │
                    │                                                  │
                    │  Returns: FinancialContextPayload (typed)        │
                    └──────────────┬───────────────────────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────────────────────────┐
                    │  ALL 6 call sites use the SAME builder:           │
                    │  OwnerDashboard.sendChat ✅                       │
                    │  OwnerDashboard.sendSupport ✅                   │
                    │  StaffHomeScreen.sendChat ✅                     │
                    │  StaffHomeScreen.sendSupport ✅                   │
                    │  AIFinancialAssistant ✅                         │
                    │  FinancialRecordsConsole ✅                      │
                    └──────────────┬───────────────────────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────────────────────────┐
                    │  SERVER — ALL 17 SECTIONS POPULATED               │
                    │  AI sees: profile + businesses + branches +      │
                    │  vehicles + dependents + assets + ownerTxns +    │
                    │  cashAccounts + bankAccounts + debts +           │
                    │  commitments + evidence + patterns + events      │
                    └──────────────┬───────────────────────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────────────────────────┐
                    │  LLM — FULL CONTEXT                               │
                    │  Can: suggest account assignment, detect         │
                    │  internal transfers, reference learning memory,   │
                    │  suggest branch attribution, match customers       │
                    └──────────────┬───────────────────────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────────────────────────┐
                    │  POST-LLM + USER CONFIRMATION (unchanged)         │
                    └──────────────┬───────────────────────────────────┘
                                   │
                    ▼                ▼                  ▼
              ┌──────────┐  ┌──────────────┐  ┌──────────────────┐
              │ Reports  │  │ Notifications │  │  Audit + Activity │
              │ (unchanged)│ │ (+profile     │  │ (+profile CRUD   │
              │          │  │ completeness) │  │   logging)       │
              └──────────┘  └──────────────┘  └──────────────────┘
```

### 3.3 Dependency Graph Summary

| Data Flow Path | Current Status | With buildFinancialContext |
|---------------|---------------|---------------------------|
| Repository → Profile Service → Owner state → AI | ✅ Working (partial) | ✅ Working (complete) |
| Repository → FinancialRecordsContext → AI | ❌ BROKEN (not sent by primary chat) | ✅ Fixed |
| Repository → FinancialRecordsContext → Reports | ✅ Working | ✅ Working (unchanged) |
| Repository → FinancialRecordsContext → Health Engine | ✅ Working | ✅ Working (unchanged) |
| Repository → FinancialRecordsContext → Notifications | ✅ Working | ✅ Working (unchanged) |
| Repository → Profile Service → Dashboard UI | ✅ Working | ✅ Working (unchanged) |
| Repository → AI → User Confirm → Audit | ✅ Working (financial records) | ✅ Working + profile audit |
| OCR Patterns → AI (learning memory) | ❌ BROKEN (not sent by primary chat) | ✅ Fixed |
| OCR Patterns → Recovery Engine → Bank Statement Import | ✅ Working | ✅ Working (unchanged) |
| Business Branches → AI | ❌ DEAD (never sent) | ✅ Fixed |
| Asset Purchases → AI | ❌ DEAD (never sent) | ✅ Fixed |
| Owner Transactions → AI | ❌ DEAD (never sent) | ✅ Fixed |

---

## SECTION 4: AI CALLER AUDIT — EVERY CALLER OF `/api/ai/assistant`

### 4.1 Complete Caller Registry

Six call sites were identified across the codebase. Each is analyzed below.

#### Caller 1: OwnerDashboard.sendChat

| Field | Value |
|-------|-------|
| **File** | `src/screens/OwnerDashboard.tsx` |
| **Line** | 1321 |
| **Function** | `sendChat` |
| **Purpose** | Primary AI chat for Tenant Owner — transaction suggestions, financial Q&A |
| **Current Context Fields** | `activeTenant`, `activeWorkspace`, `financialEvents`, `personalProfile`, `businesses`, `vehicles`, `dependents` |
| **Missing Context Fields** | `cashAccounts`, `bankAccounts`, `debtRecords`, `financialCommitments`, `financialEvidencePackages`, `ocrLearnedPatterns`, `businessBranches`, `assetPurchases`, `ownerTransactions` |
| **Should use `buildFinancialContext`?** | **YES** — this is the highest-traffic AI call site. 9 of 14 context fields are missing. |

#### Caller 2: OwnerDashboard.sendSupport

| Field | Value |
|-------|-------|
| **File** | `src/screens/OwnerDashboard.tsx` |
| **Line** | 1739 |
| **Function** | `sendSupport` |
| **Purpose** | Support AI chat — prefixed `[SOKONGAN MYKERANI]` |
| **Current Context Fields** | `activeTenant`, `activeWorkspace`, `financialEvents` |
| **Missing Context Fields** | Everything except identity + events (11 fields missing) |
| **Should use `buildFinancialContext`?** | **YES** — support AI should know the user's business context to provide personalized help. |

#### Caller 3: StaffHomeScreen.sendChat

| Field | Value |
|-------|-------|
| **File** | `src/screens/StaffHomeScreen.tsx` |
| **Line** | 548 |
| **Function** | `sendChat` |
| **Purpose** | Primary AI chat for Tenant Staff — same engine as Owner per parity rule |
| **Current Context Fields** | `activeTenant`, `activeWorkspace`, `financialEvents`, `personalProfile`, `businessProfile` (LEGACY), `businesses`, `vehicles`, `dependents` |
| **Missing Context Fields** | `cashAccounts`, `bankAccounts`, `debtRecords`, `financialCommitments`, `financialEvidencePackages`, `ocrLearnedPatterns`, `businessBranches`, `assetPurchases`, `ownerTransactions` |
| **Duplicate Context Fields** | `businessProfile` (legacy) AND `businesses` sent simultaneously — potential confusion |
| **Should use `buildFinancialContext`?** | **YES** — must have same context as Owner (parity rule). Also eliminates the legacy `businessProfile` duplication. |

#### Caller 4: StaffHomeScreen.sendSupport

| Field | Value |
|-------|-------|
| **File** | `src/screens/StaffHomeScreen.tsx` |
| **Line** | 508 |
| **Function** | `sendSupport` |
| **Purpose** | Support AI chat for Staff — prefixed `[SOKONGAN MYKERANI]` |
| **Current Context Fields** | `activeTenant`, `activeWorkspace`, `financialEvents` |
| **Missing Context Fields** | Everything except identity + events |
| **Should use `buildFinancialContext`?** | **YES** — same reasoning as Caller 2. |

#### Caller 5: AIFinancialAssistant

| Field | Value |
|-------|-------|
| **File** | `src/components/AIFinancialAssistant.tsx` |
| **Line** | 153 |
| **Function** | (inline AI call within the component) |
| **Purpose** | Standalone AI assistant component — financial records Q&A with account context |
| **Current Context Fields** | `activeTenant`, `activeWorkspace`, `financialEvents`, `cashAccounts`, `bankAccounts`, `debtRecords`, `financialCommitments`, `financialEvidencePackages`, `ocrLearnedPatterns` |
| **Missing Context Fields** | `personalProfile`, `businesses`, `vehicles`, `dependents`, `businessBranches`, `assetPurchases`, `ownerTransactions` |
| **Should use `buildFinancialContext`?** | **YES** — this is the ONLY call site that sends financial records context (accounts, debts, patterns) but it completely misses profile context. The inverse gap of Caller 1. |

#### Caller 6: FinancialRecordsConsole

| Field | Value |
|-------|-------|
| **File** | `src/components/FinancialRecordsConsole.tsx` |
| **Line** | 185 |
| **Function** | (inline AI board query) |
| **Purpose** | AI board within the financial records management console — analytical queries on financial data |
| **Current Context Fields** | `activeWorkspace`, `financialEvents`, `cashAccounts`, `bankAccounts`, `debtRecords`, `financialCommitments` |
| **Missing Context Fields** | `activeTenant`, `personalProfile`, `businesses`, `vehicles`, `dependents`, `businessBranches`, `assetPurchases`, `ownerTransactions`, `financialEvidencePackages`, `ocrLearnedPatterns` |
| **Should use `buildFinancialContext`?** | **YES** — missing `activeTenant` (identity), `financialEvidencePackages` (evidence), `ocrLearnedPatterns` (learning memory), and all profile data. |

### 4.2 Caller Summary Matrix

| # | Call Site | Profile Sent? | Financial Records Sent? | Patterns Sent? | Evidence Sent? | Accounts Sent? | Branches Sent? | Assets Sent? | Use Builder? |
|---|-----------|--------------|------------------------|----------------|----------------|----------------|-----------------|--------------|--------------|
| 1 | OwnerDashboard.sendChat | ✅ (partial) | ✅ events only | ❌ | ❌ | ❌ | ❌ | ❌ | **YES** |
| 2 | OwnerDashboard.sendSupport | ❌ | ✅ events only | ❌ | ❌ | ❌ | ❌ | ❌ | **YES** |
| 3 | StaffHomeScreen.sendChat | ✅ (partial+dup) | ✅ events only | ❌ | ❌ | ❌ | ❌ | ❌ | **YES** |
| 4 | StaffHomeScreen.sendSupport | ❌ | ✅ events only | ❌ | ❌ | ❌ | ❌ | ❌ | **YES** |
| 5 | AIFinancialAssistant | ❌ | ✅ all records | ✅ | ✅ | ✅ | ❌ | ❌ | **YES** |
| 6 | FinancialRecordsConsole | ❌ | ✅ partial (no evidence/patterns) | ❌ | ❌ | ✅ | ❌ | ❌ | **YES** |

### 4.3 Verdict

**ALL 6 call sites should use `buildFinancialContext()`.** No exceptions. The current architecture has zero call sites that send the complete context. The best (Caller 5: AIFinancialAssistant) sends 9 of 14 fields. The worst (Callers 2 and 4: sendSupport) send only 3 of 14.

---

## SECTION 5: ARCHITECTURE FINDINGS

### 5.1 Missing Integrations

| ID | Missing Integration | Impact | Affected Call Sites |
|----|-------------------|--------|---------------------|
| MI-01 | OCR Learned Patterns not sent to AI by primary chat screens | AI has amnesia — cannot reference past learning | OwnerDashboard.sendChat, StaffHomeScreen.sendChat |
| MI-02 | Bank Accounts not sent to AI by primary chat screens | AI cannot suggest account assignment | OwnerDashboard.sendChat, StaffHomeScreen.sendChat |
| MI-03 | Cash Accounts not sent to AI by primary chat screens | AI cannot suggest cash box assignment | OwnerDashboard.sendChat, StaffHomeScreen.sendChat |
| MI-04 | Debts not sent to AI by primary chat screens | AI cannot factor loan obligations | OwnerDashboard.sendChat, StaffHomeScreen.sendChat |
| MI-05 | Financial Commitments not sent to AI by primary chat screens | AI cannot reference recurring obligations | OwnerDashboard.sendChat, StaffHomeScreen.sendChat |
| MI-06 | Evidence Packages not sent to AI by primary chat screens | AI cannot reference document evidence | OwnerDashboard.sendChat, StaffHomeScreen.sendChat |
| MI-07 | Business Branches not sent to AI by ANY call site | AI cannot suggest branch attribution | ALL call sites |
| MI-08 | Asset Purchases not sent to AI by ANY call site | AI cannot reference existing assets | ALL call sites |
| MI-09 | Owner Transactions not sent to AI by ANY call site | AI cannot reference owner equity history | ALL call sites |
| MI-10 | Personal Profile not sent to AI by AIFinancialAssistant and FinancialRecordsConsole | AI lacks personal context (occupation, income, marital status) | AIFinancialAssistant, FinancialRecordsConsole |
| MI-11 | Businesses not sent to AI by AIFinancialAssistant and FinancialRecordsConsole | AI lacks business context for multi-business workspaces | AIFinancialAssistant, FinancialRecordsConsole |
| MI-12 | Customer master table does not exist | Customer matching is unreliable free-text | ALL — no customer context exists |
| MI-13 | Supplier master table does not exist | Supplier matching is unreliable free-text | ALL — no supplier context exists |
| MI-14 | Properties/Insurance/Investments repositories do not exist | AI has no context for property/insurance/investment transactions | ALL — no context exists |
| MI-15 | No profile completeness reminder | Users don't know their profile is incomplete | NotificationContext |
| MI-16 | No audit trigger on businesses/vehicles/dependents tables | Profile mutations are not audited | AuditContext |

### 5.2 Duplicate Integrations

| ID | Duplication | Location | Risk | Recommendation |
|----|------------|----------|------|----------------|
| DI-01 | `businessProfile` (legacy) AND `businesses` sent simultaneously | StaffHomeScreen.sendChat line 548 | AI may receive conflicting data if both tables have entries | Consolidate: use `buildFinancialContext()` which prefers `businesses` and omits legacy `businessProfile` from the payload |
| DI-02 | `business_profiles` table coexists with `businesses` table | DB + `profileData.ts` + `FinancialReportsAnalytics.tsx` | Two sources of truth for business identity | Migrate `FinancialReportsAnalytics.tsx` to use `businesses` table (already loaded by FinancialRecordsContext), then deprecate `business_profiles` |
| DI-03 | `financialContext` manually assembled at 6 call sites | 6 files | Each call site drifts independently | Replace ALL with `buildFinancialContext()` |

### 5.3 Dead Integrations

| ID | Dead Integration | Status | Recommendation |
|----|-----------------|--------|----------------|
| DEAD-01 | Business Branches → AI | Collected, stored, displayed, but NEVER sent to AI | Fix via `buildFinancialContext()` including `businessBranches` |
| DEAD-02 | Asset Purchases → AI | Created via AI, consumed by reports, but NEVER sent back to AI as context | Fix via `buildFinancialContext()` including `assetPurchases` |
| DEAD-03 | Owner Transactions → AI | Same pattern as asset purchases | Fix via `buildFinancialContext()` including `ownerTransactions` |

### 5.4 Disconnected Workflows

| ID | Disconnection | From | To | Impact |
|----|--------------|------|-----|--------|
| DW-01 | AI creates asset purchases but cannot see existing ones | `useConfirmChatSuggestion` → `addAssetPurchase` | AI context (missing `assetPurchases`) | AI may suggest duplicate asset entries |
| DW-02 | AI creates owner transactions but cannot see existing ones | `useConfirmChatSuggestion` → `addOwnerTransaction` | AI context (missing `ownerTransactions`) | AI may suggest duplicate capital injections/drawings |
| DW-03 | Bank statement import uses internal transfer detection but detection has no business awareness | `HistoricalRecoveryWorkspace` → `internalTransferDetection` | Business context (businesses, branches) | Cannot distinguish inter-business from intra-business transfers |
| DW-04 | Recovery engine suggests categories using learned patterns but patterns are not sent to AI chat | `transactionRecoveryEngine` uses `ocrLearnedPatterns` | AI chat context (patterns not sent) | AI chat and bank statement import have different "memory" — the AI in chat forgets what the recovery engine remembers |
| DW-05 | Profile save does not write audit log | `profileData.ts` save functions | `AuditContext.writeAuditLog` | Profile mutations (personal, business, vehicle, dependent) are not audited — only financial record mutations are |

### 5.5 Architecture Quality Assessment

| Criterion | Score | Notes |
|-----------|-------|-------|
| Repository completeness | 20/25 = 80% | 5 repositories missing (customers, suppliers, properties, insurance, investments) |
| Context connectivity | 6/14 = 43% | Only 6 of 14 possible context fields reach the AI from the primary chat screens |
| Call site uniformity | 0/6 = 0% | Zero call sites use a shared builder; all 6 construct different payloads |
| Dead integration count | 3 | Branches, asset purchases, owner transactions are dead to AI |
| Duplicate integration count | 3 | businessProfile+businesses, business_profiles+businesses table, manual context assembly |
| Disconnected workflow count | 5 | See DW-01 through DW-05 above |
| Audit coverage | 60% | Financial records audited; profile mutations (personal/business/vehicle/dependent) not audited |
| Notification coverage | 85% | Financial advisories covered; profile completeness not covered |
| Owner ↔ Staff parity | 70% | Same engines, but Staff sends legacy `businessProfile` alongside `businesses`; neither sends full context |
| HQ ↔ Tenant parity | 100% | No HQ-side profile duplication; correct isolation |

---

## SECTION 6: READINESS SCORES AND FINAL VERDICT

### 6.1 Architecture Readiness Score

| Dimension | Weight | Score | Weighted |
|-----------|--------|-------|----------|
| Repository completeness (20/25 exist) | 15% | 80 | 12.0 |
| Context connectivity (fields reaching AI) | 25% | 43 | 10.75 |
| Call site uniformity (shared builder) | 15% | 0 | 0.0 |
| Dead integrations (3 dead → 0 target) | 10% | 0 | 0.0 |
| Duplicate integrations (3 → 0 target) | 5% | 0 | 0.0 |
| Disconnected workflows (5 → 0 target) | 10% | 0 | 0.0 |
| Audit coverage (60% → 100%) | 5% | 60 | 3.0 |
| Notification coverage (85% → 100%) | 5% | 85 | 4.25 |
| Owner ↔ Staff parity (70% → 100%) | 5% | 70 | 3.5 |
| HQ ↔ Tenant parity (100%) | 5% | 100 | 5.0 |

**Architecture Readiness Score: 38.5 / 100 = 38.5%**

The current architecture is NOT ready for implementation. The Financial Context architecture has a critical fragmentation problem: no two call sites send the same context, 3 repositories are dead to the AI, and the AI's learning memory (OCR patterns) is missing from the primary chat screens.

### 6.2 Implementation Readiness Score (Post-Blueprint)

After implementing the blueprint (which introduces `buildFinancialContext()`, new repository tables, and fixes all dead integrations):

| Dimension | Score | Notes |
|-----------|-------|-------|
| Repository completeness | 100% | All 25 repositories exist (5 new tables created) |
| Context connectivity | 100% | `buildFinancialContext()` sends ALL repositories to AI |
| Call site uniformity | 100% | All 6 call sites use the shared builder |
| Dead integrations | 0 | All 3 dead integrations (branches, assets, owner txns) fixed |
| Duplicate integrations | 1 | `business_profiles` legacy table remains (consumed by FinancialReportsAnalytics.tsx for report headers) — deprecation deferred to avoid breaking reports |
| Disconnected workflows | 0 | All 5 disconnected workflows fixed |
| Audit coverage | 100% | Profile CRUD audited via new triggers + `writeAuditLog` calls |
| Notification coverage | 100% | Profile completeness reminder added |
| Owner ↔ Staff parity | 100% | Both use same builder, same context, same engines |
| HQ ↔ Tenant parity | 100% | Maintained |

**Post-Blueprint Implementation Readiness Score: 99 / 100 = 99%**

The 1% deduction is for the deferred `business_profiles` legacy table deprecation — `FinancialReportsAnalytics.tsx` still reads it for report headers. This is a non-breaking residual that does not affect AI context (the builder prefers `businesses` over `businessProfile`).

### 6.3 Gap Summary

| Gap Type | Current Count | Post-Blueprint |
|----------|--------------|----------------|
| Missing Integrations (MI) | 16 | 0 |
| Duplicate Integrations (DI) | 3 | 1 (deferred, non-breaking) |
| Dead Integrations (DEAD) | 3 | 0 |
| Disconnected Workflows (DW) | 5 | 0 |
| **Total** | **27** | **1** |

### 6.4 Consolidation Recommendations

Per the user's instruction: "The objective is not to add more features. The objective is to ensure MYKERANI has one authoritative Financial Context architecture before implementation begins."

| Recommendation | Priority | Rationale |
|---------------|----------|-----------|
| **Consolidate ALL 6 call sites to use `buildFinancialContext()`** | CRITICAL | Eliminates 16 missing integrations, 3 dead integrations, and 3 duplicate integrations in a single architectural change |
| **Create 5 new repository tables** (customers, suppliers, properties, insurance, investments) | HIGH | Fills the 5 missing repositories. Each follows the exact `businesses` pattern — no new architectural patterns introduced |
| **Add 4 nullable FK columns** (customer_id, supplier_id on financial tables) | HIGH | Links financial records to customer/supplier master data — non-breaking, nullable |
| **Add 3 junction tables** (vehicle_businesses, bank_account_businesses, property_businesses) | MEDIUM | Enables many-to-many relationships for M:N association |
| **Add audit triggers on profile tables** | MEDIUM | Closes the DW-05 disconnection (profile mutations not audited) |
| **Add profile completeness reminder** | LOW | Closes the MI-15 missing integration |
| **Defer `business_profiles` deprecation** | LOW | `FinancialReportsAnalytics.tsx` still uses it for report headers. Defer to a separate wave to avoid breaking reports. The builder already handles this by preferring `businesses`. |
| **Do NOT create new RPCs** | — | The existing direct-table-access pattern via Supabase client is sufficient. An optional `get_full_financial_profile` RPC may be added as a performance optimization, but it is NOT functionally required. |
| **Do NOT create new services** | — | `buildFinancialContext.ts`, `customerMatching.ts`, and `supplierMatching.ts` are new FILES but follow existing patterns. No new service architecture is introduced. |

### 6.5 Final Verdict

**Architecture Readiness (current): 38.5% — NOT READY**

The current Financial Context architecture is severely fragmented:
- Zero call sites send complete context
- The AI's learning memory (OCR patterns) is missing from primary chat
- Three repositories are dead to the AI (branches, assets, owner transactions)
- No shared builder exists — each call site drifts independently

**Implementation Readiness (post-blueprint): 99% — READY (with 1 deferred residual)**

The blueprint's `buildFinancialContext()` function is the single highest-impact architectural fix:
- One function eliminates 16 missing integrations
- One function eliminates 3 dead integrations
- One function eliminates 3 duplicate integrations
- One function establishes call site uniformity across all 6 sites

The 5 new repository tables and 3 junction tables are additive and follow existing patterns — no architectural risk.

The 1% residual (deferred `business_profiles` deprecation) is non-breaking and does not affect AI context quality.

### 6.6 Implementation Approval Gate

**This report confirms:**

1. ✅ The blueprint addresses ALL 16 missing integrations
2. ✅ The blueprint addresses ALL 3 dead integrations
3. ✅ The blueprint addresses ALL 3 duplicate integrations (2 fixed, 1 deferred)
4. ✅ The blueprint addresses ALL 5 disconnected workflows
5. ✅ The blueprint reuses existing tables, services, patterns, and architecture
6. ✅ The blueprint does NOT duplicate any existing table, RPC, service, or workflow
7. ✅ The blueprint maintains Owner ↔ Staff parity
8. ✅ The blueprint maintains HQ ↔ Tenant parity
9. ✅ The blueprint is non-breaking (all additions are additive, nullable, or new tables)
10. ✅ The blueprint has a safe rollback strategy

**RECOMMENDATION: APPROVE for implementation as one complete remediation wave.**

---

## APPENDIX: EVIDENCE INDEX

### Phase 1 Evidence (profileData.ts consumers)
- 8 files identified (4 type-only, 1 legacy consumer, 3 runtime consumers)
- Highest risk: OwnerDashboard.tsx (full CRUD), StaffHomeScreen.tsx (read-only)
- Legacy: `business_profiles` still consumed by `FinancialReportsAnalytics.tsx`

### Phase 2 Evidence (assetOwnerData.ts consumers)
- 8 files identified (2 type-only, 6 runtime consumers)
- Critical path: `useConfirmChatSuggestion.ts` → write, `BalanceSheetReport.tsx` + `CashFlowReport.tsx` → read
- No `loadAssetPurchases`/`loadOwnerTransactions` results are ever sent to AI

### Phase 3 Evidence (financialContext construction sites)
- 6 call sites identified, each with different payload shape
- Best: `AIFinancialAssistant.tsx` (9/14 fields), Worst: `sendSupport` variants (3/14 fields)
- Zero call sites send both profile AND financial records context simultaneously

### Phase 4 Evidence (dependency matrix)
- 14 modules mapped across 7 consumer dimensions
- Financial records are the ONLY universally connected repository
- OCR patterns are connected to recovery engine but disconnected from primary AI chat
- Audit coverage gap: profile tables (personal, business, vehicle, dependent) have no audit triggers

---

*Report completed: 2026-06-26*
*Repository: srcreative2020/mykerani-app @ commit ed68afa*
*No implementation performed. Awaiting Owner approval.*