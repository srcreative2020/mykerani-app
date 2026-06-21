# MyKerani — AI Chat Transaction Flow Audit

**Scope:** End-user transaction experience only (chat → AI suggestion → user confirmation).
**Method:** Direct code trace of `sendChat()` (OwnerDashboard.tsx / StaffHomeScreen.tsx), the `/api/ai/assistant` handler in `server.ts`, `fetchKnowledgeBankMatches()`, `learnOcrPattern()` in `FinancialRecordsContext.tsx`, and the suggestion-card UI/confirm handler. No behavior in this report is assumed — every claim below traces to a specific function.
**Simulated inputs:**
1. Saya beli ayam RM450
2. Saya isi minyak RM80
3. Saya bayar TNB RM350
4. Saya terima bayaran pelanggan RM1200
5. Saya bayar supplier RM500
6. Saya bayar sewa kedai RM1200
7. Saya beli barang di Family Store RM1250

---

## How the pipeline actually works (read this once, applies to every scenario below)

```
User types message
  → sendChat() bundles { query, financialContext: { activeTenant, activeWorkspace,
     financialEvents, personalProfile, businesses, vehicles, dependents }, userId }
  → POST /api/ai/assistant
      → consumeResourceCredit() (AI credit deducted up front)
      → fetchKnowledgeBankMatches(query)  — keyword-overlap lookup against
        knowledge_bank_scenarios (HQ-curated; EMPTY by default, no seed data exists)
      → builds one big system prompt: financial data + OCR learned patterns
        + Knowledge Bank matches + personal/business/vehicle/dependent profile
        + locked instructions (suggest-first, disambiguation rules, output schema)
      → calls LLM (Gemini/OpenAI/Anthropic/... cascade)
      → if financialIntent.detected AND no Knowledge Bank match → logs a
        "knowledge_bank_gap" for HQ to review later
      → returns parsed JSON { text, financialIntent, suggestions, ... } as-is
  → client renders a suggestion card: type, category, amount, confidence %
  → IF multi-business: user must tap a business chip before anything else
  → user may tap Edit, attach/skip evidence, then tap Sahkan (Confirm)
  → on Confirm: addFinancialEvent()/addDebtRecord()/etc. is called,
    THEN learnOcrPattern() is called using whatever relatedParty/category/amount
    was on the (possibly user-edited) suggestion at confirm time
```

Three facts shape every scenario below:
- **The Knowledge Bank table is empty by default.** There is no seeded mapping for "ayam," "TNB," "minyak," "Family Store," or anything else. Every one of the 7 inputs hits pure LLM general-knowledge inference on a brand-new workspace.
- **Learning only happens at confirm-time, never at suggestion-time.** A vendor name only becomes a reusable pattern after the user has confirmed it once with that name attached — if the AI suggests with `relatedParty: null` and the user confirms without editing it, nothing useful is learned for next time.
- **Confidence shown to the user is whatever the LLM put in the JSON response** (default 0.7 if absent) — it is not computed from `ocr_learned_patterns` at suggestion time; the rolling-average formula in `learnOcrPattern()` only updates the *stored* pattern's score after confirmation, for the *next* lookup.

---

## Scenario-by-Scenario Audit

### 1. "Saya beli ayam RM450"

