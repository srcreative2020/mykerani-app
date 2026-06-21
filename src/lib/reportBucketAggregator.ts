// MyKerani — Report Bucket Aggregator (Report Foundation Sprint V1, Phase 3)
//
// Single shared aggregation engine sitting between the Report Classification
// Engine (resolveLevel1Group) and the future P&L / Balance Sheet / Cash Flow
// screens. Every report MUST read from these buckets instead of re-deriving
// its own grouping logic — this is what prevents the "every record hardcoded
// into one bucket" class of bug found in MYKERANI_REPORT_FOUNDATION_READINESS_AUDIT.md.
//
// Stateless, pure functions only. No DB, no I/O, no React. Reports are not
// built here — only the reusable bucket/total APIs they will consume.

import type { DebtRecord, FinancialCommitment, FinancialEvent } from "../types";
import type { AssetPurchase, OwnerTransaction } from "./assetOwnerData";
import {
  resolveLevel1Group,
  fromFinancialEvent,
  fromDebtRecord,
  fromFinancialCommitment,
  fromAssetPurchase,
  fromOwnerTransaction,
  type ClassifiableRecordKind,
  type ResolutionMethod,
} from "./reportClassificationEngine";
import type { CanonicalCategory, FinancialStatementGroup } from "./accountingClassificationMap";

export interface BucketedRecord {
  recordId: string;
  kind: ClassifiableRecordKind;
  amountMyr: number;
  date: string;
  level1Group: FinancialStatementGroup;
  canonicalCategory: CanonicalCategory | null;
  accountingName: string;
  humanFriendlyName: string;
  resolutionMethod: ResolutionMethod;
  confidence: number;
}

export type ReportBuckets = Record<FinancialStatementGroup, BucketedRecord[]>;

const emptyBuckets = (): ReportBuckets => ({
  REVENUE: [],
  COST_OF_SALES: [],
  OPERATING_EXPENSES: [],
  ASSETS: [],
  LIABILITIES: [],
  EQUITY: [],
});

function pushResolved(
  buckets: ReportBuckets,
  recordId: string,
  kind: ClassifiableRecordKind,
  amountMyr: number,
  date: string,
  resolution: ReturnType<typeof resolveLevel1Group>
): void {
  buckets[resolution.level1Group].push({
    recordId,
    kind,
    amountMyr,
    date,
    level1Group: resolution.level1Group,
    canonicalCategory: resolution.canonicalCategory,
    accountingName: resolution.accountingName,
    humanFriendlyName: resolution.humanFriendlyName,
    resolutionMethod: resolution.resolutionMethod,
    confidence: resolution.confidence,
  });
}

export interface ReportBucketAggregatorInput {
  financialEvents: FinancialEvent[];
  debtRecords: DebtRecord[];
  financialCommitments: FinancialCommitment[];
  assetPurchases: AssetPurchase[];
  ownerTransactions: OwnerTransaction[];
}

/**
 * Build the 6 Level 1 Financial Statement Group buckets from every record
 * kind that can appear in a report. Every input record is guaranteed to land
 * in exactly one bucket (resolveLevel1Group never returns null).
 */
export function buildReportBuckets(input: ReportBucketAggregatorInput): ReportBuckets {
  const buckets = emptyBuckets();

  for (const event of input.financialEvents) {
    const resolution = resolveLevel1Group(fromFinancialEvent(event));
    pushResolved(buckets, event.id, "FINANCIAL_EVENT", event.amountMyr, event.date, resolution);
  }

  for (const debt of input.debtRecords) {
    const resolution = resolveLevel1Group(fromDebtRecord(debt));
    const outstanding = Math.max(0, (debt.totalAmountMyr || 0) - (debt.repaidAmountMyr || 0));
    pushResolved(buckets, debt.id, "DEBT_RECORD", outstanding, debt.borrowedDate, resolution);
  }

  for (const commitment of input.financialCommitments) {
    const resolution = resolveLevel1Group(fromFinancialCommitment(commitment));
    pushResolved(buckets, commitment.id, "FINANCIAL_COMMITMENT", commitment.amountPerIntervalMyr, commitment.startDate, resolution);
  }

  for (const asset of input.assetPurchases) {
    const resolution = resolveLevel1Group(fromAssetPurchase(asset));
    pushResolved(buckets, asset.id, "ASSET_PURCHASE", asset.purchaseAmountMyr, asset.purchaseDate, resolution);
  }

  for (const txn of input.ownerTransactions) {
    const resolution = resolveLevel1Group(fromOwnerTransaction(txn));
    pushResolved(buckets, txn.id, "OWNER_TRANSACTION", txn.amountMyr, txn.transactionDate, resolution);
  }

  return buckets;
}

/** Sum of amountMyr for a single bucket. */
export function getBucketTotal(buckets: ReportBuckets, group: FinancialStatementGroup): number {
  return buckets[group].reduce((sum, r) => sum + (r.amountMyr || 0), 0);
}

/** Totals for all 6 buckets at once — the shared numbers P&L/Balance Sheet/Cash Flow all read from. */
export function getAllBucketTotals(buckets: ReportBuckets): Record<FinancialStatementGroup, number> {
  return {
    REVENUE: getBucketTotal(buckets, "REVENUE"),
    COST_OF_SALES: getBucketTotal(buckets, "COST_OF_SALES"),
    OPERATING_EXPENSES: getBucketTotal(buckets, "OPERATING_EXPENSES"),
    ASSETS: getBucketTotal(buckets, "ASSETS"),
    LIABILITIES: getBucketTotal(buckets, "LIABILITIES"),
    EQUITY: getBucketTotal(buckets, "EQUITY"),
  };
}

/** Derived P&L subtotals — Gross Profit and Operating Profit — computed once, shared by every consumer. */
export function getProfitAndLossSubtotals(buckets: ReportBuckets): {
  revenue: number;
  costOfSales: number;
  grossProfit: number;
  operatingExpenses: number;
  operatingProfit: number;
} {
  const revenue = getBucketTotal(buckets, "REVENUE");
  const costOfSales = getBucketTotal(buckets, "COST_OF_SALES");
  const operatingExpenses = getBucketTotal(buckets, "OPERATING_EXPENSES");
  const grossProfit = revenue - costOfSales;
  const operatingProfit = grossProfit - operatingExpenses;
  return { revenue, costOfSales, grossProfit, operatingExpenses, operatingProfit };
}

/** Derived Balance Sheet check — Assets = Liabilities + Equity (+ retained P&L not yet rolled in here). */
export function getBalanceSheetSubtotals(buckets: ReportBuckets): {
  assets: number;
  liabilities: number;
  equity: number;
} {
  return {
    assets: getBucketTotal(buckets, "ASSETS"),
    liabilities: getBucketTotal(buckets, "LIABILITIES"),
    equity: getBucketTotal(buckets, "EQUITY"),
  };
}

/** Flatten all bucketed records — useful for coverage validation and evidence drilldown indexing. */
export function flattenBuckets(buckets: ReportBuckets): BucketedRecord[] {
  return (Object.keys(buckets) as FinancialStatementGroup[]).flatMap((group) => buckets[group]);
}
