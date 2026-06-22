# MyKerani — Report Stack Readiness V1

**Date:** 2026-06-22
**Scope:** Validation/UAT of the 6-report stack (P&L, Balance Sheet, Cash Flow, Financial Health, Loan Readiness, LHDN Readiness). Validation only — no UI changes, no `ProfitLossReport.tsx` changes, no new features.

---

## 1. Summary Table

| Report Type | Readiness Score | Grade | PASS / WARNING / FAIL | Status |
|---|---|---|---|---|
| Profit & Loss V1 | 92% | STABLE | 70 / 0 / 0 *(carried forward — not re-audited)* | STABLE |
| Balance Sheet V1 | — | **NOT BALANCED** | 21 / 0 / 7 | **FAIL — structural gap found** |
| Cash Flow V1 | 100% | STABLE | 28 / 0 / 0 | STABLE |
| Financial Health V1 | 100% | STABLE | 28 / 0 / 0 | STABLE |
| Loan Readiness V1 | 100% | STABLE | 28 / 0 / 0 | STABLE |
| LHDN Readiness V1 | 80% | STABLE (with known gap) | 28 / 7 / 0 | STABLE, 1 known gap |

P&L figure is cited as-is per instruction; it was not re-audited in this pass.

---

## 2. Per-Report Detail

### 2.1 Profit & Loss V1 — carried forward, not re-audited
Per the user's explicit instruction, P&L was **not** re-validated in this sprint. Its existing status (92%, 70/70 PASS, STABLE, from `scripts/validatePnlUat.ts`) is cited as-is. Running the existing script in this pass reproduces 70/70 PASS, 0 WARNING, 0 FAIL, confirming no regression was introduced by the new modules added alongside it (`cashFlowClassifier.ts`, `loanReadiness.ts`, `lhdnReadiness.ts`).

### 2.2 Balance Sheet V1 — `scripts/validateBalanceSheet.ts`
**What was validated:** `buildReportBuckets` (all-time, no date filter) → `getBalanceSheetTieOut` / `getRetainedEarnings` / `getProfitAndLossSubtotals`, across 7 scenarios with debt records, financial commitments, asset purchases, and owner transactions added.

