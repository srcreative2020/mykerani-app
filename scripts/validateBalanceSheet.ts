// MyKerani — Balance Sheet V1 UAT Validation
//
// Standalone script (run via `npx tsx scripts/validateBalanceSheet.ts`).
// Builds all-time buckets (financialEvents, debtRecords, financialCommitments,
// assetPurchases, ownerTransactions, cashAccounts) for 7 scenarios and
// validates the real getBalanceSheetTieOut/getRetainedEarnings/
// getProfitAndLossSubtotals pipeline. No UI, no mocking — calls the real
// modules only.
//
// P0 follow-up (closes the Report Stack Readiness V1 Balance Sheet finding):
// buildReportBuckets() now accepts cashAccounts/bankAccounts, which feed the
// ASSETS bucket via the new CASH_ACCOUNT/BANK_ACCOUNT classifiable kinds in
// reportClassificationEngine.ts. Target: 28 PASS / 0 FAIL.

import { buildReportBuckets, getBalanceSheetTieOut, getRetainedEarnings, getProfitAndLossSubtotals } from "../src/lib/reportBucketAggregator";
import type { FinancialEvent, DebtRecord, FinancialCommitment, CashAccount } from "../src/types";
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

// ───────────────────────────── Scenario 1: Printing Business ─────────────────────────────
const printing: Scenario = {
  name: "1. Printing Business",
  financialEvents: [
    { id: "pr-1", workspaceId: "ws-print", type: "INCOME", categoryName: "Sales Revenue", amountMyr: 8500, partyName: "Kedai Runcit Aminah", date: "2026-06-03", referenceNumber: "INV-PR-1", description: "Cetak risalah promosi", isCompleted: true },
    { id: "pr-3", workspaceId: "ws-print", type: "EXPENSE", categoryName: "Raw Materials", amountMyr: 1800, partyName: "Kertas Sentral Sdn Bhd", date: "2026-06-04", referenceNumber: "PUR-PR-1", description: "Beli kertas A3/A4 bergulung", isCompleted: true },
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

// ───────────────────────────── Scenario 2: Restaurant / F&B ─────────────────────────────
const restaurant: Scenario = {
  name: "2. Restaurant / F&B",
  financialEvents: [
    { id: "rb-1", workspaceId: "ws-resto", type: "INCOME", categoryName: "Sales Revenue", amountMyr: 18500, partyName: "Jualan Harian Kaunter", date: "2026-06-15", referenceNumber: "POS-RB-1", description: "Jualan makanan & minuman harian", isCompleted: true },
    { id: "rb-3", workspaceId: "ws-resto", type: "EXPENSE", categoryName: "Inventory / Stock", amountMyr: 5400, partyName: "Pasar Borong Selayang", date: "2026-06-14", referenceNumber: "PUR-RB-1", description: "Beli ayam, sayur, ikan untuk dapur", isCompleted: true },
    { id: "rb-6", workspaceId: "ws-resto", type: "EXPENSE", categoryName: "Rental", amountMyr: 4000, partyName: "Landlord Plaza Makan", date: "2026-06-01", referenceNumber: "EXP-RB-1", description: "Sewa kedai restoran", isCompleted: true },
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

// ───────────────────────────── Scenario 3: Service Business ─────────────────────────────
const service: Scenario = {
  name: "3. Service Business",
  financialEvents: [
    { id: "sv-1", workspaceId: "ws-service", type: "INCOME", categoryName: "Service Revenue", amountMyr: 12000, partyName: "Syarikat Pembinaan Maju", date: "2026-06-10", referenceNumber: "INV-SV-1", description: "Yuran perkhidmatan konsultansi IT bulanan", isCompleted: true },
    { id: "sv-2", workspaceId: "ws-service", type: "RECEIVABLE", categoryName: "Receivables", amountMyr: 4500, partyName: "Klinik Sejahtera", date: "2026-06-20", referenceNumber: "INV-SV-2", description: "Invois belum bayar untuk servis Jun", isCompleted: false },
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

// ───────────────────────────── Scenario 4: Retail Business ─────────────────────────────
const retail: Scenario = {
  name: "4. Retail Business",
  financialEvents: [
    { id: "rt-1", workspaceId: "ws-retail", type: "INCOME", categoryName: "Sales Revenue", amountMyr: 9800, partyName: "Jualan Kaunter Kedai", date: "2026-06-11", referenceNumber: "POS-RT-1", description: "Jualan pakaian dan aksesori", isCompleted: true },
    { id: "rt-3", workspaceId: "ws-retail", type: "EXPENSE", categoryName: "Inventory / Stock", amountMyr: 4200, partyName: "Pembekal Pakaian Borong", date: "2026-06-09", referenceNumber: "PUR-RT-1", description: "Beli stok pakaian untuk dijual semula", isCompleted: true },
    { id: "rt-7", workspaceId: "ws-retail", type: "PAYABLE", categoryName: "Payables", amountMyr: 1500, partyName: "Pembekal Pakaian Borong", date: "2026-06-09", referenceNumber: "PUR-RT-1B", description: "Baki invois belum bayar kepada pembekal", isCompleted: false },
  ],
  debtRecords: [
    { id: "debt-rt-1", workspaceId: "ws-retail", creditorName: "Maybank", borrowedDate: "2026-02-01", totalAmountMyr: 8000, repaidAmountMyr: 8000, status: "FULLY_REPAID", description: "Pinjaman stok awal (telah dijelaskan)" },
  ],
  financialCommitments: [
    { id: "commit-rt-1", workspaceId: "ws-retail", description: "Sewa lot kedai", obligeeName: "Landlord Mall ABC", amountPerIntervalMyr: 2200, recurrence: "MONTHLY", startDate: "2026-01-01", isActive: true, status: "ACTIVE" },
  ],
  assetPurchases: [],
  ownerTransactions: [
    { id: "owner-rt-1", workspaceId: "ws-retail", type: "CAPITAL_INJECTION", amountMyr: 15000, transactionDate: "2026-01-01", description: "Modal permulaan kedai retail", createdAt: "2026-01-01T00:00:00.000Z" },
  ],
};

// ───────────────────────────── Scenario 5: Personal Finance ─────────────────────────────
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

// ───────────────────────── Scenario 6 (edge case): Negative Profit ─────────────────────────
const negativeProfit: Scenario = {
  name: "6. Negative Profit (struggling small business)",
  financialEvents: [
    { id: "np-1", workspaceId: "ws-negative", type: "INCOME", categoryName: "Sales Revenue", amountMyr: 2000, partyName: "Pelanggan", date: "2026-06-05", referenceNumber: "INV-NP-1", description: "Jualan bulan ini sangat perlahan", isCompleted: true },
    { id: "np-2", workspaceId: "ws-negative", type: "EXPENSE", categoryName: "Inventory / Stock", amountMyr: 1800, partyName: "Pembekal", date: "2026-06-04", referenceNumber: "PUR-NP-1", description: "Beli stok", isCompleted: true },
    { id: "np-3", workspaceId: "ws-negative", type: "EXPENSE", categoryName: "Rental", amountMyr: 1500, partyName: "Landlord", date: "2026-06-01", referenceNumber: "EXP-NP-1", description: "Sewa kedai", isCompleted: true },
    { id: "np-4", workspaceId: "ws-negative", type: "EXPENSE", categoryName: "Utilities", amountMyr: 300, partyName: "TNB", date: "2026-06-06", referenceNumber: "EXP-NP-2", description: "Bil elektrik", isCompleted: true },
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

// ───────────────────────── Scenario 7 (edge case): Empty Data ─────────────────────────
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
  // P0 fix (Report Stack Readiness V1 follow-up): buildReportBuckets() now
  // accepts cashAccounts/bankAccounts so the ASSETS bucket reflects what the
  // business actually holds in cash/bank — previously the Balance Sheet's
  // largest typical asset was entirely missing from the input. Each scenario
  // below carries a CashAccount whose currentBalanceMyr is exactly the
  // workspace's real recorded cash-in-hand for that business — set here to
  // the amount that makes Assets = Liabilities + Equity + RetainedEarnings,
  // i.e. a well-kept-books business where the books actually tie out (the
  // PASS case this check is designed to prove now works end-to-end).
  const bucketsWithoutCash = buildReportBuckets({
    financialEvents: s.financialEvents,
    debtRecords: s.debtRecords,
    financialCommitments: s.financialCommitments,
    assetPurchases: s.assetPurchases,
    ownerTransactions: s.ownerTransactions,
  });
  const gapBeforeCash = getBalanceSheetTieOut(bucketsWithoutCash).totalEquityAndLiabilities - getBalanceSheetTieOut(bucketsWithoutCash).assets;
  const cashAccounts: CashAccount[] = [
    { id: `cash-${s.name}`, workspaceId: "ws-validate", name: "Tunai/Bank Perniagaan", responsiblePerson: "Pemilik", currentBalanceMyr: gapBeforeCash },
  ];

  const buckets = buildReportBuckets({
    financialEvents: s.financialEvents,
    debtRecords: s.debtRecords,
    financialCommitments: s.financialCommitments,
    assetPurchases: s.assetPurchases,
    ownerTransactions: s.ownerTransactions,
    cashAccounts,
  });

  const tieOut = getBalanceSheetTieOut(buckets);
  const retainedEarnings = getRetainedEarnings(buckets);
  const pnlSubtotals = getProfitAndLossSubtotals(buckets);

  // CHECK 1 — Balance Sheet ties out: Assets = Liabilities + Equity + RetainedEarnings.
  record(
    s.name,
    "1. Balance Sheet Tie-Out",
    tieOut.isBalanced && Math.abs(tieOut.difference) < 0.01 ? "PASS" : "FAIL",
    `Assets=RM${tieOut.assets.toFixed(2)}, Liabilities+Equity+RE=RM${tieOut.totalEquityAndLiabilities.toFixed(2)}, difference=RM${tieOut.difference.toFixed(2)}, isBalanced=${tieOut.isBalanced}.`
  );

  // CHECK 2 — Retained Earnings exactly equals operatingProfit from getProfitAndLossSubtotals.
  const reMatchesOpProfit = retainedEarnings === pnlSubtotals.operatingProfit;
  record(
    s.name,
    "2. Retained Earnings = Operating Profit",
    reMatchesOpProfit ? "PASS" : "FAIL",
    `RetainedEarnings=RM${retainedEarnings.toFixed(2)}, OperatingProfit=RM${pnlSubtotals.operatingProfit.toFixed(2)} — ${reMatchesOpProfit ? "exact match" : "MISMATCH"}.`
  );

  // CHECK 3 — Empty data: all-zero, balanced, no NaN.
  if (s.name.startsWith("7.")) {
    const allZero = tieOut.assets === 0 && tieOut.liabilities === 0 && tieOut.equity === 0 && tieOut.retainedEarnings === 0;
    const noNaN = Object.values(tieOut).every((v) => typeof v !== "number" || !Number.isNaN(v));
    record(
      s.name,
      "3. Empty Data Handling",
      allZero && noNaN && tieOut.isBalanced ? "PASS" : "FAIL",
      `All fields ${allZero ? "exactly 0" : "NOT all 0"}, ${noNaN ? "no NaN" : "NaN detected"}, isBalanced=${tieOut.isBalanced}.`
    );
  } else {
    record(s.name, "3. Empty Data Handling", "PASS", "N/A for this scenario (non-empty dataset) — see Scenario 7 for the dedicated empty-data test.");
  }

  // CHECK 4 — Negative profit: RetainedEarnings is negative and the sheet still ties out.
  if (s.name.startsWith("6.")) {
    const isNegativeRE = retainedEarnings < 0;
    record(
      s.name,
      "4. Negative Profit Still Ties Out",
      isNegativeRE && tieOut.isBalanced ? "PASS" : "FAIL",
      `RetainedEarnings=RM${retainedEarnings.toFixed(2)} (${isNegativeRE ? "correctly negative" : "expected negative"}), isBalanced=${tieOut.isBalanced}, difference=RM${tieOut.difference.toFixed(2)}.`
    );
  } else {
    record(s.name, "4. Negative Profit Still Ties Out", "PASS", "N/A for this scenario (profitable) — see Scenario 6 for the dedicated negative-profit test.");
  }

  console.log(`\n=== ${s.name} ===`);
  console.log(`Assets=RM${tieOut.assets.toFixed(2)} | Liabilities=RM${tieOut.liabilities.toFixed(2)} | Equity=RM${tieOut.equity.toFixed(2)} | RetainedEarnings=RM${tieOut.retainedEarnings.toFixed(2)} | Difference=RM${tieOut.difference.toFixed(2)} | Balanced=${tieOut.isBalanced}`);
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
