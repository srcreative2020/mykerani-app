# MyKerani — Financial Situation Bank Audit Report (Full Trace)

**Report generated:** 2026-06-21 16:47:05 UTC
**File path:** `/home/user/mykerani-app/MYKERANI_FINANCIAL_SITUATION_AUDIT.md`
**Method:** Exhaustive repo-wide search (Explore agent) + **live production database query** (`giwnioxqacrfpyuyhrkf` / "MyKerani_v1.0") via direct SQL — not migration-file inference. This report corrects a material error in two prior audits in this engagement (`MYKERANI_EXECUTIVE_AUDIT_REPORT.md` §10 and `MYKERANI_AI_CHAT_FLOW_AUDIT.md`), both of which concluded the Knowledge Bank was empty based only on reading migration files, without querying the live database.

---

## ⚠️ Correction Notice

Two earlier reports in this engagement stated the `knowledge_bank_scenarios` table "ships empty" / "is empty by default" because no `INSERT` statements exist in any committed migration file. **That conclusion was wrong.** A live query against the production database shows **779 active, distinct scenario records** in `knowledge_bank_scenarios`, inserted directly via SQL execution **outside of version control** (no corresponding migration file), in a roughly two-hour window on 2026-06-21 between 06:06:38 and 08:05:19 UTC — the same day the table schema itself was created (migration `20260621053417_financial_knowledge_bank`, applied 05:34:54 UTC). This is the same "out-of-band data" pattern already flagged once before in this engagement for the `payment_gateway_settings` table: **the live database and the git-tracked migration history have diverged**, and any audit relying solely on repo file search will reach false conclusions about data that exists only in the live database.

This report's conclusions are based on the live database, the application code that reads it, and the repo. All three were checked.

---

## Per-Source Trace Table

### 1. Database Tables

| Source Name | File/Location | Record Count (live) | Example Records | Purpose | Active/Unused | Is AI Reading It? | Where Connected |
|---|---|---|---|---|---|---|---|
| `knowledge_bank_scenarios` | Schema: `supabase/migrations/20260621053417_financial_knowledge_bank.sql`; **data: live DB only, not in any migration file** | **779** (all `is_active = true`, all `scenario_code` distinct) | `MICRO-0001` "Bayar Sewa Kedai" → EXPENSE, keywords `[bayar, sewa, kedai]`; `SME-0010` "Bayar Bil TNB" → EXPENSE, keywords `[bayar, bil, tnb]`; `IND-0044` "Isi Minyak" → EXPENSE, keywords `[isi, minyak, petrol]` | The Financial Knowledge Bank — HQ-curated reference scenarios mapping keyword patterns to suggested transaction type/category/confidence, used to bootstrap AI suggestion accuracy without per-tenant learning history | **ACTIVE** | **YES** — `fetchKnowledgeBankMatches()` in `server.ts:1056` queries it on every `/api/ai/assistant` call via keyword-overlap (`keywords=ov.{...}`) against the GIN index `idx_kb_scenarios_keywords` | `server.ts` → injected into the AI system prompt as "Financial Knowledge Bank — Matched Reference Scenarios" (server.ts:849) before the LLM call |
| `knowledge_bank_gaps` | Same migration file (schema only) | **0** | — none — | Logs transactions the AI detected with **zero** Knowledge Bank match, for HQ to review and expand coverage | ACTIVE (mechanism wired) but **zero rows ever written** | Indirectly — it's a write target, not a read source for the AI | `server.ts:1087 logKnowledgeBankGap()`, fire-and-forget POST, called only when `financialIntent.detected && knowledgeBankMatches.length === 0` |
| `ocr_learned_patterns` | `supabase/migrations/20260618...` (multiple), confirmed live | 4 | Tenant-specific learned vendor→category mappings | Per-workspace AI memory — the "AI Learns" half of the product formula | ACTIVE | **YES** — read and injected into the same system prompt, with explicit priority over Knowledge Bank matches | `FinancialRecordsContext.tsx` `learnOcrPattern()`; `server.ts` prompt section 7 |
| `general_ledger_categories` | Migration: core architecture foundation | 16 | Standard category taxonomy (Income/Expense/etc. categories) | Canonical category list for the ledger UI, not an AI scenario source | ACTIVE | Not directly confirmed as AI-prompt-injected in this pass | UI category dropdowns |
| Tables referenced in an earlier report but **do not exist in the live database**: `ai_learned_categories`, `ai_learned_customers`, `ai_learned_vendors`, `ai_transaction_patterns` | N/A | **N/A — confirmed via live `list_tables`: these tables do not exist** | — | A prior audit pass listed these as part of the schema; a live query proves they were never created (or were dropped) | **UNUSED / NON-EXISTENT** | NO | None — this is a correction to a prior report's table inventory |

