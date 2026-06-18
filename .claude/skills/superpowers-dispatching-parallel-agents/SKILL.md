---
name: superpowers-dispatching-parallel-agents
description: Use when facing 3+ independent, unrelated problems (e.g. unrelated bugs, unrelated files to audit) that can be investigated or fixed without sharing context — dispatch one subagent per problem domain in parallel instead of working sequentially.
source: https://github.com/obra/superpowers (skills/dispatching-parallel-agents), MIT License, (c) Jesse Vincent
adapted-for: mykerani-app — advisory only. Maps directly onto this session's existing `Agent` tool (subagent_type Explore/general-purpose). No approval gate implied; use this whenever it genuinely saves time.
---

# Dispatching Parallel Agents

## Overview

Delegate tasks to specialized agents with isolated context. Construct exactly
the context each one needs — they should never inherit the full session
history. This also preserves your own context for coordination work.

**Core principle:** Dispatch one agent per independent problem domain. Let them
work concurrently.

## When to Use

Use when:
- 3+ unrelated failures/files/areas need investigation or fixing
- Each problem can be understood without context from the others
- No shared state between the investigations (they don't touch the same files)

Don't use when:
- Failures are related (fixing one might fix others — investigate together first)
- You need to see the full system state to understand any one of them
- You don't yet know what's broken (exploratory debugging first)
- Agents would edit the same files (conflict risk)

## The Pattern

1. **Identify independent domains.** E.g.: "OCR console has a type error," "AuditConsole has an unrelated type error," "FinancialRecordsContext has a third, unrelated type error" — three separate domains, fix in parallel.
2. **Create focused agent tasks** — each agent gets a specific scope, a clear goal, explicit constraints (e.g. "don't touch other files"), and an explicit expected output format.
3. **Dispatch in parallel** — issue all the `Agent` tool calls in the *same* response. Multiple calls in one response run concurrently; one per response runs sequentially.
4. **Review and integrate** — read each agent's summary, verify the diffs don't conflict, re-run `npx tsc --noEmit -p .` / `npm run build` against the combined result, then proceed.

## Agent Prompt Structure

Good agent prompts are:
1. **Focused** — one clear problem domain.
2. **Self-contained** — include the exact file paths, line numbers, and error text the agent needs; it has no memory of this conversation.
3. **Specific about output** — state exactly what summary/diff you expect back.

## Common Mistakes

- **Too broad:** "Fix all the type errors" → the agent loses focus. Prefer: "Fix the type error in `src/components/AuditConsole.tsx` line 58 only."
- **No context:** "Fix the race condition" → agent doesn't know where. Always paste the exact error text.
- **No constraints:** Agent might refactor unrelated code. Always state "don't touch other files."
- **Vague output:** "Fix it" → you won't know what changed. Always ask for an explicit summary of files touched.

## When NOT to Use

- Related failures (fix one, re-check if it fixed others, before parallelizing the rest)
- You need full system context to understand any one of the problems
- Agents would interfere by editing the same file

## Verification After Dispatch

1. Read each agent's summary.
2. Check for conflicts — did two agents touch the same file?
3. Run `npx tsc --noEmit -p .` and `npm run build` on the combined result (per `superpowers-verification-before-completion`).
4. Spot-check at least one agent's actual diff, don't just trust the summary.
