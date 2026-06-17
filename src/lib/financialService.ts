import { supabase, isSupabaseConfigured } from "./supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IncomeRecord {
  id: string;
  workspace_id: string;
  category_id: string;
  source_bank_account_id: string | null;
  source_cash_account_id: string | null;
  payer_name: string | null;
  amount_myr: number;
  transaction_date: string;
  reference_number: string | null;
  description: string | null;
  created_at: string;
}

export interface ExpenseRecord {
  id: string;
  workspace_id: string;
  category_id: string;
  payment_bank_account_id: string | null;
  payment_cash_account_id: string | null;
  recipient_vendor_name: string | null;
  amount_myr: number;
  tax_amount_myr: number;
  transaction_date: string;
  reference_number: string | null;
  description: string | null;
  created_at: string;
}

export interface CreateIncomeInput {
  workspace_id: string;
  category_id: string;
  payer_name?: string;
  amount_myr: number;
  transaction_date: string;
  reference_number?: string;
  description?: string;
  source_bank_account_id?: string;
  source_cash_account_id?: string;
}

export interface CreateExpenseInput {
  workspace_id: string;
  category_id: string;
  recipient_vendor_name?: string;
  amount_myr: number;
  tax_amount_myr?: number;
  transaction_date: string;
  reference_number?: string;
  description?: string;
  payment_bank_account_id?: string;
  payment_cash_account_id?: string;
}

export interface DashboardSummary {
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
  incomeCount: number;
  expenseCount: number;
}

export interface ServiceResult<T> {
  data: T | null;
  error: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function notConfigured<T>(): ServiceResult<T> {
  return { data: null, error: "Supabase tidak dikonfigurasi. Sila semak VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY." };
}

// ─── Income ───────────────────────────────────────────────────────────────────

export async function getIncomeRecords(workspaceId: string): Promise<ServiceResult<IncomeRecord[]>> {
  if (!supabase) return notConfigured();

  const { data, error } = await supabase
    .from("income_records")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("transaction_date", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: data as IncomeRecord[], error: null };
}

export async function createIncomeRecord(input: CreateIncomeInput): Promise<ServiceResult<IncomeRecord>> {
  if (!supabase) return notConfigured();

  const { data, error } = await supabase
    .from("income_records")
    .insert(input)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as IncomeRecord, error: null };
}

// ─── Expense ──────────────────────────────────────────────────────────────────

export async function getExpenseRecords(workspaceId: string): Promise<ServiceResult<ExpenseRecord[]>> {
  if (!supabase) return notConfigured();

  const { data, error } = await supabase
    .from("expense_records")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("transaction_date", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: data as ExpenseRecord[], error: null };
}

export async function createExpenseRecord(input: CreateExpenseInput): Promise<ServiceResult<ExpenseRecord>> {
  if (!supabase) return notConfigured();

  const payload = {
    ...input,
    tax_amount_myr: input.tax_amount_myr ?? 0,
  };

  const { data, error } = await supabase
    .from("expense_records")
    .insert(payload)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as ExpenseRecord, error: null };
}

// ─── Dashboard Summary ────────────────────────────────────────────────────────

export async function getDashboardSummary(workspaceId: string): Promise<ServiceResult<DashboardSummary>> {
  if (!isSupabaseConfigured() || !supabase) return notConfigured();

  const [incomeResult, expenseResult] = await Promise.all([
    supabase
      .from("income_records")
      .select("amount_myr")
      .eq("workspace_id", workspaceId),
    supabase
      .from("expense_records")
      .select("amount_myr")
      .eq("workspace_id", workspaceId),
  ]);

  if (incomeResult.error) return { data: null, error: incomeResult.error.message };
  if (expenseResult.error) return { data: null, error: expenseResult.error.message };

  const totalIncome = (incomeResult.data ?? []).reduce((sum, r) => sum + Number(r.amount_myr), 0);
  const totalExpense = (expenseResult.data ?? []).reduce((sum, r) => sum + Number(r.amount_myr), 0);

  return {
    data: {
      totalIncome,
      totalExpense,
      netBalance: totalIncome - totalExpense,
      incomeCount: incomeResult.data?.length ?? 0,
      expenseCount: expenseResult.data?.length ?? 0,
    },
    error: null,
  };
}
