// financialRecordConfirmation.ts — MYKERANI Financial Record Confirmation Engine.
//
// Single Source of Truth for the 10 Business Rules of Record Confirmation.
// Pure async function. No React, no Hooks, no Component, no UI dependencies.
//
// Execution order is LOCKED (do not reorder):
//   1. Workspace Validation
//   2. Duplicate Check
//   3. Edited Field Fallback
//   4. Transaction Dispatch
//   5. Confirmation Validation (failed-write surfacing)
//   6. Confirmation Event (logEvent "CONFIRMATION" before write)
//   7. Record Creation Event (logEvent "RECORD_CREATION" after write)
//   8. Activity Log (logTenantActivity "RECORD_CONFIRMED" after write)
//   9. Evidence Linking (linkEvidenceToRecord after write)
//  10. OCR Learning (learnOcrPattern after write)
//
// Per-source technical differences (sourceSystem, referenceNumber, description
// prefix, documentType, evidence URL, audit log destination, permission check,
// sync vs awaited DB writes) are passed in by each caller via ConfirmInput.

export type ConfirmTransactionType =
  | "INCOME"
  | "EXPENSE"
  | "TRANSFER"
  | "DEBT"
  | "RECEIVABLE"
  | "PAYABLE"
  | "COMMITMENT"
  | "ASSET_PURCHASE"
  | "OWNER_TRANSACTION";

export type ConfirmRecordType =
  | "INCOME"
  | "EXPENSE"
  | "TRANSFER"
  | "DEBT"
  | "RECEIVABLE"
  | "PAYABLE"
  | "COMMITMENT"
  | "OWNER_TRANSACTION";

export type ConfirmSourceSystem =
  | "AI_CHAT"
  | "OCR"
  | "BANK_STATEMENT";

export type ConfirmAuditDestination = "EVENT_LOG" | "AUDIT_LOG" | "BOTH" | "NONE";

export interface ConfirmDraft {
  amount?: number | string;
  category?: string;
  relatedParty?: string;
  date?: string;
}

export interface ConfirmEvidence {
  documentType: string;
  fileName: string;
  fileUrl: string;
}

export interface ConfirmInput {
  workspaceId: string;
  tenantId: string;
  userId: string | undefined;
  userEmail: string | undefined;
  userRole: string | undefined;

  businessId?: string | undefined;
  branchId?: string | undefined;

  transactionType: ConfirmTransactionType;
  amount: number | string | undefined;
  category: string | undefined;
  relatedParty: string | undefined;
  date: string | undefined;
  confidenceScore?: number;
  referenceNumber?: string;
  description?: string;

  pendingEvidence?: ConfirmEvidence | null;
  evidenceAttached?: boolean;

  ownerTransactionSubtype?: "CAPITAL_INJECTION" | "DRAWING";

  source: ConfirmSourceSystem;
  sourceTitle: string;
  auditDestination: ConfirmAuditDestination;
  skipOcrLearning?: boolean;

  cashAccountId?: string;
  bankAccountId?: string;

  precheckDuplicate?: boolean;
}

export interface ConfirmResult {
  ok: boolean;
  error?: string;
  recordId?: string;
  recordType?: ConfirmRecordType;
  amount?: number;
  category?: string;
  relatedParty?: string;
  date?: string;
  confidenceScore?: number;
  transactionType?: ConfirmTransactionType;
}

export interface ConfirmDeps {
  addFinancialEventAwaited: (event: any, sourceSystem?: any) => Promise<any>;
  addFinancialEvent: (event: any, onDbError?: (err: Error) => void, sourceSystem?: any) => any;
  addDebtRecordAwaited: (debt: any) => Promise<any>;
  addDebtRecord: (debt: any) => any;
  addFinancialCommitmentAwaited: (commitment: any) => Promise<any>;
  addFinancialCommitment: (commitment: any) => any;
  addAssetPurchase: (workspaceId: string, payload: any) => Promise<any> | any;
  addOwnerTransaction: (workspaceId: string, payload: any) => Promise<any> | any;
  linkEvidenceToRecord: (link: any) => void;
  learnOcrPattern: (pattern: any) => void;
  scanForDuplicates: () => Promise<any[]>;
  logEvent: (e: any) => void;
  logTenantActivity: (a: any) => void;
  writeAuditLog?: (a: any) => void;
}

