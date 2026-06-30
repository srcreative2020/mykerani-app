/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// V1.0 Role Authority — only 4 roles
export type UserRole =
  | "HQ_OWNER"
  | "HQ_STAFF"
  | "TENANT_OWNER"
  | "TENANT_STAFF";

export type TenantCategory = "HQ" | "DEMO" | "USER";

export interface UserSessionProfile {
  id: string;
  email: string;
  role: UserRole;
  fullName?: string;
  tenantId?: string;
}

export type ModuleName =
  | "Financial Records"
  | "Financial Commitments"
  | "Financial Forecast"
  | "Financial Evidence Package"
  | "Notifications";

export interface ModulePermissions {
  create: boolean;
  read: boolean;
  update: boolean;
  delete: boolean;
}

export type RolePermissions = Record<ModuleName, ModulePermissions>;

export interface UserRoleAssignment {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  role: UserRole;
  tenantId: string;
  createdAt?: string;
  isSuspended?: boolean;
}

export interface AuthState {
  user: UserSessionProfile | null;
  loading: boolean;
  error: string | null;
  isMockUser: boolean;
}

export interface Tenant {
  id: string;
  name: string;
  category: TenantCategory;
  createdAt?: string;
}

export interface TenantState {
  tenants: Tenant[];
  activeTenant: Tenant | null;
  loading: boolean;
  error: string | null;
}

export interface Workspace {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  isActive: boolean;
  workspaceType?: string; // L-02: 'personal' | 'business' — set on create, never changed
  createdAt?: string;
}

export interface WorkspaceState {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  loading: boolean;
  error: string | null;
}

export type FinancialRecordType = "INCOME" | "EXPENSE" | "RECEIVABLE" | "PAYABLE" | "DEBT";

// Phase 2C — Cross-Source Duplicate Detection. Identifies which engine/flow
// originally created a financial record, so duplicate detection can scope
// itself to cross-source pairs (same-source duplicates are already blocked
// by existing partial unique indexes on reference_number, e.g. 'AI-%' /
// 'STMT-%'). Only ever set explicitly by a known caller; defaults to
// "MANUAL" when truly unknown (manual entry, or legacy rows backfilled at
// migration time) — never inferred from reference numbers/filenames/text.
export type SourceSystem = "OCR" | "BANK_STATEMENT" | "AI_CHAT" | "VOICE_NOTE" | "MANUAL";

export interface FinancialEvent {
  id: string;
  workspaceId: string;
  type: FinancialRecordType;
  categoryName: string;
  amountMyr: number;
  partyName: string;
  date: string;
  dueDate?: string;
  referenceNumber: string;
  description: string;
  cashAccountId?: string;
  bankAccountId?: string;
  isCompleted: boolean; // Paid/repaid status
  businessId?: string; // Which business this belongs to; undefined/null = Personal
  branchId?: string; // Which branch of that business this belongs to; undefined = unspecified/whole business
  createdByUserId?: string; // Who recorded this transaction (accounting trail)
  createdByName?: string;
  createdAt?: string; // When the record was actually entered (vs. transaction `date`)
  sourceSystem?: SourceSystem; // Phase 2C — which engine/flow created this record; defaults to "MANUAL" when absent.
}

export interface CashAccount {
  id: string;
  workspaceId: string;
  name: string;
  responsiblePerson: string;
  currentBalanceMyr: number;
}

export interface BankAccount {
  id: string;
  workspaceId: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  branchName: string;
  currentBalanceMyr: number;
}

export interface DebtRecord {
  id: string;
  workspaceId: string;
  creditorName: string;
  borrowedDate: string;
  repaymentDueDate?: string;
  totalAmountMyr: number;
  repaidAmountMyr: number;
  interestRateAnnualPercent?: number;
  status: "ACTIVE" | "FULLY_REPAID";
  description: string;
  businessId?: string; // Which business this belongs to; undefined/null = Personal
}

export interface FinancialCommitment {
  id: string;
  workspaceId: string;
  description: string; // Used also for Notes
  contractNumber?: string;
  obligeeName: string; // The supplier or party to pay
  amountPerIntervalMyr: number;
  recurrence: "DAILY" | "WEEKLY" | "MONTHLY" | "ONE-TIME" | "QUARTERLY" | "YEARLY";
  startDate: string; // This corresponds to the Due Date or Start Date
  endDate?: string;
  isActive: boolean;
  status: "ACTIVE" | "COMPLETED" | "PAUSED" | "PENDING";
  businessId?: string; // Which business this belongs to; undefined/null = Personal
}

export interface FinancialEvidencePackage {
  id: string;
  workspaceId: string;
  documentType: "RECEIPT" | "INVOICE" | "STATEMENT" | "SUPPORTING_DOC";
  uploadDate: string;
  fileName: string;
  fileUrl: string;
  relatedRecordType?: string; // 'INCOME' | 'EXPENSE' | 'RECEIVABLE' | 'PAYABLE' | 'DEBT' | 'COMMITMENT'
  relatedRecordId?: string;
  notes?: string;
  uploadedBy?: string;
  fileSizeBytes?: number;
}

export interface OcrLearnedPattern {
  id: string;
  workspaceId: string;
  vendorName: string;
  category: string;
  recordType: "INCOME" | "EXPENSE" | "RECEIVABLE" | "PAYABLE" | "DEBT";
  confidenceScore: number;
  occurrenceCount: number;
  lastUpdated: string;
  // Phase 2B — Learning Memory Engine hierarchy. All optional/additive:
  // absent/undefined business/branch means a workspace-wide (tier-3) pattern,
  // identical to pre-Phase-2B behavior.
  patternType?: "VENDOR_CATEGORY";
  businessId?: string | null;
  branchId?: string | null;
  metadata?: Record<string, unknown>;
  isActive?: boolean;
}


// Phase 2C — Cross-Source Duplicate Detection Review Queue.
//
// `classification` is the field a human reviewer (Owner or Staff — same
// engine, same table, no role split) can set via explicit action.
// CONFIRMED_DUPLICATE / REVIEWED_NOT_DUPLICATE are ONLY ever written by a
// user clicking a review button — the detection engine itself only ever
// *suggests* UNIQUE / POSSIBLE_DUPLICATE / LIKELY_DUPLICATE (see
// `duplicateDetectionEngine.ts`'s `suggestedClassification`); it never
// writes CONFIRMED_DUPLICATE/REVIEWED_NOT_DUPLICATE directly.
export type DuplicateClassification =
  | "UNIQUE"
  | "POSSIBLE_DUPLICATE"
  | "LIKELY_DUPLICATE"
  | "CONFIRMED_DUPLICATE"
  | "REVIEWED_NOT_DUPLICATE";

export interface DuplicateFlag {
  id: string;
  workspaceId: string;
  recordAType: FinancialRecordType;
  recordAId: string;
  recordBType: FinancialRecordType;
  recordBId: string;
  score: number; // 0..1, engine-computed weighted similarity score
  classification: DuplicateClassification;
  factorBreakdown: Record<string, number>; // per-factor scores (amount/date/description/referenceNumber/business/branch)
  reviewedByUserId?: string;
  reviewedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  userEmail: string;
  userRole: UserRole;
  tenantId: string;
  workspaceId?: string;
  module: "Financial Records" | "Financial Commitments" | "Financial Evidence Package" | "OCR Learning" | "Backup & Recovery" | "Storage Provider" | "Notifications" | "Debt Records" | "Workspace";
  action: "CREATE" | "UPDATE" | "DELETE";
  oldValue: Record<string, any> | null;
  newValue: Record<string, any> | null;
  timestamp: string;
}

