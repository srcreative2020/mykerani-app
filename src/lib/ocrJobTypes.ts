// Mirrors the OcrJobState shape returned by GET /api/ocr/analyze/progress/:jobId
// in server.ts — kept in sync manually since the server isn't a shared package.

export type OcrStage =
  | "UPLOAD_COMPLETE" | "FILE_RETRIEVED" | "PDF_EXTRACTED" | "OCR_PROCESSING"
  | "AI_ANALYSIS" | "CLASSIFICATION" | "TRANSACTION_EXTRACTION" | "REVIEW_GENERATION"
  | "COMPLETED" | "FAILED" | "CANCELLED";

export interface OcrJobState {
  jobId: string;
  fileName: string;
  fileSize: number;
  documentType: string;
  startTime: number;
  updatedTime: number;
  stage: OcrStage;
  status: "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
  overallProgress: number;
  pagesFound: number | null;
  pagesProcessed: number | null;
  chunksTotal: number | null;
  chunksCompleted: number;
  chunksFailed: number;
  transactionsFound: number;
  transactionsExtracted: number;
  providerUsed: string | null;
  modelUsed: string | null;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number | null;
  estimatedRemainingMs: number | null;
  error: string | null;
  errorDetail: string | null;
  errorCode: string | null;
  errorStage: OcrStage | null;
  result: any | null;
}

export const OCR_STAGE_ORDER: OcrStage[] = [
  "UPLOAD_COMPLETE", "FILE_RETRIEVED", "PDF_EXTRACTED", "OCR_PROCESSING",
  "AI_ANALYSIS", "CLASSIFICATION", "TRANSACTION_EXTRACTION", "REVIEW_GENERATION",
  "COMPLETED",
];

export const OCR_STAGE_LABELS: Record<OcrStage, string> = {
  UPLOAD_COMPLETE: "Upload Complete",
  FILE_RETRIEVED: "File Retrieved",
  PDF_EXTRACTED: "PDF Extracted",
  OCR_PROCESSING: "OCR Processing",
  AI_ANALYSIS: "AI Analysis",
  CLASSIFICATION: "Classification",
  TRANSACTION_EXTRACTION: "Transaction Extraction",
  REVIEW_GENERATION: "Review Generation",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

// Polls a started OCR job until it reaches a terminal state, calling
// onUpdate after every poll. Returns the final job state.
// Supports cancellation via the cancelSignal flag.
export async function pollOcrJob(
  jobId: string,
  onUpdate: (job: OcrJobState) => void,
  intervalMs: number = 800,
  cancelSignal?: { cancelled: boolean }
): Promise<OcrJobState> {
  while (true) {
    if (cancelSignal?.cancelled) {
      // Attempt to cancel on the server
      try {
        await fetch(`/api/ocr/analyze/cancel/${jobId}`, { method: "POST" });
      } catch {}
      return {
        jobId,
        fileName: "",
        fileSize: 0,
        documentType: "",
        startTime: 0,
        updatedTime: Date.now(),
        stage: "CANCELLED",
        status: "CANCELLED",
        overallProgress: 0,
        pagesFound: null,
        pagesProcessed: null,
        chunksTotal: null,
        chunksCompleted: 0,
        chunksFailed: 0,
        transactionsFound: 0,
        transactionsExtracted: 0,
        providerUsed: null,
        modelUsed: null,
        estimatedInputTokens: 0,
        estimatedOutputTokens: 0,
        estimatedCostUsd: null,
        estimatedRemainingMs: null,
        error: null,
        errorDetail: null,
        errorCode: null,
        errorStage: null,
        result: null,
      };
    }
    const res = await fetch(`/api/ocr/analyze/progress/${jobId}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch OCR job progress (HTTP ${res.status})`);
    }
    const job: OcrJobState = await res.json();
    onUpdate(job);
    if (job.status === "COMPLETED" || job.status === "FAILED" || job.status === "CANCELLED") {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
