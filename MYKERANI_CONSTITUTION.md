MYKERANI – MASTER PROJECT CONSTITUTION V1.0

STATUS: LOCKED

VERSION: 1.0

==================================================
PROJECT IDENTITY

MYKERANI is an AI Financial Assistant Platform.

MYKERANI is NOT an Accounting Software.

MYKERANI is NOT an ERP.

MYKERANI is NOT a CRM.

MYKERANI is NOT an HR System.

MYKERANI exists to help individuals and businesses manage finances through natural conversations, voice, receipts, financial documents and AI assistance without requiring accounting knowledge.

Every architecture decision, database design, workflow, API, AI implementation and feature proposal must follow this constitution.

==================================================
CORE PRODUCT RULE

MYKERANI IS 100% FINANCIAL ONLY.

Included:

- Income
- Expenses
- Debt
- Receivables
- Payables
- Cash
- Bank Accounts
- Financial Commitments
- Financial Documents
- Cashflow
- Financial Reports
- Financial Health
- Financial Recovery
- Financial Analysis
- Budget Monitoring
- Financial Alerts
- Audit Trail
- Backup
- AI Financial Assistant

Excluded:

- HR
- Payroll
- Attendance
- CRM
- POS
- Inventory Management
- Marketing
- Recruitment
- Project Management
- Manufacturing
- Production Management
- Logistics Management
- Customer Support Systems
- Team Collaboration Systems

Any feature outside financial scope must be rejected unless approved for a future version.

==================================================
VISION

To become the easiest financial management platform for ordinary people, SMEs and business owners.

The system must transform complex financial activities into simple conversations.

Users should manage finances without understanding accounting terminology.

The experience should feel like talking to a trusted financial assistant.

==================================================
PRODUCT PRINCIPLE

Users speak naturally.

Users upload receipts.

Users upload financial documents.

Users ask questions.

AI analyzes.

AI suggests.

Users confirm.

AI learns.

AI must never silently modify financial records.

AI must never act without confirmation.

AI must always explain recommendations.

==================================================
MULTI TENANT RULE

MYKERANI is a multi-tenant SaaS platform.

Every tenant must be isolated.

Every company owns its own financial records.

No tenant may access another tenant's information.

Isolation is mandatory at:

- Database Level
- API Level
- Authentication Level
- Authorization Level
- Storage Level

Frontend filtering is not security.

Backend validation is mandatory.

==================================================
TECHNOLOGY STACK

Development:
Replit

Source Control:
GitHub

Backend:
Supabase

Database:
PostgreSQL

Authentication:
Supabase Auth

Architecture:
Modular

Storage:
BYOS + HQ Managed Storage

All architecture must support V1, V2, V3 and V10 expansion without redesigning core financial systems.

==================================================
ARCHITECTURE PRINCIPLE

Architecture must be modular.

Modules must be independent.

Modules communicate through controlled APIs.

Business logic belongs in backend services.

Core modules must not depend on UI.

Future modules must be attachable without modifying core financial architecture.

Tight coupling between modules is prohibited.

==================================================
DATABASE RULE

PostgreSQL is the single source of truth.

Financial records must always exist in the database.

No financial data may exist only inside AI memory.

No financial decision may rely solely on AI memory.

Database records always override AI assumptions.

Database must support:

- Multi Tenant
- Multi Workspace
- Audit Trails
- Version History
- Reporting
- Recovery
- Scalability

==================================================
FINANCIAL DATA RULE

Financial records are immutable.

Historical records must never be silently overwritten.

Every modification must create:

- Audit Record
- Change Record
- Timestamp
- User Record

Hard delete is prohibited.

Soft delete and archival methods must be used.

Original records must remain recoverable.

==================================================
AI RULE

AI is an assistant.

AI is not an authority.

AI may:

- Analyze
- Recommend
- Categorize
- Explain
- Predict
- Summarize
- Detect Anomalies
- Generate Reports

AI may not:

- Approve Transactions
- Confirm Transactions
- Delete Records
- Modify Records Automatically
- Execute Payments
- Change Balances

without explicit user confirmation.

==================================================
AI SAFETY RULE

AI recommendations must be explainable.

AI decisions must be traceable.

Users must be able to reject recommendations.

AI confidence scoring should be supported.

Uncertain recommendations must request verification.

==================================================
APPROVAL RULE

AI may suggest.

AI may analyze.

AI may predict.

AI may recommend.

AI may not approve.

AI may not confirm.

AI may not execute financial actions.

User confirmation is mandatory before any financial record is finalized.

==================================================
STORAGE PRINCIPLE

Support:

1. Bring Your Own Storage (BYOS)

Supported:

- Google Drive
- OneDrive
- Dropbox

Future storage providers must be supported through connectors.

2. HQ Managed Storage

Controlled by HQ.

Pricing must never be hardcoded.

Storage quotas must never be hardcoded.

