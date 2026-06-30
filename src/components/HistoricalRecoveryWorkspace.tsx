// MyKerani — Historical Recovery Workspace (Financial Recovery Foundation
// Build Sprint V1, Task 5).
//
// Helps a user with old/incomplete data rebuild their financial history:
//   Upload bank statement (CSV/Excel) -> AI suggests category + confidence
//   -> internal transfers flagged -> user confirms each row -> FinancialEvent
//   written. Old P&L/Balance Sheet/Excel documents can also be archived as
//   evidence for record-keeping, without inventing a new parser for them.
//
// Reuses existing, already-validated engines only:
//   - bankStatementImport.ts (Task 1)
//   - transactionRecoveryEngine.ts (Task 2)
//   - internalTransferDetection.ts (Task 3)
//   - financialCompletenessEngine.ts (Task 4)
// "AI Suggests -> User Confirms -> AI Learns": this screen never writes a
// FinancialEvent without an explicit per-row Confirm click.

import React, { useMemo, useRef, useState } from "react";
import { Upload, CheckCircle, XCircle, ArrowLeftRight, FileSpreadsheet, ShieldCheck } from "lucide-react";
import { useFinancials } from "../context/FinancialRecordsContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { useAuth } from "../context/AuthContext";
import { usePermission } from "../context/PermissionContext";
import { useAudit } from "../context/AuditContext";
import { useTenant } from "../context/TenantContext";
import { logEvent } from "../lib/eventLog";
import { confirmFinancialRecord, type ConfirmInput } from "../lib/financialRecordConfirmation";
import { parseCsvBankStatement, detectBankFromHeader, csvTextToRows, type ImportedBankTransaction, type SupportedBank } from "../lib/bankStatementImport";
import { suggestCategoriesForTransactions, type RecoverySuggestion } from "../lib/transactionRecoveryEngine";
import { detectInternalTransfers, getInternalTransferTransactionSet } from "../lib/internalTransferDetection";
import { computeFinancialCompleteness } from "../lib/financialCompletenessEngine";
import { buildReportBuckets, flattenBuckets } from "../lib/reportBucketAggregator";
import { buildEvidenceIndex, getEvidenceCoverageRatio } from "../lib/evidenceDrilldown";
import { recordImportFailures } from "../lib/importFailureLog";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { isDemoWorkspace } from "../lib/seeder";
import type { FinancialRecordType } from "../types";

