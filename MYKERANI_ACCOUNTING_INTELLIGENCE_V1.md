# MyKerani — Accounting Intelligence Layer V1 (Design Blueprint, Not Implemented)

**Status:** Design only — no code written, no schema changed, per explicit instruction.
**File path:** `/home/user/mykerani-app/MYKERANI_ACCOUNTING_INTELLIGENCE_V1.md`
**Constraints honored:** no DB schema changes, no learning engine, no ranking engine — pure rules-based comparison layered onto the existing AI Suggest → User Confirm flow.

---

## 1. Architecture

A **stateless, deterministic rules engine** sitting between the LLM's raw classification output and the suggestion shown to the user — not a new service, not a new table, not a model. It runs entirely in `server.ts`, after `parsedResponse` is received from the AI provider and before the response is sent to the client.

```
┌─────────────────────────────────────────────────────────────┐
│ Existing flow (unchanged)                                    │
│ User message → system prompt → LLM → parsedResponse          │
│   { financialIntent, suggestions: [CONFIRM_TRANSACTION...] } │
└───────────────────────────┬───────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ NEW: Accounting Intelligence Layer (server.ts, pure function) │
│                                                                │
│  for each CONFIRM_TRANSACTION suggestion:                     │
│    1. userCategory = suggestion.payload.category               │
│       (the AI's own classification choice — this is the      │
│       "user's choice" surrogate at suggestion time, since      │
│       nothing has been confirmed yet; if the user edits the   │
│       category before confirming, re-run on the edited value) │
│    2. accountingCategory = lookupClassificationMap(            │
│         suggestion.payload.relatedParty,                      │
│         suggestion.payload.description / rawText)             │
│    3. matchStatus = compare(userCategory, accountingCategory)  │
│    4. attach { accountingRecommendation, matchStatus,         │
│       accountingConfidence } onto the suggestion object        │
└───────────────────────────┬───────────────────────────────────┘
                             │
                             ▼
        Response sent to client carries the extra fields;
        existing CONFIRM_TRANSACTION rendering is extended
        with a conditional "Cadangan Semakan" banner.
```

No new database table is needed because the rules map is **static, in-memory, code-defined data** (a TypeScript constant), not tenant data — it's identical for every tenant, the same way a tax-rate table would be, so it doesn't belong in Supabase.

---

## 2. Master Accounting Classification Map

A single new file, e.g. `src/lib/accountingClassificationMap.ts`, exporting a flat keyword → category lookup table. Structure (illustrative, matching the categories given):

```
ACCOUNTING_CLASSIFICATION_MAP: Array<{ category: string; keywords: string[] }>

[
  { category: "Utiliti",              keywords: ["tnb","syabas","air","electric","electricity","water","elektrik"] },
  { category: "Telekomunikasi",        keywords: ["maxis","celcom","digi","unifi","telekom","tm net"] },
  { category: "Bahan Api & Pengangkutan", keywords: ["petronas","shell","bhp","caltex","minyak kereta","tol","parking"] },
  { category: "Stok / Inventori",      keywords: ["ayam","ikan","sayur","tepung","minyak masak","beras","stok"] },
  { category: "Sewa",                  keywords: ["sewa","rental","premises rental"] },
  { category: "Aset",                  keywords: ["printer","computer","laptop","machine","equipment","mesin"] },
]
```

**Matching method (rules-based, no ML):** lowercase + normalize the transaction's `relatedParty`/`rawText`/`description`, then keyword-contains match against each category's list, same pattern already proven in `fetchKnowledgeBankMatches()`'s keyword stripping (`server.ts:1056-1072`) — reusing an established technique, not inventing a new one. First/best keyword hit wins; if zero categories match, `accountingCategory = null` and the layer is a no-op for that transaction (no recommendation shown — never invent a category from nothing).

This map is intentionally **separate from and does not replace** the Knowledge Bank or OCR Learned Patterns — it is a third, independent reference source used only for the compare-and-flag function, not for the AI's primary classification (which still happens exactly as today, per the "use existing transaction classification flow" constraint).

---

## 3. Match Status Determination