**Key formulas verified:**
- Retained Earnings == `getProfitAndLossSubtotals(buckets).operatingProfit` — **holds exactly in all 7 scenarios** (Check 2: 7/7 PASS).
- `Assets = Liabilities + Equity + RetainedEarnings` tie-out — **fails in every scenario that has any cash/bank balance** (Check 1: 5 FAIL out of 7 scenarios; Check 4's negative-profit variant also fails for the same underlying reason).
- Empty-data scenario produces an all-zero, balanced sheet with no NaN — PASS.

**Root cause of the FAILs (genuine product finding, not a test bug):**
`buildReportBuckets()`'s `ReportBucketAggregatorInput` only accepts `financialEvents`, `debtRecords`, `financialCommitments`, `assetPurchases`, `ownerTransactions` — there is no cash/bank-account input. Tracing `reportClassificationEngine.ts`, the `ASSETS` Level-1 group is only ever populated by `RECEIVABLE` events and `ASSET_PURCHASE` records (`RECEIVABLE: "ASSETS"`, `ASSET_PURCHASE: "ASSETS"` — confirmed by direct source read). **Cash and bank account balances never enter the Balance Sheet's ASSETS bucket at all.** This is confirmed live in `src/components/BalanceSheetReport.tsx`, which calls `buildReportBuckets({ financialEvents, debtRecords, financialCommitments, assetPurchases, ownerTransactions })` — no cash/bank accounts passed in.

Practical effect: any business that holds cash-in-hand or a bank balance (i.e. nearly every real business) will see a Balance Sheet that visibly does not balance, because real-world Liabilities/Equity/Retained Earnings exist against an Assets side that is missing its largest typical component (cash/bank holdings). The scenarios that *did* pass (Scenario 7, Empty Data) only passed because there was nothing on either side to begin with — not because the tie-out logic is sound for a populated business.

This is **not** a flaw in the tie-out arithmetic itself (`getBalanceSheetTieOut` correctly sums whatever is in the buckets) — it is a missing input wiring at the aggregator-input layer.

**Scenario coverage:** Printing, Restaurant/F&B, Service, Retail, Personal Finance, Negative Profit, Empty Data — 7 scenarios x 4 checks = 28 checks.

### 2.3 Cash Flow V1 — `scripts/validateCashFlow.ts`
**What was validated:** `classifyCashFlowActivity`, `getCashFlowActivityTotals`, `groupRecordsByActivity` against `buildReportBuckets`/`flattenBuckets` output, across 7 scenarios.

**Key formulas verified:**
- Every bucketed record receives exactly one of `OPERATING`/`INVESTING`/`FINANCING` — 7/7 PASS.
- `getCashFlowActivityTotals` sums reconcile exactly to `groupRecordsByActivity` group sums — 7/7 PASS.
- Record-kind → activity mapping matches the documented design: `ASSET_PURCHASE` → INVESTING; `DEBT_RECORD`/`OWNER_TRANSACTION` → FINANCING; `FINANCIAL_EVENT`/`FINANCIAL_COMMITMENT` → OPERATING — 7/7 PASS.
- Empty data produces all-zero totals with no NaN — PASS.

**Result: 28/28 PASS, 0 WARNING, 0 FAIL.** Fully stable.

### 2.4 Financial Health V1 — `scripts/validateFinancialHealth.ts`
**What was validated:** `computeFinancialHealthScoring` vs. `computeFinancialHealthV1` (the additive wrapper), across 7 scenarios with varying cash/bank balances, debts, commitments, evidence-coverage ratios, and category completeness mixes.

**Key formulas verified:**
- V1's `cashHealth.quickRatio/quickGrade`, `debtHealth.solvencyRatio/solvencyGrade`, `commitmentHealth.runwayMonths/runwayGrade` exactly match the base scoring's equivalent fields in all 7 scenarios — proving the wrapper introduces zero behavior drift to the existing, already-shipped Health tab and advisory alert engine.
- `evidenceCoveragePct == evidenceCoverageRatio * 100` exactly, for ratios ranging 0 to 1.
- `dataCompletenessPct` correctly excludes records with empty or `"Lain-lain"` `categoryName` (verified against a hand-derived expected percentage per scenario).
- Empty data produces `dataCompletenessPct = 0`, no NaN/crash, and the documented `runwayMonths = 999` sentinel for zero active commitments.

**Result: 28/28 PASS, 0 WARNING, 0 FAIL.** Fully stable.

### 2.5 Loan Readiness V1 — `scripts/validateLoanReadiness.ts`
**What was validated:** `computeFinancialHealthScoring` → `computeLoanReadiness`, across 7 scenarios including a deliberately overdue debt (Retail), inconsistent monthly income (Service, Negative Profit), and an `EMPTY_BUSINESS_PROFILE` case (Personal Finance, Empty Data).

**Key formulas verified:**
- All 6 checks (`registration`, `solvency`, `runway`, `debt_repayment`, `receivables_quality`, `income_consistency`) present in every scenario, each with a boolean `pass` and a non-empty `detail` string.
- `scorePct == passedCount / totalChecks * 100` exactly, in all 7 scenarios.
- `EMPTY_BUSINESS_PROFILE` correctly fails the `registration` check (verified in Personal Finance and Empty Data scenarios).
- Empty data does not crash and produces a defined, non-empty `scoreGrade`.

**Result: 28/28 PASS, 0 WARNING, 0 FAIL.** Fully stable.

### 2.6 LHDN Readiness V1 — `scripts/validateLhdnReadiness.ts`
**What was validated:** `computeLhdnReadiness`, across 7 scenarios including a 12-month evidence-linked dataset (Printing, used as the "known linkage" hand-computation case), partial-coverage data (Service: only 8/12 months), uncategorized "Lain-lain" records (Retail), and `EMPTY_BUSINESS_PROFILE` (Empty Data).

**Key formulas verified:**
- All 6 checks (`registration`, `income_evidence`, `expense_evidence`, `categorized`, `coverage`, `industry`) present in every scenario with boolean `pass` + detail.
- `scorePct` formula exact in all 7 scenarios.
- Hand-computed evidence linkage check (Printing scenario): 12/12 income records linked to evidence → `incomeEvidencePct = 100`; 6/12 expense records linked → `expenseEvidencePct = 50`. Both match the function's actual output exactly.
- Empty data produces 0% for all derived percentages with no NaN/crash.

**Known gap, explicitly surfaced (not a defect):**
> TIN Status check is not implemented — BusinessProfile has no dedicated TIN field, registrationNo (SSM proxy) is reused instead. Known gap, not a defect.

This WARNING is recorded once per scenario (7 occurrences total) in the script's output, matching the honest gap already documented in the header comment of `src/lib/lhdnReadiness.ts` itself — adding a dedicated TIN field is a schema change, correctly out of scope for this validation-only sprint.

**Result: 28 PASS / 7 WARNING / 0 FAIL** (the 7 WARNINGs are all the same TIN-gap notice, one per scenario).

---

## 3. Full FAIL / WARNING List

### FAILs (1 systemic issue, 7 occurrences across Balance Sheet scenarios)

| # | Report | Scenario(s) | Check | Detail |
|---|---|---|---|---|
| 1 | Balance Sheet | Printing | Balance Sheet Tie-Out | Assets=RM22,000.00 vs Liabilities+Equity+RE=RM26,700.00, diff=-RM4,700.00 |
| 2 | Balance Sheet | Restaurant/F&B | Balance Sheet Tie-Out | Assets=RM6,500.00 vs RM40,100.00, diff=-RM33,600.00 |
| 3 | Balance Sheet | Service | Balance Sheet Tie-Out | Assets=RM9,000.00 vs RM19,200.00, diff=-RM10,200.00 |
| 4 | Balance Sheet | Retail | Balance Sheet Tie-Out | Assets=RM0.00 vs RM24,300.00, diff=-RM24,300.00 |
| 5 | Balance Sheet | Personal Finance | Balance Sheet Tie-Out | Assets=RM0.00 vs RM5,150.00, diff=-RM5,150.00 |
| 6 | Balance Sheet | Negative Profit | Balance Sheet Tie-Out | Assets=RM0.00 vs RM5,900.00, diff=-RM5,900.00 |
| 7 | Balance Sheet | Negative Profit | Negative Profit Still Ties Out | RetainedEarnings correctly negative (-RM1,600.00), but sheet does not balance for the same root-cause reason |

**Root cause (single issue, all 7 are symptoms of it):** Cash and bank account balances are never fed into `buildReportBuckets()` and are structurally excluded from the `ASSETS` Level-1 group in `reportClassificationEngine.ts` (only `RECEIVABLE` events and `ASSET_PURCHASE` records resolve to `ASSETS`). The Empty Data scenario (Scenario 7) passed only because it has nothing on either side of the equation.

### WARNINGs (1 known, accepted gap, 7 occurrences — one per LHDN scenario)

| Report | Scenario | Detail |
|---|---|---|
| LHDN Readiness | All 7 scenarios | TIN Status check is not implemented — BusinessProfile has no dedicated TIN field, registrationNo (SSM proxy) is reused instead. Known gap, not a defect. |

---

## 4. Bug-Fix Sprint Suggestions (prioritized)

Only one FAIL category exists, with one clear root cause. Priority order:

1. **(P0 — blocks Balance Sheet from ever being trustworthy for a real business)** Extend `ReportBucketAggregatorInput` (in `src/lib/reportBucketAggregator.ts`) to accept `cashAccounts: CashAccount[]` and `bankAccounts: BankAccount[]`, and add a corresponding `fromCashAccount`/`fromBankAccount` resolution path in `reportClassificationEngine.ts` that resolves to the `ASSETS` Level-1 group (mirroring how `RECEIVABLE` and `ASSET_PURCHASE` already do). Then update `src/components/BalanceSheetReport.tsx` to load and pass `cashAccounts`/`bankAccounts` through, the same way it already loads `assetPurchases`/`ownerTransactions` via `loadAssetPurchases`/`loadOwnerTransactions`. This is additive (new optional input arrays, new resolution branch) and should not require touching P&L or Cash Flow, since neither currently reads the `ASSETS` bucket the same way.
2. **(P1 — cosmetic/documentation only)** Once (1) is fixed, re-run `scripts/validateBalanceSheet.ts` to confirm the tie-out check now passes across all 7 scenarios; no change needed to the validation script itself, since the FAILs it surfaced are correct given the current (incomplete) wiring.
3. **(P3 — accepted, no fix scheduled)** LHDN's TIN Status gap is a schema-addition decision, not a code defect; only revisit if/when a dedicated TIN field is added to `BusinessProfile` in a future, explicitly-scoped sprint.

If zero FAILs had been found, this section would simply note the LHDN TIN-field WARNING as the only outstanding candidate for future work — that remains true as item 3 above; the Balance Sheet item is the only true FAIL requiring engineering action.

---

## 5. Closing Note

Selepas laporan ini, tidak ada audit lanjut buat masa ini. Financial Recovery Sprint adalah fasa seterusnya, menunggu arahan.
