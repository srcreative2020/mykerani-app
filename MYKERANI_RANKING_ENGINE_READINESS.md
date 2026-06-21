# MyKerani — Financial Context Ranking Engine: Readiness Audit

**Scope:** Does the codebase already have what's needed to build the Ranking Engine designed previously (Profile/Business/Vehicle/Dependent/OCR/Situation Bank/Archive signals → ranked business suggestion)? Code trace only, no implementation.
**File path:** `/home/user/mykerani-app/MYKERANI_RANKING_ENGINE_READINESS.md`

---

## Critical finding before the input-by-input breakdown

**Business selection today is 100% manual, with zero AI involvement, whenever a tenant has 2+ active businesses.** This is the single fact that reframes every answer below.

Proof (`OwnerDashboard.tsx:1195-1204`, identical pattern in `StaffHomeScreen.tsx:386-391`):

```ts
const activeBusinesses = businesses.filter(b => b.isActive);
next[s.id] = activeBusinesses.length > 0
  ? { businessId: null, businessName: "", businessPicked: false, evidenceStatus: "NONE" }
  : { businessId: null, businessName: "Personal", businessPicked: true, evidenceStatus: "NONE" };
```

Every `CONFIRM_TRANSACTION` suggestion the AI returns gets `businessPicked: false` forced onto it the instant 1+ active business exists — regardless of what the AI said, regardless of vendor history. The user must manually pick from a dropdown (`handleChatPickBusiness()`) before the Confirm button is enabled. The AI itself never outputs a business choice anywhere in its JSON schema (`server.ts:879-890` — no `businessId`/`businessName` field exists in the `CONFIRM_TRANSACTION` payload shape at all). So the Ranking Engine isn't a "v2 improvement" on existing AI behavior — it would be the **first time** business selection involves any automated logic at all.

The good news this also reveals: `financialEvents.business_id` already exists as a real, written, queryable column (`FinancialRecordsContext.tsx:832,851,865,879` etc.) — so Archive History *is* already business-tagged once a user manually picks. The Ranking Engine's job is to predict what the user currently has to pick by hand every time.

---

## 1. Which required inputs already exist?

