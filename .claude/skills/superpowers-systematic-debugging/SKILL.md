---
name: superpowers-systematic-debugging
description: Use when encountering any bug, test failure, build error, or unexpected behavior, before proposing fixes.
source: https://github.com/obra/superpowers (skills/systematic-debugging), MIT License, (c) Jesse Vincent
adapted-for: mykerani-app — advisory only. References to "tests"/TDD below are kept for fidelity to the upstream skill, but this project currently has no test runner; treat "failing test" as "failing tsc/build/manual repro" until a test suite exists.
---

# Systematic Debugging

## Overview

Random fixes waste time and create new bugs. Quick patches mask underlying issues.

**Core principle:** ALWAYS find root cause before attempting fixes. Symptom fixes are failure.

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

## When to Use

- Test/typecheck/build failures
- Bugs in production (e.g. a payment webhook not firing, RLS denying a query that should succeed)
- Unexpected behavior
- Merge conflicts that don't resolve cleanly
- Integration issues (Supabase RPC errors, Chip Asia API errors, etc.)

**Use this ESPECIALLY when:**
- Under time pressure
- "Just one quick fix" seems obvious
- You've already tried multiple fixes
- Previous fix didn't work

## The Four Phases

### Phase 1: Root Cause Investigation

1. **Read error messages carefully** — full stack trace, exact line numbers, exact Postgres/Supabase error codes.
2. **Reproduce consistently** — can you trigger it reliably? If not reproducible, gather more data before guessing.
3. **Check recent changes** — `git diff`, recent commits, recent migrations.
4. **Gather evidence in multi-component systems** — for this project that often means tracing across boundaries: client → `server.ts` proxy route → Supabase RPC → RLS policy. Log/inspect at each boundary rather than guessing which layer is wrong.
5. **Trace data flow** — for a bug deep in a call chain, trace backward from the bad value to its origin; fix at the source, not the symptom.

### Phase 2: Pattern Analysis

1. Find a working example of the same pattern elsewhere in the codebase (e.g. compare a broken RPC to a working one with the same `is_hq_user()` gating shape).
2. Compare line-by-line against the reference.
3. List every difference, however small.
4. Understand dependencies — RLS policies, role assignments, env vars the broken code relies on.

### Phase 3: Hypothesis and Testing

1. State a single, specific hypothesis: "I think X is the root cause because Y."
2. Make the smallest possible change to test it. One variable at a time.
3. Verify before continuing. Didn't work → form a *new* hypothesis, don't stack fixes.
4. If you don't understand something, say so — don't pretend to know.

### Phase 4: Implementation

1. Reproduce the failure first (manual repro is fine — no test runner exists yet).
2. Implement a single fix addressing the root cause. No "while I'm here" refactors.
3. Verify the fix: `npx tsc --noEmit -p .` + `npm run build`, plus re-run the original repro.
4. **If the fix doesn't work:** stop. Count attempts.
   - `< 3` attempts: return to Phase 1 with new information.
   - `≥ 3` attempts: **stop and question the architecture** — don't attempt fix #4 blindly.

### Phase 4.5: When 3+ Fixes Fail

Pattern indicating an architectural problem, not a bug:
- Each fix reveals new shared state/coupling elsewhere
- Fixes require "massive refactoring"
- Each fix creates a new symptom somewhere else

**Surface this to the user before attempting more fixes.** This is not a failed
hypothesis — it's the wrong approach.

## Red Flags — STOP and Return to Phase 1

- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- Proposing a fix before tracing data flow
- "One more fix attempt" after 2+ failures already
- Each fix reveals a new problem in a different place

## Quick Reference

| Phase | Key Activities | Success Criteria |
|-------|---------------|------------------|
| 1. Root Cause | Read errors, reproduce, check diffs, trace boundaries | Understand WHAT and WHY |
| 2. Pattern | Find working examples, compare | Identify differences |
| 3. Hypothesis | Form theory, test minimally | Confirmed or new hypothesis |
| 4. Implementation | Fix root cause, verify | Bug resolved, tsc+build clean |

## Related Skills

- `superpowers-verification-before-completion` — verify the fix actually worked before claiming success.
