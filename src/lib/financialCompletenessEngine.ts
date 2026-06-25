// MyKerani — Financial Completeness Engine (Financial Recovery Foundation Build Sprint V1)
//
// Built for users with old/incomplete data to see, at a glance, how complete
// their financial picture is and what's missing — distinct from Financial
// Health (which judges solvency/liquidity of CORRECT data). This engine
// judges COMPLETENESS of the data itself.
//
// Reuses existing, already-validated building blocks:
//   - dataCompletenessPct logic pattern from financialHealth.ts (categorized
//     vs uncategorized records)
//   - getEvidenceCoverageRatio() from evidenceDrilldown.ts (already shipped,
//     validated in Report Foundation Sprint)
// No new classification/aggregation logic invented.
//
// Stateless, pure functions only. No DB, no I/O, no React.

import type { FinancialEvent, BankAccount, CashAccount } from "../types";

export interface FinancialCompletenessInput {
  financialEvents: FinancialEvent[];
  bankAccounts: BankAccount[];
  cashAccounts: CashAccount[];
  evidenceCoverageRatio: number; // 0..1, from getEvidenceCoverageRatio() — caller already has this wired (see financialHealth.ts V1 usage)
  /** Number of distinct calendar months between the earliest record date the
   * user COULD have (e.g. business registration date or first-ever record)
   * and now — used to judge whether history has gaps. If omitted, Historical
   * Coverage is derived purely from the actual record date spread. */
  expectedHistoryMonths?: number;
}

export interface FinancialCompletenessResult {
  financialRecordsPct: number;
  evidenceCoveragePct: number;
  bankCoveragePct: number;
  historicalCoveragePct: number;
  overallCompletenessPct: number;
}

/** Financial Records % — share of records that carry a real (non-blank, non-"Lain-lain") category. Same rule financialHealth.ts already uses for dataCompletenessPct. */
function computeFinancialRecordsPct(events: FinancialEvent[]): number {
  if (events.length === 0) return 0;
  const categorized = events.filter((e) => e.categoryName && e.categoryName.trim() !== "" && e.categoryName !== "Lain-lain").length;
  return (categorized / events.length) * 100;
}

/** Bank Coverage % — share of FinancialEvents that are actually linked to a real cash/bank account, vs. floating with no account reference (a classic "imported but not reconciled" gap). */
function computeBankCoveragePct(events: FinancialEvent[], bankAccounts: BankAccount[], cashAccounts: CashAccount[]): number {
  if (events.length === 0) return bankAccounts.length + cashAccounts.length > 0 ? 100 : 0;
  const linked = events.filter((e) => !!e.cashAccountId || !!e.bankAccountId).length;
  return (linked / events.length) * 100;
}

/** Historical Coverage % — how many distinct months actually have at least one record, out of the months the user's own data spans (or `expectedHistoryMonths` if the caller knows a longer real history exists, e.g. business registration date). */
function computeHistoricalCoveragePct(events: FinancialEvent[], expectedHistoryMonths?: number): number {
  if (events.length === 0) return 0;
  const monthKeys = new Set(events.map((e) => e.date.slice(0, 7)));
  const sortedDates = events.map((e) => e.date).sort();
  const firstDate = new Date(sortedDates[0]);
  const lastDate = new Date(sortedDates[sortedDates.length - 1]);
  const spanMonths = Math.max(
    1,
    (lastDate.getFullYear() - firstDate.getFullYear()) * 12 + (lastDate.getMonth() - firstDate.getMonth()) + 1
  );
  const denominator = expectedHistoryMonths && expectedHistoryMonths > spanMonths ? expectedHistoryMonths : spanMonths;
  return Math.min(100, (monthKeys.size / denominator) * 100);
}

/**
 * Single source of truth for the 5 completeness metrics the sprint asked
 * for. Overall Completeness % is the simple average of the other 4 —
 * deliberately the simplest honest combination (no hidden weighting),
 * documented here so it's auditable.
 */
