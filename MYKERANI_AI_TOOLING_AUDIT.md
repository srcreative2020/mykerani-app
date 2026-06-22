# MYKERANI — AI Tooling Audit

> Audit only. Nothing installed, nothing modified.

Scope: confirm whether each item below physically exists in this repo
(`/home/user/mykerani-app`), with file/folder/config/package/script/doc
evidence. No inference from prior conversation — only what's on disk.

---

## 1. Superpowers (obra/superpowers Claude Code plugin skills)

| Item | Status |
|---|---|
| GitHub Skills | **NOT INSTALLED** |
| Supabase Skills | **NOT INSTALLED** |
| Railway Skills | **NOT INSTALLED** |
| Testing Skills | **NOT INSTALLED** |
| Deployment Skills | **NOT INSTALLED** |

### Evidence

- **No `.claude-plugin/` directory** anywhere in the repo (the marker that
  identifies an actual Superpowers plugin checkout).
- **No `.claude/skills/` directory** in the project at all — only
  `.claude/settings.local.json` exists, and its only content is a Supabase
  *MCP tool permission allowlist* (5 `mcp__Supabase__*` tool names), not a
  skill or plugin registration:
  ```json
  {
    "permissions": {
      "allow": [
        "mcp__Supabase__list_projects",
        "mcp__Supabase__execute_sql",
        "mcp__Supabase__list_tables",
        "mcp__Supabase__apply_migration",
        "mcp__Supabase__get_advisors"
      ]
    }
  }
  ```
  This is a Supabase **MCP server connection**, not a "Supabase Skill" in
  the Superpowers sense (no markdown skill playbooks, no skill folder).
- **No `railway.json`, `railway.toml`, `Dockerfile`, `fly.toml`,
  `vercel.json`, or `netlify.toml`** anywhere in the repo — no deployment
  tooling/config of any kind is checked in.
- **No test runner installed.** `package.json` has zero test dependencies
  (no `jest`, `vitest`, `playwright`, `cypress`, `mocha`) and no `test`
  script — only `dev`, `build`, `start`, `clean`, `lint`. "Testing Skills"
  has nothing to attach to.
- **`.github/workflows/ci.yml`** exists and is real, but it only runs
  `npm install` + `npm run build` (a build-check gate) — no test step, no
  deployment step, no Superpowers/skill invocation of any kind:
  ```yaml
  jobs:
    build:
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
        - run: npm install
        - run: npm run build
  ```
- **Three planning documents exist and explicitly self-label as
  research/proposals, not installs:**
  - `SUPERPOWERS_ANALYSIS.md` — first line: *"Status: research only. No
    files modified, nothing installed, no commits created."* Documents what
    the upstream `obra/superpowers` plugin *would* contain if installed
    (14 skills, `.claude-plugin/plugin.json`, hooks, etc.) — describing a
    third-party repo, not anything present here.
  - `SUPERPOWERS_IMPLEMENTATION_PROPOSAL.md` — first line: *"No action
    taken yet."* Proposes vendoring a hand-picked subset of skill files
    under `mykerani-app/.claude/skills/` — a proposal, never executed (that
    directory does not exist).
  - `SUPERPOWERS_INTEGRATION_PLAN.md` — first line: *"No action has been
    taken. This is a proposed plan only."* Lays out install-scope options
    (global vs. project) and states plainly under §6: *"Railway: No
    impact. Superpowers does not touch `package.json`..."* — confirming
    Railway/CI/Supabase were never actually touched by this line of work.

**Conclusion:** all 5 Superpowers sub-items are NOT INSTALLED. What exists
is analysis/proposal documentation only, plus one unrelated, already-
existing Supabase **MCP** permission allowlist (a different mechanism
entirely from a Superpowers "skill").

---

## 2. Harness

| Item | Status |
|---|---|
| Agent Generator | **NOT INSTALLED** |
| Team Architecture | **NOT INSTALLED** |
| Orchestration | **NOT INSTALLED** |
| Skill Factory | **NOT INSTALLED** |

### Evidence

- Repo-wide search for `agent generator`, `team architecture`,
  `orchestration`, `skill factory`, and `harness` (case-insensitive, across
  `.md`/`.json`/`.ts`/`.tsx`) returns **zero matches** anywhere in the
  project source, docs, config, or scripts — the single hit is the literal
  word "Railway" inside `SUPERPOWERS_ANALYSIS.md`'s analysis text, not a
  harness component.
- `src/` has no folder or file related to multi-agent orchestration, a
  skill-generation tool, or a "team" abstraction — its only top-level
  folders are `components/`, `assets/`, `lib/`, `screens/`, `context/`,
  all ordinary React/TS application code for the MyKerani product itself.
- `package.json` has no dependency, script, or binary related to agent
  orchestration, multi-agent frameworks, or skill scaffolding tooling.
- No `.mcp.json`, `.cursor-plugin/`, `.codex-plugin/`, `.kimi-plugin/`, or
  `.opencode/` directory exists in the repo (the markers that would
  indicate any cross-tool agent harness configuration checked into the
  project).
- The only harness-adjacent artifact found is **outside the repo
  entirely**, in the underlying Claude Code session environment
  (`~/.claude/skills/session-start-hook/SKILL.md`) — a single generic
  session-start hook belonging to the CLI tool itself, not to this
  project, and unrelated to "Agent Generator," "Team Architecture,"
  "Orchestration," or "Skill Factory."

**Conclusion:** none of the 4 Harness sub-items exist in this repository
in any form — no folder, no config, no package, no command, no script, no
documentation. This is a clean NOT INSTALLED across the board.

---

## Summary Table

| Category | Item | Status |
|---|---|---|
| Superpowers | GitHub Skills | NOT INSTALLED |
| Superpowers | Supabase Skills | NOT INSTALLED |
| Superpowers | Railway Skills | NOT INSTALLED |
| Superpowers | Testing Skills | NOT INSTALLED |
| Superpowers | Deployment Skills | NOT INSTALLED |
| Harness | Agent Generator | NOT INSTALLED |
| Harness | Team Architecture | NOT INSTALLED |
| Harness | Orchestration | NOT INSTALLED |
| Harness | Skill Factory | NOT INSTALLED |

No items qualify as INSTALLED or PARTIALLY INSTALLED. The only AI-tooling
artifacts physically present in the repo are: (1) a Supabase MCP tool
permission allowlist in `.claude/settings.local.json` (an MCP connection,
not a skill/plugin), and (2) three planning/analysis markdown documents
(`SUPERPOWERS_ANALYSIS.md`, `SUPERPOWERS_IMPLEMENTATION_PROPOSAL.md`,
`SUPERPOWERS_INTEGRATION_PLAN.md`) that explicitly self-describe as
research/proposals with no action taken.