| Input | Exists? | Where |
|---|---|---|
| Businesses | Yes | `businesses` table, `Business` interface (`profileData.ts:22-30`) |
| Business Types | Yes | `Business.industry`, `Business.businessType` fields |
| Branches | Yes | `business_branches` table, `BusinessBranch` interface (`profileData.ts:32-38`) |
| OCR Learned Patterns | Yes | `ocr_learned_patterns` table — but **workspace-scoped only, no `business_id` column** (`20260613000000_ocr_learning_layer_setup.sql:10-21`) |
| Financial History | Yes | `financialEvents`, and critically, already carries `business_id` (`FinancialRecordsContext.tsx:832`) |
| Situation Bank | Yes | `knowledge_bank_scenarios`, 779 live rows (confirmed in prior audit) — global, not business-scoped (by design, it's cross-tenant) |
| Vehicles | Yes | `vehicles` table, `ownership` field already PERSONAL/BUSINESS but **not tied to a specific `businessId`** when a tenant has 2+ businesses — only a 2-way split, not N-way |
| Dependents | Yes | `dependents` table — **no `businessId` field at all** |

**Every category the user asked about already exists as stored data.** None require inventing a new entity from scratch.

## 2. Which inputs are already connected to AI (i.e. reach the system prompt today)?

| Input | Connected to AI? |
|---|---|
| Financial History (`financialEvents`) | Yes — section 1 of the prompt |
| OCR Learned Patterns | Yes — section 7, with a dedicated reuse rule (`server.ts:877`) |
| Situation Bank | Yes — injected via `fetchKnowledgeBankMatches()`, dedicated priority rule (`server.ts:868`) |
| Vehicles | Yes — section 10, with a dedicated disambiguation rule (`server.ts:874`) |
| Dependents | Yes — section 11, with a dedicated matching rule (`server.ts:875`) |
| Personal Profile | Yes — section 8 (passive, no dedicated rule — confirmed in prior audit) |
| Businesses / Business Types | Partially — sent as raw JSON in section 9 (`businesses` or `businessProfile`, inconsistently per screen — confirmed in prior audit), but **no rule references `industry`/`businessType` for classification or business-selection at all** |
| Branches | **No** — never sent to the AI in any call site (confirmed in prior audit) |

## 3. Which inputs exist but are not connected (to the *business-ranking* problem specifically, even where connected to the AI generally)?

- **Branches** — not connected to AI at all (§2).
- **`business_id` on `financialEvents`** — connected to the *database*, but never read back into the AI prompt as a "past purchases per business" signal. The AI sees the flat `financialEvents` array with no per-business grouping or summary.
- **`ocr_learned_patterns`** — connected to AI, but has no `business_id` column, so even though the data is in the prompt, it cannot today distinguish "this vendor belongs to Business A" vs "Business B." It's one pattern per vendor per *workspace*, not per *business*.
- **Vehicle `ownership`** — only binary (PERSONAL/BUSINESS), can't point at a specific business when 2+ exist.
- **Dependents** — no business linkage field at all, can't feed business-ranking even in principle without a schema addition.

## 4. Which database changes would be required?

1. **`ocr_learned_patterns.business_id`** (nullable UUID FK to `businesses`) — needed for S1 (highest-weight signal in the ranking design) to discriminate between businesses instead of just vendors-per-workspace. Without this, the unique constraint `uniq_workspace_vendor` would also need to become `uniq_workspace_business_vendor` to let the same vendor name be learned independently per business.
2. **`vehicles.business_id`** (nullable UUID FK) — to extend `ownership` from a binary PERSONAL/BUSINESS split into an N-way business pointer, matching the design's intent to reuse the proven vehicle-ownership mechanism per business.
3. **`dependents.business_id`** (nullable UUID FK) — only needed if dependent-based signals should discriminate between businesses (lower priority — Dependents are a weak signal in the ranking design, S4).
4. *(Branches don't need a DB change — `business_branches.business_id` already exists; they only need an API/prompt wiring change, §5.)*

`financialEvents.business_id` and `businesses`/`business_branches` schemas need **no change** — already adequate.

## 5. Which API changes would be required?

1. **Add a `businessId`/`businessName` field to the `CONFIRM_TRANSACTION` suggestion payload schema** (`server.ts:879-890`) — today the AI's JSON output has no slot for a business choice at all; this is the actual integration point for any ranking output.
2. **Wire `business_branches` into `financialContext`** at all 4 chat call sites (`AIFinancialAssistant.tsx`, `OwnerDashboard.tsx`, `StaffHomeScreen.tsx`) — currently zero exposure.
3. **Add a per-business breakdown of `financialEvents`/`ocr_learned_patterns`** in the prompt construction (`server.ts:852,858`) — today both are sent as flat arrays; the ranking engine's S1/S2 signals need them either pre-grouped by `business_id` server-side, or the raw `business_id` field exposed so the LLM (or a pre-LLM scoring step) can group them itself.
4. **A new prompt rule (the "ranking decision flow") analogous to `server.ts:874` (Vehicles) and `:877` (OCR patterns)** — instructing the AI how to use S1–S5 to choose a business, output a confidence-banded suggestion, and only ask when confidence is low. This is a prompt-engineering change, not a schema change.
5. *(Optional, not required for v1)* a dedicated `/api/ai/rank-business` endpoint if scoring is moved out of the LLM into deterministic server-side code (see §8) — would need request/response contracts for candidate businesses + scores.

## 6. Which profile fields already support ranking today?

Only the same two fields identified in the prior Profile System assessment have any *coded* decision logic at all:

- **`Vehicle.ownership`** — proven disambiguation rule exists, but capped at binary PERSONAL/BUSINESS, not extensible to N businesses without the schema change in §4.
- **`Dependent.relationship`/`name`** — proven matching rule exists, but has no business linkage, so it can inform *who* a transaction relates to, not *which business* it belongs to.

Everything else (`industry`, `businessType`, `registrationNo`, branches, the `businesses` array itself) is **present in the prompt or database but has zero ranking-relevant logic written against it today** — it would all need new rules, not just new wiring.

## 7. Readiness percentage estimate

| Dimension | Estimate | Basis |
|---|---|---|
| **Data readiness** | **75%** | All 8 requested inputs exist as real, populated tables/fields. The only true gaps are the 3 missing `business_id` FKs (§4) and branches' lack of AI wiring — structurally minor, not "data doesn't exist." |
| **AI readiness** | **30%** | 5 of 8 inputs reach the prompt today, but **none of them currently inform business selection** — only category/vendor classification. The AI has literally no output field for a business choice. This is the lowest-readiness dimension because it requires new prompt logic, not just data wiring. |
| **Database readiness** | **70%** | Core entities (Businesses, Branches, Vehicles, Dependents, OCR Patterns, Situation Bank, financialEvents) all exist with correct tenant/workspace RLS isolation already proven in prior audits. Needs 2–3 additive nullable FK columns (§4), no structural rework. |
| **UI readiness** | **40%** | The manual business-picker UI already exists and works (`handleChatPickBusiness`, confirm-gating) — that's a real asset, not a gap. But there is currently no UI concept of "AI suggested this business at X% confidence, tap to confirm/change" — the picker is a blank dropdown, not a ranked/pre-filled suggestion. Needs new UI states (confidence display, pre-selected choice, "tukar" override), not a new screen. |

**Overall system readiness: ~55%** — the foundational data model is the most mature part; the AI decision logic is the least mature and the actual build effort center of gravity.

## 8. Can a first version be built WITHOUT database schema changes?

**Yes, with one explicit limitation: S1 (the highest-weight signal) degrades.**

A v1 can ship using only what exists today:
- S2 (Archive History) — fully usable as-is, since `financialEvents.business_id` already exists; group existing records by `business_id` and match vendor/keyword overlap, no schema change needed.
- S3 (Business Type) — fully usable as-is (`industry`/`businessType` already sent).
- S4 (Vehicle/Dependent cues) — usable as-is for the binary/no-business-link cases (e.g. explicit name match), just can't resolve which of 3+ businesses a vehicle belongs to.
- S5 (Situation Bank) — fully usable as-is.
- **S1 (OCR Learned Patterns) — only usable at workspace granularity, not business granularity**, in v1. In a single-business workspace this is irrelevant (Step 0 trivial-case gate handles it). In a multi-business workspace, OCR patterns can still hint "this vendor type tends toward category X" but cannot say "...for Business A specifically" until `ocr_learned_patterns.business_id` is added.

**Practical implication:** v1 is buildable today and would work well for the *common* case (single business, or multi-business with little vendor overlap between them, since S2+S3 alone usually separate well-differentiated businesses like a restaurant vs. a workshop). It would be measurably weaker for businesses in the *same* industry sharing vendors — exactly the case where OCR pattern specificity matters most. The schema change (§4, item 1) should be treated as a fast-follow, not a v1 blocker.

---

## Implementation Roadmap

**Phase 1 — Prompt-only v1 (no schema change, no new endpoint)**
1. Wire `business_branches` into all 4 chat call sites (§5.2) — cheap, closes an existing dead-data gap regardless of ranking work.
2. Add `businessId`/`businessName` to the `CONFIRM_TRANSACTION` JSON schema (§5.1).
3. Add the per-business grouping of `financialEvents` into the prompt (§5.3) — server-side reduce, no DB change.
4. Write the ranking decision-flow prompt rule (§5.4) using S2/S3/S4/S5 only, with the Step-0 trivial-case gate (1 active business → skip ranking) as the dominant path.
5. Build the new UI affordance: pre-filled business picker showing the AI's suggested business + a confidence-appropriate hedge phrase + 1-tap change (extends `handleChatPickBusiness`, doesn't replace it).

**Phase 2 — Vendor-specific precision (requires the §4 schema change)**
6. Add `ocr_learned_patterns.business_id` (nullable, migrate existing rows as `NULL` = applies to any business in that workspace until re-learned per-business).
7. Update `learnOcrPattern()` to capture the confirmed `businessId` from Phase 1's picker, closing the loop.
8. Re-introduce S1 at full weight once enough business-scoped patterns accumulate.

**Phase 3 — Extend proven disambiguation patterns**
9. Add `vehicles.business_id` and `dependents.business_id` (both nullable FKs), update existing rules to resolve to a specific business when set, falling back to current binary/relationship-only behavior when not.

This sequencing ships user-visible value (Phase 1) before requiring any migration, and treats the one real data gap (vendor-to-business linkage) as a deliberate, isolated fast-follow rather than a blocker.

---

**Report metadata:** file path `/home/user/mykerani-app/MYKERANI_RANKING_ENGINE_READINESS.md`, verification method: direct code trace of `OwnerDashboard.tsx`, `StaffHomeScreen.tsx`, `server.ts`, `src/lib/profileData.ts`, `src/context/FinancialRecordsContext.tsx`, and `supabase/migrations/20260613000000_ocr_learning_layer_setup.sql`.
