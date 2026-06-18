---
name: superpowers-verification-before-completion
description: Use before claiming any task, fix, or feature is done — run the actual verification command first, never claim success from assumption.
source: https://github.com/obra/superpowers (skills/verification-before-completion), MIT License, (c) Jesse Vincent
adapted-for: mykerani-app — advisory only, not an enforced pre-step gate. No test runner exists in this project yet; "verification command" means `npx tsc --noEmit -p .` and `npm run build` unless a test suite is added later.
---

# Verification Before Completion

## Overview

Claiming work is complete without verification is dishonesty, not efficiency.

**Core principle:** Evidence before claims, always.

**Violating the letter of this rule is violating the spirit of this rule.**

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

If you haven't run the verification command in this message, you cannot claim it passes.

## The Gate Function

```
BEFORE claiming any status or expressing satisfaction:

1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
   - If NO: State actual status with evidence
   - If YES: State claim WITH evidence
5. ONLY THEN: Make the claim

Skip any step = lying, not verifying
```

## Common Failures (MyKerani context)

| Claim | Requires | Not Sufficient |
|-------|----------|----------------|
| Typecheck clean | `npx tsc --noEmit -p .` exit 0 | "should compile now" |
| Build succeeds | `npm run build` exit 0 | tsc passing alone (build also runs esbuild on `server.ts`) |
| Bug fixed | Reproduce the original symptom, confirm it's gone | Code changed, assumed fixed |
| Migration applied | `mcp__Supabase__list_migrations` / query the table, confirm | "should have applied" |
| Merge conflict resolved | `grep` for conflict markers returns nothing + build passes | "looks resolved" |
| Agent/subagent completed | Diff/file state actually checked | Trusting the subagent's own summary |

## Red Flags — STOP

- Using "should", "probably", "seems to"
- Expressing satisfaction before verification ("Great!", "Perfect!", "Done!")
- About to commit/push/PR without verification
- Trusting a subagent's self-reported success without checking its diff
- Relying on partial verification (e.g. tsc only, skipping build)
- "Just this once"

## Rationalization Prevention

| Excuse | Reality |
|--------|---------|
| "Should work now" | RUN the verification |
| "I'm confident" | Confidence ≠ evidence |
| "tsc passed" | tsc ≠ esbuild/vite build success |
| "Agent said success" | Verify independently — read the diff |
| "Partial check is enough" | Partial proves nothing |

## Key Pattern for This Project

```
✅ [Run: npx tsc --noEmit -p .] [exit 0] → [Run: npm run build] [exit 0] → "Build is clean"
❌ "Should typecheck fine" / "Looks correct"
```

## Why This Matters

Undefined functions or broken builds shipped to `main` flow straight to Railway's
auto-deploy. There is no staging gate catching it after this point — verification
here IS the gate.

## When To Apply

**ALWAYS before:**
- Any completion or "done" claim
- Committing, pushing, opening/merging a PR
- Moving to the next task
- Reporting a subagent's work as finished
