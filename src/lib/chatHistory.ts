import { supabase, isSupabaseConfigured } from "./supabase";
import { isDemoWorkspace } from "./seeder";

export interface PersistedChatMsg {
  id: string;
  sender: "user" | "ai";
  text: string;
  suggestions?: any[];
  createdAt: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: "image" | "pdf" | "audio";
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
    .select("id,sender,text,suggestions,created_at,attachment_url,attachment_name,attachment_type")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map((row: any) => ({
    id: row.id,
    sender: row.sender,
    text: row.text,
    suggestions: row.suggestions || [],
    createdAt: row.created_at,
    attachmentUrl: row.attachment_url || undefined,
    attachmentName: row.attachment_name || undefined,
    attachmentType: row.attachment_type || undefined,
  }));
};

export const saveChatMessage = (
  workspaceId: string | undefined,
  userId: string | undefined,
  isMockUser: boolean,
  msg: { sender: "user" | "ai"; text: string; suggestions?: any[]; attachmentUrl?: string; attachmentName?: string; attachmentType?: "image" | "pdf" | "audio" }
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
      attachment_url: msg.attachmentUrl || null,
      attachment_name: msg.attachmentName || null,
      attachment_type: msg.attachmentType || null,
    })
    .then(() => {});
};
