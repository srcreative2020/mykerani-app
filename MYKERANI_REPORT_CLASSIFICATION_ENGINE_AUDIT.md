# MyKerani — Report Classification Engine Audit

**Status:** Audit only. No code changed.
**File path:** `/home/user/mykerani-app/MYKERANI_REPORT_CLASSIFICATION_ENGINE_AUDIT.md`
**Objective:** Trace whether a Financial Event can resolve, end to end, into a Level 1 Financial Statement Group (Revenue / Cost of Sales / Operating Expenses / Assets / Liabilities / Equity) — the precondition for any P&L/Balance Sheet/Cash Flow report — and design the missing classification layer. Per the prior `MYKERANI_REPORT_FOUNDATION_READINESS_AUDIT.md`, Level 1 Groups exist in `accountingClassificationMap.ts` but are not used by reports; this audit traces exactly why and exactly what to build.
**Constraint honored:** audit + design only — no reports built, no code changed.

---

## Required Trace: Financial Event → Category → Canonical Category → Level 1 Group → Report Bucket

```
FinancialEvent.categoryName (free text)
        │
        ▼
general_ledger_categories row (id, name, code, type)   ← getOrCreateCategoryId(), FinancialRecordsContext.tsx:303-344
        │   type ∈ { ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE }   (coarse, NOT Level 1 Group)
        │
        ✗  NO LINK EXISTS HERE — general_ledger_categories.type is never
        │  cross-referenced against accountingClassificationMap.ts
        ▼
accountingClassificationMap.ts: normalizeToCanonical(categoryName) → CanonicalCategory | null
        │   (exact-label match OR keyword-substring match against 11 rules)
        ▼
AccountingRule.level1Group ∈ { REVENUE | COST_OF_SALES | OPERATING_EXPENSES | ASSETS | LIABILITIES | EQUITY }
        │
        ✗  NO REPORT CODE CALLS normalizeToCanonical() OR READS level1Group
        ▼
Report Bucket (P&L line / Balance Sheet section)   — DOES NOT EXIST TODAY
```

