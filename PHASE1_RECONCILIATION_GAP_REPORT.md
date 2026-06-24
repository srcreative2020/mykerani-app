# PHASE 1 RECONCILIATION GAP REPORT
**MyKerani — HQ ↔ Tenant Ecosystem Review, Phase 1 Foundation (Modules 1–11)**
Date: 2026-06-24 · Scope: Ecosystem reconciliation per MYKERANI Governance Extension (LOCKED). Read-only audit — no remediation implemented.

---

## METHOD NOTE

Module identity confirmed from code (`grep -iE "HQ Foundation Module [0-9]+"` across `supabase/migrations/*.sql`):

| # | Module | Status |
|---|--------|--------|
| 1 | Security Foundation | Implemented |
| 2 | **HQ/Tenant Staff Role & Permission Governance** | **NOT IMPLEMENTED — does not exist in codebase** |
| 3 | AI Cost Governance | Implemented |
| 4 | Storage Governance | Implemented |
| 5 | Support Governance | Implemented (heavily redesigned post-original migration) |
| 6 | Approval Center (dual-approval workflow) | Implemented |
| 7 | Data Masking Governance | Implemented |
| 8 | Customer Health Score | Implemented |
| 9 | HQ Alert Center | Implemented |
| 10 | Customer Master Data Consolidation | Implemented |
| 11 | Resource Wallet Dashboard | Implemented |

Module numbering jumps 1→3 in the migration files themselves; no file, UI component, or doc anywhere in the repo references "Module 2." This is the single most severe structural finding of the audit (see Module 2 below).

---

## MODULE 1: SECURITY FOUNDATION

**HQ actions:** Toggle `chip_asia_webhook_enforce` flag; view `payment_webhook_events`; submit/review dual-approval actions (`submit_pending_hq_action`, `review_pending_hq_action`).
**Tenant actions:** None — tenant is wholly invisible to this module.

| Gap | Root Cause | Ecosystem Impact | Risk | Required Fix |
|---|---|---|---|---|
| 1.1 | No tenant visibility into webhook enforcement or failures | Tenants can't debug failed payments; assume own fault | High | Notify tenant workspace on webhook verification failure |
| 1.2 | `hq_feature_flags` has no audit trigger / `updated_by` | Flag toggles untraceable to an actor | Critical | Add `updated_by`, write immutable `hq_governance_audit_log` entry on every flag change |
| 1.3 | No notification when webhook verification fails | Failures invisible to HQ staff for days | High | Insert `hq_staff_notification` when `verification_result != 'verified'` |
| 1.4 | RLS checks only `is_hq_user()`, not role; UI-only `!isStaff` gate | HQ_STAFF can bypass UI restriction via direct RPC call | High | Refactor RLS to check role explicitly, not just HQ membership |
| 1.5 | Feature-flag/security toggles not routed through dual-approval | Single HQ_OWNER can unilaterally change payment security posture | Medium | Route through `pending_hq_actions` |
| 1.6 | No closed-loop notification for payment failures at any tier | Revenue loss goes unnoticed by both tenant and HQ | Critical | Wire `workspace_notifications` + `hq_staff_notifications` on failure |

## MODULE 2: HQ/TENANT STAFF ROLE & PERMISSION GOVERNANCE — MISSING ENTIRELY

No migration, RPC, or UI component implements this module. `user_role_assignments` and `permission_matrices` exist from earlier (pre-Phase-1) work but are never scoped into Phase 1 governance, never enforced at runtime, and have no UI on either side.

| Gap | Root Cause | Ecosystem Impact | Risk | Required Fix |
|---|---|---|---|---|
| 2.1 | No HQ-side staff role management UI/RPC | HQ_OWNER cannot govern who gets HQ_STAFF access to payment/cost/storage modules | Critical | Build Module 2: HQ staff invite/role-assign/revoke, dual-approval for escalation |
| 2.2 | No tenant-side staff management UI/RPC | Tenant_OWNER cannot invite/manage tenant staff; multi-user tenancy is non-functional in practice | Critical | Build tenant staff invite/role-assign flow |
| 2.3 | `user_role_assignments` mutable, no audit | Privilege changes untraceable; compliance exposure | Critical | Immutable `role_change_audit_log`, trigger-based |
| 2.4 | No notification on role/privilege change | Tenant/HQ staff gain access silently | High | Notify affected user + relevant HQ/tenant owner on grant/revoke |
| 2.5 | `permission_matrices` defined but never queried at runtime | Roles are cosmetic; no actual enforcement boundary | High | `check_permission()` RPC, enforced inside every privileged RPC |
| 2.6 | HQ has no visibility into tenant staff rosters | Cannot audit segregation of duties across tenants | Medium | `get_tenant_staff_roles(tenant_id)` RPC + HQ dashboard view |

