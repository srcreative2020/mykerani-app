// chatSuggestionMapper.ts — Shared payload mapper for AI Chat suggestions.
//
// PURE FUNCTION. No React, no Hooks, no Component, no UI dependencies.
// Called by OwnerDashboard, StaffHomeScreen, AIFinancialAssistant to enrich
// the LLM's raw suggestion payload with profile-based identity resolution
// BEFORE the UI displays it.
//
// Enrichment rules (exact name match only, case-insensitive):
//   1. relatedParty matches bank/cash account name → TRANSFER
//   2. relatedParty matches business name → OWNER_TRANSACTION
//   3. relatedParty matches dependent name → INCOME
// If no match, the LLM's payload.transactionType is used unchanged.

export interface FinancialProfileContext {
  cashAccounts?: { name: string }[];
  bankAccounts?: { bankName?: string; accountName?: string }[];
  businesses?: { businessName: string; isActive?: boolean }[];
  vehicles?: { name: string }[];
  dependents?: { name: string }[];
  personalProfile?: { fullName?: string };
}

// Generic constraint: input must have a payload with relatedParty and transactionType
interface SuggestionWithPayload {
  payload: {
    relatedParty?: string;
    transactionType?: string;
  };
}

export function enrichChatSuggestionPayload<T extends SuggestionWithPayload>(
  s: T,
  profile: FinancialProfileContext
): T {
  const enrichedPayload = { ...s.payload } as T["payload"];
  const rp = (enrichedPayload.relatedParty || "").toLowerCase().trim();
  if (rp) {
    if ((profile.bankAccounts || []).some(b => (b.accountName || b.bankName || "").toLowerCase().trim() === rp)) {
      enrichedPayload.transactionType = "TRANSFER";
    } else if ((profile.cashAccounts || []).some(c => (c.name || "").toLowerCase().trim() === rp)) {
      enrichedPayload.transactionType = "TRANSFER";
    } else if ((profile.businesses || []).some(b => b.isActive !== false && (b.businessName || "").toLowerCase().trim() === rp)) {
      enrichedPayload.transactionType = "OWNER_TRANSACTION";
    } else if ((profile.dependents || []).some(d => (d.name || "").toLowerCase().trim() === rp)) {
      enrichedPayload.transactionType = "INCOME";
    }
  }
  return { ...s, payload: enrichedPayload } as T;
}