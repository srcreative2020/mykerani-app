import { supabase, isSupabaseConfigured } from "./supabase";

export interface HqPlan {
  id: string;
  name: string;
  price: number;
  aiCredits: number;
  ocrCredits: number;
  storageGB: number;
  maxUsers: number;
  featured?: boolean;
  features: string[];
  limitations: string[];
  isTrial: boolean;
  trialDays: number;
  isCustomPricing: boolean;
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
  totalPaidMyr: number;
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
    ocrCredits: Number(row.ocr_credits_allowance) || 0,
    storageGB: Math.round((Number(row.storage_credits_allowance_mb) || 0) / 1024),
    maxUsers: row.features?.maxUsers ?? 3,
    featured: row.features?.featured ?? false,
    features: row.features?.featureList ?? [],
    limitations: row.features?.limitations ?? [],
    isTrial: row.features?.isTrial ?? false,
    trialDays: row.features?.trialDays ?? 0,
    isCustomPricing: row.features?.isCustomPricing ?? false,
  }));
}

function buildFeaturesJson(plan: Omit<HqPlan, "id">) {
  return {
    maxUsers: plan.maxUsers,
    featured: plan.featured ?? false,
    featureList: plan.features ?? [],
    limitations: plan.limitations ?? [],
    isTrial: plan.isTrial ?? false,
    trialDays: plan.trialDays ?? 0,
    isCustomPricing: plan.isCustomPricing ?? false,
  };
}

export async function createPlan(plan: Omit<HqPlan, "id">): Promise<HqPlan | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase.from("subscription_plans").insert({
    name: plan.name,
    monthly_price_myr: plan.price,
    annual_price_myr: plan.price * 12,
    ai_credits_allowance: plan.aiCredits,
    ocr_credits_allowance: plan.ocrCredits,
    storage_credits_allowance_mb: plan.storageGB * 1024,
    features: buildFeaturesJson(plan),
  }).select().single();
  if (error || !data) return null;
  return { id: data.id, ...plan };
}

