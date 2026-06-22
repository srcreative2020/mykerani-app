// MyKerani — Financial Recovery Foundation Build Sprint V1: Transaction Recovery Engine validation.
// Run via `npx tsx scripts/validateTransactionRecovery.ts`.

import { suggestCategoryForTransaction, suggestCategoriesForTransactions } from "../src/lib/transactionRecoveryEngine";
import type { ImportedBankTransaction } from "../src/lib/bankStatementImport";
import type { OcrLearnedPattern } from "../src/types";

const results: { name: string; pass: boolean; detail: string }[] = [];
function check(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
}

function txn(overrides: Partial<ImportedBankTransaction>): ImportedBankTransaction {
  return {
    date: "2026-06-01",
    description: "Generic Transaction",
    amountMyr: 100,
    direction: "DEBIT",
    referenceNumber: "",
    account: "ACC-A",
    sourceBank: "GENERIC",
    sourceRowIndex: 0,
    ...overrides,
  };
}

// 1. Learned vendor pattern takes priority over generic matching
const learned: OcrLearnedPattern[] = [
  { id: "p1", workspaceId: "ws-1", vendorName: "Pasar Borong Sayur", category: "Inventory / Stock", recordType: "EXPENSE", confidenceScore: 0.9, occurrenceCount: 5, lastUpdated: "2026-06-01" },
];
const s1 = suggestCategoryForTransaction(txn({ description: "Pasar Borong Sayur - Ayam & Sayur", direction: "DEBIT" }), learned);
check(
  "Learned vendor pattern is matched and used with its own category/confidence",
  s1.source === "LEARNED_VENDOR_PATTERN" && s1.suggestedCategoryName === "Inventory / Stock" && s1.suggestedRecordType === "EXPENSE" && s1.confidenceScore >= 0.8,
  JSON.stringify(s1)
);

// 2. No learned pattern, but description matches a Knowledge Base keyword
const s2 = suggestCategoryForTransaction(txn({ description: "TNB Bill Payment", direction: "DEBIT" }), []);
check(
  "No learned pattern -> falls through to Knowledge Base keyword match",
  s2.source === "KNOWLEDGE_BASE_MATCH" && s2.suggestedRecordType === "EXPENSE",
  JSON.stringify(s2)
);

// 3. Nothing matches at all -> deterministic direction fallback (always succeeds, never null/throws)
const s3 = suggestCategoryForTransaction(txn({ description: "Completely Unrecognizable XYZ123", direction: "CREDIT" }), []);
check(
  "Unmatched transaction falls back deterministically by direction, never crashes",
  s3.source === "DIRECTION_FALLBACK" && s3.suggestedRecordType === "INCOME" && s3.suggestedCategoryName === "Lain-lain",
  JSON.stringify(s3)
);

// 4. Every suggestion always has a confidenceScore between 0 and 1
const all = [s1, s2, s3];
check(
  "Every suggestion has confidenceScore strictly between 0 and 1",
  all.every((s) => s.confidenceScore > 0 && s.confidenceScore <= 1),
  JSON.stringify(all.map((s) => s.confidenceScore))
);

// 5. Batch helper produces one suggestion per input transaction, same order
const batchTxns = [txn({ description: "A" }), txn({ description: "B" }), txn({ description: "C" })];
const batch = suggestCategoriesForTransactions(batchTxns, []);
check(
  "suggestCategoriesForTransactions returns one suggestion per input, in order",
  batch.length === 3 && batch.every((s, i) => s.transaction.description === batchTxns[i].description),
  `count=${batch.length}`
);

let passCount = 0, failCount = 0;
for (const r of results) {
  console.log(`${r.pass ? "PASS" : "FAIL"} | ${r.name.padEnd(90)} | ${r.detail}`);
  if (r.pass) passCount++; else failCount++;
}
console.log(`\n${passCount} PASS / ${failCount} FAIL out of ${results.length} checks.`);
if (failCount > 0) process.exit(1);
