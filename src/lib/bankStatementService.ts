// Bank Statement Import Workflow — client-side service layer.
//
// Design principles enforced here:
//
//  Rule #1 — RESUME IS EXACT
//    startImport()  calls /start only for a brand-new file.
//    resumeImport() calls /resume/:jobId — the server re-fires runStatementAnalysis()
//    which loads completedIndexes from bank_statement_checkpoints and skips them.
//    Credits (OCR) are ONLY deducted inside /start. /resume never charges credits.
//    This service never calls /start on behalf of a resume path.
//
//  Rule #2 — PROGRESS IS PERSISTENT
//    All progress state comes from getProgress() which reads bank_statement_jobs +
//    bank_statement_checkpoints from Supabase via the server route.
//    No in-memory accumulation. Every call reconstructs state from DB.
//    Safe across browser refresh, tab close, app kill, Railway restart.

import { getAuthHeader, supabase } from "./supabase";
import {
  type StartImportRequest,
  type StartImportResponse,
  type StatementJob,
  type StatementDraft,
  type StatementTransaction,
  type ActiveImportConflict,
  ACTIVE_STATUSES,
} from "./bankStatementTypes";

// ─── Internal fetch helper ────────────────────────────────────────────────────

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const authHeader = await getAuthHeader();
  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeader,
      ...(options.headers || {}),
    },
  });
}

// ─── PDF text extraction (client-side, before upload) ─────────────────────────
// The server never stores the raw base64 binary — only extracted text is stored
// in file_data_text so that: (a) storage is minimal, (b) resume works without
// re-uploading the file, (c) the user's file never needs to be re-read.

export async function extractPdfText(fileDataUrl: string): Promise<{ text: string; pages: number | null }> {
  // Dynamic import to avoid bundling pdf-parse on the server bundle.
  // On the client we use pdfjs-dist which is already a dependency via OCREngineConsole.
  const pdfjsLib = await import("pdfjs-dist");

  // Set worker source — Vite exposes the worker URL via ?url import.
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.mjs",
      import.meta.url
    ).toString();
  }

  const match = fileDataUrl.match(/^data:[^;]+;base64,(.+)$/);
  const base64Data = match ? match[1] : fileDataUrl;
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  const pages = pdf.numPages;
  const textParts: string[] = [];

  for (let p = 1; p <= pages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => ("str" in item ? item.str : ""))
      .join(" ");
    textParts.push(pageText);
  }

  return { text: textParts.join("\n").trim(), pages };
}

// ─── Start a new import ───────────────────────────────────────────────────────
// ONLY called for a fresh file. Never call this for a resume.
// Returns { jobId } on success, or an ActiveImportConflict if Rule #4 fires.

export async function startImport(
  req: StartImportRequest
): Promise<StartImportResponse | ActiveImportConflict> {
  const resp = await apiFetch("/api/statement/process/start", {
    method: "POST",
    body: JSON.stringify(req),
  });

  const data = await resp.json();

  if (resp.status === 409 && data.error === "ACTIVE_IMPORT_EXISTS") {
    return data as ActiveImportConflict;
  }
  if (!resp.ok) {
    throw new Error(data?.error || `Import start failed (HTTP ${resp.status})`);
  }
  return data as StartImportResponse;
}

// ─── Resume an existing import ────────────────────────────────────────────────
// Calls /resume/:jobId. The server engine will:
//   1. Load all COMPLETED checkpoints from bank_statement_checkpoints.
//   2. Build completedIndexes and skip those chunks entirely (no AI, no credits).
//   3. Continue from the first chunk that is not in completedIndexes.
// Credits are NOT charged again — consumeResourceCredit() was called only at /start.

export async function resumeImport(
  jobId: string,
  userId: string
): Promise<void> {
  const resp = await apiFetch(`/api/statement/process/resume/${jobId}`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data?.error || `Resume failed (HTTP ${resp.status})`);
  }
}

// ─── Pause ────────────────────────────────────────────────────────────────────
// Signals the server engine to stop after the current chunk completes.
// The job status becomes PAUSED in bank_statement_jobs.

export async function pauseImport(jobId: string): Promise<void> {
  const resp = await apiFetch(`/api/statement/process/pause/${jobId}`, { method: "POST" });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data?.error || `Pause failed (HTTP ${resp.status})`);
  }
}

// ─── Cancel ───────────────────────────────────────────────────────────────────
// Sets status CANCELLED. Releases the one-active-per-workspace constraint (Rule #4).
// A cancelled job cannot be resumed — user must start a new import.

export async function cancelImport(jobId: string): Promise<void> {
  const resp = await apiFetch(`/api/statement/process/cancel/${jobId}`, { method: "POST" });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data?.error || `Cancel failed (HTTP ${resp.status})`);
  }
}

