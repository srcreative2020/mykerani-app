import { supabase, isSupabaseConfigured } from "./supabase";
import { isDemoWorkspace } from "./seeder";

// One "active session" pointer is kept per user in localStorage so a page
// refresh can find and resume the same conversation. It is intentionally
// cleared (not just left to expire) on explicit login/logout transitions —
// see endActiveSession — so those always land on a brand-new chat, per the
// "refresh resumes, login/logout don't" product requirement.
interface ActiveSessionPointer {
  sessionId: string;
  workspaceId: string;
}

const activeSessionKey = (userId: string) => `mykerani_active_chat_session_${userId}`;

const canPersist = (workspaceId: string | undefined, isMockUser: boolean): workspaceId is string =>
  Boolean(workspaceId) && isSupabaseConfigured() && !isMockUser && !!supabase && !isDemoWorkspace(workspaceId as string);

export function getStoredActiveSession(userId: string): ActiveSessionPointer | null {
  try {
    const raw = localStorage.getItem(activeSessionKey(userId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeActiveSession(userId: string, pointer: ActiveSessionPointer | null) {
  if (pointer) localStorage.setItem(activeSessionKey(userId), JSON.stringify(pointer));
  else localStorage.removeItem(activeSessionKey(userId));
}

// Called on every dashboard mount (covers both first-ever load and page
// refresh). Reuses the locally-pointed-to session for this workspace if one
// exists; otherwise starts a new one — this is what makes login (which
// clears the pointer first, see endActiveSession) produce a fresh chat while
// a plain refresh (pointer untouched) keeps resuming the same one.
export async function getOrCreateActiveSession(
  userId: string,
  workspaceId: string,
  isMockUser: boolean
): Promise<string> {
  const stored = getStoredActiveSession(userId);
  if (stored && stored.workspaceId === workspaceId) return stored.sessionId;

  if (!canPersist(workspaceId, isMockUser) || !supabase) {
    // Mock/demo/unconfigured workspaces never touch Supabase — keep a
    // purely local session id so the chat UI still has something to key on.
    const localId = `local-${Date.now()}`;
    storeActiveSession(userId, { sessionId: localId, workspaceId });
    return localId;
  }

  const { data, error } = await supabase
    .from("chat_sessions")
    .insert({ workspace_id: workspaceId, user_id: userId, status: "ACTIVE" })
    .select("id")
    .single();

  if (error || !data) {
    // Supabase unreachable — fall back to a local-only id rather than
    // blocking the user from chatting at all.
    const localId = `local-${Date.now()}`;
    storeActiveSession(userId, { sessionId: localId, workspaceId });
    return localId;
  }

  storeActiveSession(userId, { sessionId: data.id, workspaceId });
  return data.id;
}

// Called from signIn/signOut: archives whatever session is currently active
// (so it remains visible in Arkib Perbualan / chat history) and clears the
// local pointer so the next dashboard mount starts a brand-new session.
export async function endActiveSession(userId: string, isMockUser: boolean): Promise<void> {
  const stored = getStoredActiveSession(userId);
  if (stored && canPersist(stored.workspaceId, isMockUser) && supabase && !stored.sessionId.startsWith("local-")) {
    try {
      await supabase
        .from("chat_sessions")
        .update({ status: "ARCHIVED", archived_at: new Date().toISOString() })
        .eq("id", stored.sessionId);
    } catch {
      // Best-effort archival — never block sign-in/sign-out on this.
    }
  }
  storeActiveSession(userId, null);

  // Drop any locally-cached in-progress document/OCR job tied to the old
  // session — it belongs to the chat that's being archived, not the new one.
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(`mykerani_active_doc_${userId}_`))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}
