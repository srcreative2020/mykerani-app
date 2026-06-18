import React, { createContext, useContext, useState, useEffect } from "react";
import { type FinancialEvent, type CashAccount, type BankAccount, type DebtRecord, type Workspace, type FinancialRecordType, type FinancialCommitment, type FinancialEvidencePackage, type OcrLearnedPattern } from "../types";
import { useAuth } from "./AuthContext";
import { useWorkspace } from "./WorkspaceContext";
import { useAudit } from "./AuditContext";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { isDemoWorkspace } from "../lib/seeder";

interface FinancialRecordsContextType {
  financialEvents: FinancialEvent[];
  cashAccounts: CashAccount[];
  bankAccounts: BankAccount[];
  debtRecords: DebtRecord[];
  financialCommitments: FinancialCommitment[];
  financialEvidencePackages: FinancialEvidencePackage[];
  ocrLearnedPatterns: OcrLearnedPattern[];
  loading: boolean;
  error: string | null;
  
  addFinancialEvent: (event: Omit<FinancialEvent, "id">) => FinancialEvent;
  editFinancialEvent: (id: string, updated: Partial<FinancialEvent>) => void;
  deleteFinancialEvent: (id: string) => void;
  
  addCashAccount: (account: Omit<CashAccount, "id">) => CashAccount;
  editCashAccount: (id: string, updated: Partial<CashAccount>) => void;
  deleteCashAccount: (id: string) => void;
  
  addBankAccount: (account: Omit<BankAccount, "id">) => BankAccount;
  editBankAccount: (id: string, updated: Partial<BankAccount>) => void;
  deleteBankAccount: (id: string) => void;
  
  addDebtRecord: (debt: Omit<DebtRecord, "id">) => DebtRecord;
  editDebtRecord: (id: string, updated: Partial<DebtRecord>) => void;
  deleteDebtRecord: (id: string) => void;

  addFinancialCommitment: (commitment: Omit<FinancialCommitment, "id">) => FinancialCommitment;
  editFinancialCommitment: (id: string, updated: Partial<FinancialCommitment>) => void;
  deleteFinancialCommitment: (id: string) => void;

  addFinancialEvidencePackage: (pkg: Omit<FinancialEvidencePackage, "id">) => FinancialEvidencePackage;
  editFinancialEvidencePackage: (id: string, updated: Partial<FinancialEvidencePackage>) => void;
  deleteFinancialEvidencePackage: (id: string) => void;
  
  learnOcrPattern: (pattern: Omit<OcrLearnedPattern, "id" | "occurrenceCount" | "lastUpdated">) => void;
  deleteOcrLearnedPattern: (id: string) => void;

  resetWorkspaceData: () => void;
  restoreWorkspaceData: (data: {
    financialEvents: any[];
    cashAccounts: any[];
    bankAccounts: any[];
    debtRecords: any[];
    financialCommitments: any[];
    financialEvidencePackages: any[];
    ocrLearnedPatterns: any[];
  }) => Promise<void>;
}


const FinancialRecordsContext = createContext<FinancialRecordsContextType | undefined>(undefined);

// Default Preseeded Datasets to create a rich, realistic interactive sandbox
const getPresetCashAccounts = (workspaceId: string): CashAccount[] => {
  if (workspaceId === "ws-demo-personal") {
    return [
      { id: `c-pers-1`, workspaceId, name: "Physical Purse & Wallet", responsiblePerson: "Me", currentBalanceMyr: 450.00 },
      { id: `c-pers-2`, workspaceId, name: "Home Emergency Safe Cash Box", responsiblePerson: "Me", currentBalanceMyr: 2500.00 },
    ];
  }
  if (workspaceId === "ws-demo-company-a") {
    return [
      { id: `c-comp-a-1`, workspaceId, name: "Counter POS Cash Float Drawer", responsiblePerson: "Head Baker Ali", currentBalanceMyr: 850.00 },
      { id: `c-comp-a-2`, workspaceId, name: "Backoffice Petty Cash Drawer", responsiblePerson: "Bakery Manager Jess", currentBalanceMyr: 1500.00 },
    ];
  }
  if (workspaceId === "ws-demo-company-b") {
    return [
      { id: `c-comp-b-1`, workspaceId, name: "HQ Executive Petty Cash Vault", responsiblePerson: "Finance Associate Lim", currentBalanceMyr: 5000.00 },
    ];
  }
  // Generic Workspace defaults
  return [
    { id: `c-${workspaceId}-1`, workspaceId, name: "Primary Petty Cash Drawer", responsiblePerson: "Assigned Administrator", currentBalanceMyr: 1000.00 }
  ];
};

const getPresetBankAccounts = (workspaceId: string): BankAccount[] => {
  if (workspaceId === "ws-demo-personal") {
    return [
      { id: `b-pers-1`, workspaceId, bankName: "Maybank Bhd", accountNumber: "1140-1283-9912", accountName: "Personal Savings Maybank Account", branchName: "Kuala Lumpur Central", currentBalanceMyr: 45200.00 },
      { id: `b-pers-2`, workspaceId, bankName: "CIMB Islamic", accountNumber: "8600-9921-2231", accountName: "Joint Secondary Investment Account", branchName: "Subang Jaya", currentBalanceMyr: 15400.00 },
    ];
  }
  if (workspaceId === "ws-demo-company-a") {
    return [
      { id: `b-com-a-1`, workspaceId, bankName: "Maybank Commercial", accountNumber: "5140-9912-1049", accountName: "LemonTree Operations Current Account", branchName: "Cheras Leisure Mall", currentBalanceMyr: 89350.00 },
      { id: `b-com-a-2`, workspaceId, bankName: "RHB Corporate", accountNumber: "2142-8812-7821", accountName: "LemonTree Secondary Supplier Escrow", branchName: "Kajang Main", currentBalanceMyr: 12500.00 },
    ];
  }
  if (workspaceId === "ws-demo-company-b") {
    return [
      { id: `b-com-b-1`, workspaceId, bankName: "CIMB Bank Enterprise", accountNumber: "7042-1200-9831", accountName: "Apex Holdings Treasury Master", branchName: "Bangsar South", currentBalanceMyr: 1450000.00 },
    ];
  }
  return [
    { id: `b-${workspaceId}-1`, workspaceId, bankName: "Maybank Bhd", accountNumber: "1234-5678-9012", accountName: "Default Clearing Bank Account", branchName: "Main Branch", currentBalanceMyr: 15000.00 }
  ];
};

const getPresetDebts = (workspaceId: string): DebtRecord[] => {
  if (workspaceId === "ws-demo-personal") {
    return [
      { id: `d-pers-1`, workspaceId, creditorName: "Maybank Auto Financing Division", borrowedDate: "2025-01-15", repaymentDueDate: "2032-01-15", totalAmountMyr: 85000.00, repaidAmountMyr: 16500.00, interestRateAnnualPercent: 2.85, status: "ACTIVE", description: "Proton Saga standard sedan asset financing." },
      { id: `d-pers-2`, workspaceId, creditorName: "CIMB Credit Card Facility", borrowedDate: "2026-05-10", repaymentDueDate: "2026-06-25", totalAmountMyr: 4500.00, repaidAmountMyr: 1500.00, interestRateAnnualPercent: 15.00, status: "ACTIVE", description: "Consumer household electronics purchases." },
    ];
  }
  if (workspaceId === "ws-demo-company-a") {
    return [
      { id: `d-comp-a-1`, workspaceId, creditorName: "SME Corp Malaysia MicroFinance", borrowedDate: "2024-06-10", repaymentDueDate: "2027-06-10", totalAmountMyr: 50000.00, repaidAmountMyr: 35000.00, interestRateAnnualPercent: 4.00, status: "ACTIVE", description: "Baking oven upgrades & storefront cooling systems procurement." },
    ];
  }
  if (workspaceId === "ws-demo-company-b") {
    return [
      { id: `d-comp-b-1`, workspaceId, creditorName: "Affin Bank Corporate Syndicate Loan", borrowedDate: "2023-10-01", repaymentDueDate: "2028-10-01", totalAmountMyr: 1000000.00, repaidAmountMyr: 450000.00, interestRateAnnualPercent: 5.50, status: "ACTIVE", description: "Acquisition facility for premium brick-and-mortar storefront properties in Selangor." },
    ];
  }
  return [];
};

const getPresetFinancialCommitments = (workspaceId: string): FinancialCommitment[] => {
  if (workspaceId === "ws-demo-personal") {
    return [
      { id: `cmt-pers-1`, workspaceId, description: "Unifi Gigabit Broadband internet", contractNumber: "UNF-88219-MY", obligeeName: "Telekom Malaysia Bhd", amountPerIntervalMyr: 149.00, recurrence: "MONTHLY", startDate: "2026-06-01", isActive: true, status: "ACTIVE" },
      { id: `cmt-pers-2`, workspaceId, description: "AIA Premium Life & Medical Shield insurance", contractNumber: "AIA-ML-99120", obligeeName: "AIA Malaysia Insurance", amountPerIntervalMyr: 320.00, recurrence: "MONTHLY", startDate: "2026-06-05", isActive: true, status: "ACTIVE" },
      { id: `cmt-pers-3`, workspaceId, description: "Cheras Serviced Apartment rental lease", contractNumber: "APT-CHER-442", obligeeName: "Seremban Heights Realty", amountPerIntervalMyr: 2200.00, recurrence: "MONTHLY", startDate: "2026-06-01", isActive: true, status: "ACTIVE" },
      { id: `cmt-pers-4`, workspaceId, description: "TNB Private Electricity Bills utilities", contractNumber: "TNB-9981-221", obligeeName: "Tenaga Nasional Berhad", amountPerIntervalMyr: 250.00, recurrence: "MONTHLY", startDate: "2026-06-15", isActive: true, status: "ACTIVE" },
    ];
  }
  if (workspaceId === "ws-demo-company-a") {
    return [
      { id: `cmt-comp-a-1`, workspaceId, description: "Baking equipment monthly asset loan", contractNumber: "SME-LN-44211", obligeeName: "SME Corp Malaysia MicroFinance", amountPerIntervalMyr: 1500.00, recurrence: "MONTHLY", startDate: "2026-06-10", isActive: true, status: "ACTIVE" },
      { id: `cmt-comp-a-2`, workspaceId, description: "LemonTree Bakery shop lot rent lease", contractNumber: "LSE-LTB-09A", obligeeName: "Boulevard Properties Sdn Bhd", amountPerIntervalMyr: 4500.00, recurrence: "MONTHLY", startDate: "2026-06-01", isActive: true, status: "ACTIVE" },
      { id: `cmt-comp-a-3`, workspaceId, description: "Weekly dairy delivery supplier agreement", contractNumber: "SUP-D-329", obligeeName: "Seng Lee Wholesalers", amountPerIntervalMyr: 800.00, recurrence: "WEEKLY", startDate: "2026-06-03", isActive: true, status: "ACTIVE" },
    ];
  }
  if (workspaceId === "ws-demo-company-b") {
    return [
      { id: `cmt-comp-b-1`, workspaceId, description: "Premium corporate central air lease utilities", contractNumber: "AC-LSE-882", obligeeName: "Apex Building Management", amountPerIntervalMyr: 3500.00, recurrence: "MONTHLY", startDate: "2026-06-01", isActive: true, status: "ACTIVE" },
      { id: `cmt-comp-b-2`, workspaceId, description: "Monthly insurance broker corporate package", contractNumber: "INS-CORP-901", obligeeName: "Allianz General Insurance MY", amountPerIntervalMyr: 1850.00, recurrence: "MONTHLY", startDate: "2026-06-05", isActive: true, status: "ACTIVE" },
    ];
  }
  return [
    { id: `cmt-${workspaceId}-1`, workspaceId, description: "Corporate workspace internet contract lease", contractNumber: "NET-LSE-221", obligeeName: "Maxis Broadband", amountPerIntervalMyr: 199.00, recurrence: "MONTHLY", startDate: "2026-06-01", isActive: true, status: "ACTIVE" }
  ];
};

