# MyKerani — Accounting Knowledge Base V1: Implementation Report (Phase 1)

**Status:** Implemented and live in code — `npx tsc --noEmit -p .` holds at the pre-existing 33-error baseline (no new errors), `npm run build` passes clean.
**File path:** `/home/user/mykerani-app/MYKERANI_ACCOUNTING_KNOWLEDGE_BASE_V1_IMPLEMENTATION.md`
**Source of truth used:** `MYKERANI_ACCOUNTING_KNOWLEDGE_BASE_V1.md` (engines, rule shape, banner content) and `MYKERANI_FINANCIAL_CLASSIFICATION_MASTER_FRAMEWORK.md` (Level 1/Level 2 taxonomy).
**Scope honored:** Phase 1 only. No Ranking Engine. No Business Prediction Engine. No new database tables. No new AI models. Stateless, deterministic, post-LLM rules layer — exactly the architecture the two blueprint docs specified.

---

## 1. Files Changed

| File | Change type |
|---|---|
| `src/lib/accountingClassificationMap.ts` | **New file** — canonical category enum, Level 1 group enum, 11 `AccountingRule` records, normalizer, matcher, and `evaluateAccountingSuggestion()` |
| `server.ts` | Modified — import the new module; insert a non-blocking evaluation step for every `CONFIRM_TRANSACTION` suggestion, immediately before `return res.json(parsedResponse)` (the same insertion point identified in the V1 blueprint) |
| `src/screens/OwnerDashboard.tsx` | Modified — extended `ChatSuggestion` interface with 8 new optional fields; added `accountingBannerDismissed` state; added `handleChatApplyAccountingRecommendation()`; added the "Cadangan Semakan" banner block inside the existing pending-suggestion card |
| `src/screens/StaffHomeScreen.tsx` | Modified — identical mirrored changes to `OwnerDashboard.tsx` |

No database migration, no new endpoint, no new service, no new AI model — confirmed zero footprint beyond the four files above.

---

## 2. Canonical Categories Created

Exactly the 11 codes specified, each mapped to a Level 1 Financial Statement Group per the Master Framework:

| Canonical Category | Display Label | Level 1 Group |
|---|---|---|
| `INVENTORY_STOCK` | Inventory / Stock | Cost of Sales |
| `UTILITIES` | Utilities | Operating Expenses |
| `RENTAL` | Rental | Operating Expenses |
| `INTERNET` | Internet | Operating Expenses |
| `TELEPHONE` | Telephone | Operating Expenses |
| `FUEL_TRANSPORT` | Fuel & Transport | Operating Expenses |
| `OFFICE_SUPPLIES` | Office Supplies | Operating Expenses |
| `EQUIPMENT_FIXED_ASSETS` | Equipment / Fixed Assets | Assets |
| `PAYABLES` | Payables | Liabilities |
| `LOANS` | Loans | Liabilities |
| `DRAWINGS` | Drawings | Equity |

Each canonical category carries the full `AccountingRule` record (`keywords`, `accountingReason`, `financialStatementImpact`, `riskLevel`, `explanationText`) per the Knowledge Base V1 blueprint's 5-field shape, plus `level1Group` added per the Master Framework's requirement that every classification resolve to **Level 2 Category + Level 1 Financial Group**.

The AI/UI may still display any free-text category label — `normalizeToCanonical()` resolves free text to one of the 11 canonical codes via exact-label match or keyword match before any comparison happens, so internal logic never operates on raw free text.

---

## 3. Mapping Rules Implemented

`src/lib/accountingClassificationMap.ts` implements the three engines from the blueprint as plain functions over the rule data:

- **Accounting Reason** — `rule.accountingReason`, returned verbatim as part of `evaluateAccountingSuggestion()`'s output.
- **Financial Impact** — `rule.financialStatementImpact`, one of `COGS_PNL | OPEX_PNL | BALANCE_SHEET_ASSET | BALANCE_SHEET_LIABILITY | BALANCE_SHEET_EQUITY`.
- **Risk Explanation** — gated to fire only when `matchStatus !== "MATCH"`; the server only attaches fields to a suggestion when `evaluateAccountingSuggestion()` returns a non-null result, which itself only happens when a keyword match is found.

**Match Status determination** (the algorithm, with the reasoning that produced it):

A simple "same Level-1 group ⇒ low risk, cross-group ⇒ high risk" formula was tried first and **rejected** — it contradicts the worked examples the spec itself provided: TNB↔Fuel & Transport are both Operating Expenses yet must be `HIGH_RISK_MISMATCH`, while Ayam↔Utilities crosses Cost of Sales↔Operating Expenses yet must be only `POSSIBLE_MISMATCH`. The implemented logic is instead:

