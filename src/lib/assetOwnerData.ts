import { supabase, isSupabaseConfigured } from "./supabase";
import { isDemoWorkspace } from "./seeder";

export interface AssetPurchase {
  id: string;
  workspaceId: string;
  assetName: string;
  category: string;
  purchaseAmountMyr: number;
  purchaseDate: string;
  vendorName: string;
  notes: string;
  createdAt: string;
}

export interface OwnerTransaction {
  id: string;
  workspaceId: string;
  type: "CAPITAL_INJECTION" | "DRAWING";
  amountMyr: number;
  transactionDate: string;
  description: string;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LS_ASSET_KEY = (workspaceId: string) => `asset_purchases_${workspaceId}`;
const LS_OWNER_KEY = (workspaceId: string) => `owner_transactions_${workspaceId}`;

function useSupabase(workspaceId: string): boolean {
  return isSupabaseConfigured() && !!supabase && !isDemoWorkspace(workspaceId);
}

function mapAssetRow(row: any): AssetPurchase {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    assetName: row.asset_name,
    category: row.category || "",
    purchaseAmountMyr: Number(row.purchase_amount_myr) || 0,
    purchaseDate: row.purchase_date,
    vendorName: row.vendor_name || "",
    notes: row.notes || "",
    createdAt: row.created_at || new Date().toISOString(),
  };
}

function mapOwnerRow(row: any): OwnerTransaction {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    type: row.type,
    amountMyr: Number(row.amount_myr) || 0,
    transactionDate: row.transaction_date,
    description: row.description || "",
    createdAt: row.created_at || new Date().toISOString(),
  };
}

// ─── Asset Purchases ──────────────────────────────────────────────────────────

