# MYKERANI GOVERNANCE EXTENSION
## STATUS: LOCKED, V1.0

> This document extends `MYKERANI_CONSTITUTION.md` to govern the
> commercial/SaaS layer introduced in Phase 4 and beyond. It does not
> replace the Constitution, the Vision document, or the Owner/Staff
> Parity Rule — it adds the rules needed once MyKerani has its own
> billing, credits, and wallet, on top of those three already-locked
> documents. Where this document is silent, the Constitution and Vision
> govern. Where this document and a future module proposal conflict, this
> document wins unless it is itself amended through the same dual-approval
> mechanism it mandates for commercial policy below.

---

## 1. THE CLOSED LOOP RULE

Every commercial workflow — anything that touches subscription, billing,
wallet balance, or entitlement — must complete the full sequence below.
A workflow that skips a step is not "simplified," it is incomplete and
must FAIL review.

```
1. ACTION            tenant or HQ actor initiates
2. VALIDATION        entitlement, balance, role, plan limits checked
3. APPROVAL          routed to pending_hq_actions when required by policy
4. RESOURCE CHANGE    wallet reservation/commit
5. BILLING CHANGE     invoice/line-item updated where applicable
6. WALLET CHANGE      ledger entry recorded
7. NOTIFICATION       tenant and/or HQ notified
8. AUDIT              immutable audit_logs row
9. ANALYTICS          commercial event recorded
10. REPORTING         surfaced in HQ Revenue Center / tenant billing UI
```

A step may be a deliberate no-op for a given workflow (e.g., an AI-credit
reservation has no Billing Change at call time), but the workflow design
must say so explicitly rather than silently omitting the step.

## 2. THE RESOURCE WALLET PRINCIPLE

Every billable resource — AI credits, OCR credits, storage credits, and
any future credit type — flows through **one** unified wallet system: one
account table, one balance/reservation model, one ledger. No module may
introduce a second wallet, a parallel balance column, or a private credit
counter. New resource types are added as rows in the wallet's resource-type
config table, never as new tables or new code paths.

Wallet balances are never permitted to go negative. Spend is reserved
before it is committed, so validation can fail before a resource is
actually consumed.

## 3. THE COMMERCIAL GOVERNANCE PRINCIPLE

Pricing, credits, quotas, limits, promotions, trials, AI costs, OCR costs,
and storage costs are configuration, never literals in code. Every such
value lives in a versioned, effective-dated config table, scoped globally,
per-plan, or per-tenant (in that precedence order). A code change is never
the mechanism by which a price, quota, or cost rate changes in production.

Any change to global- or plan-scoped commercial configuration is itself a
closed-loop workflow and requires dual approval: a proposal recorded via
the existing `pending_hq_actions` mechanism, reviewed and approved by a
second `is_hq_owner()` user, before it takes effect. Tenant-scoped
overrides (e.g., a negotiated enterprise rate) require `is_hq_owner()` but
not a second approver, since they affect one tenant rather than the
platform's pricing surface.

## 4. THE ECOSYSTEM REVIEW REQUIREMENT

No commercial module is designed or implemented in isolation. Before a
module is marked complete, it must show explicitly how it connects to
every system listed in `MYKERANI_ECOSYSTEM_GOVERNANCE_PRINCIPLE.md`. A
module that cannot show a connection to a system it plausibly should touch
is incomplete, not "out of scope by default." Absence of a connection must
be a documented, justified decision, not a silent gap.

## 5. THE AUTOMATION RESTRAINT RULE

The Vision document's "AI Suggests → User Confirms → AI Learns" formula
applies to HQ-side commercial automation exactly as it applies to
tenant-facing AI features. Scheduled jobs and rule engines (dunning
escalation, health-score-driven outreach playbooks, downgrade risk
detection) may **suggest** an action — flag an account, propose a
suspension, recommend outreach — but may never **execute** an
account-impacting action (suspending access, cancelling a subscription,
auto-applying a discount) without a human HQ approval step. Automation
that silently and irreversibly changes a paying customer's access is
prohibited regardless of how confident the triggering rule is.

## 6. DATA OWNERSHIP CARRY-FORWARD

The Constitution's Data Ownership Rule — tenant financial records remain
tenant property, HQ owns only platform/AI models/metadata/audit/analytics
infrastructure — extends unchanged into the commercial layer. Commercial
access (billing visibility, partner/agency management scope, success-team
tooling) is never a backdoor into transaction-level financial data. A
partner, reseller, or HQ commercial role may see subscription status,
payment health, and support history for a tenant they are scoped to; none
of them may see that tenant's ledger, OCR evidence, or bank data unless
they are also separately and explicitly granted tenant-financial access
through the existing Owner/Staff role system.

## 7. AMENDMENT

This document is LOCKED V1.0. Amending it requires the same dual-approval
mechanism it mandates in §3 for global commercial policy, plus an explicit
record of the prior version superseded.
