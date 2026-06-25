// MyKerani — Cash Flow V1 UAT Validation
//
// Standalone script (run via `npx tsx scripts/validateCashFlow.ts`). Builds
// all-time buckets per scenario, flattens them, and validates the real
// classifyCashFlowActivity / getCashFlowActivityTotals / groupRecordsByActivity
// pipeline against expected OPERATING/INVESTING/FINANCING placement. No UI,
// no mocking — calls the real modules only.

import { buildReportBuckets, flattenBuckets } from "../src/lib/reportBucketAggregator";
import { classifyCashFlowActivity, getCashFlowActivityTotals, groupRecordsByActivity } from "../src/lib/cashFlowClassifier";
import type { FinancialEvent, DebtRecord, FinancialCommitment } from "../src/types";
import type { AssetPurchase, OwnerTransaction } from "../src/lib/assetOwnerData";

interface Scenario {
  name: string;
  financialEvents: FinancialEvent[];
  debtRecords: DebtRecord[];
  financialCommitments: FinancialCommitment[];
  assetPurchases: AssetPurchase[];
  ownerTransactions: OwnerTransaction[];
}

type Status = "PASS" | "WARNING" | "FAIL";
const results: { scenario: string; check: string; status: Status; detail: string }[] = [];
function record(scenario: string, check: string, status: Status, detail: string) {
  results.push({ scenario, check, status, detail });
}

const printing: Scenario = {
  name: "1. Printing Business",
  financialEvents: [
    { id: "pr-1", workspaceId: "ws-print", type: "INCOME", categoryName: "Sales Revenue", amountMyr: 8500, partyName: "Kedai Runcit Aminah", date: "2026-06-03", referenceNumber: "INV-PR-1", description: "Cetak risalah promosi", isCompleted: true },
    { id: "pr-5", workspaceId: "ws-print", type: "EXPENSE", categoryName: "Rental", amountMyr: 1200, partyName: "Landlord Wisma ABC", date: "2026-06-01", referenceNumber: "EXP-PR-1", description: "Sewa kedai bulan Jun", isCompleted: true },
  ],
  debtRecords: [
    { id: "debt-pr-1", workspaceId: "ws-print", creditorName: "Bank Rakyat", borrowedDate: "2026-01-01", totalAmountMyr: 15000, repaidAmountMyr: 5000, status: "ACTIVE", description: "Pinjaman beli mesin cetak" },
  ],
  financialCommitments: [
    { id: "commit-pr-1", workspaceId: "ws-print", description: "Sewa kedai bulanan", obligeeName: "Landlord Wisma ABC", amountPerIntervalMyr: 1200, recurrence: "MONTHLY", startDate: "2026-01-01", isActive: true, status: "ACTIVE" },
  ],
  assetPurchases: [
    { id: "asset-pr-1", workspaceId: "ws-print", assetName: "Mesin Cetak Digital", category: "Equipment / Fixed Assets", purchaseAmountMyr: 22000, purchaseDate: "2026-02-01", vendorName: "Tech Print Sdn Bhd", notes: "", createdAt: "2026-02-01T00:00:00.000Z" },
  ],
  ownerTransactions: [
    { id: "owner-pr-1", workspaceId: "ws-print", type: "CAPITAL_INJECTION", amountMyr: 10000, transactionDate: "2026-01-01", description: "Modal permulaan pemilik", createdAt: "2026-01-01T00:00:00.000Z" },
  ],
};

