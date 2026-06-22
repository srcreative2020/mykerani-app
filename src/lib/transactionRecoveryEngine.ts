// MyKerani — Transaction Recovery Engine (Financial Recovery Foundation Build Sprint V1)
//
// Flow the sprint asked for: Imported Transaction -> Suggested Category ->
// Confidence Score -> User Confirm. Uses the existing, already-shipped
// Report Classification Engine / Canonical Categories / Accounting Knowledge
// Base (resolveLevel1Group, normalizeToCanonical, matchAccountingRule) — no
// new classification logic invented, per the sprint's reuse instruction.
//
// "AI Suggests -> User Confirms" (MYKERANI_VISION.md): this module only ever
// produces a SUGGESTION. Nothing here writes a FinancialEvent — the caller
// (UI layer) does that only after the user explicitly confirms, exactly like
// every other AI-assisted record path in the app (OCR, AI Assistant).
//
// Stateless, pure functions only. No DB, no I/O, no React.

import type { ImportedBankTransaction } from "./bankStatementImport";
import { matchAccountingRule, type CanonicalCategory } from "./accountingClassificationMap";
import type { OcrLearnedPattern } from "../types";

export interface RecoverySuggestion {
  transaction: ImportedBankTransaction;
  suggestedCategoryName: string;
  suggestedRecordType: "INCOME" | "EXPENSE";
  canonicalCategory: CanonicalCategory | null;
  confidenceScore: number; // 0..1
  source: "LEARNED_VENDOR_PATTERN" | "KNOWLEDGE_BASE_MATCH" | "DIRECTION_FALLBACK";
}

const LEARNED_PATTERN_CONFIDENCE_FLOOR = 0.8;
const KNOWLEDGE_BASE_CONFIDENCE = 0.65;
const FALLBACK_CONFIDENCE = 0.35;

/**
 * Suggest a category + record type for one imported bank transaction.
 * Resolution order (highest trust first), mirrors the AI Assistant's
 * existing learned-pattern-first priority in server.ts:
 *   1. This tenant's own confirmed OCR/transaction history (learnedPatterns).
 *   2. The shared Accounting Knowledge Base keyword match.
 *   3. Deterministic fallback purely from DEBIT/CREDIT direction (always
 *      succeeds — same "never return null" guarantee as resolveLevel1Group).
 */
export function suggestCategoryForTransaction(
  transaction: ImportedBankTransaction,
  learnedPatterns: OcrLearnedPattern[]
): RecoverySuggestion {
  const recordTypeFromDirection: "INCOME" | "EXPENSE" = transaction.direction === "CREDIT" ? "INCOME" : "EXPENSE";

  const lowerDesc = transaction.description.toLowerCase();
  const learnedMatch = learnedPatterns.find((p) => lowerDesc.includes(p.vendorName.toLowerCase()));
  if (learnedMatch && (learnedMatch.recordType === "INCOME" || learnedMatch.recordType === "EXPENSE")) {
    return {
      transaction,
      suggestedCategoryName: learnedMatch.category,
      suggestedRecordType: learnedMatch.recordType,
      canonicalCategory: null,
      confidenceScore: Math.max(LEARNED_PATTERN_CONFIDENCE_FLOOR, learnedMatch.confidenceScore),
      source: "LEARNED_VENDOR_PATTERN",
    };
  }

  const ruleMatch = matchAccountingRule(transaction.description);
  if (ruleMatch) {
    const matchesDirection =
      (recordTypeFromDirection === "INCOME" && ruleMatch.level1Group === "REVENUE") ||
      (recordTypeFromDirection === "EXPENSE" && (ruleMatch.level1Group === "COST_OF_SALES" || ruleMatch.level1Group === "OPERATING_EXPENSES"));
    return {
      transaction,
      suggestedCategoryName: ruleMatch.recommendedCategory,
      suggestedRecordType: recordTypeFromDirection,
      canonicalCategory: ruleMatch.id,
      confidenceScore: matchesDirection ? KNOWLEDGE_BASE_CONFIDENCE : KNOWLEDGE_BASE_CONFIDENCE * 0.7,
      source: "KNOWLEDGE_BASE_MATCH",
    };
  }

  return {
    transaction,
    suggestedCategoryName: "Lain-lain",
    suggestedRecordType: recordTypeFromDirection,
    canonicalCategory: null,
    confidenceScore: FALLBACK_CONFIDENCE,
    source: "DIRECTION_FALLBACK",
  };
}

/** Batch helper for a whole imported statement. */
export function suggestCategoriesForTransactions(
  transactions: ImportedBankTransaction[],
  learnedPatterns: OcrLearnedPattern[]
): RecoverySuggestion[] {
  return transactions.map((t) => suggestCategoryForTransaction(t, learnedPatterns));
}
