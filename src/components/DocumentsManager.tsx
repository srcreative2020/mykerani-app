import React, { useState, useRef, useEffect } from "react";
import {
  Upload, X, Receipt, FileSpreadsheet, Landmark, RefreshCw, FileText,
  ExternalLink, Download,
} from "lucide-react";
import {
  uploadDocument, listDocuments, deleteDocument, getDocumentUrl, updateDocumentReview,
  isAllowedFileType, MAX_FILE_SIZE, fmtBytes as fmtDocBytes,
  type UploadedDoc, type DocType,
} from "../lib/documentStorage";
import { type StorageQuotaHook } from "../lib/storageQuota";
import { StorageBar } from "./StorageBar";
import DocumentProcessingProgressPanel from "./DocumentProcessingProgressPanel";
import { logEvent } from "../lib/eventLog";
import { logTenantActivity } from "../lib/hqService";
import { confirmFinancialRecord, type ConfirmInput } from "../lib/financialRecordConfirmation";
import { pollOcrJob, type OcrJobState } from "../lib/ocrJobTypes";
import { detectInternalTransfers } from "../lib/internalTransferDetection";
import { matchOwnBusinessAndBranch } from "../lib/businessMatching";
import type { ImportedBankTransaction } from "../lib/bankStatementImport";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import JSZip from "jszip";
import type { FinancialEvent, OcrLearnedPattern } from "../types";
import type { Business, BusinessBranch } from "../lib/profileData";

// Shared Document Engine — rendered IDENTICALLY by OwnerDashboard.tsx and
// StaffHomeScreen.tsx's "Dokumen" tab per MYKERANI_OWNER_STAFF_PARITY_RULE.md.
// Owns: upload -> OCR analyze -> AI review/confirm/reject -> evidence package.
// This is the one and only document/OCR-review engine in the app — do not
// fork a separate Staff implementation, see CLAUDE.md / parity rule.

const todayLocalIso = (): string => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

type DocReviewLine = {
  date: string; description: string; amount: number; type: "CREDIT" | "DEBIT";
  suggestedCategory: string; confidenceScore: number; include: boolean;
  matchedEventId?: string; matchedLabel?: string;
  isInternalTransfer?: boolean; transferPairLabel?: string;
  isOwnBusinessMatch?: boolean; ownBusinessMatchLabel?: string; ownBusinessMatchId?: string;
  branchMatchId?: string; branchMatchLabel?: string;
  branchMatchAmbiguous?: boolean; branchMatchCandidates?: string[];
};

type DocReview = {
  doc: UploadedDoc;
  merchantName: string;
  customerName: string;
  amount: string;
  date: string;
  category: string;
  recordType: "INCOME" | "EXPENSE" | "RECEIVABLE" | "PAYABLE" | "DEBT";
  confidenceScore: number;
  rawExtractedText: string;
  businessId?: string;
  branchId?: string;
  lines?: DocReviewLine[];
  pagesFound?: number | null;
  transactionsFound?: number;
  chunksTotal?: number | null;
  chunksFailed?: number | null;
  extractionIncomplete?: boolean;
};

export interface DocumentsManagerProps {
  workspaceId: string;
  workspaceName: string;
  tenantId?: string;
  currentUserId?: string;
  currentUserEmail?: string;
  currentUserRole?: string;
  currentUserFullName?: string;
  isMockUser?: boolean;
  /** Used as the localStorage key scope for refresh-safe OCR-job recovery. */
  activeSessionId?: string | null;
  /** Maps userId -> full name for "uploaded by" attribution. Build from the
   * same usePermission().userRoles team list both Owner and Staff have access to. */
  userNameById: Record<string, string>;
  /** Real-time storage quota for this tenant/workspace — same useStorageQuota()
   * engine call as the caller already makes elsewhere on its screen. */
  storageQuota: StorageQuotaHook;
  /** Financial events already loaded by the caller's FinancialRecordsContext,
   * scoped to this workspace — used for matching + the Evidence Package summary. */
  financialEvents: FinancialEvent[];
  businesses: Business[];
  businessBranches: Record<string, BusinessBranch[]>;
  ocrLearnedPatterns: OcrLearnedPattern[];
  addFinancialEventAwaited: (event: any, sourceSystem?: any) => Promise<FinancialEvent>;
  addFinancialEventsBatch: (
    events: any[],
    onProgress?: (p: { submitted: number; inserted: number; failed: number; batchNumber: number; totalBatches: number }) => void
  ) => Promise<{ events: FinancialEvent[]; failed: number; failedEvents: { event: any; error: any }[] }>;
  addFinancialEvidencePackage: (pkg: any) => void;
  learnOcrPattern: (pattern: any) => void;
  learnOcrPatternsBatch: (patterns: any[]) => Promise<void>;
  /** Storage addon purchase is a billing action; omit this prop (or leave
   * undefined) to hide the "buy addon" affordance for roles that cannot buy
   * storage — the document upload/OCR/review engine itself is unaffected. */
  onBuyAddon?: () => void;
  /** Controlled docs list — the caller (Owner) keeps its own `docs` state in
   * sync because its notification engine also reads it outside this tab. */
  docs: UploadedDoc[];
  onDocsChange: (updater: (prev: UploadedDoc[]) => UploadedDoc[]) => void;
}

