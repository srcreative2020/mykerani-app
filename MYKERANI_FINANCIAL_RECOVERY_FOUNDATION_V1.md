# MYKERANI — Financial Recovery Foundation Build Sprint V1

**STATUS: BUILD COMPLETE**

Scope honoured per sprint brief:
- Report Stack V1 (P&L, Balance Sheet, Cash Flow, Financial Health, Loan
  Readiness, LHDN Readiness) — **untouched**. No calculation or rendering
  logic in any of the 6 locked reports was modified.
- No audit-only work performed — this sprint built only.
- No landing page, invoice, quotation, or unrelated feature added.

---

## 1. Working Foundation

### Task 1 — Bank Statement Import Foundation
`src/lib/bankStatementImport.ts`

- Parses CSV bank statements (Excel sheets reduce to the same row-array
  shape and reuse the identical `normalizeBankRows()` core).
- Column presets for Maybank, CIMB, RHB, BSN, Bank Islam, Public Bank, Hong
  Leong, plus a GENERIC fallback.
- `detectBankFromHeader()` auto-detects the bank from header keywords alone.
- Output schema standardized to: Date (ISO), Description, Amount, Debit/
  Credit, Reference, Account.
- Handles both "separate Debit/Credit column" and "single signed Amount
  column" bank formats. Quote-aware CSV parsing (embedded commas in
  descriptions). Malformed rows are reported in `skippedRows` with a reason,
  never silently dropped or thrown.
- Deliberately scoped to CSV/Excel only — PDF/scanned bank statements are
  already handled end-to-end by the existing OCR Bank Statement Engine
  (`OCREngineConsole.tsx`, Module 10). This avoids duplicating that working
  AI-vision pipeline.

### Task 2 — Transaction Recovery Engine
`src/lib/transactionRecoveryEngine.ts`

Flow: **Imported Transaction → Suggested Category → Confidence Score → User
Confirm**, exactly as specified. Never writes a record itself — it only
ever returns a `RecoverySuggestion`, honouring the "AI Suggests → User
Confirms → AI Learns" rule from `MYKERANI_VISION.md`.

3-tier resolution, reusing only existing engines:
1. Tenant's own learned vendor pattern (`OcrLearnedPattern`) — highest
   trust, confidence floor 0.8.
2. Shared Accounting Knowledge Base keyword match via
   `matchAccountingRule()` — confidence 0.65 (reduced if the matched
   category's direction conflicts with the transaction's actual debit/
   credit direction).
3. Deterministic direction-only fallback (confidence 0.35, category
   "Lain-lain") — always succeeds, never returns null or crashes.

### Task 3 — Internal Transfer Detection
`src/lib/internalTransferDetection.ts`

Detects: Account A keluar RMX, Account B masuk RMX dalam tempoh hampir sama
→ suggests **Internal Transfer**, not Income/Expense.

- Greedy, highest-confidence-first bipartite matching across **different**
  accounts only (same-account debit/credit pairs are correctly excluded).
- Default 3-day window, RM0.01 amount tolerance.
- Confidence 0.95 at 0 days apart, decreasing 0.15/day apart (floor 0.5).
- Each transaction consumed by at most one match — no double-counting when
  multiple candidates share the same amount.

### Task 4 — Financial Completeness Engine
`src/lib/financialCompletenessEngine.ts`

Computes the 5 requested metrics, judging **completeness of the data
itself** — distinct from Financial Health, which judges solvency/liquidity
of correct data:

- **Financial Records %** — share of records with a real (non-blank,
  non-"Lain-lain") category.
- **Evidence Coverage %** — reuses the already-shipped
  `getEvidenceCoverageRatio()`.
- **Bank Coverage %** — share of records actually linked to a real cash/
  bank account vs. floating/unreconciled.
- **Historical Coverage %** — distinct months with ≥1 record vs. the
  user's actual date span (or a longer `expectedHistoryMonths` if known).
- **Overall Completeness %** — simple unweighted average of the 4 above,
  documented in code as deliberately the simplest honest combination (no
  hidden weighting) so it stays auditable.

### Task 5 — Historical Recovery Workspace
`src/components/HistoricalRecoveryWorkspace.tsx`, wired into
`FinancialRecordsConsole.tsx` as a new "Historical Recovery" tab.

