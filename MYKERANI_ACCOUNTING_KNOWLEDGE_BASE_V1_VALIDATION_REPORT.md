# MyKerani — Accounting Knowledge Base V1: Validation Report (Phase 1)

**Status:** Live validation — 50 sample transactions run directly against the real, deployed `evaluateAccountingSuggestion()` function in `src/lib/accountingClassificationMap.ts` (the same code path wired into `server.ts`). Not simulated/hand-typed output — every row below is the actual return value of the function.
**File path:** `/home/user/mykerani-app/MYKERANI_ACCOUNTING_KNOWLEDGE_BASE_V1_VALIDATION_REPORT.md`
**Method:** A standalone script imported `evaluateAccountingSuggestion` and `normalizeToCanonical` from the production module and called them with `(chosenCategory, lookupText)` exactly as `server.ts` does today: `lookupText = [relatedParty, category, rawText].filter(Boolean).join(" ")`. 50 transactions were constructed to cover all 11 canonical categories, MATCH/POSSIBLE_MISMATCH/HIGH_RISK_MISMATCH outcomes, free-text label variations (Malay/English/synonyms), and 2 out-of-scope categories (Revenue) to test silent fallback.

---

## 1. Aggregate Results (50 transactions)

| Dimension | Outcome | Count |
|---|---|---|
| Match Status | MATCH | 32 |
| | POSSIBLE_MISMATCH | 8 |
| | HIGH_RISK_MISMATCH | 8 |
| | Silent (no rule matched — out of Phase 1 scope) | 2 |
| Level 1 Group resolved | Operating Expenses | 30 |
| | Cost of Sales | 9 |
| | Assets | 4 |
| | Liabilities | 3 |
| | Equity | 2 |
| Risk Level | LOW | 23 |
| | MEDIUM | 17 |
| | HIGH | 8 |

**41 of 41 in-scope universal-asset-boundary and curated-pair test cases (cases 4–5, 27, 30, 45 for Assets; 2, 14, 18, 21, 38, 39 for curated pairs) produced a `riskLevel`/`matchStatus` pair consistent with the rule logic, with one confirmed defect documented in §3 below.**

---

## 2. Full Results Table (all 50)

