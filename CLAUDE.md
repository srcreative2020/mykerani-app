# MyKerani — Project Mandate

> Governing documents:
> - `MYKERANI_VISION.md` (STATUS: LOCKED, V1.0) is the master PURPOSE/VISION
>   document — why MyKerani exists, who it serves, and the non-negotiable
>   "AI Suggests → User Confirms → AI Learns" formula. Every feature, UX
>   decision, and update must align with this. If a proposed change does not
>   serve "Cakap. Upload. Sahkan." (talk, upload, confirm) for a non-accountant
>   user, or violates what AI is/isn't allowed to do (never auto-approve,
>   auto-edit, auto-delete, pay, or decide on the user's behalf), it must be
>   reconsidered.
> - `MYKERANI_CONSTITUTION.md` (STATUS: LOCKED, V1.0) is the master technical
>   constitution — defines product scope (100% financial only; no HR/CRM/POS/
>   inventory). All architecture, database, API, AI and feature decisions must
>   comply with it.
> - `MYKERANI_OWNER_STAFF_PARITY_RULE.md` (STATUS: LOCKED, V1.0) governs
>   multi-user architecture — Tenant Owner and Tenant Staff may have
>   different screens/permissions but must NEVER have different financial
>   engines (OCR, AI transaction processing, voice note processing,
>   business mapping, branch mapping, evidence linking, import recovery,
>   learning memory, duplicate detection, ledger processing). Before
>   marking any feature touching one of these engines COMPLETE, verify
>   both the Owner flow and the Staff flow per that document's Mandatory
>   Audit (A-E questions). Modifying `OwnerDashboard.tsx` for one of these
>   engines without verifying `StaffHomeScreen.tsx`'s equivalent flow is a
>   RED FLAG — the feature is not complete.
> - `MYKERANI_TENANT_ECOSYSTEM_GOVERNANCE_PRINCIPLE.md` (STATUS: LOCKED,
>   V1.0) governs tenant-internal (Owner ↔ Staff) connectedness — broader
>   than the parity rule above. Where the parity rule covers shared
>   financial *engines*, this document covers every Owner↔Staff workflow:
>   permission/workspace/notification/audit propagation, one master record
>   per entity across modules, resource (AI/OCR/storage) visibility, the
>   approval chain (Staff Action → Owner Review → Approval/Rejection →
>   Notification → Audit → Completion), and the full closed loop (Action →
>   Visibility → Notification → Audit → Response → Resolution). A feature
>   is NOT complete just because the page/UI/API/DB works — it must verify
>   both the Owner and Staff side of every rule in that document before
>   being marked COMPLETE.
> - `docs/architecture/ADR-001-MYKERANI-Commercial-Resource-Model-V1.0.md`
>   (STATUS: LOCKED, V1.0) is the master commercial resource model — defines
>   the Commercial Translation Layer separating internal HQ metrics (AI
>   Credits, OCR Credits, Resource Wallet, Token) from tenant-facing language
>   (Bilangan Resit, Muka Surat Penyata Bank, Kapasiti Storan GB, AI
>   Financial Assistant). ANY change touching Subscription Plans, Billing,
>   Resource Wallet, Trial, Promotion, Add-on, Tenant UI resource display,
>   Landing Page pricing, or Dashboard usage meters MUST comply with this
>   ADR. Key rule: tenants NEVER see AI Credits, OCR Credits, Token, or
>   Resource Wallet — only business-language equivalents via the CTL.
> - Where these overlap: the vision document defines WHY/intent, the
>   constitution defines WHAT is in/out of scope, the parity rule and the
>   tenant ecosystem governance principle define HOW multi-user logic must
>   be structured and verified, ADR-001 defines HOW the commercial and
>   resource layer is presented, and this file adds implementation-level
>   detail on top of all five.

## Data Ownership Rule

Companies own their financial records.

Users may export their data at any time.

Supported exports:

- CSV
- Excel
- PDF Reports
- JSON

HQ may never claim ownership of customer financial data.

HQ only owns:

- Platform
- AI Models
- Metadata
- Audit Infrastructure
- Analytics Infrastructure

Customer financial records remain customer property.

Implementation notes:
- Tenant-facing export of financial records (CSV/Excel/PDF/JSON) lives in
  `src/lib/exportUtils.ts`, wired into `src/components/FinancialReportsAnalytics.tsx`.
  Full workspace backup/export (all record types as JSON) is in
  `src/components/MyKeraniBackupRecovery.tsx`, gated to `TENANT_OWNER`.
- Exports must always be scoped to the requesting user's own
  `workspaceId`/`tenantId` — never cross-tenant.
- Do not add HQ-side bulk-export or ownership-transfer features over tenant
  financial data without an explicit tenant-initiated action.

## Event Logging Rule

Every system event must be recorded: Login, Logout, Upload, OCR Process,
AI Analysis, Report Generation, Export, Backup, Restore.

Event logs are separate from audit logs:
- `audit_logs` — records data **mutations** (CREATE/UPDATE/DELETE on
  financial records), written via `useAudit().writeAuditLog()`.
- `event_logs` — records system/operational **events**, written via
  `logEvent()` in `src/lib/eventLog.ts`. Supports monitoring, analytics,
  troubleshooting, and cost tracking.

Both tables share the same tenant-isolation + immutability RLS posture
(insert/select only, no update/delete), see
`supabase/migrations/20260618040000_event_logs_foundation.sql`.

Event logging is fire-and-forget and best-effort — a logging failure must
never block the underlying action. Demo/mock sessions are skipped (they use
non-UUID tenant ids with no real backing row).

Current wiring:
- LOGIN/LOGOUT — `src/context/AuthContext.tsx` (`signIn`/`signOut`)
- UPLOAD — `src/components/FinancialEvidencePackage.tsx` (`processFile`)
- OCR_PROCESS — `src/components/OCREngineConsole.tsx` (client, on save) and
  `server.ts` `logAiUsage()` (server, on the raw OCR API call)
- AI_ANALYSIS — `server.ts` `logAiUsage()`
- EXPORT / REPORT_GENERATION — `src/components/FinancialReportsAnalytics.tsx`
- BACKUP / RESTORE — `src/components/MyKeraniBackupRecovery.tsx`

## General

- Everything must be real — no mock/dummy/cosmetic features standing in for
  actual functionality.
- Verification standard before committing: `npx tsc --noEmit -p .` then
  `npm run build`, both must pass clean (errors must not increase from the
  pre-existing baseline).
- HQ-only operations are gated via SECURITY DEFINER RPCs checking
  `is_hq_user()`. Tenant-side writes are gated via
  `user_role_assignments.role` checks inside RPCs.
- Prefer new commits over amends. Routine work: typecheck + build clean →
  commit → push. Do not open a PR unless explicitly requested.
