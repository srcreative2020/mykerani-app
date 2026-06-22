# MyKerani — Owner-Staff Parity Rule

> STATUS: LOCKED, V1.0

MyKerani is a multi-user financial system. Tenant Owner is the authority.
Tenant Staff are operators. All financial logic must be shared.

## Core Rule

Financial engines must never be duplicated. This applies to every engine
listed below, and any future engine of the same kind:

- OCR Processing
- AI Transaction Processing
- Voice Note Processing
- Business Mapping
- Branch Mapping
- Evidence Linking
- Import Recovery
- Learning Memory
- Duplicate Detection
- Financial Ledger Processing

Owner and Staff may have different screens. Owner and Staff may have
different permissions. Owner and Staff must NOT have different financial
engines.

## Mandatory Audit

Before any feature touching one of the engines above is marked COMPLETE,
the developer (human or AI) must verify both:

1. Tenant Owner flow
2. Tenant Staff flow

And answer:

- A. Is the same financial engine used?
- B. Is the same transaction pipeline used?
- C. Is the same mapping engine used?
- D. Is the same evidence engine used?
- E. Is the same ledger persistence layer used?

If the answer to any of A-E is "no" for a feature that touches a listed
engine, the feature is NOT complete — fix the divergence or get explicit
sign-off to defer it, before moving on.

## Red Flag

If an implementation modifies `OwnerDashboard.tsx` or any other
Owner-only screen for one of the listed engines, without verifying the
equivalent Staff flow (currently `StaffHomeScreen.tsx`), the feature is
NOT considered complete, even if Owner-side tests/typecheck/build pass.

## Preferred Architecture

Business logic for the listed engines must live in:

- `src/lib/` (pure services/libraries, e.g. `businessMatching.ts`)
- `src/hooks/`
- `src/context/` (e.g. `FinancialRecordsContext.tsx`)
- shared engines generally

NOT inside Owner-only screens. Screen files (`OwnerDashboard.tsx`,
`StaffHomeScreen.tsx`) should call into shared logic, not contain it.

## Success Criteria

One Financial Engine. Many Users. Different UI. Same Financial Logic.

## Known Open Divergences (as of Phase 2A.1 audit)

Tracked here so they aren't silently re-introduced or forgotten — see
`MYKERANI_PHASE2A1_OWNER_STAFF_AUDIT.md` (if present) for full evidence:

- Business/Branch Mapping: Owner-only (`matchOwnBusiness`/
  `matchOwnBusinessAndBranch` not called from `StaffHomeScreen.tsx`).
- AI Chat Confirmation: forked implementation
  (`handleChatConfirmSuggestion` exists separately in both screens);
  Staff's DEBT/COMMITMENT branches use the non-awaited, non-error-surfacing
  `addDebtRecord`/`addFinancialCommitment` instead of the `*Awaited`
  variants Owner uses.
- Evidence Linking: two independent call sites (Owner's `linkDocEvidence`
  in doc-review, Staff's inline block in chat-confirm) with no shared
  helper; Owner's chat-confirm path has no evidence-linking step at all.
- Import Recovery / Bulk Bank Statement Import: Owner-only; no Staff
  equivalent exists.

These must be resolved (or explicitly deferred with owner sign-off)
before any further feature work touches the affected engines.
