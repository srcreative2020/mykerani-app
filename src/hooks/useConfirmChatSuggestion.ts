import { useAuth } from "../context/AuthContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { useFinancials } from "../context/FinancialRecordsContext";
import { addAssetPurchase, addOwnerTransaction } from "../lib/assetOwnerData";
import { logEvent } from "../lib/eventLog";
import { logTenantActivity } from "../lib/hqService";
import type { ChatSuggestion, ChatSuggestionExtra, ChatSuggestionRecordType, PendingChatEvidence } from "../lib/chatSuggestionTypes";
import { confirmFinancialRecord, type ConfirmInput } from "../lib/financialRecordConfirmation";

export interface ConfirmChatSuggestionDraft {
  amount: string;
  category: string;
  relatedParty: string;
  date: string;
}

export interface ConfirmChatSuggestionResult {
  ok: boolean;
  error?: string;
  recordId?: string;
  recordType?: ChatSuggestionRecordType;
  amount?: number;
  category?: string;
  relatedParty?: string;
  date?: string;
  confidenceScore?: number;
  transactionType?: ChatSuggestion["payload"]["transactionType"];
}

// Single shared confirmation engine for AI Chat "CONFIRM_TRANSACTION"
// suggestions -- used identically by Tenant Owner (OwnerDashboard.tsx) and
// Tenant Staff (StaffHomeScreen.tsx) per the locked Owner-Staff Parity Rule
// (MYKERANI_OWNER_STAFF_PARITY_RULE.md). Screens render their own UI
// (different error banners, different business/branch pickers) but must
// call this hook rather than re-implementing the dispatch below.
//
// Always awaits the database write and surfaces failures (never reports
// success before the DB confirms), always links evidence through the one
// shared evidence engine when present, and always feeds the OCR Learning
// Memory on success. This function only ever runs after an explicit user
// confirm tap -- it never auto-approves anything (AI Suggests -> User
// Confirms -> AI Learns).
export const useConfirmChatSuggestion = () => {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { addFinancialEventAwaited, addDebtRecordAwaited, addFinancialCommitmentAwaited, linkEvidenceToRecord, learnOcrPattern, scanForDuplicates } = useFinancials();

  const confirmChatSuggestion = async (
    s: ChatSuggestion,
    extra: ChatSuggestionExtra | undefined,
    edited: ConfirmChatSuggestionDraft | undefined,
    pendingEvidence: PendingChatEvidence | undefined
  ): Promise<ConfirmChatSuggestionResult> => {
    if (!activeWorkspace) return { ok: false, error: "Tiada ruang kerja aktif." };
    if (!extra || !extra.businessPicked) return { ok: false, error: "Sila pilih bisnes terlebih dahulu." };

    const businessId = extra.businessId;
    const branchId = extra.branchId;
    const transactionType = s.payload?.transactionType;
    const amount = Number(edited ? edited.amount : s.payload?.amount) || 0;
    const category = (edited ? edited.category : s.payload?.category) || "Lain-lain";
    const relatedParty = (edited ? edited.relatedParty : s.payload?.relatedParty) || "Tidak Dinyatakan";
    const date = (edited ? edited.date : s.payload?.date) || new Date().toISOString().slice(0, 10);
    const confidenceScore = s.payload?.confidenceScore ?? 0.7;
    const description = `Direkodkan melalui pengesahan cadangan Kerani AI: ${s.title}`;

    const input: ConfirmInput = {
      workspaceId: activeWorkspace.id,
      tenantId: activeWorkspace.tenantId,
      userId: user?.id,
      userEmail: user?.email,
      userRole: user?.role,
      businessId,
      branchId,
      transactionType: (transactionType as ConfirmInput["transactionType"]) ?? "EXPENSE",
      amount,
      category,
      relatedParty,
      date,
      confidenceScore,
      referenceNumber: `AI-${s.id}`,
      description,
      pendingEvidence: pendingEvidence
        ? { documentType: pendingEvidence.documentType, fileName: pendingEvidence.fileName, fileUrl: pendingEvidence.fileUrl }
        : null,
      evidenceAttached: extra.evidenceStatus === "ATTACHED",
      ownerTransactionSubtype: s.payload?.ownerTransactionSubtype,
      source: "AI_CHAT",
      sourceTitle: `AI chat suggestion: ${s.title}`,
      auditDestination: "EVENT_LOG",
    };

    const result = await confirmFinancialRecord(input, {
      addFinancialEventAwaited,
      addFinancialEvent: addFinancialEventAwaited as any,
      addDebtRecordAwaited,
      addDebtRecord: addDebtRecordAwaited as any,
      addFinancialCommitmentAwaited,
      addFinancialCommitment: addFinancialCommitmentAwaited as any,
      addAssetPurchase,
      addOwnerTransaction,
      linkEvidenceToRecord,
      learnOcrPattern,
      scanForDuplicates,
      logEvent,
      logTenantActivity,
    });

    return result as ConfirmChatSuggestionResult;
  };

  return { confirmChatSuggestion };
};
