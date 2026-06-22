// MyKerani — Bank Statement Import Foundation (Financial Recovery Foundation Build Sprint V1)
//
// Purpose: normalize bank statement exports (CSV today; Excel feeds the same
// pipeline once a sheet is read into rows by the UI layer; PDF/scanned
// statements already go through the existing AI OCR "STATEMENT" document
// flow in OCREngineConsole.tsx — this module does not duplicate that path,
// it only covers structured CSV/Excel exports where no OCR call is needed).
//
// Output is always the standard schema the sprint asked for: Date,
// Description, Amount, Debit/Credit, Reference, Account — regardless of
// which bank's column layout the source file used.
//
// Stateless, pure functions only. No DB, no I/O, no React.

export type SupportedBank =
  | "MAYBANK"
  | "CIMB"
  | "RHB"
  | "BSN"
  | "BANK_ISLAM"
  | "PUBLIC_BANK"
  | "HONG_LEONG"
  | "GENERIC";

export interface ImportedBankTransaction {
  date: string; // ISO yyyy-mm-dd, normalized regardless of source format
  description: string;
  amountMyr: number; // always positive — direction lives in `direction`
  direction: "DEBIT" | "CREDIT";
  referenceNumber: string;
  account: string;
  sourceBank: SupportedBank;
  sourceRowIndex: number;
}

export interface BankStatementParseResult {
  bank: SupportedBank;
  transactions: ImportedBankTransaction[];
  skippedRows: { rowIndex: number; reason: string }[];
}

/** Column-name presets per bank, matched case-insensitively against the CSV header row. */
interface ColumnPreset {
  date: string[];
  description: string[];
  debit: string[];
  credit: string[];
  amount: string[]; // single signed/unsigned amount column, when bank doesn't split debit/credit
  reference: string[];
  account: string[];
}

const COLUMN_PRESETS: Record<SupportedBank, ColumnPreset> = {
  MAYBANK: {
    date: ["transaction date", "date", "tarikh"],
    description: ["description", "transaction description", "particulars"],
    debit: ["debit", "withdrawal", "debit amount"],
    credit: ["credit", "deposit", "credit amount"],
    amount: ["amount"],
    reference: ["reference", "reference no", "cheque no", "ref no"],
    account: ["account no", "account number", "account"],
  },
  CIMB: {
    date: ["date", "transaction date", "value date"],
    description: ["description", "transaction details", "narration"],
    debit: ["debit", "debit amount", "withdrawal amount"],
    credit: ["credit", "credit amount", "deposit amount"],
    amount: ["amount"],
    reference: ["reference", "reference number", "cheque/ref no"],
    account: ["account number", "account no", "account"],
  },
  RHB: {
    date: ["date", "transaction date", "posting date"],
    description: ["description", "transaction description", "details"],
    debit: ["debit", "withdrawal"],
    credit: ["credit", "deposit"],
    amount: ["amount"],
    reference: ["reference no", "reference", "ref no"],
    account: ["account no", "account number", "account"],
  },
  BSN: {
    date: ["date", "tarikh", "transaction date"],
    description: ["description", "butiran", "particulars"],
    debit: ["debit", "keluar"],
    credit: ["credit", "masuk"],
    amount: ["amount", "jumlah"],
    reference: ["reference", "rujukan"],
    account: ["account no", "no akaun", "account"],
  },
  BANK_ISLAM: {
    date: ["date", "transaction date", "tarikh transaksi"],
    description: ["description", "transaction description", "butiran transaksi"],
    debit: ["debit", "debit (rm)"],
    credit: ["credit", "credit (rm)"],
    amount: ["amount", "jumlah (rm)"],
    reference: ["reference", "reference number", "no rujukan"],
    account: ["account number", "account no", "no akaun"],
  },
  PUBLIC_BANK: {
    date: ["date", "transaction date", "trans date"],
    description: ["description", "transaction particulars", "particulars"],
    debit: ["withdrawal", "debit"],
    credit: ["deposit", "credit"],
    amount: ["amount"],
    reference: ["reference", "cheque no", "ref no"],
    account: ["account no", "account number", "account"],
  },
  HONG_LEONG: {
    date: ["date", "transaction date", "value date"],
    description: ["description", "transaction description", "remarks"],
    debit: ["debit", "debit amount (rm)"],
    credit: ["credit", "credit amount (rm)"],
    amount: ["amount", "amount (rm)"],
    reference: ["reference", "reference no", "ref no"],
    account: ["account number", "account no", "account"],
  },
  GENERIC: {
    date: ["date", "transaction date", "tarikh", "value date", "posting date"],
    description: ["description", "particulars", "narration", "details", "remarks", "butiran"],
    debit: ["debit", "withdrawal", "debit amount", "keluar"],
    credit: ["credit", "deposit", "credit amount", "masuk"],
    amount: ["amount", "jumlah"],
    reference: ["reference", "reference no", "ref no", "rujukan", "cheque no"],
    account: ["account no", "account number", "account", "no akaun"],
  },
};

/** Splits a CSV line respecting double-quoted fields (handles embedded commas/quotes). */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

/** Parses raw CSV text into a 2D array of trimmed string cells, skipping blank lines. */
export function csvTextToRows(csvText: string): string[][] {
  return csvText
    .split(/\r\n|\r|\n/)
    .filter((line) => line.trim().length > 0)
    .map(splitCsvLine);
}

function findColumnIndex(header: string[], candidates: string[]): number {
  const normalizedHeader = header.map((h) => h.toLowerCase().trim());
  for (const candidate of candidates) {
    const idx = normalizedHeader.indexOf(candidate);
    if (idx !== -1) return idx;
  }
  return -1;
}

