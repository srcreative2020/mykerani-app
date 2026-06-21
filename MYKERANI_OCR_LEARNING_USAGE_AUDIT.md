# MyKerani — OCR Learning Usage Audit Report

**Generated:** 2026-06-21 (current session)
**File path:** `/home/user/mykerani-app/MYKERANI_OCR_LEARNING_USAGE_AUDIT.md`
**Scope:** Only `ocr_learned_patterns` — vendor learning, category learning, workspace learning, confidence learning. Does NOT re-cover the Knowledge Bank (covered in the prior audit).
**Method:** Direct code trace, line-quoted. Every claim below cites the exact file/line that proves it.

---

## 0. The Full Execution Path (client → server → LLM)

```
1. App loads workspace → FinancialRecordsContext loads ocr_learned_patterns
   from Supabase, filtered by workspace_id
   (src/context/FinancialRecordsContext.tsx:653-656)
        ↓
2. learnOcrPattern() writes/updates rows on every confirmed transaction
   (FinancialRecordsContext.tsx:1515-1632) — already verified in the prior report
        ↓
3. User opens AI Chat (AIFinancialAssistant.tsx) and asks/states something
        ↓
4. executeAgentQuery() builds financialContext including the FULL
   ocrLearnedPatterns array straight from context state, and POSTs it
   (src/components/AIFinancialAssistant.tsx:153-174)
        ↓
5. POST /api/ai/assistant (server.ts) receives financialContext.ocrLearnedPatterns
   verbatim — no further DB query, it trusts the client-sent array
        ↓
6. server.ts:858 injects it into the LLM system prompt as
   "7. OCR Learned Vendor Patterns (Learning Layer memory)"
        ↓
7. server.ts:877 gives the LLM an explicit, mandatory matching rule
   ("APPLYING LEARNED PATTERNS") — quoted in full in §3 below
        ↓
8. LLM returns a CONFIRM_TRANSACTION suggestion using the matched
   pattern's category/recordType/confidenceScore
        ↓
9. User confirms → addFinancialEvent() → learnOcrPattern() fires again,
   closing the loop (occurrence_count++, confidence re-averaged)
```

This is a closed loop with proof at every link — not an assumption.

---

## 1. Does AI query `ocr_learned_patterns`?

**Yes — but not via a server-side DB query. It's client-pushed.**

- The server (`server.ts`) never runs a `SELECT` against `ocr_learned_patterns` itself.
- Instead, the **client** (`AIFinancialAssistant.tsx:153-163`) reads its already-loaded `ocrLearnedPatterns` (from `FinancialRecordsContext`, which *did* load it from Supabase at session start — `FinancialRecordsContext.tsx:653-656`) and sends the **entire array** as part of `financialContext` in the POST body:

```ts
// AIFinancialAssistant.tsx:153-174
const financialContext = {
  activeTenant, activeWorkspace, financialEvents, cashAccounts,
  bankAccounts, debtRecords, financialCommitments,
  financialEvidencePackages, ocrLearnedPatterns   // <- full array, sent as-is
};
const res = await fetch("/api/ai/assistant", {
  method: "POST",
  body: JSON.stringify({ query: queryText, financialContext, userId: user?.id })
});
```

- The server then injects whatever it received, unmodified, into the prompt:

```ts
// server.ts:858
7. OCR Learned Vendor Patterns (Learning Layer memory): ${JSON.stringify(financialContext?.ocrLearnedPatterns || [])}
```

**Conclusion:** the AI does receive the full set of learned patterns on every single chat call — sourced from the client's already-loaded state, not a fresh server query — but the effect is identical: the LLM sees the tenant's complete vendor-learning history every time.

---

## 2. What records are retrieved?

