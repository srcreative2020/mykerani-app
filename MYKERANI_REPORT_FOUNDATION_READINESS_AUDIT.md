# MyKerani — Report Foundation Readiness Audit

**Status:** Audit only. No code changed.
**File path:** `/home/user/mykerani-app/MYKERANI_REPORT_FOUNDATION_READINESS_AUDIT.md`
**Objective:** Verify whether MyKerani can generate valid Profit & Loss, Balance Sheet, and Cash Flow reports from its current live data structures and classifications — a report-foundation trace, not a UI/AI/dashboard audit.
**Method:** Direct code trace of `src/components/FinancialReportsAnalytics.tsx`, `src/lib/financialService.ts`, `src/lib/accountingClassificationMap.ts`, `src/context/FinancialRecordsContext.tsx`, `src/lib/assetOwnerData.ts`, `src/types.ts`, and the Supabase schema. File:line citations throughout.

---

## SECTION A — PROFIT & LOSS READINESS

**Critical finding: no P&L statement is generated anywhere in the codebase today.** `FinancialReportsAnalytics.tsx` implements 8 report types — `summary`, `cashflow`, `receivables_aging`, `payables_aging`, `commitments`, `health`, `tax_readiness`, `bank_readiness` — and none of them is a P&L / Income Statement.