export function computeFinancialCompleteness(input: FinancialCompletenessInput): FinancialCompletenessResult {
  const financialRecordsPct = computeFinancialRecordsPct(input.financialEvents);
  const evidenceCoveragePct = Math.min(100, Math.max(0, input.evidenceCoverageRatio * 100));
  const bankCoveragePct = computeBankCoveragePct(input.financialEvents, input.bankAccounts, input.cashAccounts);
  const historicalCoveragePct = computeHistoricalCoveragePct(input.financialEvents, input.expectedHistoryMonths);

  const overallCompletenessPct = (financialRecordsPct + evidenceCoveragePct + bankCoveragePct + historicalCoveragePct) / 4;

  return { financialRecordsPct, evidenceCoveragePct, bankCoveragePct, historicalCoveragePct, overallCompletenessPct };
}

// ═════════════════════════════════════════════════════════════════════════════
// Financial Profile Enhancement — Profile Completeness Engine
// Blueprint: docs/superpowers/specs/2026-06-26-financial-profile-enhancement-design.md
// Additive: does NOT modify the existing computeFinancialCompleteness function.
// ═════════════════════════════════════════════════════════════════════════════

export interface ProfileCompletenessInput {
  personalProfile: { fullName?: string } | null;
  businesses: { isActive?: boolean }[];
  bankAccounts: { is_active?: boolean }[];
  vehicles: { isActive?: boolean }[];
  customers: { isActive?: boolean }[];
  suppliers: { isActive?: boolean }[];
  properties: { isActive?: boolean }[];
  insurancePolicies: { isActive?: boolean }[];
  investments: { isActive?: boolean }[];
}

export interface ProfileCompletenessResult {
  personalProfilePct: number;
  businessPct: number;
  bankAccountPct: number;
  customerPct: number;
  supplierPct: number;
  assetDiversificationPct: number;
  overallProfileCompletenessPct: number;
  missingRepos: string[];
}

export function computeProfileCompleteness(input: ProfileCompletenessInput): ProfileCompletenessResult {
  const activeBusinesses = input.businesses.filter(b => b.isActive !== false);
  const activeBankAccounts = input.bankAccounts.filter(a => (a as any).is_active !== false);
  const activeCustomers = input.customers.filter(c => c.isActive !== false);
  const activeSuppliers = input.suppliers.filter(s => s.isActive !== false);
  const activeProperties = input.properties.filter(p => p.isActive !== false);
  const activeInsurance = input.insurancePolicies.filter(i => i.isActive !== false);
  const activeInvestments = input.investments.filter(i => i.isActive !== false);

  const personalProfilePct = input.personalProfile?.fullName ? 100 : 0;
  const businessPct = activeBusinesses.length > 0 ? 100 : 0;
  const bankAccountPct = activeBankAccounts.length > 0 ? 100 : 0;
  const customerPct = activeCustomers.length > 0 ? 100 : 0;
  const supplierPct = activeSuppliers.length > 0 ? 100 : 0;
  const assetDiversificationPct = Math.min(100, ((activeProperties.length > 0 ? 1 : 0) + (activeInsurance.length > 0 ? 1 : 0) + (activeInvestments.length > 0 ? 1 : 0)) / 3 * 100);

  const overallProfileCompletenessPct = Math.round(
    (personalProfilePct + businessPct + bankAccountPct + customerPct + supplierPct + assetDiversificationPct) / 6
  );

  const missingRepos: string[] = [];
  if (personalProfilePct === 0) missingRepos.push("Profil Peribadi");
  if (businessPct === 0) missingRepos.push("Perniagaan");
  if (bankAccountPct === 0) missingRepos.push("Akaun Bank");
  if (customerPct === 0) missingRepos.push("Pelanggan");
  if (supplierPct === 0) missingRepos.push("Pembekal");
  if (assetDiversificationPct < 100) {
    if (activeProperties.length === 0) missingRepos.push("Hartanah");
    if (activeInsurance.length === 0) missingRepos.push("Insurans");
    if (activeInvestments.length === 0) missingRepos.push("Pelaburan");
  }

  return {
    personalProfilePct, businessPct, bankAccountPct,
    customerPct, supplierPct, assetDiversificationPct,
    overallProfileCompletenessPct, missingRepos,
  };
}