| Dimension | Behavior |
|---|---|
| **Current system behavior** | AI detects EXPENSE, amount=450, but has no merchant/vendor name in the sentence. Per the suggest-first rule, it suggests anyway with `relatedParty: null` (or "Tidak Dinyatakan"). |
| **AI reasoning** | No Knowledge Bank match (empty table). No OCR-learned pattern match (no prior "ayam" vendor learned). Falls through to general LLM world-knowledge: "beli ayam" → food/raw-material purchase → EXPENSE, category guess e.g. "Bahan Mentah"/"Makanan". |
| **Profile usage** | Not used — no vehicle/business/dependent ambiguity keywords present. |
| **Memory usage** | None available on a fresh workspace; if "ayam" was confirmed before with a vendor name attached, that pattern would now be checked first and override generic guessing. |
| **Archive usage** | Not used at all — chat archive is never re-read by the AI. |
| **Situation bank usage** | None — Knowledge Bank table empty. |
| **Confidence calculation** | LLM-supplied estimate only, typically mid-range (~0.65–0.75) since no vendor name is given; rendered amber. |
| **Workspace selection logic** | If tenant has multiple active businesses, user is forced to pick one via chip buttons before confirming — AI does not infer which business "ayam" belongs to. |
| **Friction** | If the user doesn't bother editing the vendor field before confirming, this transaction silently fails to ever become a learnable pattern — repeats the same generic guess forever. |

### 2. "Saya isi minyak RM80"

| Dimension | Behavior |
|---|---|
| **Current system behavior** | EXPENSE detected, category likely "Pengangkutan"/"Minyak". If 2+ vehicles exist on the profile and the vehicle isn't named, the AI is instructed to **withhold the suggestion entirely** and ask a clarifying question instead. |
| **AI reasoning** | "minyak" (fuel) is one of the explicit vehicle-disambiguation trigger keywords baked into the system prompt (alongside toll, parking, service, repair, road tax, insurance). |
| **Profile usage** | Directly drives a forced-question branch: if `vehicles.length >= 2`, the AI must ask "Untuk kenderaan mana — Hilux (Perniagaan) atau Myvi (Peribadi)?" before doing anything else. |
| **Memory usage** | Not consulted for vehicle choice; once the user replies naming a vehicle, the *next* turn treats it as the missing detail for the same transaction and proceeds. |
| **Archive usage** | None. |
| **Situation bank usage** | None (empty table); a literal "fuel = transport expense" rule is exactly the kind of thing the Knowledge Bank is designed for but currently has zero entries seeded. |
| **Confidence calculation** | Suppressed entirely until vehicle is named — no suggestion, no confidence shown, on the first turn if 2+ vehicles exist. With 0 or 1 vehicle, confidence is LLM-estimated, generally higher than scenario 1 since "minyak" is an unambiguous category keyword. |
| **Workspace selection logic** | Same business-chip gate as scenario 1; vehicle ownership (`PERSONAL`/`BUSINESS`) is separately used to decide whether this becomes a business EXPENSE or a personal/owner-drawing transaction — a second classification axis layered on top of the business-chip gate. |
| **Friction** | **Two-step round trip** is unavoidable today if the user has 2+ vehicles and doesn't name one in the first message — the user must read the AI's question, retype/reply with the vehicle name, then see the actual suggestion. This is real friction baked in by design, not a bug, but it is a forced extra turn every single time fuel is mentioned for a multi-vehicle profile. |

### 3. "Saya bayar TNB RM350"

| Dimension | Behavior |
|---|---|
| **Current system behavior** | EXPENSE or PAYABLE/COMMITMENT detected depending on phrasing; "TNB" is recognized by the LLM's general knowledge as Tenaga Nasional Berhad (the national electricity utility), independent of any app-side special-casing. |
| **AI reasoning** | If a workspace happens to already have a "TNB"/"Tenaga Nasional Berhad" `financial_commitments` row seeded (true for demo/seeded workspaces only — see `seeder.ts`), the AI's financial-data context includes that commitment, increasing confidence and possibly matching it to an existing recurring obligation rather than creating a fresh ad-hoc expense. For a brand-new real tenant with no seeded data, there is no such advantage — TNB is recognized purely from LLM world knowledge, identically to "ayam." |
| **Profile usage** | Not used. |
| **Memory usage** | Checked: if this workspace previously confirmed a "TNB"/"Tenaga Nasional Berhad" expense with a vendor name attached, the learned pattern's category/type is reused with rising confidence on repeat occurrences. |
| **Archive usage** | None. |
| **Situation bank usage** | None (empty table) — this is precisely the kind of universally-true utility-bill mapping that would benefit most from a pre-seeded Knowledge Bank entry, since every Malaysian SME pays TNB and there's no tenant-specific ambiguity to wait and learn from. |
| **Confidence calculation** | LLM-estimated on a fresh workspace; rises via the rolling-average formula in `learnOcrPattern()` after repeat confirmations with a consistent vendor name. |
| **Workspace selection logic** | Same business-chip gate. |
| **Friction** | None vehicle/dependent-related. The only friction is the business-chip gate (if multi-business) and the missed opportunity of not having this universally-known vendor pre-seeded. |