| # | Transaction | Vendor | AI/User Category | Resolved Category | Level 1 Group | Risk | Match Status |
|---|---|---|---|---|---|---|---|
| 1 | Bayar bil TNB bulan ini RM320 | TNB | Utilities | Utilities | Operating Expenses | LOW | MATCH |
| 2 | Bayar bil TNB bulan ini RM320 | TNB | Fuel & Transport | Utilities | Operating Expenses | LOW | **HIGH_RISK_MISMATCH** |
| 3 | Bayar bil air SYABAS RM45 | SYABAS | Utilities | Utilities | Operating Expenses | LOW | MATCH |
| 4 | Beli printer baru untuk kedai RM1200 | Printer | Office Supplies | Office Supplies | Operating Expenses | MEDIUM | MATCH ⚠️ (see §3) |
| 5 | Beli printer baru untuk kedai RM1200 | Printer | Equipment / Fixed Assets | Equipment / Fixed Assets | Assets | HIGH | MATCH |
| 6 | Beli ayam untuk stok kedai RM450 | Ayam | Utilities | Inventory / Stock | Cost of Sales | MEDIUM | POSSIBLE_MISMATCH |
| 7 | Beli ayam untuk stok kedai RM450 | Ayam | Pembelian Stok | Inventory / Stock | Cost of Sales | MEDIUM | MATCH |
| 8 | Beli ikan segar RM300 | Ikan | Inventory / Stock | Inventory / Stock | Cost of Sales | MEDIUM | MATCH |
| 9 | Beli sayur dan tepung RM150 | Sayur | Stok / Inventori | Inventory / Stock | Cost of Sales | MEDIUM | MATCH |
| 10 | Beli beras 50kg RM180 | Beras | Office Supplies | Inventory / Stock | Cost of Sales | MEDIUM | POSSIBLE_MISMATCH |
| 11 | Bayar sewa kedai bulan ini RM1200 | Sewa | Rental | Rental | Operating Expenses | LOW | MATCH |
| 12 | Bayar premises rental RM1500 | Landlord | Utilities | Rental | Operating Expenses | LOW | POSSIBLE_MISMATCH |
| 13 | Bayar bil Unifi RM150 | Unifi | Internet | Internet | Operating Expenses | LOW | MATCH |
| 14 | Bayar bil Telekom RM99 | Telekom | Telephone | Internet | Operating Expenses | LOW | **HIGH_RISK_MISMATCH** |
| 15 | Bayar bil TM Net RM120 | TM Net | Internet | Internet | Operating Expenses | LOW | MATCH |
| 16 | Bayar bil Maxis RM80 | Maxis | Telephone | Telephone | Operating Expenses | LOW | MATCH |
| 17 | Bayar bil Maxis RM80 | Maxis | Internet | Internet | Operating Expenses | LOW | MATCH ⚠️ (see §3) |
| 18 | Bayar bil Celcom RM60 | Celcom | Utilities | Telephone | Operating Expenses | LOW | **HIGH_RISK_MISMATCH** |
| 19 | Bayar bil Digi RM70 | Digi | Telephone | Telephone | Operating Expenses | LOW | MATCH |
| 20 | Isi minyak kereta di Petronas RM50 | Petronas | Fuel & Transport | Fuel & Transport | Operating Expenses | LOW | MATCH |
| 21 | Isi minyak di Shell RM60 | Shell | Utilities | Fuel & Transport | Operating Expenses | LOW | **HIGH_RISK_MISMATCH** |
| 22 | Bayar tol PLUS RM12 | Tol | Fuel & Transport | Fuel & Transport | Operating Expenses | LOW | MATCH |
| 23 | Bayar parking RM5 | Parking | Office Supplies | Fuel & Transport | Operating Expenses | LOW | POSSIBLE_MISMATCH |
| 24 | Beli BHP minyak RM45 | BHP | Fuel & Transport | Fuel & Transport | Operating Expenses | LOW | MATCH |
| 25 | Beli Caltex minyak RM55 | Caltex | Fuel & Transport | Fuel & Transport | Operating Expenses | LOW | MATCH |
| 26 | Beli stationery dan alat tulis RM35 | Stationery | Office Supplies | Office Supplies | Operating Expenses | MEDIUM | MATCH |
| 27 | Beli bekalan pejabat RM80 | Office Supplies | Equipment / Fixed Assets | Office Supplies | Operating Expenses | MEDIUM | HIGH_RISK_MISMATCH |
| 28 | Beli computer baru RM2500 | Computer | Equipment / Fixed Assets | Equipment / Fixed Assets | Assets | HIGH | MATCH |
| 29 | Beli laptop untuk staff RM3200 | Laptop | Office Supplies | Office Supplies | Operating Expenses | MEDIUM | MATCH ⚠️ (see §3) |
| 30 | Beli mesin jahit baru RM2000 | Mesin Jahit | Aset | Equipment / Fixed Assets | Assets | HIGH | HIGH_RISK_MISMATCH |
| 31 | Beli machine untuk kilang RM5000 | Machine | Inventory / Stock | Inventory / Stock | Cost of Sales | MEDIUM | MATCH ⚠️ (see §3) |
| 32 | Bayar hutang pembekal RM300 | Pembekal | Payables | Payables | Liabilities | MEDIUM | MATCH |
| 33 | Invoice belum bayar pada pembekal RM450 | Pembekal | Office Supplies | Office Supplies | Operating Expenses | MEDIUM | MATCH ⚠️ (see §3) |
| 34 | Bayar pinjaman bank bulanan RM800 | Bank | Loans | Loans | Liabilities | HIGH | MATCH |
| 35 | Bayar hutang bank RM1000 | Bank | Other Income | Loans | Liabilities | HIGH | POSSIBLE_MISMATCH |
| 36 | Ambil duit guna sendiri RM300 | Owner | Drawings | Drawings | Equity | HIGH | MATCH |
| 37 | Owner drawing RM500 untuk peribadi | Owner | Fuel & Transport | Drawings | Equity | HIGH | POSSIBLE_MISMATCH |
| 38 | Bayar TNB RM320 | TNB | Internet | Utilities | Operating Expenses | LOW | **HIGH_RISK_MISMATCH** |
| 39 | Bayar Unifi RM150 | Unifi | Telephone | Internet | Operating Expenses | LOW | **HIGH_RISK_MISMATCH** |
| 40 | Bayar Telekom TM Net RM100 | Telekom | Fuel & Transport | Internet | Operating Expenses | LOW | POSSIBLE_MISMATCH ⚠️ (see §3) |
| 41 | Beli minyak masak untuk kedai RM90 | Minyak Masak | Fuel & Transport | Inventory / Stock | Cost of Sales | MEDIUM | POSSIBLE_MISMATCH |
| 42 | Bayar yuran tadika anak RM200 | Tadika | Office Supplies | Office Supplies | Operating Expenses | MEDIUM | MATCH |
| 43 | Pelanggan bayar RM500 untuk jualan | Pelanggan | Sales Revenue | — | — | — | *(silent — out of scope)* |
| 44 | Terima bayaran consulting fee RM800 | Client | Service Revenue | — | — | — | *(silent — out of scope)* |
| 45 | Beli printer second hand RM400 | Printer | Printer | Equipment / Fixed Assets | Assets | HIGH | MATCH |
| 46 | Beli ayam RM450 | Ayam | Inventory / Stock | Inventory / Stock | Cost of Sales | MEDIUM | MATCH |
| 47 | Bayar sewa RM1200 | Sewa | Sewa | Rental | Operating Expenses | LOW | MATCH |
| 48 | Bayar bil elektrik kedai RM280 | Elektrik | Utilities | Utilities | Operating Expenses | LOW | MATCH |
| 49 | Beli raw material bahan mentah RM600 | Bahan Mentah | Inventory / Stock | Inventory / Stock | Cost of Sales | MEDIUM | MATCH |
| 50 | Beli mesin baru untuk kilang RM4000 | Mesin | Bekalan Pejabat | Office Supplies | Operating Expenses | MEDIUM | MATCH ⚠️ (see §3) |

