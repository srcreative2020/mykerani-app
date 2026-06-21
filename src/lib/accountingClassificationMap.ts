// MyKerani — Accounting Knowledge Base V1 (Phase 1 implementation)
//
// Source of truth: MYKERANI_ACCOUNTING_KNOWLEDGE_BASE_V1.md,
// MYKERANI_FINANCIAL_CLASSIFICATION_MASTER_FRAMEWORK.md and
// MYKERANI_REPORT_FOUNDATION_SPRINT_V1.md (Report Foundation Sprint V1,
// Phase 1 — full taxonomy expansion).
//
// Stateless, deterministic, in-memory rules layer. No DB, no learning
// engine, no ranking engine, no new AI model. Pure functions only.

export type FinancialStatementGroup =
  | "REVENUE"
  | "COST_OF_SALES"
  | "OPERATING_EXPENSES"
  | "ASSETS"
  | "LIABILITIES"
  | "EQUITY";

export type CanonicalCategory =
  // Revenue
  | "SALES_REVENUE"
  | "SERVICE_REVENUE"
  | "OTHER_INCOME"
  // Cost of Sales
  | "INVENTORY_STOCK"
  | "RAW_MATERIALS"
  | "DIRECT_LABOUR"
  // Operating Expenses
  | "UTILITIES"
  | "RENTAL"
  | "INTERNET"
  | "TELEPHONE"
  | "FUEL_TRANSPORT"
  | "OFFICE_SUPPLIES"
  | "MARKETING"
  | "INSURANCE"
  | "PROFESSIONAL_FEES"
  // Assets
  | "CASH_BANK"
  | "RECEIVABLES"
  | "INVENTORY_ON_HAND"
  | "EQUIPMENT_FIXED_ASSETS"
  // Liabilities
  | "PAYABLES"
  | "LOANS"
  | "ACCRUED_EXPENSES"
  | "COMMITMENTS"
  // Equity
  | "OWNER_CAPITAL"
  | "RETAINED_EARNINGS"
  | "DRAWINGS";

export type MatchStatus = "MATCH" | "POSSIBLE_MISMATCH" | "HIGH_RISK_MISMATCH";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "N/A";

export type FinancialStatementImpact =
  | "REVENUE_PNL"
  | "COGS_PNL"
  | "OPEX_PNL"
  | "BALANCE_SHEET_ASSET"
  | "BALANCE_SHEET_LIABILITY"
  | "BALANCE_SHEET_EQUITY";

export interface AccountingRule {
  id: CanonicalCategory;
  recommendedCategory: string; // display label (accounting name)
  humanFriendlyName: string; // plain-language name for non-accountant users
  level1Group: FinancialStatementGroup;
  keywords: string[];
  accountingReason: string;
  financialStatementImpact: FinancialStatementImpact;
  riskLevel: RiskLevel;
  explanationText: string;
}