| # | Item | Verdict | Source fields |
|---|---|---|---|
| 1 | Revenue | **WARNING** | `financialEvents.filter(e => e.type === "INCOME")` (`FinancialReportsAnalytics.tsx:~100`) — a raw sum exists, but no Sales Revenue / Service Revenue / Other Income split. All income is one undifferentiated bucket keyed only on `FinancialEvent.type`, never on `categoryName` or a canonical Revenue category (none exist in `accountingClassificationMap.ts` — 0 of 3 Revenue categories in the Master Framework are implemented). |
| 2 | Cost of Sales | **FAIL** | No code anywhere sums EXPENSE records where the category resolves to `level1Group: "COST_OF_SALES"`. `level1Group` exists only in `accountingClassificationMap.ts` (e.g. `INVENTORY_STOCK` → `COST_OF_SALES`) and is computed in `server.ts` purely for the AI chat-suggestion banner — it is never read by any report-generation code. `expense_records.category_id` resolves only to `general_ledger_categories.type` (ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE), which has no COGS/OpEx distinction at all. |
| 3 | Operating Expenses | **FAIL** | Same root cause as #2 — all EXPENSE records are lumped into one "Jumlah Perbelanjaan" total (`FinancialReportsAnalytics.tsx:~572`) with no COGS exclusion, because no report code ever resolves `categoryName` to `level1Group`. |
| 4 | Gross Profit | **FAIL** | Requires Revenue − COGS. COGS is not computed (#2), so Gross Profit cannot be computed. No `grossProfit` field/calculation exists anywhere outside the unused knowledge-base data. |
| 5 | Net Profit | **WARNING** | `financialService.ts:~158-165` computes `netBalance = totalIncome - totalExpense` — a flat cash-position-style net figure exists, but it is not a P&L Net Profit (no COGS/OpEx structure underneath it, no accrual treatment beyond the `isCompleted` flag, and it is never labeled or surfaced as "Net Profit" in any report). |

**Bottom line:** today's reports can show a total income figure and a total expense figure. They cannot show Cost of Sales, Operating Expenses as a distinct line, Gross Profit, or a properly structured Net Profit. The data needed to build it (`level1Group` per category) already exists in `accountingClassificationMap.ts` but is disconnected from the report layer entirely — it is wired only into the AI chat-suggestion banner in `server.ts`.

---

## SECTION B — BALANCE SHEET READINESS

| Item | Verdict | Source fields |
|---|---|---|
| **Cash** | **PASS** | `cash_accounts` table / `CashAccount` context array, field `currentBalanceMyr`. Actively recalculated on every `isCompleted` transaction via `cashAccountId` (`FinancialRecordsContext.tsx:774-793`) — a true running balance, not a static seed value. |
| **Bank** | **PASS** | `bank_accounts` table / `BankAccount` context array, field `currentBalanceMyr`. Same running-balance mechanism, keyed on `bankAccountId` (`FinancialRecordsContext.tsx:786-792`). |
| **Receivables** | **WARNING** | `receivables` table / `FinancialEvent` type RECEIVABLE. Fields: `total_amount_myr`, `paid_amount_myr`, `status`. Outstanding balance is derivable (`total − paid`) but no code anywhere actually computes a consolidated outstanding-receivables figure or aging buckets beyond the dedicated `receivables_aging` report's own ad hoc logic — there is no shared, reusable "AR balance" function. |
| **Inventory** | **FAIL** | No Inventory-on-Hand asset table or balance exists anywhere in the codebase. The only "Inventory / Stock" reference is `accountingClassificationMap.ts:54-61`, which classifies it as a **Cost of Sales P&L category** (`financialStatementImpact: "COGS_PNL"`) — i.e. an expense, not a balance-sheet asset. There is no way to report "stock on hand" today. |
| **Fixed Assets** | **WARNING** | `asset_purchases` table / `AssetPurchase[]` via `src/lib/assetOwnerData.ts` (`addAssetPurchase`). Fields: `asset_name`, `category`, `purchase_amount_myr`, `purchase_date`, `vendor_name`. A flat purchase list exists, but there is no `accumulated_depreciation` field and no depreciation schedule/calculation anywhere (zero matches for "depreciation" in the repo) — a Fixed Assets line could only ever show gross purchase cost, never net book value. |
| **Payables** | **WARNING** | `payables` table / `FinancialEvent` type PAYABLE. Same structure and same gap as Receivables — `total_amount_myr − paid_amount_myr` is derivable per row but no consolidated AP balance function exists. |
| **Debt** | **PASS** | `debts` table / `DebtRecord[]`, field `outstanding_balance_myr`, explicitly computed as `principal_amount_myr − repaidAmountMyr` on create/update (`FinancialRecordsContext.tsx:1182`, `~1222`). A true running balance. |
| **Commitments** | **WARNING** | `financial_commitments` table / `FinancialCommitment[]`. This is a recurring-obligation forecasting tool (used for monthly-burn-rate solvency scoring), not a Balance Sheet liability in the conventional sense — it has no "outstanding obligation value" the way Payables/Debt do, so it cannot be dropped into a Balance Sheet liabilities section as-is without re-purposing. |
| **Owner Capital** | **FAIL** | `owner_transactions` table / `OwnerTransaction[]` via `assetOwnerData.ts` (`addOwnerTransaction`, types `CAPITAL_INJECTION`/`DRAWING`). Only a transaction log exists — no code sums injections minus drawings into a running Owner's Capital balance anywhere. |
| **Retained Earnings** | **FAIL** | Concept does not exist in the codebase at all (zero matches for "retained earnings"). No code accumulates Net Profit across periods into an equity balance — and since Net Profit itself isn't properly computed (Section A), there is nothing to accumulate yet either. |

**Bottom line:** Cash, Bank, and Debt are genuinely Balance-Sheet-ready today (real running balances). Receivables, Payables, Fixed Assets, and Commitments exist as raw/derivable data but need a consolidation calculation layer. Inventory, Owner's Capital, and Retained Earnings do not exist as computable Balance Sheet figures at all.

---

## SECTION C — CASH FLOW READINESS

| Item | Verdict | Notes |
|---|---|---|
| **Operating Cash Flow** | **WARNING** | `FinancialReportsAnalytics.tsx`'s "cashflow" report filters `financialEvents` by `isCompleted` (cash-basis distinction genuinely exists via the `isCompleted` flag, `types.ts:101`) into completed inflows/outflows — but **every** completed transaction is hardcoded as an "OPERATING INFLOW"/"OPERATING OUTFLOW" (`FinancialReportsAnalytics.tsx:~1022`) regardless of its real nature. So an Operating Cash Flow total exists, but it is contaminated by Investing/Financing transactions that should be excluded from it. |
| **Investing Cash Flow** | **FAIL** | No classification exists. Asset purchases (`asset_purchases` table, the textbook Investing Activity) are tracked entirely separately from `financialEvents` and are **never loaded into `FinancialReportsAnalytics.tsx` at all** (its data dependencies are `financialEvents, cashAccounts, bankAccounts, debtRecords, financialCommitments, financialEvidencePackages` — no `assetPurchases`). An Investing Cash Flow section cannot be built without first wiring that data in. |
| **Financing Cash Flow** | **FAIL** | Same gap — `owner_transactions` (CAPITAL_INJECTION/DRAWING, the textbook Financing Activity) and debt drawdowns/repayments are likewise never loaded into the reports component and never classified as Financing. |

**Bottom line:** the cash-basis foundation (`isCompleted`) is real and usable, but there is no Operating/Investing/Financing classification anywhere — every completed transaction is currently miscategorized as Operating by default, and the two real Investing/Financing data sources that exist (asset purchases, owner transactions) are completely disconnected from the reports layer.

---

## SECTION D — EVIDENCE PACKAGE READINESS

| Item | Verdict | Trace |
|---|---|---|
| **Linkage fields exist** | **PASS** | `FinancialEvidencePackage.relatedRecordType`/`relatedRecordId` (`types.ts:162-163`), persisted as `related_record_type`/`related_record_id` (`FinancialRecordsContext.tsx:1446-1447`). |
| **Transaction → Evidence drill-down** | **WARNING** | `FinancialEvidencePackage.tsx:402-437`'s `getLinkedRecordDetails()` resolves a single evidence package to its linked record, and the screen supports an ALL/LINKED/UNLINKED filter (`~492-509`). This works as a standalone Evidence Manager screen, but it is a one-way lookup (pick an evidence package → see its record), not a "select this transaction → see its evidence" entry point from within a report or the transaction list itself. |
| **Receipt/Invoice/Bank Statement/Supporting Document drill-down from a REPORT line item** | **FAIL** | `FinancialReportsAnalytics.tsx` only uses evidence linkage for a binary `hasEvidence` flag inside the `tax_readiness` score (`~line 289`) — there is no click-through/expand interaction anywhere in the reports screen that lets a user drill from a report total into the underlying transactions, let alone from a transaction into its receipt/invoice/bank-statement evidence. |
| **Report line item → underlying transactions** | **FAIL** | No drill-down exists. The "cashflow" report renders a flat transaction table with no grouping/expand-by-category interaction (`~1015-1031`) — a category subtotal cannot be expanded to show the rows that sum to it. |

**Bottom line:** the data model fully supports record↔evidence linkage (and, after this session's prior fix, Staff-originated chat transactions now populate it correctly too — see `MYKERANI_DATA_FLOW_FIX_VALIDATION.md`). But no report screen exposes that linkage as a drill-down. Today's evidence linkage is browsable only from the standalone Evidence Manager, not from any report.

---

## SECTION E — CATEGORY MAPPING AUDIT

**Trace: Financial Event → Level 2 Category → Level 1 Group → Report Line Item**

1. **Financial Event → Level 2 Category — BROKEN LINK.** A transaction's `categoryName` is free text, stored and resolved to a database row via `getOrCreateCategoryId()` (`FinancialRecordsContext.tsx:303-344`) using an **exact, case-sensitive, untrimmed string match** (`.eq("name", name)`, `~line 318`). Any new string spawns a brand-new `general_ledger_categories` row with no validation against the 11 canonical categories in `accountingClassificationMap.ts`. "Office Supplies", "office supplies", and "Bekalan Pejabat" would each create separate, unrelated rows.
2. **Level 2 Category → Level 1 Group — NEVER RESOLVED IN REPORTS.** `accountingClassificationMap.ts`'s `normalizeToCanonical()`/`level1Group` is imported nowhere in `FinancialReportsAnalytics.tsx` or `financialService.ts`. It is wired into exactly one place: the AI chat-suggestion accounting banner in `server.ts`. For reporting purposes, it is effectively dead code.
3. **Level 1 Group → Report Line Item — DOES NOT EXIST**, since step 2 never happens. Reports group purely by `FinancialEvent.type` (INCOME/EXPENSE/RECEIVABLE/PAYABLE/DEBT), never by resolved Level 1 Group.

**Categories that do not map / map incorrectly / create ambiguity:**
- **Do not map at all:** Sales Revenue, Service Revenue, Other Income, Direct Labour, Raw Materials, Marketing, Insurance, Professional Fees, Accrued Expenses, Cash & Bank (as a Level 2 category), Receivables (as a Level 2 category), Inventory on Hand, Owner's Capital, Retained Earnings — 14 of the Master Framework's ~24 Level-2 categories have no corresponding entry in `accountingClassificationMap.ts`. Only 11 of ~24 are implemented (Inventory/Stock, Utilities, Rental, Internet, Telephone, Fuel & Transport, Office Supplies, Equipment/Fixed Assets, Payables, Loans, Drawings).
- **Create ambiguity:** any free-text category that happens to share vocabulary with a different canonical category's keywords (the exact contamination class of bug already found and fixed in `MYKERANI_ACCOUNTING_KNOWLEDGE_BASE_V1_FIX_VALIDATION.md` for the AI-suggestion path) — that fix only protects the chat-confirmation banner, not report generation, since report generation never calls the matcher at all.
- **Map incorrectly:** none found mapping to the *wrong* canonical category among the 11 that exist — the risk here is entirely about the 14 missing categories and the case/language duplication in step 1, not misclassification within the implemented set.

**Verdict: if a P&L/Balance Sheet were built today by grouping `financialEvents` and rolling up to Level 1 groups, it would fail outright** — the rollup step doesn't exist in any report code, and even if added, would immediately hit missing Revenue/Asset/Equity categories and uncontrolled category-name duplication.

---

## SECTION F — USER REPORT LAYER

Recommended human-friendly question → accounting report name pairings, so a non-accountant user never needs to know the technical term:

| Human-Friendly Question (Bahasa Malaysia) | Accounting Report Name |
|---|---|
| "Berapa untung saya?" | Profit & Loss Statement |
| "Berapa harta saya?" | Balance Sheet |
| "Ke mana duit saya pergi?" / "Berapa wang masuk dan keluar?" | Cash Flow Statement |
| "Siapa belum bayar saya?" | Receivables Aging Report |
| "Apa yang saya kena bayar?" | Payables Aging Report |
| "Adakah perniagaan saya sihat?" | Financial Health / Solvency Report |
| "Bolehkah saya mohon pinjaman bank?" | Bank-Readiness Report |
| "Adakah saya bersedia untuk cukai LHDN?" | Tax Readiness Report |
| "Apa komitmen bulanan saya?" | Commitments / Recurring Obligations Report |
| "Berapa banyak saya berhutang?" | Debt Schedule |

**Goal alignment note:** this mapping is a UX-layer naming recommendation only — per Section A-E, several of the underlying accounting reports it points to (P&L, Balance Sheet, Cash Flow) are not yet computable from current data, so the human-friendly question would currently need to either show a partial/placeholder result or be gated until the corresponding Section A-C gaps are closed.

---

## SECTION G — REPORT READINESS SCORE

Scoring basis: PASS = 1.0, WARNING = 0.5, FAIL = 0.0, averaged per section.

| Section | Items | Score |
|---|---|---|
| Profit & Loss Readiness | Revenue (0.5), COGS (0), OpEx (0), Gross Profit (0), Net Profit (0.5) | **20%** |
| Balance Sheet Readiness | Cash (1), Bank (1), Receivables (0.5), Inventory (0), Fixed Assets (0.5), Payables (0.5), Debt (1), Commitments (0.5), Owner Capital (0), Retained Earnings (0) | **50%** |
| Cash Flow Readiness | Operating (0.5), Investing (0), Financing (0) | **17%** |
| Evidence Package Readiness | Linkage fields (1), Txn→Evidence (0.5), Report→Evidence (0), Report→Txn (0) | **38%** |

**Overall Report Foundation Readiness: ≈31%**

### TOP 10 Blockers — Bank-Ready / LHDN-Ready / Auditor-Ready Reports

1. **No Cost of Sales vs. Operating Expenses split in any report** — blocks Gross Profit, blocks a valid P&L for any audience (Bank, LHDN, Auditor alike). *(Section A)*
2. **`accountingClassificationMap.ts`'s `level1Group` is never read by report-generation code** — the single highest-leverage fix, since the classification data already exists and just needs to be wired into reports. *(Section A, E)*
3. **No Net Profit / Gross Profit calculation exists** — only a flat income-minus-expense `netBalance`. Auditors and banks require a structured P&L, not a cash-position delta. *(Section A)*
4. **Category-to-canonical mapping has no validation** — duplicate category rows from case/language variants will fragment report totals and produce inconsistent figures across periods. *(Section E)*
5. **14 of ~24 Master Framework Level-2 categories are unimplemented**, including Sales Revenue and Owner's Capital — without these, Revenue and Equity sections of any statutory report cannot be populated correctly. *(Section E)*
6. **No Retained Earnings tracking** — Balance Sheet cannot balance (Assets = Liabilities + Equity) without it; this is a hard blocker for any auditor-ready Balance Sheet. *(Section B)*
7. **No Owner's Capital running balance** — same Balance Sheet balancing problem from the Equity side. *(Section B)*
8. **No Inventory-on-Hand asset tracking** — any business with physical stock cannot produce a complete Balance Sheet or accurate COGS. *(Section A, B)*
9. **No Investing/Financing cash flow classification, and asset purchases/owner transactions are not even loaded into the reports component** — Cash Flow Statement is currently Operating-only and over-inclusive. *(Section C)*
10. **No drill-down from any report line item to underlying transactions or evidence (receipt/invoice/bank statement)** — auditors specifically require sample-transaction traceability; today's evidence linkage only works inside a separate, disconnected Evidence Manager screen. *(Section D)*

---

**Report metadata:** file path `/home/user/mykerani-app/MYKERANI_REPORT_FOUNDATION_READINESS_AUDIT.md`. Audit-only deliverable per explicit instruction — no source files were modified.
