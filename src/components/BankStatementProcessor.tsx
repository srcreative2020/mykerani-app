// BankStatementProcessor.tsx — Dedicated UI for Bank Statement Import Workflow.
//
// Completely isolated from the existing OCR / Receipt / Invoice flows.
// Progress display is page-based (user-facing).
// Chunk / checkpoint logic is internal — engine, DB, pause/resume unchanged.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  FileText,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { useWorkspace } from "../context/WorkspaceContext";
import { useAuth } from "../context/AuthContext";
import {
  cancelImport,
  getActiveImport,
  buildDraftFromJob,
  pauseImport,
  resumeImport,
  startImport,
  startPolling,
  incrementConfirmedCount,
} from "../lib/bankStatementService";
import {
  type StatementJob,
  type StatementTransaction,
  type ActiveImportConflict,
  type StartImportResponse,
  RESUMABLE_STATUSES,
} from "../lib/bankStatementTypes";

// ─── Types ───────────────────────────────────────────────────────────────────

type Screen =
  | "idle"
  | "uploading"
  | "processing"
  | "paused"
  | "interrupted"
  | "completed"
  | "failed"
  | "confirming_cancel";

interface Props {
  onBack: () => void;
  onConfirmTransaction: (tx: StatementTransaction, jobId: string) => Promise<void>;
}

// ─── Pipeline stages ─────────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  { key: "UPLOAD",       label: "Muat Naik Selesai" },
  { key: "EXTRACTED",    label: "PDF Diekstrak" },
  { key: "OCR",         label: "Pemprosesan OCR" },
  { key: "AI",          label: "Analisis AI" },
  { key: "EXTRACTION",  label: "Ekstrak Transaksi" },
  { key: "CHECKPOINT",  label: "Simpan Checkpoint" },
  { key: "CONFIRM",     label: "Menunggu Pengesahan" },
  { key: "COMPLETED",   label: "Selesai" },
] as const;

function derivePipelineStage(job: StatementJob, screen: Screen): string {
  if (screen === "completed" || job.status === "COMPLETED") return "COMPLETED";
  if (screen === "paused" || screen === "interrupted") return "CHECKPOINT";
  if (job.chunks_completed === 0 && job.transactions_found === 0) return "OCR";
  if (job.transactions_found > 0) return "EXTRACTION";
  return "AI";
}

// ─── Page-based progress helpers ─────────────────────────────────────────────