export function DocumentsManager({
  workspaceId, workspaceName, tenantId, currentUserId, currentUserEmail, currentUserRole,
  currentUserFullName, isMockUser, activeSessionId, userNameById, storageQuota, financialEvents,
  businesses, businessBranches, ocrLearnedPatterns,
  addFinancialEventAwaited, addFinancialEventsBatch, addFinancialEvidencePackage,
  learnOcrPattern, learnOcrPatternsBatch, onBuyAddon,
  docs, onDocsChange: setDocs,
}: DocumentsManagerProps) {
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState<DocType | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingDocType, setPendingDocType] = useState<DocType>("SUPPORTING_DOC");
  const [docTypeFilter, setDocTypeFilter] = useState<"ALL" | DocType>("ALL");
  const [docPageSize, setDocPageSize] = useState<20 | 50 | 100 | 200>(20);
  const [docPage, setDocPage] = useState(1);

  // Evidence Package Compiler — bundle a cover summary + every uploaded
  // document within a date range into one ZIP, for bank/LHDN/accountant requests.
  const todayIsoForPackage = todayLocalIso();
  const yearStartIsoForPackage = `${new Date().getFullYear()}-01-01`;
  const [packageStartDate, setPackageStartDate] = useState(yearStartIsoForPackage);
  const [packageEndDate, setPackageEndDate] = useState(todayIsoForPackage);
  const [isCompilingPackage, setIsCompilingPackage] = useState(false);
  const [compilePackageError, setCompilePackageError] = useState<string>("");

  // AI document reading: AI Suggests -> Tenant Confirms/Edits/Rejects, mirroring
  // the same pattern used by OCREngineConsole/chat suggestions elsewhere in the app.
  const [docAnalyzing, setDocAnalyzing] = useState(false);
  const [docOcrJob, setDocOcrJob] = useState<OcrJobState | null>(null);
  const docCancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const [docReviewError, setDocReviewError] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<null | {
    submitted: number; inserted: number; failed: number; batchNumber: number; totalBatches: number;
  }>(null);
  const [docReview, setDocReview] = useState<DocReview | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    setDocsLoading(true);
    listDocuments(workspaceId).then(d => { setDocs(() => d); setDocsLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const fileToDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  // localStorage key for the document/OCR job currently in flight or awaiting
  // confirmation, scoped to the active chat session so it survives a page
  // refresh (which reuses the same session) but not a fresh login/logout
  // (which clears the session pointer and, with it, this key).
  const activeDocKey = (uid: string, sid: string) => `mykerani_active_doc_${uid}_${sid}`;

  const persistActiveDoc = (snapshot: { jobId?: string; doc: UploadedDoc; review?: DocReview }) => {
    if (!currentUserId || !activeSessionId) return;
    try { localStorage.setItem(activeDocKey(currentUserId, activeSessionId), JSON.stringify(snapshot)); } catch { /* best-effort */ }
  };

  const clearActiveDoc = () => {
    if (!currentUserId || !activeSessionId) return;
    try { localStorage.removeItem(activeDocKey(currentUserId, activeSessionId)); } catch { /* best-effort */ }
  };

  // Reuse the same Internal Transfer Detection engine as the Historical Recovery
  // Workspace (lib/internalTransferDetection.ts) on the lines extracted from THIS
  // statement — debit/credit pairs of matching amount within a short window must
  // not double-count as Income+Expense. Each line gets a unique synthetic
  // `account` id (its own index) so the engine compares every debit against
  // every credit in the batch, since a single document carries no real
  // per-line account identity.
  const detectTransferPairsInLines = (lines: { date: string; description: string; amount: number; type: "CREDIT" | "DEBIT" }[]) => {
    const asTransactions: ImportedBankTransaction[] = lines.map((l, i) => ({
      date: l.date, description: l.description, amountMyr: l.amount,
      direction: l.type, referenceNumber: "", account: `line-${i}`,
      sourceBank: "GENERIC", sourceRowIndex: i,
    }));
    const matches = detectInternalTransfers(asTransactions);
    const pairByIndex = new Map<number, string>();
    matches.forEach((m) => {
      const debitIdx = Number(m.debitTransaction.account.replace("line-", ""));
      const creditIdx = Number(m.creditTransaction.account.replace("line-", ""));
      pairByIndex.set(debitIdx, lines[creditIdx].description);
      pairByIndex.set(creditIdx, lines[debitIdx].description);
    });
    return pairByIndex;
  };

  // Padankan satu baris transaksi penyata bank dengan rekod sedia ada (yang
  // user dah masukkan sendiri melalui chat/manual) — ikut jenis (in/out),
  // jumlah (toleransi RM0.01) dan tarikh (toleransi 3 hari) — supaya
  // transaksi yang sama tak direkod dua kali bila penyata bank disahkan.
  const findMatchingEvent = (line: { amount: number; type: "CREDIT" | "DEBIT"; date: string }, candidates: FinancialEvent[]) => {
    const wantType = line.type === "CREDIT" ? "INCOME" : "EXPENSE";
    const lineDate = new Date(line.date).getTime();
    return candidates.find(ev => {
      if (ev.type !== wantType) return false;
      if (Math.abs(ev.amountMyr - line.amount) > 0.01) return false;
      if (!line.date || isNaN(lineDate)) return true;
      const evDate = new Date(ev.date).getTime();
      if (isNaN(evDate)) return true;
      return Math.abs(evDate - lineDate) <= 3 * 24 * 60 * 60 * 1000;
    });
  };

  // Builds the review-panel state from a completed OCR job's payload. Pulled
  // out of analyzeUploadedDoc so the same logic can re-run after a page
  // refresh resumes a job that was still processing (see the resume effect
  // below), without duplicating the transaction-line normalization.
  const buildReviewFromPayload = (doc: UploadedDoc, payload: any): DocReview => {
    if (doc.document_type === "BANK_STATEMENT" && Array.isArray(payload.transactions)) {
      return {
        doc,
        merchantName: payload.merchantName || "",
        customerName: payload.customerName || "",
        amount: "0",
        date: payload.date || todayLocalIso(),
        category: "",
        recordType: "EXPENSE",
        confidenceScore: payload.confidenceScore || 0.7,
        rawExtractedText: payload.rawExtractedText || "",
        pagesFound: payload.pagesFound ?? null,
        transactionsFound: payload.transactionsFound ?? payload.transactions.length,
        chunksTotal: payload.chunksTotal ?? null,
        chunksFailed: payload.chunksFailed ?? null,
        extractionIncomplete: Boolean(payload.extractionIncomplete),
        lines: (() => {
          const rawLines = payload.transactions.map((t: any) => ({
            date: t.date || "", description: t.description || "", amount: Number(t.amount) || 0,
            type: (t.type === "CREDIT" ? "CREDIT" : "DEBIT") as "CREDIT" | "DEBIT",
            suggestedCategory: t.suggestedCategory || "Lain-lain",
            confidenceScore: Number(t.confidenceScore) || 0.7,
          }));
          // Internal Transfer Detection — debit/credit pairs of matching
          // amount within this statement must not double-count as Income+Expense.
          const transferPairByIndex = detectTransferPairsInLines(rawLines);
          const activeOwnBusinesses = businesses.filter((b) => b.isActive);
          return rawLines.map((line: any, i: number) => {
            const transferPairLabel = transferPairByIndex.get(i);
            if (transferPairLabel) {
              return {
                ...line,
                include: false,
                isInternalTransfer: true,
                transferPairLabel,
              };
            }
            const branchMatch = matchOwnBusinessAndBranch(line.description, activeOwnBusinesses, businessBranches);
            if (branchMatch) {
              return {
                ...line,
                include: false,
                isOwnBusinessMatch: true,
                ownBusinessMatchLabel: branchMatch.branch
                  ? `Padanan dengan bisnes anda sendiri: ${branchMatch.business.businessName} (Cawangan ${branchMatch.branch.branchName})`
                  : `Padanan dengan bisnes anda sendiri: ${branchMatch.business.businessName}`,
                ownBusinessMatchId: branchMatch.business.id,
                branchMatchId: branchMatch.branch?.id,
                branchMatchLabel: branchMatch.branch?.branchName,
                branchMatchAmbiguous: branchMatch.ambiguous,
                branchMatchCandidates: branchMatch.ambiguous ? branchMatch.candidateLabels : undefined,
              };
            }
            // Padankan dengan rekod sedia ada (cth: dimasukkan sendiri oleh
            // user melalui chat) supaya transaksi yang sama tak direkod dua kali.
            const matched = findMatchingEvent(line, financialEvents);
            return {
              ...line,
              include: !matched,
              matchedEventId: matched?.id,
              matchedLabel: matched ? `${matched.partyName} · RM${matched.amountMyr.toFixed(2)} · ${matched.date}` : undefined,
            };
          });
        })(),
      };
    }
    const matchedPattern = ocrLearnedPatterns.find(p => p.vendorName.toLowerCase() === (payload.merchantName || "").toLowerCase());
    const merchantName = matchedPattern?.vendorName || payload.merchantName || "";
    const customerName = payload.customerName || "";
    const ocrBranchMatch = matchOwnBusinessAndBranch(merchantName, businesses.filter(b => b.isActive), businessBranches);
    return {
      doc,
      merchantName,
      customerName,
      amount: String(payload.amount || 0),
      date: payload.date || todayLocalIso(),
      category: matchedPattern?.category || payload.suggestedCategory || "Lain-lain",
      recordType: matchedPattern?.recordType || (doc.document_type === "INVOICE" ? "PAYABLE" : "EXPENSE"),
      confidenceScore: matchedPattern?.confidenceScore || payload.confidenceScore || 0.7,
      rawExtractedText: payload.rawExtractedText || "",
      businessId: ocrBranchMatch?.business.id,
      branchId: ocrBranchMatch?.branch?.id,
    };
  };

  // Invoke the real AI OCR pipeline (/api/ocr/analyze, same endpoint OCREngineConsole uses)
  // on a freshly uploaded document, then open the confirm/edit/reject review panel.
  const analyzeUploadedDoc = async (doc: UploadedDoc, file: File) => {
    if (!workspaceId || !currentUserId) return;
    setDocAnalyzing(true);
    setDocReviewError(null);
    setDocOcrJob(null);
    try {
      const fileDataUrl = await fileToDataUrl(file);
      const serverDocType = doc.document_type === "BANK_STATEMENT" ? "STATEMENT" : doc.document_type === "CONTRACT" ? "SUPPORTING_DOC" : doc.document_type;
      const { getAuthHeader } = await import("../lib/supabase");
      const startResponse = await fetch("/api/ocr/analyze/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
        body: JSON.stringify({
          fileDataUrl, fileName: file.name, documentType: serverDocType,
          tenantId, workspaceId, userId: currentUserId,
        }),
      });
      if (!startResponse.ok) {
        const errBody = await startResponse.json().catch(() => null);
        setDocReviewError(errBody?.error || `Gagal memulakan pemprosesan dokumen (HTTP ${startResponse.status}).`);
        return;
      }
      const { jobId } = await startResponse.json();
      // The job runs server-side keyed by jobId — persisting this pointer
      // means a page refresh mid-processing can re-attach to the SAME job
      // and resume polling instead of losing all progress.
      persistActiveDoc({ jobId, doc });
      docCancelRef.current = { cancelled: false };
      const finalJob = await pollOcrJob(jobId, setDocOcrJob, 800, docCancelRef.current);

      if (finalJob.status === "FAILED") {
        const baseMsg = finalJob.error || "AI tidak dapat membaca dokumen ini. Cuba lagi.";
        setDocReviewError(finalJob.errorDetail ? `${baseMsg} [${finalJob.errorDetail}]` : baseMsg);
        clearActiveDoc();
        return;
      }

      const payload = finalJob.result;
      if (payload.warning) {
        setDocReviewError(payload.warning);
      }

      const review = buildReviewFromPayload(doc, payload);
      setDocReview(review);
      // Keep the resolved review (not just the job pointer) so it survives a
      // refresh even after the job itself is no longer pollable.
      persistActiveDoc({ jobId, doc, review });
    } catch (ex: any) {
      const baseMsg = "AI tidak dapat membaca dokumen ini. Anda boleh cuba semula atau abaikan (dokumen tetap disimpan).";
      setDocReviewError(ex?.message ? `${baseMsg} [${ex.message}]` : baseMsg);
      clearActiveDoc();
    } finally {
      setDocAnalyzing(false);
    }
  };

  // Refresh-safe document/OCR recovery: once the active session is known,
  // check whether a document upload was in flight or awaiting confirmation
  // when the page was last reloaded, and resume it instead of dropping it.
  useEffect(() => {
    if (!currentUserId || !activeSessionId) return;
    let snapshot: { jobId?: string; doc: UploadedDoc; review?: DocReview } | null = null;
    try {
      const raw = localStorage.getItem(activeDocKey(currentUserId, activeSessionId));
      snapshot = raw ? JSON.parse(raw) : null;
    } catch {
      snapshot = null;
    }
    if (!snapshot) return;

    if (snapshot.review) {
      setDocReview(snapshot.review);
      return;
    }

    if (snapshot.jobId) {
      setDocAnalyzing(true);
      setDocOcrJob(null);
      pollOcrJob(snapshot.jobId, setDocOcrJob)
        .then((finalJob) => {
          if (finalJob.status === "FAILED") {
            const baseMsg = finalJob.error || "AI tidak dapat membaca dokumen ini. Cuba lagi.";
            setDocReviewError(finalJob.errorDetail ? `${baseMsg} [${finalJob.errorDetail}]` : baseMsg);
            clearActiveDoc();
            return;
          }
          const payload = finalJob.result;
          if (payload.warning) setDocReviewError(payload.warning);
          const review = buildReviewFromPayload(snapshot!.doc, payload);
          setDocReview(review);
          persistActiveDoc({ jobId: snapshot!.jobId, doc: snapshot!.doc, review });
        })
        .catch(() => {
          setDocReviewError("AI tidak dapat menyambung semula pemprosesan dokumen ini. Sila muat naik semula.");
          clearActiveDoc();
        })
        .finally(() => setDocAnalyzing(false));
    }
    // Intentionally only runs once activeSessionId/currentUserId settle, not on
    // every docReview change — this is a one-shot recovery for the session,
    // not a continuous sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, activeSessionId]);

  const confirmDocReview = async () => {
    if (!docReview || !workspaceId) return;
    const { doc, merchantName, lines } = docReview;
    let createdEvents: { id: string }[] = [];

    // Evidence Linking: the original uploaded document already exists in
    // Document Vault, and confirming a line creates a financial event from
    // it -- without this, that event shows up as MISSING_ATTACHMENT (see
    // getHealthFlags) even though the source document is right there. Reuse
    // the same FinancialEvidencePackage engine the manual "attach receipt"
    // flow uses, so the existing evidence preview UI just works for these too.
    const linkDocEvidence = (events: { id: string; type: string }[]) => {
      events.forEach((ev) => {
        addFinancialEvidencePackage({
          workspaceId,
          documentType: lines ? "STATEMENT" : "SUPPORTING_DOC",
          uploadDate: new Date().toISOString().slice(0, 10),
          fileName: doc.file_name,
          fileUrl: doc.file_path_supabase,
          relatedRecordType: ev.type,
          relatedRecordId: ev.id,
        });
      });
    };

    if (lines) {
      // Bank statement: create one financial event per included transaction line.
      // Done as a single batched write (not a per-line addFinancialEvent loop) so
      // that large statements (hundreds/thousands of lines) don't block the main
      // thread re-serializing the whole financial state on every line, and so
      // Supabase writes go out in controlled chunks instead of N unbounded
      // concurrent requests.
      const includedLines = lines.filter(l => l.include);
      setImportProgress({ submitted: includedLines.length, inserted: 0, failed: 0, batchNumber: 0, totalBatches: 0 });

      try {
        const { events: newEvents, failed, failedEvents } = await addFinancialEventsBatch(
          includedLines.map((l, idx) => ({
            workspaceId,
            // Auto-map to one of the user's own registered businesses when its
            // name is clearly referenced in the line description (same matching
            // engine used above to flag inter-business transfers) -- only applies
            // if the user chose to include the line despite/after that flag.
            businessId: l.ownBusinessMatchId || undefined,
            // Branch Mapping extends the same auto-map: when the line's
            // business match was unambiguous AND a single branch name also
            // matched, attribute it to that branch too.
            branchId: l.branchMatchId || undefined,
            type: l.type === "CREDIT" ? "INCOME" as const : "EXPENSE" as const,
            categoryName: l.suggestedCategory,
            amountMyr: l.amount,
            partyName: l.description,
            date: l.date || todayLocalIso(),
            referenceNumber: `STMT-${doc.id.substring(0, 8)}-${idx}`,
            description: `Daripada penyata bank: ${doc.file_name}`,
            isCompleted: true,
          })),
          (progress) => setImportProgress(progress)
        );

        if (failed > 0) {
          // Partial failure: keep ONLY the failed lines open for retry --
          // the successfully-saved lines are already in the database (each
          // line's unique STMT- reference number means re-confirming the
          // failed ones later is safe and won't double-insert the rest) --
          // and mark the document CONFIRMED now with just those event ids
          // linked, so the user isn't blocked from seeing their work.
          const failedReferenceNumbers = new Set(failedEvents.map(fe => fe.event.referenceNumber));
          const stillFailedLines = includedLines.filter((l, idx) => failedReferenceNumbers.has(`STMT-${doc.id.substring(0, 8)}-${idx}`));
          const succeededEvents = newEvents.filter(e => !failedReferenceNumbers.has(e.referenceNumber));
          createdEvents = succeededEvents.map(e => ({ id: e.id }));
          linkDocEvidence(succeededEvents);

          setUploadError(`${failed} daripada ${newEvents.length} transaksi gagal disimpan ke pangkalan data dan TIDAK direkodkan. Baki ${newEvents.length - failed} transaksi telah berjaya disimpan. Sila semak baris yang gagal di bawah dan cuba sahkan semula.`);
          setDocReview({ ...docReview, lines: stillFailedLines.map(l => ({ ...l, include: true })) });
          await updateDocumentReview(doc.id, {
            ocrParsedContent: { reviewStatus: "CONFIRMED", extracted: docReview, linkedEventIds: createdEvents.map(e => e.id), confirmedAt: new Date().toISOString() },
          });
          return;
        }
        createdEvents = newEvents.map(e => ({ id: e.id }));
        linkDocEvidence(newEvents);

        const patternsToLearn = includedLines
          .filter(l => l.description.trim())
          .map(l => ({ workspaceId, vendorName: l.description.trim(), category: l.suggestedCategory, recordType: (l.type === "CREDIT" ? "INCOME" : "EXPENSE") as "INCOME" | "EXPENSE", confidenceScore: l.confidenceScore }));
        await learnOcrPatternsBatch(patternsToLearn);
      } finally {
        setImportProgress(null);
      }
    } else {
      // Invois/bil yang baru disahkan masih TERTUNGGAK (belum dibayar/dikutip)
      // melainkan ia direkodkan terus sebagai Pendapatan/Perbelanjaan sebenar —
      // supaya "Perlu Dibayar"/"Perlu Dikutip" di Dashboard betul-betul tepat.
      const isOutstanding = docReview.recordType === "PAYABLE" || docReview.recordType === "RECEIVABLE";
      // docReview.businessId/branchId is the single source of truth -- whatever
      // the user sees/edits in the selector on the review screen is exactly
      // what gets saved here, no separate recomputation.
      const input: ConfirmInput = {
        workspaceId,
        tenantId,
        userId: currentUserId,
        userEmail: currentUserEmail,
        userRole: currentUserRole,
        businessId: docReview.businessId,
        branchId: docReview.branchId,
        transactionType: docReview.recordType as any,
        amount: Number(docReview.amount) || 0,
        category: docReview.category,
        relatedParty: merchantName || "Tidak dinyatakan",
        date: docReview.date,
        confidenceScore: docReview.confidenceScore,
        referenceNumber: `DOC-${doc.id.substring(0, 8)}`,
        description: `Daripada dokumen dimuat naik: ${doc.file_name}`,
        pendingEvidence: {
          documentType: "SUPPORTING_DOC",
          fileName: doc.file_name,
          fileUrl: doc.file_path_supabase,
        },
        evidenceAttached: true,
        source: "AI_CHAT",
        sourceTitle: doc.file_name,
        auditDestination: "NONE",
        precheckDuplicate: false,
      };

      const result = await confirmFinancialRecord(input, {
        addFinancialEventAwaited,
        addFinancialEvent: addFinancialEventAwaited as any,
        addDebtRecordAwaited: async () => ({ id: "" } as any),
        addDebtRecord: () => ({ id: "" } as any),
        addFinancialCommitmentAwaited: async () => ({ id: "" } as any),
        addFinancialCommitment: () => ({ id: "" } as any),
        addAssetPurchase: async () => undefined,
        addOwnerTransaction: async () => undefined,
        linkEvidenceToRecord: (link: any) => addFinancialEvidencePackage({
          workspaceId: link.workspaceId,
          documentType: link.documentType,
          uploadDate: todayLocalIso(),
          fileName: link.fileName,
          fileUrl: link.fileUrl,
          relatedRecordType: link.relatedRecordType,
          relatedRecordId: link.relatedRecordId,
        }),
        learnOcrPattern,
        scanForDuplicates: async () => [],
        logEvent: () => undefined,
        logTenantActivity: () => undefined,
      });

      if (!result.ok) {
        setUploadError(result.error || `Gagal menyimpan rekod ke pangkalan data. Rekod TIDAK disahkan.`);
        return;
      }

      const ev = { id: result.recordId || "" };
      createdEvents.push(ev);
      if (merchantName.trim()) {
        learnOcrPattern({ workspaceId, vendorName: merchantName.trim(), category: docReview.category, recordType: docReview.recordType, confidenceScore: docReview.confidenceScore });
      }
    }

    const renamedLabel = (merchantName || (lines ? "Penyata" : "Dokumen")).replace(/[^a-zA-Z0-9 ]/g, "").trim().replace(/\s+/g, "_");
    const ext = doc.file_name.split(".").pop();
    const newFileName = `${docReview.date}_${renamedLabel}${lines ? "" : `_RM${(Number(docReview.amount) || 0).toFixed(2)}`}.${ext}`;

    await updateDocumentReview(doc.id, {
      fileName: newFileName,
      ocrParsedContent: { reviewStatus: "CONFIRMED", extracted: docReview, linkedEventIds: createdEvents.map(e => e.id), confirmedAt: new Date().toISOString() },
    });
    setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, file_name: newFileName, ocr_parsed_content: { reviewStatus: "CONFIRMED" } } : d));
    setDocReview(null);
    clearActiveDoc();
  };

  const rejectDocReview = async () => {
    if (!docReview) return;
    await updateDocumentReview(docReview.doc.id, { ocrParsedContent: { reviewStatus: "REJECTED", extracted: docReview, rejectedAt: new Date().toISOString() } });
    setDocs(prev => prev.map(d => d.id === docReview.doc.id ? { ...d, ocr_parsed_content: { reviewStatus: "REJECTED" } } : d));
    setDocReview(null);
    clearActiveDoc();
  };

  const triggerUpload = (docType: DocType) => {
    if (isMockUser) {
      setUploadError("Akaun demo tidak boleh muat naik dokumen. Log masuk dengan akaun sebenar.");
      return;
    }
    if (storageQuota.isFrozen) { setUploadError("Storan dibekukan. Hubungi HQ."); return; }
    if (!storageQuota.canUpload) { setUploadError("Storan penuh. Beli tambahan storan."); return; }
    setPendingDocType(docType);
    setUploadError(null);
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (!isAllowedFileType(file)) { setUploadError("Jenis fail tidak disokong. Guna PDF, gambar, atau CSV."); return; }
    if (file.size > MAX_FILE_SIZE) { setUploadError("Saiz fail melebihi 10MB."); return; }
    if (!workspaceId || !currentUserId) { setUploadError("Sesi tidak sah. Cuba log masuk semula."); return; }
    setUploadingDoc(pendingDocType);
    setUploadError(null);
    const { doc, error, isDuplicate } = await uploadDocument(file, workspaceId, currentUserId, pendingDocType);
    setUploadingDoc(null);
    if (error) { setUploadError(error); return; }
    if (doc) {
      if (isDuplicate) {
        // Already uploaded before — reuse the existing record, no second
        // upload and no re-running OCR analysis on the same file.
        setUploadError(`Fail "${doc.file_name}" sudah pernah dimuat naik sebelum ini. Rekod sedia ada digunakan, tidak perlu muat naik semula.`);
        setDocs(prev => (prev.some(d => d.id === doc.id) ? prev : [doc, ...prev]));
        return;
      }
      setDocs(prev => [doc, ...prev]);
      storageQuota.refresh();
      if (doc.document_type !== "CONTRACT") {
        analyzeUploadedDoc(doc, file);
      }
    }
  };

  const handleDeleteDoc = async (doc: UploadedDoc) => {
    const err = await deleteDocument(doc);
    if (err) { setUploadError(err); return; }
    setDocs(prev => prev.filter(d => d.id !== doc.id));
    storageQuota.refresh();
  };

  const handlePreviewDoc = async (doc: UploadedDoc) => {
    const url = await getDocumentUrl(doc.file_path_supabase);
    if (url) window.open(url, "_blank");
  };

  const handleDownloadDoc = async (doc: UploadedDoc) => {
    const url = await getDocumentUrl(doc.file_path_supabase);
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.file_name;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const filteredDocs = docTypeFilter === "ALL" ? docs : docs.filter(d => d.document_type === docTypeFilter);
  const docTotalPages = Math.max(1, Math.ceil(filteredDocs.length / docPageSize));
  const pagedDocs = filteredDocs.slice((docPage - 1) * docPageSize, docPage * docPageSize);
  useEffect(() => { setDocPage(1); }, [docTypeFilter, docPageSize]);

  const compileEvidencePackage = async () => {
    if (!workspaceId) return;
    setIsCompilingPackage(true);
    setCompilePackageError("");

    try {
      const start = new Date(packageStartDate);
      const end = new Date(packageEndDate);
      end.setHours(23, 59, 59, 999);

      const docsInRange = docs.filter((d) => {
        const created = new Date(d.created_at);
        return !isNaN(created.getTime()) && created >= start && created <= end;
      });

      const eventsInRange = financialEvents.filter((e) => {
        if (e.workspaceId !== workspaceId) return false;
        const d = new Date(e.date);
        return !isNaN(d.getTime()) && d >= start && d <= end;
      });

      const totalIncome = eventsInRange.filter((e) => e.type === "INCOME").reduce((s, e) => s + e.amountMyr, 0);
      const totalExpense = eventsInRange.filter((e) => e.type === "EXPENSE").reduce((s, e) => s + e.amountMyr, 0);
      const totalReceivable = eventsInRange.filter((e) => e.type === "RECEIVABLE" && !e.isCompleted).reduce((s, e) => s + e.amountMyr, 0);
      const totalPayable = eventsInRange.filter((e) => e.type === "PAYABLE" && !e.isCompleted).reduce((s, e) => s + e.amountMyr, 0);

      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text("MyKerani — Pek Bukti Kewangan (Evidence Package)", 14, 18);
      doc.setFontSize(10);
      doc.text(`Workspace: ${workspaceName}`, 14, 28);
      doc.text(`Tempoh: ${packageStartDate} hingga ${packageEndDate}`, 14, 34);
      doc.text(`Dijana pada: ${new Date().toISOString().slice(0, 19).replace("T", " ")}`, 14, 40);

      autoTable(doc, {
        startY: 48,
        head: [["Ringkasan", "Jumlah (RM)"]],
        body: [
          ["Jumlah Pendapatan", totalIncome.toLocaleString("en-MY", { minimumFractionDigits: 2 })],
          ["Jumlah Perbelanjaan", totalExpense.toLocaleString("en-MY", { minimumFractionDigits: 2 })],
          ["Belum Dikutip (Receivable)", totalReceivable.toLocaleString("en-MY", { minimumFractionDigits: 2 })],
          ["Belum Dibayar (Payable)", totalPayable.toLocaleString("en-MY", { minimumFractionDigits: 2 })],
        ],
      });

      const tableY = (doc as any).lastAutoTable?.finalY || 60;
      autoTable(doc, {
        startY: tableY + 10,
        head: [["Dokumen Disertakan", "Jenis", "Tarikh Muat Naik"]],
        body: docsInRange.length
          ? docsInRange.map((d) => [d.file_name, d.document_type, d.created_at.slice(0, 10)])
          : [["Tiada dokumen sokongan dalam tempoh ini", "-", "-"]],
      });

      const coverPdfBlob = doc.output("blob");

      const zip = new JSZip();
      const safeWorkspaceName = workspaceName.replace(/[^a-z0-9]+/gi, "_");
      zip.file(`00_Ringkasan_${safeWorkspaceName}.pdf`, coverPdfBlob);

      // Organize files into per-type subfolders, each filename date-prefixed, so the
      // ZIP opens already sorted the way an accountant/bank/LHDN would expect.
      const folderLabel: Record<string, string> = {
        RECEIPT: "01_Resit", INVOICE: "02_Invois", BANK_STATEMENT: "03_Penyata_Bank",
        CONTRACT: "04_Kontrak", SUPPORTING_DOC: "05_Dokumen_Lain",
      };
      for (const docItem of docsInRange) {
        try {
          const url = await getDocumentUrl(docItem.file_path_supabase);
          if (!url) continue;
          const res = await fetch(url);
          if (!res.ok) continue;
          const blob = await res.blob();
          const folder = folderLabel[docItem.document_type] || "05_Dokumen_Lain";
          const datePrefix = docItem.created_at.slice(0, 10);
          const safeFileName = (docItem.file_name || `dokumen_${docItem.id}`).replace(/[\\/]/g, "_");
          zip.file(`${folder}/${datePrefix}_${safeFileName}`, blob);
        } catch {
          // Skip files that fail to fetch; cover PDF still lists them for reference.
        }
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `MyKerani_EvidencePackage_${safeWorkspaceName}_${packageStartDate}_${packageEndDate}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (currentUserId && tenantId) {
        logEvent({
          tenantId, workspaceId, userId: currentUserId,
          userEmail: currentUserEmail, userRole: currentUserRole, eventType: "EXPORT",
          description: `Compiled Evidence Package (${packageStartDate} to ${packageEndDate})`,
          metadata: { docCount: docsInRange.length, startDate: packageStartDate, endDate: packageEndDate },
        });
      }
    } catch (e: any) {
      setCompilePackageError(e?.message || "Gagal menyediakan pek bukti kewangan. Sila cuba lagi.");
    } finally {
      setIsCompilingPackage(false);
    }
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-2xl mx-auto w-full pb-20" id="documents_manager_pane">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Dokumen</h2>
          <span className="text-[11px] text-slate-400">{docs.length} fail</span>
        </div>

        {/* Hidden file input */}
        <input ref={fileInputRef} type="file" className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.csv"
          onChange={handleFileSelected} />

        {/* Storage bar compact */}
        <StorageBar quota={storageQuota} compact onBuyAddon={onBuyAddon} />

        {/* Upload error */}
        {uploadError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between">
            <p className="text-xs text-red-600 font-semibold">{uploadError}</p>
            <button onClick={() => setUploadError(null)} className="text-red-400 hover:text-red-600 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Upload buttons */}
        <div className="grid grid-cols-3 gap-3">
          {([
            { label: "Muat Naik Resit",  docType: "RECEIPT" as DocType,        icon: Receipt,         bg: "bg-amber-50 border-amber-100 text-amber-500" },
            { label: "Muat Naik Invois", docType: "INVOICE" as DocType,        icon: FileSpreadsheet, bg: "bg-blue-50 border-blue-100 text-blue-500" },
            { label: "Penyata Bank",     docType: "BANK_STATEMENT" as DocType, icon: Landmark,        bg: "bg-violet-50 border-violet-100 text-violet-500" },
          ]).map(({ label, docType, icon: Icon, bg }) => (
            <button key={docType} onClick={() => triggerUpload(docType)} disabled={!!uploadingDoc || storageQuota.isFrozen}
              className={`flex flex-col items-center space-y-2 p-4 bg-white border rounded-2xl shadow-sm hover:shadow-md transition cursor-pointer disabled:opacity-50 ${bg}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bg}`}>
                {uploadingDoc === docType
                  ? <RefreshCw className="w-5 h-5 animate-spin" />
                  : <Icon className="w-5 h-5" />}
              </div>
              <span className="text-[11px] font-semibold text-slate-700 text-center leading-tight">{label}</span>
            </button>
          ))}
        </div>

        {/* Lain-lain */}
        <button onClick={() => triggerUpload("SUPPORTING_DOC")} disabled={!!uploadingDoc || storageQuota.isFrozen}
          className="w-full flex items-center gap-3 px-4 py-3 bg-white border border-dashed border-slate-300 rounded-2xl hover:border-emerald-400 hover:bg-emerald-50 transition cursor-pointer disabled:opacity-50">
          <Upload className="w-4 h-4 text-slate-400" />
          <span className="text-xs text-slate-500 font-semibold">Muat naik dokumen lain (Kontrak, dsb.)</span>
        </button>

        {/* Evidence Package Compiler — bila bank/LHDN/akauntan minta bukti kewangan */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3" id="evidence_package_compiler">
          <div className="flex items-center space-x-2">
            <FileSpreadsheet className="w-4 h-4 text-slate-700" />
            <h3 className="font-bold text-slate-900 text-sm">Sediakan Pek Bukti Kewangan</h3>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Bila bank, LHDN, atau akauntan minta bukti, jana satu pek (ZIP) berisi ringkasan kewangan dan semua dokumen dalam tempoh yang dipilih.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-semibold text-slate-500 block mb-1">Dari Tarikh</label>
              <input type="date" value={packageStartDate} onChange={(e) => setPackageStartDate(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 outline-hidden focus:bg-white focus:border-slate-900" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 block mb-1">Hingga Tarikh</label>
              <input type="date" value={packageEndDate} onChange={(e) => setPackageEndDate(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 outline-hidden focus:bg-white focus:border-slate-900" />
            </div>
          </div>
          <button type="button" onClick={compileEvidencePackage} disabled={isCompilingPackage}
            className="w-full px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition cursor-pointer">
            {isCompilingPackage ? "Menyediakan..." : "Jana Pek (ZIP)"}
          </button>
          {compilePackageError && <p className="text-[10px] text-rose-600">{compilePackageError}</p>}
        </div>

        {docAnalyzing && docOcrJob && (
          <DocumentProcessingProgressPanel job={docOcrJob} />
        )}
        {docAnalyzing && docOcrJob && docOcrJob.status === "PROCESSING" && (
          <button
            type="button"
            onClick={() => { docCancelRef.current.cancelled = true; }}
            className="w-full mt-2 px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-semibold transition cursor-pointer"
          >
            ✕ Batal & Hentikan OCR
          </button>
        )}
        {docAnalyzing && !docOcrJob && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-indigo-500 animate-spin shrink-0" />
            <p className="text-xs text-indigo-700 font-semibold">Memulakan pemprosesan dokumen...</p>
          </div>
        )}
        {docReviewError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between">
            <p className="text-xs text-red-600 font-semibold">{docReviewError}</p>
            <button onClick={() => setDocReviewError(null)} className="text-red-400 hover:text-red-600 cursor-pointer"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Category filter — recall by category or all, for easy bank/LHDN reference */}
        {docs.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {([
              { id: "ALL" as const, label: "Semua" },
              { id: "RECEIPT" as const, label: "Resit" },
              { id: "INVOICE" as const, label: "Invois" },
              { id: "BANK_STATEMENT" as const, label: "Penyata Bank" },
              { id: "SUPPORTING_DOC" as const, label: "Lain-lain" },
            ]).map(f => (
              <button key={f.id} onClick={() => setDocTypeFilter(f.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold cursor-pointer transition ${docTypeFilter === f.id ? "bg-indigo-600 text-white" : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                {f.label}
              </button>
            ))}
          </div>
        )}

        {/* Document list */}
        {docsLoading ? (
          <div className="py-8 text-center">
            <RefreshCw className="w-5 h-5 text-slate-300 animate-spin mx-auto mb-2" />
            <p className="text-xs text-slate-400">Memuatkan dokumen...</p>
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="py-10 text-center bg-white border border-slate-100 rounded-2xl">
            <FileText className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-400">Belum ada dokumen</p>
            <p className="text-[11px] text-slate-300 mt-0.5">Muat naik resit, invois atau penyata bank</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-slate-400">{filteredDocs.length} dokumen &middot; muka {docPage}/{docTotalPages}</p>
              <select value={docPageSize} onChange={e => setDocPageSize(Number(e.target.value) as 20 | 50 | 100 | 200)}
                className="text-[10px] font-semibold border border-slate-200 rounded-lg px-2 py-1 bg-white outline-none cursor-pointer">
                {[20, 50, 100, 200].map(n => <option key={n} value={n}>{n} / muka surat</option>)}
              </select>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="divide-y divide-slate-50">
                {pagedDocs.map(doc => {
                  const typeLabel: Record<string, string> = {
                    RECEIPT: "Resit", INVOICE: "Invois", BANK_STATEMENT: "Penyata Bank",
                    CONTRACT: "Kontrak", SUPPORTING_DOC: "Dokumen Lain",
                  };
                  const reviewStatus = doc.ocr_parsed_content?.reviewStatus as string | undefined;
                  const uploaderName = userNameById[doc.uploaded_by] || (doc.uploaded_by === currentUserId ? currentUserFullName : undefined);
                  return (
                    <div key={doc.id} className="px-4 py-3.5 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-slate-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate">{doc.file_name}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {typeLabel[doc.document_type] || doc.document_type} &middot; {fmtDocBytes(doc.file_size_bytes)} &middot; {new Date(doc.created_at).toLocaleDateString("ms-MY")} {new Date(doc.created_at).toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit" })}
                          {reviewStatus === "CONFIRMED" && <span className="text-emerald-600 font-semibold"> &middot; Disahkan</span>}
                          {reviewStatus === "REJECTED" && <span className="text-rose-500 font-semibold"> &middot; Ditolak</span>}
                        </p>
                        <p className="text-[10px] text-slate-300">{uploaderName ? `Dimuat naik oleh: ${uploaderName}` : "Dimuat naik"}</p>
                      </div>
                      <button onClick={() => handleDownloadDoc(doc)} title="Muat turun"
                        className="text-slate-300 hover:text-indigo-600 cursor-pointer p-1 shrink-0">
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handlePreviewDoc(doc)} title="Pratonton"
                        className="text-slate-300 hover:text-emerald-600 cursor-pointer p-1 shrink-0">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDeleteDoc(doc)} title="Padam"
                        className="text-slate-300 hover:text-red-500 cursor-pointer p-1 shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            {docTotalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-1">
                <button onClick={() => setDocPage(p => Math.max(1, p - 1))} disabled={docPage === 1}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-600 disabled:opacity-40 cursor-pointer">
                  Sebelum
                </button>
                <span className="text-xs text-slate-500">{docPage} / {docTotalPages}</span>
                <button onClick={() => setDocPage(p => Math.min(docTotalPages, p + 1))} disabled={docPage === docTotalPages}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-600 disabled:opacity-40 cursor-pointer">
                  Seterusnya
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* AI Suggests -> Tenant Confirms/Edits/Rejects review modal — renders as
          a fixed overlay regardless of which tab is active, mirroring how this
          worked when it lived inline in OwnerDashboard. */}
      {docReview && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-900">AI Membaca Dokumen</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">{docReview.doc.file_name}</p>
              </div>
              <button onClick={() => setDocReview(null)} className="text-slate-300 hover:text-slate-600 cursor-pointer"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {docReview.lines ? (
                <>
                  <div className="grid grid-cols-4 gap-2 text-center bg-slate-50 border border-slate-200 rounded-xl p-2">
                    <div><p className="text-[10px] text-slate-400">Pages Found</p><p className="text-sm font-bold text-slate-800">{docReview.pagesFound ?? "—"}</p></div>
                    <div><p className="text-[10px] text-slate-400">Transactions Found</p><p className="text-sm font-bold text-slate-800">{docReview.transactionsFound ?? docReview.lines.length}</p></div>
                    <div><p className="text-[10px] text-slate-400">Extracted</p><p className="text-sm font-bold text-slate-800">{docReview.lines.length}</p></div>
                    <div><p className="text-[10px] text-slate-400">To Import</p><p className="text-sm font-bold text-emerald-600">{docReview.lines.filter(l => l.include).length}</p></div>
                  </div>
                  {docReview.extractionIncomplete && (
                    <p className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl p-2">
                      ⚠ Sebahagian penyata ini gagal diproses oleh AI ({docReview.chunksFailed ?? "?"} daripada {docReview.chunksTotal ?? "?"} bahagian) — sesetengah transaksi mungkin TIDAK dipaparkan di bawah. Sila semak semula dokumen asal atau muat naik semula.
                    </p>
                  )}
                  <p className="text-[11px] text-slate-500">
                    AI mengesan {docReview.lines.length} transaksi dalam penyata ini, padankan dengan rekod yang anda dah masukkan sendiri,
                    dan kenal pasti {docReview.lines.filter(l => l.isInternalTransfer).length} pemindahan dalaman serta {docReview.lines.filter(l => l.isOwnBusinessMatch).length} transaksi dengan bisnes anda sendiri.
                    {" "}Transaksi yang <span className="font-semibold text-emerald-600">sudah sepadan</span>, <span className="font-semibold text-violet-600">pemindahan dalaman</span>, atau <span className="font-semibold text-amber-600">bisnes sendiri</span> tak akan direkod sebagai Pendapatan/Perbelanjaan — batalkan tanda untuk yang tidak mahu direkod, atau tanda balik jika padanan tersilap.
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap bg-indigo-50/60 border border-indigo-100 rounded-xl p-2">
                    <span className="text-[10px] font-semibold text-indigo-700 mr-1">Pilihan Pukal:</span>
                    <button type="button" onClick={() => setDocReview(d => d ? { ...d, lines: d.lines!.map(x => ({ ...x, include: true })) } : d)}
                      className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-100 cursor-pointer">
                      Pilih Semua
                    </button>
                    <button type="button" onClick={() => setDocReview(d => d ? { ...d, lines: d.lines!.map(x => ({ ...x, include: false })) } : d)}
                      className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-100 cursor-pointer">
                      Nyahpilih Semua
                    </button>
                    <button type="button" onClick={() => setDocReview(d => d ? { ...d, lines: d.lines!.map(x => ({ ...x, include: x.confidenceScore >= 0.8 })) } : d)}
                      className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-100 cursor-pointer">
                      Pilih Keyakinan Tinggi (≥80%)
                    </button>
                    <button type="button" onClick={() => setDocReview(d => d ? { ...d, lines: d.lines!.map(x => ({ ...x, include: x.include && !x.isInternalTransfer && !x.isOwnBusinessMatch && !x.matchedEventId })) } : d)}
                      className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-100 cursor-pointer">
                      Nyahpilih Padanan/Pemindahan
                    </button>
                  </div>
                  {docReview.lines.map((l, i) => (
                    <div key={i} className={`border rounded-xl p-3 space-y-1.5 ${l.isInternalTransfer ? "border-violet-200 bg-violet-50/40" : l.isOwnBusinessMatch ? "border-amber-200 bg-amber-50/40" : l.matchedEventId ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200"}`}>
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={l.include}
                          onChange={e => setDocReview(d => d ? { ...d, lines: d.lines!.map((x, xi) => xi === i ? { ...x, include: e.target.checked } : x) } : d)}
                          className="w-4 h-4 accent-indigo-600" />
                        <input value={l.description} onChange={e => setDocReview(d => d ? { ...d, lines: d.lines!.map((x, xi) => xi === i ? { ...x, description: e.target.value } : x) } : d)}
                          className="flex-1 px-2 py-1 rounded border border-slate-200 text-xs" placeholder="Penerangan" />
                        <span className={`text-xs font-bold ${l.type === "CREDIT" ? "text-emerald-600" : "text-rose-500"}`}>{l.type === "CREDIT" ? "+" : "-"}RM{l.amount.toFixed(2)}</span>
                      </div>
                      {l.isInternalTransfer && (
                        <p className="pl-6 text-[10px] font-semibold text-violet-600">
                          ⇄ Pemindahan Dalaman — sepadan dengan "{l.transferPairLabel}" dalam penyata ini, bukan Pendapatan/Perbelanjaan sebenar
                        </p>
                      )}
                      {l.isOwnBusinessMatch && (
                        <p className="pl-6 text-[10px] font-semibold text-amber-600">
                          🏢 {l.ownBusinessMatchLabel} — semak sama ada ini perlu direkod sebagai Pendapatan/Perbelanjaan luaran
                        </p>
                      )}
                      {l.branchMatchAmbiguous && (
                        <p className="pl-6 text-[10px] font-semibold text-amber-600">
                          ⚠ Lebih daripada satu cawangan sepadan ({(l.branchMatchCandidates || []).join(", ")}) — sila pilih cawangan yang betul di bawah:
                        </p>
                      )}
                      {/* Business + Branch selector -- single source of truth: pre-filled
                          from the auto-match above, but always editable, and this exact
                          value (ownBusinessMatchId/branchMatchId) is what gets saved on Confirm. */}
                      <div className="pl-6 flex items-center gap-2">
                        <select
                          value={l.ownBusinessMatchId || ""}
                          onChange={e => setDocReview(d => d ? { ...d, lines: d.lines!.map((x, xi) => xi === i ? { ...x, ownBusinessMatchId: e.target.value || undefined, branchMatchId: undefined } : x) } : d)}
                          className="flex-1 px-2 py-1 rounded border border-slate-200 text-[11px]"
                        >
                          <option value="">Tiada Bisnes (Personal)</option>
                          {businesses.filter(b => b.isActive).map(b => (
                            <option key={b.id} value={b.id}>{b.businessName}</option>
                          ))}
                        </select>
                        {l.ownBusinessMatchId && (businessBranches[l.ownBusinessMatchId] || []).filter(br => br.isActive).length > 0 && (
                          <select
                            value={l.branchMatchId || ""}
                            onChange={e => setDocReview(d => d ? { ...d, lines: d.lines!.map((x, xi) => xi === i ? { ...x, branchMatchId: e.target.value || undefined } : x) } : d)}
                            className="flex-1 px-2 py-1 rounded border border-slate-200 text-[11px]"
                          >
                            <option value="">Tiada Cawangan Tertentu</option>
                            {(businessBranches[l.ownBusinessMatchId] || []).filter(br => br.isActive).map(br => (
                              <option key={br.id} value={br.id}>{br.branchName}</option>
                            ))}
                          </select>
                        )}
                      </div>
                      {l.matchedEventId && (
                        <p className="pl-6 text-[10px] font-semibold text-emerald-600">
                          ✓ Sudah sepadan dengan rekod sedia ada ({l.matchedLabel}) — tidak akan direkod semula
                        </p>
                      )}
                      <div className="flex items-center gap-2 pl-6">
                        <input value={l.suggestedCategory} onChange={e => setDocReview(d => d ? { ...d, lines: d.lines!.map((x, xi) => xi === i ? { ...x, suggestedCategory: e.target.value } : x) } : d)}
                          className="flex-1 px-2 py-1 rounded border border-slate-200 text-[11px]" placeholder="Kategori" />
                        <input type="date" value={l.date} onChange={e => setDocReview(d => d ? { ...d, lines: d.lines!.map((x, xi) => xi === i ? { ...x, date: e.target.value } : x) } : d)}
                          className="px-2 py-1 rounded border border-slate-200 text-[11px]" />
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  {/* Original document preview — supports image, PDF, and text files */}
                  {docOcrJob?.result?.fileUrl && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 mb-2">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Dokumen Asal</p>
                      {docOcrJob.result.fileUrl.startsWith("data:image") ? (
                        <img src={docOcrJob.result.fileUrl} alt="Dokumen asal" className="w-full max-h-96 object-contain rounded-lg cursor-zoom-in" onClick={() => window.open(docOcrJob.result.fileUrl, "_blank")} />
                      ) : docOcrJob.result.fileUrl.startsWith("data:application/pdf") || docOcrJob.result.mimeType === "application/pdf" ? (
                        <iframe src={docOcrJob.result.fileUrl} className="w-full h-96 rounded-lg border border-slate-200" title="Dokumen PDF" />
                      ) : (
                        <div className="bg-white border border-slate-200 rounded-lg p-4 text-xs text-slate-600">
                          <p className="font-semibold mb-1">Pratonton dokumen tidak tersedia</p>
                          <p>Jenis fail: {docOcrJob.result.mimeType || "Tidak diketahui"}. Fail asal kekal tidak diubah.</p>
                        </div>
                      )}
                    </div>
                  )}
                  <p className="text-[11px] text-slate-500">Sahkan atau betulkan apa yang AI kenal pasti daripada dokumen ini sebelum direkodkan.</p>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500">Pihak Berkaitan / Vendor</label>
                    <input value={docReview.merchantName} onChange={e => setDocReview(d => d ? { ...d, merchantName: e.target.value } : d)}
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm" />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500">Bisnes</label>
                    <select value={docReview.businessId || ""}
                      onChange={e => setDocReview(d => d ? { ...d, businessId: e.target.value || undefined, branchId: undefined } : d)}
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm">
                      <option value="">Tiada Bisnes (Personal)</option>
                      {businesses.filter(b => b.isActive).map(b => (
                        <option key={b.id} value={b.id}>{b.businessName}</option>
                      ))}
                    </select>
                  </div>
                  {docReview.businessId && (businessBranches[docReview.businessId] || []).filter(br => br.isActive).length > 0 && (
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500">Cawangan</label>
                      <select value={docReview.branchId || ""}
                        onChange={e => setDocReview(d => d ? { ...d, branchId: e.target.value || undefined } : d)}
                        className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm">
                        <option value="">Tiada Cawangan Tertentu</option>
                        {(businessBranches[docReview.businessId] || []).filter(br => br.isActive).map(br => (
                          <option key={br.id} value={br.id}>{br.branchName}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {docReview.businessId ? (
                    <p className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                      ✓ Auto-mapped — Bisnes: {businesses.find(b => b.id === docReview.businessId)?.businessName}
                      {docReview.branchId && <> · Cawangan: {(businessBranches[docReview.businessId] || []).find(br => br.id === docReview.branchId)?.branchName}</>}
                    </p>
                  ) : (
                    <p className="text-[11px] font-semibold text-slate-400 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                      ⚠ Tiada Padanan Ditemui — akan direkod sebagai Personal
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500">Jumlah (RM)</label>
                      <input type="number" value={docReview.amount} onChange={e => setDocReview(d => d ? { ...d, amount: e.target.value } : d)}
                        className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm" />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500">Tarikh</label>
                      <input type="date" value={docReview.date} onChange={e => setDocReview(d => d ? { ...d, date: e.target.value } : d)}
                        className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500">Kategori</label>
                    <input value={docReview.category} onChange={e => setDocReview(d => d ? { ...d, category: e.target.value } : d)}
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm" />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500">Jenis Transaksi</label>
                    <select value={docReview.recordType} onChange={e => setDocReview(d => d ? { ...d, recordType: e.target.value as any } : d)}
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm">
                      <option value="INCOME">Pendapatan</option>
                      <option value="EXPENSE">Perbelanjaan</option>
                      <option value="RECEIVABLE">Belum Terima (Receivable)</option>
                      <option value="PAYABLE">Belum Bayar (Payable)</option>
                      <option value="DEBT">Hutang</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            {importProgress && (
              <div className="px-5 pt-3 shrink-0 space-y-1">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                  <span>Merekod transaksi... ({importProgress.inserted + importProgress.failed}/{importProgress.submitted})</span>
                  <span>Bahagian {importProgress.batchNumber}/{importProgress.totalBatches || "—"}</span>
                </div>
                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-600 transition-all" style={{ width: `${importProgress.submitted ? Math.round(((importProgress.inserted + importProgress.failed) / importProgress.submitted) * 100) : 0}%` }} />
                </div>
                {importProgress.failed > 0 && (
                  <p className="text-[11px] text-red-600 font-semibold">{importProgress.failed} transaksi gagal disimpan ke pangkalan data dan TIDAK direkodkan. Baris yang gagal akan kekal untuk disahkan semula.</p>
                )}
              </div>
            )}
            <div className="px-5 py-4 border-t border-slate-100 flex gap-2 shrink-0">
              <button onClick={rejectDocReview} disabled={!!importProgress} className="flex-1 py-2.5 rounded-xl border border-rose-200 text-rose-500 text-sm font-bold cursor-pointer hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed">
                Tolak
              </button>
              <button onClick={confirmDocReview} disabled={!!importProgress} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold cursor-pointer hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed">
                {importProgress ? "Merekod..." : "Sahkan & Rekod"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
