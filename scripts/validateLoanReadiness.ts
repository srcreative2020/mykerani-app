// MyKerani — Loan/Financing Readiness V1 UAT Validation
//
// Standalone script (run via `npx tsx scripts/validateLoanReadiness.ts`).
// Computes computeFinancialHealthScoring then computeLoanReadiness for 7
// scenarios and validates the 6-check structure, scorePct formula, the
// EMPTY_BUSINESS_PROFILE registration-fail case, and empty-data robustness.
// No UI, no mocking — calls the real modules only.

import { computeFinancialHealthScoring } from "../src/lib/financialHealth";
import { computeLoanReadiness } from "../src/lib/loanReadiness";
import { EMPTY_BUSINESS_PROFILE, type BusinessProfile } from "../src/lib/profileData";
import type { CashAccount, BankAccount, FinancialEvent, DebtRecord, FinancialCommitment } from "../src/types";

interface Scenario {
  name: string;
  cashAccounts: CashAccount[];
  bankAccounts: BankAccount[];
  financialEvents: FinancialEvent[];
  debtRecords: DebtRecord[];
  financialCommitments: FinancialCommitment[];
  businessProfile: BusinessProfile;
  receivablesOver60DaysMyr: number;
  baseDate: Date;
}

type Status = "PASS" | "WARNING" | "FAIL";
const results: { scenario: string; check: string; status: Status; detail: string }[] = [];
function record(scenario: string, check: string, status: Status, detail: string) {
  results.push({ scenario, check, status, detail });
}

const baseDate = new Date("2026-06-22");

// 6 months of income, every month, for a clean "income consistency" pass.
function monthlyIncomeEvents(prefix: string, workspaceId: string, monthlyAmount: number): FinancialEvent[] {
  const events: FinancialEvent[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 10);
    events.push({
      id: `${prefix}-inc-${i}`,
      workspaceId,
      type: "INCOME",
      categoryName: "Sales Revenue",
      amountMyr: monthlyAmount,
      partyName: "Pelanggan Tetap",
      date: d.toISOString().slice(0, 10),
      referenceNumber: `INC-${prefix}-${i}`,
      description: "Pendapatan bulanan",
      isCompleted: true,
    });
  }
  return events;
}

const printingProfile: BusinessProfile = { industry: "Percetakan", branchName: "Cawangan Utama", businessType: "Sole Proprietor", registrationNo: "SSM-PR-001234", notes: "" };
const printing: Scenario = {
  name: "1. Printing Business",
  cashAccounts: [{ id: "ca-pr-1", workspaceId: "ws-print", name: "Tunai Kedai", responsiblePerson: "Pak Mat", currentBalanceMyr: 12000 }],
  bankAccounts: [{ id: "ba-pr-1", workspaceId: "ws-print", bankName: "Maybank", accountNumber: "1234", accountName: "Print Sdn Bhd", branchName: "Cawangan KL", currentBalanceMyr: 18000 }],
  financialEvents: monthlyIncomeEvents("pr", "ws-print", 8500),
  debtRecords: [
    { id: "debt-pr-1", workspaceId: "ws-print", creditorName: "Bank Rakyat", borrowedDate: "2026-01-01", repaymentDueDate: "2026-12-01", totalAmountMyr: 15000, repaidAmountMyr: 5000, status: "ACTIVE", description: "Pinjaman beli mesin cetak" },
  ],
  financialCommitments: [
    { id: "commit-pr-1", workspaceId: "ws-print", description: "Sewa kedai bulanan", obligeeName: "Landlord Wisma ABC", amountPerIntervalMyr: 1200, recurrence: "MONTHLY", startDate: "2026-01-01", isActive: true, status: "ACTIVE" },
  ],
  businessProfile: printingProfile,
  receivablesOver60DaysMyr: 0,
  baseDate,
};

const restaurantProfile: BusinessProfile = { industry: "F&B", branchName: "Plaza Makan", businessType: "Sdn Bhd", registrationNo: "SSM-RB-005678", notes: "" };
const restaurant: Scenario = {
  name: "2. Restaurant / F&B",
  cashAccounts: [{ id: "ca-rb-1", workspaceId: "ws-resto", name: "Tunai Kaunter", responsiblePerson: "Kak Yati", currentBalanceMyr: 22000 }],
  bankAccounts: [{ id: "ba-rb-1", workspaceId: "ws-resto", bankName: "CIMB", accountNumber: "5678", accountName: "Resto Sdn Bhd", branchName: "Cawangan PJ", currentBalanceMyr: 25000 }],
  financialEvents: monthlyIncomeEvents("rb", "ws-resto", 18500),
  debtRecords: [],
  financialCommitments: [
    { id: "commit-rb-1", workspaceId: "ws-resto", description: "Sewa restoran bulanan", obligeeName: "Landlord Plaza Makan", amountPerIntervalMyr: 4000, recurrence: "MONTHLY", startDate: "2026-01-01", isActive: true, status: "ACTIVE" },
  ],
  businessProfile: restaurantProfile,
  receivablesOver60DaysMyr: 0,
  baseDate,
};

