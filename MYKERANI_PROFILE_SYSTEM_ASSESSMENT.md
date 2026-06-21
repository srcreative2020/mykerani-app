# MyKerani — Profile System Executive Assessment

**Focus:** Does the current profile structure (Personal, Business, Branches, Vehicles, Dependents) give the AI enough information to classify transactions accurately?
**Method:** Code trace only (`src/lib/profileData.ts` schema, `server.ts` system-prompt construction, all 4 chat call sites: `AIFinancialAssistant.tsx`, `OwnerDashboard.tsx`, `StaffHomeScreen.tsx`, `FinancialRecordsConsole.tsx`). Not a code-quality review — purely "is the data sufficient and is it reaching the AI."
**File path:** `/home/user/mykerani-app/MYKERANI_PROFILE_SYSTEM_ASSESSMENT.md`

---

## What data exists today (schema, `src/lib/profileData.ts`)

| Profile | Fields |
|---|---|
| Personal Profile | fullName, dateOfBirth, maritalStatus, occupation, monthlyIncomeMyr, dependentsCount, notes |
| Business Profile (legacy single) | industry, branchName, businessType, registrationNo, notes |
| Business (multi, current) | businessName, industry, businessType, registrationNo, notes, isActive |
| Business Branch | branchName, location, businessId, isActive |
| Vehicle | name, plateNumber, vehicleType, ownership (PERSONAL/BUSINESS), isActive |
| Dependent | name, relationship, dateOfBirth |

## Whether the AI actually receives it (this matters more than the schema — a field unsent to the LLM is useless regardless of how rich it is)

Four chat surfaces call `/api/ai/assistant`, and **each sends a different subset**:

| Call site | Sends Profile data? |
|---|---|
| `OwnerDashboard.tsx:1174` (main owner chat) | `personalProfile, businesses, vehicles, dependents` — no `businessProfile`, no branches |
| `StaffHomeScreen.tsx:364` (main staff chat) | `personalProfile, businessProfile, vehicles, dependents` — singular legacy profile, no `businesses` array, no branches |
| `AIFinancialAssistant.tsx:153-163` (Q&A/analytics assistant) | **None of the 5 profile categories at all** — only financial records/accounts/OCR patterns |
| `OwnerDashboard.tsx:1600` / `StaffHomeScreen.tsx:339` (support chat) | **None** — by design, support tickets don't need it |

`server.ts:862` reads `financialContext?.businesses || financialContext?.businessProfile` as a fallback chain, so whichever one a given screen sends still reaches the prompt — but **Business Branches (`business_branches` table) are never sent by any call site**, in any screen. The data is collected and stored (`loadBusinessBranches()` exists and is called from the profile-management UI) but it has no path into the AI's context at all.

---

## 1. What profile information is currently useful for AI?

Useful = has either (a) an explicit classification rule referencing it, or (b) is at least present in the prompt as raw context the model can read.

