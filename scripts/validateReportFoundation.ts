// MyKerani — Report Foundation Sprint V1, Phase 5: Coverage Validation
//
// Standalone validation script (run via `npx tsx scripts/validateReportFoundation.ts`).
// Builds representative synthetic records covering every record kind and
// every Level 1 Financial Statement Group, runs them through the real
// Report Classification Engine + Report Bucket Aggregator + Evidence
// Drilldown modules (no mocking of the modules under test), and prints a
// PASS/FAIL table for each of the 10 checks required by
// MYKERANI_REPORT_FOUNDATION_SPRINT_V1.md Phase 5.

import { ACCOUNTING_KNOWLEDGE_BASE } from "../src/lib/accountingClassificationMap";
import { resolveLevel1Group, fromFinancialEvent, fromDebtRecord, fromFinancialCommitment, fromAssetPurchase, fromOwnerTransaction } from "../src/lib/reportClassificationEngine";
import { buildReportBuckets, flattenBuckets, getAllBucketTotals } from "../src/lib/reportBucketAggregator";
import { buildEvidenceIndex, getEvidenceForRecord, getEvidenceCoverageRatio } from "../src/lib/evidenceDrilldown";
import type { FinancialEvent, DebtRecord, FinancialCommitment, FinancialEvidencePackage } from "../src/types";
import type { AssetPurchase, OwnerTransaction } from "../src/lib/assetOwnerData";

const results: { name: string; pass: boolean; detail: string }[] = [];
function check(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
}

// ── Synthetic sample data: one record per FinancialRecordType, plus debts,
// commitments, asset purchases, and both owner transaction types. Includes
// both canonical-label matches and unresolvable free-text categories to
// prove the fallback tier actually engages. ──

const financialEvents: FinancialEvent[] = [
  { id: "fe-1", workspaceId: "ws-1", type: "INCOME", categoryName: "Sales Revenue", amountMyr: 5000, partyName: "Pelanggan A", date: "2026-06-01", referenceNumber: "R1", description: "Jualan produk", isCompleted: true },
  { id: "fe-2", workspaceId: "ws-1", type: "INCOME", categoryName: "Untracked Free Text Income", amountMyr: 1200, partyName: "Pelanggan B", date: "2026-06-02", referenceNumber: "R2", description: "Bayaran tanpa kategori dikenali", isCompleted: true },
  { id: "fe-3", workspaceId: "ws-1", type: "RECEIVABLE", categoryName: "Receivables", amountMyr: 800, partyName: "Pelanggan C", date: "2026-06-03", referenceNumber: "R3", description: "Invois belum bayar", isCompleted: false },
  { id: "fe-4", workspaceId: "ws-1", type: "EXPENSE", categoryName: "Utilities", amountMyr: 320, partyName: "TNB", date: "2026-06-04", referenceNumber: "R4", description: "Bil elektrik", isCompleted: true },
  { id: "fe-5", workspaceId: "ws-1", type: "EXPENSE", categoryName: "Inventory / Stock", amountMyr: 450, partyName: "Pasar Borong", date: "2026-06-05", referenceNumber: "R5", description: "Beli ayam", isCompleted: true },
  { id: "fe-6", workspaceId: "ws-1", type: "PAYABLE", categoryName: "Payables", amountMyr: 600, partyName: "Pembekal X", date: "2026-06-06", referenceNumber: "R6", description: "Invoice belum bayar kepada pembekal", isCompleted: false },
];

const debtRecords: DebtRecord[] = [
  { id: "debt-1", workspaceId: "ws-1", creditorName: "Bank ABC", borrowedDate: "2026-01-01", totalAmountMyr: 10000, repaidAmountMyr: 2000, status: "ACTIVE", description: "Pinjaman perniagaan" },
];

const financialCommitments: FinancialCommitment[] = [
  { id: "commit-1", workspaceId: "ws-1", description: "Sewa pejabat bulanan", obligeeName: "Landlord Sdn Bhd", amountPerIntervalMyr: 1500, recurrence: "MONTHLY", startDate: "2026-01-01", isActive: true, status: "ACTIVE" },
];

const assetPurchases: AssetPurchase[] = [
  { id: "asset-1", workspaceId: "ws-1", assetName: "Printer Laser", category: "Equipment / Fixed Assets", purchaseAmountMyr: 1200, purchaseDate: "2026-03-01", vendorName: "Tech Store", notes: "", createdAt: "2026-03-01T00:00:00.000Z" },
];

const ownerTransactions: OwnerTransaction[] = [
  { id: "owner-1", workspaceId: "ws-1", type: "CAPITAL_INJECTION", amountMyr: 20000, transactionDate: "2026-01-01", description: "Modal permulaan pemilik", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "owner-2", workspaceId: "ws-1", type: "DRAWING", amountMyr: 1000, transactionDate: "2026-04-01", description: "Pengeluaran peribadi pemilik", createdAt: "2026-04-01T00:00:00.000Z" },
];