export async function updatePlan(id: string, plan: Omit<HqPlan, "id">): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { error } = await supabase.from("subscription_plans").update({
    name: plan.name,
    monthly_price_myr: plan.price,
    annual_price_myr: plan.price * 12,
    ai_credits_allowance: plan.aiCredits,
    ocr_credits_allowance: plan.ocrCredits,
    storage_credits_allowance_mb: plan.storageGB * 1024,
    features: buildFeaturesJson(plan),
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

  const [{ data: tenants, error: tenantsErr }, { data: subs }, { data: plans }, { data: profiles }, { data: aiUsageRows }, { data: storageRows }, { data: paidRows }] = await Promise.all([
    supabase.from("tenants").select("*").eq("category", "USER"),
    supabase.from("tenant_subscriptions").select("*"),
    supabase.from("subscription_plans").select("*"),
    supabase.from("profiles").select("*"),
    supabase.rpc("get_hq_ai_usage_all"),
    supabase.rpc("get_all_workspaces_storage_usage"),
    supabase.rpc("get_payment_totals_by_tenant"),
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
  const totalPaidByTenant = new Map<string, number>((paidRows || []).map((r: any) => [r.tenant_id, Number(r.total_paid_myr) || 0]));

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
      totalPaidMyr: totalPaidByTenant.get(t.id) || 0,
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
  const { data, error } = await supabase.rpc("change_subscription_plan", {
    p_tenant_id: tenantId, p_new_plan_id: plan.id, p_status: dbStatus,
  });
  return !error && data === true;
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

// --- Per-user AI usage + suspension (real, server-enforced) ---

export interface HqUserUsage {
  userId: string;
  email: string;
  fullName: string;
  role: string;
  tenantId: string;
  tenantName: string;
  aiUsageCount: number;
  isSuspended: boolean;
}

export async function getUserUsage(): Promise<HqUserUsage[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase.rpc("get_hq_user_usage");
  if (error || !data) return [];
  return data.map((row: any) => ({
    userId: row.user_id,
    email: row.email || "",
    fullName: row.full_name || "",
    role: row.role || "",
    tenantId: row.tenant_id || "",
    tenantName: row.tenant_name || "",
    aiUsageCount: Number(row.ai_usage_count) || 0,
    isSuspended: Boolean(row.is_suspended),
  }));
}

export async function setUserSuspended(userId: string, suspended: boolean): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { error } = await supabase.rpc("set_user_suspended", { p_user_id: userId, p_suspended: suspended });
  return !error;
}

export interface HqUsageByFeature {
  feature: string;
  usageCount: number;
}

export async function getUsageByFeature(): Promise<HqUsageByFeature[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase.rpc("get_hq_usage_by_feature");
  if (error || !data) return [];
  return data.map((row: any) => ({ feature: row.feature, usageCount: Number(row.usage_count) || 0 }));
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

// --- Payment gateway (Chip Asia + manual) & approval workflow ---

export interface PaymentGatewaySettings {
  chipAsiaEnabled: boolean;
  chipAsiaApiKey: string;
  chipAsiaSecretKey: string;
  chipAsiaBrandId: string;
  manualPaymentEnabled: boolean;
}

export async function getPaymentGatewaySettings(): Promise<PaymentGatewaySettings | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase.from("payment_gateway_settings").select("*").eq("id", "global").maybeSingle();
  if (error || !data) return null;
  return {
    chipAsiaEnabled: Boolean(data.chip_asia_enabled),
    chipAsiaApiKey: data.chip_asia_api_key || "",
    chipAsiaSecretKey: data.chip_asia_secret_key || "",
    chipAsiaBrandId: data.chip_asia_brand_id || "",
    manualPaymentEnabled: Boolean(data.manual_payment_enabled),
  };
}

export async function savePaymentGatewaySettings(settings: PaymentGatewaySettings): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { error } = await supabase.from("payment_gateway_settings").update({
    chip_asia_enabled: settings.chipAsiaEnabled,
    chip_asia_api_key: settings.chipAsiaApiKey || null,
    chip_asia_secret_key: settings.chipAsiaSecretKey || null,
    chip_asia_brand_id: settings.chipAsiaBrandId || null,
    manual_payment_enabled: settings.manualPaymentEnabled,
    updated_at: new Date().toISOString(),
  }).eq("id", "global");
  return !error;
}

export interface PendingPaymentApproval {
  id: string;
  tenantId: string;
  tenantName: string;
  planId: string;
  planName: string;
  amountMyr: number;
  method: "chip_asia" | "manual";
  slipPath: string | null;
  submittedByName: string;
  submittedByEmail: string;
  createdAt: string;
}

export async function getPendingPaymentApprovals(): Promise<PendingPaymentApproval[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase.rpc("get_pending_payment_approvals");
  if (error || !data) return [];
  return data.map((row: any) => ({
    id: row.id,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    planId: row.plan_id,
    planName: row.plan_name,
    amountMyr: Number(row.amount_myr) || 0,
    method: row.method,
    slipPath: row.slip_path,
    submittedByName: row.submitted_by_name || "",
    submittedByEmail: row.submitted_by_email || "",
    createdAt: row.created_at,
  }));
}

export async function reviewPaymentTransaction(transactionId: string, approve: boolean): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { data, error } = await supabase.rpc("review_payment_transaction", {
    p_transaction_id: transactionId,
    p_approve: approve,
  });
  return !error && Boolean(data);
}

export async function getPaymentSlipUrl(path: string): Promise<string | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase.storage.from("payment-slips").createSignedUrl(path, 3600);
  return error ? null : data.signedUrl;
}

// --- Security Foundation: webhook shadow-mode log + enforcement flag ---

export interface PaymentWebhookEvent {
  id: string;
  transactionReference: string | null;
  verificationResult: "verified" | "failed" | "skipped_no_key" | "skipped_no_signature";
  wouldHaveBlocked: boolean;
  enforced: boolean;
  createdAt: string;
}

export async function getRecentPaymentWebhookEvents(limit = 20): Promise<PaymentWebhookEvent[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("payment_webhook_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((row: any) => ({
    id: row.id,
    transactionReference: row.transaction_reference,
    verificationResult: row.verification_result,
    wouldHaveBlocked: Boolean(row.would_have_blocked),
    enforced: Boolean(row.enforced),
    createdAt: row.created_at,
  }));
}

export async function getWebhookEnforceFlag(): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { data, error } = await supabase
    .from("hq_feature_flags")
    .select("enabled")
    .eq("key", "chip_asia_webhook_enforce")
    .maybeSingle();
  if (error || !data) return false;
  return Boolean(data.enabled);
}

export async function setWebhookEnforceFlag(enabled: boolean): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { error } = await supabase
    .from("hq_feature_flags")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("key", "chip_asia_webhook_enforce");
  return !error;
}

// --- AI Cost Governance ---

