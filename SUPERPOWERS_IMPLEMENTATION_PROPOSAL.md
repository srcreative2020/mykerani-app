# Superpowers Implementation Proposal (Draft — awaiting approval)

> No action taken yet. This proposes a specific, scoped install based on
> your recommendation: keep planning/architecture-review/context-retention/
> code-quality value, drop strict TDD enforcement and mandatory pre-step
> approval, and do not touch application code.

## Key constraint discovered, and how this proposal handles it

The *official* Superpowers install (`/plugin install
superpowers@claude-plugins-official`) is all-or-nothing: it registers all 14
skills **plus** a `session-start` hook that auto-injects "you have
superpowers, use these skills" into every session from message one. That
hook is exactly the mechanism that makes Superpowers feel like it's gating
every step with planning/approval — there's no official flag to install
"only some skills" or to disable the hook while keeping the rest.

**Proposed approach: do not use the official plugin/marketplace install at
all.** Instead, vendor a hand-picked subset of skill files as ordinary
**project-scoped skills** under `mykerani-app/.claude/skills/`, the same
mechanism already used by this session's other project skills. This gets
you the actual playbook content you want, with none of the auto-triggering
hook behavior, because:
- Project skills only activate when their description matches the task or
  they're explicitly invoked (`/skill-name`) — they don't force themselves
  into every message the way the official hook does.
- We simply don't vendor `test-driven-development` (no strict TDD) or the
  hook itself (no forced pre-step approval).
- Nothing outside `.claude/skills/` is touched — zero application code.

## 1. Files to be installed

New, project-scoped, additive only — no existing file's behavior changes
just by these existing:

```
mykerani-app/.claude/skills/superpowers-verification-before-completion/SKILL.md
mykerani-app/.claude/skills/superpowers-systematic-debugging/SKILL.md
mykerani-app/.claude/skills/superpowers-subagent-driven-development/SKILL.md
  ├── implementer-prompt.md
  └── task-reviewer-prompt.md
mykerani-app/.claude/skills/superpowers-dispatching-parallel-agents/SKILL.md
mykerani-app/.claude/skills/superpowers-writing-plans/SKILL.md
mykerani-app/.claude/skills/superpowers-finishing-a-development-branch/SKILL.md
```

Each `SKILL.md` would be fetched from the upstream MIT-licensed source
(`github.com/obra/superpowers/skills/<name>/SKILL.md`) and adapted only to:
- prefix the skill name with `superpowers-` to avoid any future name
  collision with built-in skills (`verify`, `code-review`, etc.) or with a
  real official install later,
  -add a one-line frontmatter note that this is advisory/on-demand, not an
  enforced gate, matching the rule below.
- Attribution preserved (MIT license, link to source repo) in each file's
  header.

| Skill (vendored) | Why it matches your "yes" list | Why it's safe re: approval-gating |
|---|---|---|
| `verification-before-completion` | Code quality — formalizes the tsc+build check this project already does before every commit | Purely a "did I actually verify this" checklist, runs *after* work is done, not a pre-step gate |
| `systematic-debugging` | Code quality | A root-cause methodology for when something breaks — invoked on demand, not blocking |
| `subagent-driven-development` | Context retention — delegates implementation chunks to subagents so the main session's context isn't consumed by execution detail | No mandatory human-approval step required to use it; you already use `Agent`/subagents this way |
| `dispatching-parallel-agents` | Context retention — same rationale, for independent parallel work | Same |
| `writing-plans` | Planning / architecture review | Vendored as a reference template for *when you ask for a plan* (e.g. "write a plan for X") — not wired to require a plan before any code change |
| `finishing-a-development-branch` | Architecture/code-quality closure — codifies the typecheck→build→commit→push→PR pattern already used here | Describes how to close out work, doesn't block starting it |

