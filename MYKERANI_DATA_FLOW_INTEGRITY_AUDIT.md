# MyKerani — Data Flow Integrity Audit

**Status:** Audit only. No code changed.
**File path:** `/home/user/mykerani-app/MYKERANI_DATA_FLOW_INTEGRITY_AUDIT.md`
**Method:** Direct code trace (file:line citations below) of every transaction-entry surface and the shared data layer they write into. No design review, no architecture proposal — execution paths as they exist today.

---

## 1. Input Sources Traced

| # | Source | File | Confirm handler |
|---|---|---|---|
| 1a | AI Chat — Text/Voice/OCR/Image/PDF/Attachment (Owner) | `src/screens/OwnerDashboard.tsx` | `handleChatConfirmSuggestion` (~1420-1551) |
| 1b | AI Chat — Text/Voice/OCR/Image/PDF/Attachment (Staff) | `src/screens/StaffHomeScreen.tsx` | `handleChatConfirmSuggestion` (~461-592) |
| 1c | AI Chat — Text (standalone assistant) | `src/components/AIFinancialAssistant.tsx` | `handleConfirmSuggestion` (~352-472) |
| 2 | Document Upload Screen | `src/components/FinancialEvidencePackage.tsx`, `src/components/OCREngineConsole.tsx` | upload handler / `handleConfirmStatementTransaction` |
| 3/4/5 | Manual Entry (Owner/Staff identical form) | `src/components/FinancialRecordsConsole.tsx` | `handleAddEventSubmit` (~295-317) |

All six chat input modalities (text/voice/OCR/image/PDF/attachment) converge on the **same** `handleChatConfirmSuggestion` / `handleConfirmSuggestion` per screen before reaching the database — the modality only affects how `parsedResponse` is produced server-side, not how it is written.

---

## 2. Data Sources (Single Source of Truth)

`src/context/FinancialRecordsContext.tsx` is the **only** client-side store for financial records. All five entry surfaces above call the same context functions:

- `addFinancialEvent()` (~757-889) → `income_records` / `expense_records` / `receivables` / `payables`
- `addDebtRecord()` (~1166-1197) → `debts`
- `addFinancialCommitment()` (~1252-1297) → `financial_commitments`
- `addFinancialEvidencePackage()` (~1387-1425) → `financial_evidence_packages`
- `learnOcrPattern()` (~1515-1632) → `ocr_learned_patterns`

No entry surface bypasses this context with its own direct Supabase write — confirmed by tracing every call site of `addFinancialEvent`/`addDebtRecord` (chat, OCR console, manual entry all call the identical function). **Single Source of Truth: PASS** for the core financial-event write path.

**Note on `DEBT` vs `addDebtRecord`:** these are two distinct, non-contradictory mechanisms. An AI `CONFIRM_TRANSACTION` suggestion with `transactionType: "DEBT"` goes through `addFinancialEvent()` into `expense_records` (description prefixed `"[DEBT] "`) — an immediate cash-basis expense entry. A structured, trackable loan/obligation (principal, maturity date, interest) goes through `addDebtRecord()` into the standalone `debts` table. Both are legitimate, intentionally separate models for two different real-world objects (a debt-funded purchase recorded as an expense vs. a tracked loan).

**Load path:** a single `useEffect` in `FinancialRecordsContext.tsx` (~347-699) fetches all tables once per `activeWorkspace`/`user` change via `.select("*").eq("workspace_id", wsId)`. **No Supabase realtime subscription exists anywhere in this file** (confirmed: no `.on()`/`.subscribe()` calls). Cross-session updates require a full remount; the acting user's own writes stay consistent only via the optimistic local `setFinancialEvents()` call that precedes the async Supabase write.

---

## 3. Owner Flow

| Step | Verdict | Evidence |
|---|---|---|
| Chat confirm → `addFinancialEvent` | PASS | `OwnerDashboard.tsx` ~1420-1551 calls the shared context function identically to Staff/AIFinancialAssistant |
| Evidence package linkage on confirm | **WARNING** | `addFinancialEvidencePackage` is called only once in this file, inside `attachTxnReceipt` (~381-408) — a *separate, post-hoc* "attach receipt to an existing transaction" action reachable from the transaction list, **not** from the chat confirm handler itself. If a chat suggestion originated from an OCR/image/PDF upload, the evidence file is not automatically linked to the resulting financial record at confirm time; the owner must manually re-attach it afterward. |
| Audit log on confirm | PASS | `addFinancialEvent()` itself calls `writeAuditLog()` (~799-806), so every Owner-confirmed transaction is audited regardless of screen |
| Dashboard read | PASS | Dashboard tab derives `myEvents`/`incomeInPeriod`/`expenseInPeriod` directly from the same in-memory `financialEvents` array (~313, ~345-356) — no separate fetch, no separate source |

---

## 4. Staff Flow

