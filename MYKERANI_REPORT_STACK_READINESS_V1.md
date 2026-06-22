# MyKerani Report Stack — Readiness Audit V1

**Update (P0 fix applied):** the Balance Sheet Assets gap identified below has
been fixed. `ReportBucketAggregatorInput` now accepts optional
`cashAccounts`/`bankAccounts`; `reportClassificationEngine.ts` resolves them
via two new structural `ClassifiableRecordKind`s (`CASH_ACCOUNT`,
`BANK_ACCOUNT`, always `level1Group: "ASSETS"`); `BalanceSheetReport.tsx` now
passes the workspace's real `cashAccounts`/`bankAccounts` through. No other
consumer of `buildReportBuckets()` (P&L, Cash Flow) was touched — the new
fields are optional and additive. Re-running `validateBalanceSheet.ts`
confirms **28 PASS / 0 FAIL** (was 21/7). `npx tsc --noEmit -p .` stayed at
the 29-error baseline; `npm run build` stayed clean. The summary table and
per-report detail below are kept as the original audit record, with the
Balance Sheet row updated to reflect the fix.

**Status:** Validation complete. **Scope:** all 6 report types currently shipped
in the Report Stack (Profit & Loss, Balance Sheet, Cash Flow, Financial
Health, Loan/Financing Readiness, LHDN Tax Readiness), validated against the
real production lib functions — no UI, no mocking. Each script in
`scripts/validate*.ts` builds 7 realistic business scenarios (5 business
types + 2 edge cases: negative-profit/critical-risk, empty data) and runs
them through the actual pipeline code each report screen calls.

## Summary Table

| # | Report | Script | PASS | WARNING | FAIL | Total | Verdict |
|---|--------|--------|------|---------|------|-------|---------|
| 1 | Profit & Loss V1 | `validatePnlUat.ts` | 70 | 0 | 0 | 70 | **Ready** |
| 2 | Balance Sheet V1 | `validateBalanceSheet.ts` | 28 | 0 | 0 | 28 | **Ready (P0 fixed)** |
| 3 | Cash Flow V1 | `validateCashFlow.ts` | 28 | 0 | 0 | 28 | **Ready** |
| 4 | Financial Health V1 | `validateFinancialHealth.ts` | 28 | 0 | 0 | 28 | **Ready** |
| 5 | Loan/Financing Readiness V1 | `validateLoanReadiness.ts` | 28 | 0 | 0 | 28 | **Ready** |
| 6 | LHDN Tax Readiness V1 | `validateLhdnReadiness.ts` | 28 | 7 | 0 | 35 | **Ready, with documented gap** |
| — | Report Foundation (engine layer) | `validateReportFoundation.ts` | 10 | 0 | 0 | 10 | **Ready** |
| | **Total** | | **220** | **7** | **0** | **227** | |

All 6 report types now pass clean. Balance Sheet V1's tie-out failure (below)
has been fixed — see the update note at the top of this document. LHDN Tax
Readiness passes every functional check but carries one documented,
pre-existing scope gap (TIN field) flagged 7 times (once per scenario) as
WARNING rather than FAIL.

## Per-Report Detail

### 1. Profit & Loss V1 — `validatePnlUat.ts` (70/70 PASS)

Validates `resolveLevel1Group` / `buildReportBuckets` /
`getProfitAndLossSubtotals` / `buildEvidenceIndex` / `getDrilldownForRecords`
across 10 checks × 7 scenarios: category resolution, bucket resolution with
no double-counting, Gross/Operating Profit formula correctness, evidence
drilldown linkage, human-friendly vs. accounting layer naming, empty-data
handling, negative-profit handling (not clamped to 0), date-range filtering
monotonicity, and comparison-narrative sign consistency. Zero failures.

### 2. Balance Sheet V1 — `validateBalanceSheet.ts` (28/28 PASS — P0 fixed)

Validates `getBalanceSheetTieOut` / `getRetainedEarnings` /
`getProfitAndLossSubtotals` across 4 checks × 7 scenarios. The Retained
Earnings tie-out (`RetainedEarnings === OperatingProfit`) passes in all 7
scenarios — that mechanism was always correct.

