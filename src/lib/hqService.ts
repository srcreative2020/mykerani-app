import { supabase, isSupabaseConfigured } from "./supabase";

export interface HqPlan {
  id: string;
  name: string;
  price: number;
  aiCredits: number;
  storageGB: number;
  maxUsers: number;
  featured?: boolean;
}

export interface HqCustomer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  plan: string;
  status: "active" | "suspended" | "pending";
  renewal: string;
  aiUsage: number;
  storageGB: number;
  attention: boolean;
  mrr: number;
  joinedAt: string;
  notes?: string;
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("ms-MY", { day: "numeric", month: "short", year: "numeric" });
}

export async function getPlans(): Promise<HqPlan[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase.from("subscription_plans").select("*").order("monthly_price_myr", { ascending: true });
  if (error || !data) return [];
  return data.map((row: any) => ({
    id: row.id,
    name: row.name,
    price: Number(row.monthly_price_myr) || 0,
    aiCredits: Number(row.ai_credits_allowance) || 0,
    storageGB: Math.round((Number(row.storage_credits_allowance_mb) || 0) / 1024),
    maxUsers: row.features?.maxUsers ?? 3,
    featured: row.features?.featured ?? false,
  }));
}

export async function createPlan(plan: Omit<HqPlan, "id">): Promise<HqPlan | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase.from("subscription_plans").insert({
    name: plan.name,
    monthly_price_myr: plan.price,
    annual_price_myr: plan.price * 12,
    ai_credits_allowance: plan.aiCredits,
    storage_credits_allowance_mb: plan.storageGB * 1024,
    features: { maxUsers: plan.maxUsers, featured: plan.featured ?? false },
  }).select().single();
  if (error || !data) return null;
  return { id: data.id, name: data.name, price: plan.price, aiCredits: plan.aiCredits, storageGB: plan.storageGB, maxUsers: plan.maxUsers, featured: plan.featured };
}

export async function updatePlan(id: string, plan: Omit<HqPlan, "id">): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { error } = await supabase.from("subscription_plans").update({
    name: plan.name,
    monthly_price_myr: plan.price,
    annual_price_myr: plan.price * 12,
    ai_credits_allowance: plan.aiCredits,
    storage_credits_allowance_mb: plan.storageGB * 1024,
    features: { maxUsers: plan.maxUsers, featured: plan.featured ?? false },
  }).eq("id", id);
  return !error;
}

export async function deletePlan(id: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { error } = await supabase.from("subscription_plans").delete().eq("id", id);
  return !error;
}

export async function getCustomers(): Promise<HqCustomer[]> {
  if (!isSupabaseConfigured() || !supabase) return [];

  const [{ data: tenants, error: tenantsErr }, { data: subs }, { data: plans }, { data: profiles }] = await Promise.all([
    supabase.from("tenants").select("*").eq("category", "USER"),
    supabase.from("tenant_subscriptions").select("*"),
    supabase.from("subscription_plans").select("*"),
    supabase.from("profiles").select("*"),
  ]);
  if (tenantsErr || !tenants) return [];

  const planById = new Map((plans || []).map((p: any) => [p.id, p]));
  const subByTenant = new Map((subs || []).map((s: any) => [s.tenant_id, s]));
  const ownerByTenant = new Map(
    (profiles || [])
      .filter((p: any) => p.role === "TENANT_OWNER")
      .map((p: any) => [p.tenant_id, p])
  );

  return tenants.map((t: any) => {
    const sub = subByTenant.get(t.id);
    const plan = sub ? planById.get(sub.plan_id) : null;
    const owner = ownerByTenant.get(t.id);
    const status: HqCustomer["status"] = sub?.status === "active" ? "active" : sub?.status === "trialing" ? "pending" : sub?.status ? "suspended" : "pending";
    return {
      id: t.id,
      name: t.name,
      email: owner?.email || "",
      phone: "",
      plan: plan?.name || "",
      status,
      renewal: fmtDate(sub?.current_period_end),
      aiUsage: 0,
      storageGB: 0,
      attention: false,
      mrr: status === "active" ? Number(plan?.monthly_price_myr) || 0 : 0,
      joinedAt: t.created_at ? t.created_at.split("T")[0] : "",
      notes: "",
    };
  });
}

export async function createCustomerTenant(name: string): Promise<{ id: string } | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase.from("tenants").insert({ name, category: "USER" }).select().single();
  if (error || !data) return null;
  return { id: data.id };
}

export async function deleteCustomerTenant(id: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { error } = await supabase.from("tenants").delete().eq("id", id);
  return !error;
}

export async function upsertCustomerSubscription(tenantId: string, planName: string, status: HqCustomer["status"], plans: HqPlan[]): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const plan = plans.find(p => p.name === planName);
  if (!plan) return false;
  const dbStatus = status === "active" ? "active" : status === "pending" ? "trialing" : "suspended";
  const { data: existing } = await supabase.from("tenant_subscriptions").select("id").eq("tenant_id", tenantId).maybeSingle();
  if (existing) {
    const { error } = await supabase.from("tenant_subscriptions").update({ plan_id: plan.id, status: dbStatus }).eq("id", existing.id);
    return !error;
  }
  const periodEnd = new Date(Date.now() + 30 * 86400000).toISOString();
  const { error } = await supabase.from("tenant_subscriptions").insert({
    tenant_id: tenantId, plan_id: plan.id, status: dbStatus,
    current_period_start: new Date().toISOString(), current_period_end: periodEnd,
  });
  return !error;
}

export async function setCustomerStatus(tenantId: string, status: HqCustomer["status"]): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const dbStatus = status === "active" ? "active" : status === "pending" ? "trialing" : "suspended";
  const { error } = await supabase.from("tenant_subscriptions").update({ status: dbStatus }).eq("tenant_id", tenantId);
  return !error;
}