- **Vehicles** — highest-value field of the entire Profile System. `server.ts:874` gives it a dedicated disambiguation rule: if 2+ vehicles exist and a transaction mentions petrol/toll/parking/service/repair/road tax/insurance without naming which vehicle, the AI is told to stop and ask rather than guess, then use the named vehicle's `ownership` (PERSONAL/BUSINESS) to decide EXPENSE vs. personal/owner-drawing. This directly prevents misclassification on a real, common transaction type.
- **Dependents** — second dedicated rule (`server.ts:875`): name/relationship matching lets the AI recognize phrases like "yuran sekolah Aiman" or "emak bagi RM200" and set `relatedParty` accordingly.
- **Personal Profile / Business Profile / Businesses** — present in the prompt (sections 8–9) and inform "general world knowledge" context, but have **no dedicated classification rule**. They function as passive background the LLM may use implicitly (e.g. knowing `occupation` or `industry` could nudge a vague expense's category) but this is never instructed or guaranteed — it's inference, not a coded rule like Vehicles/Dependents get.

## 2. What profile information is never used?

- **Business Branches** — entirely absent from every chat call site's `financialContext`. Stored, manageable in the UI, never reaches the AI. Zero classification value today regardless of how many branches a tenant configures.
- **`monthlyIncomeMyr`** — sent (inside `personalProfile`) but never referenced by any classification rule; a transaction's amount is never sanity-checked against stated income for plausibility/anomaly flagging.
- **`maritalStatus`, `dateOfBirth`, `occupation`** (Personal) — sent but rule-less; no transaction-classification logic branches on them.
- **`registrationNo`** (Business/Businesses) — sent but has no classification use (it's a compliance/identity field, not a categorization signal — arguably correctly inert).
- **`notes`** (Personal and Business) — free text, sent as-is, but no rule tells the AI to look for classification hints inside it; relies entirely on the LLM noticing relevant content unprompted.

## 3. What profile information is missing?

Gaps that block classification accuracy for cases the current 5 categories cannot cover, given what real transactions need (vendor, purpose, owner) to classify correctly:

- **No "typical recurring vendors/categories per business" seed** — e.g. a kedai runcit owner's known suppliers, a workshop's common parts vendors. (This gap is what the Knowledge Bank / OCR Learned Patterns partially cover instead — but those build up only from transaction history, not from profile setup.)
- **No multi-business transaction-owner default** — when a tenant has 2+ active `businesses` (plural) and a transaction doesn't name which business it belongs to, there is no profile field analogous to Vehicle's `ownership` to disambiguate which business a generic expense belongs to. The vehicle-ownership pattern (a proven, working disambiguation mechanism) has no equivalent at the business level.
- **No branch-level location/cost-center tagging on transactions** — even if branches were sent to the AI, there's no field on a transaction itself to say "this branch's expense," so even fixing the branches-not-sent gap (§2) wouldn't fully connect branches to classification without a transaction-side field too.
- **No dependent-to-business linkage for staff dependents vs. owner dependents** — `Dependent` has no `businessId`/ownership-style field, only a flat per-workspace list, so the dependent-matching rule (§1) cannot distinguish "this is the owner's child" from "this is staff member X's child" in a multi-user workspace.
- **No vendor/expense category defaults derived from `industry`/`businessType`** — these fields exist and are sent, but nothing maps "industry: F&B" → typical expense categories (raw materials, utilities, rental) the way Vehicles' `ownership` maps directly to EXPENSE vs DRAWING.

## 4. What additional profile data would significantly improve transaction classification?

Ranked by expected classification-accuracy impact, given the proven pattern that *dedicated rules* (Vehicles, Dependents) outperform *passive context* (Personal/Business Profile):

1. **A `businessId`/owner-tag on every transaction, paired with a Vehicle-style disambiguation rule** for tenants with 2+ active `businesses` — directly closes the largest gap (§3), mirroring the mechanism already proven to work for vehicles.
2. **Wiring `business_branches` into the chat context at all** (currently zero exposure) — even without new fields, simply sending what's already collected would let branch-aware tenants get branch-specific suggestions instead of none.
3. **An `industry`-to-category hint mapping** (e.g. F&B → raw materials/rental/utilities defaults) — would give the LLM a concrete rule to apply `industry`/`businessType` the same way it applies vehicle `ownership`, instead of leaving it to unguided inference.
4. **A `businessId` field on `Dependent`** to scope dependent-matching correctly in multi-user/multi-business workspaces, preventing a staff member's family-related transaction from being misattributed to the owner's family context.
5. **A lightweight `typicalVendors`/`typicalExpenseCategories` field on Business or Branch** — a one-time setup cost that would give brand-new tenants (zero `ocr_learned_patterns` yet) the same "recognized vendor" advantage the OCR Learning system only provides after 1+ confirmed transactions.

## 5. Which profile fields generate the highest AI value?

Ranked by proven, code-level classification impact (not potential — actual, instructed impact):

| Rank | Field | Why |
|---|---|---|
| 1 | `Vehicle.ownership` (PERSONAL/BUSINESS) | Only profile field with a complete, working disambiguate→classify rule that changes the AI's output (EXPENSE vs. drawing) and its behavior (ask vs. guess). |
| 2 | `Dependent.relationship` + `name` | Second complete, working rule — directly sets `relatedParty` from natural-language family references. |
| 3 | `Vehicle.vehicleType`/`name` | Supporting data for rule #1 — needed to list vehicle names in the clarifying question, but has no value without `ownership`. |
| 4 | `Business`/`businessProfile.industry`, `businessType` | Present, plausibly used as soft inference by the LLM, but unverified/unguaranteed — no instruction compels its use. |
| 5 (lowest, effectively zero) | `Business Branch` (all fields) | Never reaches the AI in any call path — currently zero contribution regardless of field richness. |
| 5 (tied, effectively zero) | `monthlyIncomeMyr`, `maritalStatus`, `dateOfBirth`, `occupation`, `registrationNo`, `notes` | Sent but rule-less; any influence is incidental LLM inference, not a designed mechanism. |

---

## Executive Summary

The Profile System's value to transaction classification is **concentrated in exactly two fields** — `Vehicle.ownership` and `Dependent.relationship` — both of which have dedicated, code-level disambiguation rules in the system prompt. Everything else in Personal Profile and Business Profile is *present but passive*: sent to the LLM as background JSON with no instruction telling it how to use the data for classification, so its actual effect on accuracy is unverified and inconsistent.

The single most concrete, highest-leverage fix is **extending the proven Vehicle-ownership pattern to multi-business tenants** — currently a tenant with 2+ active businesses has no equivalent mechanism to disambiguate which business a transaction belongs to, despite the underlying `Business` data already existing and being sent to the AI.

The single most concrete, lowest-effort fix is **wiring `business_branches` into the chat context** — the data is already collected and stored via a complete CRUD API (`loadBusinessBranches`/`addBusinessBranch`/`deleteBusinessBranch`), but literally never reaches any AI call, making it 100% inert for classification purposes today.

---

**Report metadata:** file path `/home/user/mykerani-app/MYKERANI_PROFILE_SYSTEM_ASSESSMENT.md`, verification method: direct code trace of `src/lib/profileData.ts` and all 4 `/api/ai/assistant` call sites cross-referenced against `server.ts` system-prompt construction (lines 841-891).
