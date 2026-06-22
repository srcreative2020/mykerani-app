// MyKerani — Cash Flow Activity Classifier (Report Completion Sprint V1)
//
// The 4th Cash Flow dimension flagged as not-yet-designed in
// MYKERANI_REPORT_FOUNDATION_SPRINT_V1.md §6 blocker #4. Maps every
// BucketedRecord (already resolved by reportClassificationEngine /
// reportBucketAggregator) onto Operating / Investing / Financing —
// deterministically, by record kind, never by re-parsing free text.
//
// Stateless, pure function only. No DB, no I/O, no React.

import type { BucketedRecord } from "./reportBucketAggregator";

export type CashFlowActivity = "OPERATING" | "INVESTING" | "FINANCING";

/**
 * Record-kind -> activity mapping. FINANCIAL_EVENT (day-to-day income/expense/
 * receivable/payable) is Operating; ASSET_PURCHASE is Investing; DEBT_RECORD
 * and OWNER_TRANSACTION (capital injection/drawing) are Financing;
 * FINANCIAL_COMMITMENT (recurring contractual obligations like sewa) is
 * Operating, matching how it is already treated everywhere else in the
 * codebase (OPERATING_EXPENSES bucket, monthlyCommitmentBurn in
 * financialHealth.ts) rather than inventing a different classification here.
 */
export function classifyCashFlowActivity(record: BucketedRecord): CashFlowActivity {
  switch (record.kind) {
    case "ASSET_PURCHASE":
      return "INVESTING";
    case "DEBT_RECORD":
    case "OWNER_TRANSACTION":
      return "FINANCING";
    case "FINANCIAL_COMMITMENT":
    case "FINANCIAL_EVENT":
    default:
      return "OPERATING";
  }
}

export interface CashFlowActivityTotals {
  operating: number;
  investing: number;
  financing: number;
  netCashFlow: number;
}

/** Sum amountMyr per activity across any list of already-bucketed records. */
export function getCashFlowActivityTotals(records: BucketedRecord[]): CashFlowActivityTotals {
  let operating = 0;
  let investing = 0;
  let financing = 0;
  for (const r of records) {
    const activity = classifyCashFlowActivity(r);
    if (activity === "OPERATING") operating += r.amountMyr || 0;
    else if (activity === "INVESTING") investing += r.amountMyr || 0;
    else financing += r.amountMyr || 0;
  }
  return { operating, investing, financing, netCashFlow: operating + investing + financing };
}

/** Group records by activity — used for drill-down rendering per activity section. */
export function groupRecordsByActivity(records: BucketedRecord[]): Record<CashFlowActivity, BucketedRecord[]> {
  const groups: Record<CashFlowActivity, BucketedRecord[]> = { OPERATING: [], INVESTING: [], FINANCING: [] };
  for (const r of records) {
    groups[classifyCashFlowActivity(r)].push(r);
  }
  return groups;
}
