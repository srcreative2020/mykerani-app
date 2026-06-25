import { supabase, isSupabaseConfigured, getAuthHeader } from "./supabase";

export type ResourceCreditType = "AI" | "OCR" | "STORAGE" | "NOTIFICATION";

export interface TenantPaymentTransaction {
  id: string;
  planName: string | null;
  amountMyr: number;
  method: "chip_asia" | "manual";
  status: "pending" | "approved" | "rejected" | "success" | "failed";
  slipPath: string | null;
  chipAsiaReference: string | null;
  createdAt: string;
  reviewedAt: string | null;
  kind: "plan_subscription" | "addon";
  addonLabel: string | null;
  addonCreditType: ResourceCreditType | null;
  addonCreditAmount: number | null;
}

export async function getTenantPaymentTransactions(tenantId: string): Promise<TenantPaymentTransaction[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase.rpc("get_payment_transactions_for_tenant", { p_tenant_id: tenantId });
  if (error || !data) return [];
  return data.map((row: any) => ({
    id: row.id,
    planName: row.plan_name,
    amountMyr: Number(row.amount_myr) || 0,
    method: row.method,
    status: row.status,
    slipPath: row.slip_path,
    chipAsiaReference: row.chip_asia_reference,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    kind: row.kind,
    addonLabel: row.addon_label,
    addonCreditType: row.addon_credit_type,
    addonCreditAmount: row.addon_credit_amount != null ? Number(row.addon_credit_amount) : null,
  }));
}

// Manual payment: upload the bank transfer slip, then create a pending transaction for HQ to approve.
export async function submitManualPayment(
  tenantId: string,
  planId: string,
  amountMyr: number,
  slipFile: File
): Promise<{ id: string | null; error: string | null }> {
  if (!isSupabaseConfigured() || !supabase) return { id: null, error: "Supabase tidak dikonfigurasi." };

  const ext = slipFile.name.split(".").pop() ?? "bin";
  const path = `${tenantId}/${Date.now()}_slip.${ext}`;

  const { error: upErr } = await supabase.storage.from("payment-slips").upload(path, slipFile, { upsert: false });
  if (upErr) return { id: null, error: upErr.message };

  const { data, error } = await supabase.rpc("create_payment_transaction", {
    p_tenant_id: tenantId,
    p_plan_id: planId,
    p_amount_myr: amountMyr,
    p_method: "manual",
    p_slip_path: path,
  });

  if (error) {
    await supabase.storage.from("payment-slips").remove([path]);
    return { id: null, error: error.message };
  }

  return { id: data as string, error: null };
}

// Trial: self-activate the free TRIAL plan once for this tenant, bypassing Chip Asia / manual approval.
export async function startTrialSubscription(tenantId: string): Promise<{ success: boolean; error: string | null }> {
  if (!isSupabaseConfigured() || !supabase) return { success: false, error: "Supabase tidak dikonfigurasi." };
  const { data, error } = await supabase.rpc("start_trial_subscription", { p_tenant_id: tenantId });
  if (error) return { success: false, error: error.message };
  return { success: Boolean(data), error: data ? null : "Percubaan percuma sudah digunakan atau tidak tersedia." };
}

// Chip Asia: create a pending transaction, then hand off to the server route which talks to Chip Asia
// and calls finalize_chip_asia_transaction() once the gateway confirms the result.
export async function initiateChipAsiaPayment(
  tenantId: string,
  planId: string,
  amountMyr: number
): Promise<{ id: string | null; checkoutUrl: string | null; error: string | null }> {
  if (!isSupabaseConfigured() || !supabase) return { id: null, checkoutUrl: null, error: "Supabase tidak dikonfigurasi." };

  const { data, error } = await supabase.rpc("create_payment_transaction", {
    p_tenant_id: tenantId,
    p_plan_id: planId,
    p_amount_myr: amountMyr,
    p_method: "chip_asia",
    p_slip_path: null,
  });
  if (error) return { id: null, checkoutUrl: null, error: error.message };

  const res = await fetch("/api/payments/chip-asia/init", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
    body: JSON.stringify({ transactionId: data, tenantId, planId, amountMyr }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { id: null, checkoutUrl: null, error: body.error || "Gagal memulakan pembayaran Chip Asia." };
  }
  const body = await res.json();
  return { id: data as string, checkoutUrl: body.checkoutUrl || null, error: null };
}

// Addon/top-up purchase (storage, AI credits, OCR credits) — manual slip rail.
// Mirrors submitManualPayment(), but calls create_addon_purchase() instead of
// create_payment_transaction() since there is no plan_id involved.
export async function purchaseAddonManual(
  tenantId: string,
  workspaceId: string,
  creditType: ResourceCreditType,
  creditAmount: number,
  amountMyr: number,
  label: string,
  slipFile: File
): Promise<{ id: string | null; error: string | null }> {
  if (!isSupabaseConfigured() || !supabase) return { id: null, error: "Supabase tidak dikonfigurasi." };

  const ext = slipFile.name.split(".").pop() ?? "bin";
  const path = `${tenantId}/${Date.now()}_addon_slip.${ext}`;

  const { error: upErr } = await supabase.storage.from("payment-slips").upload(path, slipFile, { upsert: false });
  if (upErr) return { id: null, error: upErr.message };

  const { data, error } = await supabase.rpc("create_addon_purchase", {
    p_tenant_id: tenantId,
    p_workspace_id: workspaceId,
    p_credit_type: creditType,
    p_credit_amount: creditAmount,
    p_amount_myr: amountMyr,
    p_label: label,
    p_method: "manual",
    p_slip_path: path,
  });

  if (error) {
    await supabase.storage.from("payment-slips").remove([path]);
    return { id: null, error: error.message };
  }

  return { id: data as string, error: null };
}

// Addon/top-up purchase — Chip Asia rail. Mirrors initiateChipAsiaPayment().
export async function purchaseAddonChipAsia(
  tenantId: string,
  workspaceId: string,
  creditType: ResourceCreditType,
  creditAmount: number,
  amountMyr: number,
  label: string
): Promise<{ id: string | null; checkoutUrl: string | null; error: string | null }> {
  if (!isSupabaseConfigured() || !supabase) return { id: null, checkoutUrl: null, error: "Supabase tidak dikonfigurasi." };

  const { data, error } = await supabase.rpc("create_addon_purchase", {
    p_tenant_id: tenantId,
    p_workspace_id: workspaceId,
    p_credit_type: creditType,
    p_credit_amount: creditAmount,
    p_amount_myr: amountMyr,
    p_label: label,
    p_method: "chip_asia",
    p_slip_path: null,
  });
  if (error) return { id: null, checkoutUrl: null, error: error.message };

  const res = await fetch("/api/payments/chip-asia/init", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
    body: JSON.stringify({ transactionId: data, tenantId, amountMyr, addonLabel: label }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { id: null, checkoutUrl: null, error: body.error || "Gagal memulakan pembayaran Chip Asia." };
  }
  const body = await res.json();
  return { id: data as string, checkoutUrl: body.checkoutUrl || null, error: null };
}