const evidencePackages: FinancialEvidencePackage[] = [
  { id: "ev-1", workspaceId: "ws-1", documentType: "RECEIPT", uploadDate: "2026-06-04", fileName: "tnb_receipt.pdf", fileUrl: "https://example.com/tnb.pdf", relatedRecordType: "EXPENSE", relatedRecordId: "fe-4" },
  { id: "ev-2", workspaceId: "ws-1", documentType: "INVOICE", uploadDate: "2026-06-06", fileName: "invoice_pembekal_x.pdf", fileUrl: "https://example.com/inv.pdf", relatedRecordType: "PAYABLE", relatedRecordId: "fe-6" },
];

// ── Run the real pipeline ──
const buckets = buildReportBuckets({ financialEvents, debtRecords, financialCommitments, assetPurchases, ownerTransactions });
const flat = flattenBuckets(buckets);
const totalInputRecords = financialEvents.length + debtRecords.length + financialCommitments.length + assetPurchases.length + ownerTransactions.length;
const evidenceIndex = buildEvidenceIndex(evidencePackages);

// 1. 100% transaction resolution
check("1. 100% transaction resolution", flat.length === totalInputRecords, `${flat.length}/${totalInputRecords} records produced a bucket entry`);

// 2. No unresolved categories (every bucketed record has a non-null level1Group — structurally guaranteed, verified here)
const unresolved = flat.filter((r) => !r.level1Group);
check("2. No unresolved categories", unresolved.length === 0, `${unresolved.length} records with missing level1Group`);

// 3. No duplicate category paths (every canonical category id in the knowledge base is unique)
const ids = ACCOUNTING_KNOWLEDGE_BASE.map((r) => r.id);
const uniqueIds = new Set(ids);
check("3. No duplicate category paths", ids.length === uniqueIds.size, `${ids.length} rules, ${uniqueIds.size} unique canonical ids`);

// 4. No orphan records (every bucketed record traces back to a recordId present in the source input)
const sourceIds = new Set([
  ...financialEvents.map((e) => e.id),
  ...debtRecords.map((d) => d.id),
  ...financialCommitments.map((c) => c.id),
  ...assetPurchases.map((a) => a.id),
  ...ownerTransactions.map((o) => o.id),
]);
const orphans = flat.filter((r) => !sourceIds.has(r.recordId));
check("4. No orphan records", orphans.length === 0, `${orphans.length} bucketed records not traceable to a source record id`);

// 5. Revenue resolution works (canonical match + type fallback both land in REVENUE)
const revenueOk = buckets.REVENUE.some((r) => r.recordId === "fe-1") && buckets.REVENUE.some((r) => r.recordId === "fe-2" && r.resolutionMethod === "TYPE_FALLBACK");
check("5. Revenue resolution works", revenueOk, `REVENUE bucket has ${buckets.REVENUE.length} records (canonical + fallback both present)`);

// 6. Receivable resolution works
const receivableOk = buckets.ASSETS.some((r) => r.recordId === "fe-3");
check("6. Receivable resolution works", receivableOk, `ASSETS bucket includes receivable fe-3: ${receivableOk}`);

// 7. Equity resolution works (both capital injection and drawing)
const equityOk = buckets.EQUITY.some((r) => r.recordId === "owner-1") && buckets.EQUITY.some((r) => r.recordId === "owner-2");
check("7. Equity resolution works", equityOk, `EQUITY bucket has ${buckets.EQUITY.length} records (capital injection + drawing)`);

// 8. Asset resolution works (asset purchase + receivable + cash/bank-style)
const assetOk = buckets.ASSETS.some((r) => r.recordId === "asset-1");
check("8. Asset resolution works", assetOk, `ASSETS bucket includes asset purchase asset-1: ${assetOk}`);

// 9. Liability resolution works (debt + payable + commitment)
const liabilityOk = buckets.LIABILITIES.some((r) => r.recordId === "debt-1") && buckets.LIABILITIES.some((r) => r.recordId === "fe-6") && buckets.LIABILITIES.some((r) => r.recordId === "commit-1");
check("9. Liability resolution works", liabilityOk, `LIABILITIES bucket has ${buckets.LIABILITIES.length} records (debt + payable + commitment)`);

// 10. Evidence linkage works
const fe4Evidence = getEvidenceForRecord(evidenceIndex, "fe-4");
const fe6Evidence = getEvidenceForRecord(evidenceIndex, "fe-6");
const coverage = getEvidenceCoverageRatio(flat, evidenceIndex);
check("10. Evidence linkage works", fe4Evidence.length === 1 && fe6Evidence.length === 1, `fe-4: ${fe4Evidence.length} pkg, fe-6: ${fe6Evidence.length} pkg, overall coverage ${(coverage * 100).toFixed(1)}%`);

// ── Print report ──
console.log("\n=== MyKerani Report Foundation — Coverage Validation ===\n");
for (const r of results) {
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}\n      ${r.detail}`);
}
const passCount = results.filter((r) => r.pass).length;
console.log(`\n${passCount}/${results.length} checks passed.`);
console.log("\nBucket totals:", JSON.stringify(getAllBucketTotals(buckets), null, 2));
console.log("\nResolution method breakdown:", JSON.stringify(
  flat.reduce((acc: Record<string, number>, r) => { acc[r.resolutionMethod] = (acc[r.resolutionMethod] || 0) + 1; return acc; }, {}),
  null, 2
));

if (passCount !== results.length) {
  process.exitCode = 1;
}
