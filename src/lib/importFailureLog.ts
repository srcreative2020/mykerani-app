// MyKerani — lightweight persisted log of bank-statement import row failures,
// read by the Financial Health Command Center's "Import Failures" card.
//
// Skipped/unreadable CSV rows are detected by parseCsvBankStatement() inside
// HistoricalRecoveryWorkspace.tsx but were previously thrown away once the
// session ended, so an owner/staff had no way to know an import partially
// failed unless they were staring at the recovery screen at that moment.
// This persists a per-workspace count + last batch so the Health Center can
// surface it and link straight back to the Import Recovery Queue.

export interface ImportFailureRecord {
  fileName: string;
  skippedCount: number;
  detectedAt: string; // ISO timestamp
}

const storageKey = (workspaceId: string) => `mykerani_import_failures_${workspaceId}`;

export function recordImportFailures(workspaceId: string, fileName: string, skippedCount: number): void {
  if (!workspaceId || skippedCount <= 0) return;
  try {
    const existing = getImportFailures(workspaceId);
    const next = [{ fileName, skippedCount, detectedAt: new Date().toISOString() }, ...existing].slice(0, 20);
    localStorage.setItem(storageKey(workspaceId), JSON.stringify(next));
  } catch {
    // best-effort only — never block the import flow over a logging failure
  }
}

export function getImportFailures(workspaceId: string): ImportFailureRecord[] {
  if (!workspaceId) return [];
  try {
    const stored = localStorage.getItem(storageKey(workspaceId));
    return stored ? (JSON.parse(stored) as ImportFailureRecord[]) : [];
  } catch {
    return [];
  }
}

export function getImportFailureCount(workspaceId: string): number {
  return getImportFailures(workspaceId).reduce((sum, r) => sum + r.skippedCount, 0);
}

export function clearImportFailures(workspaceId: string): void {
  if (!workspaceId) return;
  try {
    localStorage.removeItem(storageKey(workspaceId));
  } catch {
    // best-effort
  }
}
