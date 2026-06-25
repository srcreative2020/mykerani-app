# MYKERANI PHASE 4 — SAAS COMMERCIAL & SCALE
## MASTER BLUEPRINT (V1.1 — IMPLEMENTATION-READY)

> **STATUS: PLANNING ONLY. NO PRODUCTION CODE IN THIS DOCUMENT OR ASSOCIATED WITH IT.**
> This is the single, complete architecture and workflow reference for the
> entire MYKERANI commercial platform. Implementation begins only after
> architecture review of this document.

> **Governance basis.** This blueprint is written against all five LOCKED
> governing documents: `MYKERANI_VISION.md`, `MYKERANI_CONSTITUTION.md`,
> `MYKERANI_OWNER_STAFF_PARITY_RULE.md`, `MYKERANI_GOVERNANCE_EXTENSION.md`,
> and `MYKERANI_ECOSYSTEM_GOVERNANCE_PRINCIPLE.md`. The latter two were
> created alongside this revision to formalize the principles the original
> authorization named (closed-loop workflows, unified resource wallet, no
> hardcoded commercial rules, full ecosystem connectivity) as durable,
> citable rules rather than one-off instructions, since they govern every
> future module, not just Phase 4. §0 below references them directly
> instead of restating them informally.

> **V1.1 change note.** V1.0 left four open questions blocking
> implementation. Per direction, none of them rises to "fundamentally
> changes the commercial architecture," so each has been resolved with a
> default decision and rationale in §15. There are no remaining
> architectural blockers in this document.

---

## 0. CROSS-CUTTING FOUNDATIONS

These four foundations are shared by all 12 modules. Every module below
references them rather than redefining them, per the "one connected
ecosystem, not isolated modules" mandate.

### 0.1 The Unified Resource Wallet

**Principle:** one wallet system, one ledger table family, for every
billable resource — AI credits, OCR credits, storage credits, and any
future credit type. No module is permitted to introduce a parallel balance
column or a second ledger.

**Core tables:**

- `wallet_accounts` — one row per tenant (`tenant_id`, `created_at`). The
  account, not the balance, is the durable identity.
- `wallet_resource_types` — config table (HQ-managed, not hardcoded):
  `code` (`ai_credit`, `ocr_credit`, `storage_gb_month`, future types),
  `display_name`, `unit_label`, `is_active`.
- `wallet_balances` — `(wallet_account_id, resource_type_code) -> balance,
  reserved_balance, updated_at`. `reserved_balance` supports the
  Validation → Approval → Resource Change sequencing in §0.4 (hold funds
  before an action is approved, release or commit on completion).
- `wallet_ledger_entries` — immutable, insert-only. Every balance change is
  a row here first; `wallet_balances` is a materialized projection
  maintained by trigger, never written directly by application code.
  Columns: `id, wallet_account_id, resource_type_code, delta, reason_code,
  reference_table, reference_id, balance_after, created_by, created_at`.
- `wallet_topup_sources` — links a ledger entry of type `topup` back to a
  `billing_invoices` row or a manual HQ adjustment (`hq_admin` reason code,
  always audit-logged, never silent).

**RPCs (design-level signatures, no implementation):**

- `wallet_reserve(p_tenant_id, p_resource_type, p_amount, p_reference) ->
  reservation_id` — moves amount from `balance` to `reserved_balance`;
  fails closed if insufficient balance (no negative balances, ever — this
  is the hard backstop that replaces ad hoc credit checks scattered across
  modules today).
- `wallet_commit_reservation(p_reservation_id)` — converts a reservation
  into a real debit ledger entry.
- `wallet_release_reservation(p_reservation_id)` — returns reserved amount
  to available balance (action was rejected/cancelled/failed).
- `wallet_credit(p_tenant_id, p_resource_type, p_amount, p_reason_code,
  p_reference)` — top-ups, refunds, HQ grants.
- `wallet_get_balance(p_tenant_id, p_resource_type)` — read path for UI.

**Why reservation-based, not direct debit:** every AI call, OCR job, and
storage write is "Action → Validation → Resource Change" in the Closed
Loop Rule (§0.4). Reserve-then-commit is what lets validation fail *before*
a resource is spent, and what lets an Approval Center gate (§ Module 9, 10)
sit in the middle without double-spending or stranding a partial debit.

### 0.2 Commercial Governance Config Layer

**Principle:** pricing, credits, quotas, limits, promotions, trials, AI
costs, OCR costs, and storage costs are never literals in code. They are
rows in HQ-managed config tables, versioned, with an effective-date range,
so that a price change does not rewrite history for invoices already
issued.

**Core tables:**

- `commercial_config_items` — generic versioned key/value config:
  `id, config_key, config_scope ('global'|'plan'|'tenant'),
  scope_ref_id, value_jsonb, effective_from, effective_to, created_by,
  approved_by`. Every pricing, quota, and limit lives here, scoped
  globally, per-plan, or per-tenant override (in that precedence order).
- `subscription_plans` — see Module 1; itself a consumer of
  `commercial_config_items` for its price points.
- `ai_cost_rates` / `ocr_cost_rates` — already exist from Phase 1/2
  reconciliation (`ai_cost_rates` table, `simulateAiCostRateChange()`);
  Phase 4 extends these to be `commercial_config_items` rows with
  effective-dating rather than mutable single rows, so historical AI
  Cost Summary reporting (already shipped in OwnerDashboard) stays
  accurate after a rate change.
- `promotions` / `promotion_redemptions` — discount codes, trial
  extensions, plan-switch incentives. Every redemption is itself a closed
  loop (§0.4): validate eligibility → apply → wallet/billing change →
  notify → audit → analytics.

**Change control:** any write to `commercial_config_items` with
`config_scope = 'global'` or `'plan'` routes through the existing
dual-approval pattern (`pending_hq_actions` /
`review_pending_hq_action()` / `execute_pending_hq_action()`) introduced in
Phase 1 for the webhook-enforce flag — extended here to be the general
mechanism for *any* HQ-side change with revenue impact. `'tenant'`-scope
overrides (e.g., a negotiated enterprise rate) require `is_hq_owner()`.

### 0.3 Ecosystem Connectivity Contract

Every module's RPCs and services must, where applicable, touch:

