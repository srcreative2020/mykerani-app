// MyKerani — Phase 2D Financial Health Command Center engine.
//
// Single shared computation used identically by OwnerDashboard.tsx and
// StaffHomeScreen.tsx (Health Center is not in the Parity Rule's named list
// of engines, but the rule's spirit — one engine, no Owner-only/Staff-only
// variant — applies to any cross-cutting calculation surfaced to both
// roles). Both screens call `computeFinancialHealth()` with the same input
// shape; neither screen re-implements the bucket/score math locally.
//
// This module is read-only / advisory: it never mutates a financial record,
// duplicate flag, or evidence package — it only classifies/counts existing
// state so the dashboard can tell the user what needs attention and link
// straight to the screen that lets them act on it.

import type { ChatSuggestion, ChatSuggestionStatus } from "./chatSuggestionTypes";
import type { DuplicateFlag, FinancialEvent, FinancialEvidencePackage } from "../types";

// Confidence below this is "Review Recommended" — reuses the same floor the
// Historical Recovery engine treats as its lower confidence tier
// (transactionRecoveryEngine.ts KNOWLEDGE_BASE_CONFIDENCE).
export const REVIEW_CONFIDENCE_THRESHOLD = 0.65;

export type HealthColor = "green" | "blue" | "yellow" | "orange" | "red" | "black";

// Section 4 — Color Governance: exactly these six colors, exactly these
// meanings, used nowhere else with a different meaning.
export const HEALTH_COLOR_MEANING: Record<HealthColor, string> = {
  green: "Complete",
  blue: "Waiting User Action",
  yellow: "Needs Review",
  orange: "Incomplete",
  red: "High Risk",
  black: "System Error",
};

export type HealthBucketKey =
  | "complete"
  | "pendingConfirmation"
  | "reviewRecommended"
  | "missingEvidence"
  | "possibleDuplicates"
  | "importFailures";

export interface HealthBucket {
  key: HealthBucketKey;
  emoji: string;
  color: HealthColor;
  label: string;
  description: string;
  actionLabel: string;
  count: number;
  // Record ids this bucket is about, where applicable — lets a click jump
  // straight to a pre-filtered list instead of the user searching for them.
  recordIds: string[];
}

export type ReadinessKey = "auditReadiness" | "documentationReadiness" | "recordQuality" | "bankReadiness";

export interface ReadinessScore {
  key: ReadinessKey;
  label: string;
  score: number; // 0-100
  band: "green" | "yellow" | "red";
  reasons: string[]; // human-readable explanation of why score is reduced
  recordIds: string[]; // records causing the reduction
}

export interface FinancialHealthInput {
  events: FinancialEvent[];
  evidencePackages: FinancialEvidencePackage[];
  duplicateFlags: DuplicateFlag[];
  chatSuggestions: ChatSuggestion[];
  chatSuggestionStatus: Record<string, ChatSuggestionStatus>;
  importFailureCount: number; // total skipped rows across unresolved import batches
  importFailureBatchCount: number; // number of distinct failed import files
}

export interface FinancialHealthResult {
  buckets: HealthBucket[];
  readiness: ReadinessScore[];
  totalEvents: number;
}

function band(score: number): "green" | "yellow" | "red" {
  if (score >= 90) return "green";
  if (score >= 70) return "yellow";
  return "red";
}