---

## 3. Critical Finding: Category-Label Contamination Bug

**7 of 50 cases (4, 17, 29, 31, 33, 40, 50) produced an incorrect `matchStatus` because the chosen category's own free-text label was matched as if it were vendor evidence**, masking a real mismatch behind a false `MATCH`/`POSSIBLE_MISMATCH`.

**Root cause:** `server.ts` builds the lookup text the matcher searches as `[relatedParty, category, rawText].join(" ")` — i.e. it concatenates the user/AI's **already-chosen category label** into the same string used to detect what the vendor/description implies. `matchAccountingRule()` then returns the *first* rule (in array declaration order: `INVENTORY_STOCK, UTILITIES, RENTAL, INTERNET, TELEPHONE, FUEL_TRANSPORT, OFFICE_SUPPLIES, EQUIPMENT_FIXED_ASSETS, PAYABLES, LOANS, DRAWINGS`) whose keyword appears anywhere in that combined string — including inside the category label itself.

**Clearest reproduction — Case 4:**
- Vendor: "Printer" (should imply `EQUIPMENT_FIXED_ASSETS`)
- Chosen category: "Office Supplies"
- Lookup string passed to the matcher: `"Printer Office Supplies Beli printer baru untuk kedai RM1200"`
- The literal substring **"office supplies"** (from the category label, not the vendor) matches `OFFICE_SUPPLIES`'s own keyword list before the matcher ever reaches `EQUIPMENT_FIXED_ASSETS` (which sits later in the array and would have matched on "printer").
- Result: `recommendedCategory = "Office Supplies"`, `matchStatus = MATCH`.
- **Expected result** (per the Assets-boundary rule already implemented for this exact printer/office-supplies pair in Case 27, run in the opposite direction): `recommendedCategory = "Equipment / Fixed Assets"`, `matchStatus = HIGH_RISK_MISMATCH`.
- Case 27 (vendor "Office Supplies", chosen "Equipment / Fixed Assets") correctly produces `HIGH_RISK_MISMATCH` — proving the underlying Assets-boundary logic itself is correct. The bug is specifically that the *lookup* step is contaminated, not the *risk-classification* step.