export const loadAssetPurchases = async (workspaceId: string): Promise<AssetPurchase[]> => {
  if (!workspaceId) return [];

  if (useSupabase(workspaceId)) {
    const { data, error } = await supabase!.rpc("get_asset_purchases", { p_workspace_id: workspaceId });
    if (error || !data) return [];
    return (data as any[]).map(mapAssetRow);
  }

  // localStorage fallback
  try {
    const raw = localStorage.getItem(LS_ASSET_KEY(workspaceId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const addAssetPurchase = async (
  workspaceId: string,
  data: Omit<AssetPurchase, "id" | "workspaceId" | "createdAt">
): Promise<AssetPurchase> => {
  if (useSupabase(workspaceId)) {
    const { data: row, error } = await supabase!
      .from("asset_purchases")
      .insert({
        workspace_id: workspaceId,
        asset_name: data.assetName,
        category: data.category || null,
        purchase_amount_myr: data.purchaseAmountMyr,
        purchase_date: data.purchaseDate,
        vendor_name: data.vendorName || null,
        notes: data.notes || null,
      })
      .select()
      .single();
    if (error || !row) throw new Error(error?.message || "Failed to insert asset purchase");
    return mapAssetRow(row);
  }

  // localStorage fallback
  const newRecord: AssetPurchase = {
    id: crypto.randomUUID(),
    workspaceId,
    ...data,
    createdAt: new Date().toISOString(),
  };
  const existing = await loadAssetPurchases(workspaceId);
  localStorage.setItem(LS_ASSET_KEY(workspaceId), JSON.stringify([...existing, newRecord]));
  return newRecord;
};

export const updateAssetPurchase = async (
  workspaceId: string,
  id: string,
  data: Partial<AssetPurchase>
): Promise<AssetPurchase> => {
  if (useSupabase(workspaceId)) {
    const updatePayload: Record<string, any> = {};
    if (data.assetName !== undefined) updatePayload.asset_name = data.assetName;
    if (data.category !== undefined) updatePayload.category = data.category;
    if (data.purchaseAmountMyr !== undefined) updatePayload.purchase_amount_myr = data.purchaseAmountMyr;
    if (data.purchaseDate !== undefined) updatePayload.purchase_date = data.purchaseDate;
    if (data.vendorName !== undefined) updatePayload.vendor_name = data.vendorName;
    if (data.notes !== undefined) updatePayload.notes = data.notes;
    const { data: row, error } = await supabase!
      .from("asset_purchases")
      .update(updatePayload)
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .select()
      .single();
    if (error || !row) throw new Error(error?.message || "Failed to update asset purchase");
    return mapAssetRow(row);
  }

  // localStorage fallback
  const existing = await loadAssetPurchases(workspaceId);
  const idx = existing.findIndex((r) => r.id === id);
  if (idx === -1) throw new Error("Asset purchase not found");
  const updated = { ...existing[idx], ...data, id, workspaceId };
  existing[idx] = updated;
  localStorage.setItem(LS_ASSET_KEY(workspaceId), JSON.stringify(existing));
  return updated;
};

export const deleteAssetPurchase = async (workspaceId: string, id: string): Promise<void> => {
  if (useSupabase(workspaceId)) {
    await supabase!.from("asset_purchases").delete().eq("id", id).eq("workspace_id", workspaceId);
    return;
  }

  // localStorage fallback
  const existing = await loadAssetPurchases(workspaceId);
  localStorage.setItem(LS_ASSET_KEY(workspaceId), JSON.stringify(existing.filter((r) => r.id !== id)));
};

// ─── Owner Transactions ───────────────────────────────────────────────────────

export const loadOwnerTransactions = async (workspaceId: string): Promise<OwnerTransaction[]> => {
  if (!workspaceId) return [];

  if (useSupabase(workspaceId)) {
    const { data, error } = await supabase!.rpc("get_owner_transactions", { p_workspace_id: workspaceId });
    if (error || !data) return [];
    return (data as any[]).map(mapOwnerRow);
  }

  // localStorage fallback
  try {
    const raw = localStorage.getItem(LS_OWNER_KEY(workspaceId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const addOwnerTransaction = async (
  workspaceId: string,
  data: Omit<OwnerTransaction, "id" | "workspaceId" | "createdAt">
): Promise<OwnerTransaction> => {
  if (useSupabase(workspaceId)) {
    const { data: row, error } = await supabase!
      .from("owner_transactions")
      .insert({
        workspace_id: workspaceId,
        type: data.type,
        amount_myr: data.amountMyr,
        transaction_date: data.transactionDate,
        description: data.description || null,
      })
      .select()
      .single();
    if (error || !row) throw new Error(error?.message || "Failed to insert owner transaction");
    return mapOwnerRow(row);
  }

  // localStorage fallback
  const newRecord: OwnerTransaction = {
    id: crypto.randomUUID(),
    workspaceId,
    ...data,
    createdAt: new Date().toISOString(),
  };
  const existing = await loadOwnerTransactions(workspaceId);
  localStorage.setItem(LS_OWNER_KEY(workspaceId), JSON.stringify([...existing, newRecord]));
  return newRecord;
};

export const updateOwnerTransaction = async (
  workspaceId: string,
  id: string,
  data: Partial<OwnerTransaction>
): Promise<OwnerTransaction> => {
  if (useSupabase(workspaceId)) {
    const updatePayload: Record<string, any> = {};
    if (data.type !== undefined) updatePayload.type = data.type;
    if (data.amountMyr !== undefined) updatePayload.amount_myr = data.amountMyr;
    if (data.transactionDate !== undefined) updatePayload.transaction_date = data.transactionDate;
    if (data.description !== undefined) updatePayload.description = data.description;
    const { data: row, error } = await supabase!
      .from("owner_transactions")
      .update(updatePayload)
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .select()
      .single();
    if (error || !row) throw new Error(error?.message || "Failed to update owner transaction");
    return mapOwnerRow(row);
  }

  // localStorage fallback
  const existing = await loadOwnerTransactions(workspaceId);
  const idx = existing.findIndex((r) => r.id === id);
  if (idx === -1) throw new Error("Owner transaction not found");
  const updated = { ...existing[idx], ...data, id, workspaceId };
  existing[idx] = updated;
  localStorage.setItem(LS_OWNER_KEY(workspaceId), JSON.stringify(existing));
  return updated;
};

export const deleteOwnerTransaction = async (workspaceId: string, id: string): Promise<void> => {
  if (useSupabase(workspaceId)) {
    await supabase!.from("owner_transactions").delete().eq("id", id).eq("workspace_id", workspaceId);
    return;
  }

  // localStorage fallback
  const existing = await loadOwnerTransactions(workspaceId);
  localStorage.setItem(LS_OWNER_KEY(workspaceId), JSON.stringify(existing.filter((r) => r.id !== id)));
};