| System | Contract |
|---|---|
| HQ / HQ Roles | Action visible in the correct HQ Console module, gated by `is_hq_user()`/`is_hq_owner()` |
| Tenant Owner / Staff | Parity per `MYKERANI_OWNER_STAFF_PARITY_RULE.md` — commercial actions (subscription, billing, wallet) are **Owner-only** by nature (financial commitment), so the parity rule's *engine list* does not apply, but visibility of resulting wallet/quota state must be parity-correct for Staff where Staff consumes AI/OCR/storage |
| Workspace | Multi-workspace tenants share one wallet account and one subscription unless Module 9 (Partner & Agency) explicitly splits them |
| Subscription / Billing / Wallet | Linked via `tenant_id`; no module debits a wallet without a `wallet_ledger_entries` row, no module changes an entitlement without a `subscription_plans` lookup |
| AI / OCR Credits | Routed exclusively through `wallet_reserve`/`wallet_commit_reservation` (§0.1) |
| Storage | Routed through the same wallet mechanism, replacing today's separate `storageQuota.ts` threshold checks with wallet-backed quota |
| Support | Customer Success Center (Module 8) reads billing/wallet health as ticket-priority signal |
| Customer 360 / Customer Health | Health score (already shipped, `getTenantMyHealthScore()`) gains commercial signals: payment failures, wallet depletion rate, plan downgrade risk |
| Approval Center | Every commercial action above a configurable risk/value threshold routes here |
| Activity Center | Every commercial mutation emits an activity event |
| Notifications | Every closed loop ends with a tenant- and/or HQ-facing notification |
| Audit Logs | Every mutation is an `audit_logs` row (financial-record mutation semantics already established) |

A module that cannot show how it touches each connected system it claims to
need is not complete — this is the explicit FAIL condition from the
authorization.

### 0.4 Closed-Loop Workflow Template

Every commercial workflow in this blueprint is an instance of this
template; modules below reference it by name rather than repeating it:

```
1. ACTION            tenant or HQ actor initiates (UI -> service -> RPC)
2. VALIDATION         RPC validates: entitlement, balance, role, plan limits
3. APPROVAL (if req.) routes to pending_hq_actions when above threshold
                      or when policy requires dual control
4. RESOURCE CHANGE    wallet_reserve -> wallet_commit_reservation
5. BILLING CHANGE     billing_invoices / billing_line_items updated or queued
6. WALLET CHANGE      wallet_ledger_entries row (already implied by step 4,
                      called out separately because some workflows touch
                      wallet without billing, e.g. promo credit grant)
7. NOTIFICATION       notify_tenant_*() / notify_hq_*()
8. AUDIT              audit_logs row, immutable
9. ANALYTICS          commercial_events row (append-only, feeds Module 12)
10. REPORTING         surfaces in HQ Revenue Center / tenant billing UI
```

Any module section below that lists fewer than these 10 steps for a given
workflow is incomplete by definition.

---

## 1. SUBSCRIPTION ENGINE

**Objective:** govern what a tenant is entitled to, on what plan, for what
period, and how that changes over time (upgrade, downgrade, trial, churn,
reactivation) — without ever hardcoding plan terms.

**Scope:** plan catalog, tenant subscription state machine, trial
lifecycle, plan-change workflow, entitlement resolution (the single
source of truth other modules query for "can this tenant do X").
Out of scope: payment capture (Module 2), credit consumption (Module 3/4/5).

**Database Architecture / Tables:**
- `subscription_plans` — `id, code, name, billing_interval
  ('monthly'|'annual'), price_myr, included_ai_credits,
  included_ocr_credits, included_storage_gb, max_workspaces, max_staff,
  feature_flags_jsonb, is_public, effective_from, effective_to`.
- `tenant_subscriptions` — `id, tenant_id, plan_id, status
  ('trialing'|'active'|'past_due'|'cancelled'|'expired'), trial_ends_at,
  current_period_start, current_period_end, cancel_at_period_end,
  created_at`.
- `subscription_plan_changes` — append-only history: `id,
  tenant_subscription_id, from_plan_id, to_plan_id, change_type
  ('upgrade'|'downgrade'|'trial_convert'|'cancel'|'reactivate'),
  effective_at, proration_credit_myr, requested_by, approved_by`.
- `subscription_entitlement_overrides` — tenant-specific exceptions
  (negotiated enterprise terms), same shape as `commercial_config_items`
  scoped to tenant.

**Relationships:** `tenant_subscriptions.tenant_id -> tenants.id` (1:1
active row per tenant, history via `subscription_plan_changes`);
`plan_id -> subscription_plans.id`; feeds `wallet_resource_types` initial
grants on period rollover.

**RPCs:**
- `get_tenant_entitlements(p_tenant_id) -> jsonb` — single resolved view
  (plan + overrides), the function every other module calls instead of
  joining plan tables itself.
- `start_trial(p_tenant_id, p_plan_id)`.
- `propose_subscription_change(p_tenant_id, p_to_plan_id, p_change_type)`
  — closed loop §0.4; downgrades that reduce included credits route
  through Approval if tenant's current wallet usage exceeds the new plan's
  allowance (protects against accidental entitlement loss mid-period).
- `process_period_rollover()` — scheduled job: grants period's included
  credits to wallet via `wallet_credit`, advances `current_period_*`,
  flips `trialing` → `active`/`expired` as trial windows close.
- `cancel_subscription(p_tenant_id, p_at_period_end boolean)`.

**Services:** `subscriptionService.ts` — `getMyPlan()`,
`getMyEntitlements()`, `requestPlanChange()`, `cancelMyPlan()` (tenant);
`hqService.ts` additions — `listSubscriptions()`, `forcePlanChange()` (HQ
override, dual-approval), `getSubscriptionChangeQueue()`.

**UI Structure:** Tenant — "Pelan & Subskripsi" page (Owner-only nav
entry, parity rule does not require Staff access since this is a
financial-commitment surface) showing current plan, usage-vs-allowance
bars (reusing the existing `StorageBar` pattern from OwnerDashboard),
upgrade/downgrade picker. HQ — Revenue Center subscription roster with
filters by status/plan/MRR-at-risk.

**User Journey:** Owner browses plans → selects upgrade → sees prorated
cost preview → confirms → (if downgrade with overage) sees Approval-pending
state → on approval, plan flips next period or immediately per
`change_type` policy.