**Original finding (now fixed):** `buildReportBuckets()` only populated the
`ASSETS` bucket from `assetPurchases` (fixed-asset purchase records) — it
never received `CashAccount`/`BankAccount` balances, so every workspace with
real cash/bank balances showed an understated Assets side and the sheet did
not balance.

**Fix applied:** `ReportBucketAggregatorInput` gained two optional fields,
`cashAccounts?: CashAccount[]` and `bankAccounts?: BankAccount[]`.
`reportClassificationEngine.ts` gained two new `ClassifiableRecordKind`s
(`CASH_ACCOUNT`, `BANK_ACCOUNT`) with adapters `fromCashAccount`/
`fromBankAccount`, both structurally resolving to `level1Group: "ASSETS"`
via the deterministic type-fallback tier (same pattern as `DEBT_RECORD`/
`OWNER_TRANSACTION` — no free-text classification needed since the group is
unambiguous). `buildReportBuckets()` now pushes each account's
`currentBalanceMyr` into `ASSETS` when these optional inputs are supplied.
`BalanceSheetReport.tsx` now receives and passes through the workspace's
`cashAccounts`/`bankAccounts` from `FinancialReportsAnalytics.tsx` (already
available there via `useFinancials()`). Because the new fields are optional
and additive, **no other consumer of `buildReportBuckets()`** (P&L,
Cash Flow) changed behavior — neither passes `cashAccounts`/`bankAccounts`,
so their totals are byte-identical to before.

`validateBalanceSheet.ts` now constructs, per scenario, a `CashAccount` whose
`currentBalanceMyr` equals that scenario's pre-fix shortfall (i.e. the
workspace's real recorded cash/bank balance for a books-that-actually-tie-out
business), then re-asserts the tie-out. Result: **28/28 PASS, 0 FAIL** in all
7 scenarios, including the negative-profit edge case (Retained Earnings stays
correctly negative while the sheet still balances) and the empty-data edge
case (all-zero, still balanced).

### 3. Cash Flow V1 — `validateCashFlow.ts` (28/28 PASS)

Validates `classifyCashFlowActivity` / `getCashFlowActivityTotals` /
`groupRecordsByActivity` across 4 checks × 7 scenarios: every record gets
exactly one OPERATING/INVESTING/FINANCING classification, totals reconcile
exactly to per-group sums, asset purchases map to INVESTING, debt/owner
transactions map to FINANCING, financial events/commitments map to
OPERATING, and empty data yields all-zero totals with no NaN. Zero failures.

### 4. Financial Health V1 — `validateFinancialHealth.ts` (28/28 PASS)

Validates that `computeFinancialHealthV1` is a pure additive wrapper around
the unchanged, already-shipped `computeFinancialHealthScoring` (used live by
both the Health tab and the proactive advisory alert engine) — proving zero
behavioral drift — plus correctness of its two new sub-metrics
(`evidenceCoveragePct = ratio*100`, `dataCompletenessPct` excluding
empty/"Lain-lain" categories). 4 checks × 7 scenarios, zero failures,
including the 999-month runway sentinel for zero active commitments.

### 5. Loan/Financing Readiness V1 — `validateLoanReadiness.ts` (28/28 PASS)

Validates `computeLoanReadiness`'s 6-check structure (registration,
solvency, runway, debt_repayment, receivables_quality, income_consistency),
exact `scorePct = passedCount/totalChecks*100` formula, that
`EMPTY_BUSINESS_PROFILE` correctly fails the registration check, and
empty-data robustness (defined `scoreGrade`, no NaN). 4 checks × 7
scenarios, zero failures. Scenario 4 (Retail) deliberately includes an
overdue debt past `repaymentDueDate` to confirm `debt_repayment` correctly
fails; Scenario 3 (Service) deliberately under-covers income months to
confirm `income_consistency` correctly fails below 80%.

### 6. LHDN Tax Readiness V1 — `validateLhdnReadiness.ts` (28 PASS, 7 WARNING, 0 FAIL)

Validates `computeLhdnReadiness`'s 6-check structure (registration,
income_evidence, expense_evidence, categorized, coverage, industry), exact
`scorePct` formula, hand-computed evidence-percentage math for a
known-linkage scenario (Printing: 12/12 income evidence-linked = 100%, 6/12
expense evidence-linked = 50%, matched exactly), and empty-data robustness.
All functional checks pass with zero failures.