function derivePagesFromJob(job: StatementJob, totalPages: number | null) {
  const tp = totalPages ?? job.total_chunks;
  const tc = job.total_chunks || 1;
  const cc = job.chunks_completed;
  const pagesCompleted = Math.min(tp, Math.round((cc / tc) * tp));
  const pagesRemaining = Math.max(0, tp - pagesCompleted);
  const currentPage = Math.min(tp, pagesCompleted + 1);
  return { totalPages: tp, pagesCompleted, pagesRemaining, currentPage };
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "—";
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hr}j ${remMin}m` : `${hr}j`;
}

function estimateRemainingMs(job: StatementJob, elapsedMs: number): number | null {
  const { chunks_completed, total_chunks } = job;
  if (chunks_completed <= 0 || total_chunks <= 0) return null;
  const remaining = total_chunks - chunks_completed;
  if (remaining <= 0) return 0;
  return Math.round((elapsedMs / chunks_completed) * remaining);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    PENDING:     { label: "Menunggu",      cls: "bg-slate-100 text-slate-600" },
    PROCESSING:  { label: "Sedang Proses", cls: "bg-blue-100 text-blue-700" },
    PAUSED:      { label: "Dijeda",        cls: "bg-amber-100 text-amber-700" },
    INTERRUPTED: { label: "Terganggu",     cls: "bg-orange-100 text-orange-700" },
    COMPLETED:   { label: "Selesai",       cls: "bg-emerald-100 text-emerald-700" },
    FAILED:      { label: "Gagal",         cls: "bg-red-100 text-red-700" },
    CANCELLED:   { label: "Dibatalkan",    cls: "bg-slate-100 text-slate-500" },
  };
  const { label, cls } = map[status] ?? { label: status, cls: "bg-slate-100 text-slate-500" };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function StatRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex items-center justify-between text-xs py-0.5">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-800 font-mono">{value === null || value === undefined || value === "" ? "—" : value}</span>
    </div>
  );
}

function PipelineRow({ label, done, current, failed }: { label: string; done: boolean; current: boolean; failed?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="flex-shrink-0">
        {failed ? (
          <XCircle className="w-3.5 h-3.5 text-red-500" />
        ) : done ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
        ) : current ? (
          <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
        ) : (
          <Circle className="w-3.5 h-3.5 text-slate-300" />
        )}
      </div>
      <span className={`${done ? "text-emerald-700 font-medium" : current ? "text-indigo-700 font-semibold" : failed ? "text-red-600 font-medium" : "text-slate-400"}`}>
        {label}
      </span>
    </div>
  );
}

function TransactionRow({
  tx, index, onConfirm, confirmed, confirming,
}: {
  tx: StatementTransaction; index: number;
  onConfirm: (tx: StatementTransaction) => void;
  confirmed: boolean; confirming: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${confirmed ? "opacity-50" : ""}`}>
      <div className="flex-shrink-0">
        {tx.type === "CREDIT"
          ? <TrendingUp className="w-4 h-4 text-emerald-500" />
          : <TrendingDown className="w-4 h-4 text-red-500" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{tx.description}</p>
        <p className="text-xs text-slate-400">{tx.date} · {tx.suggestedCategory}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`text-sm font-semibold ${tx.type === "CREDIT" ? "text-emerald-600" : "text-red-600"}`}>
          {tx.type === "CREDIT" ? "+" : "-"}RM {tx.amount.toFixed(2)}
        </p>
        <p className="text-xs text-slate-400">{Math.round(tx.confidenceScore * 100)}%</p>
      </div>
      <div className="flex-shrink-0">
        {confirmed ? (
          <CheckCircle className="w-5 h-5 text-emerald-500" />
        ) : (
          <button
            onClick={() => onConfirm(tx)}
            disabled={confirming}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-all cursor-pointer"
          >
            {confirming ? <Loader2 className="w-3 h-3 animate-spin" /> : "SAHKAN"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BankStatementProcessor({ onBack, onConfirmTransaction }: Props) {
  const { activeWorkspace } = useWorkspace();
  const { user, isMockUser } = useAuth();

  const wsId     = activeWorkspace?.id ?? "";
  const tenantId = user?.tenantId ?? activeWorkspace?.tenantId ?? "";
  const userId   = user?.id ?? "";

  // ── State ──
  const [screen, setScreen]                 = useState<Screen>("idle");
  const [job, setJob]                       = useState<StatementJob | null>(null);
  const [totalPages, setTotalPages]         = useState<number | null>(null);
  const [fileSize, setFileSize]             = useState<number>(0);
  const [elapsedMs, setElapsedMs]           = useState(0);
  const [reconnecting, setReconnecting]     = useState(false);
  const [uploadError, setUploadError]       = useState<string | null>(null);
  const [conflict, setConflict]             = useState<ActiveImportConflict | null>(null);
  const [confirmedIndexes, setConfirmedIndexes] = useState<Set<number>>(new Set());
  const [confirmingIndex, setConfirmingIndex]   = useState<number | null>(null);
  const [actionError, setActionError]       = useState<string | null>(null);
  const [showTechDetail, setShowTechDetail] = useState(false);
  const [isDragging, setIsDragging]         = useState(false);
  const [resuming, setResuming]             = useState(false);

  const jobStartRef         = useRef<number>(0);
  const stopPollingRef      = useRef<(() => void) | null>(null);
  const elapsedIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  // Draft reconstructed from DB checkpoints on every render — Rule #2.
  const draft = job ? buildDraftFromJob(job) : null;

  // ── Page-level display values ──
  const pages = job ? derivePagesFromJob(job, totalPages) : null;
  const remainingMs = job ? estimateRemainingMs(job, elapsedMs) : null;

  // ── Restore from DB on mount — Rule #2 ──
  useEffect(() => {
    if (!wsId || isMockUser) return;
    getActiveImport(wsId).then((active) => {
      if (!active) return;
      setJob(active);
      const stored = sessionStorage.getItem(`stmt_pages_${active.id}`);
      if (stored) setTotalPages(Number(stored));
      if (active.status === "PROCESSING" || active.status === "PENDING") {
        setScreen("processing");
        attachPolling(active.id);
      } else if (active.status === "PAUSED") {
        setScreen("paused");
      } else if (active.status === "INTERRUPTED") {
        setScreen("interrupted");
      } else if (active.status === "COMPLETED") {
        // Completed jobs: load via progress to get checkpoints
        import("../lib/supabase").then((m) => m.getAuthHeader()).then(async (authHdr) => {
          try {
            const r = await fetch(`/api/statement/process/progress/${active.id}`, { headers: authHdr });
            if (r.ok) { const d: StatementJob = await r.json(); setJob(d); }
          } catch { /* non-blocking */ }
        });
        setScreen("completed");
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId]);

  // ── Elapsed timer (ticks only while processing) ──
  useEffect(() => {
    if (screen !== "processing") {
      if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
      return;
    }
    elapsedIntervalRef.current = setInterval(() => {
      setElapsedMs(Date.now() - jobStartRef.current);
    }, 1000);
    return () => { if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current); };
  }, [screen]);

  useEffect(() => () => {
    stopPollingRef.current?.();
    if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
  }, []);

  // ── Polling ──
  const attachPolling = useCallback((jobId: string) => {
    stopPollingRef.current?.();
    jobStartRef.current = Date.now();
    const stop = startPolling(jobId, 2000, (updated) => {
      if (updated === null) { setReconnecting(true); return; }
      setReconnecting(false);
      setJob(updated);
      if (updated.status === "COMPLETED")   { setScreen("completed");    stop(); }
      else if (updated.status === "PAUSED") { setScreen("paused");       stop(); }
      else if (updated.status === "INTERRUPTED") { setScreen("interrupted"); stop(); }
      else if (updated.status === "FAILED") { setScreen("failed");       stop(); }
    });
    stopPollingRef.current = stop;
  }, []);

  // ── File upload ──
  const handleFile = useCallback(async (file: File) => {
    setUploadError(null);
    setConflict(null);
    setActionError(null);

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setUploadError("Hanya fail PDF dibenarkan untuk Bank Statement Import.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setUploadError("Fail terlalu besar. Had maksimum: 50MB.");
      return;
    }

    setFileSize(file.size);
    setScreen("uploading");
    try {
      const fileDataUrl = await readFileAsDataUrl(file);
      const result = await startImport({ fileDataUrl, fileName: file.name, tenantId, workspaceId: wsId, userId });

      if ("error" in result && result.error === "ACTIVE_IMPORT_EXISTS") {
        setConflict(result as ActiveImportConflict);
        setScreen("idle");
        return;
      }

      const { jobId, totalPages: tp } = result as StartImportResponse;
      if (tp) {
        setTotalPages(tp);
        sessionStorage.setItem(`stmt_pages_${jobId}`, String(tp));
      }

      const authHdr = await import("../lib/supabase").then((m) => m.getAuthHeader());
      const jobResp = await fetch(`/api/statement/process/progress/${jobId}`, { headers: authHdr });
      const jobData: StatementJob = await jobResp.json();
      setJob(jobData);
      setScreen("processing");
      attachPolling(jobId);
    } catch (err: any) {
      setUploadError(err?.message || "Gagal memulakan import. Sila cuba lagi.");
      setScreen("idle");
    }
  }, [attachPolling, tenantId, wsId, userId]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // ── Pause ──
  const handlePause = async () => {
    if (!job) return;
    setActionError(null);
    try {
      await pauseImport(job.id);
      stopPollingRef.current?.();
      setScreen("paused");
      setJob((p) => p ? { ...p, status: "PAUSED" } : p);
    } catch (err: any) { setActionError(err?.message || "Gagal menjeda."); }
  };

  // ── Resume (core — reusable) ──
  const doResume = useCallback(async (jobId: string) => {
    setResuming(true);
    setActionError(null);
    try {
      await resumeImport(jobId, userId);
      setScreen("processing");
      attachPolling(jobId);
    } catch (err: any) {
      setActionError(err?.message || "Gagal menyambung semula.");
    } finally {
      setResuming(false);
    }
  }, [attachPolling, userId]);

  const handleResume = () => { if (job) doResume(job.id); };

  // ── Cancel dialog ──
  const handleCancelChoice = async (choice: "continue" | "pause_and_save" | "cancel") => {
    if (!job) { setScreen("processing"); return; }

    if (choice === "continue") {
      // If processing, return to processing screen (engine still running)
      if (["PROCESSING", "PENDING"].includes(job.status)) {
        setScreen("processing");
      } else if (RESUMABLE_STATUSES.includes(job.status)) {
        // Job is paused/interrupted — actively resume so user doesn't need two clicks
        await doResume(job.id);
      } else {
        setScreen("processing");
      }
      return;
    }

    if (choice === "pause_and_save") {
      try {
        if (["PROCESSING", "PENDING"].includes(job.status)) {
          await pauseImport(job.id);
          stopPollingRef.current?.();
        }
        setScreen("paused");
        setJob((p) => p ? { ...p, status: "PAUSED" } : p);
      } catch (err: any) {
        setActionError(err?.message || "Gagal menjeda.");
        setScreen("processing");
      }
      return;
    }

    // Cancel
    try {
      stopPollingRef.current?.();
      await cancelImport(job.id);
      if (job.id) sessionStorage.removeItem(`stmt_pages_${job.id}`);
      setJob(null);
      setTotalPages(null);
      setScreen("idle");
    } catch (err: any) {
      setActionError(err?.message || "Gagal membatalkan.");
      setScreen("processing");
    }
  };

  // ── Conflict dialog ──
  const handleConflictChoice = async (choice: "resume" | "cancel_then_new") => {
    if (!conflict) return;
    setActionError(null);
    if (choice === "resume") {
      try {
        const authHdr = await import("../lib/supabase").then((m) => m.getAuthHeader());
        const jobResp = await fetch(`/api/statement/process/progress/${conflict.existingJobId}`, { headers: authHdr });
        const jobData: StatementJob = await jobResp.json();
        setJob(jobData);
        const stored = sessionStorage.getItem(`stmt_pages_${conflict.existingJobId}`);
        if (stored) setTotalPages(Number(stored));
        setConflict(null);
        if (RESUMABLE_STATUSES.includes(jobData.status)) {
          setScreen("paused");
        } else if (["PROCESSING", "PENDING"].includes(jobData.status)) {
          setScreen("processing");
          attachPolling(conflict.existingJobId);
        } else if (jobData.status === "COMPLETED") {
          setScreen("completed");
        }
      } catch (err: any) { setActionError(err?.message || "Gagal memuat import semasa."); }
    } else {
      try { await cancelImport(conflict.existingJobId); setConflict(null); }
      catch (err: any) { setActionError(err?.message || "Gagal membatalkan import lama."); }
    }
  };

  // ── Confirm transaction ──
  const handleConfirmTx = async (tx: StatementTransaction, index: number) => {
    if (!job) return;
    setConfirmingIndex(index);
    try {
      await onConfirmTransaction(tx, job.id);
      setConfirmedIndexes((p) => new Set([...p, index]));
      await incrementConfirmedCount(job.id, 1);
    } catch (err: any) { setActionError(err?.message || "Gagal mengesahkan transaksi."); }
    finally { setConfirmingIndex(null); }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: Cancel confirmation
  // ─────────────────────────────────────────────────────────────────────────────
  if (screen === "confirming_cancel") {
    const currentJobStatus = job?.status ?? "PROCESSING";
    return (
      <div className="space-y-6">
        <button onClick={() => setScreen(currentJobStatus === "PAUSED" || currentJobStatus === "INTERRUPTED" ? "paused" : "processing")}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 cursor-pointer transition-colors">
          <ArrowLeft className="w-4 h-4" /> Kembali
        </button>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-amber-50 border-b border-amber-100 px-6 py-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-display font-bold text-slate-900 text-lg">Pilih Tindakan</h3>
                {pages && (
                  <p className="text-sm text-slate-600 mt-1">
                    <span className="font-semibold">{job?.file_name}</span> — {pages.pagesCompleted} daripada {pages.totalPages} halaman selesai.
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="p-6 space-y-3">
            <button onClick={() => handleCancelChoice("continue")}
              className="w-full flex items-center gap-3 px-5 py-4 bg-emerald-50 hover:bg-emerald-100 active:scale-[0.98] border border-emerald-200 rounded-xl transition-all cursor-pointer text-left">
              <Play className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <div>
                <p className="font-semibold text-slate-800">Teruskan Pemprosesan</p>
                <p className="text-xs text-slate-500 mt-0.5">Sambung semula dari checkpoint terakhir.</p>
              </div>
            </button>
            <button onClick={() => handleCancelChoice("pause_and_save")}
              className="w-full flex items-center gap-3 px-5 py-4 bg-amber-50 hover:bg-amber-100 active:scale-[0.98] border border-amber-200 rounded-xl transition-all cursor-pointer text-left">
              <Pause className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <div>
                <p className="font-semibold text-slate-800">Jeda & Simpan Draf</p>
                <p className="text-xs text-slate-500 mt-0.5">Progres disimpan. Boleh sambung semula bila-bila masa.</p>
              </div>
            </button>
            <button onClick={() => handleCancelChoice("cancel")}
              className="w-full flex items-center gap-3 px-5 py-4 bg-red-50 hover:bg-red-100 active:scale-[0.98] border border-red-200 rounded-xl transition-all cursor-pointer text-left">
              <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <div>
                <p className="font-semibold text-red-700">Batal Import</p>
                <p className="text-xs text-slate-500 mt-0.5">Semua progres akan dibuang. Tidak boleh diundur.</p>
              </div>
            </button>
          </div>
          {actionError && (
            <div className="px-6 pb-5">
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{actionError}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: Conflict dialog
  // ─────────────────────────────────────────────────────────────────────────────
  if (conflict) {
    return (
      <div className="space-y-6">
        <button onClick={() => setConflict(null)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 cursor-pointer transition-colors">
          <ArrowLeft className="w-4 h-4" /> Kembali
        </button>
        <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
          <div className="bg-amber-50 border-b border-amber-100 px-6 py-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-display font-bold text-slate-900 text-lg">Import Aktif Dijumpai</h3>
                <p className="text-sm text-slate-600 mt-1">
                  Terdapat import aktif: <span className="font-semibold">{conflict.existingFileName}</span>{" "}
                  (<StatusBadge status={conflict.existingStatus} />). Hanya satu import dibenarkan pada satu masa.
                </p>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-3">
            <button onClick={() => handleConflictChoice("resume")}
              className="w-full flex items-center gap-3 px-5 py-4 bg-blue-50 hover:bg-blue-100 active:scale-[0.98] border border-blue-200 rounded-xl transition-all cursor-pointer text-left">
              <Play className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <div>
                <p className="font-semibold text-slate-800">Sambung Import Semasa</p>
                <p className="text-xs text-slate-500 mt-0.5">Teruskan import yang sedang aktif.</p>
              </div>
            </button>
            <button onClick={() => handleConflictChoice("cancel_then_new")}
              className="w-full flex items-center gap-3 px-5 py-4 bg-red-50 hover:bg-red-100 active:scale-[0.98] border border-red-200 rounded-xl transition-all cursor-pointer text-left">
              <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <div>
                <p className="font-semibold text-red-700">Batal Import Lama & Muat Naik Baharu</p>
                <p className="text-xs text-slate-500 mt-0.5">Import yang aktif akan dibatalkan.</p>
              </div>
            </button>
          </div>
          {actionError && (
            <div className="px-6 pb-5">
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{actionError}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: Processing / Paused / Interrupted / Failed
  // ─────────────────────────────────────────────────────────────────────────────
  if (job && ["processing", "paused", "interrupted", "failed"].includes(screen)) {
    const isRunning   = screen === "processing";
    const isPaused    = screen === "paused" || screen === "interrupted";
    const isFailed    = screen === "failed";
    const isResumable = isPaused || isFailed;
    const pct         = pages && pages.totalPages > 0
      ? Math.round((pages.pagesCompleted / pages.totalPages) * 100) : 0;
    const pendingConfirm = (job.transactions_found ?? 0) - (job.transactions_confirmed ?? 0);
    const activePipelineStage = derivePipelineStage(job, screen);

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button onClick={() => setScreen("confirming_cancel")}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 cursor-pointer transition-colors">
            <ArrowLeft className="w-4 h-4" /> Kembali
          </button>
          <StatusBadge status={job.status} />
        </div>

        {/* ── File Info Card ── */}
        <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm p-4 space-y-3">
          <div className="flex items-start gap-3">
            <FileText className="w-8 h-8 text-indigo-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800 truncate text-sm">{job.file_name}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                {fileSize > 0 && (
                  <span className="text-xs text-slate-400">{formatFileSize(fileSize)}</span>
                )}
                {totalPages && (
                  <span className="text-xs text-slate-400">{totalPages} halaman ditemui</span>
                )}
                <span className="text-xs text-slate-400">
                  Mula: {new Date(job.started_at).toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          </div>

          {reconnecting && (
            <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Menyambung semula ke pelayan...
            </div>
          )}
          {isRunning && !reconnecting && (
            <div className="flex items-center gap-2 text-xs text-indigo-600 bg-indigo-50 rounded-lg px-3 py-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              {pages
                ? `Sedang menganalisis: Halaman ${pages.currentPage} daripada ${pages.totalPages}`
                : "Sedang menganalisis bank statement anda..."}
            </div>
          )}
          {isPaused && !isRunning && (
            <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              <Pause className="w-3 h-3" />
              {pages
                ? `Dijeda pada Halaman ${pages.currentPage} daripada ${pages.totalPages} — checkpoint disimpan.`
                : "Dijeda — checkpoint disimpan. Klik Sambung Semula untuk meneruskan."}
            </div>
          )}
          {isFailed && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3 h-3" />
              {job.error_message || "Ralat berlaku. Klik Sambung Semula untuk mencuba semula."}
            </div>
          )}
          {pages && pages.totalPages > 20 && (
            <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
              <Clock className="w-3 h-3 mt-0.5 flex-shrink-0" />
              Penyata besar ({pages.totalPages} halaman). Boleh dijeda dan disambung semula — progres tidak hilang walaupun browser ditutup.
            </div>
          )}
        </div>

        {/* ── Overall Progress ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Progres Keseluruhan</span>
              <span className="text-lg font-bold text-slate-900">{pct}%</span>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${
                  isRunning ? "bg-indigo-500" :
                  isPaused  ? "bg-amber-400" :
                  isFailed  ? "bg-red-400"   : "bg-slate-400"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Page counters */}
          {pages && (
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center bg-indigo-50 rounded-xl py-2.5 px-2 border border-indigo-100">
                <p className="text-xl font-bold text-indigo-700">{pages.totalPages}</p>
                <p className="text-2xs text-slate-500 mt-0.5">Jumlah Halaman</p>
              </div>
              <div className="text-center bg-emerald-50 rounded-xl py-2.5 px-2 border border-emerald-100">
                <p className="text-xl font-bold text-emerald-600">{pages.pagesCompleted}</p>
                <p className="text-2xs text-slate-500 mt-0.5">Selesai</p>
              </div>
              <div className="text-center bg-slate-50 rounded-xl py-2.5 px-2 border border-slate-100">
                <p className="text-xl font-bold text-slate-700">{pages.pagesRemaining}</p>
                <p className="text-2xs text-slate-500 mt-0.5">Berbaki</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Pipeline Processing ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Pipeline Processing</p>
          <div className="space-y-2">
            {PIPELINE_STAGES.map((s, i) => {
              const stageIdx = PIPELINE_STAGES.findIndex((x) => x.key === activePipelineStage);
              const isDone    = i < stageIdx || activePipelineStage === "COMPLETED";
              const isCurrent = s.key === activePipelineStage && !isFailed;
              const isFail    = isFailed && s.key === activePipelineStage;
              return (
                <PipelineRow key={s.key} label={s.label} done={isDone && !isFailed} current={isCurrent && isRunning} failed={isFail} />
              );
            })}
          </div>

          {/* Per-stage progress bars */}
          <div className="pt-1 space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              <span className="w-28 text-slate-500 shrink-0 text-2xs">Muat Naik</span>
              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 transition-all" style={{ width: "100%" }} />
              </div>
              <span className="w-8 text-right font-semibold text-slate-600 text-2xs">100%</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="w-28 text-slate-500 shrink-0 text-2xs">OCR / Analisis AI</span>
              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-8 text-right font-semibold text-slate-600 text-2xs">{pct}%</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="w-28 text-slate-500 shrink-0 text-2xs">Ekstrak Transaksi</span>
              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: job.transactions_found > 0 ? `${Math.min(100, pct)}%` : "0%" }} />
              </div>
              <span className="w-8 text-right font-semibold text-slate-600 text-2xs">{job.transactions_found > 0 ? pct : 0}%</span>
            </div>
          </div>
        </div>

        {/* ── Statistics ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Statistik</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-2xs text-slate-400 mb-1 flex items-center gap-1"><Clock className="w-3 h-3" />Masa Berlalu</p>
              <p className="text-base font-bold text-slate-800">{formatDuration(elapsedMs)}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-2xs text-slate-400 mb-1">Anggaran Baki</p>
              <p className="text-base font-bold text-slate-800">
                {isRunning && remainingMs !== null ? formatDuration(remainingMs) : "—"}
              </p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-2xs text-slate-400 mb-1">Transaksi Ditemui</p>
              <p className="text-xl font-bold text-slate-800">{job.transactions_found}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-2xs text-slate-400 mb-1">Menunggu Pengesahan</p>
              <p className="text-xl font-bold text-amber-600">{pendingConfirm}</p>
            </div>
          </div>

          {job.chunks_failed > 0 && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                {job.chunks_failed} bahagian gagal — sebahagian transaksi mungkin tidak lengkap.
              </p>
            </div>
          )}
        </div>

        {/* ── Maklumat Teknikal ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setShowTechDetail((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <span className="uppercase tracking-wide">Maklumat Teknikal</span>
            {showTechDetail ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
          {showTechDetail && (
            <div className="border-t border-slate-100 px-4 py-3 max-h-64 overflow-y-auto space-y-1.5">
              <StatRow label="Current Chunk" value={`${Math.min(job.total_chunks, job.chunks_completed + 1)} / ${job.total_chunks}`} />
              <StatRow label="Chunk Selesai" value={job.chunks_completed} />
              <StatRow label="Chunk Berbaki" value={Math.max(0, job.total_chunks - job.chunks_completed)} />
              <StatRow label="Chunk Gagal" value={job.chunks_failed} />
              <StatRow label="Checkpoint" value={`${job.checkpoints?.filter(c => c.status === "COMPLETED").length ?? 0} disimpan`} />
              <StatRow label="Retry Count" value={job.checkpoints?.reduce((a, c) => a + (c.attempt_count ?? 0), 0) ?? 0} />
              <StatRow label="AI Provider" value={job.ai_provider_used} />
              <StatRow label="Muka Surat Penyata Bank" value="Dicaj semasa mula (1 muka surat = 1 kuota)" />
              <StatRow label="Resume Status" value={
                job.status === "PAUSED" ? "Checkpoint disimpan — siap disambung" :
                job.status === "INTERRUPTED" ? "Dijeda oleh server restart" :
                job.status === "PROCESSING" ? "Aktif" : job.status
              } />
              <StatRow label="Masa Mula" value={new Date(job.started_at).toLocaleString("ms-MY")} />
              <StatRow label="Job ID" value={job.id} />
              {/* Per-chunk status */}
              {job.checkpoints && job.checkpoints.length > 0 && (
                <div className="pt-2 border-t border-slate-100 space-y-1">
                  <p className="text-2xs text-slate-400 uppercase tracking-wide">Status Setiap Chunk</p>
                  {job.checkpoints.map((cp) => (
                    <div key={cp.chunk_index} className="flex items-center gap-2 text-2xs">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        cp.status === "COMPLETED" ? "bg-emerald-400" :
                        cp.status === "FAILED"    ? "bg-red-400"     : "bg-slate-300 animate-pulse"
                      }`} />
                      <span className="text-slate-500">Chunk {cp.chunk_index + 1}</span>
                      <span className="ml-auto text-slate-600 font-mono">
                        {cp.status === "COMPLETED"
                          ? `${Array.isArray(cp.transactions_json) ? cp.transactions_json.length : 0} tx`
                          : cp.status === "FAILED" ? "Gagal" : "…"}
                      </span>
                      {cp.ai_provider_used && (
                        <span className="text-slate-400 truncate max-w-[80px]">{cp.ai_provider_used}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Action buttons ── */}
        <div className="flex gap-3">
          {isRunning && (
            <button onClick={handlePause}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-amber-100 hover:bg-amber-200 active:scale-[0.98] border border-amber-200 text-amber-800 font-semibold rounded-xl transition-all cursor-pointer">
              <Pause className="w-4 h-4" /> Jeda
            </button>
          )}
          {isResumable && (
            <button onClick={handleResume} disabled={resuming}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-60 text-white font-semibold rounded-xl transition-all cursor-pointer">
              {resuming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {resuming ? "Menyambung..." : "Sambung Semula"}
            </button>
          )}
          <button onClick={() => setScreen("confirming_cancel")}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 active:scale-[0.98] border border-slate-200 text-slate-600 font-semibold rounded-xl transition-all cursor-pointer">
            <X className="w-4 h-4" /> Batal
          </button>
        </div>

        {actionError && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{actionError}</p>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: Draft review (completed)
  // ─────────────────────────────────────────────────────────────────────────────
  if (screen === "completed" && job && draft) {
    const allConfirmed = draft.transactions.length > 0 && confirmedIndexes.size === draft.transactions.length;
    const pg = pages ?? derivePagesFromJob(job, totalPages);

    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <button onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 cursor-pointer transition-colors">
            <ArrowLeft className="w-4 h-4" /> Kembali
          </button>
          <StatusBadge status="COMPLETED" />
        </div>

        <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-5">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-8 h-8 text-emerald-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-display font-bold text-slate-900 text-lg">Draf Sedia untuk Pengesahan</h3>
              <p className="text-sm text-slate-600 mt-1">
                {pg.totalPages} halaman diproses · {draft.transactions.length} transaksi diekstrak daripada{" "}
                <span className="font-semibold">{job.file_name}</span>.
              </p>
              {draft.isIncomplete && (
                <div className="mt-2 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-2 py-1.5">
                  <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                  Beberapa halaman gagal — transaksi mungkin tidak lengkap sepenuhnya.
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="text-center bg-slate-50 rounded-xl p-3">
              <p className="text-2xl font-bold text-slate-800">{draft.transactions.length}</p>
              <p className="text-xs text-slate-400 mt-0.5">Jumlah</p>
            </div>
            <div className="text-center bg-emerald-50 rounded-xl p-3">
              <p className="text-2xl font-bold text-emerald-600">{confirmedIndexes.size}</p>
              <p className="text-xs text-slate-400 mt-0.5">Disahkan</p>
            </div>
            <div className="text-center bg-amber-50 rounded-xl p-3">
              <p className="text-2xl font-bold text-amber-600">{draft.transactions.length - confirmedIndexes.size}</p>
              <p className="text-xs text-slate-400 mt-0.5">Belum Sahkan</p>
            </div>
          </div>
        </div>

        {allConfirmed && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-2 text-emerald-700 text-sm font-medium">
            <CheckCircle className="w-4 h-4" /> Semua transaksi telah disahkan.
          </div>
        )}
        {actionError && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{actionError}</p>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h4 className="font-semibold text-slate-700 text-sm">Senarai Transaksi</h4>
            <span className="text-xs text-slate-400">{draft.transactions.length} rekod</span>
          </div>
          <div className="divide-y divide-slate-50 max-h-[60vh] overflow-y-auto">
            {draft.transactions.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">Tiada transaksi ditemui.</div>
            ) : (
              draft.transactions.map((tx, i) => (
                <TransactionRow
                  key={i} tx={tx} index={i}
                  onConfirm={(t) => handleConfirmTx(t, i)}
                  confirmed={confirmedIndexes.has(i)}
                  confirming={confirmingIndex === i}
                />
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: Idle / Upload
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 cursor-pointer transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="font-display font-bold text-slate-900 text-lg flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" />
            Import Bank Statement AI
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Muat naik PDF bank statement untuk mengekstrak transaksi secara automatik.
          </p>
        </div>
      </div>

      <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 text-xs text-indigo-700 flex items-start gap-2">
        <Clock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <span>
          Disokong: 1–1000+ halaman. Import boleh dijeda dan disambung semula bila-bila masa —
          progres tidak akan hilang walaupun browser ditutup atau sambungan terputus.
        </span>
      </div>

      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all ${
          isDragging
            ? "border-indigo-400 bg-indigo-50"
            : "border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50/40"
        }`}
      >
        {screen === "uploading" ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
            <p className="text-sm font-medium text-slate-700">Memuat naik dan mengekstrak teks PDF...</p>
          </div>
        ) : (
          <>
            <Upload className="w-10 h-10 text-slate-400 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-700 mb-1">
              Seret & lepas fail PDF di sini
            </p>
            <p className="text-xs text-slate-400 mb-4">atau</p>
            <label className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.97] text-white text-sm font-semibold rounded-xl transition-all cursor-pointer inline-block">
              Pilih Fail PDF
              <input
                type="file" accept=".pdf" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
              />
            </label>
            <p className="text-xs text-slate-400 mt-3">PDF sahaja · Maksimum 50MB</p>
          </>
        )}
      </div>

      {uploadError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{uploadError}</p>
        </div>
      )}
    </div>
  );
}
