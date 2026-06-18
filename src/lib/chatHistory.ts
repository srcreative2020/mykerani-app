import { supabase, isSupabaseConfigured } from "./supabase";
import { isDemoWorkspace } from "./seeder";

export interface PersistedChatMsg {
  id: string;
  sender: "user" | "ai";
  text: string;
  suggestions?: any[];
  createdAt: string;
}

const canPersist = (workspaceId: string | undefined, isMockUser: boolean): workspaceId is string =>
  Boolean(workspaceId) && isSupabaseConfigured() && !isMockUser && !!supabase && !isDemoWorkspace(workspaceId as string);

export const loadChatHistory = async (
  workspaceId: string | undefined,
  isMockUser: boolean
): Promise<PersistedChatMsg[]> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return [];
  const { data, error } = await supabase
    .from("ai_chat_messages")
    .select("id,sender,text,suggestions,created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map((row: any) => ({
    id: row.id,
    sender: row.sender,
    text: row.text,
    suggestions: row.suggestions || [],
    createdAt: row.created_at,
  }));
};

export const saveChatMessage = (
  workspaceId: string | undefined,
  userId: string | undefined,
  isMockUser: boolean,
  msg: { sender: "user" | "ai"; text: string; suggestions?: any[] }
) => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return;
  supabase
    .from("ai_chat_messages")
    .insert({
      workspace_id: workspaceId,
      user_id: userId || null,
      sender: msg.sender,
      text: msg.text,
      suggestions: msg.suggestions || [],
    })
    .then(() => {});
};
