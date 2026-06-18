# Superpowers — Installation Record

> Lightweight, project-scoped integration. Installed: vendored skill files +
> `CLAUDE.md` only. No official plugin/marketplace install was performed.
> See `SUPERPOWERS_ANALYSIS.md`, `SUPERPOWERS_INTEGRATION_PLAN.md`, and
> `SUPERPOWERS_IMPLEMENTATION_PROPOSAL.md` for the analysis and approval
> trail that led to this installation.

## What was installed

Six skills from [obra/superpowers](https://github.com/obra/superpowers)
(MIT License, © Jesse Vincent), hand-adapted and vendored as ordinary
project-scoped Claude Code skills under `.claude/skills/`:

1. `superpowers-verification-before-completion`
2. `superpowers-systematic-debugging`
3. `superpowers-subagent-driven-development`
4. `superpowers-dispatching-parallel-agents`
5. `superpowers-writing-plans`
6. `superpowers-finishing-a-development-branch`

Each file carries a frontmatter `source:` and `adapted-for:` field crediting
the upstream license/author and documenting what was changed for this
project (mainly: substituting MyKerani's actual verification command —
`npx tsc --noEmit -p .` + `npm run build` — for the upstream assumption of
an existing test suite, and removing/softening language that implied a
mandatory human-approval checkpoint before implementation).

`CLAUDE.md` was created at the repo root as the project constitution,
stating the autonomy grant, the "everything must be real" mandate, the
verification standard, and architecture guardrails — so these skills (and
any future ones) interpret "done" the way this project actually means it.

## What was deliberately NOT installed

- The official Superpowers plugin/marketplace registration
  (`/plugin install superpowers@...`) — not used, because it is
  all-or-nothing and bundles a `session-start` hook that auto-injects itself
  into every message, which is the actual source of unwanted
  approval-gating behavior.
- `test-driven-development` — excluded per explicit instruction (no strict
  TDD enforcement).
- `brainstorming`, `executing-plans` — excluded because their core content
  is a mandatory "stop for design approval before writing code" checkpoint,
  which conflicts with this project's autonomy grant.
- `using-git-worktrees`, `requesting-code-review`, `receiving-code-review`,
  `writing-skills`, `using-superpowers` — excluded as redundant with
  existing session capabilities or out of scope for the four target
  categories (planning, architecture review, context retention, code
  quality). Can be added later on request.
- Supporting files from the upstream `subagent-driven-development` skill
  (`scripts/`, `implementer-prompt.md`, `task-reviewer-prompt.md`) — the
  vendored version is a condensed single `SKILL.md`; the full upstream
  templates were not copied, to keep the footprint minimal. Link to the
  source repo is in that file's frontmatter if the full versions are
  wanted later.

## Constraints honored

- No application code modified (`src/**`, `server.ts` untouched).
- No database schema modified, no migrations created.
- No Railway configuration touched.
- No dependencies installed (`package.json`/`package-lock.json` untouched).
- All changes isolated to `.claude/skills/` and `CLAUDE.md`, plus this
  record and `SKILL_INVENTORY.md` at the repo root.
- Committed to a dedicated branch (`superpowers-skills-integration`) first,
  not directly onto the project's main working branch.

## How these skills activate

As ordinary project-scoped Claude Code skills, each one activates only when
its `description` matches the current task, or when explicitly invoked
(e.g. `/superpowers-systematic-debugging`). There is no session-start hook
forcing them into every message — this was a deliberate design choice (see
`SUPERPOWERS_IMPLEMENTATION_PROPOSAL.md` §"Key constraint discovered").

## Verifying the installation

```bash
ls .claude/skills/ | grep superpowers
cat CLAUDE.md
git log --oneline -5
git diff main...superpowers-skills-integration --stat
```

Expected: 6 `superpowers-*` directories under `.claude/skills/`, a new
`CLAUDE.md` at repo root, and a diff against `main` touching only those
files plus this documentation set — nothing under `src/`, `server.ts`,
`supabase/`, or `package*.json`.
