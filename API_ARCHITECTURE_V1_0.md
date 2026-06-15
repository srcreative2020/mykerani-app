# MYKERANI API Architecture V1.0

This document specifies the complete API architecture for **MYKERANI (AI Financial Assistant)**, establishing secure backend contracts and protocol guidelines based on the locked Database Schema V1.2 and the locked Module Architecture V1.0.

---

## Global Architectural Constraints & Standards

### 1. Protocol & Transport
* **Protocol**: HTTPS only. TLS 1.3 enforced.
* **Payload Format**: JSON.
* **Base URL Design**:
  * Tenant APIs: `https://api.mykerani.com/v1`
  * HQ Control APIs: `https://hq.mykerani.com/v1`
* **Default Currency**: **MYR** (Malaysian Ringgit) used implicitly in all financial numeric payloads.
* **Decimal Precision**: Represented in JSON payloads using strings (`"MYR 125000.5000"` or numerical strings `"125000.5000"`) to completely prevent floating-point representation drift in clients.

### 2. Multi-Tenant Headers
To guarantee row-level and structural tenant isolation at the API gateway layer, every request targeting workspace or tenant resources must validate the following HTTP headers matching token claims:
* `Authorization`: `Bearer <JWT_TOKEN>` (Claims: `sub` (user_id), `tenant_id`, `role`)
* `X-Workspace-Id`: `UUID` (Target workspace)

---

## 1. Authentication APIs

### Purpose
Authenticates users via Supabase Auth integration, provisions session tokens (JWTs), maps permissions structure, and handles account recovery.

### Request Flow
1. Client issues a credentials package (email/password or OAuth callback token) to the authentication server hook.
2. The endpoint verifies credentials with Supabase Auth providers.
3. Upon success, retrieves the user's mapped `tenant_id` and assigned organizational role from the metadata dictionary.

### Response Flow
Returns a signed, short-lived JWT containing essential tenant scope parameters, an encrypted refresh token, and user profile metadata (first name, assigned workspaces list).

### Security Requirements
* Direct TLS integration.
* JWT signature verified using HS256/RS256 cryptography.
* Storage of refresh tokens within secure, `HttpOnly`, `SameSite=Strict` cookies to block XSS vector exposures.

### Permissions
* **Unauthenticated / Public**: Login, Registration, Password Reset Requests.
* **Authenticated**: Token refresh, Logout, Session Terminations.

### Rate Limits
* `POST /auth/login` & `/auth/register`: Max 5 requests per minute per IP address.
* `POST /auth/password-reset`: Max 2 requests per hour per user account.

---

## 2. Tenant APIs

### Purpose
Governs subscription organization details, profiles legal addresses and fiscal details, and handles teammate membership records.

### Request Flow
1. Client issues organization metadata changes with standard tenant validation headers.
2. The controller asserts the authenticated user is an administrator of the requested tenant ID.
3. Updates the active tenant profile state.

### Response Flow
Returns the updated tenant object including company name, tax registration credentials, membership numbers, and subscription references.

### Security Requirements
* Tenant-ID checking verified at routing layer. No cross-tenant configuration updates allowed even under active administrator requests.

### Permissions
* **Tenant Admin Role Only**: Read, Update profile settings, Invite teammates, Revoke active accounts.
* **Collaborator Role**: Read-only access to tenant metadata.

### Rate Limits
* `PATCH /tenant`: Max 30 requests per minute per tenant.
* `POST /tenant/members`: Max 10 requests per minute.

---

## 3. Workspace APIs

### Purpose
Allows tenants to create and isolate financial compartments ("Personal", "Company A", etc.) to restrict data scoping.

### Request Flow
1. Client submits a request to instantiate a new workspace containing a friendly name and slug.
2. The system checks total workspace allowances allowed under the tenant’s subscription plan.
3. Initializes standard general ledger accounts within the workspace schema boundaries.

### Response Flow
Returns the new Workspace profile including the locked UUID, current initialization status, and allocated resource wallet indices.

### Security Requirements
* Path parameter or target header workspace checks. Attempts to mutate context outside the tenant’s allocated boundary trigger immediate gateway blocks.

### Permissions
* **Tenant Admin**: Full CRUD capabilities on workspaces.
* **Collaborator**: Select and view active workspaces list.

### Rate Limits
* `POST /workspaces`: Max 3 requests per minute per tenant.
* `GET /workspaces`: Max 100 requests per minute.

---

## 4. Financial Record APIs

