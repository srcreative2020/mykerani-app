/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Workspace } from "../types";

export interface DemoFinancialRecord {
  id: string;
  workspaceId: string;
  type: "INCOME" | "EXPENSE" | "RECEIVABLE" | "PAYABLE";
  categoryName: string;
  categoryCode: string;
  amountMyr: number;
  partyName: string;
  date: string;
  referenceNumber: string;
  description: string;
}

// Fixed constant definition for the permanent Demo Tenant UUID
export const PERMANENT_DEMO_TENANT_ID = "tenant-demo-presentation";

// Permanent Demo Workspaces Under the Permanent Demo Tenant
export const PERMANENT_DEMO_WORKSPACES: Workspace[] = [
  {
    id: "ws-demo-personal",
    tenantId: PERMANENT_DEMO_TENANT_ID,
    name: "Demo Personal",
    slug: "demo-personal",
    isActive: true,
  },
  {
    id: "ws-demo-company-a",
    tenantId: PERMANENT_DEMO_TENANT_ID,
    name: "Demo Company A (LemonTree Bakery)",
    slug: "demo-company-a",
    isActive: true,
  },
  {
    id: "ws-demo-company-b",
    tenantId: PERMANENT_DEMO_TENANT_ID,
    name: "Demo Company B (Apex Holding)",
    slug: "demo-company-b",
    isActive: true,
  },
  {
    id: "ws-demo-company-c",
    tenantId: PERMANENT_DEMO_TENANT_ID,
    name: "Demo Company C (Logistics Ventures)",
    slug: "demo-company-c",
    isActive: true,
  },
];

// Pristine static demo dataseeds to use during initialization/reset cycles
const PRESET_DEMO_RECORDS: Record<string, DemoFinancialRecord[]> = {
  "ws-demo-personal": [
    {
      id: "dp-rec-001",
      workspaceId: "ws-demo-personal",
      type: "INCOME",
      categoryName: "Salary Credit",
      categoryCode: "1000",
      amountMyr: 8500.00,
      partyName: "System Employer Corp",
      date: "2026-06-01",
      referenceNumber: "TXN-SAL-98213",
      description: "Monthly professional consulting services retainer.",
    },
    {
      id: "dp-rec-002",
      workspaceId: "ws-demo-personal",
      type: "EXPENSE",
      categoryName: "Housing Allowance",
      categoryCode: "5000",
      amountMyr: 2200.00,
      partyName: "Seremban Heights Realty",
      date: "2026-06-03",
      referenceNumber: "TXN-EXP-88123",
      description: "Monthly apartment lease payment.",
    },
    {
      id: "dp-rec-003",
      workspaceId: "ws-demo-personal",
      type: "EXPENSE",
      categoryName: "Grocery Costs",
      categoryCode: "5100",
      amountMyr: 450.50,
      partyName: "Jaya Grocer KL",
      date: "2026-06-05",
      referenceNumber: "TXN-EXP-11223",
      description: "Weekly food supply and kitchen stock.",
    },
  ],
  "ws-demo-company-a": [
    {
      id: "da-rec-001",
      workspaceId: "ws-demo-company-a",
      type: "INCOME",
      categoryName: "Point of Sale Revenues",
      categoryCode: "4100",
      amountMyr: 24750.00,
      partyName: "Retail Storefront Counter A",
      date: "2026-06-08",
      referenceNumber: "POS-BAKERY-9988",
      description: "Aggregated weekly retail bakery receipt batches.",
    },
    {
      id: "da-rec-002",
      workspaceId: "ws-demo-company-a",
      type: "EXPENSE",
      categoryName: "Baking Supplies Raw Materials",
      categoryCode: "5200",
      amountMyr: 6800.00,
      partyName: "Federal Flour Mills Bhd",
      date: "2026-06-02",
      referenceNumber: "INV-FFM-2291",
      description: "Bulk grade organic wheat flour, baker's yeast, unsalted butter.",
    },
    {
      id: "da-rec-003",
      workspaceId: "ws-demo-company-a",
      type: "RECEIVABLE",
      categoryName: "Catering Trade Receivable",
      categoryCode: "1200",
      amountMyr: 3500.00,
      partyName: "Alliance Corporate Functions",
      date: "2026-06-10",
      referenceNumber: "CST-CAT-5544",
      description: "Premium high-density dessert catering for stakeholder AGM.",
    },
  ],
  "ws-demo-company-b": [
    {
      id: "db-rec-001",
      workspaceId: "ws-demo-company-b",
      type: "INCOME",
      categoryName: "Holding Retainer Commissions",
      categoryCode: "4000",
      amountMyr: 125000.00,
      partyName: "Apex Subsidiary Ventures MY",
      date: "2026-06-01",
      referenceNumber: "TXN-HLD-0019",
      description: "Quarterly management oversight strategic fee allocations.",
    },
    {
      id: "db-rec-002",
      workspaceId: "ws-demo-company-b",
      type: "EXPENSE",
      categoryName: "Legal Consulting Advisory",
      categoryCode: "5400",
      amountMyr: 15400.00,
      partyName: "Zaid Ibrahim & Co Advocates",
      date: "2026-06-05",
      referenceNumber: "LGL-ZICO-8832",
      description: "M&A target regulatory vetting and corporate validation filing.",
    },
  ],
  "ws-demo-company-c": [
    {
      id: "dc-rec-001",
      workspaceId: "ws-demo-company-c",
      type: "INCOME",
      categoryName: "Freight Carrier Fees",
      categoryCode: "4300",
      amountMyr: 88200.00,
      partyName: "Sinotrans Intermodal Logistics",
      date: "2026-06-07",
      referenceNumber: "FRG-SINO-7761",
      description: "Port Klang customs brokerage cargo clearances.",
    },
    {
      id: "dc-rec-002",
      workspaceId: "ws-demo-company-c",
      type: "EXPENSE",
      categoryName: "Diesel Fuel Fleet Replenishment",
      categoryCode: "5300",
      amountMyr: 32400.00,
      partyName: "Petronas Dagangan Bhd",
      date: "2026-06-04",
      referenceNumber: "FLT-PETR-5441",
      description: "Consolidated fleet discount smartcard fuel invoice imports.",
    },
    {
      id: "dc-rec-003",
      workspaceId: "ws-demo-company-c",
      type: "PAYABLE",
      categoryName: "Maintenance Creditor Payable",
      categoryCode: "2100",
      amountMyr: 12500.00,
      partyName: "Volvo Heavy Trucks Malaysia",
      date: "2026-06-09",
      referenceNumber: "MNT-VOLV-33211",
      description: "Bi-annual mechanical overhauling and axle alignments.",
    },
  ],
};

