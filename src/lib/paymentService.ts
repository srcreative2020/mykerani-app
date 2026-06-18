import { supabase, isSupabaseConfigured } from "./supabase";

export interface TenantPaymentTransaction {
  id: string;
  planName: string;
  amountMyr: number;
  method: "chip_asia" | "manual";
  status: "pending" | "approved" | "rejected" | "success" | "failed";
  slipPath: string | null;
  chipAsiaReference: string | null;
  createdAt: string;
  reviewedAt: string | null;
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transactionId: data, tenantId, planId, amountMyr }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { id: null, checkoutUrl: null, error: body.error || "Gagal memulakan pembayaran Chip Asia." };
  }
  const body = await res.json();
  return { id: data as string, checkoutUrl: body.checkoutUrl || null, error: null };
}
