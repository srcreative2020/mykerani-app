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

## Known Open Divergences

Tracked here so they aren't silently re-introduced or forgotten.

Resolved (Owner/Staff Pipeline Unification):
- AI Chat Confirmation: both screens now call the shared
  `useConfirmChatSuggestion()` hook (`src/hooks/useConfirmChatSuggestion.ts`)
  instead of separate `handleChatConfirmSuggestion` implementations. Staff's
  DEBT/COMMITMENT branches now use the `*Awaited` variants with the same
  try/catch error-surfacing Owner uses.
- Evidence Linking: both screens call the shared `linkEvidenceToRecord()`
  (`src/context/FinancialRecordsContext.tsx`) via the same hook.
- Business/Branch Mapping for AI Chat: Staff's `sendChat` now calls
  `matchOwnBusinessAndBranch` (same engine as Owner), and
  `StaffHomeScreen.tsx` now fetches `businessBranches` the same way
  `OwnerDashboard.tsx` does.
- Cross-Workspace Pattern Hint (Learning Memory, AI Chat): `checkCrossWorkspacePattern`
  was Owner-only with no Staff equivalent and untracked here. Audit found
  `StaffHomeScreen.tsx` already renders a workspace switcher
  (`workspaces.length > 1`) and shares the same `useWorkspace()` data as
  Owner, so multi-workspace Staff sessions are real, not theoretical — this
  was an unintended parity gap (B), not an intended permission difference.
  Fixed by extracting the logic into the shared `useCrossWorkspacePattern()`
  hook (`src/hooks/useCrossWorkspacePattern.ts`), now called identically
  from both `OwnerDashboard.tsx` and `StaffHomeScreen.tsx`'s `sendChat`, with
  the matching hint banner rendered on both screens.

Still open:
- Import Recovery / Bulk Bank Statement Import: Owner-only; no Staff
  equivalent exists.
- Business/Branch Mapping for OCR Receipt/Invoice review and Voice Note
  confirmation flows: still Owner-only; Staff's OCR/voice-note confirm
  paths have not yet been audited against this rule.

These must be resolved (or explicitly deferred with owner sign-off)
before any further feature work touches the affected engines.