export interface AiCostRate {
  provider: string;
  model: string;
  costPerCallUsd: number;
}

export async function getAiCostRates(): Promise<AiCostRate[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase.from("ai_cost_rates").select("*");
  if (error || !data) return [];
  return data.map((row: any) => ({ provider: row.provider, model: row.model, costPerCallUsd: Number(row.cost_per_call_usd) || 0 }));
}

export async function upsertAiCostRate(provider: string, model: string, costPerCallUsd: number): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { error } = await supabase.from("ai_cost_rates").upsert({
    provider, model, cost_per_call_usd: costPerCallUsd, updated_at: new Date().toISOString(),
  });
  return !error;
}

export interface AiCostSummaryRow {
  tenantId: string;
  tenantName: string;
  provider: string;
  totalCalls: number;
  totalCostUsd: number;
}

export async function getAiCostSummary(): Promise<AiCostSummaryRow[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase.rpc("get_hq_ai_cost_summary");
  if (error || !data) return [];
  return data.map((row: any) => ({
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    provider: row.provider,
    totalCalls: Number(row.total_calls) || 0,
    totalCostUsd: Number(row.total_cost_usd) || 0,
  }));
}

// --- Public marketing site CMS (HQ-editable, publicly readable) ---

export interface SiteSettings {
  companyName: string;
  logoUrl: string;
  heroHeadline: string;
  heroSubheadline: string;
  contactEmail: string;
  contactPhone: string;
  contactWhatsapp: string;
  contactAddress: string;
  businessHours: string;
  socialLinks: Record<string, string>;
  demoVideoUrl: string;
}

export async function getSiteSettings(): Promise<SiteSettings | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase.from("site_settings").select("*").eq("id", "global").maybeSingle();
  if (error || !data) return null;
  return {
    companyName: data.company_name || "MyKerani",
    logoUrl: data.logo_url || "",
    heroHeadline: data.hero_headline || "",
    heroSubheadline: data.hero_subheadline || "",
    contactEmail: data.contact_email || "",
    contactPhone: data.contact_phone || "",
    contactWhatsapp: data.contact_whatsapp || "",
    contactAddress: data.contact_address || "",
    businessHours: data.business_hours || "",
    socialLinks: data.social_links || {},
    demoVideoUrl: data.demo_video_url || "",
  };
}

export async function uploadSiteLogo(file: File): Promise<string | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const ext = file.name.split(".").pop() || "png";
  const path = `logo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("site-assets").upload(path, file, { upsert: true });
  if (error) return null;
  const { data } = supabase.storage.from("site-assets").getPublicUrl(path);
  return data.publicUrl;
}

export async function saveSiteSettings(settings: SiteSettings): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { error } = await supabase.from("site_settings").update({
    company_name: settings.companyName,
    logo_url: settings.logoUrl || null,
    hero_headline: settings.heroHeadline,
    hero_subheadline: settings.heroSubheadline,
    contact_email: settings.contactEmail || null,
    contact_phone: settings.contactPhone || null,
    contact_whatsapp: settings.contactWhatsapp || null,
    contact_address: settings.contactAddress || null,
    business_hours: settings.businessHours || null,
    social_links: settings.socialLinks || {},
    demo_video_url: settings.demoVideoUrl || null,
    updated_at: new Date().toISOString(),
  }).eq("id", "global");
  return !error;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
  isPublished: boolean;
}

export async function getFaqItems(includeUnpublished = false): Promise<FaqItem[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  let query = supabase.from("faq_items").select("*").order("sort_order", { ascending: true });
  if (!includeUnpublished) query = query.eq("is_published", true);
  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((row: any) => ({
    id: row.id, question: row.question, answer: row.answer,
    sortOrder: row.sort_order, isPublished: row.is_published,
  }));
}

export async function createFaqItem(item: Omit<FaqItem, "id">): Promise<FaqItem | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase.from("faq_items").insert({
    question: item.question, answer: item.answer, sort_order: item.sortOrder, is_published: item.isPublished,
  }).select().single();
  if (error || !data) return null;
  return { id: data.id, ...item };
}

export async function updateFaqItem(id: string, item: Omit<FaqItem, "id">): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { error } = await supabase.from("faq_items").update({
    question: item.question, answer: item.answer, sort_order: item.sortOrder, is_published: item.isPublished,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  return !error;
}

export async function deleteFaqItem(id: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { error } = await supabase.from("faq_items").delete().eq("id", id);
  return !error;
}
