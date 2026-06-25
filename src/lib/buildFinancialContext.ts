// buildFinancialContext.ts — Single shared builder for the Financial Context
// payload sent to /api/ai/assistant by every AI entry point.
//
// Blueprint: docs/superpowers/specs/2026-06-26-financial-profile-enhancement-design.md
// Reconciliation: docs/superpowers/specs/2026-06-26-financial-context-dependency-report.md
//
// This file is THE solution to the "Zero Call Site Uniformity" and
// "Inverse Fragmentation" problems identified in the Reconciliation Report.
// All 6 AI call sites must use this builder instead of manually constructing
// financialContext objects.
//
// The builder is role-aware: it preserves existing Owner/Staff/HQ permissions
// by only loading data the user's workspace already has access to via RLS.
// It does NOT expose any data the user could not already access.

import { supabase, isSupabaseConfigured } from "./supabase";
import { isDemoWorkspace } from "./seeder";
import {
  loadBusinessBranches,
  loadCustomers, loadSuppliers, loadProperties, loadInsurancePolicies, loadInvestments,
  type BusinessBranch, type Customer, type Supplier,
  type PropertyRecord, type InsurancePolicy, type Investment,
} from "./profileData";
import type { Tenant } from "../types";
import type { Workspace } from "../types";
import type {
  FinancialEvent, CashAccount, BankAccount, DebtRecord,
  FinancialCommitment, FinancialEvidencePackage, OcrLearnedPattern,
} from "../types";
import type {
  PersonalProfile, Business, Vehicle, Dependent,
} from "./profileData";
import type { AssetPurchase, OwnerTransaction } from "./assetOwnerData";

// ─── Payload Type ────────────────────────────────────────────────────────────

export interface FinancialContextPayload {
  // Identity
  activeTenant: { id: string; name: string; category?: string } | null;
  activeWorkspace: { id: string; name: string; workspaceType?: string } | null;

  // Financial Records (from FinancialRecordsContext — passed in)
  financialEvents: FinancialEvent[];
  cashAccounts: CashAccount[];
  bankAccounts: BankAccount[];
  debtRecords: DebtRecord[];
  financialCommitments: FinancialCommitment[];
  financialEvidencePackages: FinancialEvidencePackage[];
  ocrLearnedPatterns: OcrLearnedPattern[];

  // Profile Repository (from caller state — already loaded)
  personalProfile: PersonalProfile | null;
  businesses: Business[];
  vehicles: Vehicle[];
  dependents: Dependent[];
  assetPurchases: AssetPurchase[];
  ownerTransactions: OwnerTransaction[];

  // New repositories (loaded by the builder)
  businessBranches: Record<string, BusinessBranch[]>;
  customers: Customer[];
  suppliers: Supplier[];
  properties: PropertyRecord[];
  insurancePolicies: InsurancePolicy[];
  investments: Investment[];
}

// ─── Builder Input ─────────────────────────────────────────────────────────────

export interface BuildFinancialContextParams {
  // Identity
  activeTenant: Tenant | null;
  activeWorkspace: Workspace | null;

  // Financial Records (from FinancialRecordsContext)
  financialEvents: FinancialEvent[];
  cashAccounts: CashAccount[];
  bankAccounts: BankAccount[];
  debtRecords: DebtRecord[];
  financialCommitments: FinancialCommitment[];
  financialEvidencePackages: FinancialEvidencePackage[];
  ocrLearnedPatterns: OcrLearnedPattern[];

  // Profile Repository (from component state — already loaded)
  personalProfile: PersonalProfile | null;
  businesses: Business[];
  vehicles: Vehicle[];
  dependents: Dependent[];
  assetPurchases: AssetPurchase[];
  ownerTransactions: OwnerTransaction[];

  // Workspace + user context
  workspaceId: string;
  isMockUser: boolean;
}

// ─── Builder ──────────────────────────────────────────────────────────────────

export async function buildFinancialContext(
  params: BuildFinancialContextParams
): Promise<FinancialContextPayload> {
  const {
    activeTenant, activeWorkspace,
    financialEvents, cashAccounts, bankAccounts, debtRecords,
    financialCommitments, financialEvidencePackages, ocrLearnedPatterns,
    personalProfile, businesses, vehicles, dependents,
    assetPurchases, ownerTransactions,
    workspaceId, isMockUser,
  } = params;

  // For sandbox/demo/mock mode, return everything that's already in memory
  // with empty arrays for the new repositories (no Supabase access).
  if (!isSupabaseConfigured() || isMockUser || !supabase || isDemoWorkspace(workspaceId)) {
    return {
      activeTenant: activeTenant ? { id: activeTenant.id, name: activeTenant.name, category: activeTenant.category } : null,
      activeWorkspace: activeWorkspace ? { id: activeWorkspace.id, name: activeWorkspace.name, workspaceType: activeWorkspace.workspaceType } : null,
      financialEvents, cashAccounts, bankAccounts, debtRecords,
      financialCommitments, financialEvidencePackages, ocrLearnedPatterns,
      personalProfile, businesses, vehicles, dependents,
      assetPurchases, ownerTransactions,
      businessBranches: {}, customers: [], suppliers: [],
      properties: [], insurancePolicies: [], investments: [],
    };
  }

  // Real Supabase path — load the repositories that are NOT already
  // passed in by the caller. These are: business branches (nested under
  // businesses), and the 5 new repositories.
  //
  // All loads use the same `canPersist`-equivalent gate (isSupabaseConfigured
  // + !isDemoWorkspace) which we've already passed. RLS ensures the user
  // can only read their own workspace's data.
  //
  // Loads are parallelized for performance.

  const [branchesResult, customers, suppliers, properties, insurancePolicies, investments] = await Promise.all([
    // Branches: load for each active business (nested by businessId)
    Promise.all(
      businesses.filter(b => b.isActive !== false).map(async (b) => {
        const branches = await loadBusinessBranches(workspaceId, isMockUser, b.id);
        return { id: b.id, branches };
      })
    ).then(results => {
      const map: Record<string, BusinessBranch[]> = {};
      for (const r of results) map[r.id] = r.branches;
      return map;
    }),

    // New repositories — each uses the same canPersist gate internally
    loadCustomers(workspaceId, isMockUser),
    loadSuppliers(workspaceId, isMockUser),
    loadProperties(workspaceId, isMockUser),
    loadInsurancePolicies(workspaceId, isMockUser),
    loadInvestments(workspaceId, isMockUser),
  ]);

  return {
    activeTenant: activeTenant ? { id: activeTenant.id, name: activeTenant.name, category: activeTenant.category } : null,
    activeWorkspace: activeWorkspace ? { id: activeWorkspace.id, name: activeWorkspace.name, workspaceType: activeWorkspace.workspaceType } : null,
    financialEvents, cashAccounts, bankAccounts, debtRecords,
    financialCommitments, financialEvidencePackages, ocrLearnedPatterns,
    personalProfile, businesses, vehicles, dependents,
    assetPurchases, ownerTransactions,
    businessBranches: branchesResult,
    customers, suppliers, properties, insurancePolicies, investments,
  };
}