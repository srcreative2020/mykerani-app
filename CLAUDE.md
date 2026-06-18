# MyKerani — Project Constitution for Coding Agents

This file states the standing operating rules for any agent (Claude Code or
otherwise) working in this repository. It exists to keep the lightweight
Superpowers skills under `.claude/skills/superpowers-*` (and any built-in
skills) aligned with how this project actually wants to be worked on,
rather than their own generic defaults.

## 1. Autonomy

Full autonomy is granted for routine engineering work: fixing bugs,
building features, running typecheck/build, committing, pushing, and
merging/PR-ing. **Do not stop to ask for approval on routine work** — that
includes work that touches multiple files, refactors, or spans several
commits, as long as it's a continuation of already-agreed direction.

**Do stop and ask** when:
- The action is genuinely ambiguous (multiple reasonable interpretations
  with materially different outcomes).
- The action is destructive or hard to reverse (force-push, `reset --hard`
  on shared state, dropping a table, deleting a branch with unmerged work).
- The action is high-stakes and irreversible in a way routine work isn't
  (e.g. rotating/exposing a production secret, a schema change with no
  rollback path, anything affecting real customer billing data).

This overrides any skill (vendored or built-in) whose default behavior is
to pause for design/plan approval before implementation. Use
`superpowers-writing-plans` only when a plan is explicitly requested, not
as a gate before routine changes.

## 2. Everything must be real

No AI feature, storage feature, or payment feature in MyKerani may be
mock, dummy, or cosmetic. If something looks like a dashboard, button, or
data table, it must be backed by real Supabase data, a real RPC, or a real
external API call (Chip Asia, the AI provider router, etc.) — never a
hardcoded placeholder pretending to be live. If a feature can't be made
real yet (e.g. it needs a credential the user hasn't provided), say so
explicitly rather than shipping a fake version of it.

## 3. Verification standard

This project has **no test runner** configured yet (no Jest/Vitest in
`package.json`). Until one is added, "verified" means:

```bash
npx tsc --noEmit -p .
npm run build
```

Both must pass clean before any commit that touches `server.ts`, `src/**`,
or `supabase/migrations/**`. This is the project's de facto "tests pass"
gate referenced by the vendored `superpowers-verification-before-completion`
and `superpowers-finishing-a-development-branch` skills.

## 4. Architecture guardrails

- **Server-side secrets stay server-side.** Chip Asia keys, AI provider
  keys, and the Supabase service-role key are read only in `server.ts` via
  service-role calls — never exposed to client code.
- **HQ-only operations** go through SECURITY DEFINER RPCs gated by
  `is_hq_user()` (checks `user_role_assignments` joined to
  `tenants.category = 'HQ'`). Don't gate HQ logic in client-side checks
  alone.
- **Tenant-side writes** (e.g. submitting a payment) are gated by
  `user_role_assignments.role = 'TENANT_OWNER'` checks inside the RPC, not
  just in the UI.
- **`user_role_assignments`** is the authoritative source for
  tenant-membership/role checks — `profiles.tenant_id` is unreliable for
  this purpose in this codebase.

## 5. Git workflow

- Prefer new commits over amends; never skip hooks or force-push without
  explicit instruction.
- Routine branches: typecheck + build clean → commit → push → PR (draft by
  default, per the project's GitHub MCP workflow) unless told otherwise.
- Investigate before discarding any in-progress state (merge conflicts,
  unfamiliar branches, stashes) — don't reach for `--hard`/`--force` as a
  shortcut past an obstacle.

## 6. Deployment

Railway is configured to deploy from `main` (verify current state if
unsure — don't assume). Merging to `main` has real deploy consequences;
the verification standard in §3 is the only gate before that happens, so
don't skip it to save time.

## 7. Skills available in this repo

`.claude/skills/superpowers-*` — a curated, hand-adapted subset of the
[obra/superpowers](https://github.com/obra/superpowers) skill library
(MIT licensed), vendored as project-scoped skills rather than the full
official plugin, specifically to exclude strict TDD enforcement and
mandatory pre-step approval gating. See `SKILL_INVENTORY.md` for the full
list and what was deliberately left out, and `SUPERPOWERS_INSTALLED.md`
for the installation record.
