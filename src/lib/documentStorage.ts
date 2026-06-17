import { supabase } from "./supabase";

export type DocType = "RECEIPT" | "INVOICE" | "BANK_STATEMENT" | "CONTRACT" | "SUPPORTING_DOC";

export interface UploadedDoc {
  id: string;
  workspace_id: string;
  file_name: string;
  file_size_bytes: number;
  mime_type: string;
  document_type: DocType;
  file_path_supabase: string;
  uploaded_by: string;
  created_at: string;
}

export interface StorageUsage {
  workspace_id: string;
  total_bytes: number;
  file_count: number;
}

const BUCKET = "evidence-packages";

// Upload fail ke Supabase Storage + rekod dalam evidence_documents
export async function uploadDocument(
  file: File,
  workspaceId: string,
  userId: string,
  docType: DocType = "SUPPORTING_DOC"
): Promise<{ doc: UploadedDoc | null; error: string | null }> {
  if (!workspaceId) return { doc: null, error: "Workspace tidak ditemui." };

  const ext = file.name.split(".").pop() ?? "bin";
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${workspaceId}/${docType}/${Date.now()}_${safeName}`;

  // Upload ke bucket
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: false });

  if (upErr) return { doc: null, error: upErr.message };

  // Rekod metadata dalam evidence_documents
  const { data, error: dbErr } = await supabase
    .from("evidence_documents")
    .insert({
      workspace_id: workspaceId,
      file_path_supabase: path,
      file_name: file.name,
      file_size_bytes: file.size,
      mime_type: file.type || `application/${ext}`,
      document_type: docType,
      uploaded_by: userId,
      ocr_parsed_content: {},
    })
    .select()
    .single();

  if (dbErr) {
    // Rollback: remove uploaded file
    await supabase.storage.from(BUCKET).remove([path]);
    return { doc: null, error: dbErr.message };
  }

  return { doc: data as UploadedDoc, error: null };
}

// Dapatkan semua dokumen dalam satu workspace
export async function listDocuments(workspaceId: string): Promise<UploadedDoc[]> {
  if (!workspaceId) return [];
  const { data, error } = await supabase
    .from("evidence_documents")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data ?? []) as UploadedDoc[];
}

// Delete dokumen (storage + DB record)
export async function deleteDocument(doc: UploadedDoc): Promise<string | null> {
  const { error: stErr } = await supabase.storage
    .from(BUCKET)
    .remove([doc.file_path_supabase]);

  if (stErr) return stErr.message;

  const { error: dbErr } = await supabase
    .from("evidence_documents")
    .delete()
    .eq("id", doc.id);

  return dbErr ? dbErr.message : null;
}

// Dapatkan signed URL untuk preview/download
export async function getDocumentUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600); // 1 jam
  return error ? null : data.signedUrl;
}

// Kira storage usage sebenar untuk satu workspace
export async function getStorageUsage(workspaceId: string): Promise<StorageUsage> {
  const { data, error } = await supabase.rpc("get_workspace_storage_usage", {
    p_workspace_id: workspaceId,
  });

  if (error || !data || data.length === 0) {
    return { workspace_id: workspaceId, total_bytes: 0, file_count: 0 };
  }
  return {
    workspace_id: workspaceId,
    total_bytes: Number(data[0].total_bytes),
    file_count: Number(data[0].file_count),
  };
}

// HQ: kira storage usage semua workspace
export async function getAllWorkspacesStorageUsage() {
  const { data, error } = await supabase.rpc("get_all_workspaces_storage_usage");
  if (error || !data) return [];
  return data as {
    workspace_id: string;
    workspace_name: string;
    tenant_id: string;
    tenant_name: string;
    total_bytes: number;
    file_count: number;
  }[];
}

// Format bytes jadi human-readable
export function fmtBytes(bytes: number): string {
  const GB = 1_073_741_824;
  const MB = 1_048_576;
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

// Semak sama ada fail type dibenarkan
export function isAllowedFileType(file: File): boolean {
  const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp", "application/pdf", "text/csv"];
  return allowed.includes(file.type);
}

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