export function computeFinancialHealth(input: FinancialHealthInput): FinancialHealthResult {
  const { events, evidencePackages, duplicateFlags, chatSuggestions, chatSuggestionStatus, importFailureCount, importFailureBatchCount } = input;

  const evidencedRecordIds = new Set(evidencePackages.map((p) => p.relatedRecordId).filter(Boolean) as string[]);
  const missingEvidence = events.filter((e) => !evidencedRecordIds.has(e.id));

  const unresolvedFlags = duplicateFlags.filter(
    (f) => f.classification === "POSSIBLE_DUPLICATE" || f.classification === "LIKELY_DUPLICATE"
  );
  const duplicateInvolvedEventIds = new Set<string>();
  unresolvedFlags.forEach((f) => {
    duplicateInvolvedEventIds.add(f.recordAId);
    duplicateInvolvedEventIds.add(f.recordBId);
  });

  const pendingSuggestions = chatSuggestions.filter((s) => {
    const status = chatSuggestionStatus[s.id]?.status ?? "pending";
    return status === "pending";
  });
  const lowConfidencePending = pendingSuggestions.filter((s) => {
    const confidence = s.accountingConfidence ?? s.payload?.confidenceScore;
    return typeof confidence === "number" && confidence < REVIEW_CONFIDENCE_THRESHOLD;
  });

  const missingEvidenceIds = new Set(missingEvidence.map((e) => e.id));
  const completeEvents = events.filter((e) => !missingEvidenceIds.has(e.id) && !duplicateInvolvedEventIds.has(e.id));

  const buckets: HealthBucket[] = [
    {
      key: "complete",
      emoji: "🟢",
      color: "green",
      label: "Complete Records",
      description: "Records with evidence attached and no open duplicate flag.",
      actionLabel: "View Records",
      count: completeEvents.length,
      recordIds: completeEvents.map((e) => e.id),
    },
    {
      key: "pendingConfirmation",
      emoji: "🔵",
      color: "blue",
      label: "Pending Confirmation",
      description: "AI-suggested transactions waiting for you to confirm, edit, or reject.",
      actionLabel: "Review Records",
      count: pendingSuggestions.length,
      recordIds: pendingSuggestions.map((s) => s.id),
    },
    {
      key: "reviewRecommended",
      emoji: "🟡",
      color: "yellow",
      label: "Review Recommended",
      description: `Pending suggestions with confidence below ${Math.round(REVIEW_CONFIDENCE_THRESHOLD * 100)}% — worth a closer look before confirming.`,
      actionLabel: "Review Records",
      count: lowConfidencePending.length,
      recordIds: lowConfidencePending.map((s) => s.id),
    },
    {
      key: "missingEvidence",
      emoji: "🟠",
      color: "orange",
      label: "Missing Evidence",
      description: "Confirmed records with no receipt, invoice, or statement attached.",
      actionLabel: "Attach Evidence",
      count: missingEvidence.length,
      recordIds: missingEvidence.map((e) => e.id),
    },
    {
      key: "possibleDuplicates",
      emoji: "🔴",
      color: "red",
      label: "Possible Duplicates",
      description: "System-suggested duplicate pairs from different sources (e.g. OCR receipt vs. bank import). Nothing is auto-merged or deleted.",
      actionLabel: "Review Duplicates",
      count: unresolvedFlags.length,
      recordIds: unresolvedFlags.map((f) => f.id),
    },
    {
      key: "importFailures",
      emoji: "⚫",
      color: "black",
      label: "Import Failures",
      description: importFailureBatchCount > 0
        ? `${importFailureCount} row(s) across ${importFailureBatchCount} import file(s) could not be read automatically.`
        : "Bank statement rows that failed to import automatically.",
      actionLabel: "Retry Imports",
      count: importFailureBatchCount,
      recordIds: [],
    },
  ];

  const totalEvents = events.length;
  const auditScore = totalEvents === 0 ? 100 : Math.round((completeEvents.length / totalEvents) * 100);
  const docScore = totalEvents === 0 ? 100 : Math.round(((totalEvents - missingEvidence.length) / totalEvents) * 100);
  const qualityPenalty = lowConfidencePending.length * 4 + unresolvedFlags.length * 6;
  const qualityScore = Math.max(0, 100 - qualityPenalty);
  const bankScore = importFailureCount === 0 ? 100 : Math.max(10, 100 - Math.min(80, importFailureCount * 5));

  const readiness: ReadinessScore[] = [
    {
      key: "auditReadiness",
      label: "Audit Readiness",
      score: auditScore,
      band: band(auditScore),
      reasons: [
        ...(missingEvidence.length > 0 ? [`${missingEvidence.length} record(s) missing evidence`] : []),
        ...(unresolvedFlags.length > 0 ? [`${unresolvedFlags.length} unresolved possible duplicate pair(s)`] : []),
      ],
      recordIds: [...missingEvidenceIds, ...duplicateInvolvedEventIds],
    },
    {
      key: "documentationReadiness",
      label: "Documentation Readiness",
      score: docScore,
      band: band(docScore),
      reasons: missingEvidence.length > 0 ? [`${missingEvidence.length} record(s) have no attached receipt/invoice/statement`] : [],
      recordIds: missingEvidence.map((e) => e.id),
    },
    {
      key: "recordQuality",
      label: "Record Quality",
      score: qualityScore,
      band: band(qualityScore),
      reasons: [
        ...(lowConfidencePending.length > 0 ? [`${lowConfidencePending.length} pending suggestion(s) below confidence threshold`] : []),
        ...(unresolvedFlags.length > 0 ? [`${unresolvedFlags.length} unresolved possible duplicate pair(s)`] : []),
      ],
      recordIds: [...lowConfidencePending.map((s) => s.id), ...unresolvedFlags.map((f) => f.id)],
    },
    {
      key: "bankReadiness",
      label: "Bank Readiness",
      score: bankScore,
      band: band(bankScore),
      reasons: importFailureCount > 0 ? [`${importFailureCount} bank statement row(s) failed to import automatically`] : [],
      recordIds: [],
    },
  ];

  return { buckets, readiness, totalEvents };
}
