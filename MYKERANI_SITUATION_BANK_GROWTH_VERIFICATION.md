# MyKerani — Financial Situation Bank Growth Mechanism Verification

**Generated:** 2026-06-21 (current session)
**File path:** `/home/user/mykerani-app/MYKERANI_SITUATION_BANK_GROWTH_VERIFICATION.md`
**Method:** Direct code trace (grep + read) of every reference to `knowledge_bank_scenarios` and `ocr_learned_patterns` across the entire repository (`src/`, `server.ts`, `supabase/migrations/`). No assumptions — every claim below is backed by a quoted file/line.

---

## 1. Can new financial situations be created automatically from user activity?

**No.** `knowledge_bank_scenarios` (the Situation Bank) is never written to by any application code path. Confirmed by an exhaustive repo-wide search:

```
grep -r "knowledge_bank_scenarios" — only 2 hits in non-report files:
  server.ts                                              (READ only — GET via REST)
  supabase/migrations/20260621020000_financial_knowledge_bank.sql   (schema only — no INSERT)
```

`server.ts:1072` is the *only* application code that touches this table, and it is a `fetch(...)` `GET` request:

```ts
const url = `${supabaseUrl}/rest/v1/knowledge_bank_scenarios?is_active=eq.true&keywords=ov.${encodeURIComponent(filter)}&select=...&limit=8`;
const resp = await fetch(url, { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } });
```

No `INSERT`, `POST`, `.insert(`, or `.upsert(` against `knowledge_bank_scenarios` exists anywhere in `src/`, `server.ts`, or any migration.

## 2. Can the Situation Bank grow without manual HQ insertion?

**No.** The RLS policy on the table makes this structurally impossible for any normal user/AI action, not just a missing feature:

```sql
-- supabase/migrations/20260621020000_financial_knowledge_bank.sql:62-66
-- Only HQ can curate the knowledge bank.
CREATE POLICY kb_scenarios_hq_write_policy ON public.knowledge_bank_scenarios
    FOR ALL TO authenticated
    USING (public.is_hq_user())
    WITH CHECK (public.is_hq_user());

GRANT SELECT ON public.knowledge_bank_scenarios TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_bank_scenarios TO service_role;
```

Two independent gates, both closed to automatic growth:
- **Role gate**: any `authenticated`-role write requires `is_hq_user()` — a normal tenant user or the AI assistant acting as that user cannot insert.
- **Service-role gate**: `server.ts` holds the `service_role` key (which *could* bypass RLS), but it never issues a write call to this table — confirmed above. The capability to write exists at the credential level; the code to use it does not exist.

So growth is currently **manual-only**: someone with HQ role must run SQL directly (which is exactly how the existing 779 rows got there — confirmed in the prior audit as live rows with zero matching migration/seed file, i.e. inserted out-of-band via direct SQL, not through any app feature).

## 3. (Answered under "No" — see §4, since the answer to §1/§2 is No)

## 4. Why not / what currently limits growth?

- **No write code path exists.** The only function that interacts with `knowledge_bank_scenarios`, `fetchKnowledgeBankMatches()`, is read-only by design — it matches existing rows against chat queries and injects them into the LLM prompt. There is no companion "promote this gap into a new scenario" function anywhere in the codebase.
- **RLS structurally blocks non-HQ writes** even if such a function were added carelessly client-side.
- **The gap-detection table exists but is dead-ended.** `knowledge_bank_gaps` is written by `logKnowledgeBankGap()` (`server.ts:1087-1108`) whenever a detected financial intent matches zero Knowledge Bank rows:

```ts
// server.ts call site (~line 925)
if (parsedResponse?.financialIntent?.detected && knowledgeBankMatches.length === 0) {
  logKnowledgeBankGap(tenantId, workspaceId, parsedResponse.financialIntent);
}
```

  This is the *only* mechanism in the entire system that records "the Situation Bank doesn't cover this case" — and it stops there. Nothing reads `knowledge_bank_gaps` and turns it into a new scenario. There is no batch job, no admin UI panel, no AI step that converts a logged gap into a candidate `knowledge_bank_scenarios` row. It is a one-way logging table with no consumer.
- **Conclusion: growth is fully manual and out-of-band (direct SQL by an HQ operator), not a product feature.**

## 5. User Learning vs. Situation Bank Learning — clearly distinguished

### A. User Learning (tenant-specific) — **this DOES auto-grow**