export const ACCOUNTING_KNOWLEDGE_BASE: AccountingRule[] = [
  // ─────────────────────────── REVENUE ───────────────────────────
  {
    id: "SALES_REVENUE",
    recommendedCategory: "Sales Revenue",
    humanFriendlyName: "Wang Jualan",
    level1Group: "REVENUE",
    keywords: ["jualan", "sales", "terima bayaran pelanggan", "sold", "jual barang"],
    accountingReason: "Records income from core goods/services sold; credited to P&L Revenue.",
    financialStatementImpact: "REVENUE_PNL",
    riskLevel: "HIGH",
    explanationText: "Misclassifying revenue as another income type distorts gross margin and tax reporting.",
  },
  {
    id: "SERVICE_REVENUE",
    recommendedCategory: "Service Revenue",
    humanFriendlyName: "Wang Perkhidmatan",
    level1Group: "REVENUE",
    keywords: ["yuran", "fee", "perkhidmatan", "consulting", "service charge"],
    accountingReason: "Records income from services rendered (vs. goods sold); credited to P&L Revenue.",
    financialStatementImpact: "REVENUE_PNL",
    riskLevel: "MEDIUM",
    explanationText: "Usually still lands in Revenue, but blending with Sales Revenue obscures product vs. service mix.",
  },
  {
    id: "OTHER_INCOME",
    recommendedCategory: "Other Income",
    humanFriendlyName: "Pendapatan Lain",
    level1Group: "REVENUE",
    keywords: ["faedah", "interest", "jual aset lama", "rebat", "sponsorship", "rebate"],
    accountingReason: "Non-core, incidental income (e.g. interest, asset disposal gain); credited to P&L, separate from operating revenue.",
    financialStatementImpact: "REVENUE_PNL",
    riskLevel: "MEDIUM",
    explanationText: "Inflates apparent core revenue if merged with Sales Revenue.",
  },

  // ───────────────────────── COST OF SALES ─────────────────────────
  {
    id: "INVENTORY_STOCK",
    recommendedCategory: "Inventory / Stock",
    humanFriendlyName: "Belian Stok",
    level1Group: "COST_OF_SALES",
    keywords: ["ayam", "ikan", "sayur", "tepung", "minyak masak", "beras", "stok", "stock", "pembelian stok"],
    accountingReason: "Goods purchased for resale or as production input are recorded as Cost of Sales, not a generic operating expense.",
    financialStatementImpact: "COGS_PNL",
    riskLevel: "MEDIUM",
    explanationText: "Merekodkan ini sebagai perbelanjaan operasi biasa boleh menjejaskan pengiraan Untung Kasar (Gross Profit) yang tepat.",
  },
  {
    id: "RAW_MATERIALS",
    recommendedCategory: "Raw Materials",
    humanFriendlyName: "Bahan Mentah",
    level1Group: "COST_OF_SALES",
    keywords: ["bahan mentah", "raw material", "raw materials"],
    accountingReason: "Unprocessed inputs consumed in production are debited to Cost of Sales.",
    financialStatementImpact: "COGS_PNL",
    riskLevel: "HIGH",
    explanationText: "Same Gross Profit distortion risk as Inventory/Stock if recorded as a generic operating expense.",
  },
  {
    id: "DIRECT_LABOUR",
    recommendedCategory: "Direct Labour",
    humanFriendlyName: "Upah Pekerja Pengeluaran",
    level1Group: "COST_OF_SALES",
    keywords: ["upah pekerja kilang", "buruh langsung", "direct labour", "direct labor"],
    accountingReason: "Wages directly tied to producing goods/services sold are debited to Cost of Sales.",
    financialStatementImpact: "COGS_PNL",
    riskLevel: "MEDIUM",
    explanationText: "Recording as general Operating Expense understates the true cost of production.",
  },

  // ─────────────────────── OPERATING EXPENSES ───────────────────────
  {
    id: "UTILITIES",
    recommendedCategory: "Utilities",
    humanFriendlyName: "Bil Elektrik & Air",
    level1Group: "OPERATING_EXPENSES",
    keywords: ["tnb", "syabas", "air", "electric", "electricity", "water", "elektrik"],
    accountingReason: "Electricity/water expenses are normally classified as utilities, an operating expense.",
    financialStatementImpact: "OPEX_PNL",
    riskLevel: "LOW",
    explanationText: "Transaksi ini lazimnya direkodkan sebagai perbelanjaan utiliti mengikut amalan perakaunan biasa.",
  },
  {
    id: "RENTAL",
    recommendedCategory: "Rental",
    humanFriendlyName: "Sewa Premis",
    level1Group: "OPERATING_EXPENSES",
    keywords: ["sewa", "rental", "premises rental"],
    accountingReason: "Premises or equipment rental is a recurring operating expense.",
    financialStatementImpact: "OPEX_PNL",
    riskLevel: "LOW",
    explanationText: "Transaksi ini lazimnya direkodkan sebagai perbelanjaan sewa.",
  },
  {
    id: "INTERNET",
    recommendedCategory: "Internet",
    humanFriendlyName: "Bil Internet",
    level1Group: "OPERATING_EXPENSES",
    keywords: ["unifi", "telekom", "tm net", "internet", "broadband"],
    accountingReason: "Internet/broadband connectivity cost is an operating expense.",
    financialStatementImpact: "OPEX_PNL",
    riskLevel: "LOW",
    explanationText: "Transaksi ini lazimnya direkodkan sebagai perbelanjaan internet.",
  },
  {
    id: "TELEPHONE",
    recommendedCategory: "Telephone",
    humanFriendlyName: "Bil Telefon",
    level1Group: "OPERATING_EXPENSES",
    keywords: ["maxis", "celcom", "digi", "telefon", "telephone", "mobile"],
    accountingReason: "Mobile/landline communication cost is an operating expense.",
    financialStatementImpact: "OPEX_PNL",
    riskLevel: "LOW",
    explanationText: "Transaksi ini lazimnya direkodkan sebagai perbelanjaan telefon.",
  },
  {
    id: "FUEL_TRANSPORT",
    recommendedCategory: "Fuel & Transport",
    humanFriendlyName: "Minyak & Pengangkutan",
    level1Group: "OPERATING_EXPENSES",
    keywords: ["petronas", "shell", "bhp", "caltex", "minyak kereta", "tol", "toll", "parking"],
    accountingReason: "Vehicle fuel and transport costs for business use are operating expenses.",
    financialStatementImpact: "OPEX_PNL",
    riskLevel: "LOW",
    explanationText: "Transaksi ini lazimnya direkodkan sebagai perbelanjaan bahan api & pengangkutan.",
  },
  {
    id: "OFFICE_SUPPLIES",
    recommendedCategory: "Office Supplies",
    humanFriendlyName: "Bekalan Pejabat",
    level1Group: "OPERATING_EXPENSES",
    keywords: ["stationery", "alat tulis", "bekalan pejabat", "office supplies"],
    accountingReason: "Consumable supplies (not durable equipment) are operating expenses.",
    financialStatementImpact: "OPEX_PNL",
    riskLevel: "MEDIUM",
    explanationText: "Berisiko keliru dengan Peralatan/Aset Tetap jika item ini sebenarnya tahan lama (durable).",
  },
  {
    id: "MARKETING",
    recommendedCategory: "Marketing",
    humanFriendlyName: "Iklan & Promosi",
    level1Group: "OPERATING_EXPENSES",
    keywords: ["iklan", "ads", "promosi", "marketing", "facebook ads", "advertising"],
    accountingReason: "Advertising/promotion spend is an operating expense.",
    financialStatementImpact: "OPEX_PNL",
    riskLevel: "LOW",
    explanationText: "Transaksi ini lazimnya direkodkan sebagai perbelanjaan pemasaran, tetapi mudah keliru dengan Pendapatan Lain jika ia melibatkan rebat/tajaan.",
  },
  {
    id: "INSURANCE",
    recommendedCategory: "Insurance",
    humanFriendlyName: "Insurans / Takaful",
    level1Group: "OPERATING_EXPENSES",
    keywords: ["insurans", "takaful", "premium", "insurance"],
    accountingReason: "Risk-coverage premiums are operating expenses; multi-period premiums should be prepaid/amortized rather than fully expensed.",
    financialStatementImpact: "OPEX_PNL",
    riskLevel: "MEDIUM",
    explanationText: "Premium dibayar untuk lebih dari satu tempoh perakaunan sepatutnya dibahagikan (prepaid), bukan dibelanjakan sepenuhnya sekali gus.",
  },
  {
    id: "PROFESSIONAL_FEES",
    recommendedCategory: "Professional Fees",
    humanFriendlyName: "Yuran Profesional",
    level1Group: "OPERATING_EXPENSES",
    keywords: ["akauntan", "peguam", "consultant fee", "professional fee", "audit fee"],
    accountingReason: "Accounting, legal and consulting fees are operating expenses.",
    financialStatementImpact: "OPEX_PNL",
    riskLevel: "LOW",
    explanationText: "Transaksi ini lazimnya direkodkan sebagai perbelanjaan yuran profesional.",
  },

  // ──────────────────────────── ASSETS ────────────────────────────
  {
    id: "CASH_BANK",
    recommendedCategory: "Cash & Bank",
    humanFriendlyName: "Tunai & Bank",
    level1Group: "ASSETS",
    keywords: ["tunai", "bank", "cash account", "baki bank", "baki tunai"],
    accountingReason: "Liquid funds held by the business are a balance sheet asset.",
    financialStatementImpact: "BALANCE_SHEET_ASSET",
    riskLevel: "LOW",
    explanationText: "Biasanya betul secara mekanikal kerana datang dari baki akaun, bukan klasifikasi teks bebas.",
  },
  {
    id: "RECEIVABLES",
    recommendedCategory: "Receivables",
    humanFriendlyName: "Wang Belum Terima Dari Pelanggan",
    level1Group: "ASSETS",
    keywords: ["pelanggan berhutang", "invoice belum bayar", "receivable", "belum terima"],
    accountingReason: "Amounts owed to the business by customers are a balance sheet asset until collected.",
    financialStatementImpact: "BALANCE_SHEET_ASSET",
    riskLevel: "MEDIUM",
    explanationText: "Jika direkodkan sebagai Hasil pada masa invois dibuat (bukan Receivable), pendapatan yang diiktiraf akan terlebih nyata sebelum wang sebenar diterima.",
  },
  {
    id: "INVENTORY_ON_HAND",
    recommendedCategory: "Inventory on Hand",
    humanFriendlyName: "Stok Akhir Belum Terjual",
    level1Group: "ASSETS",
    keywords: ["stok akhir", "baki stok", "inventory on hand", "unsold stock"],
    accountingReason: "Unsold stock value at period-end is a balance sheet asset, distinct from stock consumed (Cost of Sales).",
    financialStatementImpact: "BALANCE_SHEET_ASSET",
    riskLevel: "HIGH",
    explanationText: "Mengelirukan 'stok dibeli' (COGS) dengan 'stok masih ada' (Aset) akan menyalahnyatakan kedua-dua Untung Rugi dan Kunci Kira-kira.",
  },
  {
    id: "EQUIPMENT_FIXED_ASSETS",
    recommendedCategory: "Equipment / Fixed Assets",
    humanFriendlyName: "Peralatan / Aset Tetap",
    level1Group: "ASSETS",
    keywords: ["printer", "computer", "laptop", "machine", "equipment", "mesin", "mesin jahit"],
    accountingReason: "Equipment expected to provide benefit beyond one accounting period is normally classified as an asset, not an expense.",
    financialStatementImpact: "BALANCE_SHEET_ASSET",
    riskLevel: "HIGH",
    explanationText: "Merekodkan ini sebagai perbelanjaan boleh menyebabkan perbelanjaan terlebih nyata (overstated) dan aset kurang nyata (understated) dalam penyata kewangan.",
  },

  // ────────────────────────── LIABILITIES ──────────────────────────
  {
    id: "PAYABLES",
    recommendedCategory: "Payables",
    humanFriendlyName: "Hutang Kepada Pembekal",
    level1Group: "LIABILITIES",
    keywords: ["hutang pembekal", "invoice belum bayar", "payable"],
    accountingReason: "Amounts owed to suppliers are a liability, not an expense, until settled.",
    financialStatementImpact: "BALANCE_SHEET_LIABILITY",
    riskLevel: "MEDIUM",
    explanationText: "Merekodkan sebagai perbelanjaan segera boleh mengelirukan masa sebenar obligasi diiktiraf.",
  },
  {
    id: "LOANS",
    recommendedCategory: "Loans",
    humanFriendlyName: "Pinjaman",
    level1Group: "LIABILITIES",
    keywords: ["pinjaman", "loan", "hutang bank"],
    accountingReason: "Borrowed funds with a repayment obligation are a liability.",
    financialStatementImpact: "BALANCE_SHEET_LIABILITY",
    riskLevel: "HIGH",
    explanationText: "Mengelirukan Pinjaman dengan Hasil/Pendapatan Lain akan salah nyata kedua-dua penyata kewangan secara material.",
  },
  {
    id: "ACCRUED_EXPENSES",
    recommendedCategory: "Accrued Expenses",
    humanFriendlyName: "Bil Belum Terima/Diiktiraf",
    level1Group: "LIABILITIES",
    keywords: ["bil belum terima", "accrued", "accrued expense"],
    accountingReason: "Expenses incurred but not yet paid/invoiced are recognized as a liability in the correct period.",
    financialStatementImpact: "BALANCE_SHEET_LIABILITY",
    riskLevel: "MEDIUM",
    explanationText: "Risiko kesilapan masa pengiktirafan perbelanjaan (tertinggal tempoh) jika tidak diakru.",
  },
  {
    id: "COMMITMENTS",
    recommendedCategory: "Financial Commitments",
    humanFriendlyName: "Komitmen Bayaran Berulang",
    level1Group: "LIABILITIES",
    keywords: ["komitmen", "commitment", "kontrak", "subscription", "installment"],
    accountingReason: "Recurring contractual payment obligations (e.g. leases, subscriptions, installments) represent a liability exposure even before each individual installment is due.",
    financialStatementImpact: "BALANCE_SHEET_LIABILITY",
    riskLevel: "MEDIUM",
    explanationText: "Komitmen yang aktif perlu dilihat sebagai obligasi berterusan, bukan sekadar perbelanjaan tunggal setiap kali bayaran dibuat.",
  },

  // ───────────────────────────── EQUITY ─────────────────────────────
  {
    id: "OWNER_CAPITAL",
    recommendedCategory: "Owner's Capital",
    humanFriendlyName: "Modal Pemilik",
    level1Group: "EQUITY",
    keywords: ["modal", "capital injection", "owner capital", "suntikan modal"],
    accountingReason: "Funds the owner injects into the business increase owner's equity, credited to Equity.",
    financialStatementImpact: "BALANCE_SHEET_EQUITY",
    riskLevel: "HIGH",
    explanationText: "Merekodkan ini sebagai Hasil akan palsu meningkatkan pendapatan yang dilaporkan dan mengelirukan kedudukan cukai.",
  },
  {
    id: "RETAINED_EARNINGS",
    recommendedCategory: "Retained Earnings",
    humanFriendlyName: "Untung Terkumpul",
    level1Group: "EQUITY",
    keywords: ["untung terkumpul", "retained earnings", "accumulated profit"],
    accountingReason: "Accumulated profit/loss carried forward; system-calculated via the equity roll-forward, not a transaction category itself.",
    financialStatementImpact: "BALANCE_SHEET_EQUITY",
    riskLevel: "N/A",
    explanationText: "Nilai ini diperoleh (derived) daripada untung/rugi terkumpul, bukan diklasifikasikan secara langsung daripada satu transaksi.",
  },
  {
    id: "DRAWINGS",
    recommendedCategory: "Drawings",
    humanFriendlyName: "Pengeluaran Peribadi Pemilik",
    level1Group: "EQUITY",
    keywords: ["ambil duit guna sendiri", "owner drawing", "drawing"],
    accountingReason: "Funds withdrawn by the owner for personal use reduce owner's equity, not business expense.",
    financialStatementImpact: "BALANCE_SHEET_EQUITY",
    riskLevel: "HIGH",
    explanationText: "Merekodkan ini sebagai perbelanjaan akan salah-kurangkan untung yang dilaporkan.",
  },
];

