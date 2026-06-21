// MyKerani — Report Classification Engine (Report Foundation Sprint V1, Phase 2)
//
// Source of truth: MYKERANI_FINANCIAL_CLASSIFICATION_MASTER_FRAMEWORK.md,
// MYKERANI_ACCOUNTING_KNOWLEDGE_BASE_V1.md, MYKERANI_REPORT_CLASSIFICATION_ENGINE_AUDIT.md.
//
// Purpose: every record that can ever appear in a financial report
// (FinancialEvent, DebtRecord, FinancialCommitment, AssetPurchase,
// OwnerTransaction) must resolve to exactly one of the six Level 1
// Financial Statement Groups. This module is that single resolver —
// no report, screen, or aggregator may invent its own grouping logic.
//
// Guarantee: resolveLevel1Group() never returns null/undefined for
// level1Group. Every record resolves, via a 3-tier cascade, down to a
// deterministic type-based fallback that always succeeds.
//
// Stateless, pure functions only. No DB, no I/O, no React.

import {
  ACCOUNTING_KNOWLEDGE_BASE,
  type CanonicalCategory,
  type FinancialStatementGroup,
  normalizeToCanonical,
  matchAccountingRule,
  getRuleById,
} from "./accountingClassificationMap";
import type {
  FinancialEvent,
  DebtRecord,
  FinancialCommitment,
} from "../types";
import type { AssetPurchase, OwnerTransaction } from "./assetOwnerData";

/** The deterministic, type-based key every record kind ultimately falls back on. */
export type ClassificationFallbackType =
  | "INCOME"
  | "EXPENSE"
  | "RECEIVABLE"
  | "PAYABLE"
  | "DEBT"
  | "COMMITMENT"
  | "ASSET_PURCHASE"
  | "CAPITAL_INJECTION"
  | "DRAWING";

export type ClassifiableRecordKind =
  | "FINANCIAL_EVENT"
  | "DEBT_RECORD"
  | "FINANCIAL_COMMITMENT"
  | "ASSET_PURCHASE"
  | "OWNER_TRANSACTION";

export type ResolutionMethod = "CANONICAL_MATCH" | "KNOWLEDGE_BASE_MATCH" | "TYPE_FALLBACK";

/** Normalized shape every adapter below produces, fed into the single resolver. */
export interface ClassificationInput {
  recordId: string;
  kind: ClassifiableRecordKind;
  /** Deterministic fallback key — always present, always resolvable on its own. */
  fallbackType: ClassificationFallbackType;
  /** Free-text category label the user/AI chose, if any (Tier 1 input). */
  categoryText?: string | null;
  /** Vendor/party/description text used for keyword matching (Tier 2 input). */
  lookupText?: string | null;
}

export interface Level1Resolution {
  recordId: string;
  kind: ClassifiableRecordKind;
  canonicalCategory: CanonicalCategory | null;
  level1Group: FinancialStatementGroup;
  accountingName: string;
  humanFriendlyName: string;
  resolutionMethod: ResolutionMethod;
  confidence: number;
}

// ── Tier 3: deterministic type fallback (always succeeds, per the sprint spec) ──

const TYPE_FALLBACK_GROUP: Record<ClassificationFallbackType, FinancialStatementGroup> = {
  INCOME: "REVENUE",
  EXPENSE: "OPERATING_EXPENSES",
  RECEIVABLE: "ASSETS",
  PAYABLE: "LIABILITIES",
  DEBT: "LIABILITIES",
  COMMITMENT: "LIABILITIES",
  ASSET_PURCHASE: "ASSETS",
  CAPITAL_INJECTION: "EQUITY",
  DRAWING: "EQUITY",
};

const FALLBACK_DISPLAY_NAMES: Record<FinancialStatementGroup, { accountingName: string; humanFriendlyName: string }> = {
  REVENUE: { accountingName: "Unclassified Revenue", humanFriendlyName: "Pendapatan Belum Dikelaskan" },
  COST_OF_SALES: { accountingName: "Unclassified Cost of Sales", humanFriendlyName: "Kos Jualan Belum Dikelaskan" },
  OPERATING_EXPENSES: { accountingName: "Unclassified Operating Expense", humanFriendlyName: "Perbelanjaan Belum Dikelaskan" },
  ASSETS: { accountingName: "Unclassified Asset", humanFriendlyName: "Aset Belum Dikelaskan" },
  LIABILITIES: { accountingName: "Unclassified Liability", humanFriendlyName: "Liabiliti Belum Dikelaskan" },
  EQUITY: { accountingName: "Unclassified Equity", humanFriendlyName: "Ekuiti Belum Dikelaskan" },
};

const RESOLUTION_CONFIDENCE: Record<ResolutionMethod, number> = {
  CANONICAL_MATCH: 0.95,
  KNOWLEDGE_BASE_MATCH: 0.75,
  TYPE_FALLBACK: 0.4,
};

/**
 * Resolve a single classification input to its Level 1 Financial Statement
 * Group. Guaranteed to always return a non-null level1Group — every record
 * resolves, the only thing that varies is HOW (resolutionMethod/confidence).
 */
