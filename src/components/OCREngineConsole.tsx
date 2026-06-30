import React, { useState, useRef, useEffect, useMemo } from "react";
import { useFinancials } from "../context/FinancialRecordsContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { useAuth } from "../context/AuthContext";
import { usePermission } from "../context/PermissionContext";
import { useAudit } from "../context/AuditContext";
import { logEvent } from "../lib/eventLog";
import { logTenantActivity } from "../lib/hqService";
import { confirmFinancialRecord, type ConfirmInput } from "../lib/financialRecordConfirmation";
import { pollOcrJob, type OcrJobState } from "../lib/ocrJobTypes";
import DocumentProcessingProgressPanel from "./DocumentProcessingProgressPanel";
import { loadBusinesses, loadBusinessBranches, type Business, type BusinessBranch } from "../lib/profileData";
import { matchOwnBusinessAndBranch } from "../lib/businessMatching";
import { 
  FileText, 
  UploadCloud, 
  Sparkles, 
  Search, 
  CheckCircle, 
  AlertCircle, 
  ArrowRight, 
  BookOpen, 
  ChevronRight, 
  Building, 
  DollarSign, 
  TrendingDown, 
  Calendar, 
  RefreshCw, 
  ShieldAlert,
  Loader2,
  FileCheck,
  Percent,
  TrendingUp,
  Download,
  Info
} from "lucide-react";
import { type FinancialRecordType, type FinancialEvidencePackage } from "../types";

