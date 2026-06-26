// MyKerani — Internal Transfer Detection (Financial Recovery Foundation Build Sprint V1)
//
// Detects the classic double-counting trap when importing multiple bank/cash
// accounts from the same business: Account A debits RM X and Account B
// credits RM X within a short window — that pair is an Internal Transfer
// between the user's own accounts, not real Income or Expense, and must not
// inflate either side of the P&L.
//
// Stateless, pure functions only. No DB, no I/O, no React.

import type { ImportedBankTransaction } from "./bankStatementImport";

export interface InternalTransferMatch {
  debitTransaction: ImportedBankTransaction;
  creditTransaction: ImportedBankTransaction;
  amountMyr: number;
  daysApart: number;
  confidenceScore: number; // 0..1
}

const DEFAULT_WINDOW_DAYS = 3;
const DEFAULT_AMOUNT_TOLERANCE_MYR = 0.01;

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.abs(a - b) / (1000 * 60 * 60 * 24);
}

/**
 * Find DEBIT/CREDIT pairs across DIFFERENT accounts with matching amounts
 * within `windowDays`. Each transaction is consumed by at most one match
 * (greedy, closest-in-time-first) so the same row never gets double-flagged.
 */
export function detectInternalTransfers(
  transactions: ImportedBankTransaction[],
  windowDays: number = DEFAULT_WINDOW_DAYS,
  amountToleranceMyr: number = DEFAULT_AMOUNT_TOLERANCE_MYR
): InternalTransferMatch[] {
  const debits = transactions.filter((t) => t.direction === "DEBIT");
  const credits = transactions.filter((t) => t.direction === "CREDIT");

  const candidates: InternalTransferMatch[] = [];
  for (const debit of debits) {
    for (const credit of credits) {
      if (debit.account === credit.account) continue; // must be a different account to be a "transfer"
      if (Math.abs(debit.amountMyr - credit.amountMyr) > amountToleranceMyr) continue;
      const daysApart = daysBetween(debit.date, credit.date);
      if (daysApart > windowDays) continue;

      const confidenceScore = daysApart === 0 ? 0.95 : Math.max(0.5, 0.95 - daysApart * 0.15);
      candidates.push({ debitTransaction: debit, creditTransaction: credit, amountMyr: debit.amountMyr, daysApart, confidenceScore });
    }
  }

  // Greedy assignment: best (highest-confidence) matches first, each transaction used once.
  candidates.sort((a, b) => b.confidenceScore - a.confidenceScore);
  const usedDebit = new Set<ImportedBankTransaction>();
  const usedCredit = new Set<ImportedBankTransaction>();
  const matches: InternalTransferMatch[] = [];

  for (const candidate of candidates) {
    if (usedDebit.has(candidate.debitTransaction) || usedCredit.has(candidate.creditTransaction)) continue;
    usedDebit.add(candidate.debitTransaction);
    usedCredit.add(candidate.creditTransaction);
    matches.push(candidate);
  }

  return matches;
}

/** Convenience: the set of transactions that should be EXCLUDED from Income/Expense classification because they're internal transfers. */
export function getInternalTransferTransactionSet(matches: InternalTransferMatch[]): Set<ImportedBankTransaction> {
  const set = new Set<ImportedBankTransaction>();
  for (const m of matches) {
    set.add(m.debitTransaction);
    set.add(m.creditTransaction);
  }
  return set;
}

// ─── Profile-aware transfer classification ────────────────────────────────────
// FIX 4: Classifies detected internal transfers by relationship type.
// Uses bank account → business mapping to determine transfer category.

export type TransferCategory = "INTRA_BUSINESS" | "INTER_BUSINESS" | "OWNER_BUSINESS" | "UNKNOWN";

export interface ClassifiedTransfer extends InternalTransferMatch {
  category: TransferCategory;
  description: string;
}

export function classifyTransfer(
  match: InternalTransferMatch,
  bankAccountBusinesses?: Record<string, string[]>, // bankAccountId → businessIds[]
  ownerBankAccountIds?: string[]
): ClassifiedTransfer {
  const debitAccount = match.debitTransaction.account || "";
  const creditAccount = match.creditTransaction.account || "";

  const debitBusinesses = bankAccountBusinesses?.[debitAccount] || [];
  const creditBusinesses = bankAccountBusinesses?.[creditAccount] || [];
  const debitIsOwner = ownerBankAccountIds?.includes(debitAccount) ?? false;
  const creditIsOwner = ownerBankAccountIds?.includes(creditAccount) ?? false;

  let category: TransferCategory = "UNKNOWN";
  let description = "Pemindahan antara akaun";

  if (debitBusinesses.length > 0 && creditBusinesses.length > 0) {
    const sharedBusiness = debitBusinesses.find(b => creditBusinesses.includes(b));
    if (sharedBusiness) {
      category = "INTRA_BUSINESS";
      description = "Pemindahan dalam perniagaan yang sama";
    } else {
      category = "INTER_BUSINESS";
      description = "Pemindahan antara perniagaan berbeza";
    }
  } else if ((debitIsOwner || debitBusinesses.length === 0) && creditBusinesses.length > 0) {
    category = "OWNER_BUSINESS";
    description = "Pemindahan pemilik ke perniagaan (modal)";
  } else if (debitBusinesses.length > 0 && (creditIsOwner || creditBusinesses.length === 0)) {
    category = "OWNER_BUSINESS";
    description = "Pemindahan perniagaan ke pemilik (drawing)";
  }

  return { ...match, category, description };
}
