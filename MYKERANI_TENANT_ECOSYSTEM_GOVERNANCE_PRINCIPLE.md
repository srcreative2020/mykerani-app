# MyKerani — Tenant Ecosystem Governance Principle

> STATUS: LOCKED, V1.0

MYKERANI Tenant is a connected financial ecosystem.

Tenant Owner and Tenant Staff must operate as one connected operational
environment.

No isolated workflow is allowed.
No isolated permission is allowed.
No isolated financial record is allowed.

This document governs *tenant-internal* (Owner ↔ Staff) connectedness. It
is distinct from and additional to:

- `MYKERANI_OWNER_STAFF_PARITY_RULE.md` — governs the financial **engines**
  (OCR, AI transaction processing, voice notes, mapping, evidence linking,
  import recovery, learning memory, duplicate detection, ledger
  processing) that Owner and Staff must share without duplication.
- `MYKERANI_ECOSYSTEM_GOVERNANCE_PRINCIPLE.md` — governs the HQ-wide
  closed-loop rule (Action → Validation → Approval → Resource Change →
  Billing Change → Wallet Change → Notification → Audit → Analytics →
  Reporting) for HQ/commercial-layer mutations.

This document governs the tenant-side equivalent: every Owner↔Staff
interaction inside a single tenant workspace.

---

## Tenant Ecosystem Rule

Every Tenant action must have a connected operational impact.

- Every Owner action must be reflected where required.
- Every Staff action must be visible where required.

The objective is operational continuity.

---

## Owner → Staff Rule

If Tenant Owner performs an action, verify:

- Which Staff are affected
- What changes
- What Staff can see
- What Staff can do
- Permission impact
- Workspace impact
- Notification generated
- Audit generated
- Financial impact
- Workflow impact

**If Owner changes Staff state but Staff cannot understand the result: FAIL.**

---

## Staff → Owner Rule

If Tenant Staff performs an action, verify:

- Owner visibility
- Owner notification
- Owner audit visibility
- Owner operational control
- Approval requirement
- Financial impact
- AI usage
- OCR usage
- Storage usage
- Resource usage

**If Staff performs an important action but Owner cannot monitor or manage
it: FAIL.**

---

## Master Data Rule

Every customer, workspace, company and user identity must have one
authoritative master record. All modules must read and update the same
master data, including:

- Tenant Profile
- HQ Customer List
- Customer 360
- Billing
- Support
- Approval Center
- Reports
- Notifications
- Audit

**If the same information appears differently across modules: FAIL.**

---

## Financial Governance Rule

Verify operational impact on:

- Income
- Expenses
- Receivables
- Payables
- Cash
- Bank Accounts
- Financial Commitments
- Financial Documents
- Budget
- Reports

**If financial records become inconsistent between Owner and Staff: FAIL.**

---

## Resource Governance Rule

Verify:

- AI Credits
- OCR Credits
- Storage
- Upload limits
- Resource Wallet

Owner must always be able to monitor resource consumption by Staff.

---

## Workspace Rule

Verify:

- Workspace membership
- Workspace permissions
- Workspace visibility
- Workspace switching
- Workspace ownership

No orphan workspace is permitted.

---

## Notification Rule

Every important workflow must generate appropriate notifications. Examples:

- Staff creates transaction
- Staff edits transaction
- Staff deletes transaction
- Staff uploads receipt
- Staff uploads invoice
- Staff imports bank statement
- Staff submits support ticket
- Owner changes permissions
- Owner suspends Staff
- Owner reactivates Staff

**If a workflow changes operational state without notification: FAIL.**

---

## Audit Rule

Every important action must record:

- Actor
- Role
- Workspace
- Date & Time
- Action
- Previous Value
- New Value
- Source

**If no complete audit exists: FAIL.**

---

## Approval Rule

Where approval is required:

```
Staff Action
  ↓
Owner Review
  ↓
Approval / Rejection
  ↓
Notification
  ↓
Audit
  ↓
Completion
```

No approval workflow may bypass Owner where governance requires approval.

---

## Attachment Rule

Documents uploaded by Staff or Owner must preserve:

- Uploader
- Upload Time
- File Type
- File Size
- Preview
- Download
- Audit Reference

---

## Owner / Staff Parity Rule

Every tenant workflow must be verified for:

- Tenant Owner
- Tenant Staff

Any operational difference must be intentional, documented and approved.

---

## Closed Loop Rule

Every workflow must complete the full lifecycle:

```
Action
  → Visibility
  → Notification
  → Audit
  → Response
  → Resolution
```

**If any stage is missing: FAIL.**

---

## Implementation Rule

No feature may be marked COMPLETE merely because:

- The page exists
- The UI works
- The API works
- The database works

A feature is COMPLETE only when the complete Tenant ecosystem remains
connected and operational.

---

## Golden Rule

Tenant Owner manages the business. Tenant Staff operates the business.

MYKERANI must ensure both operate as one connected financial ecosystem
with complete visibility, governance, accountability and operational
continuity.