### 4. "Saya terima bayaran pelanggan RM1200"

| Dimension | Behavior |
|---|---|
| **Current system behavior** | INCOME or RECEIVABLE settlement detected ("terima bayaran" = received a payment; "pelanggan" = customer, generic, no name given). |
| **AI reasoning** | Without a customer name, the AI cannot tell whether this is brand-new INCOME or the **settlement of an existing RECEIVABLE** already on the books for that customer. The system prompt's suggest-first rule still applies — it will guess INCOME by default rather than checking for a matching open receivable, unless the financial-data context (which does include the receivables list) happens to surface an obvious single match for the LLM to notice on its own. There is no deterministic, code-level "match against open receivables" step before the LLM call — it's entirely left to the LLM's own reading of the receivables list embedded in the prompt. |
| **Profile usage** | Not used. |
| **Memory usage** | `relatedParty` is generic ("pelanggan"), so no specific OCR-learned vendor pattern can match — this input is too vague to ever become a learnable pattern under the current vendor-keyed matching scheme. |
| **Archive usage** | None. |
| **Situation bank usage** | None. |
| **Confidence calculation** | Likely lower/medium confidence given the ambiguity between fresh INCOME vs. RECEIVABLE settlement — but this is not enforced; the system has no explicit rule forcing a clarifying question here the way it does for vehicles. This is a **gap**, not a deliberate design choice. |
| **Workspace selection logic** | Same business-chip gate. |
| **Friction** | Real risk of **misclassification with no safety net**: a receivable settlement could get recorded as fresh income, double-counting revenue and leaving the original receivable open forever, with no AI-side prompt to catch it. The user must manually notice and correct this. |

### 5. "Saya bayar supplier RM500"

| Dimension | Behavior |
|---|---|
| **Current system behavior** | EXPENSE or PAYABLE settlement detected; "supplier" given as the only party descriptor, no name. |
| **AI reasoning** | Same structural issue as scenario 4 in the opposite direction: paying "a supplier" could be a fresh ad-hoc EXPENSE or the settlement of an existing PAYABLE already recorded for a named supplier — again left entirely to the LLM's own reading of the embedded payables list, no deterministic match step. |
| **Profile usage** | Not used. |
| **Memory usage** | Generic party name ("supplier") means no vendor-specific learned pattern can be matched or created meaningfully. |
| **Archive usage** | None. |
| **Situation bank usage** | None. |
| **Confidence calculation** | LLM-estimated, no forced disambiguation. |
| **Workspace selection logic** | Same business-chip gate. |
| **Friction** | Same double-counting/PAYABLE-left-open risk as scenario 4, mirrored on the expense side. |

### 6. "Saya bayar sewa kedai RM1200"

