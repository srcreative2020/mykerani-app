// MyKerani — Transaction Understanding Layer (display layer only)
//
// Produces a human-friendly Malay label for a FinancialEvent by combining
// signals that already exist on the ledger record: internal-transfer
// detection, business mapping, accounting classification, transaction
// direction, and a raw-bank-token fallback table. Nothing here writes to
// the database, mutates the ledger, or feeds report generation — those all
// keep reading the original `categoryName`/`partyName`/`description`
// exactly as before. This is purely what gets rendered to the user.
//
// Precedence (first match wins):
//   1. Internal Transfer Detection (matches one of the user's own businesses)
//   2. Business Mapping (ev.businessId already resolved)
//   3. Accounting Classification (resolveLevel1Group canonical category)
//   4. Transaction Direction (type-based fallback)
//   5. Raw Token Normalization (bank jargon -> plain Malay)
//   6. Original raw text (last-resort fallback, never blank)

import type { FinancialEvent } from "../types";
import type { Business } from "./profileData";
import { fromFinancialEvent, resolveLevel1Group } from "./reportClassificationEngine";
import type { CanonicalCategory } from "./accountingClassificationMap";

const normalizeForMatch = (s: string) =>
  s.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Same matching rule as OwnerDashboard's matchOwnBusiness — a transaction
 * whose description names one of the user's own registered businesses is an
 * inter-business movement, not a real external income/expense. */
function matchesOwnBusiness(text: string, ownBusinesses: Business[]): boolean {
  const normText = normalizeForMatch(text);
  if (!normText) return false;
  return ownBusinesses.some((b) => {
    const normName = normalizeForMatch(b.businessName || "");
    if (normName.length < 3) return false;
    return normText.includes(normName) || normName.includes(normText);
  });
}

const REFUND_KEYWORDS = ["REFUND", "PULANGAN", "BAYARAN BALIK", "REVERSAL"];

/** Raw bank/merchant jargon -> plain Malay, used only when no business or
 * accounting-category signal produced a more specific label. */
const RAW_TOKEN_MAP: { pattern: RegExp; incomeLabel: string; expenseLabel: string }[] = [
  { pattern: /DUITNOW/, incomeLabel: "Jualan Diterima", expenseLabel: "Pembayaran DuitNow" },
  { pattern: /GIRO/, incomeLabel: "Wang Diterima", expenseLabel: "Pindahan Keluar" },
  { pattern: /\bFPX\b/, incomeLabel: "Bayaran Diterima", expenseLabel: "Pembayaran Online" },
  { pattern: /\bIBG\b/, incomeLabel: "Pindahan Masuk", expenseLabel: "Pindahan Bank" },
  { pattern: /TRANSFER|PINDAH/, incomeLabel: "Pindahan Masuk", expenseLabel: "Pindahan Keluar" },
  { pattern: /\bCR\b/, incomeLabel: "Wang Diterima", expenseLabel: "Pindahan Keluar" },
  { pattern: /\bDR\b/, incomeLabel: "Wang Diterima", expenseLabel: "Pembayaran" },
];

/** Canonical accounting category -> a label a non-accountant understands. */
const CATEGORY_LABEL_MAP: Partial<Record<CanonicalCategory, { incomeLabel?: string; expenseLabel?: string }>> = {
  SALES_REVENUE: { incomeLabel: "Jualan" },
  SERVICE_REVENUE: { incomeLabel: "Bayaran Perkhidmatan" },
  OTHER_INCOME: { incomeLabel: "Pendapatan Lain" },
  INVENTORY_STOCK: { expenseLabel: "Bayaran Supplier" },
  RAW_MATERIALS: { expenseLabel: "Bayaran Supplier" },
  DIRECT_LABOUR: { expenseLabel: "Bayaran Pekerja" },
  UTILITIES: { expenseLabel: "Pembayaran Utiliti" },
  RENTAL: { expenseLabel: "Pembayaran Sewa" },
  INTERNET: { expenseLabel: "Pembayaran Internet" },
  TELEPHONE: { expenseLabel: "Pembayaran Telefon" },
  FUEL_TRANSPORT: { expenseLabel: "Perbelanjaan Pengangkutan" },
  OFFICE_SUPPLIES: { expenseLabel: "Bekalan Pejabat" },
  MARKETING: { expenseLabel: "Pembayaran Marketing" },
  INSURANCE: { expenseLabel: "Pembayaran Insurans" },
  PROFESSIONAL_FEES: { expenseLabel: "Bayaran Profesional" },
  PAYABLES: { expenseLabel: "Bayaran Supplier" },
  LOANS: { expenseLabel: "Bayaran Pinjaman" },
};

