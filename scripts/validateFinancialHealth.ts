// MyKerani — Financial Health V1 UAT Validation
//
// Standalone script (run via `npx tsx scripts/validateFinancialHealth.ts`).
// Computes both computeFinancialHealthScoring and computeFinancialHealthV1
// for 7 scenarios and validates that the V1 wrapper exactly reflects the
// base scoring (no behavior drift) plus correctly derives the two new
// sub-metrics (evidenceCoveragePct, dataCompletenessPct). No UI, no mocking.

import { computeFinancialHealthScoring, computeFinancialHealthV1 } from "../src/lib/financialHealth";
import type { CashAccount, BankAccount, FinancialEvent, DebtRecord, FinancialCommitment } from "../src/types";

interface Scenario {
  name: string;
  cashAccounts: CashAccount[];
  bankAccounts: BankAccount[];
  financialEvents: FinancialEvent[];
  debtRecords: DebtRecord[];
  financialCommitments: FinancialCommitment[];
  evidenceCoverageRatio: number;
  baseDate: Date;
}

type Status = "PASS" | "WARNING" | "FAIL";
const results: { scenario: string; check: string; status: Status; detail: string }[] = [];
function record(scenario: string, check: string, status: Status, detail: string) {
  results.push({ scenario, check, status, detail });
}

const baseDate = new Date("2026-06-22");

const printing: Scenario = {
  name: "1. Printing Business",
  cashAccounts: [{ id: "ca-pr-1", workspaceId: "ws-print", name: "Tunai Kedai", responsiblePerson: "Pak Mat", currentBalanceMyr: 3500 }],
  bankAccounts: [{ id: "ba-pr-1", workspaceId: "ws-print", bankName: "Maybank", accountNumber: "1234", accountName: "Print Sdn Bhd", branchName: "Cawangan KL", currentBalanceMyr: 12000 }],
  financialEvents: [
    { id: "pr-1", workspaceId: "ws-print", type: "INCOME", categoryName: "Sales Revenue", amountMyr: 8500, partyName: "Kedai Runcit Aminah", date: "2026-06-03", referenceNumber: "INV-PR-1", description: "Cetak risalah promosi", isCompleted: true },
    { id: "pr-rec", workspaceId: "ws-print", type: "RECEIVABLE", categoryName: "Receivables", amountMyr: 1000, partyName: "Pelanggan B", date: "2026-06-10", referenceNumber: "REC-PR-1", description: "Invois belum bayar", isCompleted: false },
    { id: "pr-pay", workspaceId: "ws-print", type: "PAYABLE", categoryName: "Payables", amountMyr: 600, partyName: "Pembekal", date: "2026-06-08", referenceNumber: "PAY-PR-1", description: "Invois belum bayar pembekal", isCompleted: false },
    { id: "pr-lain", workspaceId: "ws-print", type: "EXPENSE", categoryName: "Lain-lain", amountMyr: 100, partyName: "Tidak Pasti", date: "2026-06-09", referenceNumber: "EXP-PR-LL", description: "Perbelanjaan tidak dikategorikan", isCompleted: true },
  ],
  debtRecords: [
    { id: "debt-pr-1", workspaceId: "ws-print", creditorName: "Bank Rakyat", borrowedDate: "2026-01-01", totalAmountMyr: 15000, repaidAmountMyr: 5000, status: "ACTIVE", description: "Pinjaman beli mesin cetak" },
  ],
  financialCommitments: [
    { id: "commit-pr-1", workspaceId: "ws-print", description: "Sewa kedai bulanan", obligeeName: "Landlord Wisma ABC", amountPerIntervalMyr: 1200, recurrence: "MONTHLY", startDate: "2026-01-01", isActive: true, status: "ACTIVE" },
  ],
  evidenceCoverageRatio: 0.6,
  baseDate,
};