const getPresetFinancialEvents = (workspaceId: string): FinancialEvent[] => {
  if (workspaceId === "ws-demo-personal") {
    return [
      { id: `fe-pers-1`, workspaceId, type: "INCOME", categoryName: "Salary Credit", amountMyr: 8500.00, partyName: "System Employer Corp", date: "2026-06-01", referenceNumber: "TXN-SAL-98213", description: "Monthly professional consulting services retainer.", isCompleted: true, bankAccountId: "b-pers-1" },
      { id: `fe-pers-2`, workspaceId, type: "EXPENSE", categoryName: "Housing Allowance", amountMyr: 2200.00, partyName: "Seremban Heights Realty", date: "2026-06-03", referenceNumber: "TXN-EXP-88123", description: "Monthly apartment lease payment.", isCompleted: true, bankAccountId: "b-pers-1" },
      { id: `fe-pers-3`, workspaceId, type: "EXPENSE", categoryName: "Grocery Costs", amountMyr: 450.50, partyName: "Jaya Grocer KL", date: "2026-06-05", referenceNumber: "TXN-EXP-11223", description: "Weekly food supply and kitchen stock.", isCompleted: true, cashAccountId: "c-pers-1" },
      { id: `fe-pers-4`, workspaceId, type: "RECEIVABLE", categoryName: "Freelance Design Fee", amountMyr: 1800.00, partyName: "Innovate Studio MY", date: "2026-06-08", dueDate: "2026-06-30", referenceNumber: "INV-FRE-0012", description: "Outstanding payment vector mockup files and user interface assets.", isCompleted: false },
      { id: `fe-pers-5`, workspaceId, type: "DEBT", categoryName: "Maybank Auto Instalment", amountMyr: 850.00, partyName: "Maybank Credit Unit", date: "2026-06-10", referenceNumber: "TXN-DEB-71285", description: "Monthly hire purchase installment deduct.", isCompleted: true, bankAccountId: "b-pers-1" },
    ];
  }
  if (workspaceId === "ws-demo-company-a") {
    return [
      { id: `fe-comp-a-1`, workspaceId, type: "INCOME", categoryName: "Point of Sale Revenues", amountMyr: 24750.00, partyName: "Retail Storefront Counter A", date: "2026-06-08", referenceNumber: "POS-BAKERY-9988", description: "Aggregated weekly retail bakery receipt batches.", isCompleted: true, bankAccountId: "b-com-a-1" },
      { id: `fe-comp-a-2`, workspaceId, type: "EXPENSE", categoryName: "Baking Supplies Raw Materials", amountMyr: 6800.00, partyName: "Federal Flour Mills Bhd", date: "2026-06-02", referenceNumber: "INV-FFM-2291", description: "Bulk grade organic wheat flour, baker's yeast, unsalted butter.", isCompleted: true, bankAccountId: "b-com-a-1" },
      { id: `fe-comp-a-3`, workspaceId, type: "RECEIVABLE", categoryName: "Catering Trade Receivable", amountMyr: 3500.00, partyName: "Alliance Corporate Functions", date: "2026-06-10", dueDate: "2026-06-28", referenceNumber: "CST-CAT-5544", description: "Premium high-density dessert catering for stakeholder AGM.", isCompleted: false },
      { id: `fe-comp-a-4`, workspaceId, type: "PAYABLE", categoryName: "Sugar & Dairy Supply Overdue", amountMyr: 1200.00, partyName: "Seng Lee Wholesalers", date: "2026-06-05", dueDate: "2026-06-20", referenceNumber: "VND-SLW-8812", description: "Bulk brown sugar and heavy whipping creams invoice.", isCompleted: false },
    ];
  }
  if (workspaceId === "ws-demo-company-b") {
    return [
      { id: `fe-comp-b-1`, workspaceId, type: "INCOME", categoryName: "Holding Retainer Commissions", amountMyr: 125000.00, partyName: "Apex Subsidiary Ventures MY", date: "2026-06-01", referenceNumber: "TXN-HLD-0019", description: "Quarterly management oversight strategic fee allocations.", isCompleted: true, bankAccountId: "b-com-b-1" },
      { id: `fe-comp-b-2`, workspaceId, type: "EXPENSE", categoryName: "Legal Consulting Advisory", amountMyr: 15400.00, partyName: "Zaid Ibrahim & Co Advocates", date: "2026-06-05", referenceNumber: "LGL-ZICO-8832", description: "M&A target regulatory vetting and corporate validation filing.", isCompleted: true, bankAccountId: "b-com-b-1" },
      { id: `fe-comp-b-3`, workspaceId, type: "PAYABLE", categoryName: "Audit & Advisory Fees", amountMyr: 45000.00, partyName: "Ernst & Young MY", date: "2026-06-09", dueDate: "2026-07-15", referenceNumber: "EY-AUD-6623", description: "Annual corporate financial history auditing fees.", isCompleted: false },
    ];
  }
  return [];
};

const getPresetEvidencePackages = (workspaceId: string): FinancialEvidencePackage[] => {
  if (workspaceId === "ws-demo-personal") {
    return [
      {
        id: "ev-pers-1",
        workspaceId,
        documentType: "RECEIPT",
        uploadDate: "2026-06-03",
        fileName: "le_apartment_lease_agreement.jpg",
        fileUrl: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=600&q=85",
        relatedRecordType: "EXPENSE",
        relatedRecordId: "fe-pers-2",
        notes: "Apartment lease payment receipt Seremban Heights Realty"
      },
      {
        id: "ev-pers-2",
        workspaceId,
        documentType: "STATEMENT",
        uploadDate: "2026-06-10",
        fileName: "maybank_savings_may_2026.pdf",
        fileUrl: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=600&q=85",
        notes: "Monthly Maybank Savings Balance Verification Sheet."
      }
    ];
  }
  if (workspaceId === "ws-demo-company-a") {
    return [
      {
        id: "ev-comp-a-1",
        workspaceId,
        documentType: "INVOICE",
        uploadDate: "2026-06-02",
        fileName: "ffm_wholesale_flour_invoice.pdf",
        fileUrl: "https://images.unsplash.com/photo-1568252542512-9fe8fe9c87bb?auto=format&fit=crop&w=600&q=85",
        relatedRecordType: "EXPENSE",
        relatedRecordId: "fe-comp-a-2",
        notes: "Raw Grade wheat flour container receipt validation and logistics stamp."
      }
    ];
  }
  return [];
};


// Cryptographically robust UUID generator for client entities (if needed)
const generateUUID = (): string => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// Normalizes a vendor name into a matching key for OCR learning: lowercases,
// strips common Malaysian entity suffixes and punctuation, so "Tenaga Nasional
// Bhd" and "Tenaga Nasional Berhad" collapse to the same key.
const VENDOR_SUFFIX_PATTERN = /\b(sdn\.?\s*bhd\.?|sendirian\s*berhad|berhad|bhd\.?|enterprise|enterprises|trading|holdings|group|sole\s*proprietor|plt|llp|inc\.?|ltd\.?|corp\.?|corporation)\b/g;
const vendorMatchKey = (name: string): string =>
  name
    .toLowerCase()
    .replace(VENDOR_SUFFIX_PATTERN, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// Levenshtein edit distance, used to tolerate minor spelling drift between
// vendor name entries (typos, OCR misreads) when matching learned patterns.
const levenshteinDistance = (a: string, b: string): number => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j - 1], prev[j], row[j - 1]);
    }
    prev.splice(0, prev.length, ...row);
  }
  return prev[b.length];
};

// Two vendor keys are considered the same learned vendor if they're identical
// once normalized, or close enough (small absolute edit distance relative to
// length) to be the same name with minor spelling/OCR variation. Short keys
// require an exact match to avoid false positives between unrelated short names.
const isFuzzyVendorMatch = (keyA: string, keyB: string): boolean => {
  if (!keyA || !keyB) return false;
  if (keyA === keyB) return true;
  const maxLen = Math.max(keyA.length, keyB.length);
  if (maxLen < 5) return false;
  const distance = levenshteinDistance(keyA, keyB);
  const threshold = maxLen <= 10 ? 1 : 2;
  return distance <= threshold;
};

