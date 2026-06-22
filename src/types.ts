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
  createdAt?: string;
}

export interface WorkspaceState {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  loading: boolean;
  error: string | null;
}

export type FinancialRecordType = "INCOME" | "EXPENSE" | "RECEIVABLE" | "PAYABLE" | "DEBT";

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
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  userEmail: string;
  userRole: UserRole;
  tenantId: string;
  workspaceId?: string;
  module: "Financial Records" | "Financial Commitments" | "Financial Evidence Package" | "OCR Learning" | "Backup & Recovery" | "Storage Provider" | "Notifications" | "Debt Records";
  action: "CREATE" | "UPDATE" | "DELETE";
  oldValue: Record<string, any> | null;
  newValue: Record<string, any> | null;
  timestamp: string;
}

