# MYKERANI ECOSYSTEM GOVERNANCE PRINCIPLE
## STATUS: LOCKED, V1.0

> This document defines the set of systems every MyKerani module —
> commercial or otherwise — must consider itself connected to, and the
> FAIL condition that applies when a module is designed or shipped
> without showing that connection. It is the operational companion to
> `MYKERANI_GOVERNANCE_EXTENSION.md` §4 (Ecosystem Review Requirement).

---

## 1. THE CONNECTED-ECOSYSTEM RULE

MyKerani is one connected system, not a collection of independent
modules. Every new module — feature, screen, RPC, or service — must be
designed against the question "which of the systems below does this
touch, and how," not designed in isolation and integrated later. A module
proposal that does not address this question for each applicable system
is not ready for implementation.

## 2. THE SYSTEM LIST

Every module must verify its impact on, and connection to, each of the
following. A module may legitimately have no connection to a given
system — but that absence must be a stated, justified design decision,
not an unexamined gap.

- HQ
- HQ Roles
- Tenant Owner
- Tenant Staff
- Workspace
- Subscription
- Billing
- Resource Wallet (AI credits, OCR credits, storage credits, future credit
  types)
- Support
- Customer 360 / Customer Health
- Approval Center
- Activity Center
- Notifications
- Audit Logs

## 3. THE FAIL CONDITION

If a workflow becomes disconnected from a system it should plausibly
touch — for example, a commercial mutation that changes wallet balance
but produces no audit row, or a subscription change that updates
entitlements but never notifies the tenant — that workflow has FAILED
ecosystem review. It must be fixed before it is considered complete,
regardless of whether its primary function "works."

This applies recursively: a module that is itself a verification or
governance layer (e.g., Commercial Governance, Production Governance) is
still subject to this rule for its own actions — a policy change that is
not itself audited and notified has failed the same way a tenant-facing
feature would.

## 4. THE CLOSED-LOOP COROLLARY

For commercial workflows specifically, satisfying this principle means
completing the full Closed Loop Rule defined in
`MYKERANI_GOVERNANCE_EXTENSION.md` §1: Action → Validation → Approval (if
required) → Resource Change → Billing Change → Wallet Change →
Notification → Audit → Analytics → Reporting. The system list in §2 above
and the closed-loop steps are two views of the same requirement: the
system list is "what must be touched," the closed loop is "in what order
and by what mechanism."

## 5. VERIFICATION ARTIFACT

Any blueprint or design document that introduces multiple modules must
include an explicit ecosystem impact matrix (module × system) before
implementation begins, so that gaps are visible at design time rather
than discovered during review or, worse, in production. The Phase 4
Master Blueprint's ecosystem impact matrix is the reference example of
this artifact.

## 6. AMENDMENT

This document is LOCKED V1.0. Amending it requires dual approval per
`MYKERANI_GOVERNANCE_EXTENSION.md` §3.
