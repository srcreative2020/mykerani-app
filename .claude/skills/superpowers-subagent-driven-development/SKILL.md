---
name: superpowers-subagent-driven-development
description: Use for a multi-task implementation plan with mostly-independent tasks, where you want to stay in the current session but keep the main context window from filling up with execution detail — dispatch a fresh subagent per task instead of doing every task inline.
source: https://github.com/obra/superpowers (skills/subagent-driven-development), MIT License, (c) Jesse Vincent — condensed/adapted from the upstream skill; the upstream `implementer-prompt.md`/`task-reviewer-prompt.md` templates and `scripts/` helpers were not vendored to keep this project's footprint minimal. See the source repo for the full prompt templates if you need them.
adapted-for: mykerani-app — advisory only, not a mandatory gate. "Task review" below means *you* (or a reviewer subagent) checking a completed task's diff against the plan — it does not require pausing for the human's sign-off on every individual task, only the points this project's standing rules already require.
---

# Subagent-Driven Development

## Core Concept

For a plan with several mostly-independent tasks, dispatch a **fresh subagent
per task** rather than burning the main session's context on execution
detail. Each subagent gets isolated context — built deliberately, not
inherited from session history — does its task, and reports back. The
main session's job becomes coordination, not typing every line itself.

## When to Use

- You have a clear implementation plan with mostly-independent tasks.
- You want to stay in the current session (not spin up a separate worktree).
- The main session's context is getting full of detail that won't matter once
  the task is done (e.g. reading large files, trial-and-error edits).

## The Process

1. **Dispatch an implementer subagent** for one task — give it the exact
   files, the exact change, and the exact verification command to run before
   reporting back.
2. **Subagent implements, verifies (tsc/build), and reports** what it did and
   what it touched.
3. **Review the task** — read the subagent's actual diff (not just its
   summary) against what the task required. Two things to check:
   - Did it do what was asked (spec compliance)?
   - Is the code quality acceptable (matches existing patterns, no
     unrequested abstractions)?
4. **Address any findings**, then move to the next task.
5. **After all tasks complete**, do one broad final review of the combined
   diff, then use `superpowers-finishing-a-development-branch` to close out.

## Key Practices

- **Right-size the agent for the task.** A one-file mechanical fix doesn't
  need the most capable model/agent; an architecture-sensitive change
  (payment gateway, RLS policy, multi-tenant role logic) does.
- **Pass file paths, not pasted content**, when handing context between
  steps — keeps the main session's context budget free.
- **Keep a running note of what's done** (e.g. a scratch list in your own
  reasoning, or a short status message to the user) so that if context gets
  compacted, you can tell what's already finished without re-deriving it.

## Critical Red Flags

- Don't skip the diff review and just trust a subagent's self-reported
  "success."
- Don't dispatch multiple implementer subagents *in parallel* against the
  same files — that's a conflict risk (use `superpowers-dispatching-parallel-agents`
  instead, for genuinely independent domains).
- Don't proceed with unresolved Critical/Important issues found in review.
- After a context compaction, re-check what's actually done (diff/git log)
  before re-dispatching work that may already be finished.

## Related Skills

- `superpowers-dispatching-parallel-agents` — for independent domains that
  can run concurrently rather than one-task-at-a-time.
- `superpowers-verification-before-completion` — the standard each task's
  review must meet before being marked done.
- `superpowers-finishing-a-development-branch` — what to do once every task
  in the plan is reviewed and complete.
