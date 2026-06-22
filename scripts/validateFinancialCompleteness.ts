// MyKerani — Financial Recovery Foundation Build Sprint V1: Financial Completeness Engine validation.
// Run via `npx tsx scripts/validateFinancialCompleteness.ts`.

import { computeFinancialCompleteness } from "../src/lib/financialCompletenessEngine";
import type { FinancialEvent, BankAccount, CashAccount } from "../src/types";

const results: { name: string; pass: boolean; detail: string }[] = [];
function check(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
}

const bankAccounts: BankAccount[] = [{ id: "b1", workspaceId: "ws-1", bankName: "Maybank", accountNumber: "123", accountName: "Biz", branchName: "KL", currentBalanceMyr: 1000 }];
const cashAccounts: CashAccount[] = [];

// 1. Fully complete dataset -> all metrics 100
const fullEvents: FinancialEvent[] = [
  { id: "e1", workspaceId: "ws-1", type: "INCOME", categoryName: "Sales Revenue", amountMyr: 100, partyName: "P1", date: "2026-06-01", referenceNumber: "R1", description: "d", isCompleted: true, bankAccountId: "b1" },
  { id: "e2", workspaceId: "ws-1", type: "EXPENSE", categoryName: "Utilities", amountMyr: 50, partyName: "P2", date: "2026-06-15", referenceNumber: "R2", description: "d", isCompleted: true, bankAccountId: "b1" },
];
const full = computeFinancialCompleteness({ financialEvents: fullEvents, bankAccounts, cashAccounts, evidenceCoverageRatio: 1 });
check(
  "Fully categorized + fully linked + single-month dataset with full evidence -> all sub-metrics 100",
  full.financialRecordsPct === 100 && full.evidenceCoveragePct === 100 && full.bankCoveragePct === 100 && full.historicalCoveragePct === 100 && full.overallCompletenessPct === 100,
  JSON.stringify(full)
);

// 2. Uncategorized + unlinked + no evidence -> low scores, no NaN
const poorEvents: FinancialEvent[] = [
  { id: "e3", workspaceId: "ws-1", type: "INCOME", categoryName: "Lain-lain", amountMyr: 100, partyName: "P3", date: "2026-06-01", referenceNumber: "R3", description: "d", isCompleted: true },
];
const poor = computeFinancialCompleteness({ financialEvents: poorEvents, bankAccounts: [], cashAccounts: [], evidenceCoverageRatio: 0 });
check(
  "Uncategorized + unlinked + no evidence dataset scores 0 on those metrics, no NaN",
  poor.financialRecordsPct === 0 && poor.evidenceCoveragePct === 0 && poor.bankCoveragePct === 0 && !Number.isNaN(poor.overallCompletenessPct),
  JSON.stringify(poor)
);

// 3. Empty dataset entirely -> 0 everywhere, no division-by-zero crash
const empty = computeFinancialCompleteness({ financialEvents: [], bankAccounts: [], cashAccounts: [], evidenceCoverageRatio: 1 });
check(
  "Empty financialEvents -> financialRecordsPct=0, historicalCoveragePct=0, no crash",
  empty.financialRecordsPct === 0 && empty.historicalCoveragePct === 0 && !Number.isNaN(empty.overallCompletenessPct),
  JSON.stringify(empty)
);

// 4. Historical coverage penalized when records cluster in only 1 of many expected months
const sparseEvents: FinancialEvent[] = [
  { id: "e4", workspaceId: "ws-1", type: "INCOME", categoryName: "Sales Revenue", amountMyr: 100, partyName: "P4", date: "2026-06-01", referenceNumber: "R4", description: "d", isCompleted: true },
];
const sparse = computeFinancialCompleteness({ financialEvents: sparseEvents, bankAccounts: [], cashAccounts: [], evidenceCoverageRatio: 1, expectedHistoryMonths: 12 });
check(
  "Single month of records against a 12-month expected history yields historicalCoveragePct ~8.3%, not 100%",
  Math.abs(sparse.historicalCoveragePct - (1 / 12) * 100) < 0.01,
  `historicalCoveragePct=${sparse.historicalCoveragePct}`
);

// 5. Overall completeness is the simple average of the 4 sub-metrics (auditable, no hidden weighting)
const mixed = computeFinancialCompleteness({ financialEvents: fullEvents, bankAccounts, cashAccounts, evidenceCoverageRatio: 0.5 });
const expectedAverage = (mixed.financialRecordsPct + mixed.evidenceCoveragePct + mixed.bankCoveragePct + mixed.historicalCoveragePct) / 4;
check("overallCompletenessPct equals the simple average of the 4 sub-metrics", Math.abs(mixed.overallCompletenessPct - expectedAverage) < 0.0001, `overall=${mixed.overallCompletenessPct}, expected=${expectedAverage}`);

let passCount = 0, failCount = 0;
for (const r of results) {
  console.log(`${r.pass ? "PASS" : "FAIL"} | ${r.name.padEnd(90)} | ${r.detail}`);
  if (r.pass) passCount++; else failCount++;
}
console.log(`\n${passCount} PASS / ${failCount} FAIL out of ${results.length} checks.`);
if (failCount > 0) process.exit(1);
