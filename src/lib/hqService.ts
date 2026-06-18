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

  const [{ data: tenants, error: tenantsErr }, { data: subs }, { data: plans }, { data: profiles }, { data: aiUsageRows }, { data: storageRows }] = await Promise.all([
    supabase.from("tenants").select("*").eq("category", "USER"),
    supabase.from("tenant_subscriptions").select("*"),
    supabase.from("subscription_plans").select("*"),
    supabase.from("profiles").select("*"),
    supabase.rpc("get_hq_ai_usage_all"),
    supabase.rpc("get_all_workspaces_storage_usage"),
  ]);
  if (tenantsErr || !tenants) return [];

  const planById = new Map((plans || []).map((p: any) => [p.id, p]));
  const subByTenant = new Map((subs || []).map((s: any) => [s.tenant_id, s]));
  const ownerByTenant = new Map(
    (profiles || [])
      .filter((p: any) => p.role === "TENANT_OWNER")
      .map((p: any) => [p.tenant_id, p])
  );
  const aiUsageByTenant = new Map<string, number>((aiUsageRows || []).map((r: any) => [r.tenant_id, Number(r.usage_count) || 0]));
  const storageBytesByTenant = new Map<string, number>();
  (storageRows || []).forEach((r: any) => {
    storageBytesByTenant.set(r.tenant_id, (storageBytesByTenant.get(r.tenant_id) || 0) + Number(r.total_bytes || 0));
  });

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
      aiUsage: aiUsageByTenant.get(t.id) || 0,
      storageGB: (storageBytesByTenant.get(t.id) || 0) / (1024 * 1024 * 1024),
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

// --- Storage freeze/inactivity state (real, server-enforced) ---

export interface TenantStorageState {
  tenantId: string;
  isFrozen: boolean;
  frozenReason: string;
  lastActiveAt: string;
  inactiveDaysLimit: number;
}

export async function getStorageFreezeStates(): Promise<TenantStorageState[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase.from("workspace_storage_state").select("*");
  if (error || !data) return [];
  return data.map((row: any) => ({
    tenantId: row.tenant_id,
    isFrozen: row.is_frozen,
    frozenReason: row.frozen_reason || "",
    lastActiveAt: row.last_active_at,
    inactiveDaysLimit: row.inactive_days_limit,
  }));
}

export async function setTenantFrozen(tenantId: string, isFrozen: boolean, reason: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { error } = await supabase.rpc("set_tenant_frozen", { p_tenant_id: tenantId, p_is_frozen: isFrozen, p_reason: reason });
  return !error;
}

// --- AI Router ---

export interface AiRouterSettings {
  strategy: "cheapest" | "balanced" | "quality" | "custom";
  usdMyr: number;
  planRoutes: { planId: string; providerId: string; modelId: string }[];
}

export interface AiProviderStatus {
  provider: string;
  enabled: boolean;
  selectedModel: string | null;
  hasKey: boolean;
}

export async function getAiRouterSettings(): Promise<AiRouterSettings | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase.from("ai_router_settings").select("*").eq("id", "global").maybeSingle();
  if (error || !data) return null;
  return {
    strategy: data.strategy,
    usdMyr: Number(data.usd_myr) || 4.45,
    planRoutes: data.plan_routes || [],
  };
}

export async function saveAiRouterSettings(settings: AiRouterSettings): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { error } = await supabase.from("ai_router_settings").update({
    strategy: settings.strategy,
    usd_myr: settings.usdMyr,
    plan_routes: settings.planRoutes,
    updated_at: new Date().toISOString(),
  }).eq("id", "global");
  return !error;
}

export async function getAiProviderStatuses(): Promise<AiProviderStatus[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase.rpc("get_ai_provider_status");
  if (error || !data) return [];
  return data.map((row: any) => ({
    provider: row.provider,
    enabled: row.enabled,
    selectedModel: row.selected_model,
    hasKey: row.has_key,
  }));
}

export async function upsertAiProviderConfig(provider: string, enabled: boolean, apiKey: string | null, selectedModel: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { error } = await supabase.rpc("upsert_ai_provider_config", {
    p_provider: provider,
    p_enabled: enabled,
    p_api_key: apiKey,
    p_selected_model: selectedModel,
  });
  return !error;
}