/** Minimum classification confidence before trusting a category-specific
 * label over the safer, more generic direction-only label. Below this, an
 * assertive label (e.g. "Pembayaran Sewa") could mislead more than help. */
const MIN_CONFIDENT_CATEGORY_CONFIDENCE = 0.7;

export interface FriendlyTransactionLabel {
  label: string;
  /** Which tier of the precedence cascade produced the label, for debugging/QA. */
  source: "INTERNAL_TRANSFER" | "BUSINESS_MAPPING" | "ACCOUNTING_CLASSIFICATION" | "DIRECTION" | "RAW_TOKEN" | "RAW_TEXT";
}

export function getFriendlyTransactionLabel(ev: FinancialEvent, businesses: Business[]): FriendlyTransactionLabel {
  const rawText = `${ev.partyName || ""} ${ev.description || ""}`.trim();
  const isIncome = ev.type === "INCOME" || ev.type === "RECEIVABLE";

  // Refund check applies regardless of tier below — a refund is neither a
  // normal sale nor a normal expense, it reverses one.
  const isRefund = REFUND_KEYWORDS.some((kw) => rawText.toUpperCase().includes(kw));
  if (isRefund) {
    return { label: "Refund", source: "RAW_TOKEN" };
  }

  // 1. Internal Transfer Detection — counterparty IS one of the user's own
  // registered businesses, so this is money moving between the user's own
  // ledgers, not a real external transaction.
  const ownBusinesses = businesses.filter((b) => b.isActive);
  if (matchesOwnBusiness(rawText, ownBusinesses)) {
    return { label: "Transfer Dalaman", source: "INTERNAL_TRANSFER" };
  }

  // 2. Business Mapping — already resolved to a specific registered
  // business (counterparty role implied by direction).
  if (ev.businessId) {
    const business = businesses.find((b) => b.id === ev.businessId);
    if (business) {
      return {
        label: isIncome ? "Bayaran Pelanggan" : "Bayaran Supplier",
        source: "BUSINESS_MAPPING",
      };
    }
  }

  // 3. Accounting Classification — use the same canonical resolver the P&L
  // uses, but only trust a specific label when confidence is high enough.
  const resolution = resolveLevel1Group(fromFinancialEvent(ev));
  if (resolution.canonicalCategory && resolution.confidence >= MIN_CONFIDENT_CATEGORY_CONFIDENCE) {
    const mapped = CATEGORY_LABEL_MAP[resolution.canonicalCategory];
    const label = isIncome ? mapped?.incomeLabel : mapped?.expenseLabel;
    if (label) {
      return { label, source: "ACCOUNTING_CLASSIFICATION" };
    }
  }

  // 4. Transaction Direction — there is no description at all to read
  // anything from, so the only honest signal left is money-in vs money-out.
  if (!rawText) {
    return { label: isIncome ? "Pindahan Masuk" : "Pindahan Keluar", source: "DIRECTION" };
  }

  // 5. Raw Token Normalization — bank/merchant jargon found in the raw text
  // maps to a direction-aware plain-Malay phrase.
  const upperRaw = rawText.toUpperCase();
  for (const token of RAW_TOKEN_MAP) {
    if (token.pattern.test(upperRaw)) {
      return {
        label: isIncome ? token.incomeLabel : token.expenseLabel,
        source: "RAW_TOKEN",
      };
    }
  }

  // 6. Original raw text — last resort, never hide the data entirely.
  return { label: ev.partyName || ev.categoryName || rawText, source: "RAW_TEXT" };
}