**HQ / Tenant / Owner / Staff Workflow:** HQ workflow = approve
risky downgrades, manage plan catalog (gated `is_hq_owner()`, itself
closed-loop per §0.2). Tenant/Owner workflow = self-serve change.
Staff workflow = read-only visibility of plan limits relevant to their
own usage (e.g., "AI credits remaining this month" already exists in
OwnerDashboard's resources page — Staff equivalent should show the same
read-only figure, satisfying parity for *visibility* without granting
the commercial action itself).

**Notification Flow:** trial-ending-in-3-days, plan-change-confirmed,
downgrade-pending-approval, period-rollover-grant.

**Audit Flow:** every row in `subscription_plan_changes` is itself the
audit trail for entitlement changes; `audit_logs` additionally records the
mutation per existing convention.

**Resource / Billing / Wallet Impact:** plan defines wallet grant size;
billing engine (Module 2) reads `subscription_plans.price_myr` for
invoice generation; wallet is credited on rollover per §0.1.

**Security / RLS:** `tenant_subscriptions` readable by tenant's own
members (any role) for visibility; writable only via RPC (no direct table
grants to `authenticated`), RPC internally enforces Owner role for
self-serve change requests and `is_hq_user()`/`is_hq_owner()` for HQ-side
overrides per value threshold.

**Dependencies:** none upstream (this is the root of the commercial
graph); downstream: Module 2 (Billing), 3-5 (Credit Governance), 6
(Storage), 9 (Partner — plan reseller margins).

---

## 2. BILLING ENGINE

**Objective:** turn subscription + wallet top-up activity into invoices,
collect payment, and handle the failure/dunning path — the system that
converts entitlement into actual revenue.

**Scope:** invoice generation, payment capture integration, dunning,
proration, tax handling, receipts. Out of scope: deciding *what* a tenant
owes structurally (Module 1) or *how* credits are priced (§0.2).

**Database Architecture / Tables:**
- `billing_invoices` — `id, tenant_id, subscription_id, status
  ('draft'|'open'|'paid'|'failed'|'void'), period_start, period_end,
  subtotal_myr, tax_myr, total_myr, due_at, paid_at`.
- `billing_line_items` — `id, invoice_id, kind
  ('subscription'|'wallet_topup'|'proration'|'promotion'|'penalty'),
  description, quantity, unit_price_myr, amount_myr,
  reference_table, reference_id`.
- `billing_payment_attempts` — `id, invoice_id, gateway, gateway_ref,
  status, amount_myr, attempted_at, failure_reason`.
- `billing_dunning_state` — `tenant_id, consecutive_failures,
  next_retry_at, grace_period_ends_at, suspension_at`.
- `billing_tax_rules` — config-table, not hardcoded (`region, rate_pct,
  effective_from`).

**Relationships:** `billing_invoices.tenant_id -> tenants.id`,
`.subscription_id -> tenant_subscriptions.id`; line items reference
wallet topups, subscription changes, promotions by polymorphic
`reference_table/reference_id` — mirrors the existing pattern already used
in `support_tickets`/`pending_hq_actions` linkage elsewhere in the schema.

**RPCs:**
- `generate_invoice_for_period(p_tenant_id, p_period_start, p_period_end)`
  — scheduled, idempotent (safe to re-run, checks for an existing
  non-void invoice for the period first).
- `record_payment_attempt(p_invoice_id, p_gateway_ref, p_status, ...)` —
  called from a payment-gateway webhook handler (server-side only, never
  client-callable). `p_gateway` defaults to `billplz` per §15 decision 3;
  the handler itself sits behind a `PaymentGatewayAdapter` interface so a
  second gateway can be added without changing this RPC's signature or
  the `billing_payment_attempts` schema.
- `mark_invoice_paid(p_invoice_id)` / closed loop: validation (amount
  matches) → resource change (none directly) → wallet change (if invoice
  included a topup line item, credit wallet here) → notify → audit →
  analytics.
- `advance_dunning(p_tenant_id)` — scheduled; escalates
  `billing_dunning_state`, eventually proposes suspension via
  `pending_hq_actions` rather than auto-suspending (Vision document:
  AI/automation suggests, does not unilaterally cut off a paying
  customer without an HQ-visible step — applying the existing
  "AI Suggests → User Confirms" formula to HQ-side automation as well).

**Services:** `billingService.ts` — `getMyInvoices()`,
`getMyInvoicePdf()` (reuses existing PDF export utility pattern from
`exportUtils.ts`), `retryMyPayment()`; `hqService.ts` —
`listInvoicesAtRisk()`, `forceMarkInvoicePaid()` (manual reconciliation,
dual-approval, fully audited).

**UI Structure:** Tenant — "Bil & Pembayaran" page (Owner-only): invoice
list, payment method management, dunning-state banner if in grace period.
HQ Revenue Center — invoice roster, failed-payment queue, MRR/ARR
dashboard (feeds Module 12).

**User Journey:** period closes → invoice auto-generated → tenant
notified → payment auto-charged via stored method or tenant pays
manually → on success, receipt + wallet topup (if applicable) credited;
on failure → dunning sequence with tenant-visible grace countdown.

**HQ Workflow:** monitor failed-payment queue, approve manual
reconciliations, approve suspension proposals.
**Tenant/Owner Workflow:** view/pay invoices, update payment method.
**Staff Workflow:** no billing access (financial-commitment surface,
Owner-only by design — same reasoning as Module 1).

**Notification Flow:** invoice-issued, payment-succeeded,
payment-failed-retry-in-N-days, grace-period-ending,
suspension-proposed (HQ) / account-at-risk (tenant).

**Audit Flow:** every status transition on `billing_invoices` and every
`billing_payment_attempts` row is audit-logged; dunning escalations
audit-logged with reason.

**Resource / Wallet Impact:** topup line items credit wallet on payment
success only (never on invoice creation — prevents granting unpaid
credit).

**Security / RLS:** invoices/payment rows readable only by the tenant's
Owner role and HQ Finance/Owner roles; payment-gateway webhook endpoint is
a server route (not a client RPC) verifying gateway signature before
calling `record_payment_attempt`.

**Dependencies:** Module 1 (plan pricing), §0.1 Wallet (topup credit),
§0.2 (tax rules, never hardcoded), Module 11 (Production Governance —
webhook signature verification, idempotency keys).

---

## 3. RESOURCE WALLET ENGINE