### 2. Seed Files

**NOTHING FOUND.** No `/seed`, `/seeds`, `/scripts`, or `/data` directory exists anywhere in the repository (confirmed via directory search). No standalone seed script populates `knowledge_bank_scenarios` — the 779 live rows have **no corresponding file in the repo at all**.

### 3. JSON Files

**NOTHING FOUND** beyond standard tooling config. Every `.json` file in the repo (excluding `node_modules`) was inspected: `package.json`, `package-lock.json`, `tsconfig.json`, `metadata.json`, `.claude/settings.local.json`. None contain situation/scenario/classification data. **The 779 scenarios exist only as live database rows — there is no JSON source of truth for them in the repo.**

### 4. TypeScript Files

| Source | Location | Record Count | Purpose | Active/Unused | AI Reading It? | Connected Where |
|---|---|---|---|---|---|---|
| `PRESET_DEMO_RECORDS` | `src/lib/seeder.ts` | **11** hardcoded demo financial *transaction* records (income/expense/receivable/payable), across 4 demo workspaces | Populates demo workspaces for UX/sales-demo purposes | ACTIVE (demo only) | **NO** — these are ledger records for the demo UI, not AI prompt input; `isDemoWorkspace()` checks explicitly skip demo workspaces from AI learning/event-logging paths | `LoginScreen.tsx` demo account flow |
| `fetchKnowledgeBankMatches()` | `server.ts:1056` | N/A (query function, not data) | Queries the 779 live scenarios by keyword overlap | ACTIVE | YES | Called from `/api/ai/assistant` handler |
| `learnOcrPattern()` + `vendorMatchKey()` / `isFuzzyVendorMatch()` | `src/context/FinancialRecordsContext.tsx` | N/A (logic, not data) | Tenant-specific pattern learning, separate system from Knowledge Bank | ACTIVE | YES (separately, as `ocr_learned_patterns`) | Called on every chat-suggestion confirm |

**Important clarification:** No `.ts`/`.tsx` file in the repo contains a hardcoded array of "hundreds of financial situations." The 11 `seeder.ts` records are demo *transactions*, not classification *scenarios*, and are an entirely separate, unrelated system from the Knowledge Bank.

### 5. Configuration Files

**NOTHING FOUND.** No `.yaml`/`.toml`/`.env`-style configuration file contains scenario/situation data. `payment_gateway_settings` and other config-like tables were checked and are unrelated to financial situations.

### 6. Prompt Files

**NOTHING FOUND as a standalone file.** The "prompt" is constructed dynamically inside `server.ts`'s `/api/ai/assistant` handler as a single template literal (not in a separate prompt file). It does **not** hardcode any example situations inline — it dynamically injects whatever `fetchKnowledgeBankMatches()` returns from the live 779-row table at request time, plus the tenant's own `ocr_learned_patterns`, plus the live financial/profile data for that request.

### 7. AI Instruction Files

**NOTHING FOUND as standalone files.** All AI instruction logic (suggest-first rule, disambiguation rules, output schema) lives inline in the `server.ts` system-prompt template literal, confirmed in the prior `MYKERANI_AI_CHAT_FLOW_AUDIT.md` trace. No separate `.md`/`.txt` instruction file feeds the AI.

### 8. Migration Files

| File | Contains Scenario Data? | Notes |
|---|---|---|
| `20260621053417_financial_knowledge_bank.sql` (repo name: `20260621020000_financial_knowledge_bank.sql`) | **NO** — schema only (`CREATE TABLE`, RLS, GIN index, triggers) | Zero `INSERT` statements in this or any other migration file, confirmed by repo-wide grep |
| All other 33 migrations | NO | Unrelated to scenario data |

**Conclusion:** The committed migration history is schema-only for the Knowledge Bank. **The actual 779 rows of content were inserted directly against the live database, never captured as a migration.** This is a real version-control gap: rebuilding the database from migrations alone would recreate the *table* but not the *779 scenarios* — identical in nature to the previously-flagged `payment_gateway_settings` gap.