const serviceProfile: BusinessProfile = { industry: "Perkhidmatan IT", branchName: "Pejabat Subang", businessType: "Sole Proprietor", registrationNo: "SSM-SV-009876", notes: "" };
const service: Scenario = {
  name: "3. Service Business",
  cashAccounts: [],
  bankAccounts: [{ id: "ba-sv-1", workspaceId: "ws-service", bankName: "Public Bank", accountNumber: "9999", accountName: "Service Sdn Bhd", branchName: "Cawangan Subang", currentBalanceMyr: 30000 }],
  // Only 4/6 months have income — should fail income_consistency (<80%).
  financialEvents: monthlyIncomeEvents("sv", "ws-service", 12000).slice(0, 4),
  debtRecords: [],
  financialCommitments: [],
  businessProfile: serviceProfile,
  receivablesOver60DaysMyr: 4500,
  baseDate,
};

const retailProfile: BusinessProfile = { industry: "Retail Pakaian", branchName: "Mall ABC", businessType: "Sdn Bhd", registrationNo: "SSM-RT-001122", notes: "" };
const retail: Scenario = {
  name: "4. Retail Business",
  cashAccounts: [{ id: "ca-rt-1", workspaceId: "ws-retail", name: "Tunai Kedai", responsiblePerson: "Cik Liyana", currentBalanceMyr: 3000 }],
  bankAccounts: [{ id: "ba-rt-1", workspaceId: "ws-retail", bankName: "RHB", accountNumber: "4321", accountName: "Retail Sdn Bhd", branchName: "Cawangan Klang", currentBalanceMyr: 5000 }],
  financialEvents: monthlyIncomeEvents("rt", "ws-retail", 9800),
  // Overdue debt — repaymentDueDate in the past, not fully repaid.
  debtRecords: [
    { id: "debt-rt-1", workspaceId: "ws-retail", creditorName: "Maybank", borrowedDate: "2026-01-01", repaymentDueDate: "2026-05-01", totalAmountMyr: 8000, repaidAmountMyr: 3000, status: "ACTIVE", description: "Pinjaman stok awal — tertunggak" },
  ],
  financialCommitments: [
    { id: "commit-rt-1", workspaceId: "ws-retail", description: "Sewa lot kedai", obligeeName: "Landlord Mall ABC", amountPerIntervalMyr: 2200, recurrence: "MONTHLY", startDate: "2026-01-01", isActive: true, status: "ACTIVE" },
  ],
  businessProfile: retailProfile,
  receivablesOver60DaysMyr: 2000,
  baseDate,
};

// Personal Finance — deliberately uses EMPTY_BUSINESS_PROFILE to validate the registration-fail check.
const personal: Scenario = {
  name: "5. Personal Finance",
  cashAccounts: [{ id: "ca-pf-1", workspaceId: "ws-personal", name: "Dompet", responsiblePerson: "Diri Sendiri", currentBalanceMyr: 800 }],
  bankAccounts: [{ id: "ba-pf-1", workspaceId: "ws-personal", bankName: "Bank Islam", accountNumber: "1111", accountName: "Akaun Peribadi", branchName: "Cawangan Ampang", currentBalanceMyr: 2500 }],
  financialEvents: monthlyIncomeEvents("pf", "ws-personal", 5500),
  debtRecords: [],
  financialCommitments: [],
  businessProfile: EMPTY_BUSINESS_PROFILE,
  receivablesOver60DaysMyr: 0,
  baseDate,
};

const negativeProfile: BusinessProfile = { industry: "Kedai Runcit", branchName: "Bangi", businessType: "Sole Proprietor", registrationNo: "SSM-NP-003344", notes: "" };
const negativeProfit: Scenario = {
  name: "6. Negative Profit (struggling small business)",
  cashAccounts: [{ id: "ca-np-1", workspaceId: "ws-negative", name: "Tunai Kedai", responsiblePerson: "Pemilik", currentBalanceMyr: 200 }],
  bankAccounts: [{ id: "ba-np-1", workspaceId: "ws-negative", bankName: "Bank Simpanan Nasional", accountNumber: "2222", accountName: "Kedai Kecil", branchName: "Cawangan Bangi", currentBalanceMyr: 300 }],
  // Only 1/6 months has income — fails income_consistency badly.
  financialEvents: monthlyIncomeEvents("np", "ws-negative", 2000).slice(0, 1),
  debtRecords: [
    { id: "debt-np-1", workspaceId: "ws-negative", creditorName: "Along (Pemberi Pinjam)", borrowedDate: "2026-03-01", repaymentDueDate: "2026-05-01", totalAmountMyr: 5000, repaidAmountMyr: 500, status: "ACTIVE", description: "Pinjaman kecemasan tunai — tertunggak" },
  ],
  financialCommitments: [
    { id: "commit-np-1", workspaceId: "ws-negative", description: "Sewa kedai", obligeeName: "Landlord", amountPerIntervalMyr: 1500, recurrence: "MONTHLY", startDate: "2026-01-01", isActive: true, status: "ACTIVE" },
  ],
  businessProfile: negativeProfile,
  receivablesOver60DaysMyr: 3000,
  baseDate,
};