**Objective:** this module *is* §0.1 promoted to a first-class module with
its own UI and HQ tooling — covered architecturally in §0.1, so this
section covers what's additive: the tenant-facing and HQ-facing surfaces.

**Scope:** wallet UI, top-up flow, low-balance alerting, HQ wallet
adjustment tooling. Database/RPC architecture: see §0.1 in full (not
repeated here, per "do not design multiple wallet systems" — this module
has no tables of its own beyond what §0.1 already defines).

**Services:** `walletService.ts` — `getMyWallet()` (all resource types in
one call), `requestTopup(resourceType, amount)` (creates a
`billing_invoices` draft with a `wallet_topup` line item, per Module 2),
`getMyLedgerHistory(resourceType)`. HQ: `hqService.ts` —
`adjustTenantWallet()` (manual grant/deduction, always dual-approval per
§0.2 change control, always a `hq_admin` reason code).

**UI Structure:** Tenant — unified "Wallet" surface replacing today's
separate AI-cost display and storage-quota bar with one resource-type
selector showing balance, reserved, recent ledger entries, and a
"Top Up" CTA per resource type. HQ — wallet roster across tenants sortable
by depletion rate (feeds Customer Health, Module 8).

**User Journey:** tenant sees AI credits low → taps Top Up → invoice
drafted → pays → wallet credited → low-balance banner clears.

**Owner/Staff Workflow:** balance *visibility* must be parity-correct
(both Owner and Staff see remaining AI/OCR credits before performing an
AI/OCR action, since this gates the actual financial engines the parity
rule protects); top-up *action* is Owner-only.

**Notification Flow:** low-balance-warning (configurable threshold per
§0.2), topup-confirmed, reservation-expired-unused (if a reservation times
out without commit — e.g., an AI call that errored after reserving).

**Audit Flow:** every `wallet_ledger_entries` row is itself an immutable
audit trail; HQ manual adjustments additionally hit `audit_logs`.

**Closed Loop:** topup is Action(request) → Validation(amount/limits) →
no approval needed for self-serve topup below threshold, required above
→ Resource Change(reservation n/a, direct credit on payment) → Billing
Change(invoice) → Wallet Change(credit) → Notify → Audit → Analytics →
Reporting. HQ manual adjustment is the same template with mandatory
Approval step regardless of amount.

**Dependencies:** §0.1 (architecture), Module 2 (billing for topup
payment), Module 8 (health signal consumes depletion rate).

---

## 4. AI CREDIT GOVERNANCE

**Objective:** govern AI usage as a metered, wallet-backed resource with
configurable per-model rates — extending the AI Cost Summary already
shipped (`getTenantAiCostSummary()`, `ai_cost_rates`) into full
reservation-based metering rather than post-hoc reporting only.

**Scope:** per-call cost calculation, reservation at call time, commit on
completion, rate configuration, forecast. Out of scope: the AI feature
logic itself (`AIFinancialAssistant.tsx` etc. are unchanged consumers).

**Database Architecture:** `ai_cost_rates` (exists, extend to
effective-dated per §0.2); `ai_usage_events` — extends existing
`logAiUsage()` server-side logging to also carry
`wallet_reservation_id`, `credits_charged`, `model`, `tenant_id`.

**Relationships:** every AI call's server-side handler (`server.ts`
`logAiUsage()`) gains a pre-call `wallet_reserve('ai_credit', ...)` and a
post-call `wallet_commit_reservation(...)` (success) or
`wallet_release_reservation(...)` (call failed before producing a billable
result).

**RPCs:** `estimate_ai_call_cost(p_tenant_id, p_model, p_estimated_tokens)
-> credits` (pre-flight estimate so UI can warn before an action that
would exceed balance — AI Suggests, User Confirms, applied to spend);
`get_ai_cost_forecast(p_tenant_id) -> jsonb` (rolling average usage ×
remaining period, surfaces in the already-shipped AI Cost Summary UI as a
forecast line, closing that part of the original Phase 1 ask that was
deferred).

**Services / UI:** extends existing `hqService.ts`
`getTenantAiCostSummary()`/`simulateAiCostRateChange()` and
OwnerDashboard's "Kos & Perbelanjaan AI" block to add a forecast figure
and a pre-action balance-check toast when an AI action's estimated cost
would deplete remaining balance below a configurable buffer.

**Owner/Staff Workflow:** full parity required — AI transaction
processing is explicitly on the parity-rule engine list. Both Owner and
Staff trigger reservations identically; only the Owner-facing *cost rate*
configuration and wallet top-up are Owner-only, per Module 3.

**Notification Flow:** ai-credit-low, ai-call-blocked-insufficient-balance
(fails closed, never silently degrades quality or behaves differently per
tenant — Constitution-aligned: no surprise behavior change for the user).

**Closed Loop:** Action(AI call) → Validation(estimate vs balance) →
Approval(none, sub-threshold; large-batch operations could route through
Approval if configured) → Resource Change(reserve/commit) → Billing
Change(none direct, feeds period invoice only at topup) → Wallet
Change(ledger entry) → Notify(only on low-balance/blocked) →
Audit(ai_usage_events is the trail) → Analytics(commercial_events) →
Reporting(AI Cost Summary).

**Dependencies:** §0.1, §0.2, Module 1 (plan-included credit grants).

---

## 5. OCR CREDIT GOVERNANCE

**Objective:** identical pattern to Module 4, applied to OCR processing
(`OCREngineConsole.tsx`, `server.ts` OCR call path).

**Scope/Database/RPCs:** mirrors Module 4 exactly with
`ocr_cost_rates`/`ocr_usage_events` instead of `ai_*` — intentionally not
re-specified table-by-table here per the "one connected ecosystem, don't
duplicate design" principle; the only difference is the resource type
code (`ocr_credit`) and that reservation happens around the OCR API call
in `OCREngineConsole.tsx`'s `processFile`/save path rather than the AI
assistant call path.

**Owner/Staff Workflow:** full parity required — OCR is explicitly on the
parity-rule engine list; identical reasoning to Module 4.

**Distinct addition vs Module 4:** OCR jobs can be *retried* on
low-confidence results without an additional charge (existing product
behavior) — the reservation/commit RPC must support a `p_is_retry boolean`
that skips re-reservation for a retry of the same `evidence_id` within a
configurable window, otherwise this becomes a silent double-charge bug.

