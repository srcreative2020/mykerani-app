// MyKerani — Cross-Source Duplicate Detection Engine (Phase 2C)
//
// Detects the same real-world transaction having been entered into the
// system more than once via DIFFERENT sources (e.g. a receipt confirmed via
// OCR, then the same expense also landing in a later bank statement import).
// This is distinct from internalTransferDetection.ts, which detects two
// *different* real transactions (a transfer's debit leg and credit leg)
// that should be excluded from P&L — this engine instead detects ONE real
// transaction that was *recorded twice*.
//
// Stateless, pure functions only. No DB, no I/O, no React. Mirrors the
// bucket -> score -> greedy-non-overlapping-assignment style of
// internalTransferDetection.ts.
//
// HARD SAFETY RULE: this engine NEVER outputs an instruction to delete,
// merge, void, or hide a record. It only ever produces a *suggested*
// classification for a human reviewer to act on. The DB row's actual
// `classification` (CONFIRMED_DUPLICATE / REVIEWED_NOT_DUPLICATE) is set
// ONLY by an explicit user review action elsewhere (see
// FinancialRecordsContext.reviewDuplicateFlag) — never by this engine.

import type { FinancialEvent, FinancialRecordType, SourceSystem } from "../types";

export interface DuplicateFactorBreakdown {
  amount: number;
  date: number;
  description: number;
  referenceNumber: number;
  business: number;
  branch: number;
}

// Engine's own suggested-confidence output. Deliberately NOT named
// `classification` to avoid confusion with the DB row's user-controlled
// `classification` field (DuplicateClassification in types.ts) — this is
// only ever a suggestion, never a decision.
export type SuggestedDuplicateClassification =
  | "UNIQUE"
  | "POSSIBLE_DUPLICATE"
  | "LIKELY_DUPLICATE"
  | "CONFIRMED_DUPLICATE"; // "system's confidence is very high" — NOT a user decision

export interface DuplicateCandidatePair {
  recordA: FinancialEvent;
  recordB: FinancialEvent;
  score: number; // 0..1 weighted overall similarity
  suggestedClassification: SuggestedDuplicateClassification;
  factorBreakdown: DuplicateFactorBreakdown;
}

// ---------------------------------------------------------------------------
// Scoring weights (EXACT, mandatory per spec). Sum to 1.0.
// ---------------------------------------------------------------------------
export const DUPLICATE_SCORE_WEIGHTS = {
  amount: 0.35,
  date: 0.2,
  description: 0.2,
  referenceNumber: 0.1,
  business: 0.1,
  branch: 0.05,
} as const;

// Classification thresholds. "CONFIRMED_DUPLICATE" here means the engine's
// own suggested confidence is very high — it is NOT the DB row's
// user-decided classification of the same name; see the module comment.
const THRESHOLD_UNIQUE_MAX = 0.5; // score < 0.5  -> UNIQUE
const THRESHOLD_POSSIBLE_MAX = 0.7; // 0.5 <= score < 0.7 -> POSSIBLE_DUPLICATE
const THRESHOLD_LIKELY_MAX = 0.85; // 0.7 <= score < 0.85 -> LIKELY_DUPLICATE
// score >= 0.85 -> CONFIRMED_DUPLICATE (engine-suggested)

const DEFAULT_AMOUNT_TOLERANCE_MYR = 0.01;
const DEFAULT_DATE_WINDOW_DAYS = 5; // beyond this window, date score floors at 0
const DEFAULT_AMOUNT_BUCKET_TOLERANCE_MYR = 0.01; // candidate bucketing tolerance (kept tight; scoring itself does the real decay)

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.abs(a - b) / (1000 * 60 * 60 * 24);
}

/** Amount score: exact match within tolerance = 1, linearly decaying to 0 by 5% relative difference (or RM5, whichever is larger, to stay sane for tiny amounts). */
function scoreAmount(amountA: number, amountB: number): number {
  const diff = Math.abs(amountA - amountB);
  if (diff <= DEFAULT_AMOUNT_TOLERANCE_MYR) return 1;
  const band = Math.max(Math.abs(amountA) * 0.05, 5);
  if (diff >= band) return 0;
  return 1 - diff / band;
}

/** Date score: exact match = 1, linearly decaying to 0 over DEFAULT_DATE_WINDOW_DAYS. */
function scoreDate(dateA: string, dateB: string): number {
  const days = daysBetween(dateA, dateB);
  if (days <= 0) return 1;
  if (days >= DEFAULT_DATE_WINDOW_DAYS) return 0;
  return 1 - days / DEFAULT_DATE_WINDOW_DAYS;
}