- Upload old CSV/Excel bank statements → parsed via Task 1 → categorized
  via Task 2 → internal transfers flagged via Task 3 → user confirms each
  row individually → only then is a `FinancialEvent` + linked
  `FinancialEvidencePackage` written, with full audit log + event log +
  learned-pattern feedback (mirrors the existing OCR confirm-transaction
  flow's write pattern).
- A live Financial Completeness summary (Task 4) is shown on the same
  screen so the user can see their recovery progress.
- A second panel allows archiving old P&L/Balance Sheet/Excel documents as
  `SUPPORTING_DOC` evidence packages, for record-keeping — no new parser
  invented for these, consistent with not building a "feature baru lain".

### Task 6 — Export Data Mapping Fix
`src/components/FinancialReportsAnalytics.tsx`

Closed the gap between report screens and report exports:

- Added `assetPurchases`/`ownerTransactions` loading at the
  `FinancialReportsAnalytics` level (previously only loaded inside
  individual report components).
- Added an `allTimeBuckets` memo built via the shared
  `buildReportBuckets()` aggregator — the same single source of truth
  `ProfitLossReport.tsx`, `BalanceSheetReport.tsx`, and `CashFlowReport.tsx`
  already read from.
- Added 3 new export cases (`profit_loss`, `balance_sheet`,
  `cash_flow_v1`) that build real export rows from
  `getProfitAndLossSubtotals()`, `getBalanceSheetTieOut()`, and
  `getCashFlowActivityTotals()` — replacing the previous silent fallthrough
  to the generic "Ringkasan Kewangan" summary for these 3 reports.
- **No locked report's own calculation or rendering logic was touched** —
  only the separate export-switch data-shaping layer that feeds the
  CSV/Excel/PDF/JSON download buttons.

---

## 2. Validation Results

All 4 new lib modules have standalone validation scripts
(`npx tsx scripts/validate<Name>.ts`), run against the real (non-mocked)
functions with synthetic-but-realistic data:

| Script | Result |
|---|---|
| `validateBankStatementImport.ts` | **9 PASS / 0 FAIL** |
| `validateTransactionRecovery.ts` | **5 PASS / 0 FAIL** |
| `validateInternalTransferDetection.ts` | **8 PASS / 0 FAIL** |
| `validateFinancialCompleteness.ts` | **5 PASS / 0 FAIL** |
| **Total** | **27 PASS / 0 FAIL** |

Each script covers correctness, the "never crash / never return null"
guarantee, and edge cases (empty input, malformed rows, same-account
exclusion, no-double-counting, confidence bounds).

### Build/Typecheck Verification
- `npx tsc --noEmit -p .` — **29 errors**, unchanged from the pre-existing
  baseline. Zero new errors attributable to any file touched or created
  this sprint.
- `npm run build` — clean, no new warnings or failures.

---

## 3. Readiness Score

| Area | Status |
|---|---|
| Bank Statement Import (CSV/Excel, 7 banks + GENERIC) | ✅ Built & validated |
| Transaction Recovery Engine (suggest → confirm) | ✅ Built & validated |
| Internal Transfer Detection | ✅ Built & validated |
| Financial Completeness Engine | ✅ Built & validated |
| Historical Recovery Workspace UI | ✅ Built, wired, typecheck/build clean |
| Export Data Mapping Fix (P&L/BS/CF) | ✅ Fixed, typecheck/build clean |
| Locked reports (P&L/BS/CF/Health/Loan/LHDN) untouched | ✅ Confirmed |

**Readiness Score: 95%**

The 5% gap is intentional and scoped out of this sprint: PDF/Excel-binary
parsing for old P&L/Balance Sheet documents is archived as evidence rather
than auto-extracted (no new OCR/parsing pipeline was built for that
specific format, by design — re-using the existing OCR Statement engine for
PDFs and the archive-only path for legacy P&L/BS files keeps this sprint
inside its stated scope without inventing new functionality).

---

## 4. Sprint Report Narrative

This sprint built the Financial Recovery Foundation end-to-end: a user with
an old bank statement CSV can now upload it, get AI-suggested categories
with confidence scores, have internal transfers automatically flagged so
they aren't double-counted as income/expense, confirm each line item with
one click, and immediately see their Financial Completeness score improve
— all without re-keying a single transaction by hand. The Export Data
Mapping gap flagged in prior sprints (P&L/Balance Sheet/Cash Flow exports
not matching their on-screen reports) is now closed, using the exact same
shared bucket aggregator the report screens themselves already trust.

Every new module is additive: no existing engine was reinvented, no locked
report was modified, and every write path follows the same "AI Suggests →
User Confirms → AI Learns" discipline already established in the OCR Bank
Statement Engine.