**Dependencies:** same as Module 4; additionally Module 6 (a scanned
document also consumes storage — the same upload event triggers two
wallet reservations, one OCR-credit and one storage-credit, both inside
the same transaction so a partial failure doesn't charge one resource and
not the other).

---

## 6. STORAGE GOVERNANCE

**Objective:** replace the current standalone `storageQuota.ts`
threshold-check model with wallet-backed storage credits, while keeping
the existing BYOS (Bring Your Own Storage) carve-out intact per the Data
Ownership Rule (customer financial records remain customer property —
storage governance must never become a lever for HQ to gate access to a
tenant's *own* data, only to gate platform-storage *cost*).

**Scope:** storage-credit metering for platform-hosted storage; BYOS
tenants are explicitly exempt from wallet metering (they pay their own
cloud provider) but still get visibility/quota *display* for consistency.

**Database Architecture:** `storage_usage_snapshots` — periodic
`(tenant_id, bytes_used, snapshot_at)` rather than per-file reservation
(storage is metered as a gauge, not a per-call meter like AI/OCR) — feeds
`wallet_balances` via a scheduled reconciliation RPC rather than
reserve/commit per upload, since charging is for *accumulated* state, not
discrete actions.

**RPCs:** `reconcile_storage_wallet(p_tenant_id)` — scheduled, computes
delta since last snapshot, calls `wallet_credit`/`wallet_reserve` as
appropriate for over-quota usage; `get_storage_quota_status(p_tenant_id)`.

**Why this breaks the reserve/commit pattern deliberately:** flagged
explicitly rather than silently special-cased — storage is the one
resource type in this blueprint that is billed as a recurring gauge
(GB-months) rather than a discrete metered action, so it is reconciled
periodically against the plan's included allowance instead of reserved
per write. This is documented here so it isn't mistaken for an
inconsistency during implementation review.

**Owner/Staff Workflow:** evidence-linking and upload are parity-rule
engines — both Owner and Staff upload identically; storage *quota
management/upgrade* is Owner-only (Module 1/3 territory).

**Data Ownership interaction:** export/backup tooling
(`exportUtils.ts`, `MyKeraniBackupRecovery.tsx`) remains fully available
even when storage quota is exceeded — a tenant must always be able to
*export and reduce* their own data; only *new* uploads are gated when
over quota, never read/export access. This is a hard constraint, not a
preference.

**Dependencies:** §0.1, Module 1 (plan storage allowance), Module 5
(co-occurring OCR storage events).

---

## 7. HQ REVENUE CENTER

**Objective:** the HQ-side console module that surfaces everything Modules
1-6 produce, as a single operational dashboard — extending the existing
HQ Console pattern (`HQConsoleShell.tsx`, alongside the already-shipped
Activity Center, Cost Center, Knowledge Center modules from Phase 2).

**Scope:** MRR/ARR tracking, invoice/payment operations queue, plan-change
approval queue, wallet adjustment audit view, churn/expansion reporting.
This module has no new core tables — it is a reporting and operations
layer over Modules 1/2/3.

**RPCs:** primarily read-side aggregation RPCs:
`get_revenue_summary(p_period)`, `get_at_risk_accounts()` (joins
`billing_dunning_state` + Customer Health from Module 8),
`get_pending_commercial_approvals()` (unions `pending_hq_actions` rows
whose action type is commercial — plan-change, wallet-adjustment,
rate-change, suspension-proposal — into the existing Approval Center UI
rather than a separate queue, per "do not design isolated modules").

**UI Structure:** new HQ Console tab "Revenue Center" alongside existing
Activity/Cost/Knowledge Center tabs; sub-views: Overview (MRR/ARR/churn),
Invoices, Subscriptions, Wallet Adjustments, Approvals (filtered view into
existing Approval Center).

**HQ Workflow:** HQ Finance role (extends existing HQ role model from
Phase 1 Module 2 staff-role work) views and approves; HQ Owner required
for anything touching global pricing config (§0.2).

**Notification / Audit:** this module consumes notifications/audit from
Modules 1-6, it does not originate new ones except for HQ-internal
digest summaries (e.g., daily revenue digest — configurable, off by
default, opt-in per HQ user).

**Dependencies:** Modules 1, 2, 3, 8 (health signal), existing Approval
Center / Activity Center infrastructure (Phase 2).

---

## 8. CUSTOMER SUCCESS CENTER

**Objective:** unify Customer 360, Customer Health (already partially
shipped — `getTenantMyHealthScore()`, `snapshotCustomerHealthScores()`)
and Support (already shipped — ticket reply, SLA, dual-approval ticket
creation) into one HQ-facing success operations module, now extended with
commercial signals from Modules 1-6.

**Scope:** Customer 360 profile (single tenant view spanning
subscription/billing/wallet/support/health), health-score model
extension, proactive outreach workflow. Out of scope: the ticket
CRUD itself (already exists, Phase 1).

**Database Architecture:** `customer_health_scores` (exists from Phase 1,
extend its `reasons` computation to include: payment-failure streak,
wallet-depletion velocity, plan-downgrade history, support-ticket
sentiment/frequency); `customer_success_playbooks` — config table (not
hardcoded) mapping health-score bands → suggested HQ action (e.g.
"score dropped below 40 + payment failure → suggest outreach"), aligned
with the Vision document's "AI Suggests, Human Confirms" formula — the
playbook *suggests* an action to an HQ success rep, it never auto-emails
or auto-discounts a customer.

**RPCs:** `get_customer_360(p_tenant_id) -> jsonb` (single aggregation
call across subscription/billing/wallet/health/support — the read-side
backbone of this module); `get_recommended_actions(p_tenant_id)` (reads
`customer_success_playbooks`, returns suggestions only, never executes).

**UI Structure:** HQ Console "Customer 360" view per tenant — replaces
having to cross-reference Revenue Center + Support + Activity Center
manually; a single profile page with tabs.

**Notification Flow:** health-score-dropped (HQ-internal), suggested
outreach reminder (HQ-internal); no new tenant-facing notifications
beyond what Modules 1-6/Support already send.

**Closed Loop (outreach):** Action(rep clicks "send suggested message")
→ Validation(message template approved) → no Approval gate needed (a
human already is the actor) → no Resource/Billing/Wallet change → Notify
(tenant receives it) → Audit(logged as HQ-tenant interaction) →
Analytics(outreach-effectiveness tracking feeds Module 12).

**Dependencies:** Modules 1, 2, 3, existing Support infrastructure
(Phase 1), Module 12 (analytics feedback loop on outreach effectiveness).

---

## 9. PARTNER & AGENCY PLATFORM

**Objective:** allow accredited partners/agencies to manage multiple
tenant accounts on behalf of clients, with revenue-share/commission
tracking — the one module in this blueprint that introduces a new actor
type beyond HQ/Tenant Owner/Staff.

**Scope:** partner accounts, multi-tenant management scoping, commission
calculation, partner-facing console. This is the highest-risk module for
violating the Data Ownership Rule and the parity rule if designed
carelessly, so its security model is specified in more detail than other
modules.

**Database Architecture:**
- `partner_accounts` — `id, name, status, commission_rate_pct,
  created_by_hq_user`.
- `partner_tenant_links` — `partner_account_id, tenant_id,
  link_type ('managed'|'referred'), linked_at, linked_by, revoked_at` —
  the *only* table granting a partner any visibility into a tenant; a
  tenant Owner must explicitly consent (invite-accept flow) to create
  this link, never HQ or partner unilaterally.
- `partner_commission_ledger` — `partner_account_id, billing_invoice_id,
  commission_amount_myr, status, paid_at`.

**Security / RLS — explicit constraint:** a `partner_tenant_links` row
grants the partner **operational** visibility (subscription status,
support tickets, health score) scoped via RLS exactly like an HQ role
would be scoped to that one tenant — it never grants access to the
tenant's underlying *financial records* (transactions, OCR evidence,
bank data). This is a hard line drawn from the Data Ownership Rule:
"Customer financial records remain customer property" — a partner is
commercial-tier access only, structurally identical to an HQ support role,
never a backdoor into ledger data. Any future module proposal that would
let a partner read transaction-level data must be rejected at design
time, not caught in review.

