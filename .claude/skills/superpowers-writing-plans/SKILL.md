---
name: superpowers-writing-plans
description: Use only when the user explicitly asks for a written implementation plan or design doc for a multi-step feature — not a mandatory step before every change. Produces a concrete, no-placeholder task breakdown.
source: https://github.com/obra/superpowers (skills/writing-plans), MIT License, (c) Jesse Vincent — condensed/adapted from the upstream skill.
adapted-for: mykerani-app — purely reference material for *when a plan is requested*. Do not use this to insert a planning/approval step before routine autonomous work; the project's standing rule is full autonomy for routine fix/build/commit/push/merge tasks (see CLAUDE.md). Reach for this only when the user asks for "a plan", "a design doc", or a similarly explicit planning artifact for something substantial (e.g. a brand-new subsystem).
---

# Writing Plans

## Core Purpose

Write implementation plans assuming the engineer (human or subagent) executing
them has little context on this specific codebase, even though they know
their craft. The plan should let them work without having to first read this
entire conversation.

## Key Principles

- **Assume minimal context.** Spell out file paths, existing patterns to
  follow (e.g. "gate this RPC the same way `review_payment_transaction` is
  gated via `is_hq_user()`"), and exact commands.
- **Task granularity.** Each step should be small enough to verify on its own
  — not so large that a mistake halfway through is hard to isolate.
- **No placeholders.** Every code block, command, and expected output should
  be concrete, not "add appropriate validation here."
- **File-first design.** Before listing tasks, map out which files are
  created vs. modified vs. read-only reference.
- **Commit per completed step**, not one giant commit at the end — makes
  review and rollback easier.

## Plan Structure

A useful plan opens with:
- **Goal** — what outcome are we building toward.
- **Architecture** — how it fits the existing system (e.g. for MyKerani:
  does it need a new SECURITY DEFINER RPC? A new RLS policy? A new
  `.claude/skills/` entry? A UI change in `HQConsoleShell.tsx`?).
- **Constraints** — anything that must NOT change (e.g. "do not modify
  application code," "do not create migrations" — exactly the kind of
  constraint this project's recent Superpowers integration itself used).

Then tasks, each with:
- **Files** — exact paths, marked create/modify/reference-only.
- **Interfaces** — what the task consumes/produces (function signatures,
  RPC names, types).
- **Steps** — numbered, with the exact verification command and expected
  result for that step.

## No Abstraction Rule

Don't write "similar to Task 3" — repeat the concrete detail. Don't write
"add error handling" — show what the actual check/throw looks like for this
case.

## Self-Review Before Handing Off

Before treating a plan as final, scan it for:
- Coverage gaps against the original ask.
- Any remaining placeholder language ("appropriate", "as needed", "etc.").
- Type/interface consistency across tasks that touch the same data.

Fix inline rather than leaving a note to "fix later."
