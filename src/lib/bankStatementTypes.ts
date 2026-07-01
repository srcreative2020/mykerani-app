// Bank Statement Import Workflow — shared TypeScript types.
// These types mirror the bank_statement_jobs and bank_statement_checkpoints DB tables.

export type StatementJobStatus =
  | "PENDING"
  | "PROCESSING"
  | "PAUSED"
  | "INTERRUPTED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type CheckpointStatus = "PENDING" | "COMPLETED" | "FAILED";

export interface StatementCheckpoint {
  id: string;
  statement_job_id: string;
  chunk_index: number;
  status: CheckpointStatus;
  chunk_text: string | null;
  transactions_json: StatementTransaction[] | null;
  attempt_count: number;
  ai_provider_used: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface StatementJob {
  id: string;
  workspace_id: string;
  tenant_id: string;
  user_id: string;
  file_name: string;
  // file_data_text is NOT returned to the client — server reads it internally
  status: StatementJobStatus;
  total_chunks: number;
  chunks_completed: number;
  chunks_failed: number;
  transactions_found: number;
  transactions_confirmed: number;
  ai_provider_used: string | null;
  error_message: string | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  expires_at: string | null;
  // Joined in the /progress response
  checkpoints?: StatementCheckpoint[];
}

export interface StatementTransaction {
  date: string;           // YYYY-MM-DD
  description: string;
  amount: number;
  type: "CREDIT" | "DEBIT";
  suggestedCategory: string;
  confidenceScore: number;
}

// Full draft view: job + all extracted transactions aggregated from checkpoints.
export interface StatementDraft {
  job: StatementJob;
  transactions: StatementTransaction[];
  chunksWithTransactions: number;
  isIncomplete: boolean;   // true if any chunk FAILED
}

// Conflict response when Rule #4 (one active per workspace) is violated.
export interface ActiveImportConflict {
  error: "ACTIVE_IMPORT_EXISTS";
  existingJobId: string;
  existingStatus: StatementJobStatus;
  existingFileName: string;
  message: string;
}

// What the client must pass to /api/statement/process/start.
export interface StartImportRequest {
  fileDataUrl: string;    // Raw PDF as data URL — server extracts text via pdf-parse
  fileName: string;
  tenantId: string;
  workspaceId: string;
  userId: string;
}

// What the server returns from /api/statement/process/start on success.
export interface StartImportResponse {
  jobId: string;
  totalPages: number | null;   // UI display metadata only — not stored in DB
}

// Active statuses — used to decide whether a job counts as "in flight"
export const ACTIVE_STATUSES: ReadonlyArray<StatementJobStatus> = [
  "PENDING",
  "PROCESSING",
  "PAUSED",
  "INTERRUPTED",
];

// Terminal statuses — job is done in some form; no background engine running.
export const TERMINAL_STATUSES: ReadonlyArray<StatementJobStatus> = [
  "COMPLETED",
  "FAILED",
  "CANCELLED",
];

// Statuses from which resume is allowed.
export const RESUMABLE_STATUSES: ReadonlyArray<StatementJobStatus> = [
  "PAUSED",
  "INTERRUPTED",
  "FAILED",
];