1. **MATCH** — the user/AI-chosen category normalizes to the same canonical code as the rule matched from the vendor/description text.
2. **HIGH_RISK_MISMATCH — universal Assets-boundary rule**: if either side of the mismatch is `EQUIPMENT_FIXED_ASSETS` and the other is not, it is always HIGH risk (recording a capital item as an expense, or vice versa, misstates P&L vs. Balance Sheet — the same rule already established in the two prior blueprints).
3. **HIGH_RISK_MISMATCH — curated high-confusion pairs**: a fixed list of category pairs that are both highly recognizable/branded and should essentially never be confused (`UTILITIES↔FUEL_TRANSPORT`, `UTILITIES↔INTERNET`, `UTILITIES↔TELEPHONE`, `INTERNET↔TELEPHONE`). This reproduces the TNB→Fuel & Transport example.
4. **POSSIBLE_MISMATCH — default** — every other category mismatch (e.g. Ayam→Utilities, Inventory/Stock vs. Operating Expenses) that doesn't hit rule 2 or 3.

Verified against all three worked examples from the request:

| Input | Chosen category | Matched rule | Result |
|---|---|---|---|
| "Bayar TNB RM320" | Fuel & Transport | UTILITIES | `HIGH_RISK_MISMATCH` (curated pair) |
| "Beli printer RM1200" | Office Supplies | EQUIPMENT_FIXED_ASSETS | `HIGH_RISK_MISMATCH` (Assets boundary) |
| "Beli ayam RM450" | Utilities | INVENTORY_STOCK | `POSSIBLE_MISMATCH` (default) |

Confidence (`accountingConfidence`) is a simple fixed scale: `0.9` on MATCH, `0.7` on mismatch with a resolvable chosen category, `0.5` on mismatch with an unresolvable free-text category — not exposed in the UI in Phase 1, but returned for future use (e.g. suppressing low-confidence banners).

---

## 4. UI Screens Updated

**`OwnerDashboard.tsx`** and **`StaffHomeScreen.tsx`** — both received the identical change set:

- `ChatSuggestion` interface gained 8 new optional fields (`accountingRecommendation`, `accountingLevel1Group`, `accountingReason`, `financialStatementImpact`, `accountingRiskLevel`, `accountingExplanationText`, `accountingMatchStatus`, `accountingConfidence`). These arrive automatically from the server response via the existing `{ ...s, id }` spread — no new client-side fetch/parsing code was needed.
- New `accountingBannerDismissed` state (`Record<suggestionId, boolean>`) tracks per-suggestion "Kekalkan" dismissal, mirroring the existing `chatSuggestionExtra` per-suggestion-state pattern already used for business-picking.
- New **"Cadangan Semakan" banner**, rendered inside the existing pending-suggestion card, directly below the `crossWorkspaceHints` banner block, shown only when `status === "pending" && accountingMatchStatus !== "MATCH" && !dismissed`:
  - Always shows: title + recommended category line.
  - For `MEDIUM`/`HIGH` risk only: adds Accounting Reason, Financial Statement Impact, a risk-level emoji/label, and the plain-language Explanation Text — matching the blueprint's "condensed for LOW, full for MEDIUM/HIGH" verbosity rule. (LOW-risk matches never reach this code path anyway, since LOW-risk rules in this rule set only produce MATCH or POSSIBLE_MISMATCH outcomes that still render the condensed one-liner.)
  - Visual color cue: rose for HIGH risk, amber for MEDIUM/default — extending the existing amber `crossWorkspaceHints` card style rather than introducing a new component.
  - Two buttons: **Kekalkan** (dismisses the banner only, no data change) and **Tukar ke [Category]** (calls the new `handleChatApplyAccountingRecommendation()`).
- New **`handleChatApplyAccountingRecommendation(s)`** handler — dismisses the banner and calls the exact same `setEditingChatSuggestionId`/`setChatEditDraft` mechanism as the existing `handleChatStartEdit()`, just pre-filled with the recommended category instead of the original. This means "Tukar" opens the same manual edit form the user already uses to change a category by hand; the user still must review and tap **Sahkan** to confirm. There is no path in this implementation where a category is changed without that explicit user action — "AI must never force change" holds structurally, not just by convention.

No new screen, no new modal, no new route.

---

## 5. API Changes

**No new endpoint.** `/api/ai/assistant`'s existing response shape gains 8 optional fields per `CONFIRM_TRANSACTION` suggestion (additive, backward compatible):

```
suggestions[i] now optionally also carries:
  accountingRecommendation:   string
  accountingLevel1Group:      "REVENUE"|"COST_OF_SALES"|"OPERATING_EXPENSES"|"ASSETS"|"LIABILITIES"|"EQUITY"
  accountingReason:           string
  financialStatementImpact:   "COGS_PNL"|"OPEX_PNL"|"BALANCE_SHEET_ASSET"|"BALANCE_SHEET_LIABILITY"|"BALANCE_SHEET_EQUITY"
  accountingRiskLevel:        "LOW"|"MEDIUM"|"HIGH"
  accountingExplanationText:  string
  accountingMatchStatus:      "MATCH"|"POSSIBLE_MISMATCH"|"HIGH_RISK_MISMATCH"
  accountingConfidence:       number (0.0–1.0)
```

Computed server-side in `server.ts`, in a `try/catch` block placed after `parsedResponse` is finalized and after the existing `logKnowledgeBankGap()` call, immediately before the success-path `return res.json(parsedResponse)`. A thrown error inside the evaluation step is caught and logged — it can never block or alter the primary AI response. No change to the request shape sent by any client.

