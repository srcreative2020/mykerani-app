# MyKerani — Accounting Knowledge Base V1 (Design Blueprint, Not Implemented)

**Status:** Design only — upgrades the prior `MYKERANI_ACCOUNTING_INTELLIGENCE_V1.md` blueprint from a 3-field keyword→category matcher into a richer, explainable knowledge base. No code, schema, or prompt changes made.
**File path:** `/home/user/mykerani-app/MYKERANI_ACCOUNTING_KNOWLEDGE_BASE_V1.md`
**Constraints honored (unchanged from V1):** stateless architecture, no database changes, no new service, no new AI model, existing banner design reused, AI Suggest → User Confirm flow unchanged.

---

## What's Changing From V1

V1's map was a flat `{ category, keywords[] }` lookup producing 3 outputs (`accountingRecommendation`, `matchStatus`, `accountingConfidence`). This upgrade replaces each map entry with a **structured accounting rule record** carrying 5 fields instead of 1, and adds three small, pure-function "engines" that derive the banner's text from those fields rather than from a single hardcoded message. The comparison logic (keyword match → match status → confidence) from V1 is **unchanged and reused as-is** — this upgrade only enriches what happens *after* a match is found, not how matching itself works.

---

## 1. Architecture

Same shape as V1 — still a stateless post-LLM rules layer in `server.ts`, still zero new services, still zero schema. The only structural addition is that the single classification map file now exports richer records, and the server-side post-processing step calls three small pure functions instead of one inline comparison:

```
parsedResponse (from LLM, unchanged)
        │
        ▼
┌────────────────────────────────────────────────────────┐
│ Accounting Knowledge Base lookup (same matching step    │
│ as V1 — keyword-contains against relatedParty/rawText)  │
│   → finds the matching AccountingRule record (if any)   │
└───────────────────────┬──────────────────────────────────┘
                         │ AccountingRule found
                         ▼
┌──────────────────┬──────────────────┬───────────────────┐
│ Accounting Reason │ Financial Impact │ Risk Explanation  │
│ Engine             │ Engine            │ Engine            │
│ (pure lookup of    │ (pure lookup of   │ (pure lookup of   │
│ rule.reason)       │ rule.statementImpact)│ rule.riskLevel + │
│                    │                    │ rule.explanation) │
└──────────────────┴──────────────────┴───────────────────┘
                         │
                         ▼
   Suggestion gains: accountingRecommendation, matchStatus,
   accountingConfidence (all from V1, unchanged) PLUS
   accountingReason, financialStatementImpact, riskLevel,
   explanationText (new)
```

Calling these "engines" is a naming/design clarity choice, not a complexity increase — each one is a single-purpose pure function reading a static field off the matched rule record. They exist as separate named functions (rather than one big function) so each concern — *why*, *what statement impact*, *what risk and explanation* — can be reasoned about, tested, and (if ever needed) overridden independently, without coupling them into one monolithic formatter.

---

## 2. Knowledge Base Structure

The map file (`src/lib/accountingClassificationMap.ts`, same file as V1, restructured) now exports an array of `AccountingRule` records instead of bare category/keyword pairs:

```
interface AccountingRule {
  id: string;                    // stable key, e.g. "UTILITIES"
  recommendedCategory: string;   // "Utiliti" / "Utilities"
  keywords: string[];            // ["tnb","syabas","air","electric",...]
  accountingReason: string;      // why this classification applies
  financialStatementImpact:      // which statement + line item
    "OPEX_PNL" | "COGS_PNL" | "BALANCE_SHEET_ASSET" | "BALANCE_SHEET_LIABILITY";
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  explanationText: string;       // user-facing plain-language explanation
}
```

This is still a **static, code-defined constant** — not tenant data, not a learned table, identical for every tenant, exactly like a tax-rate table. It sits beside, and is fully independent of, the Knowledge Bank (`knowledge_bank_scenarios`) and OCR Learned Patterns — no overlap, no shared write path, no new database footprint.

---

## 3. Rules Structure — Worked Examples (from the user's spec)

```
{
  id: "UTILITIES",
  recommendedCategory: "Utiliti",
  keywords: ["tnb","syabas","air","electric","electricity","water","elektrik"],
  accountingReason: "Electricity/water expenses are normally classified as utilities.",
  financialStatementImpact: "OPEX_PNL",
  riskLevel: "LOW",
  explanationText: "Transaksi ini lazimnya direkodkan sebagai perbelanjaan utiliti mengikut amalan perakaunan biasa."
}
```