export function resolveLevel1Group(input: ClassificationInput): Level1Resolution {
  // Tier 1 — Canonical Match: the record's own category label maps directly
  // (exact label or normalized-id match) onto a canonical category.
  const canonicalFromLabel = normalizeToCanonical(input.categoryText);
  if (canonicalFromLabel) {
    const rule = getRuleById(canonicalFromLabel);
    return {
      recordId: input.recordId,
      kind: input.kind,
      canonicalCategory: rule.id,
      level1Group: rule.level1Group,
      accountingName: rule.recommendedCategory,
      humanFriendlyName: rule.humanFriendlyName,
      resolutionMethod: "CANONICAL_MATCH",
      confidence: RESOLUTION_CONFIDENCE.CANONICAL_MATCH,
    };
  }

  // Tier 2 — Accounting Knowledge Base Match: no direct label match, but the
  // lookup text (vendor/party/description) or the category text itself
  // matches a rule's keyword set.
  const ruleFromKeywords = matchAccountingRule(input.lookupText) || matchAccountingRule(input.categoryText);
  if (ruleFromKeywords) {
    return {
      recordId: input.recordId,
      kind: input.kind,
      canonicalCategory: ruleFromKeywords.id,
      level1Group: ruleFromKeywords.level1Group,
      accountingName: ruleFromKeywords.recommendedCategory,
      humanFriendlyName: ruleFromKeywords.humanFriendlyName,
      resolutionMethod: "KNOWLEDGE_BASE_MATCH",
      confidence: RESOLUTION_CONFIDENCE.KNOWLEDGE_BASE_MATCH,
    };
  }

  // Tier 3 — Deterministic Type Fallback: always succeeds. No NULL resolution.
  const level1Group = TYPE_FALLBACK_GROUP[input.fallbackType];
  const display = FALLBACK_DISPLAY_NAMES[level1Group];
  return {
    recordId: input.recordId,
    kind: input.kind,
    canonicalCategory: null,
    level1Group,
    accountingName: display.accountingName,
    humanFriendlyName: display.humanFriendlyName,
    resolutionMethod: "TYPE_FALLBACK",
    confidence: RESOLUTION_CONFIDENCE.TYPE_FALLBACK,
  };
}

// ── Adapters: concrete record types -> ClassificationInput ──
// Centralizing these here means no caller ever hand-rolls "what's the
// fallback type for this record" logic — they call the adapter, then
// resolveLevel1Group(). Both live in one module, one source of truth.

export function fromFinancialEvent(event: FinancialEvent): ClassificationInput {
  const fallbackType: ClassificationFallbackType =
    event.type === "INCOME" ? "INCOME"
    : event.type === "EXPENSE" ? "EXPENSE"
    : event.type === "RECEIVABLE" ? "RECEIVABLE"
    : event.type === "PAYABLE" ? "PAYABLE"
    : "DEBT"; // event.type === "DEBT"
  return {
    recordId: event.id,
    kind: "FINANCIAL_EVENT",
    fallbackType,
    categoryText: event.categoryName,
    lookupText: `${event.partyName || ""} ${event.description || ""}`.trim(),
  };
}

// Debt and Commitment are structural liabilities regardless of what their
// description text mentions (e.g. a commitment description containing "sewa"
// must still resolve as a LIABILITY, not get reclassified as Rental Opex by
// a keyword hit) — so these intentionally do NOT feed lookupText/categoryText
// into the canonical/keyword tiers. They always resolve via the deterministic
// type fallback, which is itself accounting-correct for these record kinds.
export function fromDebtRecord(debt: DebtRecord): ClassificationInput {
  return {
    recordId: debt.id,
    kind: "DEBT_RECORD",
    fallbackType: "DEBT",
    categoryText: null,
    lookupText: null,
  };
}

export function fromFinancialCommitment(commitment: FinancialCommitment): ClassificationInput {
  return {
    recordId: commitment.id,
    kind: "FINANCIAL_COMMITMENT",
    fallbackType: "COMMITMENT",
    categoryText: null,
    lookupText: null,
  };
}

export function fromAssetPurchase(asset: AssetPurchase): ClassificationInput {
  return {
    recordId: asset.id,
    kind: "ASSET_PURCHASE",
    fallbackType: "ASSET_PURCHASE",
    categoryText: asset.category,
    lookupText: `${asset.vendorName || ""} ${asset.assetName || ""} ${asset.notes || ""}`.trim(),
  };
}

// Same structural reasoning as Debt/Commitment above: an Owner Transaction's
// type (CAPITAL_INJECTION/DRAWING) already fully determines it is Equity —
// no free-text keyword tier is applied.
export function fromOwnerTransaction(txn: OwnerTransaction): ClassificationInput {
  return {
    recordId: txn.id,
    kind: "OWNER_TRANSACTION",
    fallbackType: txn.type === "CAPITAL_INJECTION" ? "CAPITAL_INJECTION" : "DRAWING",
    categoryText: null,
    lookupText: null,
  };
}

/** Convenience: every implemented rule's canonical category, for coverage validation. */
export function listAllCanonicalCategories(): CanonicalCategory[] {
  return ACCOUNTING_KNOWLEDGE_BASE.map((rule) => rule.id);
}
