import { useAuth } from "../context/AuthContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { useFinancials } from "../context/FinancialRecordsContext";
import { addAssetPurchase, addOwnerTransaction } from "../lib/assetOwnerData";
import { logEvent } from "../lib/eventLog";
import type { ChatSuggestion, ChatSuggestionExtra, ChatSuggestionRecordType, PendingChatEvidence } from "../lib/chatSuggestionTypes";

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
  const { addFinancialEventAwaited, addDebtRecordAwaited, addFinancialCommitmentAwaited, linkEvidenceToRecord, learnOcrPattern } = useFinancials();

  const confirmChatSuggestion = async (
    s: ChatSuggestion,
    extra: ChatSuggestionExtra | undefined,
    edited: ConfirmChatSuggestionDraft | undefined,
    pendingEvidence: PendingChatEvidence | undefined
  ): Promise<ConfirmChatSuggestionResult> => {
    if (!activeWorkspace) return { ok: false, error: "Tiada ruang kerja aktif." };
    if (!extra || !extra.businessPicked) return { ok: false, error: "Sila pilih bisnes terlebih dahulu." };

    logEvent({
      tenantId: activeWorkspace.tenantId, workspaceId: activeWorkspace.id, userId: user?.id,
      userEmail: user?.email, userRole: user?.role, eventType: "CONFIRMATION",
      description: `User confirmed AI chat suggestion: ${s.title}`,
      metadata: { suggestionId: s.id, transactionType: s.payload?.transactionType },
    });

    const businessId = extra.businessId;
    const branchId = extra.branchId;
    const transactionType = s.payload?.transactionType;
    const amount = Number(edited ? edited.amount : s.payload?.amount) || 0;
    const category = (edited ? edited.category : s.payload?.category) || "Lain-lain";
    const relatedParty = (edited ? edited.relatedParty : s.payload?.relatedParty) || "Tidak Dinyatakan";
    const date = (edited ? edited.date : s.payload?.date) || new Date().toISOString().slice(0, 10);
    const confidenceScore = s.payload?.confidenceScore ?? 0.7;
    const description = `Direkodkan melalui pengesahan cadangan Kerani AI: ${s.title}`;

    let newRecordId: string | undefined;
    let newRecordType: ChatSuggestionRecordType | undefined;

    try {
      if (transactionType === "INCOME" || transactionType === "EXPENSE") {
        const ev = await addFinancialEventAwaited({
          workspaceId: activeWorkspace.id, businessId: businessId || undefined, branchId: branchId || undefined,
          type: transactionType, categoryName: category, amountMyr: amount, partyName: relatedParty, date,
          referenceNumber: `AI-${s.id}`, description, isCompleted: true, sourceSystem: "AI_CHAT",
        }, "AI_CHAT");
        newRecordId = ev.id; newRecordType = transactionType;
      } else if (transactionType === "TRANSFER") {
        // Internal Transfer — MUST NOT be recorded as Income or Expense.
        // Internal transfers only move money between own accounts and must
        // NOT affect Profit & Loss. They are logged in audit_logs and
        // event_logs only. No financial_events row is created.
        // Balance updates require a dedicated transfers table (future work).
        logEvent({
          tenantId: activeWorkspace.tenantId, workspaceId: activeWorkspace.id, userId: user?.id,
          userEmail: user?.email, userRole: user?.role, eventType: "AI_ANALYSIS",
          description: `Internal Transfer (no P&L impact): ${relatedParty} RM ${amount}`,
          metadata: { suggestionId: s.id, amount, fromAccount: relatedParty, category, date, source: "AI_CHAT" },
        });
        newRecordId = undefined; newRecordType = "TRANSFER";
        // Transfer recorded successfully (no financial event created)
        // Skip evidence linking and OCR learning for transfers
        return {
          ok: true, recordType: "TRANSFER", amount, category: relatedParty, relatedParty, date, confidenceScore, transactionType,
        };
      } else if (transactionType === "DEBT") {
        const debt = await addDebtRecordAwaited({
          workspaceId: activeWorkspace.id, businessId: businessId || undefined, creditorName: relatedParty,
          borrowedDate: date, totalAmountMyr: amount, repaidAmountMyr: 0, status: "ACTIVE", description,
        });
        newRecordId = debt.id; newRecordType = "DEBT";
      } else if (transactionType === "RECEIVABLE") {
        const ev = await addFinancialEventAwaited({
          workspaceId: activeWorkspace.id, businessId: businessId || undefined, branchId: branchId || undefined,
          type: "RECEIVABLE", categoryName: category, amountMyr: amount, partyName: relatedParty, date,
          referenceNumber: `AI-${s.id}`, description, isCompleted: false, sourceSystem: "AI_CHAT",
        }, "AI_CHAT");
        newRecordId = ev.id; newRecordType = "RECEIVABLE";
      } else if (transactionType === "PAYABLE") {
        const ev = await addFinancialEventAwaited({
          workspaceId: activeWorkspace.id, businessId: businessId || undefined, branchId: branchId || undefined,
          type: "PAYABLE", categoryName: category, amountMyr: amount, partyName: relatedParty, date,
          referenceNumber: `AI-${s.id}`, description, isCompleted: false, sourceSystem: "AI_CHAT",
        }, "AI_CHAT");
        newRecordId = ev.id; newRecordType = "PAYABLE";
      } else if (transactionType === "COMMITMENT") {
        const cmt = await addFinancialCommitmentAwaited({
          workspaceId: activeWorkspace.id, businessId: businessId || undefined, description, obligeeName: relatedParty,
          amountPerIntervalMyr: amount, recurrence: "MONTHLY", startDate: date, isActive: true, status: "ACTIVE",
        });
        newRecordId = cmt.id; newRecordType = "COMMITMENT";
      } else if (transactionType === "ASSET_PURCHASE") {
        await addAssetPurchase(activeWorkspace.id, {
          assetName: category, category, purchaseAmountMyr: amount, purchaseDate: date, vendorName: relatedParty, notes: description,
        });
      } else if (transactionType === "OWNER_TRANSACTION") {
        await addOwnerTransaction(activeWorkspace.id, {
          type: s.payload?.ownerTransactionSubtype || (category.toUpperCase().includes("DRAWING") ? "DRAWING" : "CAPITAL_INJECTION"),
          amountMyr: amount, transactionDate: date, description,
        });
      } else {
        return { ok: false, error: "Jenis transaksi tidak disokong." };
      }
    } catch (err: any) {
      return { ok: false, error: `Gagal menyimpan rekod ke pangkalan data: ${err?.message || "ralat tidak diketahui"}. Cadangan TIDAK disahkan, sila cuba lagi.` };
    }

    logEvent({
      tenantId: activeWorkspace.tenantId, workspaceId: activeWorkspace.id, userId: user?.id,
      userEmail: user?.email, userRole: user?.role, eventType: "RECORD_CREATION",
      description: `Financial record created from AI chat suggestion: ${s.title}`,
      metadata: { recordId: newRecordId, recordType: newRecordType, amount, category, relatedParty, date },
    });

    // Evidence Linking: the one shared engine -- if a receipt/invoice was
    // attached (explicitly, or automatically because this suggestion came
    // from an OCR/image/PDF/voice-note upload), link it to the record that
    // was just created. Skipped evidence never creates a row.
    if (extra.evidenceStatus === "ATTACHED" && pendingEvidence && newRecordId && newRecordType) {
      linkEvidenceToRecord({
        workspaceId: activeWorkspace.id,
        documentType: pendingEvidence.documentType,
        fileName: pendingEvidence.fileName,
        fileUrl: pendingEvidence.fileUrl,
        relatedRecordType: newRecordType,
        relatedRecordId: newRecordId,
      });
    }

    // AI Learns: feed the confirmed vendor/category back into the shared
    // OCR Learning Memory for every record type except the two that aren't
    // vendor-category transactions.
    if (transactionType !== "ASSET_PURCHASE" && transactionType !== "OWNER_TRANSACTION") {
      learnOcrPattern({
        workspaceId: activeWorkspace.id,
        vendorName: relatedParty,
        category,
        recordType: (transactionType === "COMMITMENT" ? "EXPENSE" : transactionType) as "INCOME" | "EXPENSE" | "RECEIVABLE" | "PAYABLE" | "DEBT",
        confidenceScore,
        businessId: businessId || null,
        branchId: branchId || null,
      });
    }

    return { ok: true, recordId: newRecordId, recordType: newRecordType, amount, category, relatedParty, date, confidenceScore, transactionType };
  };

  return { confirmChatSuggestion };
};
