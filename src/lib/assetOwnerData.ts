import { supabase, isSupabaseConfigured } from "./supabase";
import { isDemoWorkspace } from "./seeder";

export interface AssetPurchase {
  id: string;
  assetName: string;
  category: string;
  purchaseAmountMyr: number;
  purchaseDate: string;
  vendorName: string;
  notes: string;
}

export interface OwnerTransaction {
  id: string;
  type: "CAPITAL_INJECTION" | "DRAWING";
  amountMyr: number;
  transactionDate: string;
  description: string;
}

const canPersist = (workspaceId: string | undefined, isMockUser: boolean): workspaceId is string =>
  Boolean(workspaceId) && isSupabaseConfigured() && !isMockUser && !!supabase && !isDemoWorkspace(workspaceId as string);

export const loadAssetPurchases = async (
  workspaceId: string | undefined,
  isMockUser: boolean
): Promise<AssetPurchase[]> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return [];
  const { data, error } = await supabase
    .from("asset_purchases")
    .select("id,asset_name,category,purchase_amount_myr,purchase_date,vendor_name,notes")
    .eq("workspace_id", workspaceId)
    .order("purchase_date", { ascending: false });
  if (error || !data) return [];
  return data.map((row: any) => ({
    id: row.id,
    assetName: row.asset_name,
    category: row.category || "",
    purchaseAmountMyr: Number(row.purchase_amount_myr) || 0,
    purchaseDate: row.purchase_date,
    vendorName: row.vendor_name || "",
    notes: row.notes || "",
  }));
};

export const addAssetPurchase = async (
  workspaceId: string | undefined,
  isMockUser: boolean,
  asset: Omit<AssetPurchase, "id">
): Promise<void> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return;
  await supabase.from("asset_purchases").insert({
    workspace_id: workspaceId,
    asset_name: asset.assetName,
    category: asset.category || null,
    purchase_amount_myr: asset.purchaseAmountMyr,
    purchase_date: asset.purchaseDate,
    vendor_name: asset.vendorName || null,
    notes: asset.notes || null,
  });
};

export const deleteAssetPurchase = async (
  workspaceId: string | undefined,
  isMockUser: boolean,
  id: string
): Promise<void> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return;
  await supabase.from("asset_purchases").delete().eq("id", id).eq("workspace_id", workspaceId);
};

export const loadOwnerTransactions = async (
  workspaceId: string | undefined,
  isMockUser: boolean
): Promise<OwnerTransaction[]> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return [];
  const { data, error } = await supabase
    .from("owner_transactions")
    .select("id,type,amount_myr,transaction_date,description")
    .eq("workspace_id", workspaceId)
    .order("transaction_date", { ascending: false });
  if (error || !data) return [];
  return data.map((row: any) => ({
    id: row.id,
    type: row.type,
    amountMyr: Number(row.amount_myr) || 0,
    transactionDate: row.transaction_date,
    description: row.description || "",
  }));
};

export const addOwnerTransaction = async (
  workspaceId: string | undefined,
  isMockUser: boolean,
  txn: Omit<OwnerTransaction, "id">
): Promise<void> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return;
  await supabase.from("owner_transactions").insert({
    workspace_id: workspaceId,
    type: txn.type,
    amount_myr: txn.amountMyr,
    transaction_date: txn.transactionDate,
    description: txn.description || null,
  });
};

export const deleteOwnerTransaction = async (
  workspaceId: string | undefined,
  isMockUser: boolean,
  id: string
): Promise<void> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return;
  await supabase.from("owner_transactions").delete().eq("id", id).eq("workspace_id", workspaceId);
};
