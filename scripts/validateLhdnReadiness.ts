// MyKerani — LHDN Tax Readiness V1 UAT Validation
//
// Standalone script (run via `npx tsx scripts/validateLhdnReadiness.ts`).
// Computes computeLhdnReadiness for 7 scenarios and validates the 6-check
// structure, scorePct formula, evidence percentage hand-computation for a
// known-linkage scenario, and empty-data robustness. No UI, no mocking.
//
// Explicitly recorded as a WARNING (not a FAIL), per the sprint instruction:
// "TIN Status check is not implemented — BusinessProfile has no dedicated
// TIN field, registrationNo (SSM proxy) is reused instead. Known gap, not
// a defect." This matches the honest gap already documented in the header
// comment of src/lib/lhdnReadiness.ts itself.

import { computeLhdnReadiness } from "../src/lib/lhdnReadiness";
import { EMPTY_BUSINESS_PROFILE, type BusinessProfile } from "../src/lib/profileData";
import type { FinancialEvent, FinancialEvidencePackage } from "../src/types";

interface Scenario {
  name: string;
  financialEvents: FinancialEvent[];
  financialEvidencePackages: FinancialEvidencePackage[];
  businessProfile: BusinessProfile;
  baseDate: Date;
}

type Status = "PASS" | "WARNING" | "FAIL";
const results: { scenario: string; check: string; status: Status; detail: string }[] = [];
function record(scenario: string, check: string, status: Status, detail: string) {
  results.push({ scenario, check, status, detail });
}

const baseDate = new Date("2026-06-22");

// 12 months of income+expense records, every month, for a clean "coverage" pass.
function monthlyRecords(prefix: string, workspaceId: string, incomeAmount: number, expenseAmount: number): FinancialEvent[] {
  const events: FinancialEvent[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 10);
    const dateStr = d.toISOString().slice(0, 10);
    events.push({
      id: `${prefix}-inc-${i}`,
      workspaceId,
      type: "INCOME",
      categoryName: "Sales Revenue",
      amountMyr: incomeAmount,
      partyName: "Pelanggan Tetap",
      date: dateStr,
      referenceNumber: `INC-${prefix}-${i}`,
      description: "Pendapatan bulanan",
      isCompleted: true,
    });
    events.push({
      id: `${prefix}-exp-${i}`,
      workspaceId,
      type: "EXPENSE",
      categoryName: "Rental",
      amountMyr: expenseAmount,
      partyName: "Landlord",
      date: dateStr,
      referenceNumber: `EXP-${prefix}-${i}`,
      description: "Sewa bulanan",
      isCompleted: true,
    });
  }
  return events;
}

const printingProfile: BusinessProfile = { industry: "Percetakan", branchName: "Cawangan Utama", businessType: "Sole Proprietor", registrationNo: "SSM-PR-001234", notes: "" };
const printingEvents = monthlyRecords("pr", "ws-print", 8500, 1200);
const printing: Scenario = {
  name: "1. Printing Business",
  financialEvents: printingEvents,
  // Every income record gets evidence; only half of expenses do.
  financialEvidencePackages: [
    ...printingEvents.filter((e) => e.type === "INCOME").map((e) => ({
      id: `ev-${e.id}`, workspaceId: "ws-print", documentType: "INVOICE" as const, uploadDate: e.date, fileName: `${e.id}.pdf`, fileUrl: `https://example.com/${e.id}.pdf`, relatedRecordType: "INCOME", relatedRecordId: e.id,
    })),
    ...printingEvents.filter((e) => e.type === "EXPENSE").slice(0, 6).map((e) => ({
      id: `ev-${e.id}`, workspaceId: "ws-print", documentType: "RECEIPT" as const, uploadDate: e.date, fileName: `${e.id}.pdf`, fileUrl: `https://example.com/${e.id}.pdf`, relatedRecordType: "EXPENSE", relatedRecordId: e.id,
    })),
  ],
  businessProfile: printingProfile,
  baseDate,
};

const restaurantProfile: BusinessProfile = { industry: "F&B", branchName: "Plaza Makan", businessType: "Sdn Bhd", registrationNo: "SSM-RB-005678", notes: "" };
const restaurantEvents = monthlyRecords("rb", "ws-resto", 18500, 4000);
const restaurant: Scenario = {
  name: "2. Restaurant / F&B",
  financialEvents: restaurantEvents,
  financialEvidencePackages: restaurantEvents.map((e) => ({
    id: `ev-${e.id}`, workspaceId: "ws-resto", documentType: e.type === "INCOME" ? "INVOICE" as const : "RECEIPT" as const, uploadDate: e.date, fileName: `${e.id}.pdf`, fileUrl: `https://example.com/${e.id}.pdf`, relatedRecordType: e.type, relatedRecordId: e.id,
  })),
  businessProfile: restaurantProfile,
  baseDate,
};