const restaurant: Scenario = {
  name: "2. Restaurant / F&B",
  cashAccounts: [{ id: "ca-rb-1", workspaceId: "ws-resto", name: "Tunai Kaunter", responsiblePerson: "Kak Yati", currentBalanceMyr: 7200 }],
  bankAccounts: [{ id: "ba-rb-1", workspaceId: "ws-resto", bankName: "CIMB", accountNumber: "5678", accountName: "Resto Sdn Bhd", branchName: "Cawangan PJ", currentBalanceMyr: 9800 }],
  financialEvents: [
    { id: "rb-1", workspaceId: "ws-resto", type: "INCOME", categoryName: "Sales Revenue", amountMyr: 18500, partyName: "Jualan Harian Kaunter", date: "2026-06-15", referenceNumber: "POS-RB-1", description: "Jualan makanan & minuman harian", isCompleted: true },
    { id: "rb-pay", workspaceId: "ws-resto", type: "PAYABLE", categoryName: "Payables", amountMyr: 2000, partyName: "Pasar Borong", date: "2026-06-14", referenceNumber: "PAY-RB-1", description: "Invois belum bayar pembekal sayur", isCompleted: false },
  ],
  debtRecords: [],
  financialCommitments: [
    { id: "commit-rb-1", workspaceId: "ws-resto", description: "Sewa restoran bulanan", obligeeName: "Landlord Plaza Makan", amountPerIntervalMyr: 4000, recurrence: "MONTHLY", startDate: "2026-01-01", isActive: true, status: "ACTIVE" },
  ],
  evidenceCoverageRatio: 0.85,
  baseDate,
};

const service: Scenario = {
  name: "3. Service Business",
  cashAccounts: [],
  bankAccounts: [{ id: "ba-sv-1", workspaceId: "ws-service", bankName: "Public Bank", accountNumber: "9999", accountName: "Service Sdn Bhd", branchName: "Cawangan Subang", currentBalanceMyr: 22000 }],
  financialEvents: [
    { id: "sv-1", workspaceId: "ws-service", type: "INCOME", categoryName: "Service Revenue", amountMyr: 12000, partyName: "Syarikat Pembinaan Maju", date: "2026-06-10", referenceNumber: "INV-SV-1", description: "Yuran perkhidmatan konsultansi IT bulanan", isCompleted: true },
    { id: "sv-2", workspaceId: "ws-service", type: "RECEIVABLE", categoryName: "Receivables", amountMyr: 4500, partyName: "Klinik Sejahtera", date: "2026-06-20", referenceNumber: "INV-SV-2", description: "Invois belum bayar untuk servis Jun", isCompleted: false },
  ],
  debtRecords: [],
  financialCommitments: [],
  evidenceCoverageRatio: 1,
  baseDate,
};

const retail: Scenario = {
  name: "4. Retail Business",
  cashAccounts: [{ id: "ca-rt-1", workspaceId: "ws-retail", name: "Tunai Kedai", responsiblePerson: "Cik Liyana", currentBalanceMyr: 1500 }],
  bankAccounts: [{ id: "ba-rt-1", workspaceId: "ws-retail", bankName: "RHB", accountNumber: "4321", accountName: "Retail Sdn Bhd", branchName: "Cawangan Klang", currentBalanceMyr: 4000 }],
  financialEvents: [
    { id: "rt-1", workspaceId: "ws-retail", type: "INCOME", categoryName: "Sales Revenue", amountMyr: 9800, partyName: "Jualan Kaunter Kedai", date: "2026-06-11", referenceNumber: "POS-RT-1", description: "Jualan pakaian dan aksesori", isCompleted: true },
    { id: "rt-7", workspaceId: "ws-retail", type: "PAYABLE", categoryName: "Payables", amountMyr: 1500, partyName: "Pembekal Pakaian Borong", date: "2026-06-09", referenceNumber: "PUR-RT-1B", description: "Baki invois belum bayar kepada pembekal", isCompleted: false },
  ],
  debtRecords: [
    { id: "debt-rt-1", workspaceId: "ws-retail", creditorName: "Maybank", borrowedDate: "2026-02-01", totalAmountMyr: 8000, repaidAmountMyr: 3000, status: "ACTIVE", description: "Pinjaman stok awal" },
  ],
  financialCommitments: [
    { id: "commit-rt-1", workspaceId: "ws-retail", description: "Sewa lot kedai", obligeeName: "Landlord Mall ABC", amountPerIntervalMyr: 2200, recurrence: "MONTHLY", startDate: "2026-01-01", isActive: true, status: "ACTIVE" },
  ],
  evidenceCoverageRatio: 0.3,
  baseDate,
};