### Purpose
CRUD endpoints handling primary bookkeeping ledgers (Income, Expenses, Receivables, Payables, Debts, Cash registers, Bank records, and Recurring commitments).

### Request Flow
1. Client submits transaction payload containing precise monetary values, date patterns, target general ledger code reference, and source bank/cash identification tags.
2. The gateway validates that ledger codes, bank accounts, and cash keys belong exclusively to the active `X-Workspace-Id`.
3. If an input matches pattern thresholds, updates physical balances across caches to track liquidity.

### Response Flow
Returns the newly created or updated financial entity, accompanied by current snapshot logs.

### Security Requirements
* Every modification logs an automatic payload string hash to the immutable record tracker. No physical updates can execute without passing schema-layer triggers.

### Permissions
* **Tenant Admin & Collaborator (Recorder)**: Complete CRUD (Create, Read, Update, Delete) execution on financial entries.
* **Read-only Auditor**: View financial items. Absolutely forbidden from writing, adjusting, or archiving records.

### Rate Limits
* `POST/PATCH/DELETE /financial/*`: Max 120 requests per minute per workspace.
* `GET /financial/*`: Max 300 requests per minute.

---

## 5. Financial Evidence APIs (Financial Evidence Package)

### Purpose
Manages physical financial proof records (receipt, invoice, billing PDFs/images) by matching uploaded artifacts to registered ledger records.

### Request Flow
1. Client generates a secure pre-signed post payload to upload raw documents directly into tenant-specific Supabase Storage buckets.
2. After uploading, client pings the evidence endpoint with files pointers, size, and document types.
3. Initiates a background OCR extraction task using server-side Gemini models to catalog transaction data if auto-extraction is selected.

### Response Flow
Returns the evidence document ID, upload confirmation logs, matching confidence ratings, and initial parsed parameter drafts.

### Security Requirements
* Storage upload paths contain isolated UUID markers (`buckets/tenants/<tenant_id>/workspaces/<workspace_id>/`).
* Files restricted to standard secure mimetypes (`application/pdf`, `image/jpeg`, `image/png`). Max file size capped at 15MB.

### Permissions
* **Tenant Admin / Collaborator**: Full file upload, update, and mapping operations.
* **Auditor**: Download and review evidence files. Forbidden from uploading or processing deletions.

### Rate Limits
* `GET /evidence/upload-url`: Max 15 requests per minute per user.
* `POST /evidence/bind`: Max 50 requests per minute per workspace.

---

## 6. AI Assistant APIs

### Purpose
Exposes conversational interface hooks, prompt management nodes, context learning configurations, and real-time strategic intelligence loops.

### Request Flow
1. Client posts an interactive prompt question under the active workspace header (e.g., "Estimate our average cash burn over Company A").
2. The server compiles prompt contextual parameters, injecting localized ledger aggregates, upcoming commitments, and workspace memory structures.
3. Forwards queries to server-side Gemini models backed by secure system parameters inside the cloud container.

### Response Flow
Renders real-time server-sent event (SSE) streams transmitting compiled answers, recommended general ledger edits, or tactical workspace anomaly corrections.

### Security Requirements
* Strict system system guides blocking model prompts leak or extraction beyond the target workspace database.
* The API key must never expose to the client browser (remains strictly server-side).

### Permissions
* **Tenant Admin / Collaborator**: Trigger prompts, configure learning aliases, dismiss anomaly lists.
* **Auditor**: None (strictly blocked from executing conversational AI features to maintain data security policies).

### Rate Limits
* `POST /ai/chat`: Max 10 requests per minute per user account.
* `POST /ai/learned-rules`: Max 20 requests per minute.

---

## 7. Resource Wallet APIs

### Purpose
Monitors and regulates remaining credit caps (AI tokens, OCR, Storage space, Notification blocks) to maintain consistent system cost ratios.

### Request Flow
1. Client requests status parameters indicating local resource usage bounds.
2. The system queries active workspace database wallets.
3. Automatically triggers payment warnings if wallets approach zero limits.

### Response Flow
Returns a detailed resource consumption map (e.g., `"ai_credits_used": 14500`, `"ai_credits_limit": 50000`, `"storage_bytes_used": 45010200`).

### Security Requirements
* Read-only metrics exposed to users. Mutators affecting parameters can only be authorized internally by HQ.

### Permissions
* **Tenant Admin / Collaborator**: Read-only access to usage profiles.

### Rate Limits
* `GET /wallet/status`: Max 30 requests per minute per workspace.