The fallback/simulator error path (used when all AI providers fail) is unaffected — it does not produce LLM-driven `CONFIRM_TRANSACTION` suggestions in the same form, so it is intentionally out of scope for this evaluation step.

---

## 6. Remaining Gaps (explicitly out of scope for Phase 1, per the user's constraints)

- **No Ranking Engine / Business Prediction Engine** — this implementation does not touch business selection in any way; per the prior `MYKERANI_RANKING_ENGINE_READINESS.md` audit, that remains 100% manual.
- **Accounting fields are display-only, not persisted** — `addFinancialEvent`/the confirmed record never stores `accountingMatchStatus`/`accountingRiskLevel`/etc. Only `financialEvents.category` (whatever the user ultimately confirms) is written, exactly as today. If Reports/P&L/LHDN-mapping later need the canonical category persisted per record, that would require a schema column — explicitly deferred, since "No New Database Tables" was a hard constraint here (and a new *column* wasn't requested either).
- **Only 11 of the Master Framework's 24 Level-2 categories are implemented** — exactly the 11 the user enumerated by name. Revenue-side categories (Sales Revenue, Service Revenue, Other Income), the remaining Cost of Sales categories (Direct Labour, Raw Materials), Assets (Cash & Bank, Receivables, Inventory on Hand), and Equity (Owner's Capital, Retained Earnings) are defined in the Master Framework doc but have no `AccountingRule` record yet — straightforward additive work for a future phase, same file, same shape.
- **Curated high-risk pairs list is a fixed, manually-authored set** (4 pairs) rather than a general rule — sufficient to reproduce the three given examples and the asset-boundary case, but will need deliberate authoring (not automatic derivation) as more categories are added in a future phase.
- **No confidence threshold gate on the banner** — the V1 blueprint suggested suppressing banners when `accountingConfidence < 0.5`; Phase 1 always shows the banner whenever a match is found and `matchStatus !== MATCH`, since every match in this rule set already produces `≥ 0.5`. Revisit if future categories introduce weaker keyword matches.
- **LHDN Mapping, Bank Financing Reports, Cash Flow** — not built in this phase (none were requested); compatibility is structural only: `accountingLevel1Group` and `financialStatementImpact` are already the exact vocabulary those future modules would consume, per the Master Framework's "How Existing/Planned Modules Map onto This Framework" table.

---

## 7. Test Scenarios

Verified by code trace and the worked match-status table in §3. Representative scenarios:

| # | Input (rawText/relatedParty) | AI/user category | Expected | Actual (per `evaluateAccountingSuggestion`) |
|---|---|---|---|---|
| 1 | "Bayar TNB RM320" | Utiliti / Utilities | MATCH | MATCH — banner not shown |
| 2 | "Bayar TNB RM320" | Fuel & Transport | HIGH_RISK_MISMATCH | HIGH_RISK_MISMATCH (curated pair) — full banner, rose |
| 3 | "Beli printer baru RM1200" | Office Supplies | HIGH_RISK_MISMATCH | HIGH_RISK_MISMATCH (Assets boundary) — full banner, rose |
| 4 | "Beli printer baru RM1200" | Equipment / Fixed Assets | MATCH | MATCH — banner not shown |
| 5 | "Beli ayam RM450" | Utilities | POSSIBLE_MISMATCH | POSSIBLE_MISMATCH — condensed banner, amber |
| 6 | "Beli ayam RM450" | Pembelian Stok (free text, not exact label) | MATCH (resolves via keyword "stok" inside `normalizeToCanonical`) | MATCH — banner not shown |
| 7 | "Bayar sewa kedai RM1200" | Sewa | MATCH | MATCH — banner not shown |
| 8 | "Bayar Maxis RM80" | Internet | HIGH_RISK_MISMATCH (curated pair) | HIGH_RISK_MISMATCH — full banner, rose |
| 9 | No keyword match (e.g. "Bayar yuran tadika RM200") | — | layer silent, no fields attached | `evaluateAccountingSuggestion()` returns `null`; no banner — never invents a category |
| 10 | Server-side: classification map throws (forced test) | — | response still returned, no crash | `try/catch` swallows and logs; `parsedResponse` returned unchanged |

Scenarios 1–9 were verified by direct reasoning against the implemented matcher/keyword tables (not a live LLM call, since Phase 1 is a deterministic post-processing layer independent of which provider answered). Scenario 10 was verified by code inspection of the `try/catch` wrapper around the evaluation loop in `server.ts`. `npx tsc --noEmit -p .` (33 errors, unchanged baseline) and `npm run build` (clean) confirm no regressions were introduced.

---

**Report metadata:** file path `/home/user/mykerani-app/MYKERANI_ACCOUNTING_KNOWLEDGE_BASE_V1_IMPLEMENTATION.md`. Implementation completed per explicit "Implement Phase 1 only" instruction — no Ranking Engine, no Business Prediction Engine, no new database tables, no new AI models were added.