const restaurant: Scenario = {
  name: "2. Restaurant / F&B",
  financialEvents: [
    { id: "rb-1", workspaceId: "ws-resto", type: "INCOME", categoryName: "Sales Revenue", amountMyr: 18500, partyName: "Jualan Harian Kaunter", date: "2026-06-15", referenceNumber: "POS-RB-1", description: "Jualan makanan & minuman harian", isCompleted: true },
    { id: "rb-3", workspaceId: "ws-resto", type: "EXPENSE", categoryName: "Inventory / Stock", amountMyr: 5400, partyName: "Pasar Borong Selayang", date: "2026-06-14", referenceNumber: "PUR-RB-1", description: "Beli ayam, sayur, ikan untuk dapur", isCompleted: true },
  ],
  debtRecords: [],
  financialCommitments: [
    { id: "commit-rb-1", workspaceId: "ws-resto", description: "Sewa restoran bulanan", obligeeName: "Landlord Plaza Makan", amountPerIntervalMyr: 4000, recurrence: "MONTHLY", startDate: "2026-01-01", isActive: true, status: "ACTIVE" },
  ],
  assetPurchases: [
    { id: "asset-rb-1", workspaceId: "ws-resto", assetName: "Peti Sejuk Komersial", category: "Equipment / Fixed Assets", purchaseAmountMyr: 6500, purchaseDate: "2026-03-01", vendorName: "Kitchen Supplies Sdn Bhd", notes: "", createdAt: "2026-03-01T00:00:00.000Z" },
  ],
  ownerTransactions: [
    { id: "owner-rb-1", workspaceId: "ws-resto", type: "CAPITAL_INJECTION", amountMyr: 25000, transactionDate: "2026-01-01", description: "Modal permulaan restoran", createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "owner-rb-2", workspaceId: "ws-resto", type: "DRAWING", amountMyr: 2000, transactionDate: "2026-06-20", description: "Pengeluaran peribadi pemilik", createdAt: "2026-06-20T00:00:00.000Z" },
  ],
};

const service: Scenario = {
  name: "3. Service Business",
  financialEvents: [
    { id: "sv-1", workspaceId: "ws-service", type: "INCOME", categoryName: "Service Revenue", amountMyr: 12000, partyName: "Syarikat Pembinaan Maju", date: "2026-06-10", referenceNumber: "INV-SV-1", description: "Yuran perkhidmatan konsultansi IT bulanan", isCompleted: true },
    { id: "sv-3", workspaceId: "ws-service", type: "EXPENSE", categoryName: "Professional Fees", amountMyr: 800, partyName: "Akauntan Bertauliah", date: "2026-06-05", referenceNumber: "EXP-SV-1", description: "Yuran akauntan bulanan", isCompleted: true },
  ],
  debtRecords: [],
  financialCommitments: [],
  assetPurchases: [
    { id: "asset-sv-1", workspaceId: "ws-service", assetName: "Laptop Konsultan", category: "Equipment / Fixed Assets", purchaseAmountMyr: 4500, purchaseDate: "2026-02-15", vendorName: "Tech Store", notes: "", createdAt: "2026-02-15T00:00:00.000Z" },
  ],
  ownerTransactions: [
    { id: "owner-sv-1", workspaceId: "ws-service", type: "CAPITAL_INJECTION", amountMyr: 8000, transactionDate: "2026-01-01", description: "Modal permulaan konsultansi", createdAt: "2026-01-01T00:00:00.000Z" },
  ],
};

const retail: Scenario = {
  name: "4. Retail Business",
  financialEvents: [
    { id: "rt-1", workspaceId: "ws-retail", type: "INCOME", categoryName: "Sales Revenue", amountMyr: 9800, partyName: "Jualan Kaunter Kedai", date: "2026-06-11", referenceNumber: "POS-RT-1", description: "Jualan pakaian dan aksesori", isCompleted: true },
    { id: "rt-3", workspaceId: "ws-retail", type: "EXPENSE", categoryName: "Inventory / Stock", amountMyr: 4200, partyName: "Pembekal Pakaian Borong", date: "2026-06-09", referenceNumber: "PUR-RT-1", description: "Beli stok pakaian untuk dijual semula", isCompleted: true },
  ],
  debtRecords: [
    { id: "debt-rt-1", workspaceId: "ws-retail", creditorName: "Maybank", borrowedDate: "2026-02-01", totalAmountMyr: 8000, repaidAmountMyr: 3000, status: "ACTIVE", description: "Pinjaman stok awal" },
  ],
  financialCommitments: [
    { id: "commit-rt-1", workspaceId: "ws-retail", description: "Sewa lot kedai", obligeeName: "Landlord Mall ABC", amountPerIntervalMyr: 2200, recurrence: "MONTHLY", startDate: "2026-01-01", isActive: true, status: "ACTIVE" },
  ],
  assetPurchases: [],
  ownerTransactions: [
    { id: "owner-rt-1", workspaceId: "ws-retail", type: "CAPITAL_INJECTION", amountMyr: 15000, transactionDate: "2026-01-01", description: "Modal permulaan kedai retail", createdAt: "2026-01-01T00:00:00.000Z" },
  ],
};