All `ocr_learned_patterns` rows for the active workspace currently held in client state (no limit, no filtering, no relevance ranking — unlike the Knowledge Bank's keyword-filtered top-8). For the test scenario (5 confirmed "Family Store" / "Pembelian Stok" transactions), after Transaction 5 is confirmed, exactly **one row** exists for this vendor:

```json
{
  "vendorName": "Family Store",
  "category": "Pembelian Stok",
  "recordType": "EXPENSE",
  "confidenceScore": <rolling average, see §6>,
  "occurrenceCount": 5,
  "lastUpdated": "<timestamp of Txn 5 confirmation>"
}
```

This single row is what gets sent to the LLM ahead of Transaction 6 — not 5 separate rows. `learnOcrPattern()`'s dedup logic (exact case-insensitive match, `FinancialRecordsContext.tsx:1527-1529`) collapses repeats of the same vendor into one row, incrementing `occurrence_count` and re-averaging confidence each time (proven in the prior report, §5A).

---

## 3. How do retrieved records influence classification?

Via an explicit, mandatory instruction in the system prompt — not implicit "hope the LLM notices it in the JSON dump":

```
// server.ts:877 — "APPLYING LEARNED PATTERNS" rule
APPLYING LEARNED PATTERNS (this is how you demonstrably learn from this
tenant's own history, not generic guessing): before asking the user to
clarify a category, check whether the transaction's relatedParty/vendor
name matches (case-insensitively, allowing minor spelling variation) a
"vendorName" already present in section 7's OCR Learned Vendor Patterns.
If it matches, reuse that pattern's "category" and "recordType" directly
in your CONFIRM_TRANSACTION suggestion instead of guessing or asking, and
set "confidenceScore" to at least that pattern's confidenceScore (higher
occurrenceCount = more trustworthy — you may state in 'text' that you
recognized the vendor from past records, e.g. "Saya kenal pasti [vendor]
biasanya direkod sebagai [kategori]"). Only fall back to LEARN_PATTERN /
asking the user when no matching learned vendor exists.
```

It is also reinforced in the priority-order instruction at `server.ts:868`, which ranks "OCR Learned Vendor Patterns (section 7 — this tenant's own confirmed history, **highest trust**)" as priority **#4**, above the cross-tenant Knowledge Bank (priority #5) and above general world knowledge (priority #6) — only User Profile (#1), Workspace context (#2), and the tenant's own raw transaction history (#3) outrank it.

---

## 4. Does AI auto-suggest category?

**Yes — proven by the rule text above**: "reuse that pattern's 'category' ... directly in your CONFIRM_TRANSACTION suggestion instead of guessing or asking." For the test scenario, Transaction 6 ("Family Store RM800", no category stated) gets `category: "Pembelian Stok"` auto-filled from the matched pattern, with **no clarifying question asked** — the rule explicitly forbids asking when a matching vendor exists.

---

## 5. Does AI auto-suggest workspace?

**No.** Re-checking `server.ts:868`'s instruction: *"(2) Workspace/Tenant context (the single active workspace given above — **do not guess at OTHER workspaces you cannot see**)."* `ocr_learned_patterns` rows are scoped and sent per the **currently active workspace only** (`FinancialRecordsContext.tsx:656`: `.eq("workspace_id", wsId)`); the AI assistant call never receives or considers other workspaces' patterns. The only place cross-workspace pattern data is queried at all is `OwnerDashboard.tsx:1340-1346`, which is a separate, narrower owner-only "suggest from your other workspaces" feature unrelated to the chat assistant's classification flow.

**Conclusion: workspace selection is not learned or influenced by `ocr_learned_patterns` in the chat path** — it is fixed to whatever workspace is already active when the user opens the chat.

---

## 6. Does confidence increase?

**Yes — proven by the rolling-average formula** (`FinancialRecordsContext.tsx:1548-1552`):

```ts
const newOccurrence = oldElement.occurrenceCount + 1;
const newConfidence = parseFloat(
  ((oldElement.confidenceScore * oldElement.occurrenceCount + pattern.confidenceScore) / newOccurrence).toFixed(4)
);
```

Tracing the test scenario (each confirmation passes a typical caller-supplied `confidenceScore` of 0.9, per the call-site default seen in `OwnerDashboard.tsx:1633` / `StaffHomeScreen.tsx`):

| Txn | occurrenceCount before→after | confidenceScore stored |
|---|---|---|
| 1 (CREATE) | 0→1 | 0.9000 |
| 2 (UPDATE) | 1→2 | (0.9×1+0.9)/2 = 0.9000 |
| 3 (UPDATE) | 2→3 | (0.9×2+0.9)/3 = 0.9000 |
| 4 (UPDATE) | 3→4 | (0.9×3+0.9)/4 = 0.9000 |
| 5 (UPDATE) | 4→5 | (0.9×4+0.9)/5 = 0.9000 |

With a constant 0.9 input each time, the rolling average stays flat at 0.9000 — confidence doesn't numerically climb in this exact scenario because every confirmation supplied the same score. **But `occurrenceCount` does climb (1→5)**, and the LLM instruction explicitly treats `occurrenceCount` as a trust signal independent of the raw `confidenceScore` number ("higher occurrenceCount = more trustworthy"). So:

- **The stored `confidenceScore` field**: flat in this scenario (input-dependent — it would rise if a later confirmation passed a higher score than the running average, or fall if lower).
- **The AI's effective trust**: increases, because the prompt instructs the LLM to also weigh `occurrenceCount`, and to set its own `confidenceScore` output to "at least" the pattern's score — with 5 occurrences behind it, the LLM has a materially stronger signal at Transaction 6 than it would with 1.

---

## 7. What changes between Transaction #1 and Transaction #6?

| | Transaction 1 (first-ever "Family Store") | Transaction 6 ("Family Store RM800", no category stated) |
|---|---|---|
| Matching learned pattern at chat-call time | **None** — `ocr_learned_patterns` has zero rows for this vendor | **One row**: `vendorName: "Family Store", category: "Pembelian Stok", recordType: "EXPENSE", occurrenceCount: 5` |
| AI behavior per `server.ts:877` | Falls to "no matching learned vendor" branch → must guess from world knowledge or Knowledge Bank, or emit a `LEARN_PATTERN` suggestion instead of confidently classifying | Reuses the pattern's `category`/`recordType` directly — **no guessing, no LEARN_PATTERN fallback** |
| Category auto-suggested? | Only via Knowledge Bank/world-knowledge guess (lower priority, less specific) | Yes, directly from this tenant's own confirmed history — explicitly told by the prompt to skip asking |
| Clarifying question risk | Higher — the rule only forbids asking when a learned vendor exists | None — disambiguation rule doesn't apply, vendor is known |
| `text` field tone | Generic | Prompt explicitly licenses language like *"Saya kenal pasti Family Store biasanya direkod sebagai Pembelian Stok"* |
| Confidence basis | Whatever world-knowledge/Knowledge-Bank confidence the LLM assigns unaided | Anchored to "at least" the pattern's `confidenceScore`, reinforced by `occurrenceCount: 5` as an explicit trust multiplier per the prompt rule |

**The vendor went from "unknown" to "recognized with 5 confirmed prior occurrences," and the system prompt's rule set changes the AI's actual behavior (skip-guessing, skip-asking, reuse-category, floor-the-confidence) accordingly — not just the underlying data.**

---

## Answers

### A. Is learned data actually reused?
**Yes.** `ocrLearnedPatterns` is read from context state, sent on every chat request (`AIFinancialAssistant.tsx:153-163`), injected verbatim into the LLM prompt (`server.ts:858`), and the LLM is given a mandatory rule instructing it to reuse the matched row's fields (`server.ts:877`).

### B. Is learning affecting AI decisions?
**Yes.** The "APPLYING LEARNED PATTERNS" rule is not advisory language buried in a data dump — it directly overrides the AI's default disambiguation/asking behavior: *"reuse... instead of guessing or asking."* This changes the actual suggestion the AI produces (see §7 table).

### C. Is learning affecting confidence scores?
**Yes, conditionally.** The stored `confidenceScore` on the pattern row is a true rolling average that moves with whatever score each confirmation supplies (proven by formula in §6) — it stayed flat in this exact test only because every input happened to be 0.9. Separately, the AI's *output* confidence is explicitly anchored ("at least that pattern's confidenceScore") and informed by `occurrenceCount` as an independent trust signal, so the AI's effective confidence at Transaction 6 is materially higher than at Transaction 1 even though the stored number didn't move in this particular scenario.

### D. Is learning affecting workspace selection?
**No.** `ocr_learned_patterns` is workspace-scoped at load time (`.eq("workspace_id", wsId)`) and the prompt explicitly forbids guessing at other workspaces (`server.ts:868`, priority #2). The chat assistant never uses learned patterns to choose *which* workspace a transaction belongs to — only the already-active workspace is ever in scope.

### E. Is learning affecting category suggestions?
**Yes — directly and explicitly.** This is the single clearest "used, not just stored" finding: `server.ts:877` instructs the AI to copy the matched pattern's `category` and `recordType` straight into its `CONFIRM_TRANSACTION` suggestion payload.

### F. Is learning only stored but never used?
**No — this audit disproves that hypothesis.** Unlike a dead-end logging table, `ocr_learned_patterns` has a real, traceable consumer: every chat request carries it into the system prompt, and a dedicated prompt rule (§3) makes the LLM's classification behavior conditional on its contents. The full loop — confirm → learn → re-inject → reuse → confirm again — is closed and active.

---

## Report Metadata
- **File path:** `/home/user/mykerani-app/MYKERANI_OCR_LEARNING_USAGE_AUDIT.md`
- **Verification method:** Direct grep/read trace of `src/components/AIFinancialAssistant.tsx`, `src/context/FinancialRecordsContext.tsx`, and `server.ts` (system prompt construction, lines 839-891). No live LLM call was made to observe a literal Transaction 6 response; the conclusions above are derived from the deterministic prompt-construction code and the explicit instruction text the LLM is given, which is the verifiable, code-level proof available without invoking a live AI completion.
