// MyKerani — Evidence Drilldown Foundation (Report Foundation Sprint V1, Phase 4)
//
// Reusable structure linking any aggregated/bucketed value back to its
// source evidence (Transaction, Receipt, Invoice, Bank Statement, Supporting
// Document). No report UI is built here — this is the lookup layer reports
// will call into once P&L/Balance Sheet/Cash Flow screens exist.
//
// Stateless, pure functions only. Reuses the existing
// FinancialEvidencePackage.relatedRecordType/relatedRecordId linkage
// (FinancialRecordsContext.tsx's addFinancialEvidencePackage) — no schema
// change, no new table.

import type { FinancialEvidencePackage } from "../types";
import type { BucketedRecord } from "./reportBucketAggregator";

/** recordId -> every evidence package linked to it, via relatedRecordId. */
export type EvidenceIndex = Map<string, FinancialEvidencePackage[]>;

export function buildEvidenceIndex(evidencePackages: FinancialEvidencePackage[]): EvidenceIndex {
  const index: EvidenceIndex = new Map();
  for (const pkg of evidencePackages) {
    if (!pkg.relatedRecordId) continue;
    const existing = index.get(pkg.relatedRecordId);
    if (existing) {
      existing.push(pkg);
    } else {
      index.set(pkg.relatedRecordId, [pkg]);
    }
  }
  return index;
}

export function getEvidenceForRecord(index: EvidenceIndex, recordId: string): FinancialEvidencePackage[] {
  return index.get(recordId) || [];
}

export interface DrilldownEntry {
  record: BucketedRecord;
  evidence: FinancialEvidencePackage[];
  hasEvidence: boolean;
}

/** Attach the evidence trail to a single bucketed record — the unit every report drill-down will render. */
export function getDrilldownForRecord(record: BucketedRecord, index: EvidenceIndex): DrilldownEntry {
  const evidence = getEvidenceForRecord(index, record.recordId);
  return { record, evidence, hasEvidence: evidence.length > 0 };
}

/** Attach the evidence trail to every record in a bucket/list at once. */
export function getDrilldownForRecords(records: BucketedRecord[], index: EvidenceIndex): DrilldownEntry[] {
  return records.map((record) => getDrilldownForRecord(record, index));
}

/** Coverage helper: % of records in a list that have at least one evidence package linked. */
export function getEvidenceCoverageRatio(records: BucketedRecord[], index: EvidenceIndex): number {
  if (records.length === 0) return 1;
  const withEvidence = records.filter((r) => getEvidenceForRecord(index, r.recordId).length > 0).length;
  return withEvidence / records.length;
}