**RPCs:** `propose_partner_tenant_link(p_partner_id, p_tenant_id)` —
creates a pending invite, tenant Owner must `accept_partner_link()` for
the row to become active (closed loop with consent as the "Approval"
step, but the approver is the *tenant*, not HQ — a deliberate inversion
worth calling out since every other Approval step in this blueprint is
HQ-side); `calculate_commission(p_billing_invoice_id)` —
scheduled/triggered on invoice payment, reads `partner_accounts
.commission_rate_pct` (config-table value, never hardcoded).

**UI Structure:** new Partner Console (separate from both HQ Console and
tenant app — a third shell) — minimal in V1: linked-tenant roster,
commission statements, tenant-invite flow.

**Owner/Staff Workflow:** Tenant Owner accepts/revokes partner links
(Owner-only — this is an account-control action); Staff has no visibility
or role in this module.

**Notification Flow:** partner-link-invited (to tenant Owner),
partner-link-accepted/revoked (to both sides), commission-statement-ready
(to partner).

**Dependencies:** Module 1 (subscription visibility), Module 2
(commission derives from invoices), Module 8 (partners see a scoped
Customer-360-like view of their linked tenants only).

---

## 10. COMMERCIAL GOVERNANCE

**Objective:** the policy/control-plane module — this is largely §0.2 and
§0.4 made explicit as their own module with a dedicated HQ UI, since the
authorization calls out Commercial Governance as a distinct numbered
item. No new architectural concept beyond §0.2/§0.4; this section is the
operational surface for them.

**Scope:** config-item management UI, approval-threshold configuration,
promotion/trial rule management, audit trail for every commercial policy
change.

**Database Architecture:** `commercial_config_items` (§0.2, already
specified); `commercial_approval_thresholds` — config table mapping
action-type → value/risk threshold above which `pending_hq_actions` is
mandatory (e.g., wallet adjustments under RM50 auto-apply with audit-only,
over RM50 require dual approval) — itself versioned and changeable only
via dual approval (governance governing itself, deliberately recursive
but bottomed out at `is_hq_owner()` as the root trust anchor, same root
used throughout Phase 1).

**RPCs:** `get_config_value(p_key, p_scope, p_scope_ref_id) -> jsonb`
(the universal config-read RPC every other module's RPCs call internally
— "never hardcode" is enforced by *making the easy path a function call*,
not by code review alone); `propose_config_change()`/
`approve_config_change()` (thin wrapper over existing
`pending_hq_actions` mechanism).

**UI Structure:** HQ Console "Commercial Governance" tab — config-item
browser/editor (grouped by scope), approval-threshold editor, promotion
manager.

**HQ Workflow:** HQ Owner edits global/plan config (dual-approval); HQ
Finance role can propose but not unilaterally approve.

**Dependencies:** none structurally (it's the substrate), but every other
module in this blueprint depends on it.

---

## 11. PRODUCTION GOVERNANCE

**Objective:** the non-functional backbone that makes Modules 1-10 safe to
run in production: idempotency, webhook security, rate limiting,
migration/rollback discipline, and incident response for commercial flows
specifically (general production governance for the rest of the app is
out of scope — this module is scoped to the *commercial* surfaces this
blueprint introduces).

**Scope:** payment-webhook signature verification, idempotency keys on
every mutating commercial RPC, rate limits on self-serve actions
(topup requests, plan-change requests) to prevent abuse, scheduled-job
monitoring (period rollover, dunning advance, storage reconciliation —
all from Modules 1/2/6 — must alert if they fail to run, not fail
silently).

**Database Architecture:** `commercial_idempotency_keys` —
`(key, request_hash, response_jsonb, created_at)`, TTL-cleaned; every
client-initiated mutating RPC in Modules 1-9 accepts an idempotency key
generated client-side, checked server-side before re-executing —
specifically guards against double-charging on retried network requests,
the single most damaging class of bug a billing system can have.
`scheduled_job_runs` — `(job_name, started_at, finished_at, status,
error)` for the rollover/dunning/reconciliation jobs, surfaced as an HQ
alert (reusing existing `refresh_hq_alerts()`/alert infrastructure from
Phase 1) if a job is overdue.

**Security:** payment-gateway webhooks verified via provider signature
before touching any RPC (never trust an unauthenticated POST to mutate
billing state) — for the Billplz default (§15 decision 3) this is the
`X-Signature` callback verification against the collection's
X-Signature-Key, implemented inside the `PaymentGatewayAdapter`, not
inlined in the webhook route, so the verification logic moves with the
adapter if a second gateway is added; all commercial RPCs are
`SECURITY DEFINER` with explicit role checks per existing project
convention, never relying on RLS alone for write-path authorization (RLS
remains the read-path backstop).

**Dependencies:** underlies Modules 1, 2, 3 most heavily (the ones with
real money/scheduled jobs); conceptually wraps all of them.

---

## 12. COMMERCIAL ANALYTICS

**Objective:** close the loop's final two steps (Analytics, Reporting)
for every workflow in this blueprint with one shared event stream and
reporting layer, rather than each module inventing its own analytics
table.

**Scope:** `commercial_events` append-only stream, MRR/ARR/churn/LTV
computation, cohort/plan analysis, outreach-effectiveness tracking
(Module 8 feedback), partner commission analytics (Module 9).

**Database Architecture:** `commercial_events` — `id, event_type,
tenant_id, payload_jsonb, occurred_at` — every closed-loop workflow in
this blueprint writes exactly one row here at its Analytics step; this is
intentionally schema-light (payload as jsonb) because the event taxonomy
will grow as modules ship — a rigid wide table would force migrations on
every new event type, violating "do not design for hypothetical future
requirements" in the *opposite* direction (over-rigid instead of
over-abstracted). Materialized/derived reporting tables
(`mrr_snapshots`, `churn_cohorts`) are built from this stream by
scheduled jobs, not computed ad hoc per dashboard load.