const personal: Scenario = {
  name: "5. Personal Finance",
  financialEvents: [
    { id: "pf-1", workspaceId: "ws-personal", type: "INCOME", categoryName: "Other Income", amountMyr: 5500, partyName: "Majikan", date: "2026-06-01", referenceNumber: "SAL-PF-1", description: "Gaji bulanan", isCompleted: true },
    { id: "pf-3", workspaceId: "ws-personal", type: "EXPENSE", categoryName: "Fuel & Transport", amountMyr: 350, partyName: "Petronas", date: "2026-06-05", referenceNumber: "EXP-PF-1", description: "Minyak kereta peribadi", isCompleted: true },
  ],
  debtRecords: [],
  financialCommitments: [],
  assetPurchases: [],
  ownerTransactions: [],
};

const negativeProfit: Scenario = {
  name: "6. Negative Profit (struggling small business)",
  financialEvents: [
    { id: "np-1", workspaceId: "ws-negative", type: "INCOME", categoryName: "Sales Revenue", amountMyr: 2000, partyName: "Pelanggan", date: "2026-06-05", referenceNumber: "INV-NP-1", description: "Jualan bulan ini sangat perlahan", isCompleted: true },
    { id: "np-2", workspaceId: "ws-negative", type: "EXPENSE", categoryName: "Inventory / Stock", amountMyr: 1800, partyName: "Pembekal", date: "2026-06-04", referenceNumber: "PUR-NP-1", description: "Beli stok", isCompleted: true },
    { id: "np-3", workspaceId: "ws-negative", type: "EXPENSE", categoryName: "Rental", amountMyr: 1500, partyName: "Landlord", date: "2026-06-01", referenceNumber: "EXP-NP-1", description: "Sewa kedai", isCompleted: true },
  ],
  debtRecords: [
    { id: "debt-np-1", workspaceId: "ws-negative", creditorName: "Along (Pemberi Pinjam)", borrowedDate: "2026-03-01", totalAmountMyr: 5000, repaidAmountMyr: 500, status: "ACTIVE", description: "Pinjaman kecemasan tunai" },
  ],
  financialCommitments: [],
  assetPurchases: [],
  ownerTransactions: [
    { id: "owner-np-1", workspaceId: "ws-negative", type: "CAPITAL_INJECTION", amountMyr: 3000, transactionDate: "2026-01-01", description: "Modal permulaan kecil", createdAt: "2026-01-01T00:00:00.000Z" },
  ],
};

const empty: Scenario = {
  name: "7. Empty Data (new workspace, zero transactions)",
  financialEvents: [],
  debtRecords: [],
  financialCommitments: [],
  assetPurchases: [],
  ownerTransactions: [],
};

const scenarios: Scenario[] = [printing, restaurant, service, retail, personal, negativeProfit, empty];

