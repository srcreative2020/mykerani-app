import { supabase, isSupabaseConfigured } from "./supabase";

export type EventType =
  | "LOGIN"
  | "LOGOUT"
  | "UPLOAD"
  | "OCR_PROCESS"
  | "AI_ANALYSIS"
  | "REPORT_GENERATION"
  | "EXPORT"
  | "BACKUP"
  | "RESTORE"
  | "CONFIRMATION"
  | "RECORD_CREATION";

export interface LogEventParams {
  tenantId: string;
  workspaceId?: string;
  userId?: string;
  userEmail?: string;
  userRole?: string;
  eventType: EventType;
  description?: string;
  metadata?: Record<string, unknown>;
}

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

// Best-effort, fire-and-forget: a logging failure must never block the
// underlying action (login, upload, export, etc.) from completing.
// Demo/mock sessions use non-UUID tenant ids that don't exist as real rows,
// so they're skipped rather than attempted and silently failing.
export async function logEvent(params: LogEventParams): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  if (!isUuid(params.tenantId)) return;
  try {
    await supabase.from("event_logs").insert({
      tenant_id: params.tenantId,
      workspace_id: params.workspaceId || null,
      user_id: params.userId || null,
      user_email: params.userEmail || null,
      user_role: params.userRole || null,
      event_type: params.eventType,
      description: params.description || null,
      metadata: params.metadata || null,
    });
  } catch (err) {
    console.warn("Event log write failed (non-blocking):", err);
  }
}