export const FinancialRecordsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isMockUser } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { writeAuditLog } = useAudit();

  const [financialEvents, setFinancialEvents] = useState<FinancialEvent[]>([]);
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [debtRecords, setDebtRecords] = useState<DebtRecord[]>([]);
  const [financialCommitments, setFinancialCommitments] = useState<FinancialCommitment[]>([]);
  const [financialEvidencePackages, setFinancialEvidencePackages] = useState<FinancialEvidencePackage[]>([]);
  const [ocrLearnedPatterns, setOcrLearnedPatterns] = useState<OcrLearnedPattern[]>([]);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  // Helper to get or dynamically initialize standard Category in Database
  const getOrCreateCategoryId = async (wsId: string, name: string, eventType: string): Promise<string> => {
    if (!supabase) throw new Error("Supabase client is not instantiated");

    let type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE" = "REVENUE";
    if (eventType === "EXPENSE" || eventType === "PAYABLE" || eventType === "DEBT") {
      type = "EXPENSE";
    } else if (eventType === "INCOME" || eventType === "RECEIVABLE") {
      type = "REVENUE";
    }

    // 1. Check if category exists
    const { data, error: fetchError } = await supabase
      .from("general_ledger_categories")
      .select("id")
      .eq("workspace_id", wsId)
      .eq("name", name)
      .maybeSingle();

    if (data?.id) {
      return data.id;
    }

    // 2. Insert new category standard code
    const generatedCode = String(Math.floor(Math.random() * 8999) + 1000);
    const { data: newCat, error: insertError } = await supabase
      .from("general_ledger_categories")
      .insert({
        workspace_id: wsId,
        name,
        code: generatedCode,
        type,
        is_system_default: false,
      })
      .select("id")
      .single();

    if (insertError) {
      throw insertError;
    }

    return newCat.id;
  };

  // Load active workspace-scoped models
  useEffect(() => {
    if (!user || !activeWorkspace) {
      setFinancialEvents([]);
      setCashAccounts([]);
      setBankAccounts([]);
      setDebtRecords([]);
      setFinancialCommitments([]);
      setLoading(false);
      return;
    }

    const loadData = async () => {
      setLoading(true);
      setError(null);
      const wsId = activeWorkspace.id;

      if (!isSupabaseConfigured() || isMockUser || isDemoWorkspace(wsId)) {
        // --- SANDBOX / LOCAL STORAGE FLOW ---
        const keyPrefix = `mykerani_financials_ws_${wsId}`;
        const storedEvents = localStorage.getItem(`${keyPrefix}_events`);
        const storedCash = localStorage.getItem(`${keyPrefix}_cash`);
        const storedBank = localStorage.getItem(`${keyPrefix}_bank`);
        const storedDebts = localStorage.getItem(`${keyPrefix}_debts`);
        const storedCommitments = localStorage.getItem(`${keyPrefix}_commitments`);
        const storedEvidence = localStorage.getItem(`${keyPrefix}_evidence`);
        const storedPatterns = localStorage.getItem(`${keyPrefix}_ocr_patterns`);

        if (storedEvents || storedCash || storedBank || storedDebts || storedCommitments || storedEvidence || storedPatterns) {
          try {
            setFinancialEvents(storedEvents ? JSON.parse(storedEvents) : []);
            setCashAccounts(storedCash ? JSON.parse(storedCash) : getPresetCashAccounts(wsId));
            setBankAccounts(storedBank ? JSON.parse(storedBank) : getPresetBankAccounts(wsId));
            setDebtRecords(storedDebts ? JSON.parse(storedDebts) : getPresetDebts(wsId));
            setFinancialCommitments(storedCommitments ? JSON.parse(storedCommitments) : getPresetFinancialCommitments(wsId));
            setFinancialEvidencePackages(storedEvidence ? JSON.parse(storedEvidence) : getPresetEvidencePackages(wsId));
            setOcrLearnedPatterns(storedPatterns ? JSON.parse(storedPatterns) : []);
          } catch (e) {
            console.error("Error loading financials context: ", e);
            setPresenterPresets();
          }
        } else {
          setPresenterPresets();
        }
        setLoading(false);
      } else {
        // --- REAL SUPABASE CLIENT FLOW ---
        if (!supabase) {
          setLoading(false);
          return;
        }

        try {
          // 1. Fetch categories
          const { data: catData, error: catError } = await supabase
            .from("general_ledger_categories")
            .select("*")
            .eq("workspace_id", wsId);
          if (catError) {
            console.warn("general_ledger_categories not ready, skipping:", catError.message);
          }

          const categoryMap = new Map<string, string>();
          catData?.forEach((c) => categoryMap.set(c.id, c.name));

          // 2. Fetch cash accounts
          const { data: cashData, error: cashError } = await supabase
            .from("cash_accounts")
            .select("*")
            .eq("workspace_id", wsId);
          if (cashError) throw cashError;

          // 3. Fetch bank accounts
          const { data: bankData, error: bankError } = await supabase
            .from("bank_accounts")
            .select("*")
            .eq("workspace_id", wsId);
          if (bankError) throw bankError;

          // 4. Fetch debts
          const { data: debtData, error: debtError } = await supabase
            .from("debts")
            .select("*")
            .eq("workspace_id", wsId);
          if (debtError) throw debtError;

          // 5. Fetch incomes
          const { data: incomeData, error: incomeError } = await supabase
            .from("income_records")
            .select("*")
            .eq("workspace_id", wsId);
          if (incomeError) throw incomeError;

          // 6. Fetch expenses
          const { data: expenseData, error: expenseError } = await supabase
            .from("expense_records")
            .select("*")
            .eq("workspace_id", wsId);
          if (expenseError) throw expenseError;

          // 7. Fetch receivables
          const { data: receivableData, error: receivableError } = await supabase
            .from("receivables")
            .select("*")
            .eq("workspace_id", wsId);
          if (receivableError) throw receivableError;

          // 8. Fetch payables
          const { data: payableData, error: payableError } = await supabase
            .from("payables")
            .select("*")
            .eq("workspace_id", wsId);
          if (payableError) throw payableError;

          // Map data to state
          const mappedCash: CashAccount[] = (cashData || []).map((row) => ({
            id: row.id,
            workspaceId: row.workspace_id,
            name: row.name,
            responsiblePerson: row.physical_location || "",
            currentBalanceMyr: parseFloat(row.current_balance_myr || 0),
          }));

          const mappedBank: BankAccount[] = (bankData || []).map((row) => ({
            id: row.id,
            workspaceId: row.workspace_id,
            bankName: row.bank_name,
            accountNumber: row.account_number,
            accountName: row.account_name,
            branchName: row.branch_name || "",
            currentBalanceMyr: parseFloat(row.current_balance_myr || 0),
          }));

          const mappedDebts: DebtRecord[] = (debtData || []).map((row) => ({
            id: row.id,
            workspaceId: row.workspace_id,
            creditorName: row.lender_name,
            borrowedDate: row.origination_date,
            repaymentDueDate: row.maturity_date || undefined,
            totalAmountMyr: parseFloat(row.principal_amount_myr || 0),
            repaidAmountMyr: parseFloat(row.principal_amount_myr || 0) - parseFloat(row.outstanding_balance_myr || 0),
            interestRateAnnualPercent: parseFloat(row.annual_interest_rate || 0),
            status: parseFloat(row.outstanding_balance_myr) === 0 ? "FULLY_REPAID" : "ACTIVE",
            description: row.description || "",
          }));

          const eventsList: FinancialEvent[] = [];

          // Translate incomes
          (incomeData || []).forEach((row) => {
            eventsList.push({
              id: row.id,
              workspaceId: row.workspace_id,
              type: "INCOME",
              categoryName: categoryMap.get(row.category_id) || "Salary Credit",
              amountMyr: parseFloat(row.amount_myr || 0),
              partyName: row.payer_name || "",
              date: row.transaction_date,
              referenceNumber: row.reference_number || "",
              description: row.description || "",
              isCompleted: true,
              bankAccountId: row.source_bank_account_id || undefined,
              cashAccountId: row.source_cash_account_id || undefined,
            });
          });

          // Translate expenses
          (expenseData || []).forEach((row) => {
            const isDebt = row.description?.includes("[DEBT]");
            eventsList.push({
              id: row.id,
              workspaceId: row.workspace_id,
              type: isDebt ? "DEBT" : "EXPENSE",
              categoryName: categoryMap.get(row.category_id) || "General Expense",
              amountMyr: parseFloat(row.amount_myr || 0),
              partyName: row.recipient_vendor_name || "",
              date: row.transaction_date,
              referenceNumber: row.reference_number || "",
              description: isDebt ? row.description.replace("[DEBT] ", "") : row.description || "",
              isCompleted: true,
              bankAccountId: row.payment_bank_account_id || undefined,
              cashAccountId: row.payment_cash_account_id || undefined,
            });
          });

          // Translate receivables
          (receivableData || []).forEach((row) => {
            eventsList.push({
              id: row.id,
              workspaceId: row.workspace_id,
              type: "RECEIVABLE",
              categoryName: categoryMap.get(row.category_id) || "Catering Trade Receivable",
              amountMyr: parseFloat(row.total_amount_myr || 0),
              partyName: row.customer_name || "",
              date: row.invoice_date,
              dueDate: row.due_date || undefined,
              referenceNumber: row.invoice_number || "",
              description: "Outstanding design services invoice project.",
              isCompleted: row.status === "PAID",
            });
          });

          // Translate payables
          (payableData || []).forEach((row) => {
            eventsList.push({
              id: row.id,
              workspaceId: row.workspace_id,
              type: "PAYABLE",
              categoryName: categoryMap.get(row.category_id) || "Supplier Payables",
              amountMyr: parseFloat(row.total_amount_myr || 0),
              partyName: row.vendor_name || "",
              date: row.bill_date,
              dueDate: row.due_date || undefined,
              referenceNumber: row.bill_number || "",
              description: "Bulk raw materials receipt order.",
              isCompleted: row.status === "PAID",
            });
          });

          // Sort descending
          eventsList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

          // Fetch commitments from Supabase
          let commitmentsData: any[] = [];
          try {
            const { data: cmtData, error: cmtError } = await supabase
              .from("financial_commitments")
              .select("*")
              .eq("workspace_id", wsId);
            if (!cmtError && cmtData) {
              commitmentsData = cmtData;
            } else if (cmtError) {
              console.warn("Could not fetch commitments from Supabase, table might not exist yet:", cmtError.message);
            }
          } catch (cmtEx: any) {
            console.warn("Supabase commitments exception, fallback to local sandbox:", cmtEx.message);
          }

          const mappedCommitments: FinancialCommitment[] = [];
          if (commitmentsData && commitmentsData.length > 0) {
            commitmentsData.forEach((row) => {
              mappedCommitments.push({
                id: row.id,
                workspaceId: row.workspace_id,
                description: row.description,
                contractNumber: row.contract_number || undefined,
                obligeeName: row.obligee_name,
                amountPerIntervalMyr: parseFloat(row.amount_per_interval_myr || 0),
                recurrence: row.recurrence || "MONTHLY",
                startDate: row.start_date,
                endDate: row.end_date || undefined,
                isActive: row.is_active !== false,
                status: row.is_active !== false ? "ACTIVE" : "PAUSED",
              });
            });
          }
          // Real user: kalau Supabase kosong, kekal kosong — jangan load demo data

          // Fetch evidence packages from Supabase
          let evidenceData: any[] = [];
          try {
            const { data: evData, error: evError } = await supabase
              .from("financial_evidence_packages")
              .select("*")
              .eq("workspace_id", wsId);
            if (!evError && evData) {
              evidenceData = evData;
            } else if (evError) {
              console.warn("Could not fetch evidence from Supabase:", evError.message);
            }
          } catch (evEx: any) {
            console.warn("Supabase evidence exception, fallback to local:", evEx.message);
          }

          const mappedEvidence: FinancialEvidencePackage[] = [];
          if (evidenceData && evidenceData.length > 0) {
            evidenceData.forEach((row) => {
              mappedEvidence.push({
                id: row.id,
                workspaceId: row.workspace_id,
                documentType: row.document_type || "SUPPORTING_DOC",
                uploadDate: row.upload_date,
                fileName: row.file_name,
                fileUrl: row.file_url,
                relatedRecordType: row.related_record_type || undefined,
                relatedRecordId: row.related_record_id || undefined,
                notes: row.notes || undefined,
              });
            });
          }
          // Real user: kalau Supabase kosong, kekal kosong — jangan load demo data

          // Load OCR learned patterns from local storage as fallback or principal
          const keyPrefixStr = `mykerani_financials_ws_${wsId}`;
          const storedPatternsStr = localStorage.getItem(`${keyPrefixStr}_ocr_patterns`);
          let loadedPatterns: OcrLearnedPattern[] = storedPatternsStr ? JSON.parse(storedPatternsStr) : [];

          if (isSupabaseConfigured() && !isMockUser && supabase) {
            try {
              const { data: ocrData, error: ocrError } = await supabase
                .from("ocr_learned_patterns")
                .select("*")
                .eq("workspace_id", wsId);
              if (!ocrError && ocrData) {
                loadedPatterns = ocrData.map((row) => ({
                  id: row.id,
                  workspaceId: row.workspace_id,
                  vendorName: row.vendor_name,
                  category: row.category,
                  recordType: row.record_type as any,
                  confidenceScore: parseFloat(row.confidence_score || 0),
                  occurrenceCount: parseInt(row.occurrence_count || 1),
                  lastUpdated: row.last_updated || new Date().toISOString()
                }));
              }
            } catch (ex) {
              console.warn("Could not load ocr_learned_patterns from database:", ex);
            }
          }
          setOcrLearnedPatterns(loadedPatterns);

          setFinancialEvents(eventsList);
          setCashAccounts(mappedCash);
          setBankAccounts(mappedBank);
          setDebtRecords(mappedDebts);
          setFinancialCommitments(mappedCommitments);
          setFinancialEvidencePackages(mappedEvidence);
          setLoading(false);
        } catch (dbError: any) {
          console.warn("Database Loader Error (table may need setup):", dbError.message);
          // Real user: tables tak wujud lagi — data kosong, JANGAN load demo data
          setFinancialEvents([]);
          setCashAccounts([]);
          setBankAccounts([]);
          setDebtRecords([]);
          setFinancialCommitments([]);
          setFinancialEvidencePackages([]);
          setOcrLearnedPatterns([]);
          setError(null);
          setLoading(false);
        }
      }
    };

    loadData();
  }, [user, activeWorkspace, isMockUser]);

  const setPresenterPresets = () => {
    if (!activeWorkspace) return;
    const wsId = activeWorkspace.id;
    const presetEvents = getPresetFinancialEvents(wsId);
    const presetCash = getPresetCashAccounts(wsId);
    const presetBank = getPresetBankAccounts(wsId);
    const presetDebts = getPresetDebts(wsId);
    const presetCommitments = getPresetFinancialCommitments(wsId);
    const presetEvidence = getPresetEvidencePackages(wsId);

    setFinancialEvents(presetEvents);
    setCashAccounts(presetCash);
    setBankAccounts(presetBank);
    setDebtRecords(presetDebts);
    setFinancialCommitments(presetCommitments);
    setFinancialEvidencePackages(presetEvidence);
    setOcrLearnedPatterns([]);

    saveToStorage(wsId, presetEvents, presetCash, presetBank, presetDebts, presetCommitments, presetEvidence, []);
  };

  const saveToStorage = (
    wsId: string,
    events: FinancialEvent[],
    cash: CashAccount[],
    bank: BankAccount[],
    debts: DebtRecord[],
    commitments: FinancialCommitment[],
    evidence: FinancialEvidencePackage[] = financialEvidencePackages,
    ocrPatterns: OcrLearnedPattern[] = ocrLearnedPatterns
  ) => {
    const keyPrefix = `mykerani_financials_ws_${wsId}`;
    localStorage.setItem(`${keyPrefix}_events`, JSON.stringify(events));
    localStorage.setItem(`${keyPrefix}_cash`, JSON.stringify(cash));
    localStorage.setItem(`${keyPrefix}_bank`, JSON.stringify(bank));
    localStorage.setItem(`${keyPrefix}_debts`, JSON.stringify(debts));
    localStorage.setItem(`${keyPrefix}_commitments`, JSON.stringify(commitments));
    localStorage.setItem(`${keyPrefix}_evidence`, JSON.stringify(evidence));
    localStorage.setItem(`${keyPrefix}_ocr_patterns`, JSON.stringify(ocrPatterns));
  };

  const persistCurrentState = (
    eventsUpdate = financialEvents,
    cashUpdate = cashAccounts,
    bankUpdate = bankAccounts,
    debtsUpdate = debtRecords,
    commitmentsUpdate = financialCommitments,
    evidenceUpdate = financialEvidencePackages,
    ocrPatternsUpdate = ocrLearnedPatterns
  ) => {
    if (!activeWorkspace) return;
    saveToStorage(activeWorkspace.id, eventsUpdate, cashUpdate, bankUpdate, debtsUpdate, commitmentsUpdate, evidenceUpdate, ocrPatternsUpdate);
  };


  // --- Financial Events Actions ---
  const addFinancialEvent = (event: Omit<FinancialEvent, "id">): FinancialEvent => {
    const newId = generateUUID();
    const newEvent: FinancialEvent = { ...event, id: newId };

    // Update locally optimistically
    const updated = [newEvent, ...financialEvents];
    setFinancialEvents(updated);

    let updatedCash = [...cashAccounts];
    let updatedBank = [...bankAccounts];

    if (newEvent.isCompleted) {
      const isIngress = newEvent.type === "INCOME" || newEvent.type === "RECEIVABLE";
      const factor = isIngress ? 1 : -1;
      const amt = newEvent.amountMyr * factor;

      if (newEvent.cashAccountId) {
        updatedCash = cashAccounts.map((acct) =>
          acct.id === newEvent.cashAccountId
            ? { ...acct, currentBalanceMyr: acct.currentBalanceMyr + amt }
            : acct
        );
        setCashAccounts(updatedCash);
      } else if (newEvent.bankAccountId) {
        updatedBank = bankAccounts.map((acct) =>
          acct.id === newEvent.bankAccountId
            ? { ...acct, currentBalanceMyr: acct.currentBalanceMyr + amt }
            : acct
        );
        setBankAccounts(updatedBank);
      }
    }

    persistCurrentState(updated, updatedCash, updatedBank);

    if (activeWorkspace) {
      writeAuditLog({
        workspaceId: activeWorkspace.id,
        module: "Financial Records",
        action: "CREATE",
        oldValue: null,
        newValue: newEvent
      });
    }

    // Save to Database in the background
    if (isSupabaseConfigured() && !isMockUser && supabase && activeWorkspace && !isDemoWorkspace(activeWorkspace.id)) {
      (async () => {
        try {
          const catId = await getOrCreateCategoryId(activeWorkspace.id, newEvent.categoryName, newEvent.type);

          if (newEvent.type === "INCOME") {
            await supabase.from("income_records").insert({
              id: newId,
              workspace_id: activeWorkspace.id,
              category_id: catId,
              source_bank_account_id: newEvent.bankAccountId || null,
              source_cash_account_id: newEvent.cashAccountId || null,
              payer_name: newEvent.partyName,
              amount_myr: newEvent.amountMyr,
              transaction_date: newEvent.date,
              reference_number: newEvent.referenceNumber,
              description: newEvent.description,
            });
          } else if (newEvent.type === "EXPENSE" || newEvent.type === "DEBT") {
            await supabase.from("expense_records").insert({
              id: newId,
              workspace_id: activeWorkspace.id,
              category_id: catId,
              payment_bank_account_id: newEvent.bankAccountId || null,
              payment_cash_account_id: newEvent.cashAccountId || null,
              recipient_vendor_name: newEvent.partyName,
              amount_myr: newEvent.amountMyr,
              tax_amount_myr: 0,
              transaction_date: newEvent.date,
              reference_number: newEvent.referenceNumber,
              description: newEvent.type === "DEBT" ? `[DEBT] ${newEvent.description}` : newEvent.description,
            });
          } else if (newEvent.type === "RECEIVABLE") {
            await supabase.from("receivables").insert({
              id: newId,
              workspace_id: activeWorkspace.id,
              customer_name: newEvent.partyName,
              invoice_number: newEvent.referenceNumber,
              invoice_date: newEvent.date,
              due_date: newEvent.dueDate || newEvent.date,
              total_amount_myr: newEvent.amountMyr,
              paid_amount_myr: newEvent.isCompleted ? newEvent.amountMyr : 0,
              status: newEvent.isCompleted ? "PAID" : "UNPAID",
              category_id: catId,
            });
          } else if (newEvent.type === "PAYABLE") {
            await supabase.from("payables").insert({
              id: newId,
              workspace_id: activeWorkspace.id,
              vendor_name: newEvent.partyName,
              bill_number: newEvent.referenceNumber,
              bill_date: newEvent.date,
              due_date: newEvent.dueDate || newEvent.date,
              total_amount_myr: newEvent.amountMyr,
              paid_amount_myr: newEvent.isCompleted ? newEvent.amountMyr : 0,
              status: newEvent.isCompleted ? "PAID" : "UNPAID",
              category_id: catId,
            });
          }
        } catch (err: any) {
          console.error("DB persistence insert record failed:", err.message);
        }
      })();
    }

    return newEvent;
  };

  const editFinancialEvent = (id: string, updated: Partial<FinancialEvent>) => {
    const originalEvent = financialEvents.find((item) => item.id === id);
    const nextList = financialEvents.map((item) =>
      item.id === id ? ({ ...item, ...updated } as FinancialEvent) : item
    );
    setFinancialEvents(nextList);
    persistCurrentState(nextList);

    if (activeWorkspace && originalEvent) {
      const mergedEvent = { ...originalEvent, ...updated };
      writeAuditLog({
        workspaceId: activeWorkspace.id,
        module: "Financial Records",
        action: "UPDATE",
        oldValue: originalEvent,
        newValue: mergedEvent
      });
    }

    if (isSupabaseConfigured() && !isMockUser && supabase && activeWorkspace && !isDemoWorkspace(activeWorkspace.id)) {
      (async () => {
        try {
          const item = financialEvents.find((e) => e.id === id);
          if (!item) return;

          const recordType = item.type;
          if (recordType === "INCOME") {
            await supabase
              .from("income_records")
              .update({
                payer_name: updated.partyName,
                amount_myr: updated.amountMyr,
                transaction_date: updated.date,
                reference_number: updated.referenceNumber,
                description: updated.description,
                source_bank_account_id: updated.bankAccountId || null,
                source_cash_account_id: updated.cashAccountId || null,
              })
              .eq("id", id)
              .eq("workspace_id", activeWorkspace.id);
          } else if (recordType === "EXPENSE" || recordType === "DEBT") {
            await supabase
              .from("expense_records")
              .update({
                recipient_vendor_name: updated.partyName,
                amount_myr: updated.amountMyr,
                transaction_date: updated.date,
                reference_number: updated.referenceNumber,
                description: recordType === "DEBT" ? `[DEBT] ${updated.description}` : updated.description,
                payment_bank_account_id: updated.bankAccountId || null,
                payment_cash_account_id: updated.cashAccountId || null,
              })
              .eq("id", id)
              .eq("workspace_id", activeWorkspace.id);
          } else if (recordType === "RECEIVABLE") {
            await supabase
              .from("receivables")
              .update({
                customer_name: updated.partyName,
                invoice_number: updated.referenceNumber,
                invoice_date: updated.date,
                due_date: updated.dueDate || updated.date,
                total_amount_myr: updated.amountMyr,
                paid_amount_myr: updated.isCompleted ? updated.amountMyr : 0,
                status: updated.isCompleted ? "PAID" : "UNPAID",
              })
              .eq("id", id)
              .eq("workspace_id", activeWorkspace.id);
          } else if (recordType === "PAYABLE") {
            await supabase
              .from("payables")
              .update({
                vendor_name: updated.partyName,
                bill_number: updated.referenceNumber,
                bill_date: updated.date,
                due_date: updated.dueDate || updated.date,
                total_amount_myr: updated.amountMyr,
                paid_amount_myr: updated.isCompleted ? updated.amountMyr : 0,
                status: updated.isCompleted ? "PAID" : "UNPAID",
              })
              .eq("id", id)
              .eq("workspace_id", activeWorkspace.id);
          }
        } catch (err: any) {
          console.error("DB persistence update record failed:", err.message);
        }
      })();
    }
  };

  const deleteFinancialEvent = (id: string) => {
    const originalEvent = financialEvents.find((item) => item.id === id);
    const nextList = financialEvents.filter((item) => item.id !== id);
    setFinancialEvents(nextList);
    persistCurrentState(nextList);

    if (activeWorkspace && originalEvent) {
      writeAuditLog({
        workspaceId: activeWorkspace.id,
        module: "Financial Records",
        action: "DELETE",
        oldValue: originalEvent,
        newValue: null
      });
    }

    if (isSupabaseConfigured() && !isMockUser && supabase && activeWorkspace && !isDemoWorkspace(activeWorkspace.id)) {
      (async () => {
        try {
          const item = financialEvents.find((e) => e.id === id);
          if (!item) return;

          const recordType = item.type;
          if (recordType === "INCOME") {
            await supabase.from("income_records").delete().eq("id", id).eq("workspace_id", activeWorkspace.id);
          } else if (recordType === "EXPENSE" || recordType === "DEBT") {
            await supabase.from("expense_records").delete().eq("id", id).eq("workspace_id", activeWorkspace.id);
          } else if (recordType === "RECEIVABLE") {
            await supabase.from("receivables").delete().eq("id", id).eq("workspace_id", activeWorkspace.id);
          } else if (recordType === "PAYABLE") {
            await supabase.from("payables").delete().eq("id", id).eq("workspace_id", activeWorkspace.id);
          }
        } catch (err: any) {
          console.error("DB persistence delete record failed:", err.message);
        }
      })();
    }
  };

  // --- Cash Accounts Actions ---
  const addCashAccount = (account: Omit<CashAccount, "id">): CashAccount => {
    const newId = generateUUID();
    const newAccount: CashAccount = { ...account, id: newId };
    const updated = [...cashAccounts, newAccount];
    setCashAccounts(updated);
    persistCurrentState(financialEvents, updated);

    if (isSupabaseConfigured() && !isMockUser && supabase && activeWorkspace && !isDemoWorkspace(activeWorkspace.id)) {
      (async () => {
        try {
          await supabase.from("cash_accounts").insert({
            id: newId,
            workspace_id: activeWorkspace.id,
            name: newAccount.name,
            physical_location: newAccount.responsiblePerson,
            current_balance_myr: newAccount.currentBalanceMyr,
            is_active: true,
          });
        } catch (err: any) {
          console.error("DB persistence insert cash failed:", err.message);
        }
      })();
    }

    return newAccount;
  };

  const editCashAccount = (id: string, updated: Partial<CashAccount>) => {
    const nextList = cashAccounts.map((item) =>
      item.id === id ? ({ ...item, ...updated } as CashAccount) : item
    );
    setCashAccounts(nextList);
    persistCurrentState(financialEvents, cashAccounts, nextList);

    if (isSupabaseConfigured() && !isMockUser && supabase && activeWorkspace && !isDemoWorkspace(activeWorkspace.id)) {
      (async () => {
        try {
          await supabase
            .from("cash_accounts")
            .update({
              name: updated.name,
              physical_location: updated.responsiblePerson,
              current_balance_myr: updated.currentBalanceMyr,
            })
            .eq("id", id)
            .eq("workspace_id", activeWorkspace.id);
        } catch (err: any) {
          console.error("DB persistence update cash failed:", err.message);
        }
      })();
    }
  };

  const deleteCashAccount = (id: string) => {
    const nextList = cashAccounts.filter((item) => item.id !== id);
    setCashAccounts(nextList);
    persistCurrentState(financialEvents, nextList);

    if (isSupabaseConfigured() && !isMockUser && supabase && activeWorkspace && !isDemoWorkspace(activeWorkspace.id)) {
      (async () => {
        try {
          await supabase.from("cash_accounts").delete().eq("id", id).eq("workspace_id", activeWorkspace.id);
        } catch (err: any) {
          console.error("DB persistence delete cash failed:", err.message);
        }
      })();
    }
  };

  // --- Bank Accounts Actions ---
  const addBankAccount = (account: Omit<BankAccount, "id">): BankAccount => {
    const newId = generateUUID();
    const newAccount: BankAccount = { ...account, id: newId };
    const updated = [...bankAccounts, newAccount];
    setBankAccounts(updated);
    persistCurrentState(financialEvents, cashAccounts, updated);

    if (isSupabaseConfigured() && !isMockUser && supabase && activeWorkspace && !isDemoWorkspace(activeWorkspace.id)) {
      (async () => {
        try {
          await supabase.from("bank_accounts").insert({
            id: newId,
            workspace_id: activeWorkspace.id,
            bank_name: newAccount.bankName,
            account_number: newAccount.accountNumber,
            account_name: newAccount.accountName,
            branch_name: newAccount.branchName,
            account_type: "CURRENT",
            current_balance_myr: newAccount.currentBalanceMyr,
            is_active: true,
          });
        } catch (err: any) {
          console.error("DB persistence insert bank failed:", err.message);
        }
      })();
    }

    return newAccount;
  };

  const editBankAccount = (id: string, updated: Partial<BankAccount>) => {
    const nextList = bankAccounts.map((item) =>
      item.id === id ? ({ ...item, ...updated } as BankAccount) : item
    );
    setBankAccounts(nextList);
    persistCurrentState(financialEvents, cashAccounts, bankAccounts, nextList);

    if (isSupabaseConfigured() && !isMockUser && supabase && activeWorkspace && !isDemoWorkspace(activeWorkspace.id)) {
      (async () => {
        try {
          await supabase
            .from("bank_accounts")
            .update({
              bank_name: updated.bankName,
              account_number: updated.accountNumber,
              account_name: updated.accountName,
              branch_name: updated.branchName,
              current_balance_myr: updated.currentBalanceMyr,
            })
            .eq("id", id)
            .eq("workspace_id", activeWorkspace.id);
        } catch (err: any) {
          console.error("DB persistence update bank failed:", err.message);
        }
      })();
    }
  };

  const deleteBankAccount = (id: string) => {
    const nextList = bankAccounts.filter((item) => item.id !== id);
    setBankAccounts(nextList);
    persistCurrentState(financialEvents, cashAccounts, nextList);

    if (isSupabaseConfigured() && !isMockUser && supabase && activeWorkspace && !isDemoWorkspace(activeWorkspace.id)) {
      (async () => {
        try {
          await supabase.from("bank_accounts").delete().eq("id", id).eq("workspace_id", activeWorkspace.id);
        } catch (err: any) {
          console.error("DB persistence delete bank failed:", err.message);
        }
      })();
    }
  };

  // --- Debt Record Actions ---
  const addDebtRecord = (debt: Omit<DebtRecord, "id">): DebtRecord => {
    const newId = generateUUID();
    const newDebt: DebtRecord = { ...debt, id: newId };
    const updated = [...debtRecords, newDebt];
    setDebtRecords(updated);
    persistCurrentState(financialEvents, cashAccounts, bankAccounts, updated);

    if (isSupabaseConfigured() && !isMockUser && supabase && activeWorkspace && !isDemoWorkspace(activeWorkspace.id)) {
      (async () => {
        try {
          await supabase.from("debts").insert({
            id: newId,
            workspace_id: activeWorkspace.id,
            lender_name: newDebt.creditorName,
            debt_type: "TERM_LOAN",
            principal_amount_myr: newDebt.totalAmountMyr,
            outstanding_balance_myr: newDebt.totalAmountMyr - newDebt.repaidAmountMyr,
            annual_interest_rate: newDebt.interestRateAnnualPercent || 0,
            origination_date: newDebt.borrowedDate,
            maturity_date: newDebt.repaymentDueDate || null,
            monthly_payment_myr: 0,
            description: newDebt.description,
          });
        } catch (err: any) {
          console.error("DB persistence insert debt failed:", err.message);
        }
      })();
    }

    return newDebt;
  };

  const editDebtRecord = (id: string, updated: Partial<DebtRecord>) => {
    const nextList = debtRecords.map((item) =>
      item.id === id ? ({ ...item, ...updated } as DebtRecord) : item
    );
    setDebtRecords(nextList);
    persistCurrentState(financialEvents, cashAccounts, bankAccounts, nextList);

    if (isSupabaseConfigured() && !isMockUser && supabase && activeWorkspace && !isDemoWorkspace(activeWorkspace.id)) {
      (async () => {
        try {
          const current = debtRecords.find((d) => d.id === id);
          if (!current) return;

          const totalAmt = updated.totalAmountMyr !== undefined ? updated.totalAmountMyr : current.totalAmountMyr;
          const repaidAmt = updated.repaidAmountMyr !== undefined ? updated.repaidAmountMyr : current.repaidAmountMyr;

          await supabase
            .from("debts")
            .update({
              lender_name: updated.creditorName,
              origination_date: updated.borrowedDate,
              maturity_date: updated.repaymentDueDate,
              principal_amount_myr: totalAmt,
              outstanding_balance_myr: totalAmt - repaidAmt,
              annual_interest_rate: updated.interestRateAnnualPercent,
              description: updated.description,
            })
            .eq("id", id)
            .eq("workspace_id", activeWorkspace.id);
        } catch (err: any) {
          console.error("DB persistence update debt failed:", err.message);
        }
      })();
    }
  };

  const deleteDebtRecord = (id: string) => {
    const nextList = debtRecords.filter((item) => item.id !== id);
    setDebtRecords(nextList);
    persistCurrentState(financialEvents, cashAccounts, bankAccounts, nextList);

    if (isSupabaseConfigured() && !isMockUser && supabase && activeWorkspace && !isDemoWorkspace(activeWorkspace.id)) {
      (async () => {
        try {
          await supabase.from("debts").delete().eq("id", id).eq("workspace_id", activeWorkspace.id);
        } catch (err: any) {
          console.error("DB persistence delete debt failed:", err.message);
        }
      })();
    }
  };

  // --- Financial Commitments Actions ---
  const addFinancialCommitment = (commitment: Omit<FinancialCommitment, "id">): FinancialCommitment => {
    const newId = generateUUID();
    const newCommitment: FinancialCommitment = { ...commitment, id: newId };
    const updated = [...financialCommitments, newCommitment];
    setFinancialCommitments(updated);
    persistCurrentState(financialEvents, cashAccounts, bankAccounts, debtRecords, updated);

    if (activeWorkspace) {
      writeAuditLog({
        workspaceId: activeWorkspace.id,
        module: "Financial Commitments",
        action: "CREATE",
        oldValue: null,
        newValue: newCommitment
      });
    }

    if (isSupabaseConfigured() && !isMockUser && supabase && activeWorkspace && !isDemoWorkspace(activeWorkspace.id)) {
      (async () => {
        try {
          // postgres enum safe mapping
          let dbRecurrence = newCommitment.recurrence;
          if (dbRecurrence === "DAILY") dbRecurrence = "WEEKLY";
          if (dbRecurrence === "ONE-TIME") dbRecurrence = "MONTHLY";

          await supabase.from("financial_commitments").insert({
            id: newId,
            workspace_id: activeWorkspace.id,
            description: newCommitment.description,
            contract_number: newCommitment.contractNumber || null,
            obligee_name: newCommitment.obligeeName,
            amount_per_interval_myr: newCommitment.amountPerIntervalMyr,
            recurrence: dbRecurrence,
            start_date: newCommitment.startDate,
            end_date: newCommitment.endDate || null,
            is_active: newCommitment.isActive,
          });
        } catch (err: any) {
          console.error("DB persistence insert commitment failed:", err.message);
        }
      })();
    }

    return newCommitment;
  };

  const editFinancialCommitment = (id: string, updated: Partial<FinancialCommitment>) => {
    const original = financialCommitments.find((item) => item.id === id);
    const nextList = financialCommitments.map((item) =>
      item.id === id ? ({ ...item, ...updated } as FinancialCommitment) : item
    );
    setFinancialCommitments(nextList);
    persistCurrentState(financialEvents, cashAccounts, bankAccounts, debtRecords, nextList);

    if (activeWorkspace && original) {
      const merged = { ...original, ...updated };
      writeAuditLog({
        workspaceId: activeWorkspace.id,
        module: "Financial Commitments",
        action: "UPDATE",
        oldValue: original,
        newValue: merged
      });
    }

    if (isSupabaseConfigured() && !isMockUser && supabase && activeWorkspace && !isDemoWorkspace(activeWorkspace.id)) {
      (async () => {
        try {
          const current = financialCommitments.find((e) => e.id === id);
          if (!current) return;

          const desc = updated.description !== undefined ? updated.description : current.description;
          const contr = updated.contractNumber !== undefined ? updated.contractNumber : current.contractNumber;
          const oblig = updated.obligeeName !== undefined ? updated.obligeeName : current.obligeeName;
          const amt = updated.amountPerIntervalMyr !== undefined ? updated.amountPerIntervalMyr : current.amountPerIntervalMyr;
          const rec = updated.recurrence !== undefined ? updated.recurrence : current.recurrence;
          const sdate = updated.startDate !== undefined ? updated.startDate : current.startDate;
          const edate = updated.endDate !== undefined ? updated.endDate : current.endDate;
          const active = updated.isActive !== undefined ? updated.isActive : current.isActive;

          // postgres enum safe mapping
          let dbRecurrence = rec;
          if (dbRecurrence === "DAILY") dbRecurrence = "WEEKLY";
          if (dbRecurrence === "ONE-TIME") dbRecurrence = "MONTHLY";

          await supabase
            .from("financial_commitments")
            .update({
              description: desc,
              contract_number: contr || null,
              obligee_name: oblig,
              amount_per_interval_myr: amt,
              recurrence: dbRecurrence,
              start_date: sdate,
              end_date: edate || null,
              is_active: active,
            })
            .eq("id", id)
            .eq("workspace_id", activeWorkspace.id);
        } catch (err: any) {
          console.error("DB persistence update commitment failed:", err.message);
        }
      })();
    }
  };

  const deleteFinancialCommitment = (id: string) => {
    const original = financialCommitments.find((item) => item.id === id);
    const nextList = financialCommitments.filter((item) => item.id !== id);
    setFinancialCommitments(nextList);
    persistCurrentState(financialEvents, cashAccounts, bankAccounts, debtRecords, nextList);

    if (activeWorkspace && original) {
      writeAuditLog({
        workspaceId: activeWorkspace.id,
        module: "Financial Commitments",
        action: "DELETE",
        oldValue: original,
        newValue: null
      });
    }

    if (isSupabaseConfigured() && !isMockUser && supabase && activeWorkspace && !isDemoWorkspace(activeWorkspace.id)) {
      (async () => {
        try {
          await supabase.from("financial_commitments").delete().eq("id", id).eq("workspace_id", activeWorkspace.id);
        } catch (err: any) {
          console.error("DB persistence delete commitment failed:", err.message);
        }
      })();
    }
  };

  // --- Financial Evidence Packages Actions ---
  const addFinancialEvidencePackage = (pkg: Omit<FinancialEvidencePackage, "id">): FinancialEvidencePackage => {
    const newId = generateUUID();
    const newPkg: FinancialEvidencePackage = { ...pkg, id: newId };
    const updated = [newPkg, ...financialEvidencePackages];
    setFinancialEvidencePackages(updated);
    persistCurrentState(financialEvents, cashAccounts, bankAccounts, debtRecords, financialCommitments, updated);

    if (activeWorkspace) {
      writeAuditLog({
        workspaceId: activeWorkspace.id,
        module: "Financial Evidence Package",
        action: "CREATE",
        oldValue: null,
        newValue: newPkg
      });
    }

    if (isSupabaseConfigured() && !isMockUser && supabase && activeWorkspace && !isDemoWorkspace(activeWorkspace.id)) {
      (async () => {
        try {
          await supabase.from("financial_evidence_packages").insert({
            id: newId,
            workspace_id: activeWorkspace.id,
            document_type: newPkg.documentType,
            file_name: newPkg.fileName,
            file_url: newPkg.fileUrl,
            upload_date: newPkg.uploadDate,
            related_record_type: newPkg.relatedRecordType || null,
            related_record_id: newPkg.relatedRecordId || null,
            notes: newPkg.notes || null,
          });
        } catch (err: any) {
          console.error("DB persistence insert evidence package failed:", err.message);
        }
      })();
    }

    return newPkg;
  };

  const editFinancialEvidencePackage = (id: string, updatedFields: Partial<FinancialEvidencePackage>) => {
    const original = financialEvidencePackages.find((item) => item.id === id);
    const nextList = financialEvidencePackages.map((item) =>
      item.id === id ? ({ ...item, ...updatedFields } as FinancialEvidencePackage) : item
    );
    setFinancialEvidencePackages(nextList);
    persistCurrentState(financialEvents, cashAccounts, bankAccounts, debtRecords, financialCommitments, nextList);

    if (activeWorkspace && original) {
      const merged = { ...original, ...updatedFields };
      writeAuditLog({
        workspaceId: activeWorkspace.id,
        module: "Financial Evidence Package",
        action: "UPDATE",
        oldValue: original,
        newValue: merged
      });
    }

    if (isSupabaseConfigured() && !isMockUser && supabase && activeWorkspace && !isDemoWorkspace(activeWorkspace.id)) {
      (async () => {
        try {
          const current = financialEvidencePackages.find((e) => e.id === id);
          if (!current) return;

          const docType = updatedFields.documentType !== undefined ? updatedFields.documentType : current.documentType;
          const fileName = updatedFields.fileName !== undefined ? updatedFields.fileName : current.fileName;
          const fileUrl = updatedFields.fileUrl !== undefined ? updatedFields.fileUrl : current.fileUrl;
          const relType = updatedFields.relatedRecordType !== undefined ? updatedFields.relatedRecordType : current.relatedRecordType;
          const relId = updatedFields.relatedRecordId !== undefined ? updatedFields.relatedRecordId : current.relatedRecordId;
          const notes = updatedFields.notes !== undefined ? updatedFields.notes : current.notes;

          await supabase
            .from("financial_evidence_packages")
            .update({
              document_type: docType,
              file_name: fileName,
              file_url: fileUrl,
              related_record_type: relType || null,
              related_record_id: relId || null,
              notes: notes || null,
            })
            .eq("id", id)
            .eq("workspace_id", activeWorkspace.id);
        } catch (err: any) {
          console.error("DB persistence update evidence package failed:", err.message);
        }
      })();
    }
  };

  const deleteFinancialEvidencePackage = (id: string) => {
    const original = financialEvidencePackages.find((item) => item.id === id);
    const nextList = financialEvidencePackages.filter((item) => item.id !== id);
    setFinancialEvidencePackages(nextList);
    persistCurrentState(financialEvents, cashAccounts, bankAccounts, debtRecords, financialCommitments, nextList);

    if (activeWorkspace && original) {
      writeAuditLog({
        workspaceId: activeWorkspace.id,
        module: "Financial Evidence Package",
        action: "DELETE",
        oldValue: original,
        newValue: null
      });
    }

    if (isSupabaseConfigured() && !isMockUser && supabase && activeWorkspace && !isDemoWorkspace(activeWorkspace.id)) {
      (async () => {
        try {
          // Clean up physical file in Supabase Storage if present
          const itemToDelete = financialEvidencePackages.find((item) => item.id === id);
          if (itemToDelete && itemToDelete.fileUrl && itemToDelete.fileUrl.includes("evidence-packages/")) {
            const searchStr = "evidence-packages/";
            const idx = itemToDelete.fileUrl.indexOf(searchStr);
            if (idx !== -1) {
              const relativePath = decodeURIComponent(itemToDelete.fileUrl.substring(idx + searchStr.length));
              await supabase.storage.from("evidence-packages").remove([relativePath]);
            }
          }
          await supabase.from("financial_evidence_packages").delete().eq("id", id).eq("workspace_id", activeWorkspace.id);
        } catch (err: any) {
          console.error("DB persistence delete evidence package failed:", err.message);
        }
      })();
    }
  };

  const learnOcrPattern = (pattern: Omit<OcrLearnedPattern, "id" | "occurrenceCount" | "lastUpdated">) => {
    if (!activeWorkspace) return;

    // Standardize vendor name (trim and case-insensitive matching)
    const normalizedVendorInput = pattern.vendorName.trim();
    const vendorLower = normalizedVendorInput.toLowerCase();
    const vendorKey = vendorMatchKey(normalizedVendorInput);

    // Look for matches: exact (case-insensitive) first, then a fuzzy match on a
    // normalized key (strips Sdn Bhd/Enterprise/punctuation, allows small spelling
    // drift) so e.g. "Tenaga Nasional Bhd" and "TENAGA NASIONAL BERHAD" merge into
    // one learned pattern instead of fragmenting into duplicates.
    let existingIndex = ocrLearnedPatterns.findIndex(
      (p) => p.vendorName.toLowerCase() === vendorLower && p.workspaceId === activeWorkspace.id
    );
    if (existingIndex === -1) {
      existingIndex = ocrLearnedPatterns.findIndex(
        (p) => p.workspaceId === activeWorkspace.id && isFuzzyVendorMatch(vendorKey, vendorMatchKey(p.vendorName))
      );
    }

    let updatedPatterns = [...ocrLearnedPatterns];
    let action: "CREATE" | "UPDATE" = "CREATE";
    let oldValue: OcrLearnedPattern | null = null;
    let newValue: OcrLearnedPattern;

    const timestamp = new Date().toISOString();

    if (existingIndex !== -1) {
      action = "UPDATE";
      const oldElement = ocrLearnedPatterns[existingIndex];
      oldValue = { ...oldElement };
      
      const newOccurrence = oldElement.occurrenceCount + 1;
      // Formula for rolling average confidence score:
      const newConfidence = parseFloat(
        ((oldElement.confidenceScore * oldElement.occurrenceCount + pattern.confidenceScore) / newOccurrence).toFixed(4)
      );

      newValue = {
        ...oldElement,
        vendorName: normalizedVendorInput, // Retain/freshen spelling capitalization
        category: pattern.category,
        recordType: pattern.recordType,
        confidenceScore: newConfidence,
        occurrenceCount: newOccurrence,
        lastUpdated: timestamp
      };

      updatedPatterns[existingIndex] = newValue;
    } else {
      action = "CREATE";
      const newId = generateUUID();
      newValue = {
        id: newId,
        workspaceId: activeWorkspace.id,
        vendorName: normalizedVendorInput,
        category: pattern.category,
        recordType: pattern.recordType,
        confidenceScore: pattern.confidenceScore,
        occurrenceCount: 1,
        lastUpdated: timestamp
      };

      updatedPatterns = [newValue, ...updatedPatterns];
    }

    setOcrLearnedPatterns(updatedPatterns);
    persistCurrentState(
      financialEvents,
      cashAccounts,
      bankAccounts,
      debtRecords,
      financialCommitments,
      financialEvidencePackages,
      updatedPatterns
    );

    // Write audit log entry! Yes, "OCR Learning" log module.
    writeAuditLog({
      workspaceId: activeWorkspace.id,
      module: "OCR Learning",
      action: action,
      oldValue: oldValue,
      newValue: newValue
    });

    // Write to Supabase table if enabled and tables initialized
    if (isSupabaseConfigured() && !isMockUser && supabase) {
      (async () => {
        try {
          if (action === "CREATE") {
            await supabase.from("ocr_learned_patterns").insert({
              id: newValue.id,
              workspace_id: newValue.workspaceId,
              vendor_name: newValue.vendorName,
              category: newValue.category,
              record_type: newValue.recordType,
              confidence_score: newValue.confidenceScore,
              occurrence_count: newValue.occurrenceCount,
              last_updated: newValue.lastUpdated
            });
          } else {
            await supabase.from("ocr_learned_patterns").update({
              vendor_name: newValue.vendorName,
              category: newValue.category,
              record_type: newValue.recordType,
              confidence_score: newValue.confidenceScore,
              occurrence_count: newValue.occurrenceCount,
              last_updated: newValue.lastUpdated
            }).eq("id", newValue.id).eq("workspace_id", activeWorkspace.id);
          }
        } catch (ex: any) {
          console.warn("DB learn update skipped:", ex.message);
        }
      })();
    }
  };

  const deleteOcrLearnedPattern = (id: string) => {
    if (!activeWorkspace) return;
    const original = ocrLearnedPatterns.find((item) => item.id === id);
    const nextList = ocrLearnedPatterns.filter((item) => item.id !== id);
    setOcrLearnedPatterns(nextList);
    persistCurrentState(
      financialEvents,
      cashAccounts,
      bankAccounts,
      debtRecords,
      financialCommitments,
      financialEvidencePackages,
      nextList
    );

    if (original) {
      writeAuditLog({
        workspaceId: activeWorkspace.id,
        module: "OCR Learning",
        action: "DELETE",
        oldValue: original,
        newValue: null
      });
    }

    if (isSupabaseConfigured() && !isMockUser && supabase) {
      (async () => {
        try {
          await supabase.from("ocr_learned_patterns").delete().eq("id", id).eq("workspace_id", activeWorkspace.id);
        } catch (ex: any) {
          console.warn("DB pattern delete skipped:", ex.message);
        }
      })();
    }
  };

  const resetWorkspaceData = () => {
    if (!activeWorkspace) return;
    const wsId = activeWorkspace.id;

    if (!isSupabaseConfigured() || isMockUser || isDemoWorkspace(wsId)) {
      setPresenterPresets();
    } else {
      setLoading(true);
      setError(null);
      if (!supabase) return;

      (async () => {
        try {
          // Clear all entries first
          try {
            await supabase.from("financial_commitments").delete().eq("workspace_id", wsId);
          } catch (delCmtErr: any) {
            console.warn("Could not delete from financial_commitments table on reset:", delCmtErr.message);
          }
          await supabase.from("income_records").delete().eq("workspace_id", wsId);
          await supabase.from("expense_records").delete().eq("workspace_id", wsId);
          await supabase.from("receivables").delete().eq("workspace_id", wsId);
          await supabase.from("payables").delete().eq("workspace_id", wsId);
          await supabase.from("debts").delete().eq("workspace_id", wsId);
          await supabase.from("cash_accounts").delete().eq("workspace_id", wsId);
          await supabase.from("bank_accounts").delete().eq("workspace_id", wsId);
          await supabase.from("general_ledger_categories").delete().eq("workspace_id", wsId);

          // Populate cash accounts presets
          const cashPresets = getPresetCashAccounts(wsId);
          for (const item of cashPresets) {
            await supabase.from("cash_accounts").insert({
              workspace_id: wsId,
              name: item.name,
              physical_location: item.responsiblePerson,
              current_balance_myr: item.currentBalanceMyr,
              is_active: true,
            });
          }

          // Populate bank accounts presets
          const bankPresets = getPresetBankAccounts(wsId);
          for (const item of bankPresets) {
            await supabase.from("bank_accounts").insert({
              workspace_id: wsId,
              bank_name: item.bankName,
              account_number: item.accountNumber,
              account_name: item.accountName,
              branch_name: item.branchName,
              account_type: "CURRENT",
              current_balance_myr: item.currentBalanceMyr,
              is_active: true,
            });
          }

          // Populate debts presets
          const debtPresets = getPresetDebts(wsId);
          for (const item of debtPresets) {
            await supabase.from("debts").insert({
              workspace_id: wsId,
              lender_name: item.creditorName,
              debt_type: "TERM_LOAN",
              principal_amount_myr: item.totalAmountMyr,
              outstanding_balance_myr: item.totalAmountMyr - item.repaidAmountMyr,
              annual_interest_rate: item.interestRateAnnualPercent || 0,
              origination_date: item.borrowedDate,
              maturity_date: item.repaymentDueDate || null,
              monthly_payment_myr: 0,
            });
          }

          // Populate event presets
          const eventPresets = getPresetFinancialEvents(wsId);
          for (const item of eventPresets) {
            const catId = await getOrCreateCategoryId(wsId, item.categoryName, item.type);

            if (item.type === "INCOME") {
              await supabase.from("income_records").insert({
                workspace_id: wsId,
                category_id: catId,
                source_bank_account_id: item.bankAccountId || null,
                source_cash_account_id: item.cashAccountId || null,
                payer_name: item.partyName,
                amount_myr: item.amountMyr,
                transaction_date: item.date,
                reference_number: item.referenceNumber,
                description: item.description,
              });
            } else if (item.type === "EXPENSE" || item.type === "DEBT") {
              await supabase.from("expense_records").insert({
                workspace_id: wsId,
                category_id: catId,
                payment_bank_account_id: item.bankAccountId || null,
                payment_cash_account_id: item.cashAccountId || null,
                recipient_vendor_name: item.partyName,
                amount_myr: item.amountMyr,
                tax_amount_myr: 0,
                transaction_date: item.date,
                reference_number: item.referenceNumber,
                description: item.type === "DEBT" ? `[DEBT] ${item.description}` : item.description,
              });
            } else if (item.type === "RECEIVABLE") {
              await supabase.from("receivables").insert({
                workspace_id: wsId,
                customer_name: item.partyName,
                invoice_number: item.referenceNumber,
                invoice_date: item.date,
                due_date: item.dueDate || item.date,
                total_amount_myr: item.amountMyr,
                paid_amount_myr: item.isCompleted ? item.amountMyr : 0,
                status: item.isCompleted ? "PAID" : "UNPAID",
                category_id: catId,
              });
            } else if (item.type === "PAYABLE") {
              await supabase.from("payables").insert({
                workspace_id: wsId,
                category_id: catId,
                vendor_name: item.partyName,
                bill_number: item.referenceNumber,
                bill_date: item.date,
                due_date: item.dueDate || item.date,
                total_amount_myr: item.amountMyr,
                paid_amount_myr: item.isCompleted ? item.amountMyr : 0,
                status: item.isCompleted ? "PAID" : "UNPAID",
              });
            }
          }

          // Seed commitments presets
          try {
            const commitPresets = getPresetFinancialCommitments(wsId);
            for (const item of commitPresets) {
              await supabase.from("financial_commitments").insert({
                workspace_id: wsId,
                description: item.description,
                contract_number: item.contractNumber || null,
                obligee_name: item.obligeeName,
                amount_per_interval_myr: item.amountPerIntervalMyr,
                recurrence: item.recurrence === "DAILY" ? "WEEKLY" : (item.recurrence === "ONE-TIME" ? "MONTHLY" : item.recurrence),
                start_date: item.startDate,
                end_date: item.endDate || null,
                is_active: item.isActive,
              });
            }
          } catch (insCmtErr: any) {
            console.warn("Could not seed financial_commitments table on reset:", insCmtErr.message);
          }

          // Quick self reload to refresh state from loaded Supabase
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        } catch (err: any) {
          console.error("Error in seeding database presets:", err.message);
          setError(`E-Seeding failed: ${err.message}. Enabling sandbox.`);
          setPresenterPresets();
          setLoading(false);
        }
      })();
    }
  };

  const restoreWorkspaceData = async (data: {
    financialEvents: any[];
    cashAccounts: any[];
    bankAccounts: any[];
    debtRecords: any[];
    financialCommitments: any[];
    financialEvidencePackages: any[];
    ocrLearnedPatterns: any[];
  }) => {
    if (!activeWorkspace) return;
    const wsId = activeWorkspace.id;

    // React State synchronization
    setFinancialEvents(data.financialEvents || []);
    setCashAccounts(data.cashAccounts || []);
    setBankAccounts(data.bankAccounts || []);
    setDebtRecords(data.debtRecords || []);
    setFinancialCommitments(data.financialCommitments || []);
    setFinancialEvidencePackages(data.financialEvidencePackages || []);
    setOcrLearnedPatterns(data.ocrLearnedPatterns || []);

    // Local Storage save
    saveToStorage(
      wsId,
      data.financialEvents || [],
      data.cashAccounts || [],
      data.bankAccounts || [],
      data.debtRecords || [],
      data.financialCommitments || [],
      data.financialEvidencePackages || [],
      data.ocrLearnedPatterns || []
    );

    // If Supabase is online
    if (isSupabaseConfigured() && !isMockUser && supabase && !isDemoWorkspace(wsId)) {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([
          supabase.from("financial_commitments").delete().eq("workspace_id", wsId),
          supabase.from("income_records").delete().eq("workspace_id", wsId),
          supabase.from("expense_records").delete().eq("workspace_id", wsId),
          supabase.from("receivables").delete().eq("workspace_id", wsId),
          supabase.from("payables").delete().eq("workspace_id", wsId),
          supabase.from("debts").delete().eq("workspace_id", wsId),
          supabase.from("cash_accounts").delete().eq("workspace_id", wsId),
          supabase.from("bank_accounts").delete().eq("workspace_id", wsId),
        ]).catch(e => console.warn("Supabase wipe error ignored:", e));

        for (const item of (data.cashAccounts || [])) {
          await supabase.from("cash_accounts").insert({
            workspace_id: wsId,
            name: item.name,
            physical_location: item.responsiblePerson || "Secured Vault",
            current_balance_myr: item.currentBalanceMyr,
            is_active: true
          });
        }
        for (const item of (data.bankAccounts || [])) {
          await supabase.from("bank_accounts").insert({
            workspace_id: wsId,
            bank_name: item.bankName,
            account_number: item.accountNumber,
            account_name: item.accountName,
            branch_name: item.branchName,
            account_type: "CURRENT",
            current_balance_myr: item.currentBalanceMyr,
            is_active: true
          });
        }
        for (const item of (data.debtRecords || [])) {
          await supabase.from("debts").insert({
            workspace_id: wsId,
            lender_name: item.creditorName,
            debt_type: "TERM_LOAN",
            principal_amount_myr: item.totalAmountMyr,
            outstanding_balance_myr: item.totalAmountMyr - item.repaidAmountMyr,
            annual_interest_rate: item.interestRateAnnualPercent || 0,
            origination_date: item.borrowedDate,
            maturity_date: item.repaymentDueDate || null,
            monthly_payment_myr: 0
          });
        }

        for (const item of (data.financialEvents || [])) {
          const catId = await getOrCreateCategoryId(wsId, item.categoryName, item.type);
          if (item.type === "INCOME") {
            await supabase.from("income_records").insert({
              workspace_id: wsId,
              category_id: catId,
              source_bank_account_id: item.bankAccountId || null,
              source_cash_account_id: item.cashAccountId || null,
              payer_name: item.partyName,
              amount_myr: item.amountMyr,
              transaction_date: item.date,
              reference_number: item.referenceNumber,
              description: item.description,
            });
          } else {
            await supabase.from("expense_records").insert({
              workspace_id: wsId,
              category_id: catId,
              payment_bank_account_id: item.bankAccountId || null,
              payment_cash_account_id: item.cashAccountId || null,
              payee_name: item.partyName,
              amount_myr: item.amountMyr,
              transaction_date: item.date,
              reference_number: item.referenceNumber,
              description: item.description,
            });
          }
        }
      } catch (err: any) {
        console.error("Supabase row updates skipped: ", err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <FinancialRecordsContext.Provider
      value={{
        financialEvents,
        cashAccounts,
        bankAccounts,
        debtRecords,
        financialCommitments,
        financialEvidencePackages,
        ocrLearnedPatterns,
        loading,
        error,
        addFinancialEvent,
        editFinancialEvent,
        deleteFinancialEvent,
        addCashAccount,
        editCashAccount,
        deleteCashAccount,
        addBankAccount,
        editBankAccount,
        deleteBankAccount,
        addDebtRecord,
        editDebtRecord,
        deleteDebtRecord,
        addFinancialCommitment,
        editFinancialCommitment,
        deleteFinancialCommitment,
        addFinancialEvidencePackage,
        editFinancialEvidencePackage,
        deleteFinancialEvidencePackage,
        learnOcrPattern,
        deleteOcrLearnedPattern,
        resetWorkspaceData,
        restoreWorkspaceData,
      }}
    >
      {children}
    </FinancialRecordsContext.Provider>
  );
};

export const useFinancials = () => {
  const context = useContext(FinancialRecordsContext);
  if (!context) {
    throw new Error("useFinancials must be used with a FinancialRecordsProvider");
  }
  return context;
};