---

## 8. Subscription APIs

### Purpose
Manages paid tier selections, retrieves public pricing modules, and handles billing account operations.

### Request Flow
1. Tenant admin updates their system tier bracket (e.g., requesting Venture Tier subscription).
2. The system triggers Stripe portal setup payloads to register active payment tokens.
3. Updates the local subscription status fields.

### Response Flow
Provides target billing redirect URLs, invoices list arrays, and updated subscription state records.

### Security Requirements
* Payment handlers strictly offloaded to PCI-compliant external endpoints. Local databases only store plan ids, subscription status, and billing cycle dates.

### Permissions
* **Tenant Admin Only**: Configure, upgrade, downgrade, or cancel plans.

### Rate Limits
* `POST /subscription/checkout`: Max 5 requests per minute per tenant.
* `GET /subscription/billing-portal`: Max 10 requests per minute.

---

## 9. Notification APIs

### Purpose
Dispatches system warnings, pending commitment reminders, anomaly detection alerts, and scheduled fiscal digest triggers.

### Request Flow
1. Internal workspace daemons notice upcoming large ledger due triggers.
2. Generates targeted alerts, writing them to active notification queues.
3. Pushes active indices via WebSockets or real-time polling to target instances.

### Response Flow
Lists unread alert components, priority codes, related ledger entities, and read/unread updates.

### Security Requirements
* Direct user ownership validation. Message content is completely restricted to the active tenant ID.

### Permissions
* **Tenant Admin / Collaborator**: Full notification reading, updating, and preference toggles.

### Rate Limits
* `GET /notifications`: Max 60 requests per minute.
* `PATCH /notifications/read`: Max 120 requests per minute.

---

## 10. Reporting APIs

### Purpose
Generates high-performance aggregates representing operating profitability, burn cycles, balance sheets, and real-time cash forecasting.

### Request Flow
1. Client submits filtering configurations (date ranges, target ledger divisions, preview parameters).
2. The platform processes high-velocity database operations across ledger accounts.
3. Runs predictive forecasting modules if interactive cash runways visualization options are chosen.

### Response Flow
Provides compiled numeric tables, cash trend vectors, and dynamic forecast coordinates ideal for direct charting by D3 or Recharts widgets.

### Security Requirements
* Extensive query parameter sanitization checks. Absolutely no raw SQL execution passes outside optimized parameterized database scopes to protect against injection.

### Permissions
* **Tenant Admin / Collaborator / Auditor**: Full access to visual and compiled reports.

### Rate Limits
* `GET /reports/*`: Max 45 requests per minute per workspace.

---

## 11. Audit APIs

### Purpose
Exposes transaction change history lists and runs systemic validation passes to verify database hash chain integrity.

### Request Flow
1. Client opens the workspace security portal and requests history maps.
2. Server queries the immutable log tables corresponding to the targeted entity ID.
3. If requested, triggers a manual audit-chain check parsing all parent blocks in sequence.

### Response Flow
Details modification actors, previous state payloads, updated row parameters, timestamp records, and verified validation tags.

### Security Requirements
* Strictly read-only endpoints. The audit ledger is completely write-protected at the database schema trigger layer and cannot be bypassed.

### Permissions
* **Tenant Admin & Auditor**: Access to visual timelines and integrity scanners.
* **Collaborator (Recorder)**: No access to overall workspace security configuration.

### Rate Limits
* `GET /audit/verify`: Max 3 requests per hour per workspace.
* `GET /audit/history/*`: Max 60 requests per minute.

---

## 12. HQ APIs

### Purpose
Provides administrative interfaces for platforms operators allowing base tier changes, live margin auditing, and service cost reviews.

### Request Flow
1. HQ supervisor signs in using secure HQ-level administrator authentication.
2. Gateway checks for absolute 'HQ' categorizations inside the primary token scope.
3. Coordinates system management actions (adjusting cloud base parameters or viewing active global consumption trends).

### Response Flow
Provides aggregate system charts, active subscriber analytics, server load updates, and physical operational cost indexes.

### Security Requirements
* Complete network-level routing constraints. HQ APIs are served on separate secure subdomains, requiring specialized administrative JWT security parameters to access.

### Permissions
* **HQ Administrative Staff Only**: Complete reading and adjustment permissions across system-level parameters.

### Rate Limits
* `GET /hq/metrics`: Max 60 requests per minute.
* `PATCH /hq/costs`: Max 10 requests per minute.