Table: `ocr_learned_patterns` (workspace-scoped, RLS-isolated per tenant)

Write path: `learnOcrPattern()` in `src/context/FinancialRecordsContext.tsx:1515-1632`, called from 8 sites across `OwnerDashboard.tsx`, `StaffHomeScreen.tsx`, `OCREngineConsole.tsx`, and `AIFinancialAssistant.tsx` — every time a user confirms a transaction (manual entry, OCR review, AI-assistant confirmation, edited category/party).

Execution path (proven):
1. User confirms/edits a transaction → e.g. `OwnerDashboard.tsx:1518` calls `learnOcrPattern({ workspaceId, vendorName, category, recordType, confidenceScore })`.
2. **Dedup**: exact case-insensitive vendor-name match first, then a fuzzy match via `vendorMatchKey()` + `isFuzzyVendorMatch()` (strips "Sdn Bhd"/"Enterprise"/punctuation, tolerates spelling drift) — `FinancialRecordsContext.tsx:1521-1534`. If a match exists → `UPDATE`; otherwise → `CREATE`.
3. **Quality/confidence handling**: on update, confidence is a rolling average weighted by occurrence count (`FinancialRecordsContext.tsx:1550-1552`), so one-off bad guesses get diluted rather than overwriting good data. No filtering/rejection threshold exists for new (`CREATE`) rows — every first-time vendor is accepted at whatever confidence score the caller passes (typically 0.8–0.95 hardcoded at each call site).
4. Local state updated, then audit-logged (`module: "OCR Learning"`), then persisted to Supabase (`ocr_learned_patterns` insert/update, `FinancialRecordsContext.tsx:1607-1625`) scoped to `activeWorkspace.id`.

This is genuine **self-learning, but strictly per-tenant** — one workspace's learned vendor patterns never leak into another's via this table (each row carries `workspace_id` and reads/writes filter on it). Cross-workspace visibility exists only as a separate, narrower feature: `OwnerDashboard.tsx:1340-1346` lets an owner query *other workspaces they own* for vendor patterns with `confidence_score >= 0.7` and `occurrence_count >= 2`, for suggestion purposes — still ownership-scoped, not global.

### B. Situation Bank Learning (global, cross-tenant) — **this does NOT auto-grow**

Table: `knowledge_bank_scenarios` (global, not workspace-scoped — `category` is a business-type enum like `SME`/`MICRO_BUSINESS`, not a tenant identifier).

As shown in §1–§4: read-only at the application layer, write-gated to `is_hq_user()` at the database layer, with no batch/automated promotion path from the one gap-logging table that exists.

---

## Summary Table

| Dimension | User Learning (`ocr_learned_patterns`) | Situation Bank (`knowledge_bank_scenarios`) |
|---|---|---|
| Scope | Per-tenant (`workspace_id`) | Global (all tenants) |
| Auto-create on user activity | **Yes** — every confirmed transaction | **No** — zero write code paths |
| Trigger | `learnOcrPattern()`, 8 call sites | None |
| Dedup | Exact + fuzzy vendor-name match | N/A (no writes) |
| Quality filter | Rolling-average confidence dilution; no creation-time threshold | N/A (no writes) |
| Write permission | Tenant's own Supabase session (RLS: workspace match) | `is_hq_user()` only, or `service_role` (unused for writes) |
| Growth path for new rows | Automatic, continuous | Manual SQL by HQ only (confirmed: existing 779 rows have no migration/seed file — inserted out-of-band) |

## Classification: is the system Static, Semi-Automatic, or Fully Self-Learning?

**Hybrid — and asymmetric:**

- **User Learning layer (`ocr_learned_patterns`): Fully self-learning**, within a single tenant's scope. Every transaction confirmation grows it automatically with working dedup and confidence-averaging, no human intervention required.
- **Situation Bank layer (`knowledge_bank_scenarios`): Static** at the application/automation level — it only changes via direct manual SQL by an HQ operator. The one piece of relevant signal the system *does* capture automatically (`knowledge_bank_gaps`, logged when a chat message matches zero scenarios) is **not connected to anything** — no code reads that table to propose, draft, or insert new scenarios. So even calling it "semi-automatic" would overstate it: detection exists, promotion does not.

**Overall system: Semi-Automatic** — one learning loop (tenant-specific) is closed and fully automatic; the other (global Situation Bank) is open-ended, detection-only, with the loop manually closed outside the codebase entirely.