```
{
  id: "ASSETS",
  recommendedCategory: "Aset",
  keywords: ["printer","computer","laptop","machine","equipment","mesin"],
  accountingReason: "Equipment expected to provide benefit beyond one accounting period is normally classified as an asset.",
  financialStatementImpact: "BALANCE_SHEET_ASSET",
  riskLevel: "HIGH",
  explanationText: "Merekodkan ini sebagai perbelanjaan boleh menyebabkan perbelanjaan terlebih nyata (overstated) dan aset kurang nyata (understated) dalam penyata kewangan."
}
```

The remaining 4 categories from V1 (Telekomunikasi, Bahan Api & Pengangkutan, Stok/Inventori, Sewa) follow the same 5-field shape — e.g. Stok/Inventori would carry `financialStatementImpact: "COGS_PNL"` (cost of goods sold, not generic opex) and `riskLevel: "LOW"`-to-`"MEDIUM"` depending on whether the user mislabeled it as a generic expense vs. something more structurally wrong (e.g. recording stock purchases as an Asset, which would be the cross-category HIGH-risk case carried over from V1's logic).

**Risk Level assignment principle** (extends, doesn't replace, V1's HIGH_RISK_MISMATCH rule): `riskLevel` is a property of the *rule itself* (how consequential a misclassification of this category type generally is), while `matchStatus` (from V1, unchanged) is a property of the *specific comparison* (whether this transaction's user-chosen category actually conflicts with the rule). A transaction can have a HIGH `riskLevel` rule but still resolve to `MATCH` status if the user already picked correctly — risk level informs *how prominently* to word the banner, match status decides *whether* to show it at all.

---

## 4. The Three Engines

All three are pure, synchronous, stateless functions operating only on the matched `AccountingRule` record and the V1 comparison result — no I/O, no async, no new dependency.

### Accounting Reason Engine
```
getAccountingReason(rule: AccountingRule): string
  → returns rule.accountingReason verbatim
```
Trivial by design — the "engine" here is really the *structure* (every rule must carry a reason, enforced by the TypeScript interface), not runtime logic. This guarantees the system can never show a recommendation without also being able to justify it, which is the actual upgrade over V1 (V1 could recommend a category with no stated reason).

### Financial Impact Engine
```
getFinancialStatementImpact(rule: AccountingRule): string
  → maps the internal enum to a display label, e.g.
    OPEX_PNL → "Operating Expenses (Profit & Loss)"
    COGS_PNL → "Cost of Goods Sold (Profit & Loss)"
    BALANCE_SHEET_ASSET → "Balance Sheet Asset"
    BALANCE_SHEET_LIABILITY → "Balance Sheet Liability"
```
A small, fixed lookup table — not a calculation, since this layer never computes actual statement *numbers*, only labels *which* statement/line-item a category conventionally affects. Staying label-only (not numeric) is what keeps this stateless and out of "build a learning/ranking engine" territory — it never touches `financialEvents` totals or running balances.

### Risk Explanation Engine
```
getRiskExplanation(rule: AccountingRule, matchStatus: MatchStatus): { riskLevel, explanationText } | null
  → if matchStatus === "MATCH": returns null (no banner needed)
  → else: returns { riskLevel: rule.riskLevel, explanationText: rule.explanationText }
```
This is the one engine with a real (if simple) branch: it's the gatekeeper that decides the banner only ever appears on a mismatch, reusing V1's `matchStatus` computation unchanged. Risk level and explanation text are otherwise pulled straight from the static rule, same pattern as the other two engines.

---

## 5. UI Behaviour

**Banner design is unchanged from V1** (same `crossWorkspaceHints`-pattern card, same "Tukar"/"Kekalkan" button pair, same trigger condition: only shown when `matchStatus !== "MATCH"` and confidence clears the threshold). What's new is the **content density** inside the existing banner shape:

```
┌──────────────────────────────────────────────────────────┐
│ Cadangan Semakan                                          │
│                                                             │
│ Berdasarkan amalan perakaunan biasa, transaksi ini         │
│ lazimnya direkodkan sebagai: Aset                          │
│                                                             │
│ Sebab: Equipment expected to provide benefit beyond one    │
│ accounting period is normally classified as an asset.      │
│                                                             │
│ Kesan Penyata Kewangan: Balance Sheet Asset                │
│ Tahap Risiko: 🔴 HIGH                                       │
│                                                             │
│ Penjelasan: Merekodkan ini sebagai perbelanjaan boleh       │
│ menyebabkan perbelanjaan terlebih nyata dan aset kurang     │
│ nyata dalam penyata kewangan.                               │
│                                                             │
│ Adakah anda ingin kekalkan pilihan asal atau tukar?         │
│        [ Kekalkan ]      [ Tukar ke Aset ]                  │
└──────────────────────────────────────────────────────────┘
```

A risk-level color/icon cue (e.g. 🟢 LOW / 🟡 MEDIUM / 🔴 HIGH) is the only new *visual* element; everything else is additional text inside the same card component. For LOW-risk matches, the UI may render a condensed one-line version (category + short reason only) to avoid over-explaining trivial cases like a TNB bill — full Reason/Impact/Risk/Explanation expansion is reserved for MEDIUM/HIGH risk levels, keeping the common case lightweight. This is a presentation choice, not a new engine — same data, different verbosity.

**"AI must never force change" still holds structurally**: "Tukar" still only pre-fills the existing manual category-edit field; there is still no auto-apply path anywhere in this design.

---

## 6. Example Outputs

**Input:** "Bayar TNB RM320", user/AI category = "Utiliti"
- Match found: `UTILITIES` rule. User category already equals recommended category → `matchStatus: MATCH` → **no banner shown** (per the Risk Explanation Engine's gatekeeper rule).

**Input:** "Beli printer baru RM1200", AI category = "Perbelanjaan Pejabat" (Office Expense)
- Match found: `ASSETS` rule, recommended = "Aset". Categories differ, and the rule's nature (asset vs. expense) makes this the HIGH-risk cross-category case →
  - `matchStatus: HIGH_RISK_MISMATCH`
  - `accountingReason`: "Equipment expected to provide benefit beyond one accounting period is normally classified as an asset."
  - `financialStatementImpact`: "Balance Sheet Asset"
  - `riskLevel`: "HIGH"
  - `explanationText`: "Recording this as an expense may overstate expenses and understate assets."
  - Full banner shown (per §5), both buttons active.

**Input:** "Beli ayam RM450", AI category = "Pembelian Stok"
- Match found: `INVENTORY` rule, recommended = "Stok / Inventori". Same underlying concept, different label →
  - `matchStatus: POSSIBLE_MISMATCH`, `riskLevel: LOW`
  - Condensed one-line banner per §5's LOW-risk presentation rule (or suppressed entirely if the project decides label-only differences shouldn't surface a banner at all — a presentation-tuning decision left open for the implementation phase, not a blueprint gap).

---

## 7. Implementation Effort

| Component | Effort | Delta vs. V1 |
|---|---|---|
| Rule record restructuring (1 field → 5 fields per entry) | Small | Pure data-authoring work — same file, same number of categories, more fields per entry |
| Three engine functions | Small | Two are trivial field-lookups; the third (Risk Explanation gatekeeper) reuses V1's `matchStatus` with one added branch |
| `server.ts` integration | Small | Same single post-processing insertion point as V1; payload gains 4 more optional fields instead of 1 |
| UI banner content | Small–Medium | Same component/pattern as V1, more text rows + a risk-level icon; the LOW/MEDIUM/HIGH verbosity toggle is the only new UI *logic* (a simple conditional render, not new state) |
| Type updates | Trivial | Extend the same payload type touched in V1 |
| **Testing** | Medium | Same manual-verification approach as V1, now also checking that Reason/Impact/Risk/Explanation text reads coherently per category — still no model training, still deterministic |

**Overall: Small-to-Medium, marginal increase over V1** — this upgrade is almost entirely additive data authoring (more fields per existing rule) plus a UI text-density change, not new architecture. All of V1's constraints (stateless, no DB, no new service, no new model, same banner shape, same Suggest→Confirm flow) remain fully satisfied.

---

**Report metadata:** file path `/home/user/mykerani-app/MYKERANI_ACCOUNTING_KNOWLEDGE_BASE_V1.md`. Blueprint only — no code, schema, prompt, or API was changed while producing this report.