### 9. Static Data Files

**NOTHING FOUND.** No CSV, static JSON, or other static data file holds situation/scenario content anywhere in the repo.

### 10. Other Embedded Knowledge Sources

- **Live database only** — the single real source of truth for the 779 situations is the production Postgres table itself, not any artifact in the git repository.
- **`ai_chat_messages`** (100 live rows) and **`audit_logs`** (340 live rows) were checked as potential implicit "learned situation" sources — they are conversation/mutation logs, not classification scenario sources, and are not read back into the AI prompt as scenario data (per the prior `MYKERANI_AI_CHAT_FLOW_AUDIT.md` trace — chat archive is for human review only).

---

## Live Data Profile: `knowledge_bank_scenarios`

**Total rows:** 779 | **Active:** 779 (100%) | **Distinct `scenario_code`:** 779 (no duplicate codes) | **Created:** 2026-06-21, 06:06:38–08:05:19 UTC (single ~2-hour seeding session)

**By category:**

| Category | Count |
|---|---|
| `INDIVIDUAL` | 291 |
| `AUDIT` | 121 |
| `MICRO_BUSINESS` | 111 |
| `RECOVERY` | 79 |
| `SME` | 65 |
| `MULTI_COMPANY` | 59 |
| `FINANCING` | 53 |
| **Total** | **779** |