export const OCREngineConsole: React.FC = () => {
  const {
    financialEvents,
    cashAccounts,
    bankAccounts,
    ocrLearnedPatterns,
    addFinancialEvidencePackage,
    addFinancialEvent,
    addFinancialEventAwaited,
    learnOcrPattern,
    deleteOcrLearnedPattern,
    findLearnedPattern
  } = useFinancials();

  const { activeWorkspace } = useWorkspace();
  const { user, isMockUser } = useAuth();
  const { hasPermission } = usePermission();
  const { writeAuditLog } = useAudit();

  // Business/Branch Mapping engine state — required so OCR receipt/invoice
  // classification can detect when the document's merchant/issuer IS the
  // user's own registered business or branch (same engine + data used by
  // AI Chat in OwnerDashboard.tsx/StaffHomeScreen.tsx and Bank Statement
  // import). Without this, OCR review had no way to tell "own company
  // issued this invoice to a customer" apart from "we paid an outside
  // vendor", and silently defaulted every non-invoice, non-"sales/revenue"
  // keyword document to EXPENSE — including a customer-facing document
  // issued by the user's own company, which must be INCOME.
  const [ownBusinesses, setOwnBusinesses] = useState<Business[]>([]);
  const [ownBusinessBranches, setOwnBusinessBranches] = useState<Record<string, BusinessBranch[]>>({});

  useEffect(() => {
    const wsId = activeWorkspace?.id;
    if (!wsId) { setOwnBusinesses([]); setOwnBusinessBranches({}); return; }
    let active = true;
    (async () => {
      const businesses = await loadBusinesses(wsId, isMockUser);
      if (!active) return;
      setOwnBusinesses(businesses);
      const activeBusinesses = businesses.filter(b => b.isActive !== false);
      const branchResults = await Promise.all(
        activeBusinesses.map(async (b) => ({ id: b.id, branches: await loadBusinessBranches(wsId, isMockUser, b.id) }))
      );
      if (!active) return;
      const map: Record<string, BusinessBranch[]> = {};
      for (const r of branchResults) map[r.id] = r.branches;
      setOwnBusinessBranches(map);
    })();
    return () => { active = false; };
  }, [activeWorkspace?.id, isMockUser]);

  // Selected Document Type for OCR Input
  const [documentType, setDocumentType] = useState<"RECEIPT" | "INVOICE" | "STATEMENT" | "SUPPORTING_DOC">("RECEIPT");
  
  // File upload state machine
  const [file, setFile] = useState<File | null>(null);
  const [fileDataUrl, setFileDataUrl] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [uploadNotes, setUploadNotes] = useState("");
  
  // OCR processing state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState<string>("");
  const [ocrJob, setOcrJob] = useState<OcrJobState | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);

  // Async-button guards so confirm actions can't be fired twice in flight.
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmingIndex, setConfirmingIndex] = useState<number | null>(null);

  // Extracted OCR payload Reviewed State
  const [extractedData, setExtractedData] = useState<{
    merchantName: string;
    documentNumber: string;
    date: string;
    amount: number;
    currency: string;
    suggestedCategory: string;
    confidenceScore: number;
    rawExtractedText: string;
    transactions?: { date: string; description: string; amount: number; type: "CREDIT" | "DEBIT"; suggestedCategory: string; confidenceScore: number }[];
  } | null>(null);

  // Module 10: Bank Statement Engine — per-transaction confirm/reject status,
  // keyed by index, since a statement yields many candidate records at once.
  const [statementTxnStatus, setStatementTxnStatus] = useState<Record<number, "pending" | "confirmed" | "rejected">>({});

  // Post-OCR Human Modification Fields
  const [reviewedMerchantName, setReviewedMerchantName] = useState("");
  const [reviewedDocumentNumber, setReviewedDocumentNumber] = useState("");
  const [reviewedDate, setReviewedDate] = useState("");
  const [reviewedAmount, setReviewedAmount] = useState<number>(0);
  const [reviewedCurrency, setReviewedCurrency] = useState("MYR");
  const [reviewedCategory, setReviewedCategory] = useState("Utilities");
  const [selectedRecordType, setSelectedRecordType] = useState<FinancialRecordType>("EXPENSE");
  
  // Asset account assignment
  const [offsetAccountType, setOffsetAccountType] = useState<"NONE" | "CASH" | "BANK">("NONE");
  const [selectedAccountId, setSelectedAccountId] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clear timers
  useEffect(() => {
    if (errorText) {
      const timer = setTimeout(() => setErrorText(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [errorText]);

  useEffect(() => {
    if (successText) {
      const timer = setTimeout(() => setSuccessText(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [successText]);

  // Read upload files
  const processLocalFile = (fileToRead: File) => {
    if (fileToRead.size > 12 * 1024 * 1024) {
      setErrorText("Document exceeds maximum size of 12MB. Please upload a optimized invoice scan.");
      return;
    }

    setFile(fileToRead);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setFileDataUrl(reader.result);
      }
    };
    reader.onerror = () => {
      setErrorText("Could not decode local file binary streams.");
    };
    reader.readAsDataURL(fileToRead);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processLocalFile(files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processLocalFile(files[0]);
    }
  };

  const handleClearSelected = () => {
    setFile(null);
    setFileDataUrl("");
    setExtractedData(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Perform Server-Side Multi-Modal OCR
  const handlePerformOCR = async () => {
    if (isAnalyzing) return;
    if (!fileDataUrl || !file) return;

    setIsAnalyzing(true);
    setOcrJob(null);
    setAnalysisStep("Securing local transport tunnels...");

    try {
      const { getAuthHeader } = await import("../lib/supabase");
      const startResponse = await fetch("/api/ocr/analyze/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
        body: JSON.stringify({
          fileDataUrl,
          fileName: file?.name || "ocr_extract_doc.png",
          documentType,
          tenantId: activeWorkspace?.tenantId,
          workspaceId: activeWorkspace?.id,
          userId: user?.id
        })
      });

      if (startResponse.status === 403) {
        const errBody = await startResponse.json().catch(() => ({}));
        setErrorText(errBody.error || "Sesi tidak sah atau Akaun anda telah disekat oleh pentadbir HQ.");
        return;
      }
      if (!startResponse.ok) {
        const errBody = await startResponse.json().catch(() => null);
        throw new Error(errBody?.error || `Extraction service returned HTTP code ${startResponse.status}`);
      }

      const { jobId } = await startResponse.json();
      setAnalysisStep("Invoking multi-modal OCR processor...");
      const finalJob = await pollOcrJob(jobId, setOcrJob);

      if (finalJob.status === "FAILED") {
        if (finalJob.errorCode === "OCR_CREDITS_EXHAUSTED") {
          setErrorText(finalJob.error || "Kredit OCR syarikat anda telah digunakan sepenuhnya. Sila naik taraf pelan.");
          return;
        }
        const baseMsg = finalJob.error || "Pengekstrakan OCR gagal.";
        throw new Error(finalJob.errorDetail ? `${baseMsg} [${finalJob.errorDetail}]` : baseMsg);
      }

      const payload = finalJob.result;

      if (payload?.extractionIncomplete) {
        setErrorText("Amaran: Sebahagian transaksi gagal diekstrak. Sila semak baris yang dipaparkan.");
      }

      // Look in OCR Learning Layer memory — shared tier-aware lookup engine
      // (Branch -> Business -> Workspace), same one used by Bank Statement
      // recovery, AI Chat, and Voice Notes, for both Owner and Staff.
      const merchantInput = payload.merchantName || "";
      const matchedPattern = findLearnedPattern(merchantInput);

      if (matchedPattern) {
        // AI Suggests with Learning memory!
        const confidenceScoreStr = matchedPattern.confidenceScore;
        const suggestionPayload = {
          ...payload,
          merchantName: matchedPattern.vendorName,
          suggestedCategory: matchedPattern.category,
          confidenceScore: confidenceScoreStr,
        };
        setExtractedData(suggestionPayload);
        setReviewedMerchantName(matchedPattern.vendorName);
        setReviewedDocumentNumber(payload.documentNumber || "REF-" + Math.floor(Math.random() * 900000 + 100000));
        setReviewedDate(payload.date || new Date().toISOString().split("T")[0]);
        setReviewedAmount(payload.amount || 0);
        setReviewedCurrency(payload.currency || "MYR");
        setReviewedCategory(matchedPattern.category);
        setSelectedRecordType(matchedPattern.recordType);
        
        setSuccessText(`🤖 Learning Layer Matched: Loaded historical pattern for "${matchedPattern.vendorName}". Pre-classified category to "${matchedPattern.category}" (${matchedPattern.recordType}) with a rolling average confidence of ${Math.round(confidenceScoreStr * 100)}%.`);
      } else {
        // Default API behavior
        setExtractedData(payload);
        setReviewedMerchantName(payload.merchantName || "");
        setReviewedDocumentNumber(payload.documentNumber || "REF-" + Math.floor(Math.random() * 900000 + 100000));
        setReviewedDate(payload.date || new Date().toISOString().split("T")[0]);
        setReviewedAmount(payload.amount || 0);
        setReviewedCurrency(payload.currency || "MYR");
        setReviewedCategory(payload.suggestedCategory || "Utilities");

        // Business/Branch Mapping check FIRST: a document whose merchant/issuer
        // is the user's own registered business or branch was issued BY that
        // business (e.g. an invoice billed to a customer) — it is money coming
        // IN, never an outside-vendor expense. This must override the
        // documentType/category heuristics below, the same way Step 4/5 of the
        // AI Chat assistant prompt (server.ts) treats an own-business/branch
        // merchant match as INCOME and never defaults to EXPENSE.
        const ownMatch = matchOwnBusinessAndBranch(
          payload.merchantName || "",
          ownBusinesses.filter(b => b.isActive !== false),
          ownBusinessBranches
        );

        const categoryLower = (payload.suggestedCategory || "").toLowerCase();
        if (ownMatch && !ownMatch.ambiguous) {
          setSelectedRecordType("INCOME");
          setSuccessText(`🏢 Pengesanan Syarikat Sendiri: "${payload.merchantName}" sepadan dengan ${ownMatch.branch ? `cawangan "${ownMatch.branch.branchName}"` : `syarikat "${ownMatch.business.businessName}"`} anda yang berdaftar — dokumen ini dikeluarkan OLEH syarikat anda, jadi diklasifikasikan sebagai PENDAPATAN (INCOME), bukan perbelanjaan.`);
        } else if (documentType === "INVOICE") {
          // Test 5: Invoice -> Suggestion -> Confirm -> payables (the supplier owes us nothing;
          // we owe the supplier — this is an accounts-payable bill, not a generic expense).
          setSelectedRecordType("PAYABLE");
        } else if (categoryLower.includes("sales") || categoryLower.includes("revenue") || categoryLower.includes("income") || documentType === "STATEMENT") {
          setSelectedRecordType("INCOME");
        } else {
          setSelectedRecordType("EXPENSE");
        }
      }

    } catch (err: any) {
      console.error(err);
      setErrorText(err?.message || "Pengekstrakan OCR gagal. Sila cuba muat naik semula, atau gunakan format CSV/Excel jika dokumen ini hasil imbasan/scan tanpa teks.");
      setExtractedData(null);
    } finally {
      setIsAnalyzing(false);
      setAnalysisStep("");
    }
  };

  // Create Financial Evidence Package AND Financial Record
  const handleConfirmAndLog = async () => {
    if (isConfirming) return;
    if (!activeWorkspace) return;

    setIsConfirming(true);

    // Check create privileges under our existing Permission System
    const canCreateEvidence = hasPermission("Financial Evidence Package", "create");
    const canCreateRecords = hasPermission("Financial Records", "create");

    if (!canCreateEvidence || !canCreateRecords) {
      setErrorText("Policy Restriction: Your active user role lacks the permission clearance to write records inside this workspace.");
      return;
    }

    try {
      const targetCashId = offsetAccountType === "CASH" ? selectedAccountId : undefined;
      const targetBankId = offsetAccountType === "BANK" ? selectedAccountId : undefined;

      // Meaningful filename: <date>_<sanitizedMerchantLabel>_RM<amount>.<ext>
      // Replaces raw upload names (e.g. IMG_20250624_123456.jpg from phone camera)
      // with searchable, human-readable identifiers on the persisted record.
      const ocrExt = (file?.name || "ocr_extract_doc.png").split(".").pop() || "png";
      const ocrLabel = (reviewedMerchantName || "OCR").replace(/[^a-zA-Z0-9 ]/g, "").trim().replace(/\s+/g, "_") || "OCR";
      const ocrReviewedDate = reviewedDate || new Date().toISOString().slice(0, 10);
      const ocrRenamedFileName = `${ocrReviewedDate}_${ocrLabel}_RM${(reviewedAmount || 0).toFixed(2)}.${ocrExt}`;

      // 1. ADD EVIDENCE PACKAGE RECORD
      const freshEvidencePackage = addFinancialEvidencePackage({
        workspaceId: activeWorkspace.id,
        documentType,
        uploadDate: new Date().toISOString().split("T")[0],
        fileName: ocrRenamedFileName,
        fileUrl: fileDataUrl, // Store dataURL or uploaded reference directly
        notes: uploadNotes.trim() ? uploadNotes.trim() : `Auto-logged via AI OCR Studio. System confidence: ${(extractedData?.confidenceScore || 0 * 100).toFixed(0)}%`
      });

      const input: ConfirmInput = {
        workspaceId: activeWorkspace.id,
        tenantId: user?.tenantId || activeWorkspace.tenantId,
        userId: user?.id,
        userEmail: user?.email,
        userRole: user?.role,
        transactionType: selectedRecordType as any,
        amount: reviewedAmount,
        category: reviewedCategory,
        relatedParty: reviewedMerchantName,
        date: reviewedDate,
        confidenceScore: extractedData ? extractedData.confidenceScore : 0.85,
        referenceNumber: reviewedDocumentNumber,
        description: `Linked automated OCR upload for ${reviewedMerchantName} (${documentType})`,
        pendingEvidence: {
          documentType,
          fileName: file?.name || "ocr_extract_doc.png",
          fileUrl: fileDataUrl,
        },
        evidenceAttached: true,
        source: "OCR",
        sourceTitle: `${reviewedMerchantName} (${documentType})`,
        auditDestination: "NONE",
        cashAccountId: targetCashId,
        bankAccountId: targetBankId,
        precheckDuplicate: false,
      };

      const result = await confirmFinancialRecord(input, {
        addFinancialEventAwaited,
        addFinancialEvent,
        addDebtRecordAwaited: async () => ({ id: "" } as any),
        addDebtRecord: () => ({ id: "" } as any),
        addFinancialCommitmentAwaited: async () => ({ id: "" } as any),
        addFinancialCommitment: () => ({ id: "" } as any),
        addAssetPurchase: async () => undefined,
        addOwnerTransaction: async () => undefined,
        linkEvidenceToRecord: () => undefined,
        learnOcrPattern,
        scanForDuplicates: async () => [],
        logEvent: () => undefined,
        logTenantActivity: () => undefined,
      });

      if (!result.ok) {
        setErrorText("Failed to persist financial documents internally. Please check storage credentials.");
        return;
      }

      const freshEvent = {
        id: result.recordId || "",
        workspaceId: activeWorkspace.id,
        type: selectedRecordType,
        categoryName: reviewedCategory,
        amountMyr: reviewedAmount,
        partyName: reviewedMerchantName,
        date: reviewedDate,
        referenceNumber: reviewedDocumentNumber,
        description: `Linked automated OCR upload for ${reviewedMerchantName} (${documentType})`,
        isCompleted: true,
        cashAccountId: targetCashId,
        bankAccountId: targetBankId,
        sourceSystem: "OCR",
      };

      // 3. SECURELY ASSOCIATE BOTH ENTITIES
      freshEvidencePackage.relatedRecordId = freshEvent.id;
      freshEvidencePackage.relatedRecordType = selectedRecordType;

      // 4. WRITE EXPLICIT AUDIT TRAILS (preserved from original code)
      writeAuditLog({
        workspaceId: activeWorkspace.id,
        module: "Financial Evidence Package",
        action: "CREATE",
        oldValue: null,
        newValue: {
          id: freshEvidencePackage.id,
          fileName: freshEvidencePackage.fileName,
          documentType: freshEvidencePackage.documentType,
          linkedRecordId: freshEvent.id
        }
      });

      writeAuditLog({
        workspaceId: activeWorkspace.id,
        module: "Financial Records",
        action: "CREATE",
        oldValue: null,
        newValue: freshEvent
      });

      if (user) {
        logEvent({
          tenantId: user.tenantId, workspaceId: activeWorkspace.id, userId: user.id,
          userEmail: user.email, userRole: user.role, eventType: "OCR_PROCESS",
          description: `Processed OCR document for ${reviewedMerchantName} (${documentType})`,
          metadata: { documentType, merchantName: reviewedMerchantName, amountMyr: reviewedAmount },
        });
      }

      setSuccessText(`Ledger transaction successfully synchronized! Evidence packet #${freshEvidencePackage.id.substring(0,6)} and Financial Record are now fully linked for audits. AI Learning Layer updated Vendor "${reviewedMerchantName}" -> Category "${reviewedCategory}".`);

      // Wipe current upload state
      setFile(null);
      setFileDataUrl("");
      setExtractedData(null);
      setUploadNotes("");
      setOffsetAccountType("NONE");
      setSelectedAccountId("");

    } catch (ex: any) {
      console.error(ex);
      setErrorText("Failed to persist financial documents internally. Please check storage credentials.");
    } finally {
      setIsConfirming(false);
    }
  };

  // Module 10 (OCR Bank Statement Engine): confirm a single extracted transaction
  // row from a multi-transaction statement. CREDIT -> income_records, DEBIT -> expense_records.
  const handleConfirmStatementTransaction = async (index: number) => {
    if (confirmingIndex !== null) return;
    if (!activeWorkspace || !extractedData?.transactions) return;
    const txn = extractedData.transactions[index];
    if (!txn || statementTxnStatus[index]) return;

    setConfirmingIndex(index);

    const canCreateEvidence = hasPermission("Financial Evidence Package", "create");
    const canCreateRecords = hasPermission("Financial Records", "create");
    if (!canCreateEvidence || !canCreateRecords) {
      setErrorText("Policy Restriction: Your active user role lacks the permission clearance to write records inside this workspace.");
      setConfirmingIndex(null);
      return;
    }

    try {
      // Meaningful filename per statement line: <date>_<description>_RM<amount>.<ext>
      const stmtExt = (file?.name || "bank_statement.pdf").split(".").pop() || "pdf";
      const stmtLabel = (txn.description || "BankStmt").replace(/[^a-zA-Z0-9 ]/g, "").trim().replace(/\s+/g, "_").substring(0, 40) || "BankStmt";
      const stmtRenamedFileName = `${txn.date}_${stmtLabel}_RM${(txn.amount || 0).toFixed(2)}.${stmtExt}`;

      const freshEvidencePackage = addFinancialEvidencePackage({
        workspaceId: activeWorkspace.id,
        documentType: "STATEMENT",
        uploadDate: new Date().toISOString().split("T")[0],
        fileName: stmtRenamedFileName,
        fileUrl: fileDataUrl,
        notes: `Auto-logged via AI OCR Studio bank statement line item: ${txn.description}`
      });

      const recordType: FinancialRecordType = txn.type === "CREDIT" ? "INCOME" : "EXPENSE";

      const stmtRefNumber = `STMT-${file?.name || 'stmt'}-${index}`;

      const input: ConfirmInput = {
        workspaceId: activeWorkspace.id,
        tenantId: user?.tenantId || activeWorkspace.tenantId,
        userId: user?.id,
        userEmail: user?.email,
        userRole: user?.role,
        transactionType: recordType as any,
        amount: txn.amount,
        category: txn.suggestedCategory || "Lain-lain",
        relatedParty: txn.description,
        date: txn.date,
        confidenceScore: txn.confidenceScore ?? 0.8,
        referenceNumber: stmtRefNumber,
        description: `Linked automated OCR bank statement line item: ${txn.description}`,
        pendingEvidence: {
          documentType: "STATEMENT",
          fileName: file?.name || "bank_statement.pdf",
          fileUrl: fileDataUrl,
        },
        evidenceAttached: true,
        source: "BANK_STATEMENT",
        sourceTitle: `bank statement transaction: ${txn.description}`,
        auditDestination: "NONE",
        precheckDuplicate: false,
      };

      const result = await confirmFinancialRecord(input, {
        addFinancialEventAwaited,
        addFinancialEvent,
        addDebtRecordAwaited: async () => ({ id: "" } as any),
        addDebtRecord: () => ({ id: "" } as any),
        addFinancialCommitmentAwaited: async () => ({ id: "" } as any),
        addFinancialCommitment: () => ({ id: "" } as any),
        addAssetPurchase: async () => undefined,
        addOwnerTransaction: async () => undefined,
        linkEvidenceToRecord: () => undefined,
        learnOcrPattern,
        scanForDuplicates: async () => [],
        logEvent: () => undefined,
        logTenantActivity: () => undefined,
      });

      if (!result.ok) {
        setErrorText("Failed to persist this statement transaction.");
        return;
      }

      const freshEvent = {
        id: result.recordId || "",
        workspaceId: activeWorkspace.id,
        type: recordType,
        categoryName: txn.suggestedCategory || "Lain-lain",
        amountMyr: txn.amount,
        partyName: txn.description,
        date: txn.date,
        referenceNumber: stmtRefNumber,
        description: `Linked automated OCR bank statement line item: ${txn.description}`,
        isCompleted: true,
        sourceSystem: "BANK_STATEMENT",
      };

      freshEvidencePackage.relatedRecordId = freshEvent.id;
      freshEvidencePackage.relatedRecordType = recordType;

      writeAuditLog({
        workspaceId: activeWorkspace.id,
        module: "Financial Evidence Package",
        action: "CREATE",
        oldValue: null,
        newValue: { id: freshEvidencePackage.id, fileName: freshEvidencePackage.fileName, documentType: "STATEMENT", linkedRecordId: freshEvent.id }
      });
      writeAuditLog({
        workspaceId: activeWorkspace.id,
        module: "Financial Records",
        action: "CREATE",
        oldValue: null,
        newValue: freshEvent
      });

      if (user) {
        logEvent({
          tenantId: user.tenantId, workspaceId: activeWorkspace.id, userId: user.id,
          userEmail: user.email, userRole: user.role, eventType: "OCR_PROCESS",
          description: `Confirmed bank statement transaction: ${txn.description}`,
          metadata: { documentType: "STATEMENT", amountMyr: txn.amount, type: txn.type },
        });
      }

      setStatementTxnStatus(prev => ({ ...prev, [index]: "confirmed" }));
    } catch (ex) {
      console.error(ex);
      setErrorText("Failed to persist this statement transaction.");
    } finally {
      setConfirmingIndex(null);
    }
  };

  const handleRejectStatementTransaction = (index: number) => {
    setStatementTxnStatus(prev => ({ ...prev, [index]: "rejected" }));
  };

  // Dynamic colors for confidence meter
  const scorePct = Math.round((extractedData?.confidenceScore || 0) * 100);
  const confidenceColor = scorePct >= 90 ? "bg-emerald-500 text-emerald-800 border-emerald-200" :
                          scorePct >= 75 ? "bg-amber-500 text-amber-800 border-amber-200" : "bg-rose-500 text-rose-800 border-rose-200";

  return (
    <div className="space-y-6" id="ocr_studio_view">
      
      {/* BRAND HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <h2 className="font-display font-bold text-slate-900 text-xl flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-600 animate-pulse" />
            AI Document OCR Extraction Studio
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            Upload physical invoices, receipts, and Maybank statements. Our AI decodes raw layouts into ready-to-log ledger items seamlessly with complete tenant isolation.
          </p>
        </div>

        <div className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] uppercase font-mono bg-emerald-50 border border-emerald-150 rounded text-emerald-700 font-bold select-none">
          <FileCheck className="w-3.5 h-3.5" />
          AI Engine Co-Pilot
        </div>
      </div>

      {/* FEEDBACK LABELS */}
      {errorText && (
        <div className="p-3 bg-rose-50 border border-rose-150 rounded-xl text-xs text-rose-800 flex items-start gap-2.5 animate-slide-up" id="ocr_error_badge">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorText}</span>
        </div>
      )}

      {successText && (
        <div className="p-3 bg-emerald-50 border border-emerald-150 rounded-xl text-xs text-emerald-800 flex items-start gap-2.5 animate-slide-up" id="ocr_success_badge">
          <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{successText}</span>
        </div>
      )}

      {/* WORKFLOW TRACK STEPPER */}
      <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-semibold tracking-wider uppercase text-slate-400 bg-slate-50 p-2 rounded-lg border border-slate-200/60 font-mono">
        <div className={`py-1 rounded ${!file ? "text-emerald-700 font-bold bg-white border border-slate-200 shadow-3xs" : ""}`}>1. Choose & Drop</div>
        <div className={`py-1 rounded ${file && !extractedData && !isAnalyzing ? "text-emerald-700 font-bold bg-white border border-slate-200 shadow-3xs" : ""}`}>2. OCR Analyze</div>
        <div className={`py-1 rounded ${isAnalyzing ? "text-emerald-700 font-bold bg-white border border-slate-200 shadow-3xs animate-pulse" : ""}`}>3. Co-Pilot Extraction</div>
        <div className={`py-1 rounded ${extractedData ? "text-emerald-700 font-bold bg-emerald-100 border border-emerald-250 shadow-3xs" : ""}`}>4. Refine & Confirm</div>
      </div>

      {/* CORE OCR WORKSPACE */}
      {!extractedData ? (
        
        /* PHASE 1 & 2: DOCUMENT UPLOAD & INPUT */
        <div className="bg-white border border-slate-200 rounded-xl p-5 text-left grid grid-cols-1 lg:grid-cols-12 gap-6" id="upload_workspace">
          
          {/* Document configuration and Drop area */}
          <div className="lg:col-span-7 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Classification Category</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(["RECEIPT", "INVOICE", "STATEMENT", "SUPPORTING_DOC"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setDocumentType(type)}
                    type="button"
                    className={`px-3 py-2 text-xs font-mono font-bold border rounded-lg transition select-none cursor-pointer ${
                      documentType === type 
                        ? "bg-emerald-900 border-emerald-950 text-white" 
                        : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200"
                    }`}
                  >
                    {type === "RECEIPT" ? "Receipt/Bil" : 
                     type === "INVOICE" ? "Invoice" : 
                     type === "STATEMENT" ? "Bank Statement" : "Supporting"}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Filing Instructions (Optional)</label>
              <input
                type="text"
                placeholder="Include key references, audit notes, or custom labels..."
                value={uploadNotes}
                onChange={(e) => setUploadNotes(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-slate-50/50 focus:outline bg-white focus:ring-1 focus:ring-emerald-500"
                id="ocr_upload_notes"
              />
            </div>

            {/* Drag & Drop Canvas */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center transition cursor-pointer select-none group flex flex-col items-center justify-center space-y-2 ${
                isDragging 
                  ? "border-emerald-500 bg-emerald-50 text-emerald-900" 
                  : "border-slate-300 hover:border-slate-500 bg-slate-50/50 hover:bg-slate-50"
              }`}
              id="ocr_drag_and_drop_zone"
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*,application/pdf"
                className="hidden"
              />
              
              <div className="p-3 bg-white border border-slate-150 rounded-full text-slate-500 shadow-3xs group-hover:scale-115 transition">
                <UploadCloud className="w-6 h-6 text-emerald-600" />
              </div>

              {file ? (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-800 line-clamp-1">{file.name}</p>
                  <p className="text-[10px] font-mono text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB • Click to change</p>
                </div>
              ) : (
                <div className="space-y-1 pt-1">
                  <p className="text-xs font-semibold text-slate-800">
                    Drag and drop file here, or <span className="text-emerald-700 underline font-bold">browse drive</span>
                  </p>
                  <p className="text-[10px] text-slate-400">PDFs, JPEGs, PNGs up to 12MB. Securely isolated in workspace.</p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Original Document Selection State and Action Buttons */}
          <div className="lg:col-span-5 bg-slate-50 rounded-xl p-5 flex flex-col justify-between border border-slate-150">
            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">Attachment Selected</h4>
              
              {file ? (
                <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-2">
                  <div className="flex items-center gap-2.5">
                    <FileText className="w-8 h-8 text-emerald-600" />
                    <div className="truncate text-left">
                      <p className="text-xs font-semibold text-slate-800 truncate" title={file.name}>{file.name}</p>
                      <p className="text-[10px] font-mono text-slate-400">Type: {file.type || "Unknown binary"}</p>
                    </div>
                  </div>
                  
                  {fileDataUrl && file.type.startsWith("image/") && (
                    <div className="relative aspect-video bg-slate-100 rounded border border-slate-150 overflow-hidden select-none">
                      <img src={fileDataUrl} alt="Snippet Scan" className="object-cover w-full h-full pr-1.5" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <Info className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="text-xs italic font-sans">No invoice selected to verify.</p>
                </div>
              )}

              <div className="text-[11px] text-slate-400 bg-white border border-slate-150 rounded p-2.5 leading-relaxed text-left font-sans">
                💡 <strong>Workspace Boundary:</strong> Scanning reads text locally using memory buffers. AI suggestions do not construct final ledger entities until your visual review confirms inputs.
              </div>
            </div>

            {/* LAUNCH OCR BUTTON */}
            <div className="pt-4 border-t border-slate-200 mt-4">
              {isAnalyzing ? (
                <div className="space-y-2 py-2" id="analysing_spinner_animation">
                  {ocrJob ? (
                    <DocumentProcessingProgressPanel job={ocrJob} />
                  ) : (
                    <div className="flex items-center justify-center gap-2 text-xs font-bold text-emerald-800">
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                      <span>{analysisStep}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex gap-2">
                  {file && (
                    <button
                      onClick={handleClearSelected}
                      type="button"
                      className="px-3 py-2.5 border border-slate-250 hover:bg-slate-150 text-slate-600 rounded-lg text-xs font-bold cursor-pointer transition select-none"
                    >
                      Clear
                    </button>
                  )}
                  <button
                    disabled={!file}
                    onClick={handlePerformOCR}
                    type="button"
                    className={`flex-1 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition select-none ${
                      file 
                        ? "bg-emerald-900 border-emerald-950 hover:bg-emerald-800 text-white shadow-xs cursor-pointer" 
                        : "bg-slate-150 text-slate-400 cursor-not-allowed"
                    }`}
                  >
                    <Sparkles className="w-4 h-4" />
                    Analyze with Gemini 3.5
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>

      ) : (

        /* PHASE 3: DUAL-PANE CO-PILOT REVIEW AND VERIFICATION */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start" id="ocr_review_panel_split">
          
          {/* Left Column: Original Document Preview */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 text-left space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">Original Source Preview</h3>
              <button
                onClick={handleClearSelected}
                className="text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-1 font-sans cursor-pointer"
              >
                Upload Different File
              </button>
            </div>

            {/* Image Preview Canvas */}
            {fileDataUrl && file?.type.startsWith("image/") ? (
              <div className="relative border border-slate-200 rounded-lg overflow-hidden bg-slate-50 min-h-[300px] flex items-center justify-center p-2">
                <img src={fileDataUrl} alt="Source file" className="max-h-[400px] object-contain rounded" referrerPolicy="no-referrer" />
                <div className="absolute top-2 right-2 flex gap-1">
                  <a
                    href={fileDataUrl}
                    download={file?.name || "extracted_receipt.png"}
                    className="p-1 px-2 text-[9px] font-mono bg-white/95 text-slate-700 hover:bg-white rounded border border-slate-200 flex items-center gap-1 cursor-pointer font-bold shadow-3xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </a>
                </div>
              </div>
            ) : (
              <div className="border border-slate-150 border-dashed rounded-lg p-12 text-center bg-slate-50/50 space-y-3">
                <div className="p-3 bg-white border border-slate-200 rounded-xl inline-block text-slate-400 shadow-3xs">
                  <FileText className="w-8 h-8 text-slate-500" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-800">{file?.name}</p>
                  <p className="text-[10px] font-mono text-slate-400">{(file?.size || 0) / 1024 / 1024} MB • Binary/PDF File</p>
                </div>
                <div className="text-[10px] text-slate-500 font-sans leading-relaxed max-w-sm mx-auto">
                  PDF previewing restricted in nested iframes. Click below to inspect raw file tags or download the document packet.
                </div>
                <a 
                  href={fileDataUrl}
                  download={file?.name || "doc.pdf"}
                  className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-bold bg-white border border-emerald-200 rounded px-3 py-1.5 shadow-3xs"
                >
                  <Download className="w-3.5 h-3.5" /> Download Original Document
                </a>
              </div>
            )}

            {/* Cognitive Snipped Text Area */}
            {extractedData?.rawExtractedText && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">Raw Scan Diagnostic</p>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-150 text-[10.5px] font-mono text-slate-600 whitespace-pre-wrap leading-tight">
                  "{extractedData.rawExtractedText}"
                </div>
              </div>
            )}
          </div>

          {/* Right Column: AI Suggestions Reviewed Editor, OR Module 10 multi-transaction list for bank statements */}
          {extractedData?.transactions && extractedData.transactions.length > 0 ? (
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 text-left space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-semibold text-slate-800">Bank Statement — Extracted Transactions</h3>
                <p className="text-[10px] text-slate-400 font-mono">{extractedData.transactions.length} transaction(s) found. Confirm or reject each one individually.</p>
              </div>
              <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                {extractedData.transactions.map((txn, idx) => {
                  const status = statementTxnStatus[idx] || "pending";
                  return (
                    <div key={idx} className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-3 ${
                      status === "confirmed" ? "bg-emerald-50 border-emerald-200" :
                      status === "rejected" ? "bg-slate-50 border-slate-200 opacity-50" :
                      "bg-white border-slate-200"
                    }`}>
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-800 truncate">{txn.description}</div>
                        <div className="font-mono text-slate-400">{txn.date} • {txn.suggestedCategory} • {txn.type}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`font-mono font-bold ${txn.type === "CREDIT" ? "text-emerald-700" : "text-rose-700"}`}>
                          {txn.type === "CREDIT" ? "+" : "-"}RM{txn.amount.toFixed(2)}
                        </span>
                        {status === "pending" && (
                          <>
                            <button type="button" onClick={() => handleConfirmStatementTransaction(idx)} disabled={confirmingIndex === idx} className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed">Confirm</button>
                            <button type="button" onClick={() => handleRejectStatementTransaction(idx)} className="px-2 py-1 rounded bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold">Reject</button>
                          </>
                        )}
                        {status === "confirmed" && <CheckCircle className="w-4 h-4 text-emerald-600" />}
                      </div>
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={handleClearSelected}
                className="w-full py-2.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                Done — Upload Another Statement
              </button>
            </div>
          ) : (
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 text-left space-y-5">

            {/* Header with Confidence score indicator */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Ledger Input Calibration</h3>
                <p className="text-[10px] text-slate-400 font-mono">AI generated suggestions. Human verification required.</p>
              </div>

              {/* Meter */}
              <div className="text-right flex items-center gap-2 bg-emerald-50 rounded-lg p-2 px-3 border border-emerald-100">
                <div>
                  <p className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest text-right">Confidence</p>
                  <p className="text-xs font-mono font-black text-emerald-800 leading-none">{scorePct}% Accurate</p>
                </div>
                <div className="w-1.5 h-8 bg-slate-200 rounded overflow-hidden relative">
                  <div className="absolute bottom-0 left-0 w-full bg-emerald-500 rounded" style={{ height: `${scorePct}%` }} />
                </div>
              </div>
            </div>

            {/* Core input grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" id="ocr_inputs_review_grid">
              
              {/* Record Type Destination */}
              <div className="sm:col-span-2 space-y-1">
                <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">Financial Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { setSelectedRecordType("EXPENSE"); }}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition cursor-pointer select-none ${
                      selectedRecordType === "EXPENSE" 
                        ? "bg-rose-50 border-rose-250 text-rose-800 font-bold" 
                        : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                    }`}
                  >
                    <TrendingDown className="w-4 h-4 text-rose-500" />
                    Log Outgoing Expense
                  </button>

                  <button
                    type="button"
                    onClick={() => { setSelectedRecordType("INCOME"); }}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition cursor-pointer select-none ${
                      selectedRecordType === "INCOME" 
                        ? "bg-emerald-50 border-emerald-250 text-emerald-800 font-bold" 
                        : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                    }`}
                  >
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    Log Incoming Revenue
                  </button>
                </div>
              </div>

              {/* Merchant Supplier Name */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">Merchant / Supplier Name</label>
                <div className="relative">
                  <input
                    type="text"
                    value={reviewedMerchantName}
                    onChange={(e) => setReviewedMerchantName(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-200 bg-slate-50/50 focus:bg-white rounded-lg focus:outline focus:ring-1 focus:ring-emerald-500 font-semibold"
                    id="inp_reviewed_merchant"
                  />
                </div>
              </div>

              {/* Document/Invoice Ref No */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">Document Ref Number</label>
                <input
                  type="text"
                  value={reviewedDocumentNumber}
                  onChange={(e) => setReviewedDocumentNumber(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 bg-slate-50/50 focus:bg-white rounded-lg focus:outline focus:ring-1 focus:ring-emerald-500 font-mono"
                  id="inp_reviewed_doc_no"
                />
              </div>

              {/* Document Date */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">Document Date</label>
                <input
                  type="date"
                  value={reviewedDate}
                  onChange={(e) => setReviewedDate(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 bg-slate-50/50 focus:bg-white rounded-lg focus:outline focus:ring-1 focus:ring-emerald-500"
                  id="inp_reviewed_date"
                />
              </div>

              {/* Ledger/Tax Category */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">Deducted Category</label>
                <select
                  value={reviewedCategory}
                  onChange={(e) => setReviewedCategory(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 bg-slate-50/50 focus:bg-white rounded-lg focus:outline"
                  id="inp_reviewed_category"
                >
                  <option value="Utilities">Utilities (Tenaga/Water)</option>
                  <option value="Saas">Software/SaaS Platforms</option>
                  <option value="Meals">Meals & Entertainment</option>
                  <option value="Travel">Business Travel/Grab/Trans</option>
                  <option value="Office Supplies">Office Supplies & Stationery</option>
                  <option value="Professional Services">Agency / Pro Services</option>
                  <option value="Software Sales">SaaS Income / Revenue</option>
                  <option value="Consulting fees">Consultancy Income</option>
                </select>
              </div>

              {/* Amount */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">Amount (Raw Value)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 text-xs font-bold pointer-events-none">
                    {reviewedCurrency}
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    value={reviewedAmount || ""}
                    onChange={(e) => setReviewedAmount(parseFloat(e.target.value) || 0)}
                    className="w-full text-xs pl-12 pr-4 py-2 border border-slate-200 bg-slate-50/50 focus:bg-white rounded-lg focus:outline focus:ring-1 focus:ring-emerald-500 font-bold"
                    id="inp_reviewed_amount"
                  />
                </div>
              </div>

              {/* Currency Selector */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">Currency Code</label>
                <select
                  value={reviewedCurrency}
                  onChange={(e) => setReviewedCurrency(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 bg-slate-50/50 focus:bg-white rounded-lg focus:outline"
                  id="inp_reviewed_currency"
                >
                  <option value="MYR">MYR - Ringgit Malaysia</option>
                  <option value="USD">USD - United States Dollar</option>
                  <option value="SGD">SGD - Singapore Dollar</option>
                  <option value="EUR">EUR - Euro Zone</option>
                </select>
              </div>

              {/* OPTIONAL ACCOUNT SETTLEMENT INTERACTION */}
              <div className="sm:col-span-2 border-t border-slate-100 pt-3 mt-1 space-y-3">
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <label className="text-xs font-semibold text-slate-700">Offset Asset Account Settlement</label>
                  <span className="text-[10px] text-slate-400 font-mono">Deducts/increments account balances immediately.</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => { setOffsetAccountType("NONE"); setSelectedAccountId(""); }}
                    className={`py-1.5 px-3 border text-xs font-semibold rounded-lg select-none cursor-pointer transition ${
                      offsetAccountType === "NONE" 
                        ? "bg-slate-900 text-white border-slate-950 font-bold" 
                        : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200"
                    }`}
                  >
                    No Direct Offset (Filing Only)
                  </button>

                  <button
                    type="button"
                    disabled={cashAccounts.length === 0}
                    onClick={() => { setOffsetAccountType("CASH"); setSelectedAccountId(cashAccounts[0]?.id || ""); }}
                    className={`py-1.5 px-3 border text-xs font-semibold rounded-lg select-none cursor-pointer disabled:opacity-40 transition ${
                      offsetAccountType === "CASH" 
                        ? "bg-slate-900 text-white border-slate-950 font-bold" 
                        : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200"
                    }`}
                  >
                    Cash Balance Offset
                  </button>

                  <button
                    type="button"
                    disabled={bankAccounts.length === 0}
                    onClick={() => { setOffsetAccountType("BANK"); setSelectedAccountId(bankAccounts[0]?.id || ""); }}
                    className={`py-1.5 px-3 border text-xs font-semibold rounded-lg select-none cursor-pointer disabled:opacity-40 transition ${
                      offsetAccountType === "BANK" 
                        ? "bg-slate-900 text-white border-slate-950 font-bold" 
                        : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200"
                    }`}
                  >
                    Bank Liquidity Offset
                  </button>
                </div>

                {offsetAccountType !== "NONE" && (
                  <div className="space-y-1 animate-slide-down">
                    <label className="text-[9px] font-mono text-slate-400 uppercase tracking-widest font-black">Target Ledger Account</label>
                    <select
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      className="w-full text-xs px-3 py-2 border border-slate-200 bg-slate-50 rounded-lg"
                      id="inp_selected_ledger_account"
                    >
                      {offsetAccountType === "CASH" && cashAccounts.map((acct) => (
                        <option key={acct.id} value={acct.id}>
                          {acct.name} — Balance: MYR {acct.currentBalanceMyr.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                        </option>
                      ))}
                      {offsetAccountType === "BANK" && bankAccounts.map((acct) => (
                        <option key={acct.id} value={acct.id}>
                          {acct.bankName} ({acct.accountName}) — No: {acct.accountNumber}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

            </div>

            {/* ACTION SECTION */}
            <div className="flex gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={handleClearSelected}
                className="px-4 py-2.5 border border-slate-250 hover:bg-slate-100/80 rounded-lg text-xs font-bold text-slate-600 transition cursor-pointer"
              >
                Reset Scans
              </button>
              
              <button
                type="button"
                onClick={handleConfirmAndLog}
                disabled={isConfirming}
                className="flex-1 py-2.5 rounded-lg text-xs font-bold bg-emerald-900 border-emerald-950 hover:bg-emerald-800 text-white shadow-xs select-none cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                id="btn_confirm_log_record"
              >
                <CheckCircle className="w-4 h-4" />
                Confirm & Sync Ledger Transaction
              </button>
            </div>

          </div>
          )}

        </div>
      )}

      {/* OCR LEARNING LAYER ACTIVE REGISTER */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 text-left space-y-4 shadow-3xs" id="ocr_learning_register_panel">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-rose-100/10 pb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5 font-display">
              <BookOpen className="w-4 h-4 text-emerald-600 animate-pulse" />
              AI Learning Layer Registry & Pattern Logs
            </h3>
            <p className="text-xs text-slate-500">
              Active pattern memory extracted from verified transaction audits. Confirmed vendor-to-ledger profiles are used by the Co-Pilot to pre-classify new documents automatically.
            </p>
          </div>
          <div className="text-[10px] font-mono bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-md border border-emerald-250/30 font-bold">
            {ocrLearnedPatterns.length} Active Profiles
          </div>
        </div>

        {ocrLearnedPatterns.length === 0 ? (
          <div className="py-8 text-center bg-slate-50 border border-slate-150/60 rounded-xl space-y-1.5" id="no_patterns_state">
            <Sparkles className="w-5 h-5 mx-auto text-emerald-600/60 animate-bounce" />
            <p className="text-xs font-semibold text-slate-600">No learned vendor patterns recorded yet.</p>
            <p className="text-[10px] text-slate-400 max-w-sm mx-auto">
              Confirm any OCR scan result to train the AI with your chart of accounts classifications automatically.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-150/80" id="patterns_list_table">
            <table className="w-full text-left text-xs text-slate-500">
              <thead className="bg-slate-50 text-[10px] uppercase font-mono text-slate-400 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Vendor / Customer Profile</th>
                  <th className="px-4 py-3 font-semibold">Learned Category</th>
                  <th className="px-4 py-3 font-semibold">Record Type</th>
                  <th className="px-4 py-3 font-semibold text-center">Confidence Score</th>
                  <th className="px-4 py-3 font-semibold text-center">Audit Actions Count</th>
                  <th className="px-4 py-3 font-semibold text-center">Last Updated</th>
                  <th className="px-4 py-3 font-semibold text-right">Filing Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ocrLearnedPatterns.map((pattern) => (
                  <tr key={pattern.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-800 font-bold font-mono">
                      {pattern.vendorName}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-semibold text-slate-700">
                      {pattern.category}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                        pattern.recordType === "INCOME" 
                          ? "bg-emerald-50 text-emerald-700" 
                          : "bg-rose-50 text-rose-700"
                      }`}>
                        {pattern.recordType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="font-mono text-[11px] font-bold text-slate-600">
                          {Math.round(pattern.confidenceScore * 100)}%
                        </span>
                        <div className="w-12 h-1.5 bg-slate-200 rounded overflow-hidden relative">
                          <div 
                            className={`absolute left-0 top-0 h-full rounded ${
                              pattern.confidenceScore >= 0.9 ? "bg-emerald-500" : (pattern.confidenceScore >= 0.75 ? "bg-amber-500" : "bg-rose-500")
                            }`}
                            style={{ width: `${pattern.confidenceScore * 100}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-slate-700">
                      {pattern.occurrenceCount} verified syncs
                    </td>
                    <td className="px-4 py-3 text-center text-[10px] font-mono text-slate-400">
                      {new Date(pattern.lastUpdated).toLocaleDateString("en-MY", { year: "numeric", month: "short", day: "numeric" })}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <button
                        onClick={() => deleteOcrLearnedPattern(pattern.id)}
                        className="text-rose-600 hover:text-rose-800 hover:bg-rose-50 bg-transparent px-2 py-1 rounded border border-rose-200 hover:border-rose-300 transition text-[11px] font-semibold cursor-pointer"
                        title="Delete learned mapping constraint"
                      >
                        Purge Memory
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