**RPCs:** `record_commercial_event(p_type, p_tenant_id, p_payload)` —
the single write entry point, called internally by every other module's
RPCs at their Analytics step (never called directly from client code);
`get_mrr_trend()`, `get_churn_cohort_analysis()`, `get_plan_distribution()`
— HQ Revenue Center (Module 7) read consumers.

**UI Structure:** feeds Module 7's Revenue Center charts; no standalone
UI of its own beyond an HQ "raw event explorer" for debugging (read-only,
`is_hq_owner()`-gated, since raw commercial events are sensitive).

**Audit vs Analytics distinction (explicit, mirroring the existing
Event Logging Rule):** `commercial_events` is the *operational/analytics*
log — separate from `audit_logs` (mutations) exactly as
`event_logs`/`audit_logs` are already split per CLAUDE.md's Event Logging
Rule. This module does not replace either; it is a third, append-only
stream specifically for revenue analytics, with the same
insert/select-only, no-update/no-delete RLS posture as the other two.

**Dependencies:** every other module (it is the terminal sink of every
closed loop).

---

## 13. ECOSYSTEM IMPACT MATRIX (Failure-Mode Check)

Per the authorization's FAIL condition — every module's connectivity to
every listed system, verified explicitly rather than asserted:

| Module | HQ | Tenant O/S | Workspace | Subscription | Billing | Wallet | AI/OCR Credits | Storage | Support | Cust.360/Health | Approval Ctr | Activity Ctr | Notif. | Audit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 Subscription | ✓ approve | ✓ O-only act, S read | ✓ shared wallet | — (is it) | ✓ price source | ✓ grants | ✓ allowance source | ✓ allowance source | — | ✓ downgrade risk signal | ✓ risky downgrades | ✓ | ✓ | ✓ |
| 2 Billing | ✓ approve/reconcile | ✓ O-only | — | ✓ reads plan price | — (is it) | ✓ topup credit | — | — | — | ✓ payment-failure signal | ✓ manual reconcile | ✓ | ✓ | ✓ |
| 3 Wallet | ✓ adjust | ✓ O act, O/S read | ✓ one wallet/tenant | ✓ grant trigger | ✓ topup invoice | — (is it) | ✓ same ledger | ✓ same ledger | — | ✓ depletion signal | ✓ adjustments | ✓ | ✓ | ✓ |
| 4 AI Credits | ✓ rate config | ✓ O/S full parity | — | ✓ included allowance | — | ✓ reserve/commit | — (is it) | — | — | — | conditional (batch) | ✓ | ✓ | ✓ |
| 5 OCR Credits | ✓ rate config | ✓ O/S full parity | — | ✓ included allowance | — | ✓ reserve/commit | — | ✓ co-occurring | — | — | conditional | ✓ | ✓ | ✓ |
| 6 Storage | ✓ quota policy | ✓ O/S full parity (upload) | — | ✓ included allowance | — | ✓ reconciliation | ✓ co-occurring | — (is it) | — | — | — | ✓ | ✓ | ✓ |
| 7 Revenue Ctr | ✓ ops surface | — | — | ✓ reads | ✓ reads | ✓ reads | — | — | — | ✓ reads | ✓ unified queue | ✓ | ✓ digest | ✓ reads |
| 8 Customer Success | ✓ ops surface | ✓ outreach target | — | ✓ reads | ✓ reads | ✓ reads | — | — | ✓ extends existing | — (is it) | — | ✓ | ✓ | ✓ |
| 9 Partner | ✓ accredits | ✓ O consents/revokes | ✓ scoping unit | ✓ scoped read | ✓ commission source | — | — | — | — | ✓ scoped view | ✓ link invite | ✓ | ✓ | ✓ |
| 10 Commercial Gov | ✓ policy owner | — | — | ✓ governs | ✓ governs | ✓ governs | ✓ governs rates | ✓ governs costs | — | — | ✓ recursive root | ✓ | ✓ | ✓ |
| 11 Production Gov | ✓ alerting | (transparent) | — | (wraps) | ✓ webhook sec. | ✓ idempotency | (wraps) | (wraps) | — | — | — | ✓ job alerts | ✓ | ✓ |
| 12 Analytics | ✓ explorer | — | — | ✓ event source | ✓ event source | ✓ event source | ✓ event source | ✓ event source | ✓ outreach loop | ✓ outreach loop | — | — | — | ✓ posture, not content |

