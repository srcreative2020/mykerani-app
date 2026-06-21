# MyKerani — Profit & Loss V1 Implementation

**Status:** Implemented. `npx tsc --noEmit -p .` — 29 errors, at the same pre-existing baseline as the Report Foundation Sprint V1 commit (no new errors introduced by this task). `npm run build` passes clean.
**File path:** `/home/user/mykerani-app/MYKERANI_PROFIT_LOSS_V1_IMPLEMENTATION.md`
**Source of truth:** `src/lib/reportClassificationEngine.ts`, `src/lib/reportBucketAggregator.ts`, `src/lib/evidenceDrilldown.ts` (Report Foundation Sprint V1).
**Scope discipline:** No dashboard redesign. No Balance Sheet. No Cash Flow. Profit & Loss only, as instructed.

---

## 1. Data Flow

```
FinancialReportsAnalytics.tsx (9th report tab "profit_loss")
        │  passes financialEvents + financialEvidencePackages
        │  (both already loaded by useFinancials(), no new context wiring)
        ▼
ProfitLossReport.tsx
        │
        │  1. Pick period range (Current Month / Last Month / Custom)
        │     getPeriodRange(periodMode, customFrom, customTo, today)
        │
        │  2. Filter raw FinancialEvent[] by event.date ∈ range
        │     (date filtering happens BEFORE aggregation — reportBucketAggregator.ts
        │      and reportClassificationEngine.ts are date-unaware by design)
        │
        │  3. buildReportBuckets({ financialEvents: <filtered>, debtRecords: [],
        │       financialCommitments: [], assetPurchases: [], ownerTransactions: [] })
        │     — DebtRecord/FinancialCommitment/AssetPurchase/OwnerTransaction are
        │       intentionally passed as [] because none of them can ever resolve
        │       into REVENUE/COST_OF_SALES/OPERATING_EXPENSES (per
        │       reportClassificationEngine.ts's TYPE_FALLBACK_GROUP table — they
        │       only ever land in ASSETS/LIABILITIES/EQUITY, which are Balance
        │       Sheet inputs, out of scope here).
        │
        │  4. getProfitAndLossSubtotals(buckets)
        │     → { revenue, costOfSales, grossProfit, operatingExpenses, operatingProfit }
        │     This is the ONLY place P&L numbers come from.
        │
        │  5. Repeat steps 2-4 for the preceding period of equal length
        │     (getPrecedingPeriod) — used only to build the comparison narrative,
        │     never the headline numbers.
        │
        │  6. buildEvidenceIndex(financialEvidencePackages) once,
        │     getDrilldownForRecords(records, index) on demand when a line is
        │     clicked — reuses the existing relatedRecordId linkage, no schema
        │     change.
        ▼
Rendered statement (Layer A human-friendly / Layer B accounting) + explanation
card + drill-down slide-over drawer (Transactions/Receipts/Invoices/Evidence Packages).
```

---

## 2. Calculations

**Zero duplicate/hand-rolled P&L math.** Every number on screen traces to exactly one of two calls:

- `buildReportBuckets()` — `src/lib/reportBucketAggregator.ts:85`
- `getProfitAndLossSubtotals()` — `src/lib/reportBucketAggregator.ts:135`

`ProfitLossReport.tsx` calls these twice (current period, preceding period) and otherwise only does:
- Date-range filtering of the raw `financialEvents` array (`inRange()`), which is upstream of, not a substitute for, the aggregator.
- Delta math for the comparison narrative (`current.X - previous.X`), which only decides which Malay sentence to show — it never feeds back into the displayed Revenue/COGS/Gross Profit/OpEx/Operating Profit figures, which always come straight from `getProfitAndLossSubtotals()`.

Gross Profit and Operating Profit have no bucket of their own (they are derived sums, not aggregated record sets). Their drill-down therefore shows the **union of the contributing buckets' already-resolved `BucketedRecord[]` lists** — `REVENUE + COST_OF_SALES` for Gross Profit, all three buckets for Operating Profit — rather than inventing any new record or calculation.

---

## 3. Screens Updated

- **`src/components/ProfitLossReport.tsx`** (new) — the entire P&L screen:
  - Period selector: Current Month / Last Month / Custom Date Range (`pnl_period_*`, `pnl_custom_from/to`).
  - Layer toggle: **Layer A** (human-friendly Malay — Jualan, Kos Barang Jualan, Untung Kasar, Kos Operasi, Untung Bersih) / **Layer B** (accounting — Revenue, Cost of Sales, Gross Profit, Operating Expenses, Operating Profit), both reading the same underlying `PnlNumbers` (`pnl_layer_human/accounting`).
  - 5-line statement, each line clickable to open drill-down.
  - Drill-down slide-over drawer (mirrors the existing pattern in `FinancialEvidencePackage.tsx`): per-record amount/date/resolution method, plus its linked evidence packages (Receipt/Invoice/Bank Statement/Supporting Document) or a "Tiada pakej bukti dikaitkan" notice if none exist.
  - Summary explanation card: headline + Malay bullet reasons (e.g. "Jualan naik", "Kos operasi turun") generated from the current-vs-preceding-period deltas.
- **`src/components/FinancialReportsAnalytics.tsx`** (modified) — added a 9th report tab following the existing hand-written nav-button/panel convention (no refactor of the other 8):
  - `selectedReport` union extended with `"profit_loss"`.
  - 9th nav button `id="nav_report_profit_loss"` ("9. Untung Rugi (Profit & Loss)").
  - 9th conditional title line.
  - 9th conditional content block (`id="report_profit_loss_view"`) rendering `<ProfitLossReport financialEvents={financialEvents} financialEvidencePackages={financialEvidencePackages} />` — both already available from the existing `useFinancials()` destructure, so no new context/data wiring was needed.
  - Dashboard layout, sidebar, and the other 8 reports are untouched.

---

## 4. Remaining Gaps

1. **No export (PDF/CSV/Excel/JSON) for the P&L tab yet.** The other 8 reports in `FinancialReportsAnalytics.tsx` use `exportUtils.ts`; the P&L screen does not yet have an export button wired to those same utilities.
2. **Staff cannot see this report.** `StaffHomeScreen.tsx` never mounts `FinancialReportsAnalytics`, so the new P&L tab is only reachable via `OwnerDashboard.tsx`, `MyKeraniAppTabs.tsx`, and `FinancialRecordsConsole.tsx` — all Owner-facing surfaces.
3. **Retained Earnings roll-forward** (Report Foundation Sprint V1, blocker #2) remains unbuilt — irrelevant to P&L itself, but it means the Equity side of a future Balance Sheet still can't reconcile against this P&L's Operating Profit.
4. **No automated test of date-range edge cases** (month boundaries, custom range with `from > to`, empty-period rendering) — verified manually via typecheck/build only, not a dedicated test script like Sprint V1's `scripts/validateReportFoundation.ts`.
5. **Cash Flow's Operating/Investing/Financing dimension** and the **DB `general_ledger_categories.type` bridge** (Sprint V1 blockers #3-4) are unchanged — out of scope for this task and untouched.
