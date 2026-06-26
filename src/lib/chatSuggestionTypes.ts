// Single source of truth for the AI Chat "confirm transaction" suggestion
// shape, shared by Owner and Staff so both screens' chat UI and the shared
// useConfirmChatSuggestion hook agree on exactly one schema. Do not
// redeclare these types locally in a screen file.

export interface ChatSuggestion {
  id: string;
  title: string;
  description: string;
  actionType: string;
  payload: {
    transactionType?: "INCOME" | "EXPENSE" | "DEBT" | "RECEIVABLE" | "PAYABLE" | "COMMITMENT" | "ASSET_PURCHASE" | "OWNER_TRANSACTION" | "TRANSFER";
    ownerTransactionSubtype?: "CAPITAL_INJECTION" | "DRAWING";
    category?: string;
    amount?: number;
    date?: string;
    relatedParty?: string;
    confidenceScore?: number;
  };
  businessId?: string | null;
  businessName?: string;
  businessPicked?: boolean;
  evidenceStatus?: "NONE" | "ATTACHED" | "SKIPPED";
  evidenceFileName?: string;
  accountingRecommendation?: string;
  accountingLevel1Group?: string;
  accountingReason?: string;
  financialStatementImpact?: string;
  accountingRiskLevel?: "LOW" | "MEDIUM" | "HIGH";
  accountingExplanationText?: string;
  accountingMatchStatus?: "MATCH" | "POSSIBLE_MISMATCH" | "HIGH_RISK_MISMATCH";
  accountingConfidence?: number;
}

export type ChatSuggestionRecordType = "INCOME" | "EXPENSE" | "TRANSFER" | "RECEIVABLE" | "PAYABLE" | "DEBT" | "COMMITMENT";
export type ChatSuggestionStatusValue = "pending" | "confirmed" | "rejected";

export interface ChatSuggestionStatus {
  status: ChatSuggestionStatusValue;
  recordId?: string;
  recordType?: ChatSuggestionRecordType;
  confirmedAt?: string;
  editedAmount?: number;
  editedCategory?: string;
  editedRelatedParty?: string;
  editedDate?: string;
  editedTransactionType?: string;
  confirmedByName?: string;
  confirmedByUserId?: string;
}

// Per-suggestion UI/confirm state: which business/branch it's attributed
// to, and whether evidence has been attached/skipped. Populated either by
// the Business/Branch Mapping auto-match engine, or by the user manually
// picking/attaching in the chat UI.
export interface ChatSuggestionExtra {
  businessId: string | null;
  businessName: string;
  businessPicked: boolean;
  evidenceStatus: "NONE" | "ATTACHED" | "SKIPPED";
  branchId?: string | null;
  branchName?: string;
  branchPicked?: boolean;
  autoMapped?: boolean;
  branchCandidates?: string[];
}

export interface PendingChatEvidence {
  documentType: "RECEIPT";
  fileName: string;
  fileUrl: string;
}