/** Normalizes common date formats (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD) to ISO yyyy-mm-dd. */
export function normalizeDate(raw: string): string | null {
  const trimmed = raw.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return trimmed;

  const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    let [, d, m, y] = dmy;
    if (y.length === 2) y = `20${y}`;
    const day = d.padStart(2, "0");
    const month = m.padStart(2, "0");
    return `${y}-${month}-${day}`;
  }
  return null;
}

function parseAmountCell(raw: string): number {
  const cleaned = raw.replace(/[, RM]/gi, "").trim();
  if (!cleaned) return 0;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

/**
 * Core normalizer: any 2D row array (from CSV today, or from an Excel sheet
 * already read into rows by the UI layer) plus a bank preset -> the standard
 * ImportedBankTransaction[] schema. The first row is always treated as the
 * header.
 */
export function normalizeBankRows(rows: string[][], bank: SupportedBank, accountLabel?: string): BankStatementParseResult {
  const skippedRows: { rowIndex: number; reason: string }[] = [];
  if (rows.length < 2) {
    return { bank, transactions: [], skippedRows: [{ rowIndex: 0, reason: "Tiada baris data selepas header." }] };
  }

  const preset = COLUMN_PRESETS[bank];
  const header = rows[0];

  const dateIdx = findColumnIndex(header, preset.date);
  const descIdx = findColumnIndex(header, preset.description);
  const debitIdx = findColumnIndex(header, preset.debit);
  const creditIdx = findColumnIndex(header, preset.credit);
  const amountIdx = findColumnIndex(header, preset.amount);
  const refIdx = findColumnIndex(header, preset.reference);
  const accountIdx = findColumnIndex(header, preset.account);

  if (dateIdx === -1 || descIdx === -1) {
    return {
      bank,
      transactions: [],
      skippedRows: [{ rowIndex: 0, reason: `Lajur Date/Description tidak ditemui dalam header untuk format ${bank}.` }],
    };
  }

  const transactions: ImportedBankTransaction[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rawDate = row[dateIdx] || "";
    const date = normalizeDate(rawDate);
    if (!date) {
      skippedRows.push({ rowIndex: i, reason: `Format tarikh tidak dikenali: "${rawDate}".` });
      continue;
    }

    const description = (row[descIdx] || "").trim();
    if (!description) {
      skippedRows.push({ rowIndex: i, reason: "Description kosong." });
      continue;
    }

    let direction: "DEBIT" | "CREDIT";
    let amountMyr: number;

    if (debitIdx !== -1 && creditIdx !== -1) {
      const debitVal = parseAmountCell(row[debitIdx] || "");
      const creditVal = parseAmountCell(row[creditIdx] || "");
      if (debitVal > 0) {
        direction = "DEBIT";
        amountMyr = debitVal;
      } else if (creditVal > 0) {
        direction = "CREDIT";
        amountMyr = creditVal;
      } else {
        skippedRows.push({ rowIndex: i, reason: "Debit dan Credit kedua-duanya kosong/sifar." });
        continue;
      }
    } else if (amountIdx !== -1) {
      const rawAmount = (row[amountIdx] || "").trim();
      const signed = parseFloat(rawAmount.replace(/[, RM]/gi, ""));
      if (!Number.isFinite(signed) || signed === 0) {
        skippedRows.push({ rowIndex: i, reason: `Amount tidak sah: "${rawAmount}".` });
        continue;
      }
      direction = signed < 0 ? "DEBIT" : "CREDIT";
      amountMyr = Math.abs(signed);
    } else {
      skippedRows.push({ rowIndex: i, reason: "Tiada lajur Debit/Credit atau Amount ditemui." });
      continue;
    }

    transactions.push({
      date,
      description,
      amountMyr,
      direction,
      referenceNumber: refIdx !== -1 ? (row[refIdx] || "").trim() : "",
      account: accountIdx !== -1 ? (row[accountIdx] || "").trim() : (accountLabel || ""),
      sourceBank: bank,
      sourceRowIndex: i,
    });
  }

  return { bank, transactions, skippedRows };
}

/** Auto-detects which bank preset best matches a CSV header row, falling back to GENERIC. */
export function detectBankFromHeader(header: string[]): SupportedBank {
  const banks: SupportedBank[] = ["MAYBANK", "CIMB", "RHB", "BSN", "BANK_ISLAM", "PUBLIC_BANK", "HONG_LEONG"];
  for (const bank of banks) {
    const preset = COLUMN_PRESETS[bank];
    const hasDate = findColumnIndex(header, preset.date) !== -1;
    const hasDesc = findColumnIndex(header, preset.description) !== -1;
    const hasAmountSignal =
      (findColumnIndex(header, preset.debit) !== -1 && findColumnIndex(header, preset.credit) !== -1) ||
      findColumnIndex(header, preset.amount) !== -1;
    if (hasDate && hasDesc && hasAmountSignal) return bank;
  }
  return "GENERIC";
}

/** Entry point for CSV bank statement files. Excel files: read into rows via the UI's sheet
 * reader, then call normalizeBankRows() directly with the same rows shape. */
export function parseCsvBankStatement(csvText: string, bank?: SupportedBank, accountLabel?: string): BankStatementParseResult {
  const rows = csvTextToRows(csvText);
  const resolvedBank = bank || (rows.length > 0 ? detectBankFromHeader(rows[0]) : "GENERIC");
  return normalizeBankRows(rows, resolvedBank, accountLabel);
}