/**
 * Validates if the selected Workspace is a bounded Demo Workspace.
 */
export function isDemoWorkspace(workspaceId: string | undefined): boolean {
  if (!workspaceId) return false;
  return workspaceId.startsWith("ws-demo-");
}

/**
 * Read current state of isolated demo financial records from storage.
 */
export function getDemoWorkspaceData(workspaceId: string): DemoFinancialRecord[] {
  const cacheKey = `mykerani_demo_ledger_${workspaceId}`;
  const stored = localStorage.getItem(cacheKey);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // fallback
    }
  }
  // Load initial preset block if never seeded
  const presets = PRESET_DEMO_RECORDS[workspaceId] || [];
  localStorage.setItem(cacheKey, JSON.stringify(presets));
  return presets;
}

/**
 * Resets the demo dataset for a specific workspace back to pristine preset conditions.
 * Ensures strict isolation—never overwrites or interacts with production real workspace IDs.
 */
export function resetDemoWorkspaceData(workspaceId: string): DemoFinancialRecord[] {
  if (!isDemoWorkspace(workspaceId)) {
    throw new Error(`CRITICAL ALARM: Attempted to call resetDemoWorkspaceData on a non-demo production workspace ID ${workspaceId}. Protection rule triggered.`);
  }

  const cacheKey = `mykerani_demo_ledger_${workspaceId}`;
  const pristine = PRESET_DEMO_RECORDS[workspaceId] || [];
  localStorage.setItem(cacheKey, JSON.stringify(pristine));
  return pristine;
}

/**
 * Performs custom transaction seed creation directly within a demo zone.
 */
export function createDemoRecord(record: Omit<DemoFinancialRecord, "id">): DemoFinancialRecord {
  if (!isDemoWorkspace(record.workspaceId)) {
    throw new Error("Target is not inside the Demo Partition scope.");
  }

  const cacheKey = `mykerani_demo_ledger_${record.workspaceId}`;
  const current = getDemoWorkspaceData(record.workspaceId);
  const newRecord: DemoFinancialRecord = {
    ...record,
    id: `dp-custom-rec-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
  };

  const updated = [...current, newRecord];
  localStorage.setItem(cacheKey, JSON.stringify(updated));
  return newRecord;
}