const serviceProfile: BusinessProfile = { industry: "Perkhidmatan IT", branchName: "Pejabat Subang", businessType: "Sole Proprietor", registrationNo: "SSM-SV-009876", notes: "" };
// Only 8/12 months have records — fails coverage (<80%).
const serviceEvents = monthlyRecords("sv", "ws-service", 12000, 800).filter((e) => {
  const monthIdx = parseInt(e.id.split("-").pop() as string, 10);
  return monthIdx < 8;
});
const service: Scenario = {
  name: "3. Service Business",
  financialEvents: serviceEvents,
  financialEvidencePackages: [],
  businessProfile: serviceProfile,
  baseDate,
};

const retailProfile: BusinessProfile = { industry: "Retail Pakaian", branchName: "Mall ABC", businessType: "Sdn Bhd", registrationNo: "SSM-RT-001122", notes: "" };
const retailEvents = monthlyRecords("rt", "ws-retail", 9800, 2200);
// Add some uncategorized "Lain-lain" records to fail the categorized check.
retailEvents.push(
  { id: "rt-lain-1", workspaceId: "ws-retail", type: "EXPENSE", categoryName: "Lain-lain", amountMyr: 50, partyName: "Tidak Pasti", date: "2026-06-15", referenceNumber: "EXP-RT-LL1", description: "Perbelanjaan tidak dikategorikan", isCompleted: true },
  { id: "rt-lain-2", workspaceId: "ws-retail", type: "EXPENSE", categoryName: "", amountMyr: 30, partyName: "Tidak Pasti", date: "2026-06-16", referenceNumber: "EXP-RT-LL2", description: "Kategori kosong", isCompleted: true }
);
const retail: Scenario = {
  name: "4. Retail Business",
  financialEvents: retailEvents,
  financialEvidencePackages: [],
  businessProfile: retailProfile,
  baseDate,
};

// Personal Finance — deliberately uses an industry-less profile (besides registrationNo present)
// to surface a partial-pass scenario distinct from the EMPTY_BUSINESS_PROFILE case below.
const personalProfile: BusinessProfile = { industry: "", branchName: "", businessType: "", registrationNo: "PERSONAL-001", notes: "" };
const personal: Scenario = {
  name: "5. Personal Finance",
  financialEvents: monthlyRecords("pf", "ws-personal", 5500, 350).slice(0, 6),
  financialEvidencePackages: [],
  businessProfile: personalProfile,
  baseDate,
};

const negativeProfile: BusinessProfile = { industry: "Kedai Runcit", branchName: "Bangi", businessType: "Sole Proprietor", registrationNo: "SSM-NP-003344", notes: "" };
const negativeProfit: Scenario = {
  name: "6. Negative Profit (struggling small business)",
  financialEvents: monthlyRecords("np", "ws-negative", 2000, 1500).slice(0, 3),
  financialEvidencePackages: [],
  businessProfile: negativeProfile,
  baseDate,
};

const empty: Scenario = {
  name: "7. Empty Data (new workspace, zero transactions)",
  financialEvents: [],
  financialEvidencePackages: [],
  businessProfile: EMPTY_BUSINESS_PROFILE,
  baseDate,
};

const scenarios: Scenario[] = [printing, restaurant, service, retail, personal, negativeProfit, empty];
const expectedCheckIds = ["registration", "income_evidence", "expense_evidence", "categorized", "coverage", "industry"];