## MODULE 3: AI COST GOVERNANCE

**HQ actions:** Edit per-model `cost_per_call_usd`; view aggregate spend by tenant/provider.
**Tenant actions:** None.

| Gap | Root Cause | Ecosystem Impact | Risk | Required Fix |
|---|---|---|---|---|
| 3.1 | No tenant-facing cost-rate or spend visibility | Tenants can't forecast AI spend; invoice surprises | High | Read-only per-call rate + monthly spend view in tenant dashboard |
| 3.2 | `ai_cost_rates.updated_at` with no `updated_by`/audit | Rate changes have no governance trail | Critical | Add `updated_by`; write `hq_governance_audit_log` per change |
| 3.3 | No notification on rate change | HQ_STAFF and tenants blindsided by cost shifts | High | Notify HQ team always; notify affected tenants if rate increases >5% |
| 3.4 | No cost-impact forecasting | HQ can't estimate revenue/cost impact before applying a rate change | Medium | Add preview/simulation RPC |
| 3.5 | No tenant dispute/escalation path for AI cost | Tenant billed with no recourse | Medium | Route cost disputes into Module 5 support tickets with `ai_usage_log` drill-down for HQ |
| 3.6 | RLS only checks `is_hq_user()`, not HQ_OWNER specifically | HQ_STAFF can update cost rates directly via RPC despite UI gating | High | Restrict writes to HQ_OWNER via RLS `WITH CHECK` |

## MODULE 4: STORAGE GOVERNANCE

**HQ actions:** Configure inactivity threshold, batch enforcement, manual per-tenant freeze/unfreeze.
**Tenant actions:** View-only (frozen banner).
Closed-loop status: freeze/unfreeze → notification → audit is **fully wired** (`set_tenant_frozen`).

| Gap | Root Cause | Ecosystem Impact | Risk | Required Fix |
|---|---|---|---|---|
| 4.1 | HQ_STAFF excluded from Storage Governance UI, undocumented | Ambiguous whether intentional; staff lack visibility for support purposes | Medium | Document rationale or relax to read-only for staff |
| 4.2 | Frozen-state surfaced to tenant without distinguishing inactivity-freeze vs manual-freeze reason | Tenant confusion about why storage is frozen | Medium | Persist/display `frozen_reason` in tenant-facing banner |
| 4.3 | No appeal/escalation path if tenant believes freeze is wrong | Tenant locked out of uploads with zero recourse | Critical (shared with Module 6 Gap 6.1) | Tenant-initiated appeal routed to Approval Center |

## MODULE 5: SUPPORT GOVERNANCE (post `support_ops_redesign`)

**HQ actions:** Reply, change status, assign, add internal notes, attach files.
**Tenant actions:** File ticket, attach files, view replies/status — cannot reply back.
Owner/Staff parity: **confirmed equal** on both HQ and tenant sides (no `!isStaff` gating on this module).

| Gap | Root Cause | Ecosystem Impact | Risk | Required Fix |
|---|---|---|---|---|
| 5.1 | `hq_reply_support_ticket()` writes no `audit_logs` entry | HQ responses have no audit trail | High | Add audit insert to reply RPC |
| 5.2 | `hq_assign_support_ticket()` does not call `notify_tenant_ticket_update()` | Tenant unaware ticket is being worked | Medium | Notify tenant on assignment |
| 5.3 | Attachment upload triggers no notification either direction | HQ may miss tenant-submitted evidence; tenant misses HQ-submitted docs | Medium | Notify counterpart on attachment insert |
| 5.4 | No tenant-side reply RPC — channel is one-way (HQ → tenant only) | Tenant cannot respond to clarifying questions; ticket stalls | High | Add `tenant_reply_support_ticket()`, sets status `awaiting_hq`, notifies HQ |
| 5.5 | Legacy direct-insert `createSupportTicket()` path can create tickets with null `tenant_id` | HQ-created tickets invisible to the tenant they're about | High | Force `tenant_id` population or remove legacy path |
| 5.6 | No cross-module cascade documentation (suspension → tickets/storage interaction) | Operationally ambiguous which governance action takes precedence | Medium | Document cascade order in code comments |

## MODULE 6: APPROVAL CENTER (dual-approval workflow)

Best-implemented module in the audit: submit → review → execute → immutable `hq_governance_audit_log` → notify affected party, fully wired for staff suspension, tenant suspension, and plan-change action types.