for (const s of scenarios) {
  const buckets = buildReportBuckets({
    financialEvents: s.financialEvents,
    debtRecords: s.debtRecords,
    financialCommitments: s.financialCommitments,
    assetPurchases: s.assetPurchases,
    ownerTransactions: s.ownerTransactions,
  });
  const flat = flattenBuckets(buckets);

  // CHECK 1 — Every record gets exactly one of OPERATING/INVESTING/FINANCING.
  const classifications = flat.map((r) => classifyCashFlowActivity(r));
  const validValues = new Set(["OPERATING", "INVESTING", "FINANCING"]);
  const allClassified = classifications.every((c) => validValues.has(c));
  record(
    s.name,
    "1. Every Record Classified",
    allClassified ? "PASS" : "FAIL",
    `${classifications.length}/${flat.length} records produced exactly one of OPERATING/INVESTING/FINANCING.`
  );

  // CHECK 2 — getCashFlowActivityTotals sums match groupRecordsByActivity group sums exactly.
  const totals = getCashFlowActivityTotals(flat);
  const groups = groupRecordsByActivity(flat);
  const groupOperatingSum = groups.OPERATING.reduce((sum, r) => sum + (r.amountMyr || 0), 0);
  const groupInvestingSum = groups.INVESTING.reduce((sum, r) => sum + (r.amountMyr || 0), 0);
  const groupFinancingSum = groups.FINANCING.reduce((sum, r) => sum + (r.amountMyr || 0), 0);
  const sumsMatch = totals.operating === groupOperatingSum && totals.investing === groupInvestingSum && totals.financing === groupFinancingSum;
  record(
    s.name,
    "2. Totals Match Group Sums",
    sumsMatch ? "PASS" : "FAIL",
    `Operating: ${totals.operating}=${groupOperatingSum}, Investing: ${totals.investing}=${groupInvestingSum}, Financing: ${totals.financing}=${groupFinancingSum}.`
  );

  // CHECK 3 — Asset purchases -> INVESTING; debt/owner-transaction records -> FINANCING;
  // financial events/commitments -> OPERATING.
  const assetIds = new Set(s.assetPurchases.map((a) => a.id));
  const debtOwnerIds = new Set([...s.debtRecords.map((d) => d.id), ...s.ownerTransactions.map((o) => o.id)]);
  const eventCommitmentIds = new Set([...s.financialEvents.map((e) => e.id), ...s.financialCommitments.map((c) => c.id)]);
  const assetsCorrect = flat.filter((r) => assetIds.has(r.recordId)).every((r) => classifyCashFlowActivity(r) === "INVESTING");
  const financingCorrect = flat.filter((r) => debtOwnerIds.has(r.recordId)).every((r) => classifyCashFlowActivity(r) === "FINANCING");
  const operatingCorrect = flat.filter((r) => eventCommitmentIds.has(r.recordId)).every((r) => classifyCashFlowActivity(r) === "OPERATING");
  record(
    s.name,
    "3. Activity Mapping by Record Kind",
    assetsCorrect && financingCorrect && operatingCorrect ? "PASS" : "FAIL",
    `AssetPurchases->INVESTING: ${assetsCorrect} (n=${assetIds.size}), Debt/OwnerTxn->FINANCING: ${financingCorrect} (n=${debtOwnerIds.size}), Events/Commitments->OPERATING: ${operatingCorrect} (n=${eventCommitmentIds.size}).`
  );

  // CHECK 4 — Empty data produces all-zero totals with no NaN.
  if (s.name.startsWith("7.")) {
    const allZero = totals.operating === 0 && totals.investing === 0 && totals.financing === 0 && totals.netCashFlow === 0;
    const noNaN = Object.values(totals).every((v) => !Number.isNaN(v));
    record(
      s.name,
      "4. Empty Data Handling",
      allZero && noNaN ? "PASS" : "FAIL",
      `All totals ${allZero ? "exactly 0" : "NOT all 0"}, ${noNaN ? "no NaN" : "NaN detected"}.`
    );
  } else {
    record(s.name, "4. Empty Data Handling", "PASS", "N/A for this scenario (non-empty dataset) — see Scenario 7 for the dedicated empty-data test.");
  }

  console.log(`\n=== ${s.name} ===`);
  console.log(`Operating=RM${totals.operating.toFixed(2)} | Investing=RM${totals.investing.toFixed(2)} | Financing=RM${totals.financing.toFixed(2)} | NetCashFlow=RM${totals.netCashFlow.toFixed(2)}`);
}

console.log("\n\n=== Full Check Matrix ===\n");
for (const r of results) {
  console.log(`${r.status.padEnd(8)} | ${r.scenario.padEnd(45)} | ${r.check.padEnd(35)} | ${r.detail}`);
}

const passCount = results.filter((r) => r.status === "PASS").length;
const warnCount = results.filter((r) => r.status === "WARNING").length;
const failCount = results.filter((r) => r.status === "FAIL").length;
console.log(`\n${passCount} PASS / ${warnCount} WARNING / ${failCount} FAIL out of ${results.length} checks.`);

if (failCount > 0) {
  process.exitCode = 1;
}