function asNumber(v: number | string | undefined, fallback: number): number {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asString(v: string | undefined, fallback: string): string {
  if (v === undefined || v === null) return fallback;
  return v;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function confirmFinancialRecord(
  input: ConfirmInput,
  deps: ConfirmDeps
): Promise<ConfirmResult> {
  // Rule 1 — Workspace Validation
  if (!input.workspaceId) {
    return { ok: false, error: "Tiada ruang kerja aktif." };
  }

  // Rule 3 — Edited Field Fallback
  const transactionType = input.transactionType;
  const amount = asNumber(input.amount, 0);
  const category = asString(input.category, "Lain-lain");
  const relatedParty = asString(input.relatedParty, "Tidak Dinyatakan");
  const date = asString(input.date, todayIsoDate());
  const confidenceScore = input.confidenceScore ?? 0.7;
  const description = asString(input.description, "");
  const businessId = input.businessId;
  const branchId = input.branchId;

  // Rule 6 — Confirmation Event (BEFORE write)
  if (input.auditDestination === "EVENT_LOG" || input.auditDestination === "BOTH") {
    deps.logEvent({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      userEmail: input.userEmail,
      userRole: input.userRole,
      eventType: "CONFIRMATION",
      description: `User confirmed: ${input.sourceTitle}`,
      metadata: { transactionType, source: input.source },
    });
  }

  // Rule 2 — Duplicate Check (skipped for TRANSFER, amount=0, or relatedParty=default)
  const dupCheckEnabled = input.precheckDuplicate !== false && transactionType !== "TRANSFER" && amount > 0 && relatedParty !== "Tidak Dinyatakan";
  if (dupCheckEnabled) {
    try {
      const existingDuplicates = await deps.scanForDuplicates();
      const match = (existingDuplicates || []).find(
        (d: any) => d.classification !== "REVIEWED_NOT_DUPLICATE" && Math.abs((d.score ?? 0) - 1) < 0.01
      );
      if (match) {
        return { ok: false, error: "Rekod pendua dikesan. Sila semak rekod sedia ada sebelum meneruskan." };
      }
    } catch {
      // duplicate check is non-blocking
    }
  }

  // Rule 4 — Transaction Dispatch (9-way)
  let newRecordId: string | undefined;
  let newRecordType: ConfirmRecordType | undefined;

  try {
    if (transactionType === "INCOME" || transactionType === "EXPENSE") {
      const ev = await deps.addFinancialEventAwaited({
        workspaceId: input.workspaceId,
        businessId: businessId || undefined,
        branchId: branchId || undefined,
        type: transactionType,
        categoryName: category,
        amountMyr: amount,
        partyName: relatedParty,
        date,
        referenceNumber: input.referenceNumber,
        description,
        isCompleted: true,
        sourceSystem: input.source,
        cashAccountId: input.cashAccountId,
        bankAccountId: input.bankAccountId,
      }, input.source);
      newRecordId = ev.id;
      newRecordType = transactionType;
    } else if (transactionType === "TRANSFER") {
      deps.logEvent({
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        userId: input.userId,
        userEmail: input.userEmail,
        userRole: input.userRole,
        eventType: "AI_ANALYSIS",
        description: `Internal Transfer (no P&L impact): ${relatedParty} RM ${amount}`,
        metadata: { amount, fromAccount: relatedParty, category, date, source: input.source },
      });
      newRecordId = undefined;
      newRecordType = "TRANSFER";
      return {
        ok: true,
        recordId: undefined,
        recordType: "TRANSFER",
        amount,
        category: relatedParty,
        relatedParty,
        date,
        confidenceScore,
        transactionType,
      };
    } else if (transactionType === "DEBT") {
      const debt = await deps.addDebtRecordAwaited({
        workspaceId: input.workspaceId,
        businessId: businessId || undefined,
        creditorName: relatedParty,
        borrowedDate: date,
        totalAmountMyr: amount,
        repaidAmountMyr: 0,
        status: "ACTIVE",
        description,
      });
      newRecordId = debt.id;
      newRecordType = "DEBT";
    } else if (transactionType === "RECEIVABLE") {
      const ev = await deps.addFinancialEventAwaited({
        workspaceId: input.workspaceId,
        businessId: businessId || undefined,
        branchId: branchId || undefined,
        type: "RECEIVABLE",
        categoryName: category,
        amountMyr: amount,
        partyName: relatedParty,
        date,
        referenceNumber: input.referenceNumber,
        description,
        isCompleted: false,
        sourceSystem: input.source,
        cashAccountId: input.cashAccountId,
        bankAccountId: input.bankAccountId,
      }, input.source);
      newRecordId = ev.id;
      newRecordType = "RECEIVABLE";
    } else if (transactionType === "PAYABLE") {
      const ev = await deps.addFinancialEventAwaited({
        workspaceId: input.workspaceId,
        businessId: businessId || undefined,
        branchId: branchId || undefined,
        type: "PAYABLE",
        categoryName: category,
        amountMyr: amount,
        partyName: relatedParty,
        date,
        referenceNumber: input.referenceNumber,
        description,
        isCompleted: false,
        sourceSystem: input.source,
        cashAccountId: input.cashAccountId,
        bankAccountId: input.bankAccountId,
      }, input.source);
      newRecordId = ev.id;
      newRecordType = "PAYABLE";
    } else if (transactionType === "COMMITMENT") {
      const cmt = await deps.addFinancialCommitmentAwaited({
        workspaceId: input.workspaceId,
        businessId: businessId || undefined,
        description,
        obligeeName: relatedParty,
        amountPerIntervalMyr: amount,
        recurrence: "MONTHLY",
        startDate: date,
        isActive: true,
        status: "ACTIVE",
      });
      newRecordId = cmt.id;
      newRecordType = "COMMITMENT";
    } else if (transactionType === "ASSET_PURCHASE") {
      const asset = await deps.addAssetPurchase(input.workspaceId, {
        assetName: category,
        category,
        purchaseAmountMyr: amount,
        purchaseDate: date,
        vendorName: relatedParty,
        notes: description,
      });
      newRecordId = asset?.id;
      newRecordType = "ASSET_PURCHASE" as any;
    } else if (transactionType === "OWNER_TRANSACTION") {
      const subtype: "CAPITAL_INJECTION" | "DRAWING" =
        input.ownerTransactionSubtype ||
        (category.toUpperCase().includes("DRAWING") ? "DRAWING" : "CAPITAL_INJECTION");
      const ot = await deps.addOwnerTransaction(input.workspaceId, {
        type: subtype,
        amountMyr: amount,
        transactionDate: date,
        description,
      });
      newRecordId = ot?.id;
      newRecordType = "OWNER_TRANSACTION" as any;
    } else {
      // Rule 5 — Confirmation Validation (unsupported type)
      return { ok: false, error: "Jenis transaksi tidak disokong." };
    }
  } catch (err: any) {
    // Rule 5 — Confirmation Validation (DB write failure)
    return {
      ok: false,
      error: `Gagal menyimpan rekod ke pangkalan data: ${err?.message || "ralat tidak diketahui"}. Rekod TIDAK disahkan, sila cuba lagi.`,
    };
  }

  // Rule 7 — Record Creation Event (AFTER write)
  if (input.auditDestination === "EVENT_LOG" || input.auditDestination === "BOTH") {
    deps.logEvent({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      userEmail: input.userEmail,
      userRole: input.userRole,
      eventType: "RECORD_CREATION",
      description: `Financial record created: ${input.sourceTitle}`,
      metadata: { recordId: newRecordId, recordType: newRecordType, amount, category, relatedParty, date, source: input.source },
    });
  }

  // Rule 7b — Audit Trail (writeAuditLog) for sources that use the audit_logs table
  if ((input.auditDestination === "AUDIT_LOG" || input.auditDestination === "BOTH") && deps.writeAuditLog) {
    deps.writeAuditLog({
      workspaceId: input.workspaceId,
      module: "Financial Records",
      action: "CREATE",
      oldValue: null,
      newValue: { recordId: newRecordId, recordType: newRecordType, amount, category, relatedParty, date },
    });
  }

  // Rule 8 — Activity Log (Tenant Activity Center)
  deps.logTenantActivity({
    workspaceId: input.workspaceId,
    actorId: input.userId || "unknown",
    actorEmail: input.userEmail || "unknown",
    actorRole: input.userRole || "TENANT_STAFF",
    actorName: undefined,
    actionType: "RECORD_CONFIRMED",
    module: "Financial Records",
    description: `Record confirmed: ${transactionType} RM${amount} (${category})`,
    metadata: { recordId: newRecordId, recordType: newRecordType, amount, category, relatedParty, date, transactionType, source: input.source },
  });

  // Rule 9 — Evidence Linking (via shared engine)
  if (input.evidenceAttached && input.pendingEvidence && newRecordId && newRecordType) {
    deps.linkEvidenceToRecord({
      workspaceId: input.workspaceId,
      documentType: input.pendingEvidence.documentType,
      fileName: input.pendingEvidence.fileName,
      fileUrl: input.pendingEvidence.fileUrl,
      relatedRecordType: newRecordType,
      relatedRecordId: newRecordId,
    });
  }

  // Rule 10 — OCR Learning
  if (!input.skipOcrLearning && transactionType !== "ASSET_PURCHASE" && transactionType !== "OWNER_TRANSACTION") {
    deps.learnOcrPattern({
      workspaceId: input.workspaceId,
      vendorName: relatedParty,
      category,
      recordType: transactionType as any,
      confidenceScore,
      businessId: businessId || null,
      branchId: branchId || null,
    });
  }

  return {
    ok: true,
    recordId: newRecordId,
    recordType: newRecordType,
    amount,
    category,
    relatedParty,
    date,
    confidenceScore,
    transactionType,
  };
}