export const HistoricalRecoveryWorkspace: React.FC = () => {
  const {
    financialEvents,
    cashAccounts,
    bankAccounts,
    debtRecords,
    financialCommitments,
    financialEvidencePackages,
    ocrLearnedPatterns,
    addFinancialEvent,
    addFinancialEvidencePackage,
    learnOcrPattern,
  } = useFinancials();
  const { activeWorkspace } = useWorkspace();
  const { user, isMockUser } = useAuth();
  const { hasPermission } = usePermission();
  const { writeAuditLog } = useAudit();
  const { activeTenant } = useTenant();

  const csvInputRef = useRef<HTMLInputElement>(null);
  const archiveInputRef = useRef<HTMLInputElement>(null);

  const [parsedTransactions, setParsedTransactions] = useState<ImportedBankTransaction[]>([]);
  const [skippedRows, setSkippedRows] = useState<{ rowIndex: number; reason: string }[]>([]);
  const [detectedBank, setDetectedBank] = useState<SupportedBank | null>(null);
  const [confirmedIndexes, setConfirmedIndexes] = useState<Set<number>>(new Set());
  const [rejectedIndexes, setRejectedIndexes] = useState<Set<number>>(new Set());
  const [archiveStatus, setArchiveStatus] = useState<string>("");
  const [importError, setImportError] = useState<string>("");

  // Pattern Lifecycle (Phase 2B): disabled patterns must never feed suggestions
  // -- same rule the shared findLearnedPattern() lookup engine enforces.
  const activeLearnedPatterns = useMemo(
    () => ocrLearnedPatterns.filter((p) => p.isActive !== false),
    [ocrLearnedPatterns]
  );

  const suggestions: RecoverySuggestion[] = useMemo(
    () => suggestCategoriesForTransactions(parsedTransactions, activeLearnedPatterns),
    [parsedTransactions, activeLearnedPatterns]
  );

  const transferMatches = useMemo(() => detectInternalTransfers(parsedTransactions), [parsedTransactions]);
  const transferTxnSet = useMemo(() => getInternalTransferTransactionSet(transferMatches), [transferMatches]);

  const completeness = useMemo(() => {
    const buckets = buildReportBuckets({ financialEvents, debtRecords, financialCommitments, assetPurchases: [], ownerTransactions: [], cashAccounts, bankAccounts });
    const evidenceIndex = buildEvidenceIndex(financialEvidencePackages);
    const evidenceCoverageRatio = getEvidenceCoverageRatio(flattenBuckets(buckets), evidenceIndex);
    return computeFinancialCompleteness({ financialEvents, bankAccounts, cashAccounts, evidenceCoverageRatio });
  }, [financialEvents, debtRecords, financialCommitments, financialEvidencePackages, cashAccounts, bankAccounts]);

  const handleCsvFile = async (file: File) => {
    setImportError("");
    setParsedTransactions([]);
    setSkippedRows([]);
    setConfirmedIndexes(new Set());
    setRejectedIndexes(new Set());
    try {
      const text = await file.text();
      const header = csvTextToRows(text)[0] || [];
      const bank = detectBankFromHeader(header);
      const result = parseCsvBankStatement(text, bank, file.name);
      setDetectedBank(result.bank);
      setParsedTransactions(result.transactions);
      setSkippedRows(result.skippedRows);
      if (activeWorkspace && result.skippedRows.length > 0) {
        recordImportFailures(activeWorkspace.id, file.name, result.skippedRows.length);

        // GAP-M3: an Owner who never opens this screen would otherwise
        // never learn an import had skipped rows needing review.
        if (isSupabaseConfigured() && !isMockUser && supabase && activeTenant && !isDemoWorkspace(activeWorkspace.id)) {
          supabase.from("workspace_notifications").insert({
            workspace_id: activeWorkspace.id,
            tenant_id: activeTenant.id,
            category: "SYSTEM",
            title: "Import sejarah memerlukan semakan",
            message: `${result.skippedRows.length} baris dalam fail "${file.name}" tidak dapat diimport secara automatik dan memerlukan semakan manual.`,
            metadata: { fileName: file.name, skippedCount: result.skippedRows.length }
          }).then(({ error }) => {
            if (error) console.error("Import-failure notification insert failed:", error.message);
          });
        }
      }
      if (result.transactions.length === 0) {
        setImportError("Tiada transaksi sah dapat dikenal pasti dalam fail ini.");
      }
    } catch {
      setImportError("Fail tidak dapat dibaca. Pastikan ia adalah fail CSV/Excel-export yang sah.");
    }
  };

  const handleConfirmRow = async (index: number) => {
    if (!activeWorkspace || confirmedIndexes.has(index) || rejectedIndexes.has(index)) return;
    if (!hasPermission("Financial Records", "create")) {
      setImportError("Policy Restriction: Your active user role lacks permission to write records.");
      return;
    }
    const txn = parsedTransactions[index];
    const suggestion = suggestions[index];
    if (!txn || !suggestion) return;

    const isTransfer = transferTxnSet.has(txn);
    const recordType: FinancialRecordType = isTransfer ? "INCOME" : suggestion.suggestedRecordType;
    const categoryName = isTransfer ? "Internal Transfer" : suggestion.suggestedCategoryName;

    const input: ConfirmInput = {
      workspaceId: activeWorkspace.id,
      tenantId: activeTenant?.id || activeWorkspace.tenantId,
      userId: user?.id,
      userEmail: user?.email,
      userRole: user?.role,
      transactionType: recordType as any,
      amount: txn.amountMyr,
      category: categoryName,
      relatedParty: txn.description,
      date: txn.date,
      confidenceScore: suggestion.confidenceScore,
      referenceNumber: txn.referenceNumber || `RECOVERY-${txn.sourceRowIndex}`,
      description: `Recovered from historical ${txn.sourceBank} statement (${txn.account}): ${txn.description}`,
      pendingEvidence: {
        documentType: "STATEMENT",
        fileName: `historical_${txn.sourceBank}_${txn.account}.csv`,
        fileUrl: "",
      },
      evidenceAttached: true,
      source: "BANK_STATEMENT",
      sourceTitle: `historical recovery transaction: ${txn.description}`,
      auditDestination: "NONE",
      skipOcrLearning: isTransfer,
      precheckDuplicate: false,
    };

    const result = await confirmFinancialRecord(input, {
      addFinancialEventAwaited: addFinancialEvent as any,
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
      setImportError(result.error || "Gagal menyimpan rekod.");
      return;
    }

    const freshEvent = {
      id: result.recordId || "",
      workspaceId: activeWorkspace.id,
      type: recordType,
      categoryName,
      amountMyr: txn.amountMyr,
      partyName: txn.description,
      date: txn.date,
      referenceNumber: txn.referenceNumber || `RECOVERY-${txn.sourceRowIndex}`,
      description: `Recovered from historical ${txn.sourceBank} statement (${txn.account}): ${txn.description}`,
      isCompleted: true,
      sourceSystem: "BANK_STATEMENT",
    };

    const freshEvidencePackage = addFinancialEvidencePackage({
      workspaceId: activeWorkspace.id,
      documentType: "STATEMENT",
      uploadDate: new Date().toISOString().split("T")[0],
      fileName: `historical_${txn.sourceBank}_${txn.account}.csv`,
      fileUrl: "",
      notes: `Historical Recovery Workspace import: ${txn.description}`,
    });
    freshEvidencePackage.relatedRecordId = freshEvent.id;
    freshEvidencePackage.relatedRecordType = recordType;

    writeAuditLog({
      workspaceId: activeWorkspace.id,
      module: "Financial Records",
      action: "CREATE",
      oldValue: null,
      newValue: freshEvent,
    });

    if (user && activeTenant) {
      logEvent({
        tenantId: activeTenant.id, workspaceId: activeWorkspace.id, userId: user.id,
        userEmail: user.email, userRole: user.role, eventType: "OCR_PROCESS",
        description: `Confirmed Historical Recovery transaction: ${txn.description}`,
        metadata: { source: txn.sourceBank, amountMyr: txn.amountMyr, isTransfer },
      });
    }

    setConfirmedIndexes((prev) => new Set(prev).add(index));
  };

  const handleRejectRow = (index: number) => {
    setRejectedIndexes((prev) => new Set(prev).add(index));
  };

  const handleArchiveFile = async (file: File) => {
    if (!activeWorkspace) return;
    if (!hasPermission("Financial Evidence Package", "create")) {
      setArchiveStatus("Policy Restriction: lacks permission to upload evidence archives.");
      return;
    }
    addFinancialEvidencePackage({
      workspaceId: activeWorkspace.id,
      documentType: "SUPPORTING_DOC",
      uploadDate: new Date().toISOString().split("T")[0],
      fileName: file.name,
      fileUrl: "",
      notes: "Historical Recovery Workspace — archived old document (P&L Lama / Balance Sheet Lama / Excel Lama) for record-keeping.",
    });
    if (user && activeTenant) {
      logEvent({
        tenantId: activeTenant.id, workspaceId: activeWorkspace.id, userId: user.id,
        userEmail: user.email, userRole: user.role, eventType: "UPLOAD",
        description: `Archived historical document: ${file.name}`,
        metadata: { fileName: file.name },
      });
    }
    setArchiveStatus(`"${file.name}" telah diarkibkan sebagai bukti sejarah kewangan.`);
  };

  return (
    <div className="space-y-6" id="historical_recovery_workspace_root">
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1">
        <span className="text-[10px] font-mono uppercase bg-slate-900 text-slate-100 px-2.5 py-0.5 rounded-md font-bold">
          Financial Recovery Foundation
        </span>
        <p className="text-xs text-slate-500 font-sans">
          Upload apa yang ada → AI bantu susun → AI bantu pulihkan → Report terus boleh digunakan. Tidak perlu key-in semula semuanya.
        </p>
      </div>

      {/* Financial Completeness summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3" id="recovery_completeness_metrics">
        {[
          { label: "Rekod Kewangan", value: completeness.financialRecordsPct },
          { label: "Liputan Bukti", value: completeness.evidenceCoveragePct },
          { label: "Liputan Bank", value: completeness.bankCoveragePct },
          { label: "Liputan Sejarah", value: completeness.historicalCoveragePct },
        ].map((m) => (
          <div key={m.label} className="bg-slate-50 p-3 border border-slate-200 rounded-xl">
            <span className="text-[9px] font-mono uppercase text-slate-400 font-bold block">{m.label}</span>
            <p className="text-sm font-mono font-bold text-slate-800 mt-0.5">{m.value.toFixed(1)}%</p>
          </div>
        ))}
        <div className="bg-slate-900 text-white p-3 rounded-xl text-center flex flex-col justify-center">
          <span className="text-[9px] font-mono text-slate-350 uppercase font-bold block">Overall Completeness</span>
          <p className="text-sm font-mono font-bold mt-0.5">{completeness.overallCompletenessPct.toFixed(1)}%</p>
        </div>
      </div>

      {/* Bank statement import */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4" id="recovery_csv_import_panel">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-display font-semibold text-sm text-slate-900">1. Import Bank Statement Lama (CSV/Excel)</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Sokong Maybank, CIMB, RHB, BSN, Bank Islam, Public Bank, Hong Leong, dan format generik.</p>
          </div>
          <button
            type="button"
            onClick={() => csvInputRef.current?.click()}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center transition cursor-pointer"
            id="btn_upload_csv_statement"
          >
            <Upload className="w-3.5 h-3.5 mr-1.5" />
            Upload CSV
          </button>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleCsvFile(file);
              e.target.value = "";
            }}
          />
        </div>

        {importError && (
          <div className="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-3">{importError}</div>
        )}

        {parsedTransactions.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>
                {parsedTransactions.length} transaksi dikesan ({detectedBank}). {skippedRows.length} baris diabaikan.
                {transferMatches.length > 0 && ` ${transferMatches.length} pasangan Internal Transfer dikesan.`}
              </span>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden text-xs max-h-[480px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono text-[9px] uppercase tracking-wider sticky top-0">
                    <th className="p-2.5">Tarikh</th>
                    <th className="p-2.5">Keterangan</th>
                    <th className="p-2.5 text-right">Jumlah (RM)</th>
                    <th className="p-2.5">Cadangan Kategori</th>
                    <th className="p-2.5 text-center">Keyakinan</th>
                    <th className="p-2.5 text-center">Tindakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {parsedTransactions.map((txn, idx) => {
                    const suggestion = suggestions[idx];
                    const isTransfer = transferTxnSet.has(txn);
                    const confirmed = confirmedIndexes.has(idx);
                    const rejected = rejectedIndexes.has(idx);
                    return (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-2.5 font-mono text-slate-500">{txn.date}</td>
                        <td className="p-2.5">{txn.description}</td>
                        <td className={`p-2.5 text-right font-mono font-bold ${txn.direction === "CREDIT" ? "text-emerald-600" : "text-rose-600"}`}>
                          RM {txn.amountMyr.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-2.5">
                          {isTransfer ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 text-[9px] font-bold uppercase">
                              <ArrowLeftRight className="w-3 h-3" /> Internal Transfer
                            </span>
                          ) : (
                            suggestion?.suggestedCategoryName
                          )}
                        </td>
                        <td className="p-2.5 text-center font-mono">{Math.round((suggestion?.confidenceScore || 0) * 100)}%</td>
                        <td className="p-2.5 text-center">
                          {confirmed ? (
                            <CheckCircle className="w-4 h-4 text-emerald-600 inline" />
                          ) : rejected ? (
                            <XCircle className="w-4 h-4 text-slate-400 inline" />
                          ) : (
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleConfirmRow(idx)}
                                className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px]"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRejectRow(idx)}
                                className="px-2 py-1 rounded bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-[10px]"
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Old document archive */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4" id="recovery_archive_panel">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-display font-semibold text-sm text-slate-900">2. Arkibkan Dokumen Kewangan Lama</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">P&amp;L Lama, Balance Sheet Lama, atau Excel Lama — disimpan sebagai bukti sejarah kewangan anda.</p>
          </div>
          <button
            type="button"
            onClick={() => archiveInputRef.current?.click()}
            className="px-3 py-1.5 border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold flex items-center transition cursor-pointer"
            id="btn_upload_archive_document"
          >
            <Upload className="w-3.5 h-3.5 mr-1.5" />
            Upload Dokumen
          </button>
          <input
            ref={archiveInputRef}
            type="file"
            accept=".pdf,.xls,.xlsx,.csv,image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleArchiveFile(file);
              e.target.value = "";
            }}
          />
        </div>
        {archiveStatus && (
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-3">
            <ShieldCheck className="w-3.5 h-3.5" />
            {archiveStatus}
          </div>
        )}
      </div>
    </div>
  );
};