**Confirmed keyword coverage relevant to the 7 scenarios tested in the prior AI Chat Flow Audit** (i.e., that audit's "Situation bank usage: None" conclusion was **incorrect** for at least 5 of the 7 — corrected below):

| Test input (prior audit) | Matching scenario(s) found live | Prior audit's claim | Corrected status |
|---|---|---|---|
| "Saya beli ayam RM450" | `MICRO-0048` "Beli Bahan Mentah" (keywords incl. `ayam`); `MULTI-0001` "AI Kesan Corak Berbeza" (keywords incl. `ayam`) | "None (empty table)" | **CORRECTED: 2 matching scenarios exist** |
| "Saya isi minyak RM80" | `IND-0044` "Isi Minyak" (keywords `isi, minyak, petrol`); `MICRO-0050` "Beli Minyak Masak"; `MICRO-0093` "Isi Minyak Van" | "None (empty table)" | **CORRECTED: direct match exists (`IND-0044`)** |
| "Saya bayar TNB RM350" | `SME-0010` "Bayar Bil TNB" (keywords `bayar, bil, tnb`); `MICRO-0002` "Bayar Bil Elektrik" (keywords incl. `tnb`) | "None (empty table)" | **CORRECTED: direct match exists (`SME-0010`)** |
| "Saya terima bayaran pelanggan RM1200" | `IND-0009` "Hutang Pelanggan"; `MICRO-0072/73/74` "Customer Bayar Cash/QR/Transfer"; multiple `RECOVERY-*` pelanggan scenarios | "None" (Knowledge Bank usage not flagged at all) | **CORRECTED: multiple relevant matches exist**, though none is an exact "received payment, generic customer" match — see Gap §F |
| "Saya bayar supplier RM500" | `MICRO-0004`/`MICRO-0080` "Bayar Hutang Supplier"; `SME-0025` "Bayar Sebahagian Supplier" | "None" | **CORRECTED: multiple matches exist** |
| "Saya bayar sewa kedai RM1200" | `MICRO-0001` "Bayar Sewa Kedai" — **exact title and keyword match** | "None (empty table)" | **CORRECTED: exact match exists** |
| "Saya beli barang di Family Store RM1250" | No match (no scenario keys on a literal brand name "Family Store") | "None" | **Confirmed still correct** — generic retail-by-brand-name is genuinely not covered |

**This means the prior `MYKERANI_AI_CHAT_FLOW_AUDIT.md` report's per-scenario "Situation bank usage" rows are factually wrong for 5 of 7 cases and should be treated as superseded by this report.**

---

## Answers to the Audit Questions

### A. How many financial situations currently exist?

**779**, all live in the production `knowledge_bank_scenarios` table, all `is_active = true`. This is short of any "~1800-scenario" figure that may have been referenced in earlier planning/commit messages — current state is 779, not the full originally-scoped set (see §F).

### B. Where are they stored?

Exclusively in the live Supabase Postgres database, table `public.knowledge_bank_scenarios` (project `giwnioxqacrfpyuyhrkf`, "MyKerani_v1.0"). **They are not stored anywhere in the git repository** — no migration, seed file, JSON file, or TypeScript constant contains this data. The schema (column definitions, indexes, RLS policies) is version-controlled in `supabase/migrations/20260621020000_financial_knowledge_bank.sql`; the *content* is not.

### C. Which situations are actively used by AI?

All 779 are **eligible** to be used on every single `/api/ai/assistant` call — `fetchKnowledgeBankMatches()` runs unconditionally for every query, filters by keyword overlap (via the GIN-indexed `keywords` column), and returns up to 8 best matches, which are then injected into the system prompt sent to the LLM. There is no subset of "active" vs. "inactive-but-present" scenarios beyond the `is_active` flag, and all 779 currently have `is_active = true`, so all 779 are live candidates for every query.

### D. Which situations exist but are not connected?

**None at the data layer** — every row in `knowledge_bank_scenarios` is reachable by the same single query path (`fetchKnowledgeBankMatches`), so there is no subset of "orphaned" scenario rows. The disconnection in this system is structural, not row-specific: **the entire 779-row dataset itself is disconnected from version control** (§8 above) — meaning the connection that's missing is repo↔database, not scenario↔AI.

### E. Which situations are duplicated?

No `scenario_code` duplicates (779 distinct codes for 779 rows). However, **title- and keyword-level duplication exists**, indicating overlapping/redundant scenario authoring:
- `"User Tanya"` appears **18 times** under different `scenario_code`s (e.g. `RECOVERY-0040` through `RECOVERY-0047` and others), each with different keyword sets — these appear to be advisory/Q&A-style entries rather than transaction-classification scenarios, and the generic shared title makes them hard to distinguish at a glance.
- `"Bayar Tol"` (3×), `"Bayar Parking"` (3×), `"Financial History"` (3×), `"Goal Progress"` (3×), `"Document Completeness"` (3×), `"Loan Readiness"` (3×), `"Tidak."` (3×) — each duplicated 3 times.
- At least 13 additional titles duplicated 2× each, including `"Customer Bayar Sebahagian"`, `"Supplier Bagi Kredit"` (which exists as both `SME-0024` and `MICRO-0078` with identical keywords `[supplier, bagi, kredit]`), `"Bayar Hutang Supplier"` (`MICRO-0004` and `MICRO-0080`, both `[bayar, hutang, supplier]`), and `"AI Kesan Supplier Dominan"` (appearing in both `MICRO-0105` and `MULTI-0029`).

This level of duplication is moderate, not severe (the bulk of 779 rows are distinct), but represents real redundant authoring effort and potential confidence-dilution if duplicate scenarios with slightly different `base_confidence` values both match the same query.

### F. Which situations are missing?

Based on the 7 test inputs and general coverage gaps observed while sampling the data:
1. **Generic/branded retail purchases** ("Family Store," or any other named store not in a pre-set keyword list) — confirmed zero match for scenario 7.
2. **Generic "terima bayaran pelanggan" / "bayar supplier" without a named party and without specifying whether it's new income/expense vs. settling an existing receivable/payable** — multiple *related* scenarios exist (by named-party variants like "Ali," or by payment-method variant like cash/QR/transfer), but no single canonical "generic customer payment received, type unspecified" scenario was found to directly disambiguate the settlement-vs-fresh-income question flagged as a gap in the prior AI Chat Flow Audit.
3. **No scenario data exists for the "~1800-scenario seed set"** referenced in an earlier development-history commit message (per the forensic search, commit `97da283` "Add Financial Knowledge Bank / Memory Engine" states "Seeded with 3 starter scenarios; full ~1800-scenario seed set to follow" — that follow-up never happened as a tracked commit; 779 live rows likely represent partial progress toward that original ~1800 target, done out-of-band).
4. Coverage skews heavily toward `INDIVIDUAL` (291) and `AUDIT` (121) categories relative to `FINANCING` (53) and `MULTI_COMPANY` (59) — if the original plan targeted roughly even coverage across all 7 categories, `FINANCING` and `MULTI_COMPANY` are proportionally the most under-filled today.

### G. Is the AI actually using the Financial Situation Bank during transaction classification?

**Yes — proven by code execution trace, not assumption.** The full path:

```
POST /api/ai/assistant  (server.ts:790)
  → const knowledgeBankMatches = await fetchKnowledgeBankMatches(String(query));   (server.ts ~830)
       → builds keyword set from query (strips RM amounts, stopwords, lowercases)
       → GET {SUPABASE_URL}/rest/v1/knowledge_bank_scenarios
             ?is_active=eq.true
             &keywords=ov.{<query keywords>}        ← PostgreSQL array-overlap operator
             &select=scenario_code,category,title,suggested_type,suggested_category,
                      suggested_documents,base_confidence
             &limit=8
       → executed against the GIN index idx_kb_scenarios_keywords (confirmed present live)
       → returns up to 8 matching rows from the live 779-row table
  → systemPrompt includes a "Financial Knowledge Bank — Matched Reference Scenarios" section
    (server.ts:849) populated with whatever fetchKnowledgeBankMatches() returned
  → callAiProvider(candidate, systemPrompt) sends this to the LLM
  → LLM's JSON response (financialIntent, suggestions) is returned as-is to the client
  → AFTER the response: if (financialIntent.detected && knowledgeBankMatches.length === 0)
       → logKnowledgeBankGap(...)   ← fires ONLY on a true miss
```

This is a real, live, unconditional execution path — every chat query triggers this lookup, with no feature flag or bypass found. The fact that `knowledge_bank_gaps` has **zero rows despite 53 historical user chat messages** is most plausibly explained by the Knowledge Bank's 779-row coverage being broad enough that most real queries find at least one keyword-overlap match (consistent with the keyword-coverage spot-checks above, which found matches for 5 of 6 transaction-shaped test inputs). It could also indicate the gap-logging fire-and-forget call is failing silently server-side — **this audit cannot fully rule that out without access to live server logs**, and it is flagged here as an open item rather than asserted either way.

---

## EXECUTIVE SUMMARY

| Metric | Value |
|---|---|
| **Total Situation Records** | 779 (live, in `knowledge_bank_scenarios`) |
| **Active Situation Records** | 779 (100% — all flagged `is_active = true`) |
| **Unused Situation Records** | 0 at the row level — every row is queryable by the same code path on every AI call |
| **Missing Connections** | **Repo ↔ Database**: the entire 779-row dataset has no corresponding migration/seed file in version control — a database rebuild from the committed migration history would recreate the empty table, not the 779 scenarios. This is the single critical finding of this audit. |
| **Recommended Fixes** | 1) **Export the live 779 rows into a versioned seed migration immediately** (e.g. `supabase/migrations/<timestamp>_seed_knowledge_bank_scenarios.sql`) so a database rebuild doesn't silently lose this content — same risk class as the previously-found `payment_gateway_settings` gap. 2) De-duplicate the ~20+ title/keyword-duplicate scenario pairs identified in §E to reduce redundant authoring and confidence-dilution risk. 3) Add the missing generic settlement-disambiguation scenarios identified in §F (generic customer-payment-received, generic supplier-payment-paid, without named parties) to close the receivable/payable double-counting risk flagged in the prior AI Chat Flow Audit. 4) Resolve whether the original "~1800-scenario" target is still the goal — at 779/1800 the bank is roughly 43% of its originally-stated scope. 5) Instrument `logKnowledgeBankGap()` with a success/failure counter or server-side log assertion so the zero-gaps-logged finding in §G can be conclusively explained (broad coverage vs. silent failure) rather than left as an open question. 6) **Correct the two prior reports** (`MYKERANI_EXECUTIVE_AUDIT_REPORT.md` §10, `MYKERANI_AI_CHAT_FLOW_AUDIT.md` per-scenario tables) to reflect the live 779-row reality rather than the migration-file-only empty-table conclusion. |

---

## Report Metadata

- **Report file:** `MYKERANI_FINANCIAL_SITUATION_AUDIT.md`
- **Saved at:** `/home/user/mykerani-app/MYKERANI_FINANCIAL_SITUATION_AUDIT.md`
- **Generated:** 2026-06-21 16:47:05 UTC
- **Verification method:** Live SQL query against production Supabase project `giwnioxqacrfpyuyhrkf` ("MyKerani_v1.0") + exhaustive repo-wide file/git-history search (Explore agent) + direct code trace of `server.ts` execution path.
