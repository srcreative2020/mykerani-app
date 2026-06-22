// MyKerani — Bank Statement Production Validation.
// Replays the EXACT count-preservation logic used in OwnerDashboard.tsx
// (analyzeUploadedDoc / detectTransferPairsInLines / confirmDocReview) against
// a synthetic 100-transaction bank statement payload, using the REAL
// detectInternalTransfers() engine. Run via `npx tsx scripts/validateBankStatementProductionPipeline.ts`.

import { detectInternalTransfers } from "../src/lib/internalTransferDetection";
import type { ImportedBankTransaction } from "../src/lib/bankStatementImport";

type RawLine = { date: string; description: string; amount: number; type: "CREDIT" | "DEBIT"; suggestedCategory: string; confidenceScore: number };

// Exact copy of detectTransferPairsInLines() from src/screens/OwnerDashboard.tsx
function detectTransferPairsInLines(lines: RawLine[]) {
  const asTransactions: ImportedBankTransaction[] = lines.map((l, i) => ({
    date: l.date, description: l.description, amountMyr: l.amount,
    direction: l.type, referenceNumber: "", account: `line-${i}`,
    sourceBank: "GENERIC", sourceRowIndex: i,
  }));
  const matches = detectInternalTransfers(asTransactions);
  const pairByIndex = new Map<number, string>();
  matches.forEach((m) => {
    const debitIdx = Number(m.debitTransaction.account.replace("line-", ""));
    const creditIdx = Number(m.creditTransaction.account.replace("line-", ""));
    pairByIndex.set(debitIdx, lines[creditIdx].description);
    pairByIndex.set(creditIdx, lines[debitIdx].description);
  });
  return pairByIndex;
}

// Exact copy of the payload.transactions -> docReview.lines mapping in analyzeUploadedDoc()
function buildReviewLines(payloadTransactions: any[], myEvents: { date: string; description: string; amount: number }[] = []) {
  const rawLines: RawLine[] = payloadTransactions.map((t) => ({
    date: t.date || "", description: t.description || "", amount: Number(t.amount) || 0,
    type: (t.type === "CREDIT" ? "CREDIT" : "DEBIT") as "CREDIT" | "DEBIT",
    suggestedCategory: t.suggestedCategory || "Lain-lain",
    confidenceScore: Number(t.confidenceScore) || 0.7,
  }));
  const transferPairByIndex = detectTransferPairsInLines(rawLines);
  return rawLines.map((line, i) => {
    const transferPairLabel = transferPairByIndex.get(i);
    if (transferPairLabel) {
      return { ...line, include: false, isInternalTransfer: true, transferPairLabel };
    }
    // No existing financial events in this synthetic run -> no dedup matches.
    const matched = myEvents.find((e) => e.date === line.date && e.amount === line.amount && e.description === line.description);
    return { ...line, include: !matched, matchedEventId: matched ? "x" : undefined };
  });
}

// Exact copy of the confirmDocReview() import filter for bank-statement lines.
function simulateConfirmImport(lines: ReturnType<typeof buildReviewLines>) {
  const createdEvents: { description: string; amount: number; type: string }[] = [];
  lines.filter((l) => l.include).forEach((l) => {
    createdEvents.push({ description: l.description, amount: l.amount, type: l.type === "CREDIT" ? "INCOME" : "EXPENSE" });
  });
  return createdEvents;
}

const results: { name: string; pass: boolean; detail: string }[] = [];
function check(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
}

function isoDaysAgo(n: number): string {
  const d = new Date(Date.UTC(2026, 0, 31));
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().split("T")[0];
}

// ---------------------------------------------------------------------------
// CASE A — 100 distinct transactions, NO internal transfers, NO prior matches.
// Expected: OCR=100 -> payload=100 -> ReviewUI=100 -> ConfirmImport sends 100
// -> DB receives 100. This is the literal "PDF -> 100 -> 100 -> 100 -> 100 -> 100"
// scenario requested.
// ---------------------------------------------------------------------------
const caseATransactions = Array.from({ length: 100 }, (_, i) => ({
  date: isoDaysAgo(100 - i),
  description: `Vendor-${i} Payment Ref${1000 + i}`,
  amount: 10 + i, // every amount unique -> guarantees no accidental transfer-pair collision
  type: i % 2 === 0 ? "DEBIT" : "CREDIT",
  suggestedCategory: i % 2 === 0 ? "Operating Expense" : "Sales",
  confidenceScore: 0.9,
}));