const personal: Scenario = {
  name: "5. Personal Finance",
  cashAccounts: [{ id: "ca-pf-1", workspaceId: "ws-personal", name: "Dompet", responsiblePerson: "Diri Sendiri", currentBalanceMyr: 800 }],
  bankAccounts: [{ id: "ba-pf-1", workspaceId: "ws-personal", bankName: "Bank Islam", accountNumber: "1111", accountName: "Akaun Peribadi", branchName: "Cawangan Ampang", currentBalanceMyr: 2500 }],
  financialEvents: [
    { id: "pf-1", workspaceId: "ws-personal", type: "INCOME", categoryName: "Other Income", amountMyr: 5500, partyName: "Majikan", date: "2026-06-01", referenceNumber: "SAL-PF-1", description: "Gaji bulanan", isCompleted: true },
    { id: "pf-3", workspaceId: "ws-personal", type: "EXPENSE", categoryName: "Fuel & Transport", amountMyr: 350, partyName: "Petronas", date: "2026-06-05", referenceNumber: "EXP-PF-1", description: "Minyak kereta peribadi", isCompleted: true },
  ],
  debtRecords: [],
  financialCommitments: [],
  evidenceCoverageRatio: 0,
  baseDate,
};

const negativeProfit: Scenario = {
  name: "6. Negative Profit (struggling small business)",
  cashAccounts: [{ id: "ca-np-1", workspaceId: "ws-negative", name: "Tunai Kedai", responsiblePerson: "Pemilik", currentBalanceMyr: 200 }],
  bankAccounts: [{ id: "ba-np-1", workspaceId: "ws-negative", bankName: "Bank Simpanan Nasional", accountNumber: "2222", accountName: "Kedai Kecil", branchName: "Cawangan Bangi", currentBalanceMyr: 300 }],
  financialEvents: [
    { id: "np-1", workspaceId: "ws-negative", type: "INCOME", categoryName: "Sales Revenue", amountMyr: 2000, partyName: "Pelanggan", date: "2026-06-05", referenceNumber: "INV-NP-1", description: "Jualan bulan ini sangat perlahan", isCompleted: true },
    { id: "np-pay", workspaceId: "ws-negative", type: "PAYABLE", categoryName: "Payables", amountMyr: 1200, partyName: "Pembekal", date: "2026-06-04", referenceNumber: "PAY-NP-1", description: "Invois belum bayar", isCompleted: false },
  ],
  debtRecords: [
    { id: "debt-np-1", workspaceId: "ws-negative", creditorName: "Along (Pemberi Pinjam)", borrowedDate: "2026-03-01", totalAmountMyr: 5000, repaidAmountMyr: 500, status: "ACTIVE", description: "Pinjaman kecemasan tunai" },
  ],
  financialCommitments: [
    { id: "commit-np-1", workspaceId: "ws-negative", description: "Sewa kedai", obligeeName: "Landlord", amountPerIntervalMyr: 1500, recurrence: "MONTHLY", startDate: "2026-01-01", isActive: true, status: "ACTIVE" },
  ],
  evidenceCoverageRatio: 0.1,
  baseDate,
};

const empty: Scenario = {
  name: "7. Empty Data (new workspace, zero transactions)",
  cashAccounts: [],
  bankAccounts: [],
  financialEvents: [],
  debtRecords: [],
  financialCommitments: [],
  evidenceCoverageRatio: 1, // matches getEvidenceCoverageRatio's documented behavior: empty record list -> 1
  baseDate,
};

const scenarios: Scenario[] = [printing, restaurant, service, retail, personal, negativeProfit, empty];