| Gap | Root Cause | Ecosystem Impact | Risk | Required Fix |
|---|---|---|---|---|
| 6.1 | No appeal path for a tenant wrongly suspended | Suspended tenant has zero in-product recourse | Critical | `tenant_submit_suspension_appeal()` RPC → new `appeal` action_type routed into Approval Center |
| 6.2 | Staff-suspension notification has no delivery/read confirmation | Approver can't verify the affected staff member actually saw it | Medium | Track read-state on `hq_staff_notifications` |

## MODULE 7: DATA MASKING GOVERNANCE

**HQ actions:** Grant/revoke per-staff unmask access to tenant PII.
**Tenant actions:** None.
Audit trail for grant/revoke is correct post `data_masking_audit_closed_loop` fix.

| Gap | Root Cause | Ecosystem Impact | Risk | Required Fix |
|---|---|---|---|---|
| 7.1 | No tenant notification when their PII is unmasked to a named staff member | PII exposed without tenant awareness/consent trail | Medium | Notify tenant workspace on grant |
| 7.2 | Tenant has no visibility into who currently holds unmask access to their data | No self-service privacy audit | High | Read-only "Data Access Log" in tenant dashboard |
| 7.3 | Revoke is instantaneous with no informational notice to the affected staff member | Minor UX gap, not a governance break | Low | Optional informational notice on revoke |

## MODULE 8: CUSTOMER HEALTH SCORE

**HQ actions:** View computed churn-risk score + reasons (HQ_OWNER only).
**Tenant actions:** None — score, reasons, and signals are entirely invisible to the tenant being scored.

| Gap | Root Cause | Ecosystem Impact | Risk | Required Fix |
|---|---|---|---|---|
| 8.1 | No tenant notification when health score drops into high-risk | Tenant flagged for churn-risk action with no chance to self-remediate | High | Notify tenant when score crosses into "high risk," in plain language |
| 8.2 | No `audit_logs` entry for health-score assessment | No record of when/why HQ classified a tenant as high-risk | Medium | Audit-log the assessment, esp. when HQ acts on it |
| 8.3 | Tenant cannot see their own score at all | Opaque, unappealable churn-risk classification feeding into suspension decisions | High | "Account Health" widget in tenant dashboard with remediation guidance |
| 8.4 | Resource freezes shown to tenant in isolation, not linked to the health-score narrative that they drive | Tenant can't connect "storage frozen" to "I am flagged as churn risk" | Medium | Cross-link freeze banners to health-score context |

## MODULE 9: HQ ALERT CENTER

**HQ actions:** View/resolve churn-risk, storage-frozen, webhook-failed alerts (HQ_OWNER only).
**Tenant actions:** None — alerts fired against a tenant's account are never surfaced to them.

| Gap | Root Cause | Ecosystem Impact | Risk | Required Fix |
|---|---|---|---|---|
| 9.1 | No tenant notification when an alert fires against their account | Tenant unaware before HQ acts on the alert (e.g. suspension) | High | Notify tenant on high-severity alert creation |
| 9.2 | No `audit_logs` for alert creation or resolution | No lifecycle trail; can't detect accidental dismissals | Medium | Audit-log creation and resolution events |
| 9.3 | No tenant appeal/contest channel for an alert | Tenant can't dispute e.g. a stale `webhook_failed` alert after paying | High | Tenant-initiated contest → routes to HQ review |
| 9.4 | `webhook_failed` alert has no auto-retry or escalation tie-in to billing | Failed payment alerts can sit unresolved indefinitely | Medium | Auto payment-reminder to tenant; escalate to HQ after N failures |

## MODULE 10: CUSTOMER MASTER DATA CONSOLIDATION

**HQ actions:** Edit tenant master profile (company info, contacts, tax/registration) via `update_tenant_master_profile()`.
**Tenant actions:** Tenant_OWNER can edit their own profile via the same RPC.
Audit trail (`audit_logs`) is correctly wired for the RPC itself.

| Gap | Root Cause | Ecosystem Impact | Risk | Required Fix |
|---|---|---|---|---|
| 10.1 | No `workspace_notifications` insert when HQ edits a tenant's profile | Tenant unaware HQ changed their company/contact info | High | Notify on HQ-initiated profile edit |
| 10.2 | No realtime sync; tenant only sees the change after a manual refresh | HQ edits feel invisible until next page load | Medium | Supabase realtime subscription on `tenants`, or rely on the new notification |
| 10.3 | Audit completeness depends on caller path, not guaranteed symmetric for tenant-initiated edits | Asymmetric audit trail between HQ-initiated and tenant-initiated changes | Medium | Guarantee audit insert regardless of caller |
| 10.4 | Tenant Staff blocked from profile edit with no UI explanation | Role-boundary confusion | Low | Document or extend, per product intent |