No row has every cell blank; every "—" is justified above (the module
genuinely doesn't touch that system, not an oversight) or marked
"(is it)" / "(wraps)" where the relationship is structural rather than a
data dependency. This matrix is the artifact to re-check before marking
any module complete during implementation.

---

## 14. IMPLEMENTATION SEQUENCING (PHASE 4.1 / 4.2)

Listed for planning visibility — no implementation begins until this
blueprint clears architecture review. Per §15 decision 4, Module 9 is its
own wave (Phase 4.2); everything else below is Phase 4.1:

1. **Foundation first:** §0.1 Wallet, §0.2 Governance Config, §0.4
   pattern as reusable RPC scaffolding — nothing else can be built
   correctly before this exists.
2. **Module 1 Subscription** — the entitlement root.
3. **Module 11 Production Governance scaffolding** (idempotency keys,
   webhook verification skeleton) — build *alongside* Module 2, not
   after, since retrofitting idempotency onto a live billing engine is
   far riskier than having it from day one.
4. **Module 2 Billing.**
5. **Modules 4/5/6 Credit Governance** in parallel (same pattern, three
   resource types) — these are the highest-touch modules for existing
   Owner/Staff parity surfaces, so each needs the explicit A-E parity
   audit from `MYKERANI_OWNER_STAFF_PARITY_RULE.md` before being marked
   complete.
6. **Module 7 Revenue Center, Module 10 Commercial Governance UI** —
   operational surfaces over what now exists.
7. **Module 8 Customer Success Center** — extends existing Phase 1
   health/support infrastructure.
8. **Module 12 Analytics** — can start its event-stream plumbing earlier
   (each module writes events as it ships) but its reporting UI lands
   last, once there's data to report on.

**— end of Phase 4.1 —** Phase 4.1 ships and stabilizes in production
(real tenants on real plans, paying real invoices, consuming metered
AI/OCR/storage) before Phase 4.2 design work resumes.

9. **Module 9 Partner & Agency Platform (Phase 4.2)** — deliberately
   held to its own wave: it is the highest-risk module for the Data
   Ownership Rule and depends on Modules 1/2/8 being stable before
   adding a third actor type on top.

---

## 15. RESOLVED DESIGN DECISIONS (DEFAULT IMPLEMENTATION)

V1.0 left four open questions. None of them changes the commercial
architecture itself (wallet model, closed-loop pattern, module
boundaries, table design all stand as specified in §0-§13 regardless of
how these resolve) — each is a parameter within that architecture, so
each is resolved here with a default and a rationale, per direction not
to stop for approval below that bar.

**1. Governance basis.** Resolved by creating
`MYKERANI_GOVERNANCE_EXTENSION.md` and
`MYKERANI_ECOSYSTEM_GOVERNANCE_PRINCIPLE.md` as LOCKED V1.0 documents in
this repository (committed alongside this revision). They formalize the
Closed Loop Rule, Resource Wallet Principle, Commercial Governance
Principle, Automation Restraint Rule, and Ecosystem Review Requirement as
durable rules rather than instructions scoped to this one conversation.
This blueprint's §0 foundations are the implementation of those two
documents for Phase 4 specifically; future phases cite the same two
documents rather than re-deriving these principles.

**2. Commercial-action permission model — DEFAULT: Owner-only actions,
Owner/Staff parity for visibility.** Subscription changes, billing/
payment management, and wallet top-up/adjustment actions are Owner-only.
Staff have full read access to the figures that affect their daily work
(AI/OCR credit balance, storage quota) because those gate the financial
*engines* the Parity Rule protects, but never to the commercial
*commitment* actions themselves (signing up for a plan, paying an
invoice, moving money). **Rationale:** `MYKERANI_OWNER_STAFF_PARITY_RULE.md`
scopes parity to a named list of financial *engines*
(OCR, AI transaction processing, voice notes, business/branch mapping,
evidence linking, import recovery, learning memory, duplicate detection,
ledger processing) — committing the business to a spend is categorically
different from operating those engines, and is already how every
existing financial-commitment surface in the app is gated (e.g.
`MyKeraniBackupRecovery.tsx`'s full-workspace export is `TENANT_OWNER`-
gated, not parity'd to Staff). This blueprint's Modules 1/2/3 sections
already state this split; this entry makes it the binding default rather
than an assumption.

**3. Payment gateway — DEFAULT: Billplz as primary rail, designed behind
a gateway-abstraction interface from day one.** MyKerani's tenant base is
Malaysian SMEs operating in MYR with FPX/online-banking as the dominant
local payment habit for B2B SaaS spend (cards are secondary for this
segment). Billplz is selected as the primary integration for Module 2/11
because it has native FPX support, MYR settlement, and a webhook model
that maps directly onto the `billing_payment_attempts` /
`record_payment_attempt()` design already specified. **Rationale for the
abstraction requirement, not just the gateway pick:** Module 11's webhook
verification and idempotency-key design must sit behind a
`PaymentGatewayAdapter` interface (`createCharge`, `verifyWebhookSignature`,
`refund`) so that card-rail support (e.g., Stripe, for any future non-MYR
or international expansion) can be added as a second adapter without
touching `billing_invoices`/`billing_payment_attempts` schema or the
closed-loop RPCs — this is the same "don't hardcode" principle from
`MYKERANI_GOVERNANCE_EXTENSION.md` §3 applied to infrastructure choice,
not just commercial config values.

**4. Module 9 (Partner & Agency Platform) sequencing — DEFAULT: deferred
to Phase 4.2, not in the first implementation wave.** Modules 1-8 and
10-12 (everything except Partner & Agency) constitute Phase 4.1 and are
implementation-ready as specified. Module 9 is held to Phase 4.2.
**Rationale:** §9's own security section identifies Module 9 as "the
highest-risk module for violating the Data Ownership Rule" and its
dependency list requires Modules 1/2/8 to be stable in production first;
shipping it in the same wave as the foundation it depends on maximizes
risk for a module that is additive (a new partner channel) rather than
required for MyKerani's core commercial launch (a tenant subscribing,
paying, and consuming metered AI/OCR/storage). §14's sequencing already
places Module 9 last — this entry promotes that from a sequencing
preference to a binding wave boundary: Phase 4.1 ships and stabilizes
before Module 9 design is revisited in detail.

**No remaining architectural blockers.** This blueprint, together with
`MYKERANI_GOVERNANCE_EXTENSION.md` and
`MYKERANI_ECOSYSTEM_GOVERNANCE_PRINCIPLE.md`, is implementation-ready for
Phase 4.1 (Modules 1-8, 10-12). Module 9 (Phase 4.2) is architecturally
specified in §9 but intentionally sequenced after Phase 4.1 stabilizes,
per decision 4 above — that is a sequencing decision, not an unresolved
design question.

**This blueprint is complete as a single document covering all 12
requested modules plus the cross-cutting foundations, ecosystem impact
matrix, sequencing, and resolved design decisions. No implementation code
has been written. Awaiting architecture review before Phase 4
implementation begins.**