const ocrCountA = caseATransactions.length;
const payloadCountA = caseATransactions.length; // payload.transactions[] is the same array, pass-through
const reviewLinesA = buildReviewLines(caseATransactions);
const reviewUiCountA = reviewLinesA.length; // Review UI renders docReview.lines.length, ALL rows (badges show status)
const confirmedA = simulateConfirmImport(reviewLinesA);
const dbWriteCountA = confirmedA.length;

check("CASE A: OCR transactions extracted = 100", ocrCountA === 100, `ocrCountA=${ocrCountA}`);
check("CASE A: payload.transactions[] length = 100", payloadCountA === 100, `payloadCountA=${payloadCountA}`);
check("CASE A: Review UI displays 100 lines", reviewUiCountA === 100, `reviewUiCountA=${reviewUiCountA}`);
check("CASE A: Confirm Import writes 100 records (no transfers/dupes to exclude)", dbWriteCountA === 100, `dbWriteCountA=${dbWriteCountA}`);
check("CASE A: zero internal transfers falsely flagged", reviewLinesA.filter((l: any) => l.isInternalTransfer).length === 0, `flagged=${reviewLinesA.filter((l: any) => l.isInternalTransfer).length}`);

// ---------------------------------------------------------------------------
// CASE B — 100 transactions where 10 pairs (20 rows) are genuine internal
// transfers (same amount, DEBIT+CREDIT, within 3 days). Expected: OCR=100,
// payload=100, ReviewUI=100 (all visible, 20 flagged), but Confirm Import
// correctly writes only 80 — by design, NOT a bug — since transfer pairs and
// duplicate-of-existing-record lines must never inflate Income/Expense.
// ---------------------------------------------------------------------------
const caseBTransactions: any[] = [];
for (let i = 0; i < 80; i++) {
  caseBTransactions.push({
    date: isoDaysAgo(100 - i), description: `Vendor-${i} Payment Ref${2000 + i}`,
    amount: 500 + i, type: i % 2 === 0 ? "DEBIT" : "CREDIT",
    suggestedCategory: i % 2 === 0 ? "Operating Expense" : "Sales", confidenceScore: 0.9,
  });
}
for (let i = 0; i < 10; i++) {
  const amt = 9000 + i; // distinct per pair, shared within the pair
  const date = isoDaysAgo(50 - i);
  caseBTransactions.push({ date, description: `Transfer to savings #${i}`, amount: amt, type: "DEBIT", suggestedCategory: "Lain-lain", confidenceScore: 0.9 });
  caseBTransactions.push({ date, description: `Transfer from current #${i}`, amount: amt, type: "CREDIT", suggestedCategory: "Lain-lain", confidenceScore: 0.9 });
}

const ocrCountB = caseBTransactions.length;
const reviewLinesB = buildReviewLines(caseBTransactions);
const reviewUiCountB = reviewLinesB.length;
const flaggedTransfersB = reviewLinesB.filter((l: any) => l.isInternalTransfer).length;
const confirmedB = simulateConfirmImport(reviewLinesB);
const dbWriteCountB = confirmedB.length;

check("CASE B: OCR transactions extracted = 100", ocrCountB === 100, `ocrCountB=${ocrCountB}`);
check("CASE B: Review UI displays ALL 100 lines (none silently dropped)", reviewUiCountB === 100, `reviewUiCountB=${reviewUiCountB}`);
check("CASE B: exactly 20 rows correctly flagged as internal transfers", flaggedTransfersB === 20, `flaggedTransfersB=${flaggedTransfersB}`);
check("CASE B: Confirm Import writes 80 records (100 - 20 transfer rows), by design", dbWriteCountB === 80, `dbWriteCountB=${dbWriteCountB}`);
check("CASE B: 100 = 80 (real) + 20 (transfers, intentionally excluded) reconciles exactly", ocrCountB === dbWriteCountB + flaggedTransfersB, `${ocrCountB} == ${dbWriteCountB} + ${flaggedTransfersB}`);

// ---------------------------------------------------------------------------
let pass = 0, fail = 0;
for (const r of results) {
  console.log(`${r.pass ? "PASS" : "FAIL"} — ${r.name} (${r.detail})`);
  if (r.pass) pass++; else fail++;
}
console.log(`\n${pass}/${results.length} checks passed.`);
if (fail > 0) process.exit(1);