**Explicitly excluded from vendoring** (per your instructions):
- `test-driven-development` — strict TDD enforcement, excluded.
- `brainstorming`, `executing-plans` — these are the skills whose actual
  content centers on a mandatory "stop and get human approval on the
  design before writing code" checkpoint. Excluding them removes the
  approval-gating behavior at the source, rather than relying on an
  override to suppress it.
- `using-git-worktrees`, `requesting-code-review`/`receiving-code-review`,
  `writing-skills`, `using-superpowers` — redundant with this session's
  existing skills/workflow or not relevant to the four categories you
  named; left out to keep the footprint minimal. Can be added later if
  you want any of them specifically.
- The official `hooks/session-start` auto-injection hook — not used at all
  under this approach.

## 2. Files to be modified

**None, if you're fine relying on the skills being discoverable purely by
folder presence under `.claude/skills/`.**

Optional (recommend, but separately approvable — tell me if you want this
included or skipped):
- `mykerani-app/CLAUDE.md` — **new file**, not a modification of existing
  app code. Would state the standing rules (full autonomy for routine
  work; everything must be real; verification before every commit) so
  that even the vendored "code quality" skills interpret "complete" the
  same way this project already does. This is the same `CLAUDE.md`
  proposed in `SUPERPOWERS_INTEGRATION_PLAN.md` Phase 2 — restating it
  here since it directly reduces the residual risk of any skill
  reintroducing approval-seeking phrasing on its own initiative.

No file under `src/`, `server.ts`, `supabase/`, `package.json`, or any
build/deploy config is touched by this proposal, in either the required or
optional parts.

## 3. Expected behavior changes

- **No change to default behavior on ordinary tasks.** Since these are
  project skills (not an auto-injecting hook), nothing changes unless a
  skill's description matches the task at hand or you explicitly invoke
  one (e.g. `/superpowers-writing-plans`).
- When a task's nature matches a vendored skill's trigger description
  (e.g. you ask to debug a tricky bug → `systematic-debugging` may surface;
  you ask for a multi-step build broken into parallel chunks →
  `dispatching-parallel-agents`/`subagent-driven-development` may surface),
  Claude Code may proactively reference that skill's playbook — same as
  how the existing `run`, `verify`, `code-review` skills already behave in
  this session.
- **No new approval prompts will be introduced.** None of the vendored
  skills' content instructs stopping for human sign-off before
  implementation; the two skills that do (`brainstorming`,
  `executing-plans`) are excluded.
- **No TDD enforcement.** `test-driven-development` is excluded, so no
  RED-GREEN-REFACTOR requirement is introduced. The project still has no
  test runner, so this remains moot either way.
- **Slightly more structured commit/branch hygiene** is possible if
  `finishing-a-development-branch` gets referenced — but it describes a
  workflow extremely close to what's already practiced here (typecheck →
  build → commit → push → PR → merge), so in practice this should be
  unnoticeable as a *change*, more a documented confirmation of existing
  practice.

## 4. Rollback procedure

Because everything proposed lives under one directory and optionally one
new root file:

```bash
# Full rollback — remove all vendored skills
rm -rf mykerani-app/.claude/skills/superpowers-*

# If CLAUDE.md was also added and you want to remove it too
rm mykerani-app/CLAUDE.md

git add -A
git commit -m "Revert: remove vendored Superpowers skills"
git push
```

No database migration, dependency, build config, or deploy artifact is
ever touched, so rollback carries zero risk to the running app — it is a
pure file deletion + commit, reversible at any time, and since this is a
project-scoped (not global/account-level) change, no other Claude Code
project is ever affected.

## What happens next

I will not fetch, create, or modify any of the files above until you
confirm. Specifically waiting on:
1. Approval of the 6-skill list in §1 (add/remove any?).
2. Whether to include the optional `CLAUDE.md` in §2, or skip it for now.
3. Confirmation to proceed with vendoring (read-only fetch of the 6 skills'
   MIT-licensed source content, then write them under `.claude/skills/`,
   commit, push) once 1–2 are settled.
