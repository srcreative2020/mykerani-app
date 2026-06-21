# MyKerani — Financial Classification Master Framework

**Status:** Design only — the canonical 3-level classification structure every current and future MyKerani module must align to. No code, schema, or prompt changes made.
**File path:** `/home/user/mykerani-app/MYKERANI_FINANCIAL_CLASSIFICATION_MASTER_FRAMEWORK.md`
**Grounding:** This framework is not invented in a vacuum — it extends the `ledger_category_type` enum that already exists live in `general_ledger_categories` (`ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE` — `supabase/migrations/20260601000000_core_architecture_foundation.sql:152-153`). Level 1 below splits `EXPENSE` into **Cost of Sales** and **Operating Expenses**, since that distinction already implicitly exists in this project (the Accounting Knowledge Base blueprint's `COGS_PNL` vs `OPEX_PNL` impact types) but has no Level-1 home yet — this framework gives it one.

---

## Purpose

A **single, shared classification taxonomy** that every module references instead of defining its own categories independently. Today, category names are produced ad hoc per module (the AI's free-text `category` field, the Knowledge Bank's `suggested_category`, `general_ledger_categories.name`, the Accounting Knowledge Base's `recommendedCategory`) with no single source of truth tying them together. This framework is that source of truth — not a new system, a shared reference structure existing and future systems map onto.

**Consumers of this framework** (per the user's list): AI Classification, Accounting Knowledge Base, Situation Bank, OCR Learning, Reports, P&L, Balance Sheet, Cash Flow, Financial Health Analysis, future LHDN Mapping.

---

## Level 1 — Financial Statement Group

The top-level bucket every category must roll up into. Six groups, extending the existing 5-value enum by splitting Expense:

| Group | Statement | Aligns to existing enum value |
|---|---|---|
| Revenue | Profit & Loss | `REVENUE` |
| Cost of Sales | Profit & Loss (above Gross Profit line) | `EXPENSE` (subset) |
| Operating Expenses | Profit & Loss (below Gross Profit line) | `EXPENSE` (subset) |
| Assets | Balance Sheet | `ASSET` |
| Liabilities | Balance Sheet | `LIABILITY` |
| Equity | Balance Sheet | `EQUITY` |

This split is the one structural addition this framework makes to the existing live enum — every other category in Levels 2–3 nests under one of these six, with no seventh group ever needed.

---

## Level 2 — Financial Categories (per Group)

| Financial Statement Group | Categories |
|---|---|
| Revenue | Sales Revenue, Service Revenue, Other Income |
| Cost of Sales | Inventory / Stock, Direct Labour, Raw Materials |
| Operating Expenses | Utilities, Rental, Internet, Telephone, Marketing, Insurance, Fuel & Transport, Office Supplies, Professional Fees |
| Assets | Cash & Bank, Receivables, Equipment / Fixed Assets, Inventory on Hand |
| Liabilities | Payables, Loans, Accrued Expenses |
| Equity | Owner's Capital, Retained Earnings, Drawings |

This list is intentionally a superset of the examples already shown in the Accounting Knowledge Base blueprint (Utilities, Telecommunication→split into Internet/Telephone, Fuel & Transport, Inventory/Stock, Rental, Assets) — that blueprint's 6 example categories all map cleanly onto Level 2 entries here, confirming the two designs are compatible without rework.

---

## Level 3 — Accounting Knowledge Rules (Keyword → Category)

Each Level-3 rule is a keyword set resolving to exactly one Level-2 category, which in turn rolls up to exactly one Level-1 group. This is the same shape already proposed in the Accounting Knowledge Base blueprint's `AccountingRule` records — this framework formalizes it as the canonical source those rules must be authored against, rather than a separate ad hoc list.

```
TNB, SYABAS, Air, Electric, Electricity, Water  → Utilities
Maxis, Celcom, Digi                              → Telephone
Unifi, Telekom, TM Net                           → Internet
Petronas, Shell, BHP, Caltex                     → Fuel & Transport
Ayam, Ikan, Sayur, Tepung, Minyak Masak, Beras    → Inventory / Stock
Sewa, Rental, Premises Rental                    → Rental
Printer, Computer, Laptop, Machine, Equipment    → Equipment / Fixed Assets
```

---

## Full Category Specification

Every Level-2 category below carries the 6 required fields. This is the complete, ready-to-author reference table every module's category data should be checked against.

### Revenue Group

| Category Name | Financial Statement Group | Accounting Purpose | Standard Accounting Treatment | Common Keywords | Risk Level if Misclassified |
|---|---|---|---|---|---|
| Sales Revenue | Revenue | Records income from core goods/services sold | Credit to P&L Revenue | jualan, sales, terima bayaran pelanggan | HIGH — misclassifying revenue as another income type distorts gross margin and tax reporting |
| Service Revenue | Revenue | Records income from services rendered (vs. goods sold) | Credit to P&L Revenue | yuran, fee, perkhidmatan, consulting | MEDIUM — usually still lands in Revenue, but blending with Sales Revenue obscures product vs. service mix |
| Other Income | Revenue | Non-core, incidental income (e.g. interest, asset disposal gain) | Credit to P&L, separate line from operating revenue | faedah, interest, jual aset lama | MEDIUM — inflates apparent core revenue if merged with Sales Revenue |

### Cost of Sales Group

| Category Name | Financial Statement Group | Accounting Purpose | Standard Accounting Treatment | Common Keywords | Risk Level if Misclassified |
|---|---|---|---|---|---|
| Inventory / Stock | Cost of Sales | Cost of goods purchased for resale or production input | Debit to COGS (P&L, above Gross Profit) | ayam, ikan, sayur, tepung, minyak masak, beras, stok | HIGH — recording as Operating Expense instead of COGS overstates Gross Profit, misleading margin analysis |
| Direct Labour | Cost of Sales | Wages directly tied to producing goods/services sold | Debit to COGS | upah pekerja kilang, buruh langsung | MEDIUM — if recorded as general Operating Expense, understates true cost of production |
| Raw Materials | Cost of Sales | Unprocessed inputs consumed in production | Debit to COGS | bahan mentah, raw material | HIGH — same Gross Profit distortion risk as Inventory/Stock |

### Operating Expenses Group

| Category Name | Financial Statement Group | Accounting Purpose | Standard Accounting Treatment | Common Keywords | Risk Level if Misclassified |
|---|---|---|---|---|---|
| Utilities | Operating Expenses | Electricity/water consumption for running the business | Debit to Operating Expenses (P&L) | TNB, SYABAS, Air, Electric, Electricity, Water, elektrik | LOW — almost always correctly an opex; risk is only mild line-item confusion |
| Rental | Operating Expenses | Premises/equipment rental cost | Debit to Operating Expenses (P&L) | sewa, rental, premises rental | LOW — straightforward opex, minor risk |
| Internet | Operating Expenses | Internet/broadband connectivity cost | Debit to Operating Expenses (P&L) | Unifi, Telekom, TM Net | LOW — straightforward opex |
| Telephone | Operating Expenses | Mobile/landline communication cost | Debit to Operating Expenses (P&L) | Maxis, Celcom, Digi | LOW — straightforward opex |
| Marketing | Operating Expenses | Advertising/promotion spend | Debit to Operating Expenses (P&L) | iklan, ads, promosi, marketing | LOW — straightforward opex, but easily conflated with Other Income if a sponsorship/rebate is involved |
| Insurance | Operating Expenses | Risk-coverage premiums (not the claim itself) | Debit to Operating Expenses (P&L), prepaid portion to Balance Sheet if multi-period | insurans, takaful, premium | MEDIUM — multi-year premiums paid upfront should be prepaid/amortized, not fully expensed in one period |
| Fuel & Transport | Operating Expenses | Vehicle fuel and transport cost for business use | Debit to Operating Expenses (P&L) | Petronas, Shell, BHP, Caltex, tol, parking | LOW–MEDIUM — risk rises if the vehicle is personal-use and gets expensed to the business (ownership misclassification, not category misclassification per se) |
| Office Supplies | Operating Expenses | Consumable supplies, not durable equipment | Debit to Operating Expenses (P&L) | stationery, alat tulis, bekalan pejabat | MEDIUM — risk of confusion with Equipment/Fixed Assets for borderline durable items |
| Professional Fees | Operating Expenses | Accounting, legal, consulting fees | Debit to Operating Expenses (P&L) | akauntan, peguam, consultant fee | LOW — straightforward opex |

### Assets Group

| Category Name | Financial Statement Group | Accounting Purpose | Standard Accounting Treatment | Common Keywords | Risk Level if Misclassified |
|---|---|---|---|---|---|
| Cash & Bank | Assets | Liquid funds held by the business | Debit to Balance Sheet Asset | tunai, bank, cash account | LOW — usually mechanically correct since these come from account balances, not free-text classification |
| Receivables | Assets | Amounts owed to the business by customers | Debit to Balance Sheet Asset | pelanggan berhutang, invoice belum bayar | MEDIUM — if recorded as Revenue at invoice time instead of Receivable, overstates realized income before cash/settlement |
| Equipment / Fixed Assets | Assets | Durable items providing benefit beyond one accounting period | Debit to Balance Sheet Asset, depreciated over useful life | printer, computer, laptop, machine, equipment, mesin | HIGH — recording as an Operating Expense overstates expenses and understates assets in the same period, and skips depreciation entirely |
| Inventory on Hand | Assets | Unsold stock value at period-end | Debit to Balance Sheet Asset (distinct from Cost of Sales, which is stock *consumed*) | stok akhir, baki stok | HIGH — conflating "stock purchased" (COGS) with "stock still on hand" (Asset) misstates both P&L and Balance Sheet |

### Liabilities Group

| Category Name | Financial Statement Group | Accounting Purpose | Standard Accounting Treatment | Common Keywords | Risk Level if Misclassified |
|---|---|---|---|---|---|
| Payables | Liabilities | Amounts the business owes to suppliers | Credit to Balance Sheet Liability | hutang pembekal, invoice belum bayar (kepada kami) | MEDIUM — if recorded as an immediate Expense instead of a Payable, expenses are recognized before the obligation is properly tracked |
| Loans | Liabilities | Borrowed funds with repayment obligation | Credit to Balance Sheet Liability | pinjaman, loan, hutang bank | HIGH — confusing a Loan (liability) with Revenue/Other Income would materially misstate both statements |
| Accrued Expenses | Liabilities | Expenses incurred but not yet paid/invoiced | Credit to Balance Sheet Liability | bil belum terima, accrued | MEDIUM — risk of expense recognition timing errors (missed period) |

### Equity Group

| Category Name | Financial Statement Group | Accounting Purpose | Standard Accounting Treatment | Common Keywords | Risk Level if Misclassified |
|---|---|---|---|---|---|
| Owner's Capital | Equity | Funds the owner injects into the business | Credit to Equity | modal, capital injection | HIGH — recording as Revenue would falsely inflate income and distort tax position |
| Retained Earnings | Equity | Accumulated profit/loss carried forward | Equity roll-forward, not a transaction category itself | (system-calculated, not user-entered) | N/A — derived, not directly classified from a transaction |
| Drawings | Equity | Funds the owner withdraws for personal use | Debit to Equity (reduces owner's equity) | ambil duit guna sendiri, owner drawing | HIGH — recording as an Expense would falsely reduce reported profit, the same risk class already identified for OWNER_TRANSACTION in the existing AI flow |

---

## How Existing/Planned Modules Map onto This Framework

| Module | Mapping |
|---|---|
| **AI Classification** (`server.ts` system prompt) | The AI's free-text `category` output should be validated/normalized against Level 2 category names, with Level 1 group derivable automatically — removes ambiguity between e.g. "Pembelian Stok" and "Stok / Inventori" by having one canonical Level-2 name with synonyms as Level-3 keywords, not two competing labels. |
| **Accounting Knowledge Base** (prior blueprint) | Its `AccountingRule.recommendedCategory` becomes a Level-2 category name; its `financialStatementImpact` enum (`OPEX_PNL`/`COGS_PNL`/`BALANCE_SHEET_ASSET`/`BALANCE_SHEET_LIABILITY`) is a direct re-expression of this framework's Level 1 groups — the two designs are already structurally compatible, this framework just gives the Level 1/2 split a canonical name. |
| **Situation Bank** (`knowledge_bank_scenarios`) | `suggested_category` field should resolve to a Level-2 category name; `category` field (INDIVIDUAL/MICRO_BUSINESS/SME/etc.) remains a separate, orthogonal "tenant profile type" dimension, not part of this financial taxonomy — no conflict. |
| **OCR Learning** (`ocr_learned_patterns`) | `category` field should resolve to a Level-2 name, same as AI Classification — since OCR-learned categories currently come from whatever free-text category the user/AI used at confirmation time, aligning both to this framework prevents the same vendor accumulating different category spellings over repeated confirmations. |
| **Reports / P&L / Balance Sheet / Cash Flow** | These are exactly Level 1 groups (P&L = Revenue + Cost of Sales + Operating Expenses; Balance Sheet = Assets + Liabilities + Equity) — this framework *is* the report structure, not a separate mapping exercise. Cash Flow specifically would need to further classify Level 1 movements into Operating/Investing/Financing activities — a 4th, cash-flow-specific dimension layered on top of, not replacing, this framework. |
| **Financial Health Analysis** | Ratios (e.g. expense ratio, gross margin) are computed directly from Level 1 group totals — Gross Profit = Revenue − Cost of Sales, Operating Profit = Gross Profit − Operating Expenses — so correct Level 1 assignment (especially the Cost of Sales vs. Operating Expenses split) is a direct precondition for correct ratios. |
| **Future LHDN Mapping** | Malaysian tax categories (e.g. capital allowance for Fixed Assets, deductible vs. non-deductible expenses) attach most naturally at the Level 2 category level, with Level 1 group as the first filter (only Operating Expenses/Cost of Sales categories are tax-deductible expense candidates; Assets follow capital allowance rules instead) — this framework gives LHDN mapping a stable target without needing its own separate category list. |

---

## Governing Principle

**One category, one Level-2 name, one Level-1 group — every module references this table, none invents its own.** Where a module currently has a free-text or independently-defined category field (AI's `category` output, `ocr_learned_patterns.category`, `knowledge_bank_scenarios.suggested_category`), the long-term direction is for that field's *value space* to be constrained to this framework's Level-2 names, not for this framework to be rebuilt per module. This is what makes Reports, P&L, Balance Sheet, and Financial Health Analysis computable at all without per-report category-reconciliation logic — they all read the same taxonomy.

---

**Report metadata:** file path `/home/user/mykerani-app/MYKERANI_FINANCIAL_CLASSIFICATION_MASTER_FRAMEWORK.md`. Design only — no code, schema, or prompt was changed while producing this report. Grounded against the live `ledger_category_type` enum and the Accounting Knowledge Base blueprint's `financialStatementImpact` enum to confirm structural compatibility with what already exists.
