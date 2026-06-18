# MyKerani — Project Mandate

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