for (const s of scenarios) {
  const base = computeFinancialHealthScoring(s.cashAccounts, s.bankAccounts, s.financialEvents, s.debtRecords, s.financialCommitments, s.baseDate);
  const v1 = computeFinancialHealthV1(s.cashAccounts, s.bankAccounts, s.financialEvents, s.debtRecords, s.financialCommitments, s.evidenceCoverageRatio, s.baseDate);

  // CHECK 1 — V1's nested cashHealth/debtHealth/commitmentHealth fields exactly
  // match the base scoring's quickRatio/quickGrade/solvencyRatio/solvencyGrade/
  // runwayMonths/runwayGrade (proving the wrapper didn't change existing behavior).
  const cashMatches = v1.cashHealth.quickRatio === base.quickRatio && v1.cashHealth.quickGrade === base.quickGrade;
  const debtMatches = v1.debtHealth.solvencyRatio === base.solvencyRatio && v1.debtHealth.solvencyGrade === base.solvencyGrade;
  const commitmentMatches = v1.commitmentHealth.runwayMonths === base.runwayMonths && v1.commitmentHealth.runwayGrade === base.runwayGrade;
  record(
    s.name,
    "1. V1 Wrapper Matches Base Scoring",
    cashMatches && debtMatches && commitmentMatches ? "PASS" : "FAIL",
    `cashHealth(quickRatio/quickGrade) match=${cashMatches}, debtHealth(solvencyRatio/solvencyGrade) match=${debtMatches}, commitmentHealth(runwayMonths/runwayGrade) match=${commitmentMatches}.`
  );

  // CHECK 2 — evidenceCoveragePct correctly equals evidenceCoverageRatio*100 for a known input ratio.
  const expectedEvidencePct = s.evidenceCoverageRatio * 100;
  const evidencePctOk = v1.evidenceCoveragePct === expectedEvidencePct;
  record(
    s.name,
    "2. evidenceCoveragePct = ratio*100",
    evidencePctOk ? "PASS" : "FAIL",
    `Input ratio=${s.evidenceCoverageRatio}, evidenceCoveragePct=${v1.evidenceCoveragePct} (expected ${expectedEvidencePct}).`
  );

  // CHECK 3 — dataCompletenessPct correctly excludes empty/"Lain-lain" categoryName records.
  const uncategorized = s.financialEvents.filter((e) => !e.categoryName || e.categoryName.trim() === "" || e.categoryName === "Lain-lain").length;
  const expectedCompletenessPct = s.financialEvents.length === 0 ? 0 : ((s.financialEvents.length - uncategorized) / s.financialEvents.length) * 100;
  const completenessOk = v1.dataCompletenessPct === expectedCompletenessPct;
  record(
    s.name,
    "3. dataCompletenessPct Excludes Lain-lain/Empty",
    completenessOk ? "PASS" : "FAIL",
    `${s.financialEvents.length - uncategorized}/${s.financialEvents.length} records categorized (excluding ${uncategorized} Lain-lain/empty), dataCompletenessPct=${v1.dataCompletenessPct.toFixed(2)} (expected ${expectedCompletenessPct.toFixed(2)}).`
  );

  // CHECK 4 — Empty data produces 0% dataCompletenessPct with no NaN/crash.
  if (s.name.startsWith("7.")) {
    const zeroCompleteness = v1.dataCompletenessPct === 0;
    const noNaN = !Number.isNaN(v1.dataCompletenessPct) && !Number.isNaN(v1.evidenceCoveragePct) && !Number.isNaN(base.solvencyRatio) && !Number.isNaN(base.quickRatio);
    record(
      s.name,
      "4. Empty Data Handling",
      zeroCompleteness && noNaN ? "PASS" : "FAIL",
      `dataCompletenessPct=${v1.dataCompletenessPct} (expected 0), no NaN=${noNaN}, runwayMonths=${base.runwayMonths} (999 sentinel expected for zero commitments).`
    );
  } else {
    record(s.name, "4. Empty Data Handling", "PASS", "N/A for this scenario (non-empty dataset) — see Scenario 7 for the dedicated empty-data test.");
  }

  console.log(`\n=== ${s.name} ===`);
  console.log(`SolvencyRatio=${base.solvencyRatio.toFixed(2)} (${base.solvencyGrade}) | QuickRatio=${base.quickRatio.toFixed(2)} (${base.quickGrade}) | RunwayMonths=${base.runwayMonths.toFixed(1)} (${base.runwayGrade})`);
  console.log(`EvidenceCoveragePct=${v1.evidenceCoveragePct.toFixed(1)}% | DataCompletenessPct=${v1.dataCompletenessPct.toFixed(1)}%`);
}

console.log("\n\n=== Full Check Matrix ===\n");
for (const r of results) {
  console.log(`${r.status.padEnd(8)} | ${r.scenario.padEnd(45)} | ${r.check.padEnd(40)} | ${r.detail}`);
}

const passCount = results.filter((r) => r.status === "PASS").length;
const warnCount = results.filter((r) => r.status === "WARNING").length;
const failCount = results.filter((r) => r.status === "FAIL").length;
console.log(`\n${passCount} PASS / ${warnCount} WARNING / ${failCount} FAIL out of ${results.length} checks.`);

if (failCount > 0) {
  process.exitCode = 1;
}