const RULE_BY_ID: Record<CanonicalCategory, AccountingRule> = ACCOUNTING_KNOWLEDGE_BASE.reduce(
  (acc, rule) => { acc[rule.id] = rule; return acc; },
  {} as Record<CanonicalCategory, AccountingRule>
);

// Curated high-confusion pairs: explicitly flagged HIGH_RISK_MISMATCH even though
// they don't cross the Assets boundary (the universal HIGH-risk rule below).
// These are highly-recognizable, branded/fixed-vendor categories that should
// essentially never be confused with each other.
const HIGH_RISK_PAIRS: Array<[CanonicalCategory, CanonicalCategory]> = [
  ["UTILITIES", "FUEL_TRANSPORT"],
  ["UTILITIES", "INTERNET"],
  ["UTILITIES", "TELEPHONE"],
  ["INTERNET", "TELEPHONE"],
  ["SALES_REVENUE", "OTHER_INCOME"],
  ["OWNER_CAPITAL", "SALES_REVENUE"],
  ["INVENTORY_STOCK", "INVENTORY_ON_HAND"],
];

function isHighRiskPair(a: CanonicalCategory, b: CanonicalCategory): boolean {
  return HIGH_RISK_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

/** Free-text category label -> canonical category, via direct label match or keyword match. */
export function normalizeToCanonical(freeText: string | null | undefined): CanonicalCategory | null {
  if (!freeText) return null;
  const t = normalize(freeText);
  for (const rule of ACCOUNTING_KNOWLEDGE_BASE) {
    if (normalize(rule.recommendedCategory) === t || rule.id.toLowerCase() === t.replace(/\s+/g, "_")) {
      return rule.id;
    }
  }
  for (const rule of ACCOUNTING_KNOWLEDGE_BASE) {
    if (rule.keywords.some(kw => t.includes(normalize(kw)))) return rule.id;
  }
  return null;
}

/** Match the rule whose keywords best match the given vendor/description text. */
export function matchAccountingRule(text: string | null | undefined): AccountingRule | null {
  if (!text) return null;
  const t = normalize(text);
  for (const rule of ACCOUNTING_KNOWLEDGE_BASE) {
    if (rule.keywords.some(kw => t.includes(normalize(kw)))) return rule;
  }
  return null;
}

export interface AccountingSuggestionEvaluation {
  recommendedCategory: string;
  recommendedCanonicalCategory: CanonicalCategory;
  level1Group: FinancialStatementGroup;
  accountingReason: string;
  financialStatementImpact: FinancialStatementImpact;
  riskLevel: RiskLevel;
  explanationText: string;
  matchStatus: MatchStatus;
  accountingConfidence: number;
}

/**
 * Input: the AI suggestion's user/AI-chosen category text plus the
 * vendor/description text used to look up the accounting rule.
 * Output: the full Accounting Knowledge Base evaluation, or null if no
 * rule matches the vendor/description (layer stays silent — never invent
 * a category from nothing).
 */
export function evaluateAccountingSuggestion(
  chosenCategoryText: string | null | undefined,
  lookupText: string | null | undefined
): AccountingSuggestionEvaluation | null {
  const rule = matchAccountingRule(lookupText) || matchAccountingRule(chosenCategoryText);
  if (!rule) return null;

  const chosenCanonical = normalizeToCanonical(chosenCategoryText);

  let matchStatus: MatchStatus;
  let accountingConfidence: number;
  if (chosenCanonical === rule.id) {
    matchStatus = "MATCH";
    accountingConfidence = 0.9;
  } else {
    const isAssetBoundary =
      (rule.id === "EQUIPMENT_FIXED_ASSETS" && chosenCanonical !== "EQUIPMENT_FIXED_ASSETS") ||
      (chosenCanonical === "EQUIPMENT_FIXED_ASSETS" && rule.id !== "EQUIPMENT_FIXED_ASSETS");
    const isCuratedHighRisk = chosenCanonical !== null && isHighRiskPair(rule.id, chosenCanonical);
    matchStatus = isAssetBoundary || isCuratedHighRisk ? "HIGH_RISK_MISMATCH" : "POSSIBLE_MISMATCH";
    accountingConfidence = chosenCanonical ? 0.7 : 0.5;
  }

  return {
    recommendedCategory: rule.recommendedCategory,
    recommendedCanonicalCategory: rule.id,
    level1Group: rule.level1Group,
    accountingReason: rule.accountingReason,
    financialStatementImpact: rule.financialStatementImpact,
    riskLevel: rule.riskLevel,
    explanationText: rule.explanationText,
    matchStatus,
    accountingConfidence,
  };
}

export function getRuleById(id: CanonicalCategory): AccountingRule {
  return RULE_BY_ID[id];
}