| Step | Verdict | Evidence |
|---|---|---|
| Chat confirm → `addFinancialEvent` | PASS | `StaffHomeScreen.tsx` ~461-592 calls the same shared `addFinancialEvent()` |
| Evidence package linkage | **FAIL** | `StaffHomeScreen.tsx` does not import or call `addFinancialEvidencePackage` anywhere in the file (absent from the `useFinancials()` destructure at ~182, and no call site exists). A `chatEvidenceFilesRef` is held client-side (~447) for an OCR/image/PDF attachment, but it is never persisted into `financial_evidence_packages` on confirm. Staff have **no path at all** — not even a manual one — to record evidence linkage; Owner at least has `attachTxnReceipt` as a workaround. |
| Audit log on confirm | PASS | Same shared `addFinancialEvent()` → `writeAuditLog()` path as Owner |
| Dashboard/data visibility vs Owner | PASS | RLS policies (`supabase/migrations/20260611000000_mykerani_rls_foundation.sql` ~141-225) scope rows by `workspace_id`/tenant only — no role-based filtering. `FinancialRecordsProvider` wraps the app once above role routing in `App.tsx`, so Owner and Staff share one context instance and see identical rows once each has loaded/refreshed it. |

---

## 5. Archive Flow

No screen in the codebase is literally named/labelled "Archive" for financial records. The only code element matching "Archive" terminology is the **chat history archive** (`chatHistoryAll`, loaded once at mount via `loadChatHistory()`, `OwnerDashboard.tsx` ~945-973, rendered ~3033-3089) — a log of past AI conversations, not a financial-records ledger view.

The functional equivalent of a financial "Archive" is `FinancialRecordsConsole.tsx`'s list view, which reads from the same `financialEvents` array as everything else (no separate query). **Verdict: PASS for data consistency** (it reads the one shared array), **WARNING on terminology** — there is no dedicated "Archive" surface matching the user's template name, so "Archive ≠ Financial Events" cannot diverge structurally because they are, in this codebase, the same underlying list rendered in different components.

---

## 6. Dashboard Flow

| Check | Verdict | Evidence |
|---|---|---|
| Same source as confirm | PASS | Dashboard summary cards in `OwnerDashboard.tsx` (~2260-2288) are memoized derivations of the same `financialEvents` context array used by the confirm handlers — no intermediate cache, no separate Supabase query for the dashboard itself |
| Hybrid summary in console | WARNING | `FinancialRecordsConsole.tsx` (~264-266) falls back between an optional `supabaseSummary` prop and an in-memory `financialEvents`-derived total. If the Supabase summary fetch is slow or fails while the context's in-memory list has already updated optimistically, the two numbers can transiently disagree until the prop resolves — a real but narrow, self-correcting race, not a persistent divergence |
| Refresh required for own writes | PASS (no refresh needed) | Optimistic `setFinancialEvents()` runs synchronously before the async Supabase write, so the acting user's own dashboard reflects their own confirm immediately |
| Refresh required for other users' writes | **WARNING** | No realtime subscription exists; a teammate's concurrent confirm is invisible until the context remounts (app reload / workspace switch) |

---

## 7. Learning Flow

| Check | Verdict | Evidence |
|---|---|---|
| OCR console writes pattern on confirm | PASS | `OCREngineConsole.tsx` calls `learnOcrPattern()` (~395-401) alongside `addFinancialEvent`/`addFinancialEvidencePackage` in the same confirm action — all three writes happen together |
| Chat-originated OCR confirms also learn | PASS | `AIFinancialAssistant.tsx` confirm handler calls `learnOcrPattern()` (~445-451) |
| Audit log for learning writes | PASS | `learnOcrPattern()` itself calls `writeAuditLog()` (module "OCR Learning", ~1593-1600) |
| Duplicate-pattern protection | PASS | Fuzzy vendor-name matching before insert (~1527-1534) prevents redundant pattern rows for the same vendor |

---

## 8. Audit Log Coverage

| Function | Writes `writeAuditLog()`? |
|---|---|
| `addFinancialEvent` / `editFinancialEvent` / `deleteFinancialEvent` | ✅ (~799-806, ~901, ~988) |
| `addFinancialCommitment` | ✅ (~1260) |
| `addFinancialEvidencePackage` | ✅ (~1395) |
| `learnOcrPattern` | ✅ (~1593-1600) |
| **`addDebtRecord` / `editDebtRecord` / `deleteDebtRecord`** | ❌ — confirmed by direct read of `FinancialRecordsContext.tsx` lines 1166-1249: all three functions write to `debts` (insert/update/delete) with no `writeAuditLog()` call anywhere in their bodies. |

This is a genuine, verified gap: any structured loan/debt record (create, edit, or delete) leaves **no audit trail**, unlike every other record type in the system.