for (const s of scenarios) {
  const lhdn = computeLhdnReadiness(s.financialEvents, s.financialEvidencePackages, s.businessProfile, s.baseDate);

  // CHECK 1 — All 6 checks present with boolean pass + detail.
  const ids = lhdn.checks.map((c) => c.id);
  const allIdsPresent = expectedCheckIds.every((id) => ids.includes(id)) && ids.length === expectedCheckIds.length;
  const allHaveValidShape = lhdn.checks.every((c) => typeof c.pass === "boolean" && typeof c.detail === "string" && c.detail.trim().length > 0);
  record(
    s.name,
    "1. All 6 Checks Present & Valid Shape",
    allIdsPresent && allHaveValidShape ? "PASS" : "FAIL",
    `Checks: [${ids.join(", ")}] (expected [${expectedCheckIds.join(", ")}]), all have boolean pass + non-empty detail: ${allHaveValidShape}.`
  );

  // CHECK 2 — scorePct formula exact.
  const expectedScorePct = (lhdn.passedCount / lhdn.totalChecks) * 100;
  const scorePctOk = lhdn.scorePct === expectedScorePct;
  record(
    s.name,
    "2. scorePct Formula Exact",
    scorePctOk ? "PASS" : "FAIL",
    `passedCount=${lhdn.passedCount}/${lhdn.totalChecks}, scorePct=${lhdn.scorePct} (expected ${expectedScorePct}).`
  );

  // CHECK 3 — income/expense evidence percentages match a hand-computed expected
  // ratio, for the scenario with known evidence linkage (Printing: 12/12 income
  // linked = 100%, 6/12 expense linked = 50%).
  if (s.name.startsWith("1.")) {
    const incomeRecords = s.financialEvents.filter((e) => e.type === "INCOME");
    const expenseRecords = s.financialEvents.filter((e) => e.type === "EXPENSE");
    const expectedIncomePct = 100; // all 12 income records have linked evidence
    const expectedExpensePct = 50; // 6 of 12 expense records have linked evidence
    const incomeOk = lhdn.incomeEvidencePct === expectedIncomePct;
    const expenseOk = lhdn.expenseEvidencePct === expectedExpensePct;
    record(
      s.name,
      "3. Evidence Percentages Match Hand-Computed Ratio",
      incomeOk && expenseOk ? "PASS" : "FAIL",
      `incomeEvidencePct=${lhdn.incomeEvidencePct} (expected ${expectedIncomePct}, ${incomeRecords.length} income records), expenseEvidencePct=${lhdn.expenseEvidencePct} (expected ${expectedExpensePct}, ${expenseRecords.length} expense records).`
    );
  } else {
    record(s.name, "3. Evidence Percentages Match Hand-Computed Ratio", "PASS", "N/A for this scenario — see Scenario 1 (Printing) for the dedicated known-linkage test.");
  }

  // CHECK 4 — Empty data doesn't crash.
  if (s.name.startsWith("7.")) {
    const noNaN = !Number.isNaN(lhdn.scorePct) && !Number.isNaN(lhdn.incomeEvidencePct) && !Number.isNaN(lhdn.expenseEvidencePct) && !Number.isNaN(lhdn.categorizedPct) && !Number.isNaN(lhdn.coveragePct);
    const allZeroPcts = lhdn.incomeEvidencePct === 0 && lhdn.expenseEvidencePct === 0 && lhdn.categorizedPct === 0;
    record(
      s.name,
      "4. Empty Data Handling",
      noNaN && allZeroPcts ? "PASS" : "FAIL",
      `incomeEvidencePct=${lhdn.incomeEvidencePct}, expenseEvidencePct=${lhdn.expenseEvidencePct}, categorizedPct=${lhdn.categorizedPct}, coveragePct=${lhdn.coveragePct} (no NaN: ${noNaN}).`
    );
  } else {
    record(s.name, "4. Empty Data Handling", "PASS", "N/A for this scenario (non-empty dataset) — see Scenario 7 for the dedicated empty-data test.");
  }

  // KNOWN GAP — explicitly surfaced per sprint instruction, not a defect.
  record(
    s.name,
    "5. TIN Status Check (Known Gap)",
    "WARNING",
    "TIN Status check is not implemented — BusinessProfile has no dedicated TIN field, registrationNo (SSM proxy) is reused instead. Known gap, not a defect."
  );

  console.log(`\n=== ${s.name} ===`);
  console.log(`ScorePct=${lhdn.scorePct.toFixed(1)}% (${lhdn.passedCount}/${lhdn.totalChecks}) | Grade=${lhdn.scoreGrade}`);
  console.log(`IncomeEvidence=${lhdn.incomeEvidencePct.toFixed(1)}% | ExpenseEvidence=${lhdn.expenseEvidencePct.toFixed(1)}% | Categorized=${lhdn.categorizedPct.toFixed(1)}% | Coverage=${lhdn.coveragePct.toFixed(1)}%`);
  for (const c of lhdn.checks) {
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
