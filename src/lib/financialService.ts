import { supabase, isSupabaseConfigured } from "./supabase";

export interface DashboardSummary {
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
}

export async function getDashboardSummary(
  workspaceId: string
): Promise<{ data: DashboardSummary | null; error: string | null }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { data: null, error: null };
  }

  try {
    const [incomeRes, expenseRes] = await Promise.all([
      supabase
        .from("income_records")
        .select("amount_myr")
        .eq("workspace_id", workspaceId),
      supabase
        .from("expense_records")
        .select("amount_myr")
        .eq("workspace_id", workspaceId),
    ]);

    if (incomeRes.error) throw incomeRes.error;
    if (expenseRes.error) throw expenseRes.error;

    const totalIncome = (incomeRes.data ?? []).reduce(
      (sum, r) => sum + (r.amount_myr ?? 0),
      0
    );
    const totalExpense = (expenseRes.data ?? []).reduce(
      (sum, r) => sum + (r.amount_myr ?? 0),
      0
    );

    return {
      data: {
        totalIncome,
        totalExpense,
        netBalance: totalIncome - totalExpense,
      },
      error: null,
    };
  } catch (err: any) {
    return { data: null, error: err?.message ?? String(err) };
  }
}
