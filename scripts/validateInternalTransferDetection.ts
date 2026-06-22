// MyKerani — Financial Recovery Foundation Build Sprint V1: Internal Transfer Detection validation.
// Run via `npx tsx scripts/validateInternalTransferDetection.ts`.

import { detectInternalTransfers, getInternalTransferTransactionSet } from "../src/lib/internalTransferDetection";
import type { ImportedBankTransaction } from "../src/lib/bankStatementImport";

const results: { name: string; pass: boolean; detail: string }[] = [];
function check(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
}

function txn(overrides: Partial<ImportedBankTransaction>): ImportedBankTransaction {
  return {
    date: "2026-06-01",
    description: "Transfer",
    amountMyr: 100,
    direction: "DEBIT",
    referenceNumber: "",
    account: "ACC-A",
    sourceBank: "GENERIC",
    sourceRowIndex: 0,
    ...overrides,
  };
}

// 1. Clear same-day transfer pair across two different accounts is detected
const t1 = [
  txn({ account: "ACC-A", direction: "DEBIT", amountMyr: 500, date: "2026-06-01", description: "Transfer to savings" }),
  txn({ account: "ACC-B", direction: "CREDIT", amountMyr: 500, date: "2026-06-01", description: "Transfer from current" }),
];
const m1 = detectInternalTransfers(t1);
check("Same-day, same-amount, different-account pair is detected as internal transfer", m1.length === 1 && m1[0].amountMyr === 500, `matches=${JSON.stringify(m1)}`);

// 2. Same account on both sides must NOT be flagged (that's not a transfer, that's just two records on one account)
const t2 = [
  txn({ account: "ACC-A", direction: "DEBIT", amountMyr: 200, date: "2026-06-01" }),
  txn({ account: "ACC-A", direction: "CREDIT", amountMyr: 200, date: "2026-06-01" }),
];
check("Same-account debit/credit pair is NOT flagged as internal transfer", detectInternalTransfers(t2).length === 0, `matches=${JSON.stringify(detectInternalTransfers(t2))}`);

// 3. Amounts that differ are not matched
const t3 = [
  txn({ account: "ACC-A", direction: "DEBIT", amountMyr: 200, date: "2026-06-01" }),
  txn({ account: "ACC-B", direction: "CREDIT", amountMyr: 250, date: "2026-06-01" }),
];
check("Mismatched amounts are not flagged", detectInternalTransfers(t3).length === 0, `matches=${JSON.stringify(detectInternalTransfers(t3))}`);

// 4. Outside the time window is not matched
const t4 = [
  txn({ account: "ACC-A", direction: "DEBIT", amountMyr: 300, date: "2026-06-01" }),
  txn({ account: "ACC-B", direction: "CREDIT", amountMyr: 300, date: "2026-06-10" }),
];
check("Pair outside default 3-day window is not flagged", detectInternalTransfers(t4).length === 0, `matches=${JSON.stringify(detectInternalTransfers(t4))}`);

// 5. Within window (1 day apart) is matched with slightly lower confidence than same-day
const t5 = [
  txn({ account: "ACC-A", direction: "DEBIT", amountMyr: 400, date: "2026-06-01" }),
  txn({ account: "ACC-B", direction: "CREDIT", amountMyr: 400, date: "2026-06-02" }),
];
const m5 = detectInternalTransfers(t5);
check("1-day-apart pair within window is matched with confidence < same-day confidence", m5.length === 1 && m5[0].confidenceScore < 0.95, `matches=${JSON.stringify(m5)}`);

// 6. Each transaction is consumed by at most one match (no double-counting when 3 candidates share an amount)
const t6 = [
  txn({ account: "ACC-A", direction: "DEBIT", amountMyr: 100, date: "2026-06-01" }),
  txn({ account: "ACC-B", direction: "CREDIT", amountMyr: 100, date: "2026-06-01" }),
  txn({ account: "ACC-C", direction: "CREDIT", amountMyr: 100, date: "2026-06-01" }),
];
const m6 = detectInternalTransfers(t6);
check("A single debit is matched to exactly one credit, not both candidates", m6.length === 1, `matches=${m6.length}`);

// 7. getInternalTransferTransactionSet contains exactly the matched transactions
const set6 = getInternalTransferTransactionSet(m6);
check("getInternalTransferTransactionSet contains exactly the 2 matched transactions", set6.size === 2, `setSize=${set6.size}`);

// 8. No transactions at all -> empty result, no crash
check("Empty transaction list returns zero matches without error", detectInternalTransfers([]).length === 0, "ok");

let passCount = 0, failCount = 0;
for (const r of results) {
  console.log(`${r.pass ? "PASS" : "FAIL"} | ${r.name.padEnd(90)} | ${r.detail}`);
  if (r.pass) passCount++; else failCount++;
}
console.log(`\n${passCount} PASS / ${failCount} FAIL out of ${results.length} checks.`);
if (failCount > 0) process.exit(1);