The chain has **two real, working links** (Financial Event → `general_ledger_categories`, and `normalizeToCanonical` → `level1Group`) and **two missing links** (no bridge between `general_ledger_categories.type` and `accountingClassificationMap.ts`'s canonical categories; no report code that consumes `level1Group` at all).

---

## 1. Which fields already exist?

| Field | Location | Purpose |
|---|---|---|
| `FinancialEvent.categoryName: string` | `src/types.ts:92` | Free-text category as entered/chosen by user or AI |
| `FinancialEvent.type: FinancialRecordType` | `src/types.ts:86,91` (`"INCOME" \| "EXPENSE" \| "RECEIVABLE" \| "PAYABLE" \| "DEBT"`) | Coarse transaction-kind flag, set at entry time |
| `general_ledger_categories.id/name/code/type` | Supabase table, written via `getOrCreateCategoryId()`, `FinancialRecordsContext.tsx:303-344` | Per-workspace category registry; `type` ∈ ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE |
| `CanonicalCategory` (11 values) | `src/lib/accountingClassificationMap.ts:17-28` | The canonical Level-2 category enum |
| `AccountingRule.level1Group: FinancialStatementGroup` | `accountingClassificationMap.ts:9-15, 44` | The actual Level 1 Group value (REVENUE/COST_OF_SALES/OPERATING_EXPENSES/ASSETS/LIABILITIES/EQUITY) per canonical category |
| `AccountingRule.financialStatementImpact` | `accountingClassificationMap.ts:34-39, 47` | A finer-grained statement-line tag (COGS_PNL/OPEX_PNL/BALANCE_SHEET_ASSET/_LIABILITY/_EQUITY) |
| `normalizeToCanonical(freeText)` | `accountingClassificationMap.ts:190-202` | Function: free-text label → `CanonicalCategory \| null` |
| `matchAccountingRule(text)` | `accountingClassificationMap.ts:205-212` | Function: vendor/description text → `AccountingRule \| null` (keyword match) |

**All the pieces needed to resolve a category to a Level 1 Group already exist as code.** Nothing here needs to be invented — it needs to be connected and extended.

---

## 2. Which mappings already exist?

- `categoryName` (free text) → `general_ledger_categories` row: **exists**, via exact-string lookup-or-create (`getOrCreateCategoryId`, `FinancialRecordsContext.tsx:314-319`).
- `categoryName`/`recommendedCategory` (free text) → `CanonicalCategory`: **exists**, via `normalizeToCanonical()` (exact label match first, then keyword-substring match) — but only for the 11 implemented canonical categories.
- `CanonicalCategory` → `level1Group`: **exists** and is complete for all 11 implemented categories (`ACCOUNTING_KNOWLEDGE_BASE` array, `accountingClassificationMap.ts:52-163`).
- `FinancialEvent.type` → `general_ledger_categories.type` (ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE): **exists**, via the inline branch in `getOrCreateCategoryId()` (`FinancialRecordsContext.tsx:306-311`) — INCOME/RECEIVABLE → REVENUE, EXPENSE/PAYABLE/DEBT → EXPENSE. **Note this mapping is already imprecise**: PAYABLE (a liability) and DEBT (could be a liability or an expense depending on context) are both forced into the `"EXPENSE"` bucket here, with no LIABILITY value ever actually assigned by this function despite LIABILITY being a valid value in its own type union.

**Currently used by:** the AI chat-suggestion accounting banner only (`server.ts`, the post-`parsedResponse` evaluation block added in the Phase 1 Knowledge Base implementation). **Not used by:** any report-generation code (`FinancialReportsAnalytics.tsx`, `financialService.ts` — confirmed by grep, zero imports of `accountingClassificationMap.ts` outside `server.ts`).

---

## 3. Which mappings are missing?

1. **`general_ledger_categories.type` → `level1Group`** — no code path ever takes a category's coarse Supabase `type` and resolves it to one of the 6 Level 1 Groups. This link doesn't need to exist if the canonical-category path (#2 below) is used instead, but as currently written, the Supabase category registry and the Level 1 Group taxonomy are two parallel, disconnected systems.
2. **`FinancialEvent` (the actual transaction record) → `level1Group` at report time** — there is no function `resolveLevel1Group(event: FinancialEvent): FinancialStatementGroup` anywhere. `normalizeToCanonical()` takes a string; nothing currently calls it with a transaction's `categoryName` for reporting purposes.
3. **A fallback rule for `FinancialEvent.type` when `categoryName` doesn't resolve to any of the 11 canonical categories** — e.g. an EXPENSE record with `categoryName: "Marketing"` has no canonical category at all, so `normalizeToCanonical()` returns `null` and there is currently no second-tier rule (e.g. "unresolved EXPENSE defaults to OPERATING_EXPENSES, unresolved INCOME defaults to REVENUE") to guarantee every transaction still lands somewhere.
4. **Canonical categories for Revenue, Receivables/Cash as Level-2 categories, Owner's Capital, Retained Earnings, Direct Labour, Raw Materials, Marketing, Insurance, Professional Fees, Accrued Expenses, Inventory-on-Hand** — 0 Revenue categories and several Asset/Equity categories are simply absent from `ACCOUNTING_KNOWLEDGE_BASE` (it has 11 of the Master Framework's ~24 Level-2 categories, all skewed toward Operating Expenses/Liabilities). Any transaction whose true nature falls in one of these gaps cannot resolve via the canonical path at all.
5. **Special-record-type mappings** — `RECEIVABLE`/`PAYABLE`/`DEBT`-type `FinancialEvent`s and `DebtRecord`/`FinancialCommitment`/`AssetPurchase`/`OwnerTransaction` rows (the latter four live entirely outside `FinancialEvent` — see `assetOwnerData.ts`) have **no canonical-category resolution path at all**, since `normalizeToCanonical()` only ever receives a `categoryName` string and these record types are structurally different objects, several without a `categoryName` field in the first place (e.g. `DebtRecord`, `OwnerTransaction`).

---

## 4. Can every Financial Event resolve into Revenue / Cost of Sales / Operating Expenses / Assets / Liabilities / Equity?

**No — not today, and not even after wiring `normalizeToCanonical()` into reports, without first adding a fallback tier.** Concretely:

| `FinancialEvent.type` | Can resolve via canonical match? | Fallback if no canonical match? |
|---|---|---|
| INCOME | Only if `categoryName` happens to be one of the 11 canonical labels/keywords — **none of which are Revenue categories** (all 11 are OpEx/COGS/Assets/Liabilities/Equity). **Every INCOME record fails to resolve today.** | None exists |
| EXPENSE | Resolves correctly for the 7 implemented OpEx/COGS/Assets canonical categories (Utilities, Rental, Internet, Telephone, Fuel & Transport, Office Supplies, Inventory/Stock, Equipment/Fixed Assets) — fails for anything else (Marketing, Insurance, Professional Fees, etc.) | None exists |
| RECEIVABLE | No canonical category represents "Receivables" as an Asset — **always fails** | None exists |
| PAYABLE | Resolves via the `PAYABLES` canonical category if `categoryName` matches its keywords — otherwise fails | None exists |
| DEBT | Resolves via `LOANS` if matched — otherwise fails | None exists |

**Verdict: Resolution is currently guaranteed to fail for 100% of INCOME and RECEIVABLE records (no canonical category exists for either), and is best-effort/partial for EXPENSE/PAYABLE/DEBT records** (works only when `categoryName` happens to match one of the 11 implemented categories).

---

## 5. Categories that cannot be resolved

- **All Revenue-side categories** — Sales Revenue, Service Revenue, Other Income (no canonical category exists; every INCOME-type `FinancialEvent` is unresolvable today regardless of its `categoryName`).
- **Receivables, Cash & Bank, Inventory on Hand** as Asset-side Level 2 categories (the existing `EQUIPMENT_FIXED_ASSETS` is the only Asset canonical category — Cash/Bank/Receivables/Inventory have no equivalent, even though Cash/Bank/Receivables already have their own dedicated Supabase tables and balances elsewhere in the app).
- **Owner's Capital, Retained Earnings** as Equity categories (only `DRAWINGS` exists).
- **Direct Labour, Raw Materials** as Cost of Sales categories (only `INVENTORY_STOCK` exists).
- **Marketing, Insurance, Professional Fees, Accrued Expenses** as Operating Expense categories.
- **Any free-text `categoryName` that doesn't textually match one of the 11 implemented categories' label or keyword list** — e.g. "Gaji Staff" (staff salaries), "Yuran Profesional" (professional fees), "Pembelian Bahan Mentah" (raw materials) — these are realistic Malaysian SME categories that exist in `general_ledger_categories` as free text but have zero canonical-resolution path.

---

## 6. Exact Code Locations

| Concern | File:Line |
|---|---|
| `FinancialEvent` type, `categoryName`/`type` fields | `src/types.ts:86-106` |
| `getOrCreateCategoryId()` (Financial Event → `general_ledger_categories`) | `src/context/FinancialRecordsContext.tsx:303-344` |
| `FinancialRecordType` → `general_ledger_categories.type` coarse mapping | `src/context/FinancialRecordsContext.tsx:306-311` |
| `CanonicalCategory`, `FinancialStatementGroup` type definitions | `src/lib/accountingClassificationMap.ts:9-28` |
| `ACCOUNTING_KNOWLEDGE_BASE` (11 rules, each with `level1Group`) | `src/lib/accountingClassificationMap.ts:52-163` |
| `normalizeToCanonical()` | `src/lib/accountingClassificationMap.ts:190-202` |
| `matchAccountingRule()` | `src/lib/accountingClassificationMap.ts:205-212` |
| `evaluateAccountingSuggestion()` (current sole consumer) | `src/lib/accountingClassificationMap.ts:233-267` |
| Sole call site of the above (AI chat-suggestion banner) | `server.ts`, Accounting Knowledge Base evaluation block, just before `return res.json(parsedResponse)` |
| Report generation code (confirmed zero `accountingClassificationMap.ts` imports) | `src/components/FinancialReportsAnalytics.tsx`, `src/lib/financialService.ts` |
| Master Framework's full target taxonomy (~24 Level-2 categories) | `MYKERANI_FINANCIAL_CLASSIFICATION_MASTER_FRAMEWORK.md` |

---

## 7. Architecture Required

### Design principle
Build **one new pure function module** — a Report Classification Engine — that every future report consumer calls, instead of letting each report re-implement its own category-grouping logic (which is exactly how the current Operating/Investing/Financing cash-flow miscategorization happened — ad hoc, per-report logic with no shared source of truth).

```
                    ┌─────────────────────────┐
                    │     FinancialEvent      │
                    │  (+ DebtRecord,         │
                    │     FinancialCommitment,│
                    │     AssetPurchase,      │
                    │     OwnerTransaction)   │
                    └────────────┬────────────┘
                                 │
                                 ▼
              ┌──────────────────────────────────────┐
              │   REPORT CLASSIFICATION ENGINE        │
              │   (new: src/lib/reportClassification  │
              │    Engine.ts — pure functions only,   │
              │    no DB, no side effects)             │
              │                                        │
              │  resolveLevel1Group(record, recordKind)│
              │   1. Try normalizeToCanonical          │
              │      (categoryName) — reuse existing   │
              │      accountingClassificationMap.ts    │
              │   2. If null, apply TYPE-BASED FALLBACK │
              │      RULES (new, deterministic):       │
              │        INCOME      → REVENUE            │
              │        EXPENSE     → OPERATING_EXPENSES │
              │        RECEIVABLE  → ASSETS              │
              │        PAYABLE     → LIABILITIES          │
              │        DEBT        → LIABILITIES          │
              │        COMMITMENT  → LIABILITIES          │
              │        ASSET_PURCHASE → ASSETS            │
              │        OWNER_TXN(CAPITAL) → EQUITY        │
              │        OWNER_TXN(DRAWING) → EQUITY        │
              │   3. Tag result with a `resolutionMethod`│
              │      ("CANONICAL_MATCH" | "TYPE_FALLBACK")│
              │      so reports can flag low-confidence  │
              │      classifications instead of silently │
              │      trusting a guess                     │
              └──────────────────┬────────────────────┘
                                 │  { level1Group, resolutionMethod,
                                 │    canonicalCategory | null }
                                 ▼
              ┌──────────────────────────────────────┐
              │       REPORT BUCKET AGGREGATOR        │
              │  (new: groups already-classified      │
              │   records by level1Group, then by      │
              │   canonicalCategory/categoryName        │
              │   within each group — one shared        │
              │   aggregation function reused by all    │
              │   three statements below, so Cash Flow's │
              │   current "everything is Operating" bug  │
              │   cannot recur)                          │
              └──────────────────┬────────────────────┘
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
              ┌──────────┐ ┌──────────┐ ┌──────────┐
              │ Profit & │ │ Balance  │ │   Cash    │
              │   Loss   │ │  Sheet   │ │   Flow    │
              │          │ │          │ │           │
              │ REVENUE  │ │ ASSETS   │ │ Operating:│
              │ −COST_OF │ │ LIABILI- │ │  REVENUE/ │
              │  _SALES  │ │  TIES    │ │  OPEX/COGS│
              │ =Gross   │ │ EQUITY   │ │ Investing:│
              │ Profit   │ │ (must    │ │  ASSETS   │
              │ −OPEX    │ │  balance)│ │ Financing:│
              │ =Net     │ │          │ │  EQUITY + │
              │ Profit   │ │          │ │  LIABILI- │
              │          │ │          │ │  TIES(debt)│
              └──────────┘ └──────────┘ └──────────┘
```

### What must be built, in order (per the "classification layer first" instruction):

1. **Extend `accountingClassificationMap.ts`'s `ACCOUNTING_KNOWLEDGE_BASE`** with the missing canonical categories — at minimum the 3 Revenue categories and the Asset-side Cash/Bank/Receivables/Inventory-on-Hand and Equity-side Owner's Capital/Retained Earnings categories — so the canonical-match tier has real coverage instead of being skewed entirely toward OpEx/Liabilities.
2. **Build the new `resolveLevel1Group()` function** (Section 7 above) as a thin wrapper around the existing `normalizeToCanonical()`, adding the deterministic type-based fallback tier so resolution coverage becomes 100% (every record lands in exactly one Level 1 Group, never `null`), with an honest `resolutionMethod` flag distinguishing a confident canonical match from a coarse type-based guess.
3. **Build the shared Report Bucket Aggregator** that all three statements call, eliminating the per-report ad hoc grouping logic that produced today's "every transaction is Operating Cash Flow" bug.
4. **Only then** — wire P&L, Balance Sheet, and Cash Flow report screens on top of the aggregator (explicitly out of scope for this task, per "Do not build reports yet").

---

## Readiness Score

| Layer | Score | Basis |
|---|---|---|
| Fields exist | **90%** | Every field needed already exists in code; only a `resolutionMethod`/fallback-tier field is missing |
| Canonical-category mapping exists | **45%** | 11 of ~24 Level-2 categories implemented, structurally sound but skewed away from Revenue/Assets/Equity |
| Type-based fallback tier | **0%** | Does not exist — no guaranteed resolution path when canonical match fails |
| Engine wired into reports | **0%** | Zero report code imports `accountingClassificationMap.ts` |
| Shared aggregation layer | **0%** | Does not exist — each report (where they exist at all) implements its own ad hoc grouping |

**Overall Report Classification Engine Readiness: ≈27%**

The highest-leverage, lowest-effort fix is also the most important one: building `resolveLevel1Group()` as described in Section 7 (steps 1-2) would, on its own, take Financial-Event-to-Level-1-Group resolution from "broken for Revenue, partial for everything else" to "100% guaranteed resolution with a confidence flag" — without touching a single report screen. That is the correct next build target, per the task's explicit instruction to build the classification layer before any report.

---

**Report metadata:** file path `/home/user/mykerani-app/MYKERANI_REPORT_CLASSIFICATION_ENGINE_AUDIT.md`. Audit and architecture-design deliverable only — no source files were modified, no reports were built.