| Dimension | Behavior |
|---|---|
| **Current system behavior** | "sewa" (rent) is a `financial_commitments` concept in this schema — recurring rent obligations are meant to live there. The AI must decide between EXPENSE (one-off) and COMMITMENT (recurring), and whether this matches an *existing* commitment row already tracked for "kedai" (shop) rent. |
| **AI reasoning** | If a `financial_commitments` row already exists for shop rent (common in seeded/demo workspaces — see the "Cheras Serviced Apartment rental lease"-style preset pattern noted in `FinancialRecordsContext.tsx`), the AI's embedded commitments context can match it; for a real new tenant with no prior commitment recorded, the AI must infer COMMITMENT vs. EXPENSE purely from the word "sewa," again with no deterministic rule, just LLM judgment. |
| **Profile usage** | Not used — yet this is exactly the kind of input where multi-business ambiguity matters most (which shop's rent?), and that's handled, but only via the generic post-suggestion business-chip gate, not by reasoning about "kedai" referring to a specific named business location. |
| **Memory usage** | Checked against `ocr_learned_patterns` if "kedai" or a specific landlord name was previously confirmed as a vendor. |
| **Archive usage** | None. |
| **Situation bank usage** | None — "monthly shop rent" is another universally-applicable SME scenario that a seeded Knowledge Bank entry would resolve deterministically rather than leaving to LLM guesswork every time. |
| **Confidence calculation** | LLM-estimated. |
| **Workspace selection logic** | Standard business-chip gate; does not use the word "kedai" to pre-select a business even when a business profile's `branchName` might literally match. |
| **Friction** | Same EXPENSE-vs-COMMITMENT ambiguity risk as scenario 4/5's INCOME-vs-RECEIVABLE issue — no safety net, no clarifying question triggered, purely LLM judgment call. |

### 7. "Saya beli barang di Family Store RM1250"

| Dimension | Behavior |
|---|---|
| **Current system behavior** | EXPENSE detected, vendor name explicitly given this time ("Family Store") — the one scenario among the 7 with a real, nameable vendor in the sentence itself. |
| **AI reasoning** | No Knowledge Bank match (empty table, and "Family Store" is not a literal, codebase-special-cased name anywhere). Falls to general LLM inference: retail/general-goods purchase, category likely "Bekalan"/"Pembelian Runcit". |
| **Profile usage** | Not used. |
| **Memory usage** | Because a real vendor name is present, **this is the one scenario most likely to actually become a useful learned pattern** once confirmed — `vendorMatchKey("Family Store")` normalizes cleanly and future "Family Store" purchases will fuzzy-match even with minor spelling drift. |
| **Archive usage** | None. |
| **Situation bank usage** | None. |
| **Confidence calculation** | LLM-estimated on first occurrence (~0.7); rises via the rolling-average formula on each subsequent confirmed "Family Store" purchase. |
| **Workspace selection logic** | Standard business-chip gate. |
| **Friction** | Lowest-friction of the 7 scenarios precisely because a vendor name is present — demonstrates that the *whole system's* quality is gated almost entirely on whether the user happens to mention a name, not on any deeper reasoning. |

---

## Cross-Scenario Findings

### Unnecessary questions
- None of the 7 inputs trigger an *unnecessary* question by design — the system is explicitly suggest-first and does not ask for missing vendor names (scenarios 1, 4, 5). The one mandatory question (vehicle disambiguation, scenario 2) is justified, not unnecessary, but still a real interruption every time it fires.

### Missing automation
- **No deterministic "does this match an open receivable/payable/commitment?" check** before the LLM call for scenarios 3, 4, 5, 6 — entirely delegated to the LLM noticing it on its own from an embedded list, with no fallback safety net or explicit cross-check.
- **No business auto-inference from vendor/keyword context** — "kedai" (shop) rent or a known supplier tied to one specific business in the past still forces the same generic chip-picker every time, even when the answer is obvious from history.
- **No vendor-name backfill nudge** — when the AI suggests with `relatedParty: null` (scenarios 1, 4, 5), there's no UI nudge encouraging the user to add a name before confirming, even though doing so is the single biggest lever for improving future suggestions.

### Missing suggestions
- **Knowledge Bank is empty by default** — universally true scenarios (TNB = utility, fuel = transport, shop rent = commitment) get zero benefit from the one system specifically built to encode them, because no one has seeded it. This is the single largest missed opportunity across all 7 scenarios.
- **No "this looks like settling an existing receivable/payable" suggestion variant** — the suggestion schema appears to only support fresh `CONFIRM_TRANSACTION`, not a "match + settle existing record" action type, based on the client-side filter that only renders `actionType === "CONFIRM_TRANSACTION"`.

### User friction
- Forced two-turn round trip on any ambiguous multi-vehicle fuel/toll/parking mention (scenario 2).
- Forced business-chip pick on every single confirmation for multi-business tenants, regardless of how confidently inferable the business is from context (e.g., "kedai," a known supplier).
- Silent risk of misclassified income/expense vs. receivable/payable settlement with no warning surfaced to the user (scenarios 4, 5, 6).

### Extra clicks
- Business chip tap (every confirmation, multi-business tenants) — unavoidable today even when inferable.
- Evidence attach-or-skip tap (every confirmation) — required gate before "Sahkan" becomes available, per the UI trace (`evidenceStatus !== "NONE"` gating confirm).
- Manual vendor-name edit tap, optional but necessary to ever benefit from learning (scenarios 1, 4, 5) — most users likely skip this, meaning most of the "AI Learns" promise silently never engages for vague inputs.

### Slow workflows
- Vehicle disambiguation requires a full extra request/response round trip (network + LLM latency twice) instead of resolving client-side from already-available profile data.
- No batching — each of the 7 example messages is one isolated request; a user dictating several transactions in one breath (a realistic voice-note scenario) is not supported as a single multi-suggestion turn based on the traced schema (one suggestions array per query, but no evidence of explicit multi-transaction parsing within one message in the traced code).

---

## 1. Current Flow

```
User types/speaks a transaction
  ↓
AI always attempts a suggestion (suggest-first), EXCEPT:
  - vehicle ambiguity (2+ vehicles, ambiguous fuel/toll/parking/etc. keyword) → AI asks, blocks suggestion
  - business profile ambiguity → AI asks, blocks suggestion (same mechanism)
  ↓
Suggestion card shown: type, category, amount, confidence %, relatedParty (often blank)
  ↓
IF multi-business: user MUST tap a business chip (every time, no inference)
  ↓
User MUST tap "Lampir Resit" or "Tiada Resit" (evidence gate, every time)
  ↓
User MAY tap Edit to fix category/amount/party/date
  ↓
User taps "Sahkan"
  ↓
Record inserted; learnOcrPattern() runs using whatever party name was present
  (often null/generic for ayam, "pelanggan," "supplier" — no learning occurs)
```

## 2. Ideal Flow

```
User types/speaks a transaction
  ↓
AI checks (in this order): this workspace's learned patterns → Knowledge Bank
  (seeded with at least common Malaysian SME scenarios: TNB/utilities, fuel,
  rent, generic retail) → cross-workspace pattern hint → LLM general knowledge
  ↓
AI cross-checks open receivables/payables/commitments deterministically before
  asking the LLM to choose fresh-record vs. settlement — surfaces a clear
  "this looks like it settles [existing record]" option when there's a
  confident match, instead of silently guessing fresh INCOME/EXPENSE
  ↓
AI suggests with business pre-selected when inferable (e.g. only one business
  has ever recorded this vendor/category before) — chip picker only appears
  when genuinely ambiguous, not as a blanket gate
  ↓
Evidence attach offered, never blocking confirmation — "Tiada Resit" should be
  the silent default, with attach available but optional friction, not a gate
  ↓
Suggestion card shows confidence AND why (e.g. "Dipadan dari sejarah anda" vs.
  "Anggaran umum AI") so the user knows when to scrutinize vs. trust it
  ↓
One tap: "Sahkan" — done.
  ↓
If vendor name is missing, AI fills a sensible generic-but-specific label
  itself (e.g. "Pembelian Ayam" rather than null) so learning still captures
  *something* useful, rather than silently discarding the learning opportunity
  ↓
Vehicle/business disambiguation resolved without a full round trip where
  possible (client already has the vehicle/business list — only call the
  server once both transaction details AND the disambiguating choice are known)
```

## 3. Gap Analysis

| Ideal Capability | Current State | Gap |
|---|---|---|
| Pre-seeded common scenarios (utility, fuel, rent, generic retail) | Knowledge Bank table exists but ships empty | **Full gap** — feature built, content never populated |
| Deterministic match against open receivables/payables/commitments | Left entirely to LLM's own reading of embedded lists | **Full gap** — no code-level cross-check exists |
| Business auto-inference from history | Always re-asks via chip picker regardless of confidence | **Full gap** — no inference logic found |
| Evidence as optional friction, not a gate | "Sahkan" is disabled until evidence status leaves "NONE" | **Full gap (by design)** — currently a hard gate, not "optional" |
| Vendor-name backfill so learning still captures something | AI allowed to leave `relatedParty` null/generic, learning silently no-ops | **Full gap** — no fallback label logic found |
| Single round-trip disambiguation | Vehicle/business ambiguity requires a second full server round trip | **Partial gap** — works, but slower than necessary since the data needed to disambiguate (vehicle list) is already client-side |
| Confidence transparency (why this %) | Confidence shown as a bare percentage, no source/reasoning attached | **Full gap** — no "matched from your history" vs. "AI estimate" distinction surfaced |
| Multi-transaction parsing from one message | One suggestions array per query call; no evidence of intentional multi-transaction splitting | **Unclear/Partial gap** — not confirmed broken, but not confirmed supported either |

## 4. Top 20 Improvements

Ranked by impact on the "User says something → AI understands → AI suggests → User confirms → Done" goal:

1. **Seed the Knowledge Bank with at least the universal Malaysian SME basics** — TNB/utilities, common telco bills, fuel/transport, rent/commitments, generic retail purchase — closes the single largest gap found in this audit with no architecture change required, just content.
2. **Make evidence attachment non-blocking** — let "Sahkan" be tappable immediately; keep "Lampir Resit"/"Tiada Resit" as an optional follow-up, not a confirm gate. This alone removes one mandatory tap from every single confirmation.
3. **Add a deterministic open-receivable/payable/commitment match step** before the LLM call for ambiguous settlement-style inputs ("terima bayaran," "bayar supplier," "bayar sewa") — surfaces a "settle existing record?" choice instead of silently guessing fresh income/expense.
4. **Infer business assignment from vendor/category history** when a clear single-business precedent exists; only show the chip picker when genuinely ambiguous (first time for that vendor, or vendor previously used in 2+ businesses).
5. **Give the AI a fallback vendor label** (e.g. derive "Pembelian Ayam" from the transaction text itself) whenever the LLM would otherwise leave `relatedParty` null — ensures the "AI Learns" step actually engages even for vague inputs, instead of silently no-opping.
6. **Surface confidence provenance**, not just a percentage — label suggestions as "Dipadan dari sejarah anda" (matched from your history), "Daripada Bank Pengetahuan" (Knowledge Bank), or "Anggaran AI" (general AI estimate) so users learn when to scrutinize.
7. **Resolve vehicle/business disambiguation client-side first** when the disambiguating data (vehicle list, business list) is already loaded — only hit the server once both the transaction and the chosen vehicle/business are known, collapsing two round trips into one.
8. **Add a lightweight client-side keyword pre-filter** (similar to `fetchKnowledgeBankMatches`'s stopword/keyword logic) to flag likely settlement-vs-fresh ambiguity client-side and pre-select the most relevant existing record for the AI to confirm/deny, rather than relying purely on prompt-embedded list reading.
9. **Track and review `knowledge_bank_gaps` on a cadence** — the gap-logging mechanism already exists; without an HQ process consuming it regularly, the Knowledge Bank will stay empty indefinitely, defeating improvement #1 over time.
10. **Add a "confirm + learn" combined action with implicit vendor-name prompt only on first occurrence** — e.g., if `relatedParty` is null and this is genuinely the first time this category/amount pattern is seen in the workspace, show a single optional inline text field ("Nama vendor? (pilihan)") right on the suggestion card rather than requiring the user to discover the Edit button.
11. **Differentiate commitment creation from one-off expense more clearly in the suggestion card** for recurring-sounding inputs ("sewa kedai," subscriptions) — e.g. a toggle "Jadikan bayaran berulang?" so the COMMITMENT vs EXPENSE decision is explicit and user-controlled, not silently guessed.
12. **Support multi-transaction parsing in a single message/voice note** explicitly (e.g. "beli ayam RM450 dan minyak RM80") — verify current behavior and add multi-suggestion array support if not already robust, since real users dictating multiple transactions in one voice note is a realistic and high-value use case.
13. **Add a per-vendor "first-time confidence" floor** distinct from "repeat confidence" so users can visually tell a brand-new guess from a battle-tested pattern at a glance, beyond just the numeric percentage.
14. **Cache the cross-workspace pattern hint result and act on it more assertively** — currently it's a passive hint (`checkCrossWorkspacePattern`); consider auto-suggesting "Vendor ini biasa direkod di [Workspace B] — pindah rekod ke sana?" with one tap to switch, rather than a hint the user might miss.
15. **Add a periodic confidence-decay or re-validation mechanism** for very old, high-occurrence-count patterns — vendors change categories/billing over time (e.g. a supplier switching from PAYABLE terms to upfront EXPENSE); the current rolling average never "forgets," which could anchor stale classifications indefinitely.
16. **Expose a lightweight in-chat correction shortcut** ("Salah — sepatutnya [X]") that both edits the record and explicitly re-trains the pattern in one action, rather than requiring separate Edit-then-Confirm-then-implicit-learn steps.
17. **Add explicit unit/integration tests around the suggest→confirm→learn loop** for the known edge cases this audit surfaced (null vendor confirm, vehicle disambiguation round trip, multi-business chip gate) — currently verified manually/by user report only, per the prior executive audit's finding.
18. **Reduce evidence-prompt friction for low-amount/recurring transactions** — e.g. skip the evidence gate entirely (not just make it optional) for transactions matching an already-evidenced recurring commitment, since the same receipt/contract logically still applies.
19. **Localize and standardize the AI's clarifying-question phrasing** into a small fixed set of reviewable templates (vehicle, business, dependent ambiguity) rather than leaving exact wording fully to the LLM each time — improves consistency and makes future translation/tone QA tractable.
20. **Add a "why was this not auto-suggested" inline explainer** for cases where the AI withholds a suggestion entirely (vehicle ambiguity) — currently the user just sees a question with no visible link back to "this is why I'm asking," which could read as the AI being unresponsive rather than deliberately cautious.

---

## Bottom Line

The architecture for "User says something → AI understands → AI suggests → User confirms → Done" is **real and largely sound** — suggest-first behavior, learned-pattern reuse, and disambiguation-only-when-truly-ambiguous are all genuinely implemented, not aspirational. But across all 7 simulated inputs, the system's actual intelligence is overwhelmingly carried by the underlying LLM's general world knowledge, not by MyKerani's own learning/knowledge infrastructure — because the Knowledge Bank is unseeded, settlement-matching is non-deterministic, and learning silently fails to engage whenever a vendor name is absent (which was true in 3 of the 7 example inputs: "ayam," "pelanggan," "supplier"). The two mandatory friction points present in every single confirmation today — the business chip gate and the evidence gate — are the most immediately fixable sources of "extra clicks," while seeding the Knowledge Bank is the highest-leverage fix for suggestion *quality* itself.
