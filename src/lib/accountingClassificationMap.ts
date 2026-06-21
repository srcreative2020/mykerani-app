// MyKerani — Accounting Knowledge Base V1 (Phase 1 implementation)
//
// Source of truth: MYKERANI_ACCOUNTING_KNOWLEDGE_BASE_V1.md and
// MYKERANI_FINANCIAL_CLASSIFICATION_MASTER_FRAMEWORK.md.
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
  | "INVENTORY_STOCK"
  | "UTILITIES"
  | "RENTAL"
  | "INTERNET"
  | "TELEPHONE"
  | "FUEL_TRANSPORT"
  | "OFFICE_SUPPLIES"
  | "EQUIPMENT_FIXED_ASSETS"
  | "PAYABLES"
  | "LOANS"
  | "DRAWINGS";

export type MatchStatus = "MATCH" | "POSSIBLE_MISMATCH" | "HIGH_RISK_MISMATCH";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type FinancialStatementImpact =
  | "COGS_PNL"
  | "OPEX_PNL"
  | "BALANCE_SHEET_ASSET"
  | "BALANCE_SHEET_LIABILITY"
  | "BALANCE_SHEET_EQUITY";

export interface AccountingRule {
  id: CanonicalCategory;
  recommendedCategory: string; // display label
  level1Group: FinancialStatementGroup;
  keywords: string[];
  accountingReason: string;
  financialStatementImpact: FinancialStatementImpact;
  riskLevel: RiskLevel;
  explanationText: string;
}

export const ACCOUNTING_KNOWLEDGE_BASE: AccountingRule[] = [
  {
    id: "INVENTORY_STOCK",
    recommendedCategory: "Inventory / Stock",
    level1Group: "COST_OF_SALES",
    keywords: ["ayam", "ikan", "sayur", "tepung", "minyak masak", "beras", "stok", "stock", "pembelian stok"],
    accountingReason: "Goods purchased for resale or as production input are recorded as Cost of Sales, not a generic operating expense.",
    financialStatementImpact: "COGS_PNL",
    riskLevel: "MEDIUM",
    explanationText: "Merekodkan ini sebagai perbelanjaan operasi biasa boleh menjejaskan pengiraan Untung Kasar (Gross Profit) yang tepat.",
  },
  {
    id: "UTILITIES",
    recommendedCategory: "Utilities",
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
    level1Group: "OPERATING_EXPENSES",
    keywords: ["stationery", "alat tulis", "bekalan pejabat", "office supplies"],
    accountingReason: "Consumable supplies (not durable equipment) are operating expenses.",
    financialStatementImpact: "OPEX_PNL",
    riskLevel: "MEDIUM",
    explanationText: "Berisiko keliru dengan Peralatan/Aset Tetap jika item ini sebenarnya tahan lama (durable).",
  },
  {
    id: "EQUIPMENT_FIXED_ASSETS",
    recommendedCategory: "Equipment / Fixed Assets",
    level1Group: "ASSETS",
    keywords: ["printer", "computer", "laptop", "machine", "equipment", "mesin", "mesin jahit"],
    accountingReason: "Equipment expected to provide benefit beyond one accounting period is normally classified as an asset, not an expense.",
    financialStatementImpact: "BALANCE_SHEET_ASSET",
    riskLevel: "HIGH",
    explanationText: "Merekodkan ini sebagai perbelanjaan boleh menyebabkan perbelanjaan terlebih nyata (overstated) dan aset kurang nyata (understated) dalam penyata kewangan.",
  },
  {
    id: "PAYABLES",
    recommendedCategory: "Payables",
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
    level1Group: "LIABILITIES",
    keywords: ["pinjaman", "loan", "hutang bank"],
    accountingReason: "Borrowed funds with a repayment obligation are a liability.",
    financialStatementImpact: "BALANCE_SHEET_LIABILITY",
    riskLevel: "HIGH",
    explanationText: "Mengelirukan Pinjaman dengan Hasil/Pendapatan Lain akan salah nyata kedua-dua penyata kewangan secara material.",
  },
  {
    id: "DRAWINGS",
    recommendedCategory: "Drawings",
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