Given `userCategory` (what the AI/user has chosen) and `accountingCategory` (the map's lookup result):

| Condition | Match Status |
|---|---|
| No keyword match found in the map | *(no status shown — layer stays silent)* |
| `userCategory` (normalized) equals `accountingCategory`, or is a recognized synonym of it | `MATCH` |
| Categories differ, but both plausibly describe a legitimate business expense (e.g. user picked "Pembelian Stok" generically, map suggests "Stok / Inventori" — same concept, different label) | `POSSIBLE_MISMATCH` |
| Categories differ in a way that would misstate the nature of the expense for accounting purposes (e.g. user recorded a Printer purchase as "Bekalan Pejabat" expense instead of Aset — affects depreciation/balance sheet treatment) | `HIGH_RISK_MISMATCH` |

The HIGH_RISK threshold is rules-based, not fuzzy: specifically, any case where the map's category is **Aset** (capital item) but the user's category implies a regular operating expense (or vice versa) is always `HIGH_RISK_MISMATCH`, since that specific kind of error changes financial statement treatment (P&L vs. balance sheet), not just the label. All other category-label mismatches default to `POSSIBLE_MISMATCH`.

---

## 4. Confidence Scoring

A second, independent confidence score — **distinct from the AI's existing `confidenceScore`** on the suggestion (which reflects classification certainty), this one reflects **match-detection certainty**:

| Signal | Contribution |
|---|---|
| Exact keyword match (e.g. "TNB" found verbatim in `relatedParty`) | High (~0.9) |
| Partial/fuzzy keyword match (e.g. "Tenaga Nasional" matched against "tnb"/"electric" stem) | Medium (~0.6–0.7) |
| Match only via generic description text, not vendor name | Lower (~0.4–0.5) |

This `accountingConfidence` is shown alongside the recommendation so the user can gauge how sure the *recommendation* is — separate from how sure the AI is about the underlying transaction details. A `POSSIBLE_MISMATCH`/`HIGH_RISK_MISMATCH` banner is only surfaced when `accountingConfidence ≥ 0.5`, to avoid nagging the user over a weak/coincidental keyword hit.

---

## 5. Flow Integration (AI Suggest → User Confirm, unchanged shape, new content)

1. AI returns `CONFIRM_TRANSACTION` suggestion exactly as today (`server.ts:879-890`, unchanged JSON shape from the LLM's perspective).
2. **New step**, server-side, after `parsedResponse` is parsed and before the HTTP response is sent: run the Accounting Intelligence Layer over each `CONFIRM_TRANSACTION` suggestion, attach the 3 new fields.
3. Client receives the suggestion with the extra fields and renders the existing suggestion card (unchanged) **plus** a new conditional banner if `matchStatus !== "MATCH"` and `accountingConfidence ≥ 0.5`.
4. User sees:
   ```
   Cadangan Semakan
   Berdasarkan amalan perakaunan biasa,
   transaksi ini lazimnya direkodkan sebagai:
   [Recommended Category]
   Adakah anda ingin kekalkan pilihan asal atau tukar?
   ```
   with two buttons: **Kekalkan** (keep as-is, dismiss banner, proceed to confirm unchanged) and **Tukar ke [Recommended Category]** (pre-fills the existing edit-category field, same mechanism already used by `handleChatStartEdit`/category editing — no new edit pathway needed).
5. Either choice still ends at the same **Confirm** button as today — the AI/engine never writes the record itself, never blocks confirmation, and never changes the category without the explicit "Tukar" tap. This satisfies "AI must never force change" structurally, not just by convention: the banner has no auto-apply path, only a button that pre-fills the *existing* manual edit field.
6. Once confirmed (with whichever category the user ended up with), the rest of the flow — `addFinancialEvent`, `learnOcrPattern`, audit logging — proceeds exactly as it does today, completely untouched.

---

## 6. Screens Involved

| Screen | Change |
|---|---|
| `src/screens/OwnerDashboard.tsx` (chat suggestion rendering, ~line 1949-1980) | Add a new conditional banner block, styled identically to the existing `crossWorkspaceHints` amber banner pattern at line 1969-1980 (same component shape: message + "Tukar" button) — this is a near-exact precedent already in the codebase, minimizing new UI surface. |
| `src/screens/StaffHomeScreen.tsx` (mirrors OwnerDashboard's chat suggestion rendering) | Same banner addition, same pattern. |
| `src/components/AIFinancialAssistant.tsx` | Same banner addition if this surface's suggestion cards are intended to carry it too (lower priority — this surface is the general Q&A assistant, less central to the day-to-day transaction-confirmation flow than the two screens above). |

No new screen, no new modal, no new route — purely an additive block inside existing suggestion cards.

---

## 7. API Changes

**No new endpoint.** `/api/ai/assistant`'s existing response shape gains 3 optional fields per suggestion (additive, backward compatible — old clients simply ignore unknown fields):

```
suggestions[i].payload now optionally also carries:
  accountingRecommendation: string | null   // e.g. "Utiliti"
  accountingMatchStatus: "MATCH" | "POSSIBLE_MISMATCH" | "HIGH_RISK_MISMATCH" | null
  accountingConfidence: number | null       // 0.0–1.0
```

These are computed server-side in `server.ts`, inside the existing `/api/ai/assistant` handler, immediately after `parsedResponse` is obtained (around `server.ts:895-912`, where `parsedResponse` is finalized) and before it's returned to the client. No change to the request shape (`financialContext` sent by the client stays exactly as today).

---

## 8. Prompt Changes

**None required, by design.** The constraint "use existing transaction classification flow" and "do not build a learning/ranking engine" point toward keeping this as a **post-processing rules layer**, not a prompt instruction asking the LLM to self-check against accounting practice (which would be non-deterministic and harder to audit/explain). The master classification map is deterministic code, applied identically regardless of which LLM provider answered the query (`callAiProvider`'s candidate fallback chain, unaffected).

*(Optional, not required for v1):* the `text` field's tone could later be told via a one-line prompt addition to avoid contradicting the banner (e.g. "if your suggested category will be cross-checked against standard accounting practice afterward, you don't need to second-guess yourself here") — but this is unnecessary for V1 since the banner is purely additive UI, not a contradiction risk.

---

## 9. Files to Modify (V1 scope)

| File | Change type |
|---|---|
| `src/lib/accountingClassificationMap.ts` | **New file** — the keyword→category map + a pure `matchAccountingCategory(text): { category, confidence } \| null` function |
| `server.ts` | Modify — import the map, run the comparison over `parsedResponse.suggestions` post-LLM-call, attach the 3 fields per `CONFIRM_TRANSACTION` suggestion |
| `src/screens/OwnerDashboard.tsx` | Modify — render the "Cadangan Semakan" banner conditionally inside the existing suggestion-card block |
| `src/screens/StaffHomeScreen.tsx` | Modify — same banner, mirrored |
| `src/components/AIFinancialAssistant.tsx` | Modify (optional/secondary surface) — same banner if in scope |
| `src/types.ts` (if `ChatSuggestion`/payload types are centrally typed there) | Modify — extend the suggestion payload type with the 3 new optional fields for type safety |

No migration file, no new table, no new RLS policy — confirmed zero database footprint.

---

## 10. Implementation Effort Estimate

| Component | Effort |
|---|---|
| Classification map + matcher function | Small — a static data file plus one pure function, directly reusing the keyword-normalization technique already proven in `fetchKnowledgeBankMatches()` |
| `server.ts` integration | Small — a single post-processing step inserted at one point in an already-traced code path, no new control flow branches elsewhere |
| UI banner (×2-3 screens) | Small–Medium — mostly copy-adapt of the existing `crossWorkspaceHints` banner pattern (markup, button, "Tukar" wiring into the pre-existing category-edit field), repeated across screens |
| Type updates | Trivial |
| **Testing** | Medium — primarily manual verification across the 6 example category groups + a few synonym/edge cases (e.g. "Pembelian Stok" vs. "Stok / Inventori" labeling consistency), since this is deterministic logic with no model/training step to validate |

**Overall: Small-to-Medium** — the largest practical cost is UI repetition across 2-3 screens, not engine complexity, since the comparison logic itself is a straightforward keyword lookup with no schema, no learning, and no new endpoints.

---

**Report metadata:** file path `/home/user/mykerani-app/MYKERANI_ACCOUNTING_INTELLIGENCE_V1.md`. This is a blueprint only — no code, schema, prompt, or API was changed while producing this report, per the explicit "do not implement yet" instruction.
