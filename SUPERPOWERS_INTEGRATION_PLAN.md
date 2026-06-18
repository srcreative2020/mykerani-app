# Superpowers Integration Plan (Draft — awaiting approval)

> No action has been taken. This is a proposed plan only.

## Guiding constraint

MyKerani's standing rules, established earlier in this project, must take
precedence over any default Superpowers behavior:
1. Full autonomy is granted for routine fix/build/commit/push/merge work —
   Superpowers must not introduce mandatory approval gates for that.
2. Every AI/storage feature must be genuinely real — never mock/cosmetic.
3. Payment-gateway, schema, and HQ-authority logic are high-stakes and
   already get careful, multi-step verification (tsc + build before every
   commit) — this is *already* close to what Superpowers calls
   "verification-before-completion," so adoption there is low-friction.

The plan below is staged so you can stop after any phase and keep only what
proved useful.

## Phase 0 — Decision needed before anything else

Two install scopes are possible; pick one (or both, project overriding
global):

- **A. Global install** (`/plugin install superpowers@claude-plugins-official`
  run once, applies to all Claude Code sessions/projects for this account).
  Nothing is added to the `mykerani-app` repo at all.
- **B. Project-scoped install** — add a marketplace reference inside
  `mykerani-app/.claude/settings.json` (new file) or
  `.claude/settings.local.json` (existing file, currently only holds
  Supabase MCP permission allowlist) so the plugin is only active when
  working in this repo.

Recommendation: **B**, project-scoped, so the methodology doesn't silently
change behavior on unrelated projects, and so it's easy to fully revert by
deleting one config block.

## Phase 1 — Selective skill adoption (recommended starting point)

Rather than installing the full plugin (which activates all 14 skills,
including the ones that conflict with the autonomy directive), the
lower-risk path is to **hand-pick 2–3 skills** whose philosophy already
matches how this project operates, and skip the rest:

| Skill | Adopt? | Rationale |
|---|---|---|
| `verification-before-completion` | Yes | Already de facto practice here (tsc + build before every commit). Formalizing it costs nothing. |
| `systematic-debugging` | Yes | Useful playbook for root-cause-first debugging; doesn't conflict with autonomy — it's about *how* to debug, not about pausing for approval. |
| `using-git-worktrees` | Optional | Already informally used in this session (the `merge-test-tmp` diagnostic branch). Could standardize the pattern. |
| `writing-plans` / `brainstorming` / `executing-plans` | **No, or scoped only to high-stakes changes** | These assume a human-approval checkpoint before code is written. Conflicts directly with "sy nk semua auto." Could be manually invoked by the user for big-bang features (e.g. a future "rebuild the AI router from scratch") but should not be default-on. |
| `test-driven-development` | **Defer** | No test runner exists in `package.json` yet (no Jest/Vitest). Adopting this meaningfully requires Phase 1.5 below first. |
| `subagent-driven-development`, `dispatching-parallel-agents` | Optional | Already functionally available via this session's own `Agent` tool with `Explore`/`general-purpose` subagents — Superpowers' version may just formalize naming/process, limited incremental value. |
| `requesting-code-review` / `receiving-code-review` | Optional | Overlaps with the existing `code-review` skill already available in this session; redundant unless Superpowers' variant adds something concrete (inline PR comments, etc.) worth comparing side-by-side first. |
| `finishing-a-development-branch` | Optional | Compatible with current PR-merge workflow; mostly codifies what's already being done manually (typecheck → build → commit → push → PR → merge). |

## Phase 1.5 — Prerequisite if TDD skills are wanted later

If you later want `test-driven-development` to be meaningful:
1. Add a test runner (Vitest fits best — same ecosystem as Vite, zero extra
   config conflicts with the existing `vite.config.ts`).
2. Add a `"test": "vitest run"` script to `package.json`.
3. Start with the highest-risk, already-real logic first (e.g.
   `paymentService.ts`'s `submitManualPayment`/`initiateChipAsiaPayment`,
   or the Chip Asia webhook signature verification in `server.ts`) since
   those are exactly the kind of money-handling code where regression
   tests pay for themselves.
This is a separate, sizable piece of work — not part of "installing
Superpowers," and should only be undertaken if you explicitly want it.

## Phase 2 — Reconcile philosophy via a project `CLAUDE.md`

MyKerani currently has no `CLAUDE.md`. Whether or not Superpowers is
installed, creating one and stating the standing rules explicitly (full
autonomy for routine work; mandatory real-functionality requirement; when
to pause and ask) would let any installed skills (Superpowers or built-in)
defer to project-specific norms instead of their own defaults. This is the
single highest-leverage step for avoiding the "Superpowers keeps asking for
approval" friction risk identified in the analysis.

Proposed skeleton (for your approval, not yet written):
```markdown
# MyKerani — Agent Operating Notes

- Full autonomy granted for fix/commit/push/merge on routine work.
  Only ask when genuinely ambiguous or destructive/irreversible.
- All AI and storage functionality must be real — never mock, dummy,
  or cosmetic. No placeholder UI states pretending to be live data.
- Before every commit: `npx tsc --noEmit -p .` and `npm run build`
  must pass clean.
- Payment-gateway, schema, and HQ-authority changes get extra
  verification but should still proceed autonomously once verified —
  do not block on human design review for these by default.
```

## Phase 3 — Trial period and rollback

1. Install only the Phase-1 "Yes" skills (or full plugin scoped to this
   project if you'd rather try everything).
2. Run it for a handful of real tasks.
3. Revert criteria: if any session pauses for plan/brainstorm approval on
   what should've been routine autonomous work, that's a signal to either
   (a) tighten `CLAUDE.md` wording, or (b) drop the offending skill.
4. Rollback is trivial: remove the marketplace/plugin reference from
   `.claude/settings.json` (project-scoped) or run the equivalent
   `/plugin uninstall` (global) — no app code or git history is touched
   either way, since nothing in `mykerani-app/`'s tracked source is ever
   modified by the plugin itself.

## What I will NOT do without further explicit approval

- Run `/plugin install ...` or `/plugin marketplace add ...`.
- Create or edit `.claude/settings.json` / `.claude/settings.local.json`.
- Create `CLAUDE.md`.
- Add a test runner or any new dependency.
- Commit or push any of the above.

## Open questions for you

1. Project-scoped (B) or global (A) install, per Phase 0?
2. Adopt only the Phase-1 "Yes" list, or install everything and rely on
   `CLAUDE.md` to suppress unwanted approval-gate behavior?
3. Do you want a `CLAUDE.md` created regardless of the Superpowers decision
   (it's useful on its own)?
4. Is introducing a test runner (Phase 1.5) something you want to pursue
   now, later, or not at all?