// ─── Get progress (Rule #2 — always from DB) ─────────────────────────────────
// Reads bank_statement_jobs + bank_statement_checkpoints via the server route.
// Call this on: mount, refresh, reconnect, polling interval.
// Never depend on client-side state — reconstruct from this call alone.

export async function getProgress(jobId: string): Promise<StatementJob> {
  const resp = await apiFetch(`/api/statement/process/progress/${jobId}`);
  if (resp.status === 404) throw new Error("JOB_NOT_FOUND");
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data?.error || `Progress fetch failed (HTTP ${resp.status})`);
  }
  return resp.json() as Promise<StatementJob>;
}

// ─── Find active import for workspace (Rule #2) ───────────────────────────────
// Used on screen mount to restore an in-progress import after browser refresh,
// app kill, or reconnect. Queries bank_statement_jobs directly via Supabase.
// Returns null if no active import exists for this workspace.

export async function getActiveImport(workspaceId: string): Promise<StatementJob | null> {
  if (!supabase) return null;

  const statusList = ACTIVE_STATUSES.join(",");
  const { data, error } = await supabase
    .from("bank_statement_jobs")
    .select("*")
    .eq("workspace_id", workspaceId)
    .in("status", ACTIVE_STATUSES as unknown as string[])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[bankStatementService] getActiveImport error:", error, "statusList:", statusList);
    return null;
  }
  return data as StatementJob | null;
}

// ─── Get completed import for workspace ───────────────────────────────────────
// Used to load a COMPLETED job so the user can review and confirm transactions.

export async function getCompletedImport(workspaceId: string): Promise<StatementJob | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("bank_statement_jobs")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("status", "COMPLETED")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[bankStatementService] getCompletedImport error:", error);
    return null;
  }
  return data as StatementJob | null;
}

// ─── Build draft (Rule #2 — reconstructed from DB checkpoints) ───────────────
// Aggregates all COMPLETED checkpoint transactions into a single flat list.
// Call this after getProgress() to build the draft transaction list.
// This is the ONLY source of truth for draft transactions — never accumulate
// in component state between renders.

export function buildDraftFromJob(job: StatementJob): StatementDraft {
  const checkpoints = job.checkpoints ?? [];

  const transactions: StatementTransaction[] = checkpoints
    .filter((cp) => cp.status === "COMPLETED" && Array.isArray(cp.transactions_json))
    .sort((a, b) => a.chunk_index - b.chunk_index)
    .flatMap((cp) => (cp.transactions_json as StatementTransaction[]) ?? []);

  const chunksWithTransactions = checkpoints.filter(
    (cp) => cp.status === "COMPLETED" && Array.isArray(cp.transactions_json) && cp.transactions_json.length > 0
  ).length;

  const isIncomplete = checkpoints.some((cp) => cp.status === "FAILED");

  return { job, transactions, chunksWithTransactions, isIncomplete };
}

// ─── Polling helper ───────────────────────────────────────────────────────────
// Starts a polling loop for a job. Returns a stop function.
// The callback receives the latest StatementJob (with checkpoints) on each tick.
// Stops automatically when job reaches a terminal status (COMPLETED/FAILED/CANCELLED).
// On error (network loss, Railway restart) the callback receives null and polling continues —
// the UI should show "Menyambung semula..." without resetting any displayed progress.

export function startPolling(
  jobId: string,
  intervalMs: number,
  onTick: (job: StatementJob | null) => void
): () => void {
  let stopped = false;

  const poll = async () => {
    if (stopped) return;
    try {
      const job = await getProgress(jobId);
      if (!stopped) {
        onTick(job);
        const isTerminal = ["COMPLETED", "FAILED", "CANCELLED"].includes(job.status);
        if (!isTerminal && !stopped) {
          setTimeout(poll, intervalMs);
        }
      }
    } catch {
      // Network loss / server restart — signal null so UI shows reconnecting state.
      if (!stopped) {
        onTick(null);
        setTimeout(poll, intervalMs);
      }
    }
  };

  setTimeout(poll, 0);

  return () => { stopped = true; };
}

// ─── Increment confirmed count after CONFIRM ──────────────────────────────────
// Called by the UI after each successful confirmFinancialRecord() call.
// Only updates transactions_confirmed — no other field is touched.
// This is informational only; it does NOT affect the draft or the job lifecycle.

export async function incrementConfirmedCount(jobId: string, delta: number): Promise<void> {
  if (!supabase) return;
  // Read current count, then update. Best-effort — failure here does not block confirm flow.
  try {
    const { data } = await supabase
      .from("bank_statement_jobs")
      .select("transactions_confirmed")
      .eq("id", jobId)
      .single();

    const current = (data as any)?.transactions_confirmed ?? 0;
    await supabase
      .from("bank_statement_jobs")
      .update({ transactions_confirmed: current + delta })
      .eq("id", jobId);
  } catch (err) {
    console.warn("[bankStatementService] incrementConfirmedCount failed (non-blocking):", err);
  }
}
