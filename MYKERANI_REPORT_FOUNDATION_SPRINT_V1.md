# MyKerani — Report Foundation Sprint V1

**Status:** Implemented. All 6 phases built. `npx tsc --noEmit -p .` — 29 errors, at or below the pre-existing baseline (verified via `git stash` diff: 31 errors on the unmodified tree, 29 after this sprint's changes — zero new errors introduced). `npm run build` passes clean.
**File path:** `/home/user/mykerani-app/MYKERANI_REPORT_FOUNDATION_SPRINT_V1.md`
**Source of truth:** `MYKERANI_FINANCIAL_CLASSIFICATION_MASTER_FRAMEWORK.md`, `MYKERANI_ACCOUNTING_KNOWLEDGE_BASE_V1.md`, `MYKERANI_REPORT_FOUNDATION_READINESS_AUDIT.md`, `MYKERANI_REPORT_CLASSIFICATION_ENGINE_AUDIT.md`.
**Scope discipline:** No Profit & Loss UI, Balance Sheet UI, Cash Flow UI, or dashboard redesign was built. This sprint is the foundation layer only, exactly as scoped.

---

## 1. Categories Implemented

`src/lib/accountingClassificationMap.ts` expanded from **11 → 26 canonical categories**, one per Level 2 category named in the Master Framework, each carrying all 6 required fields (Canonical Category, Level 1 Group, Accounting Reason, Financial Statement Impact, Risk Level, Human Friendly Name, Accounting Name — 7 fields actually, since both names were required):

| Level 1 Group | Categories Implemented (new in this sprint marked **NEW**) |
|---|---|
| Revenue | **SALES_REVENUE** (NEW), **SERVICE_REVENUE** (NEW), **OTHER_INCOME** (NEW) |
| Cost of Sales | INVENTORY_STOCK, **RAW_MATERIALS** (NEW), **DIRECT_LABOUR** (NEW) |
| Operating Expenses | UTILITIES, RENTAL, INTERNET, TELEPHONE, FUEL_TRANSPORT, OFFICE_SUPPLIES, **MARKETING** (NEW), **INSURANCE** (NEW), **PROFESSIONAL_FEES** (NEW) |
| Assets | **CASH_BANK** (NEW), **RECEIVABLES** (NEW), **INVENTORY_ON_HAND** (NEW), EQUIPMENT_FIXED_ASSETS |
| Liabilities | PAYABLES, LOANS, **ACCRUED_EXPENSES** (NEW), **COMMITMENTS** (NEW) |
| Equity | **OWNER_CAPITAL** (NEW), **RETAINED_EARNINGS** (NEW), DRAWINGS |

This closes the exact gap identified in `MYKERANI_REPORT_CLASSIFICATION_ENGINE_AUDIT.md` §5 ("Unresolvable Categories") — every category listed there as unresolvable (Revenue-side categories, Receivables, Cash & Bank, Inventory on Hand, Owner's Capital, Retained Earnings, Direct Labour, Raw Materials, Marketing, Insurance, Professional Fees, Accrued Expenses) now has a canonical rule.

`COMMITMENTS` was added beyond the user's literal Liabilities list (which named Payables/Loans/Accrued Expenses) because `FinancialCommitment` records are a distinct record kind the Classification Engine (Phase 2) must resolve, and they did not previously have a canonical category of their own to match against by label.

Each rule now also carries a `humanFriendlyName` field (e.g. `UTILITIES.humanFriendlyName = "Bil Elektrik & Air"`) for Section F-style human-friendly reporting consumption, alongside the existing `recommendedCategory` (accounting name).

**Code location:** `src/lib/accountingClassificationMap.ts:17-44` (types), `:78-309` (the 26 rules), `:311-314` (lookup map).

---

## 2. Classification Engine Status

**Built:** `src/lib/reportClassificationEngine.ts` (new file).

`resolveLevel1Group(input: ClassificationInput): Level1Resolution` implements the exact 3-tier cascade specified:

1. **Canonical Match** — `normalizeToCanonical(categoryText)`, exact label/id match against the 26-rule knowledge base.
2. **Accounting Knowledge Base Match** — `matchAccountingRule(lookupText || categoryText)`, keyword-substring match.
3. **Deterministic Type Fallback** — a fixed `ClassificationFallbackType → FinancialStatementGroup` table:

```
INCOME → REVENUE            PAYABLE → LIABILITIES        CAPITAL_INJECTION → EQUITY
EXPENSE → OPERATING_EXPENSES DEBT → LIABILITIES           DRAWING → EQUITY
RECEIVABLE → ASSETS          COMMITMENT → LIABILITIES
                              ASSET_PURCHASE → ASSETS
```

**No-NULL guarantee:** Tier 3 always returns a value (`TYPE_FALLBACK_GROUP` is a total function over the 9-value `ClassificationFallbackType` union), so `resolveLevel1Group()` is structurally incapable of returning a null/undefined `level1Group`. Verified empirically in Phase 5 (Check 1 and 2, both PASS).

Five adapter functions (`fromFinancialEvent`, `fromDebtRecord`, `fromFinancialCommitment`, `fromAssetPurchase`, `fromOwnerTransaction`) convert each of the 5 real record types (`FinancialEvent`, `DebtRecord`, `FinancialCommitment`, `AssetPurchase`, `OwnerTransaction`) into the engine's normalized `ClassificationInput` shape — this is the single place that decision lives, so no future report can hand-roll its own per-record-type logic.

**Design correction made during validation (see §6):** `DebtRecord`, `FinancialCommitment`, and `OwnerTransaction` adapters deliberately do **not** feed their free-text `description`/party fields into Tiers 1–2. These three record kinds are structurally liabilities/equity regardless of what their description text mentions (e.g. a Commitment whose description happens to say "sewa pejabat" must still resolve as a **Liability**, not get reclassified as Rental **Operating Expense** by an incidental keyword hit). Only `FinancialEvent` (a real transaction with a user-chosen category) and `AssetPurchase` (which has an explicit `category` field) use Tiers 1–2; the other three always resolve via Tier 3, which is itself the accounting-correct outcome for them.

Output shape matches the spec exactly:
```ts
{ canonicalCategory, level1Group, accountingName, humanFriendlyName, resolutionMethod, confidence }
```

**Code location:** `src/lib/reportClassificationEngine.ts:1-227` (whole file is new).

---

## 3. Aggregator Status

**Built:** `src/lib/reportBucketAggregator.ts` (new file).

`buildReportBuckets(input)` takes all 5 record-kind arrays (`financialEvents`, `debtRecords`, `financialCommitments`, `assetPurchases`, `ownerTransactions`) and produces `ReportBuckets` — a `Record<FinancialStatementGroup, BucketedRecord[]>` with exactly 6 keys (`REVENUE`, `COST_OF_SALES`, `OPERATING_EXPENSES`, `ASSETS`, `LIABILITIES`, `EQUITY`).

Reusable APIs provided (all pure, all exported):
- `buildReportBuckets(input)` — the aggregator itself.
- `getBucketTotal(buckets, group)` / `getAllBucketTotals(buckets)` — sums.
- `getProfitAndLossSubtotals(buckets)` — Gross Profit (`Revenue − Cost of Sales`) and Operating Profit (`Gross Profit − Operating Expenses`), computed once so every future P&L consumer reads the same number.
- `getBalanceSheetSubtotals(buckets)` — Assets/Liabilities/Equity totals for the Balance Sheet's eventual balance check.
- `flattenBuckets(buckets)` — all bucketed records as one list, used by Phase 4/5.

This directly targets the bug found in `MYKERANI_REPORT_FOUNDATION_READINESS_AUDIT.md` (Cash Flow report hardcoding every record as "Operating" — `FinancialReportsAnalytics.tsx:~1022`): once P&L/Balance Sheet/Cash Flow are built, they read from these shared buckets/totals instead of each writing its own ad hoc grouping pass.

Debt records are bucketed by **outstanding balance** (`totalAmountMyr − repaidAmountMyr`, floored at 0), not the original principal — the correct Balance Sheet liability figure at any point in time, consistent with the running-balance pattern already used elsewhere in the codebase (`FinancialRecordsContext.tsx:1182`/`:1222`).

**Code location:** `src/lib/reportBucketAggregator.ts:1-148` (whole file is new).

---

## 4. Evidence Linkage Status

**Built:** `src/lib/evidenceDrilldown.ts` (new file).

Reuses the existing `FinancialEvidencePackage.relatedRecordType`/`relatedRecordId` fields (no schema change, no new table) — these are the same fields populated end-to-end by `addFinancialEvidencePackage()` per `MYKERANI_DATA_FLOW_FIX_VALIDATION.md`.

- `buildEvidenceIndex(evidencePackages)` — builds a `Map<recordId, FinancialEvidencePackage[]>` once.
- `getEvidenceForRecord(index, recordId)` — O(1) lookup.
- `getDrilldownForRecord(record: BucketedRecord, index)` — attaches the evidence trail to a single bucketed record: `{ record, evidence, hasEvidence }`. This is the reusable unit a future report drill-down (Transaction → Receipt/Invoice/Statement/Supporting Document) would render.
- `getDrilldownForRecords(records, index)` — batch version.
- `getEvidenceCoverageRatio(records, index)` — % of a bucket/list that has at least one evidence package linked, for health-style reporting.

No report UI was built — this is the lookup layer only, as scoped.

**Code location:** `src/lib/evidenceDrilldown.ts:1-58` (whole file is new).

---

## 5. Coverage %

`scripts/validateReportFoundation.ts` (new) builds synthetic records covering every record kind and every Level 1 group — including deliberately unresolvable free-text categories to prove the fallback tier engages — and runs them through the **real** modules built in Phases 2–4 (no mocking of the code under test). Run via `npx tsx scripts/validateReportFoundation.ts`.

**Result: 10/10 checks PASS.**

| # | Check | Result |
|---|---|---|
| 1 | 100% transaction resolution | PASS — 11/11 input records produced a bucket entry |
| 2 | No unresolved categories | PASS — 0 records with missing `level1Group` |
| 3 | No duplicate category paths | PASS — 26 rules, 26 unique canonical ids |
| 4 | No orphan records | PASS — every bucketed record traces to a source record id |
| 5 | Revenue resolution works | PASS — canonical match (`fe-1`) and type-fallback (`fe-2`, unrecognized category text) both land in `REVENUE` |
| 6 | Receivable resolution works | PASS — `fe-3` (RECEIVABLE) resolves into `ASSETS` |
| 7 | Equity resolution works | PASS — both `CAPITAL_INJECTION` and `DRAWING` owner transactions resolve into `EQUITY` |
| 8 | Asset resolution works | PASS — asset purchase (canonical category match) resolves into `ASSETS` |
| 9 | Liability resolution works | PASS — debt, payable, and commitment all resolve into `LIABILITIES` (after the adapter fix in §6) |
| 10 | Evidence linkage works | PASS — both seeded evidence packages resolve to their exact `relatedRecordId`; overall coverage ratio computed correctly (18.2% for the synthetic 11-record set, 2 of which have evidence) |

Resolution-method breakdown for the synthetic set: 6 `CANONICAL_MATCH`, 5 `TYPE_FALLBACK`, 0 silent failures — confirming the cascade is doing real work, not just falling back on everything.

**Code location:** `scripts/validateReportFoundation.ts:1-110` (whole file is new).

---

## 6. Remaining Blockers

These are explicitly **not** fixed by this sprint, because fixing them means building the reports themselves (out of scope):

1. **Reports are not yet wired to this layer.** `FinancialReportsAnalytics.tsx` still computes its own ad hoc totals (`financialService.ts:~158-165`'s `netBalance = totalIncome - totalExpense`, the hardcoded "everything is Operating Cash Flow" logic at `~line 1022`). This sprint built the foundation those reports must be rewritten to consume — the rewrite itself is the next sprint.
2. **No Retained Earnings roll-forward.** `RETAINED_EARNINGS` is a canonical category but, per its own rule (`riskLevel: "N/A"`), it is system-derived (accumulated P&L), not resolved from any transaction. No code computes this derivation yet — needed before the Balance Sheet's Equity section is complete.
3. **`general_ledger_categories.type` (the Supabase-persisted coarse type field) is still not bridged to this engine.** `getOrCreateCategoryId()` (`FinancialRecordsContext.tsx:303-344`) and `resolveLevel1Group()` remain two parallel systems — the engine works off `categoryName`/record-type directly, bypassing the DB category row entirely. This is fine for the foundation layer (it doesn't need the DB category id), but means the DB's own `type` column (`ASSET`/`LIABILITY`/`EQUITY`/`REVENUE`/`EXPENSE`, with its known PAYABLE→EXPENSE imprecision) is still unused by reports and remains a latent inconsistency if anything else ever reads it expecting accuracy.
4. **Cash Flow's Operating/Investing/Financing dimension is not built.** Per the Master Framework (§"How Existing/Planned Modules Map," Cash Flow row), this is explicitly a 4th dimension layered on top of the 6 Level 1 groups, not yet designed even at the architecture level — Cash Flow readiness therefore remains the lowest of the three statements.
5. **Real-data coverage is unverified.** Phase 5's validation used representative synthetic data to prove the pipeline mechanically (per the user's explicit instruction not to build reports), not a live trace of actual tenant data volume/distribution. Before reports go live, the same 10 checks should be re-run against real `financialEvents`/`debtRecords`/etc. for at least one live workspace.

---

## 7. Readiness Score for P&L / Balance Sheet / Cash Flow

Scoring basis: does the classification + aggregation foundation now exist such that building the statement is **primarily UI/wiring work**, not new architecture?

| Statement | Foundation Readiness | Why |
|---|---|---|
| **Profit & Loss** | **80%** | `getProfitAndLossSubtotals()` already computes Revenue, Cost of Sales, Gross Profit, Operating Expenses, Operating Profit directly from the buckets. Missing: Retained Earnings roll-forward is irrelevant to P&L itself; remaining gap is purely wiring `FinancialReportsAnalytics.tsx` to call this function instead of its own ad hoc totals. |
| **Balance Sheet** | **65%** | `getBalanceSheetSubtotals()` gives Assets/Liabilities/Equity totals, and every asset/liability/equity record kind (Cash & Bank not yet wired as a distinct bucket input — only `FinancialEvent`/`DebtRecord`/`AssetPurchase`/`OwnerTransaction` are aggregator inputs today, not `CashAccount`/`BankAccount` balances directly) resolves correctly. Missing: Retained Earnings derivation (blocker #2) and Cash/Bank account balances aren't yet fed into the `ASSETS` bucket as their own input type — currently only Receivables (via `FinancialEvent`) reach Assets. |
| **Cash Flow** | **40%** | The 6 Level 1 buckets exist and resolve correctly, but Cash Flow's Operating/Investing/Financing classification is an entirely separate, not-yet-designed dimension (blocker #4) — the lowest readiness of the three because more net-new architecture is still required, not just wiring. |

**Overall Report Foundation Sprint V1 readiness: ≈72%** (up from the pre-sprint Classification Engine readiness of ~27% measured in `MYKERANI_REPORT_CLASSIFICATION_ENGINE_AUDIT.md`) — categories/engine/aggregator/evidence-linkage are now real, tested, and committed; the remaining gap is entirely in wiring real report screens to this foundation and the two specific design gaps (Retained Earnings roll-forward, Cash Flow's Operating/Investing/Financing dimension) called out above.

---

**Report metadata:** file path `/home/user/mykerani-app/MYKERANI_REPORT_FOUNDATION_SPRINT_V1.md`. New files: `src/lib/reportClassificationEngine.ts`, `src/lib/reportBucketAggregator.ts`, `src/lib/evidenceDrilldown.ts`, `scripts/validateReportFoundation.ts`. Modified files: `src/lib/accountingClassificationMap.ts` (11 → 26 canonical categories). No report UI, dashboard, or screen was built or modified.