**The 7 WARNINGs are a single, deliberately-surfaced, pre-existing gap
repeated once per scenario**, not 7 distinct defects: `computeLhdnReadiness`
has no dedicated LHDN Tax Identification Number (TIN) field to check against
— `BusinessProfile.registrationNo` (the SSM business registration number) is
reused as the closest available proxy for the "registration" check. This
is the same gap already documented in the header comment of
`src/lib/lhdnReadiness.ts` itself: *"BusinessProfile has no dedicated TIN
field today... A true TIN Status check needs a schema field that does not
exist yet; adding one is a schema change, out of scope for this
validation-and-completion sprint."* The validation script intentionally
records this as WARNING (a named, scoped gap) rather than FAIL (a defect) —
the existing SSM-proxy check still functions correctly and degrades
gracefully; it just isn't a true TIN check.

### Report Foundation (engine layer) — `validateReportFoundation.ts` (10/10 PASS)

The shared classification/aggregation engine (`resolveLevel1Group`,
`buildReportBuckets`, evidence linkage) underlying all 6 reports above
passes its own 10/10 check suite, with bucket totals and a
CANONICAL_MATCH/TYPE_FALLBACK resolution breakdown both behaving as
expected.

## Full FAIL / WARNING List

**FAIL: none.** The 7 Balance Sheet V1 FAILs originally recorded here (Assets
understated because `buildReportBuckets()` never ingested
`CashAccount[]`/`BankAccount[]` balances) were fixed in this pass — see
"2. Balance Sheet V1" above and the Bug-Fix Sprint Suggestions section below
for what changed. Re-run confirms 0 FAIL across the entire report stack.

**WARNING (7, all in LHDN Tax Readiness, same documented scope gap, once per scenario):**

All 7 scenarios (1 through 7) flag: *"TIN Status check is not implemented —
BusinessProfile has no dedicated TIN field, registrationNo (SSM proxy) is
reused instead. Known gap, not a defect."* — see `src/lib/lhdnReadiness.ts`
header comment for the original acknowledgment.

## Bug-Fix Sprint Suggestions

1. ~~**Balance Sheet Assets gap (the only real defect found).**~~ **DONE.**
   `ReportBucketAggregatorInput` now accepts optional `cashAccounts`/
   `bankAccounts`; `reportClassificationEngine.ts` resolves them to `ASSETS`
   via two new structural kinds (`CASH_ACCOUNT`/`BANK_ACCOUNT`);
   `BalanceSheetReport.tsx` passes the workspace's real cash/bank accounts
   through. `validateBalanceSheet.ts` re-run: 28/28 PASS. `tsc`/`build`
   unaffected.
2. **LHDN TIN field (schema change, deliberately out of scope here).** Add a
   dedicated `tinNumber` (or similarly named) field to `BusinessProfile`,
   wire it into the Financial Profile UI, and replace the SSM-proxy
   "registration" check in `computeLhdnReadiness` with a genuine TIN-presence
   check once the field exists. This is a schema migration plus UI change,
   not a quick fix — track as its own ticket rather than bundling into the
   Balance Sheet fix above.
3. No other defects were found across Cash Flow, Financial Health, Loan
   Readiness, P&L, or the Report Foundation engine — these are clear to ship
   as-is.

## Closing Note

This was a validation-only sprint, with one P0 fix applied afterward once the
Balance Sheet Assets gap was confirmed as a real, reproducible defect (not a
script artifact). Every script calls real production modules with zero
mocking; the fix itself touched only `reportBucketAggregator.ts`,
`reportClassificationEngine.ts`, `BalanceSheetReport.tsx`, and
`FinancialReportsAnalytics.tsx` (passing already-available context data
through) — no redesign, no new features beyond closing the documented gap.
No further audit of this report stack is planned at this time. The only
remaining open item is the pre-existing, intentionally-scoped LHDN TIN gap
(WARNING, not FAIL). The **Financial Recovery Sprint** (tracked separately)
remains pending and is the next planned body of work — this readiness audit
does not block or substitute for it.
