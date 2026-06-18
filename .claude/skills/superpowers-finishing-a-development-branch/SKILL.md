---
name: superpowers-finishing-a-development-branch
description: Use when implementation work on a branch is complete and it's time to verify, then merge/PR/keep/discard — codifies the typecheck-build-commit-push-PR pattern already used in this project.
source: https://github.com/obra/superpowers (skills/finishing-a-development-branch), MIT License, (c) Jesse Vincent
adapted-for: mykerani-app — this project has no test runner yet, so "verify tests" below means `npx tsc --noEmit -p .` followed by `npm run build`. This skill documents closing-out hygiene; it does not override the project's standing autonomy grant — for routine work, proceed with the merge/push/PR step that fits the situation rather than always stopping to ask which of the 4 options to take, unless the action is genuinely ambiguous or high-stakes (per CLAUDE.md).
---

# Finishing a Development Branch

## Overview

Guide completion of development work: verify → detect environment → choose
next step → execute → clean up.

**Core principle:** Verify build → Detect environment → Decide/confirm
outcome → Execute → Clean up.

## The Process

### Step 1: Verify

Before doing anything else:

```bash
npx tsc --noEmit -p .
npm run build
```

If either fails: stop, fix, re-verify. Don't proceed to merge/PR with a
broken build — this project has no staging gate before Railway's
auto-deploy from `main`, so this check IS the gate.

### Step 2: Detect Environment

Check current branch and whether it's a worktree:

```bash
git status
git branch --show-current
```

### Step 3: Determine Base Branch

```bash
git merge-base HEAD main 2>/dev/null
```

### Step 4: Decide the Outcome

For **routine work** under this project's standing autonomy grant, default
to whichever of these fits without needing to ask:
1. Merge back to the base branch and push, or
2. Push and open/update a PR (draft, per this project's GitHub workflow
   convention — never merge to `main` directly without it being asked for
   or already covered by an existing autonomy grant for that specific PR).

For **high-stakes or ambiguous work** (schema changes, payment-gateway
logic, anything irreversible), surface the options explicitly and wait for
a decision — this matches the project's existing risk-based judgment, not a
blanket "always ask" rule.

### Step 5: Execute

**Merge locally:**
```bash
git checkout <base-branch>
git pull
git merge <feature-branch>
npx tsc --noEmit -p . && npm run build   # re-verify the merged result
```

**Push + PR:**
```bash
git push -u origin <feature-branch>
# then create/update the PR via the GitHub MCP tools
```

### Step 6: Clean Up

Only delete a branch after a successful merge is confirmed. Never force-push
or force-delete without explicit instruction (per this project's Git Safety
Protocol).

## Common Mistakes

- **Skipping verification** — merging or opening a PR on a broken build.
- **Vague next-step framing** — be concrete about which of the two routine
  outcomes (merge vs. push+PR) fits, rather than open-ended "what next?"
  for things that don't need a decision.
- **Deleting a branch before confirming the merge succeeded.**
- **Force-pushing or skipping hooks** without explicit user instruction.

## Red Flags

**Never:**
- Proceed with a failing typecheck/build.
- Merge without re-verifying the merged result.
- Force-push or force-delete branches without explicit instruction.

**Always:**
- Verify before presenting/choosing an outcome.
- Re-verify after a merge.
- Treat schema/payment/irreversible changes as the cases that warrant
  explicit confirmation, not routine ones.
