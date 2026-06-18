# Skill Inventory — `.claude/skills/superpowers-*`

Reference table for the 6 vendored Superpowers skills. For the narrative
installation record (what was/wasn't installed and why), see
`SUPERPOWERS_INSTALLED.md`. For the approval trail, see
`SUPERPOWERS_ANALYSIS.md`, `SUPERPOWERS_INTEGRATION_PLAN.md`, and
`SUPERPOWERS_IMPLEMENTATION_PROPOSAL.md`.

| # | Skill (directory) | Source skill (obra/superpowers) | Activates when | Adapted for MyKerani | Fidelity |
|---|---|---|---|---|---|
| 1 | `superpowers-verification-before-completion` | `verification-before-completion` | Before claiming any task, fix, or feature is done | "Run tests" → `npx tsc --noEmit -p .` then `npm run build` (no test runner exists); added MyKerani-specific Common Failures table (typecheck/build/bug-fixed/migration-applied/merge-conflict/agent-delegation) | Verbatim structure, substituted verification command |
| 2 | `superpowers-systematic-debugging` | `systematic-debugging` | Any bug, test failure, build error, or unexpected behavior, before proposing fixes | TDD references reinterpreted as tsc/build/manual-repro; added tracing guidance across client → `server.ts` proxy → Supabase RPC → RLS boundaries | Verbatim structure, substituted verification command |
| 3 | `superpowers-subagent-driven-development` | `subagent-driven-development` | Multi-task plan with mostly-independent tasks, staying in current session | "Task review" reframed as advisory (self/reviewer-subagent check against plan), not a mandatory human sign-off gate | Condensed/adapted (fetch returned summary, not verbatim); upstream `scripts/`, `implementer-prompt.md`, `task-reviewer-prompt.md` NOT vendored — see frontmatter for source link |
| 4 | `superpowers-dispatching-parallel-agents` | `dispatching-parallel-agents` | 3+ independent, unrelated problems that can be investigated/fixed without shared context | Mapped explicitly onto this session's `Agent` tool (`Explore`/`general-purpose` subagent types); no approval gate implied | Verbatim |
| 5 | `superpowers-writing-plans` | `writing-plans` | Only when the user explicitly asks for a written implementation plan or design doc | Scoped explicitly to NOT insert a planning/approval checkpoint before routine autonomous work (per CLAUDE.md autonomy grant) | Condensed/adapted (fetch returned summary, not verbatim) |
| 6 | `superpowers-finishing-a-development-branch` | `finishing-a-development-branch` | Implementation work on a branch is complete; time to verify, then merge/PR/keep/discard | "Verify tests" → tsc + build (this project's only pre-deploy gate, since Railway auto-deploys from `main` with no staging gate); Step 4 reframed so routine work doesn't require asking which outcome to pick, only high-stakes/ambiguous work does | Verbatim structure, substituted verification command and decision framing |

## Explicitly excluded from this vendoring

| Skill | Reason |
|---|---|
| `test-driven-development` | Strict TDD enforcement — explicitly forbidden by user instruction |
| `brainstorming` | Core content is a mandatory "stop for design approval before code" checkpoint — conflicts with this project's autonomy grant |
| `executing-plans` | Same approval-checkpoint conflict as `brainstorming` |
| `using-git-worktrees` | Redundant with existing session git capabilities |
| `requesting-code-review` / `receiving-code-review` | Out of scope for the four target categories (planning, architecture review, context retention, code quality) for this round |
| `writing-skills` | Out of scope — meta-skill for authoring new skills, not needed yet |
| `using-superpowers` | Redundant — this is the official plugin's own self-orientation skill, not applicable to a hand-vendored subset |

## Mechanism

All 6 skills are ordinary project-scoped Claude Code skills under
`.claude/skills/`. They activate only when their `description` frontmatter
matches the current task, or via explicit `/superpowers-<name>` invocation —
there is no session-start hook forcing them into every message (unlike the
official plugin install).