==================================================
FILE OWNERSHIP RULE

Users own uploaded files.

MYKERANI owns:

- Financial Intelligence
- Metadata
- Audit Logs
- Reports
- Analytics

Users remain responsible for externally stored files.

If users delete external files:

- Financial Records remain
- Metadata remains
- Audit Trail remains

The original file becomes unavailable.

==================================================
DOCUMENT MANAGEMENT RULE

Supported:

- Receipts
- Invoices
- Statements
- Bills
- Financial Agreements
- Supporting Documents

Every document must support:

- Upload Date
- Uploaded By
- Processing Status
- Version History
- Audit History

==================================================
OCR RULE

OCR must be measurable.

OCR costs must be trackable.

OCR confidence must be stored.

OCR output must never become a confirmed transaction without user approval.

==================================================
AUDIT TRAIL RULE

Every action must be logged.

Capture:

- User
- Action
- Timestamp
- Device
- IP Address
- Before Value
- After Value

Audit logs must be tamper resistant.

Audit logs must never be permanently deleted.

==================================================
SECURITY RULE

Mandatory:

- RBAC
- Permission Controls
- Encryption At Rest
- Encryption In Transit
- API Validation
- Session Controls
- Login Monitoring
- Suspicious Activity Detection

Frontend validation alone is prohibited.

==================================================
HQ PRINCIPLE

HQ must monitor:

- Users
- Companies
- Revenue
- Subscriptions
- AI Cost
- OCR Cost
- Storage Cost
- Infrastructure Cost
- Profit Per User
- Profit Per Company
- Usage
- Billing
- Feature Requests
- Support Requests

Profitability protection is mandatory.

==================================================
HQ GOVERNANCE RULE

HQ retains ultimate platform control.

HQ may:

- Suspend Accounts
- Restrict Usage
- Disable Features
- Adjust Quotas
- Archive Accounts

All governance actions must be audited.

==================================================
COST CONTROL RULE

Every cost-generating resource must be measurable.

Including:

- AI Usage
- OCR Usage
- Storage Usage
- API Usage
- Processing Usage

HQ must calculate:

- Cost Per User
- Cost Per Company
- Cost Per Feature
- Cost Per AI Request
- Cost Per OCR Request

Features that cannot be measured must not be implemented.

==================================================
CONFIGURATION RULE

Business rules must never be hardcoded.

Including:

- Pricing
- Plans
- Quotas
- Limits
- AI Allocations
- OCR Allocations
- Storage Allocations
- Feature Access
- Notification Rules

All business rules must be configurable through HQ settings.

==================================================
SUBSCRIPTION RULE

Plans must be configurable.

Pricing must never be hardcoded.

Quotas must never be hardcoded.

Future pricing changes must not require code modifications.

==================================================
BACKUP RULE

All financial data must be recoverable.

Support:

- Backup
- Restore
- Export
- Migration

Users must never be locked into MYKERANI.

Recovery procedures must be documented.

==================================================
FINANCIAL COMPLIANCE RULE

MYKERANI is not an accounting software.

However, financial records, reports and audit trails must support:

- Accountant Review
- Tax Preparation
- Financial Verification
- Financing Applications
- Audit Readiness

Reports must be understandable by financial professionals.

==================================================
REPORTING RULE

Reports must be generated from stored data.

Reports may include:

- Income
- Expenses
- Cashflow
- Debt
- Receivables
- Commitments
- Financial Health
- Trends

Reports must be explainable.

==================================================
API RULE

All APIs must validate:

- Authentication
- Authorization
- Tenant Ownership
- Permissions

No API may expose another tenant's data.

==================================================
DEVELOPMENT RULE

This is a REAL production system.

No demos.

No fake workflows.

No placeholder logic.

No sample business logic.

No assumptions.

No architecture changes without approval.

Build order:

Foundation
→ Database
→ Security
→ API
→ Modules
→ UAT
→ Production

UI must never start before architecture approval.

==================================================
AI DEVELOPMENT RULE

Before writing code:

1. Architecture Design
2. Database Design
3. Security Design
4. Workflow Design
5. Risk Assessment

Wait for approval.

Proceed phase by phase only.

==================================================
VERSIONING RULE

Every design must support:

- V1
- V2
- V3
- V10

Future expansion must not require redesigning core financial modules.

==================================================
DECISION RULE

Before building any feature:

Ask:

Does this directly help users manage finances?

If NO:
Reject.

If MAYBE:
Evaluate carefully.

If YES:
Proceed.

Protect:

- Simplicity
- Scalability
- Security
- Profitability
- Maintainability
- Long-Term Architecture

==================================================
GOLDEN RULE

MYKERANI exists to help users manage finances simply.

Not to become an accounting system.

Not to become an ERP.

Not to become a CRM.

Not to become an HR system.

Every feature must move users closer to:

- Financial Clarity
- Financial Control
- Financial Improvement

Anything else must be rejected.