const empty: Scenario = {
  name: "7. Empty Data (new workspace, zero transactions)",
  cashAccounts: [],
  bankAccounts: [],
  financialEvents: [],
  debtRecords: [],
  financialCommitments: [],
  businessProfile: EMPTY_BUSINESS_PROFILE,
  receivablesOver60DaysMyr: 0,
  baseDate,
};

const scenarios: Scenario[] = [printing, restaurant, service, retail, personal, negativeProfit, empty];
const expectedCheckIds = ["registration", "solvency", "runway", "debt_repayment", "receivables_quality", "income_consistency"];

for (const s of scenarios) {
  const healthScoring = computeFinancialHealthScoring(s.cashAccounts, s.bankAccounts, s.financialEvents, s.debtRecords, s.financialCommitments, s.baseDate);
  const loanReadiness = computeLoanReadiness(s.financialEvents, s.debtRecords, s.businessProfile, healthScoring, s.receivablesOver60DaysMyr, s.baseDate);

  // CHECK 1 — All 6 checks present, each with boolean pass + non-empty detail string.
  const ids = loanReadiness.checks.map((c) => c.id);
  const allIdsPresent = expectedCheckIds.every((id) => ids.includes(id)) && ids.length === expectedCheckIds.length;
  const allHaveValidShape = loanReadiness.checks.every((c) => typeof c.pass === "boolean" && typeof c.detail === "string" && c.detail.trim().length > 0);
  record(
    s.name,
    "1. All 6 Checks Present & Valid Shape",
    allIdsPresent && allHaveValidShape ? "PASS" : "FAIL",
    `Checks: [${ids.join(", ")}] (expected [${expectedCheckIds.join(", ")}]), all have boolean pass + non-empty detail: ${allHaveValidShape}.`
  );

  // CHECK 2 — scorePct = passedCount/totalChecks*100 exactly.
  const expectedScorePct = (loanReadiness.passedCount / loanReadiness.totalChecks) * 100;
  const scorePctOk = loanReadiness.scorePct === expectedScorePct;
  record(
    s.name,
    "2. scorePct Formula Exact",
    scorePctOk ? "PASS" : "FAIL",
    `passedCount=${loanReadiness.passedCount}/${loanReadiness.totalChecks}, scorePct=${loanReadiness.scorePct} (expected ${expectedScorePct}).`
  );

  // CHECK 3 — EMPTY_BUSINESS_PROFILE fails the registration check.
  if (s.businessProfile === EMPTY_BUSINESS_PROFILE) {
    const registrationCheck = loanReadiness.checks.find((c) => c.id === "registration");
    const registrationFails = registrationCheck !== undefined && registrationCheck.pass === false;
    record(
      s.name,
      "3. EMPTY_BUSINESS_PROFILE Fails Registration",
      registrationFails ? "PASS" : "FAIL",
      `registration check pass=${registrationCheck?.pass} (expected false for empty profile). detail: "${registrationCheck?.detail}"`
    );
  } else {
    record(s.name, "3. EMPTY_BUSINESS_PROFILE Fails Registration", "PASS", "N/A for this scenario (has a registrationNo) — see Scenario 5/7 for the dedicated empty-profile test.");
  }

  // CHECK 4 — Empty data doesn't crash and produces a defined scoreGrade.
  if (s.name.startsWith("7.")) {
    const gradeOk = typeof loanReadiness.scoreGrade === "string" && loanReadiness.scoreGrade.trim().length > 0;
    const noNaN = !Number.isNaN(loanReadiness.scorePct);
    record(
      s.name,
      "4. Empty Data Handling",
      gradeOk && noNaN ? "PASS" : "FAIL",
      `scoreGrade="${loanReadiness.scoreGrade}" (defined: ${gradeOk}), scorePct=${loanReadiness.scorePct} (no NaN: ${noNaN}).`
    );
  } else {
    record(s.name, "4. Empty Data Handling", "PASS", "N/A for this scenario (non-empty dataset) — see Scenario 7 for the dedicated empty-data test.");
  }

  console.log(`\n=== ${s.name} ===`);
  console.log(`ScorePct=${loanReadiness.scorePct.toFixed(1)}% (${loanReadiness.passedCount}/${loanReadiness.totalChecks}) | Grade=${loanReadiness.scoreGrade}`);
  for (const c of loanReadiness.checks) {
    console.log(`  [${c.pass ? "PASS" : "FAIL"}] ${c.id}: ${c.detail}`);
  }
}

console.log("\n\n=== Full Check Matrix ===\n");
for (const r of results) {
  console.log(`${r.status.padEnd(8)} | ${r.scenario.padEnd(45)} | ${r.check.padEnd(45)} | ${r.detail}`);
}

const passCount = results.filter((r) => r.status === "PASS").length;
const warnCount = results.filter((r) => r.status === "WARNING").length;
const failCount = results.filter((r) => r.status === "FAIL").length;
console.log(`\n${passCount} PASS / ${warnCount} WARNING / ${failCount} FAIL out of ${results.length} checks.`);

if (failCount > 0) {
  process.exitCode = 1;
}