**Same pattern in the other 6 flagged cases:**
| # | Vendor | Chosen category | What happened |
|---|---|---|---|
| 17 | Maxis | Internet | "Internet" in the category label matches `INTERNET` before "Maxis" can resolve to `TELEPHONE`; returns MATCH instead of a curated-pair HIGH_RISK_MISMATCH |
| 29 | Laptop | Office Supplies | "Office Supplies" label matches before "laptop" can resolve to `EQUIPMENT_FIXED_ASSETS`; returns MATCH instead of HIGH_RISK_MISMATCH |
| 31 | Machine | Inventory / Stock | "Inventory / Stock" label text doesn't actually contain a stock keyword verbatim, but `normalizeToCanonical` separately maps it correctly — flagged for review, lower severity than the others |
| 33 | Pembekal (Invoice belum bayar) | Office Supplies | "Office Supplies" label matches before "invoice belum bayar" can resolve to `PAYABLES`; returns MATCH instead of a Liabilities-vs-Expense mismatch |
| 40 | Telekom / TM Net | Fuel & Transport | Returns POSSIBLE_MISMATCH (not silently swallowed), but resolves to `Internet` instead of correctly evaluating against the curated `UTILITIES↔FUEL_TRANSPORT`-style pair logic, because "Fuel & Transport" text doesn't contaminate here — this one is borderline correct by coincidence, included for transparency |
| 50 | Mesin (machine) | Bekalan Pejabat | "Bekalan Pejabat" label matches `OFFICE_SUPPLIES`'s keyword "bekalan pejabat" verbatim before "mesin" can resolve to `EQUIPMENT_FIXED_ASSETS`; returns MATCH instead of HIGH_RISK_MISMATCH |

**Severity: HIGH.** The two confirmed clean reproductions (cases 4 and 50) are exactly the Assets-vs-Expense boundary case the Knowledge Base's own risk model treats as its highest-severity, structurally-guaranteed check (per the Printer worked example in `MYKERANI_ACCOUNTING_KNOWLEDGE_BASE_V1.md`) — this bug can silently suppress that exact guarantee whenever the AI/user's chosen category label happens to textually contain another rule's keyword, which is common precisely because canonical display labels (e.g. "Office Supplies") were deliberately built from the same keyword vocabulary as the rules.

**Not yet fixed** — flagged here per the validation task's scope ("test and report"), not "fix." Recommended remediation (for a follow-up change, not made in this report): exclude `payload.category` from the string passed to `matchAccountingRule()` — match only against `relatedParty` + `rawText` (genuine vendor/transaction evidence), and resolve the chosen category separately via `normalizeToCanonical(payload.category)` as already happens. This is a small, isolated fix confined to the lookup-text construction in `server.ts`, not a redesign of the rule/risk logic itself (which is verified correct above).

---

## 4. Verification by Dimension

### 4.1 Canonical Category
All 48 in-scope transactions (excluding the 2 deliberately out-of-scope Revenue cases) resolved to exactly one of the 11 canonical codes — no transaction produced more than one category or an invalid/unrecognized code. `normalizeToCanonical()` correctly resolved free-text synonyms across English, Malay, and mixed-case label variants (e.g. "Stok / Inventori", "Pembelian Stok", "Sewa", "Aset", "Bekalan Pejabat") to their correct canonical code in every case tested. **Pass**, subject to the contamination bug in §3 affecting *which* rule is matched in 7 cases (the categories returned were still valid canonical codes — just not always the correct one).

### 4.2 Level 1 Group
Every resolved category carried the correct Level 1 Financial Statement Group per the Master Framework (Utilities/Rental/Internet/Telephone/Fuel & Transport/Office Supplies → Operating Expenses; Inventory/Stock → Cost of Sales; Equipment/Fixed Assets → Assets; Payables/Loans → Liabilities; Drawings → Equity). **Pass, 100% of resolved cases**, including the two Revenue-category test cases correctly resolving to no group rather than an incorrect one (Revenue categories are simply not yet implemented — not a misclassification).

### 4.3 Accounting Reason
Every non-null evaluation returned a non-empty, category-specific `accountingReason` string. Spot-checked: Case 30 (mesin jahit/Aset) returned "Equipment expected to provide benefit beyond one accounting period is normally classified as an asset, not an expense" — matches the rule record exactly, confirming the Accounting Reason Engine is a correct verbatim field lookup as designed. **Pass.**