## MODULE 11: RESOURCE WALLET DASHBOARD

**HQ actions:** View wallet summary (read-only on the dashboard itself); separate `hq_manual_wallet_adjustment()` RPC exists but is not surfaced in the audited UI.
**Tenant actions:** Read own wallet balances directly (real-time, since they query the table).
HQ_STAFF excluded from this dashboard entirely, undocumented.

| Gap | Root Cause | Ecosystem Impact | Risk | Required Fix |
|---|---|---|---|---|
| 11.1 | `hq_manual_wallet_adjustment()` sends no tenant notification | Tenant's credit balance changes silently with no explanation | Critical | Notify tenant with reason/amount on manual adjustment |
| 11.2 | `hq_manual_wallet_adjustment()` writes no `audit_logs` entry (only `resource_wallet_transactions`) | Manual adjustments missing from the governance audit trail, only the operational ledger | High | Add `audit_logs` insert alongside the transaction ledger write |
| 11.3 | Plan-downgrade wallet clawback has no tenant notification of the credit delta | Tenant loses credits on downgrade with no stated reason | High | Include wallet delta in the existing billing-plan-change notification |
| 11.4 | HQ has no real-time/threshold alert on tenant credit exhaustion | HQ only learns of near-zero balances by manually refreshing the dashboard | Medium | Alert HQ (via Module 9) at 80%+ consumption |
| 11.5 | HQ_STAFF fully excluded from wallet visibility, undocumented | Support staff can't see tenant resource state while triaging support tickets (Module 5) | Medium | Extend read-only access or document rationale |
| 11.6 | Billing-plan-change notification doesn't state the resulting wallet delta | Tenant told plan changed but not what happened to their credits | Medium | Merge with 11.3 fix |

---

## CROSS-MODULE SYSTEMIC FINDINGS

1. **Notification silence is the dominant, repeating failure mode.** Modules 1, 2(missing), 3, 7, 8, 9, 10, 11 all share the same root cause: HQ-side state changes that materially affect a tenant write to an internal table (`hq_*`, `*_rates`, `*_alerts`) but never insert into `workspace_notifications`. Modules 4, 5 (mostly), and 6 (mostly) got this right by inserting notifications inside the same RPC transaction as the state change — that is the correct pattern, and it is the fix template for every other module's notification gaps.
2. **Audit attribution is inconsistent.** Some RPCs (Module 4 freeze, Module 6 approvals, Module 10 profile edits) write full immutable audit entries with actor attribution; others (Module 1 flag toggles, Module 3 cost rates, Module 5 replies, Module 9 alerts, Module 11 manual adjustments) only have a timestamp or no audit at all.
3. **Role-gating is UI-only in several HQ-internal modules** (1, 3, 4, 11) — the React `!isStaff` check has no RLS-level enforcement behind it, meaning an HQ_STAFF account could call the underlying RPC directly and bypass the intended HQ_OWNER-only restriction.
4. **Tenants have zero appeal/escalation channel** for any HQ-initiated adverse action (suspension, storage freeze, alert, cost-rate change) — this recurs across Modules 4, 6, 8, 9 as the same structural gap: HQ can act unilaterally on a tenant with no built-in path for the tenant to contest the action before or after it lands.
5. **Module 2 (Staff Role & Permission Governance) is the single largest structural hole** in the Phase 1 set — its absence means there is no enforced, auditable boundary controlling who gets HQ_STAFF or tenant-staff privileges at all; every other module's role-based gating rests on a foundation (`user_role_assignments`/`permission_matrices`) that exists but was never actually wired into Phase 1 governance or enforced at runtime.

## RISK-LEVEL ROLL-UP

- **Critical:** 2.1, 2.2, 2.3, 1.2, 3.2, 6.1, 11.1
- **High:** 1.1, 1.3, 1.4, 2.4, 2.5, 3.1, 3.3, 3.6, 4.3 (shared w/ 6.1), 5.1, 5.4, 5.5, 7.2, 8.1, 8.3, 9.1, 9.3, 10.1, 11.2, 11.3
- **Medium:** remainder
- **Low:** 1.x/7.3/10.4 minor documentation/UX items

## EXPLICIT NON-ACTION

Per "Do not implement immediately," **no fixes from this report have been implemented.** This document is a gap inventory only, intended to precede a separately authorized remediation phase.
