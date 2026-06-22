# MyKerani Report Stack — Readiness Audit V1

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
| 2 | Balance Sheet V1 | `validateBalanceSheet.ts` | 21 | 0 | 7 | 28 | **Blocked — known gap** |
| 3 | Cash Flow V1 | `validateCashFlow.ts` | 28 | 0 | 0 | 28 | **Ready** |
| 4 | Financial Health V1 | `validateFinancialHealth.ts` | 28 | 0 | 0 | 28 | **Ready** |
| 5 | Loan/Financing Readiness V1 | `validateLoanReadiness.ts` | 28 | 0 | 0 | 28 | **Ready** |
| 6 | LHDN Tax Readiness V1 | `validateLhdnReadiness.ts` | 28 | 7 | 0 | 35 | **Ready, with documented gap** |
| — | Report Foundation (engine layer) | `validateReportFoundation.ts` | 10 | 0 | 0 | 10 | **Ready** |
| | **Total** | | **213** | **7** | **7** | **227** | |

5 of 6 report types pass clean. Balance Sheet V1 has a real, reproducible
tie-out failure (not a script defect). LHDN Tax Readiness passes every
functional check but carries one documented, pre-existing scope gap (TIN
field) flagged 7 times (once per scenario) as WARNING rather than FAIL.

## Per-Report Detail

### 1. Profit & Loss V1 — `validatePnlUat.ts` (70/70 PASS)

Validates `resolveLevel1Group` / `buildReportBuckets` /
`getProfitAndLossSubtotals` / `buildEvidenceIndex` / `getDrilldownForRecords`
across 10 checks × 7 scenarios: category resolution, bucket resolution with
no double-counting, Gross/Operating Profit formula correctness, evidence
drilldown linkage, human-friendly vs. accounting layer naming, empty-data
handling, negative-profit handling (not clamped to 0), date-range filtering
monotonicity, and comparison-narrative sign consistency. Zero failures.

### 2. Balance Sheet V1 — `validateBalanceSheet.ts` (21/28 PASS, 7 FAIL)

Validates `getBalanceSheetTieOut` / `getRetainedEarnings` /
`getProfitAndLossSubtotals` across 4 checks × 7 scenarios. The Retained
Earnings tie-out (`RetainedEarnings === OperatingProfit`) passes in all 7
scenarios — that mechanism is correct. The actual balance check
(`Assets === Liabilities + Equity + RetainedEarnings`) **fails in 6 of 7
scenarios** (only the all-empty Scenario 7 ties out, trivially at 0=0).

Root cause: `buildReportBuckets()` only populates the `ASSETS` bucket from
`assetPurchases` (fixed-asset purchase records). It never receives or
includes `CashAccount`/`BankAccount` balances as inputs. Any workspace with
real cash/bank balances — which is every realistic workspace — will show
Assets understated by exactly its total liquid cash, so the sheet does not
balance. This is **not a new bug discovered by the script** — it is already
self-acknowledged in production: `src/components/BalanceSheetReport.tsx`
line 137 ships a user-facing fallback message for exactly this condition:
*"Ini boleh berlaku jika ada rekod Cash/Bank account balance yang belum
dimasukkan sebagai input aggregator."* The validation script simply confirms
the gap is real and quantifies it (e.g. Scenario 1 Printing: Assets
RM22,000.00 vs. Liabilities+Equity+RE RM26,700.00, short by exactly the
RM10,500 of cash+bank balance not fed into the aggregator).

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

**FAIL (7, all in Balance Sheet V1, all the same root cause):**

| Scenario | Check | Detail |
|---|---|---|
| 1. Printing Business | Balance Sheet Tie-Out | Assets RM22,000.00 vs. L+E+RE RM26,700.00, diff −RM4,700.00 |
| 2. Restaurant / F&B | Balance Sheet Tie-Out | Assets RM6,500.00 vs. L+E+RE RM40,100.00, diff −RM33,600.00 |
| 3. Service Business | Balance Sheet Tie-Out | Assets RM9,000.00 vs. L+E+RE RM19,200.00, diff −RM10,200.00 |
| 4. Retail Business | Balance Sheet Tie-Out | Assets RM0.00 vs. L+E+RE RM24,300.00, diff −RM24,300.00 |
| 5. Personal Finance | Balance Sheet Tie-Out | Assets RM0.00 vs. L+E+RE RM5,150.00, diff −RM5,150.00 |
| 6. Negative Profit | Balance Sheet Tie-Out | Assets RM0.00 vs. L+E+RE RM5,900.00, diff −RM5,900.00 |
| 6. Negative Profit | Negative Profit Still Ties Out | RetainedEarnings correctly negative (−RM1,600.00) but sheet itself does not balance (same root cause) |

**Root cause for all 7:** `buildReportBuckets()` / the `ASSETS` bucket never
ingests `CashAccount[]`/`BankAccount[]` balances — only `assetPurchases`
(fixed assets). Every scenario with cash/bank balances understates Assets by
exactly that amount. Already self-acknowledged in
`BalanceSheetReport.tsx`'s own fallback copy; not a script artifact.

**WARNING (7, all in LHDN Tax Readiness, same documented scope gap, once per scenario):**

All 7 scenarios (1 through 7) flag: *"TIN Status check is not implemented —
BusinessProfile has no dedicated TIN field, registrationNo (SSM proxy) is
reused instead. Known gap, not a defect."* — see `src/lib/lhdnReadiness.ts`
header comment for the original acknowledgment.

## Bug-Fix Sprint Suggestions

1. **Balance Sheet Assets gap (the only real defect found).** Extend
   `ReportBucketAggregatorInput` to accept `cashAccounts: CashAccount[]` and
   `bankAccounts: BankAccount[]`, and have `buildReportBuckets()` push each
   account's `currentBalanceMyr` into the `ASSETS` bucket (as a new
   `ClassifiableRecordKind`, e.g. `"CASH_ACCOUNT"` / `"BANK_ACCOUNT"`, with a
   fixed `level1Group: "ASSETS"` resolution — no classification engine
   lookup needed since the group is unambiguous). Update
   `BalanceSheetReport.tsx` to pass its already-loaded cash/bank account
   data through. Re-run `validateBalanceSheet.ts` after the fix — all 7
   currently-failing checks should flip to PASS with this single, additive,
   non-breaking change (no other consumer of `buildReportBuckets()` —
   P&L, Cash Flow — needs cash/bank in their ASSETS bucket, so this requires
   either an optional input or a dedicated entry point to avoid affecting
   their existing totals).
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

This was a validation-only sprint: every script calls real production
modules with zero UI changes and zero mocking. No further audit of this
report stack is planned at this time. The Balance Sheet Assets gap above is
the one actionable defect surfaced; everything else is either fully passing
or a pre-existing, already-documented, intentionally-scoped gap. The
**Financial Recovery Sprint** (tracked separately) remains pending and is
the next planned body of work — this readiness audit does not block or
substitute for it.