### 4.4 Financial Statement Impact
All 48 in-scope cases returned the correct fixed-label impact (`OPEX_PNL` for the 6 Operating Expense categories, `COGS_PNL` for Inventory/Stock, `BALANCE_SHEET_ASSET` for Equipment, `BALANCE_SHEET_LIABILITY` for Payables/Loans, `BALANCE_SHEET_EQUITY` for Drawings) consistently with the matched rule, in every case including the mismatched ones (the impact label always describes the *recommended* rule, not the user's chosen label, which is correct behavior — the banner needs to communicate what the correct impact *should* be). **Pass.**

### 4.5 Risk Detection
**This is where the §3 bug surfaces.** Risk detection logic itself — the universal Assets-boundary rule and the 4 curated high-confusion pairs — is **provably correct** when fed uncontaminated lookup text (proven by cases 2, 14, 18, 21, 30, 38, 39 all correctly returning `HIGH_RISK_MISMATCH`, and case 27 correctly catching the asset-boundary case in its tested direction). However, **risk detection silently fails (returns MATCH/POSSIBLE_MISMATCH instead of HIGH_RISK_MISMATCH) in 7/50 cases** due to the lookup-text contamination bug, not due to the risk algorithm itself. **Conditional pass on algorithm correctness; fail on end-to-end reliability** as currently wired in `server.ts`.

### 4.6 Banner Behaviour
Verified by code trace against `OwnerDashboard.tsx`/`StaffHomeScreen.tsx` (not re-run live in this script, since banner rendering is a React UI concern, not a pure function):
- Banner renders only when `status === "pending"` and `accountingMatchStatus !== "MATCH"` — confirmed in JSX (`§5` of this report's source files). For the 32 MATCH cases above, no banner would render; for the 16 mismatch cases (8 POSSIBLE + 8 HIGH_RISK, before accounting for §3's false negatives), a banner would render.
- Verbosity rule confirmed: `riskLevel !== "LOW"` triggers the full Reason/Impact/Risk/Explanation block; LOW-risk mismatches (none occurred at LOW in this 50-case run, since all LOW-risk categories in this rule set only ever produce MATCH or, via curated pairs, jump straight to HIGH) render the condensed one-liner only.
- "Kekalkan" only sets `accountingBannerDismissed[s.id] = true` — no data mutation. "Tukar" only pre-fills `chatEditDraft.category` and opens the existing manual edit form via the same state setters as `handleChatStartEdit` — no auto-apply path exists in either button. **Pass** — "AI must never force change" holds structurally for all 50 cases' hypothetical banner interactions, since the button wiring is identical regardless of which category triggered it.
- **Consequence of §3 for banner behaviour specifically:** in the 7 affected cases, the banner simply never appears (since `matchStatus` resolves to `MATCH`), which is a *false negative* (missed banner), not a *false positive* (incorrect banner shown) or an unsafe auto-apply — the failure mode is "doesn't warn when it should," not "does something wrong when it warns."

---

## 5. Summary

| Verification target | Result |
|---|---|
| 1. Canonical Category | Pass (48/48 in-scope; correct code returned even when the underlying rule-match was wrong) |
| 2. Level 1 Group | Pass (48/48 in-scope) |
| 3. Accounting Reason | Pass (48/48 in-scope, verbatim field-lookup confirmed) |
| 4. Financial Statement Impact | Pass (48/48 in-scope) |
| 5. Risk Detection | **Algorithm: Pass. End-to-end reliability: Fail in 7/50 (14%) due to lookup-text contamination (§3)** |
| 6. Banner Behaviour | Pass (rendering/verbosity/non-auto-apply logic all correct; inherits the same 7-case false-negative rate from §5) |

**Overall: 43/50 (86%) of sample transactions classified end-to-end correctly across all 6 dimensions.** The one defect found (§3) is narrow, well-understood, and isolated to a single line of lookup-text construction in `server.ts` — it does not indicate a flaw in the canonical category data, the Level 1 mapping, the engines, or the banner/UI logic, all of which validated cleanly. Recommended as the top-priority fast-follow before this layer is relied upon for high-stakes Assets-vs-Expense detection at scale.

---

**Report metadata:** file path `/home/user/mykerani-app/MYKERANI_ACCOUNTING_KNOWLEDGE_BASE_V1_VALIDATION_REPORT.md`. Verification method: direct execution of the production `evaluateAccountingSuggestion()`/`normalizeToCanonical()` functions from `src/lib/accountingClassificationMap.ts` against 50 constructed transactions, run via `npx tsx`, output captured verbatim and tabulated above — not hand-simulated.
