# Superpowers Analysis — Compatibility Assessment for MyKerani

> Status: research only. No files modified, nothing installed, no commits created.

## 1. What Superpowers Actually Is

[obra/superpowers](https://github.com/obra/superpowers) (by Jesse Vincent, MIT license) is **not a code library** —
it is a **Claude Code plugin**: a packaged set of "skills" (markdown playbooks +
small hook scripts) that change how the *coding agent* (Claude Code) behaves
during a session. It does not ship a runtime, server, or npm package that an
application imports or depends on.

Confirmed from `.claude-plugin/plugin.json`:
```json
{
  "name": "superpowers",
  "description": "Core skills library for Claude Code: TDD, debugging, collaboration patterns, and proven techniques",
  "version": "6.0.2",
  "license": "MIT"
}
```

Repository layout (verified against the actual tree, not inferred):
```
.claude-plugin/   Claude Code plugin manifest
.cursor-plugin/   Cursor IDE equivalent
.codex-plugin/    GitHub Copilot CLI / Codex equivalent
.kimi-plugin/     Kimi Code equivalent
.opencode/        OpenCode equivalent
.pi/extensions/   Pi platform equivalent
hooks/            session-start hook scripts (hooks.json, session-start, etc.)
skills/           14 skill folders (see below)
scripts/, tests/, docs/, assets/
package.json      Node.js tooling for the plugin's own test/build infra
```

Skills shipped (`skills/`):
`brainstorming`, `dispatching-parallel-agents`, `executing-plans`,
`finishing-a-development-branch`, `receiving-code-review`,
`requesting-code-review`, `subagent-driven-development`,
`systematic-debugging`, `test-driven-development`, `using-git-worktrees`,
`using-superpowers`, `verification-before-completion`, `writing-plans`,
`writing-skills`.

**Installation mechanism (Claude Code):**
```
/plugin install superpowers@claude-plugins-official
```
or via a separate marketplace:
```
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace
```
This registers the plugin with the **Claude Code CLI tool itself** (a
config/cache layer outside the project, typically under the user's
`~/.claude` plugin directory or the harness's plugin store — not inside
`mykerani-app/`). It is conceptually the same category of thing as the
`session-start-hook`, `update-config`, or `loop` skills already listed as
available in this session — it extends *how Claude Code operates*, not
what `mykerani-app` ships to users.

**What the `hooks/session-start` script does** (verified by reading it):
reads `skills/using-superpowers/SKILL.md` from the plugin's own install
directory, escapes it, and emits it as injected context for the session.
It is **read-only** — it does not write to, or read from, the project
repository's working tree.

## 2. Compatibility Risks

| Risk | Severity | Detail |
|---|---|---|
| **No code-level dependency conflicts** | None | Superpowers adds zero npm packages to `package.json`, zero runtime imports, zero changes to `server.ts`/`vite.config.ts`/`tsconfig.json`. It cannot conflict with React 19, Vite 6, Express, Supabase JS, etc. because it never touches the app's dependency graph. |
| **Skill name/purpose overlap with this session's built-in skills** | Low–Medium | This session already has `verify`, `code-review`, `simplify`, `run`, `init`, `review`, `security-review` available. Superpowers ships `verification-before-completion`, `requesting-code-review` / `receiving-code-review`, `test-driven-development`, `writing-plans`. Names don't literally collide, but **purpose does** — Claude Code would now have two "how do I verify this is done" playbooks and two "how do I run a code review" playbooks active simultaneously, which can produce inconsistent or contradictory guidance (e.g. Superpowers enforces strict RED-GREEN-REFACTOR TDD; MyKerani's actual workflow so far has been build-fix-verify-via-tsc/build, not TDD-first). |
| **Workflow-philosophy mismatch** | Medium | Superpowers' methodology is opinionated: brainstorm → spec → plan → TDD → subagent execution, with human approval gates at each phase. The user's standing instruction in this project is the opposite extreme: full autonomy ("sy nk semua auto" — fix/commit/push/merge without asking). Installing Superpowers as-is would inject friction (it wants to pause for design approval, write plans, insist on TDD) that contradicts the user's explicit standing directive, unless skills are selectively scoped or the user consciously chooses to invoke them per-task. |
| **No tests currently exist in MyKerani** | Medium | `package.json` has no `test` script and no test runner (no Jest/Vitest/Playwright present). Superpowers' `test-driven-development` and `systematic-debugging` skills assume a test suite to drive RED→GREEN cycles. Without first introducing a test framework, those two skills are not actionable as designed. |
| **Multi-tenant/security-sensitive codebase** | Low | MyKerani has SECURITY DEFINER RPCs, RLS policies, and a service-role-key proxy pattern in `server.ts` that must never be bypassed. Superpowers' skills are advisory playbooks for the *agent's* process, not code that runs in `server.ts` — so there's no direct execution-path risk, but `subagent-driven-development` dispatches sub-agents that could, in principle, attempt risky DB/infra actions if invoked carelessly. This is a process-discipline risk, not an architectural one. |
| **Plugin source trust** | Low | MIT-licensed, single maintainer (Jesse Vincent / `fsck.com`), publicly auditable on GitHub. No obfuscated code found in the parts inspected (manifest, session-start hook). Standard due-diligence (read `hooks/*`, `scripts/*` before installing) is still warranted since hooks execute arbitrary shell at session start. |

## 3. Installation Requirements

- **Where**: registered with the Claude Code CLI/runtime, not the
  `mykerani-app` git repository. Nothing is written into this repo by the
  install command itself.
- **Prerequisite**: a Claude Code version that supports the plugin
  marketplace (`/plugin install ...`) — this session's harness already
  supports the `Skill` tool and marketplace-style skill loading, so it is
  almost certainly compatible, but actual version compatibility can only be
  confirmed by running the install command, which was intentionally **not**
  done per your instructions.
- **No Node/Python runtime install needed inside MyKerani** — the plugin's
  own `package.json` is for its *internal* test suite, not something
  `npm install`'d into this project.
- **Network access**: installing from the marketplace requires outbound
  access to GitHub (and possibly an `obra/superpowers-marketplace` index) —
  governed by this environment's network policy, not by MyKerani's app config.

## 4. Files That Would Be Added or Modified (if installed)

| Location | Touched? | Notes |
|---|---|---|
| `mykerani-app/**` (source, server, migrations) | **No** | Plugin lives outside the repo's tracked files. |
| `mykerani-app/package.json` / `package-lock.json` | **No** | No npm dependency is added to the app. |
| `mykerani-app/.claude/settings.local.json` | **Possibly** | If the user wants the plugin auto-enabled for this *project specifically* (vs. globally for the Claude Code user account), Claude Code may need a project-level config entry (e.g. an `enabledPlugins`/marketplace reference) added to `.claude/settings.local.json` or a new `.claude/settings.json`. This is the only plausible touch point inside the repo, and it is optional/configuration-only — not a code change. |
| `~/.claude/plugins/...` (outside repo, user/account scope) | Yes | Where the actual skill files and hook scripts get cached after `/plugin install`. Outside git's purview entirely. |
| `CLAUDE.md` (repo doesn't currently have one) | **Optional, recommended** | Superpowers' own docs suggest agent-specific guidance files (it ships `CLAUDE.md` in its *own* repo as an example). For MyKerani, creating a project `CLAUDE.md` to record the standing autonomy directive and "everything must be real, never mock" rule would help reconcile Superpowers' default cautious workflow with this project's actual norms — but this is a MyKerani-side authoring task, not something Superpowers installs for you. |

**Net effect: zero changes to application source, build, or deploy
artifacts.** The footprint is entirely at the Claude Code tooling layer.

## 5. Potential Conflicts With Existing Architecture

- **None at the runtime/architecture level** — confirmed above, no shared
  files, dependencies, or execution paths with `server.ts`, Supabase
  migrations, or the React app.
- **Process-level conflict with the project's working agreement**: the
  user has an established, explicit autonomy grant ("sy nk semua auto") and
  a "no mock/dummy/cosmetic — everything must be real" mandate that this
  session has been operating under. Superpowers' design deliberately slows
  agents down for human checkpoints (brainstorm → plan → approval) before
  writing code. If installed and left in its default posture, this could
  mean Claude Code starts asking for plan approval on tasks the user
  expects to be handled autonomously, which would be a regression in
  experience unless the user wants that for high-risk changes specifically
  (e.g. payment-gateway or schema work) while keeping autonomy for routine
  fixes.
- **No conflict with existing project skills by exact name** — verified no
  literal collisions between Superpowers' skill folder names and this
  session's currently loaded skill set.

## 6. Impact on GitHub / Supabase / Railway Workflow

- **GitHub**: No impact on the repository's CI, branch protections, or the
  `mcp__github__*` PR workflow this session already uses. Superpowers has
  its own `finishing-a-development-branch` and `using-git-worktrees` skills
  that *describe* a git workflow (feature branches, worktree isolation,
  PR-based completion) — this is broadly compatible with how this session
  already works (branch `claude/sleepy-hypatia-hqcy4z`, PR-based merges to
  `main`), but it is an independent recommendation layer, not a
  GitHub Actions or webhook integration. It does not register any GitHub
  App, webhook, or Action.
- **Supabase**: No impact. Superpowers has no awareness of or hooks into
  Supabase, migrations, or RLS. All Supabase interaction continues exactly
  as today via the `mcp__Supabase__*` tools and the `supabase/migrations`
  directory.
- **Railway**: No impact. Superpowers does not touch `package.json` build
  scripts, `server.ts`, or any deploy configuration, so it has zero
  bearing on what Railway builds/deploys from `main`.

## 7. Bottom Line

Superpowers is safe to evaluate from a pure compatibility standpoint —
it cannot break MyKerani's build, dependencies, Supabase schema, or Railway
deploy, because it never touches any of those. The real decision is **not**
technical compatibility but **process fit**: whether you want Claude Code to
adopt Superpowers' opinionated, checkpoint-heavy methodology (which assumes
TDD and per-phase human approval) layered on top of — or in tension with —
the full-autonomy, ship-it-when-real workflow this project has been using.

See `SUPERPOWERS_INTEGRATION_PLAN.md` for staged adoption options.