`AIFinancialAssistant.tsx`'s confirm handler additionally fires its own `logEvent()` call for "AI_ANALYSIS" (~454-465) — this is a separate *event log* entry (per CLAUDE.md's Event Logging Rule), made **in addition to**, not instead of, the `writeAuditLog()` call already triggered inside whichever `add*` function it called. The two log tables are not in conflict; `addDebtRecord`'s gap is specifically in `audit_logs`, independent of this.

---

## 9. Transaction Exists BUT Dashboard ≠ Archive ≠ Financial Events — Search Result

No case was found where the **same persisted record** renders different values across Dashboard, the financial-records list ("Archive" equivalent), and the underlying `financial_events`-derived array, because all three read the identical in-memory context array with no intermediate caching layer or separate query. The closest things to a divergence are:

1. The `FinancialRecordsConsole.tsx` hybrid-summary race (§6) — transient, self-correcting, not a standing inconsistency.
2. Evidence-linkage absence (§3/§4) — this is not a Dashboard/Archive value mismatch; it is a **missing relationship row** (`financial_evidence_packages` never created), so the underlying financial record itself is consistent everywhere, but its evidence attachment is silently absent for chat-originated Staff transactions and chat-originated Owner transactions, while present for AIFinancialAssistant-originated and OCR-console-originated ones.

**No instance of the user's top-priority failure mode (value-level Dashboard/Archive/Financial-Events divergence on an existing transaction) was found.**

---

## 10. Sync Bugs

| # | Bug | Severity |
|---|---|---|
| S1 | No Supabase realtime subscription in `FinancialRecordsContext.tsx` — a second user's write in the same workspace is invisible to other open sessions until remount | MEDIUM |

## 11. Refresh Bugs

| # | Bug | Severity |
|---|---|---|
| R1 | Same root cause as S1 — "is refresh required?" → yes, for any other user's concurrent activity; no, for the acting user's own writes (optimistic update covers that case) | MEDIUM |

## 12. State Bugs

| # | Bug | Severity |
|---|---|---|
| ST1 | `FinancialRecordsConsole.tsx` hybrid `supabaseSummary` vs in-memory-derived total can transiently disagree during the window before the prop resolves | LOW |

---

## 13. Severity Ranking (highest impact first)

| Rank | Issue | File:Line | Why it matters |
|---|---|---|---|
| 1 | **HIGH** — `StaffHomeScreen.tsx` has no evidence-package linkage at all (no import, no call site) for any chat-confirmed transaction, including OCR/image/PDF-originated ones | `src/screens/StaffHomeScreen.tsx` (absent from ~182 destructure) | Staff-side evidence attachments are silently dropped with zero workaround — receipts/invoices a staff member uploads via chat are never recorded against the resulting transaction |
| 2 | **HIGH** — `addDebtRecord`/`editDebtRecord`/`deleteDebtRecord` never write to `audit_logs` | `src/context/FinancialRecordsContext.tsx:1166-1249` | Loan/debt records are completely unaudited — any create/edit/delete of a debt obligation has no trace in the audit log, unlike every other record type |
| 3 | **MEDIUM** — `OwnerDashboard.tsx`'s chat confirm handler does not auto-link evidence at confirm time; only a separate manual `attachTxnReceipt` post-hoc action exists | `src/screens/OwnerDashboard.tsx:381-408` | Less severe than Staff's total absence, since a manual recovery path exists, but the automatic linkage that `AIFinancialAssistant.tsx`/`OCREngineConsole.tsx` perform is missing here |
| 4 | **MEDIUM** — No realtime subscription; cross-session/cross-user data staleness until remount | `src/context/FinancialRecordsContext.tsx` (no `.on()`/`.subscribe()` found) | Owner and Staff can see different states of the same workspace simultaneously if both are active concurrently without a manual reload |
| 5 | **LOW** — `FinancialRecordsConsole.tsx` hybrid summary transient race | `src/components/FinancialRecordsConsole.tsx:264-266` | Self-correcting, narrow window, cosmetic only |

---

## 14. Summary Verdict Table

| Flow | PASS | WARNING | FAIL |
|---|---|---|---|
| Owner — chat confirm → write → audit | ✅ | | |
| Owner — evidence auto-linkage | | ✅ | |
| Staff — chat confirm → write → audit | ✅ | | |
| Staff — evidence auto-linkage | | | ✅ |
| Archive (terminology) vs financial-events consistency | ✅ data / ⚠ naming | | |
| Dashboard ↔ Financial Events consistency | ✅ | | |
| Learning Engine wiring (OCR + chat-OCR) | ✅ | | |
| Audit log — `addFinancialEvent`/Commitment/Evidence/OCR-learning | ✅ | | |
| Audit log — `addDebtRecord` family | | | ✅ |
| Owner/Staff row-level data parity (RLS) | ✅ | | |
| Realtime cross-session sync | | ✅ | |

---

**Report metadata:** file path `/home/user/mykerani-app/MYKERANI_DATA_FLOW_INTEGRITY_AUDIT.md`. Audit-only deliverable per explicit instruction — no source files were modified.
