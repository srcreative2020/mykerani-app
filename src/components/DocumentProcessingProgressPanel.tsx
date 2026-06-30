import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { OCR_STAGE_LABELS, OCR_STAGE_ORDER, OcrJobState } from "../lib/ocrJobTypes";

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms < 0 || !Number.isFinite(ms)) return "—";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function StatRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex items-center justify-between text-xs py-0.5">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-800">{value === null || value === undefined || value === "" ? "—" : value}</span>
    </div>
  );
}

function StageProgressBar({ label, pct }: { label: string; pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-32 text-slate-500 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div className="h-full bg-indigo-500 transition-all" style={{ width: `${clamped}%` }} />
      </div>
      <span className="w-10 text-right font-semibold text-slate-700 shrink-0">{Math.round(clamped)}%</span>
    </div>
  );
}

export default function DocumentProcessingProgressPanel({ job }: { job: OcrJobState }) {
  const now = job.status === "PROCESSING" ? Date.now() : job.updatedTime;
  const elapsedMs = now - job.startTime;
  const failed = job.status === "FAILED";
  const stageOrder = job.stage === "FAILED"
    ? OCR_STAGE_ORDER.slice(0, job.errorStage ? OCR_STAGE_ORDER.indexOf(job.errorStage) + 1 : 1)
    : OCR_STAGE_ORDER;
  const currentStageIndex = stageOrder.indexOf(job.stage === "FAILED" ? (job.errorStage || "UPLOAD_COMPLETE") : job.stage);
  const isStatementDoc = job.documentType === "STATEMENT";

  // Per-stage bar percentages derived from overallProgress vs each stage's
  // weight bucket, so the "Upload .... 100% / AI Analysis .... 62%" style
  // breakdown requested matches the same numbers driving the overall bar.
  const stageWeights: Record<string, [number, number]> = {
    UPLOAD_COMPLETE: [0, 5], FILE_RETRIEVED: [5, 10], PDF_EXTRACTED: [10, 20],
    OCR_PROCESSING: [20, 70], AI_ANALYSIS: [70, 80], CLASSIFICATION: [80, 85],
    TRANSACTION_EXTRACTION: [85, 90], REVIEW_GENERATION: [90, 95], COMPLETED: [95, 100],
  };
  const stagePct = (stage: string) => {
    const [start, end] = stageWeights[stage] || [0, 100];
    if (job.overallProgress >= end) return 100;
    if (job.overallProgress <= start) return 0;
    return ((job.overallProgress - start) / (end - start)) * 100;
  };

  return (
    <div className="bg-white border border-indigo-200 rounded-xl p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {failed ? (
            <XCircle className="w-4 h-4 text-red-500 shrink-0" />
          ) : job.status === "COMPLETED" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          ) : (
            <Loader2 className="w-4 h-4 text-indigo-500 animate-spin shrink-0" />
          )}
          <p className="text-xs font-bold text-slate-800">
            {failed ? "Pemprosesan Gagal" : job.status === "COMPLETED" ? "Pemprosesan Selesai" : "Memproses Dokumen..."}
          </p>
        </div>
        <span className="text-xs font-semibold text-slate-500">{OCR_STAGE_LABELS[job.stage]}</span>
      </div>

      {/* File metadata */}
      <div className="grid grid-cols-2 gap-x-4 border-y border-slate-100 py-2">
        <StatRow label="Nama Fail" value={job.fileName} />
        <StatRow label="Saiz Fail" value={formatBytes(job.fileSize)} />
        <StatRow label="Halaman Ditemui" value={job.pagesFound} />
        <StatRow label="Masa Mula" value={formatTime(job.startTime)} />
        <StatRow label="Masa Berlalu" value={formatDuration(elapsedMs)} />
        <StatRow label="Anggaran Baki Masa" value={job.status === "PROCESSING" ? formatDuration(job.estimatedRemainingMs) : "—"} />
      </div>

      {/* Stage checklist */}
      <div className="space-y-1">
        {OCR_STAGE_ORDER.map((stage, i) => {
          const isDone = !failed && (job.status === "COMPLETED" || i < currentStageIndex || (i === currentStageIndex && job.stage !== stage));
          const isCurrent = !failed && job.stage === stage && job.status === "PROCESSING";
          const isFailedHere = failed && job.errorStage === stage;
          return (
            <div key={stage} className="flex items-center gap-2 text-xs">
              {isFailedHere ? (
                <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
              ) : isCurrent ? (
                <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin shrink-0" />
              ) : isDone || job.status === "COMPLETED" ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              ) : (
                <Circle className="w-3.5 h-3.5 text-slate-300 shrink-0" />
              )}
              <span className={isFailedHere ? "text-red-600 font-semibold" : isCurrent ? "text-indigo-700 font-semibold" : "text-slate-600"}>
                {OCR_STAGE_LABELS[stage]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Per-stage progress bars */}
      <div className="space-y-1 border-t border-slate-100 pt-2">
        <StageProgressBar label="Upload" pct={stagePct("UPLOAD_COMPLETE") + stagePct("FILE_RETRIEVED")} />
        <StageProgressBar label="PDF Extraction" pct={stagePct("PDF_EXTRACTED")} />
        <StageProgressBar label="OCR / AI Analysis" pct={stagePct("OCR_PROCESSING") * 0.7 + stagePct("AI_ANALYSIS") * 0.3} />
        <StageProgressBar label="Transaction Parse" pct={stagePct("CLASSIFICATION") * 0.3 + stagePct("TRANSACTION_EXTRACTION") * 0.7} />
        <div className="pt-1 flex items-center gap-2 text-xs font-bold">
          <span className="w-32 text-slate-700 shrink-0">Overall Progress</span>
          <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${failed ? "bg-red-500" : job.status === "COMPLETED" ? "bg-emerald-500" : "bg-indigo-600"}`}
              style={{ width: `${Math.round(job.overallProgress)}%` }}
            />
          </div>
          <span className="w-10 text-right text-slate-800 shrink-0">{Math.round(job.overallProgress)}%</span>
        </div>
      </div>

      {/* Bank-statement-specific counters */}
      {isStatementDoc && (
        <div className="grid grid-cols-3 gap-x-4 gap-y-1 border-t border-slate-100 pt-2">
          <StatRow label="Halaman Ditemui" value={job.pagesFound} />
          <StatRow label="Halaman Diproses" value={job.pagesProcessed} />
          <StatRow label="Jumlah Bahagian (Chunks)" value={job.chunksTotal} />
          <StatRow label="Bahagian Selesai" value={job.chunksCompleted} />
          <StatRow label="Bahagian Gagal" value={job.chunksFailed} />
          <StatRow label="Transaksi Ditemui" value={job.transactionsFound} />
          <StatRow label="Transaksi Diekstrak" value={job.transactionsExtracted} />
        </div>
      )}

      {/* AI usage */}
      <div className="grid grid-cols-2 gap-x-4 border-t border-slate-100 pt-2">
        <StatRow label="Pembekal AI" value={job.providerUsed} />
        <StatRow label="Model" value={job.modelUsed} />
        <StatRow label="Anggaran Token Input" value={job.estimatedInputTokens || null} />
        <StatRow label="Anggaran Token Output" value={job.estimatedOutputTokens || null} />
        <StatRow label="Anggaran Kos (USD)" value={job.estimatedCostUsd !== null && job.estimatedCostUsd !== undefined ? `$${job.estimatedCostUsd.toFixed(4)}` : "—"} />
      </div>

      {failed && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 space-y-1">
          <p className="text-xs font-bold text-red-700">Peringkat Gagal: {OCR_STAGE_LABELS[job.errorStage || "OCR_PROCESSING"]}</p>
          <p className="text-xs text-red-600">{job.error}</p>
          {job.errorDetail && <p className="text-2xs text-red-500 break-all">[{job.errorDetail}]</p>}
        </div>
      )}
    </div>
  );
}