/** Cheap fuzzy string similarity (token-overlap based, no external deps) for description/party-name comparison. */
function normalizeText(text: string): string {
  return (text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSetSimilarity(a: string, b: string): number {
  const normA = normalizeText(a);
  const normB = normalizeText(b);
  if (!normA && !normB) return 0.5; // both missing -- neutral, not evidence of sameness
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;

  const tokensA = new Set(normA.split(" ").filter(Boolean));
  const tokensB = new Set(normB.split(" ").filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union; // Jaccard similarity
}

/** Description score: fuzzy similarity over partyName + description combined (captures vendor name reused across sources, e.g. OCR merchant name vs. bank statement payee text). */
function scoreDescription(recordA: FinancialEvent, recordB: FinancialEvent): number {
  const textA = `${recordA.partyName || ""} ${recordA.description || ""}`;
  const textB = `${recordB.partyName || ""} ${recordB.description || ""}`;
  return tokenSetSimilarity(textA, textB);
}

/** Reference number score: exact match (case-insensitive, trimmed) = 1, else 0. No partial credit -- reference numbers are either the same documented instrument or not. */
function scoreReferenceNumber(refA?: string, refB?: string): number {
  const a = (refA || "").trim().toLowerCase();
  const b = (refB || "").trim().toLowerCase();
  if (!a || !b) return 0;
  return a === b ? 1 : 0;
}

/**
 * Identity-field score (used for business/branch): exact id match = 1, both
 * present but different = 0, BOTH ABSENT = 0.5 (neutral). Absence of a
 * business/branch link on either side is not evidence of sameness -- a
 * naive "missing on both = 1" would inflate scores for businesses/branches
 * that nobody has tagged yet, which is the common case for new workspaces.
 */
function scoreIdentityField(idA?: string | null, idB?: string | null): number {
  const a = idA || null;
  const b = idB || null;
  if (a === null && b === null) return 0.5;
  if (a === null || b === null) return 0.5; // one-sided absence: still neutral, not contradicting evidence
  return a === b ? 1 : 0;
}

function classify(score: number): SuggestedDuplicateClassification {
  if (score < THRESHOLD_UNIQUE_MAX) return "UNIQUE";
  if (score < THRESHOLD_POSSIBLE_MAX) return "POSSIBLE_DUPLICATE";
  if (score < THRESHOLD_LIKELY_MAX) return "LIKELY_DUPLICATE";
  return "CONFIRMED_DUPLICATE";
}

/** Score a single candidate pair. Exported for unit testing / reuse. */
export function scoreDuplicatePair(recordA: FinancialEvent, recordB: FinancialEvent): DuplicateCandidatePair {
  const factorBreakdown: DuplicateFactorBreakdown = {
    amount: scoreAmount(recordA.amountMyr, recordB.amountMyr),
    date: scoreDate(recordA.date, recordB.date),
    description: scoreDescription(recordA, recordB),
    referenceNumber: scoreReferenceNumber(recordA.referenceNumber, recordB.referenceNumber),
    business: scoreIdentityField(recordA.businessId, recordB.businessId),
    branch: scoreIdentityField(recordA.branchId, recordB.branchId),
  };

  const score =
    factorBreakdown.amount * DUPLICATE_SCORE_WEIGHTS.amount +
    factorBreakdown.date * DUPLICATE_SCORE_WEIGHTS.date +
    factorBreakdown.description * DUPLICATE_SCORE_WEIGHTS.description +
    factorBreakdown.referenceNumber * DUPLICATE_SCORE_WEIGHTS.referenceNumber +
    factorBreakdown.business * DUPLICATE_SCORE_WEIGHTS.business +
    factorBreakdown.branch * DUPLICATE_SCORE_WEIGHTS.branch;

  return {
    recordA,
    recordB,
    score,
    suggestedClassification: classify(score),
    factorBreakdown,
  };
}

function effectiveSourceSystem(record: FinancialEvent): SourceSystem {
  return record.sourceSystem || "MANUAL";
}

/**
 * Find cross-source duplicate candidate pairs within a single workspace's
 * records.
 *
 * Scoping decisions (see migrations 20260624000000_dedupe_ai_confirmed_records.sql
 * and 20260628000000_add_stmt_reference_unique_indexes.sql):
 * - Same-source duplicates for 'STMT-%' (bank statement import) rows are
 *   ALREADY prevented at the database layer via a partial unique index on
 *   (workspace_id, reference_number), because that reference number is
 *   derived deterministically from the statement line's own content. This
 *   engine therefore still skips same-source STMT/DOC pairs.
 * - AI Chat ('AI-%') reference numbers are NOT content-derived -- they are
 *   `AI-${chatSuggestionId}`, a fresh id generated per chat turn, so
 *   re-uploading and re-confirming the same receipt via AI Chat produces a
 *   different reference number each time and the unique-index/upsert
 *   protection never collides. AI_CHAT-sourced pairs are therefore NOT
 *   exempted from same-source comparison below -- this is the actual gap
 *   that needs catching cross-engine-wise.
 * - Only records of the EXACT same FinancialRecordType are ever compared
 *   (never Income vs Expense, never Receivable vs Payable, never across
 *   other types) -- enforced by bucketing on `type` below.
 */
export function detectCrossSourceDuplicates(
  records: FinancialEvent[],
  options: { dateWindowDays?: number; amountBucketToleranceMyr?: number } = {}
): DuplicateCandidatePair[] {
  const dateWindowDays = options.dateWindowDays ?? DEFAULT_DATE_WINDOW_DAYS;
  const amountBucketTolerance = options.amountBucketToleranceMyr ?? DEFAULT_AMOUNT_BUCKET_TOLERANCE_MYR;

  // Bucket by (workspace, type, rounded amount) so we never compare across
  // workspaces or transaction classes, and avoid O(n^2) over the whole
  // dataset -- mirrors internalTransferDetection.ts's bucketing approach.
  const buckets = new Map<string, FinancialEvent[]>();
  const bucketKey = (r: FinancialEvent) => {
    // Round to nearest RM1 bucket; amountBucketTolerance only needs to be
    // sub-RM1 for this to still group genuine near-matches together, since
    // the real tolerance check happens in scoreAmount during scoring, not
    // bucketing -- bucketing here is purely a performance pre-filter.
    const roundedAmount = Math.round(r.amountMyr);
    return `${r.workspaceId}::${r.type}::${roundedAmount}`;
  };

  for (const record of records) {
    const key = bucketKey(record);
    const existing = buckets.get(key);
    if (existing) existing.push(record);
    else buckets.set(key, [record]);
    // Also place into adjacent buckets (+/-1 RM) so amounts that round
    // differently (e.g. 100.49 vs 100.51) still get compared.
    const roundedAmount = Math.round(record.amountMyr);
    for (const delta of [-1, 1]) {
      const adjKey = `${record.workspaceId}::${record.type}::${roundedAmount + delta}`;
      const adjList = buckets.get(adjKey);
      if (adjList) adjList.push(record);
      else buckets.set(adjKey, [record]);
    }
  }

  const candidates: DuplicateCandidatePair[] = [];
  const seenPairKeys = new Set<string>();

  for (const bucket of buckets.values()) {
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const recordA = bucket[i];
        const recordB = bucket[j];
        if (recordA.id === recordB.id) continue;
        // Hard filter: exact same transaction class only.
        if (recordA.type !== recordB.type) continue;
        // Hard filter: same-source pairs are out of scope ONLY for sources
        // whose reference number is deterministically content-derived and
        // therefore already idempotency-protected at the DB layer (see
        // module comment). AI_CHAT reference numbers are not content-derived,
        // so AI_CHAT-vs-AI_CHAT pairs are still compared below.
        const sameSource = effectiveSourceSystem(recordA) === effectiveSourceSystem(recordB);
        if (sameSource && effectiveSourceSystem(recordA) !== "AI_CHAT") continue;
        // Quick reject outside the date window before full scoring.
        if (daysBetween(recordA.date, recordB.date) > dateWindowDays) continue;
        if (Math.abs(recordA.amountMyr - recordB.amountMyr) > Math.max(amountBucketTolerance, Math.abs(recordA.amountMyr) * 0.05, 5)) continue;

        // Canonical pair key (smaller id first) so the same pair found via
        // two different rounding buckets isn't scored/emitted twice.
        const [first, second] = recordA.id < recordB.id ? [recordA, recordB] : [recordB, recordA];
        const pairKey = `${first.id}::${second.id}`;
        if (seenPairKeys.has(pairKey)) continue;
        seenPairKeys.add(pairKey);

        const candidate = scoreDuplicatePair(first, second);
        if (candidate.suggestedClassification === "UNIQUE") continue; // not worth surfacing
        candidates.push(candidate);
      }
    }
  }

  // No greedy non-overlapping assignment here, unlike internal transfer
  // detection: a single record CAN legitimately be a candidate duplicate of
  // more than one other record (e.g. three accidental re-entries of the same
  // expense), and the user needs to see and resolve every such pair, not
  // just the single best match. Sort by score descending purely for a
  // sensible default Review Queue ordering.
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}
