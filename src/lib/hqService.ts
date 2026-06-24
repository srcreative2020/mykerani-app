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
  healthScore: number;
  healthRiskLevel: "low" | "medium" | "high";
  healthReasons: string[];
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

  const [{ data: tenants, error: tenantsErr }, { data: subs }, { data: plans }, { data: profiles }, { data: aiUsageRows }, { data: storageRows }, { data: paidRows }, { data: healthRows, error: healthErr }] = await Promise.all([
    supabase.from("tenants").select("*").eq("category", "USER"),
    supabase.from("tenant_subscriptions").select("*"),
    supabase.from("subscription_plans").select("*"),
    supabase.from("profiles").select("*"),
    supabase.rpc("get_hq_ai_usage_all"),
    supabase.rpc("get_all_workspaces_storage_usage"),
    supabase.rpc("get_payment_totals_by_tenant"),
    supabase.rpc("get_hq_customer_health_scores"),
  ]);
  if (tenantsErr || !tenants) return [];
  if (healthErr) {
    console.error("get_hq_customer_health_scores failed:", healthErr.message);
  }

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
  const healthByTenant = new Map<string, { score: number; riskLevel: "low" | "medium" | "high"; reasons: string[] }>(
    (healthRows || []).map((r: any) => [r.tenant_id, { score: Number(r.score) || 0, riskLevel: r.risk_level, reasons: r.reasons || [] }])
  );

  return tenants.map((t: any) => {
    const sub = subByTenant.get(t.id);
    const plan = sub ? planById.get(sub.plan_id) : null;
    const owner = ownerByTenant.get(t.id);
    const status: HqCustomer["status"] = sub?.status === "active" ? "active" : sub?.status === "trialing" ? "pending" : sub?.status ? "suspended" : "pending";
    const health = healthByTenant.get(t.id);
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
      attention: health?.riskLevel === "high",
      mrr: status === "active" ? Number(plan?.monthly_price_myr) || 0 : 0,
      joinedAt: t.created_at ? t.created_at.split("T")[0] : "",
      notes: "",
      totalPaidMyr: totalPaidByTenant.get(t.id) || 0,
      healthScore: health ? health.score : healthErr ? -1 : 100,
      healthRiskLevel: health ? health.riskLevel : healthErr ? "high" : "low",
      healthReasons: health ? health.reasons : healthErr ? ["Ralat memuatkan skor kesihatan"] : [],
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

export interface StorageGovernanceSettings {
  storageModeTrial: string;
  storageModePaid: string;
  trialDays: number;
  freezeDays: number;
  deleteDays: number;
}

export async function getStorageGovernanceSettings(): Promise<StorageGovernanceSettings | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase
    .from("storage_governance_settings")
    .select("*")
    .eq("id", "global")
    .maybeSingle();
  if (error || !data) return null;
  return {
    storageModeTrial: data.storage_mode_trial,
    storageModePaid: data.storage_mode_paid,
    trialDays: Number(data.trial_days) || 0,
    freezeDays: Number(data.freeze_days) || 0,
    deleteDays: Number(data.delete_days) || 0,
  };
}

export async function saveStorageGovernanceSettings(settings: StorageGovernanceSettings): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { error } = await supabase
    .from("storage_governance_settings")
    .update({
      storage_mode_trial: settings.storageModeTrial,
      storage_mode_paid: settings.storageModePaid,
      trial_days: settings.trialDays,
      freeze_days: settings.freezeDays,
      delete_days: settings.deleteDays,
      updated_at: new Date().toISOString(),
    })
    .eq("id", "global");
  return !error;
}

export async function runStorageGovernanceEnforcement(): Promise<{ tenantId: string; action: string }[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase.rpc("enforce_storage_governance");
  if (error || !data) return [];
  return data.map((row: any) => ({ tenantId: row.tenant_id, action: row.action }));
}

// --- Support Governance (Module 5) ---

export interface SupportTicketReply {
  id: string;
  author: string;
  text: string;
  at: string;
}

export interface SupportTicket {
  id: string;
  customer: string;
  email: string;
  subject: string;
  priority: "high" | "medium" | "low";
  status: "open" | "pending" | "resolved";
  summary: string;
  assigned: string;
  createdAt: string;
  replies: SupportTicketReply[];
}

function mapTicketRow(row: any, replies: any[]): SupportTicket {
  return {
    id: row.id,
    customer: row.customer_name,
    email: row.customer_email || "",
    subject: row.subject,
    priority: row.priority,
    status: row.status,
    summary: row.summary || "",
    assigned: row.assigned_to || "",
    createdAt: row.created_at,
    replies: replies.map((r) => ({ id: r.id, author: r.author, text: r.reply_text, at: r.created_at })),
  };
}

export async function getSupportTickets(): Promise<SupportTicket[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data: tickets, error } = await supabase
    .from("support_tickets")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !tickets) return [];
  const { data: replies } = await supabase
    .from("support_ticket_replies")
    .select("*")
    .order("created_at", { ascending: true });
  return tickets.map((t: any) =>
    mapTicketRow(t, (replies || []).filter((r: any) => r.ticket_id === t.id))
  );
}

export async function getMyTenantSupportTickets(): Promise<SupportTicket[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data: tickets, error } = await supabase
    .from("support_tickets")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !tickets) return [];
  const ticketIds = tickets.map((t: any) => t.id);
  if (ticketIds.length === 0) return [];
  const { data: replies } = await supabase
    .from("support_ticket_replies")
    .select("*")
    .in("ticket_id", ticketIds)
    .order("created_at", { ascending: true });
  return tickets.map((t: any) =>
    mapTicketRow(t, (replies || []).filter((r: any) => r.ticket_id === t.id))
  );
}

export async function createSupportTicket(ticket: {
  customer: string;
  email?: string;
  subject: string;
  priority: "high" | "medium" | "low";
  summary?: string;
}): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from("support_tickets").insert({
    customer_name: ticket.customer,
    customer_email: ticket.email || null,
    subject: ticket.subject,
    priority: ticket.priority,
    summary: ticket.summary || null,
    created_by: userData?.user?.id || null,
  });
  return !error;
}

export async function createTenantSupportTicket(
  subject: string,
  summary: string,
  priority: "high" | "medium" | "low" = "medium"
): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { error } = await supabase.rpc("create_tenant_support_ticket", {
    p_subject: subject,
    p_summary: summary,
    p_priority: priority,
  });
  return !error;
}

export async function updateSupportTicketStatus(
  ticketId: string,
  status: "open" | "pending" | "resolved"
): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { error } = await supabase.rpc("hq_update_support_ticket_status", { p_ticket_id: ticketId, p_status: status });
  return !error;
}

export async function assignSupportTicket(ticketId: string, assignedTo: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { error } = await supabase
    .from("support_tickets")
    .update({ assigned_to: assignedTo, updated_at: new Date().toISOString() })
    .eq("id", ticketId);
  return !error;
}

export async function replySupportTicket(ticketId: string, author: string, text: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { error } = await supabase.rpc("hq_reply_support_ticket", { p_ticket_id: ticketId, p_author: author, p_reply_text: text });
  return !error;
}

// --- Resource Wallet Dashboard (Module 11) ---

export interface ResourceWalletSummary {
  tenantId: string;
  tenantName: string;
  aiCreditsBalance: number;
  ocrCreditsBalance: number;
  notificationCreditsBalance: number;
  storageUsedBytes: number;
  storageLimitBytes: number;
  aiConsumed30d: number;
  ocrConsumed30d: number;
  aiCostUsd30d: number;
}

export async function getResourceWalletSummary(): Promise<ResourceWalletSummary[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase.rpc("get_hq_resource_wallet_summary");
  if (error || !data) return [];
  return data.map((row: any) => ({
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    aiCreditsBalance: Number(row.ai_credits_balance) || 0,
    ocrCreditsBalance: Number(row.ocr_credits_balance) || 0,
    notificationCreditsBalance: Number(row.notification_credits_balance) || 0,
    storageUsedBytes: Number(row.storage_used_bytes) || 0,
    storageLimitBytes: Number(row.storage_limit_bytes) || 0,
    aiConsumed30d: Number(row.ai_consumed_30d) || 0,
    ocrConsumed30d: Number(row.ocr_consumed_30d) || 0,
    aiCostUsd30d: Number(row.ai_cost_usd_30d) || 0,
  }));
}

// --- HQ Alert Center (Module 9) ---

export interface HqAlert {
  id: string;
  alertType: string;
  severity: "high" | "medium" | "low";
  tenantId: string | null;
  message: string;
  createdAt: string;
  resolvedAt: string | null;
}

export async function getHqAlerts(includeResolved = false): Promise<HqAlert[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  let query = supabase.from("hq_alerts").select("*").order("created_at", { ascending: false });
  if (!includeResolved) query = query.is("resolved_at", null);
  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((row: any) => ({
    id: row.id,
    alertType: row.alert_type,
    severity: row.severity,
    tenantId: row.tenant_id,
    message: row.message,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  }));
}

export async function refreshHqAlerts(): Promise<number> {
  if (!isSupabaseConfigured() || !supabase) return 0;
  const { data, error } = await supabase.rpc("refresh_hq_alerts");
  if (error) return 0;
  return Number(data) || 0;
}

export async function resolveHqAlert(alertId: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("hq_alerts")
    .update({ resolved_at: new Date().toISOString(), resolved_by: userData?.user?.id || null })
    .eq("id", alertId);
  return !error;
}

// --- Data Masking Governance (Module 7) ---
// HQ_OWNER always sees unmasked data (override authority). HQ_STAFF sees
// masked PII unless explicitly granted via hq_data_masking_grants.

export async function isUnmaskAllowed(): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return true;
  const { data, error } = await supabase.rpc("is_unmask_allowed");
  if (error) return false;
  return !!data;
}

export interface MaskingGrant {
  userId: string;
  grantedAt: string;
}

export async function getMaskingGrants(): Promise<MaskingGrant[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase.from("hq_data_masking_grants").select("*");
  if (error || !data) return [];
  return data.map((row: any) => ({ userId: row.user_id, grantedAt: row.granted_at }));
}

export async function grantUnmaskAccess(userId: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { error } = await supabase.rpc("grant_unmask_access", { p_user_id: userId });
  return !error;
}

export async function revokeUnmaskAccess(userId: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { error } = await supabase.rpc("revoke_unmask_access", { p_user_id: userId });
  return !error;
}

export interface HqStaffUser {
  userId: string;
  email: string;
  fullName: string;
  role: string;
  unmaskGranted: boolean;
}

export async function getHqStaffUsers(): Promise<HqStaffUser[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase.rpc("get_hq_staff_users");
  if (error || !data) return [];
  return data.map((row: any) => ({
    userId: row.user_id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    unmaskGranted: !!row.unmask_granted,
  }));
}

export function maskEmail(email: string | undefined | null): string {
  if (!email) return "";
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const visible = local.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(local.length - 1, 2))}@${domain}`;
}

export function maskPhone(phone: string | undefined | null): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
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

// --- HQ Approval Center ---
// Generic dual-approval inbox built on pending_hq_actions. Any HQ action
// that should require a second approver (never auto-applied) is submitted
// here; review_pending_hq_action() executes the real effect on approval,
// and the row itself (requester/reviewer/timestamps/note) is the audit
// record for the decision.

export type PendingHqActionStatus = "pending" | "approved" | "rejected";

export interface PendingHqAction {
  id: string;
  actionType: string;
  targetTable: string | null;
  targetId: string | null;
  payload: Record<string, unknown>;
  requestedBy: string;
  requestedByEmail: string;
  requestedAt: string;
  status: PendingHqActionStatus;
  reviewedBy: string | null;
  reviewedByEmail: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}

export async function getPendingHqActions(status: PendingHqActionStatus | null = "pending"): Promise<PendingHqAction[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase.rpc("get_pending_hq_actions", { p_status: status });
  if (error || !data) return [];
  return data.map((row: any) => ({
    id: row.id,
    actionType: row.action_type,
    targetTable: row.target_table,
    targetId: row.target_id,
    payload: row.payload || {},
    requestedBy: row.requested_by,
    requestedByEmail: row.requested_by_email || "",
    requestedAt: row.requested_at,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedByEmail: row.reviewed_by_email || null,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
  }));
}

export async function submitPendingHqAction(
  actionType: string, targetTable: string | null, targetId: string | null, payload: Record<string, unknown> = {}
): Promise<string | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase.rpc("submit_pending_hq_action", {
    p_action_type: actionType, p_target_table: targetTable, p_target_id: targetId, p_payload: payload,
  });
  if (error) return null;
  return data as string;
}

export async function reviewPendingHqAction(actionId: string, approve: boolean, note = ""): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) return { ok: false, error: "Supabase not configured" };
  const { error } = await supabase.rpc("review_pending_hq_action", {
    p_action_id: actionId, p_approve: approve, p_note: note,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export interface HqStaffNotification {
  id: string;
  category: string;
  title: string;
  message: string;
  status: "UNREAD" | "READ";
  createdAt: string;
}

export async function getMyHqStaffNotifications(): Promise<HqStaffNotification[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase.rpc("get_my_hq_staff_notifications");
  if (error || !data) return [];
  return data.map((row: any) => ({
    id: row.id, category: row.category, title: row.title, message: row.message,
    status: row.status, createdAt: row.created_at,
  }));
}

export async function markHqStaffNotificationRead(id: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { error } = await supabase.rpc("mark_hq_staff_notification_read", { p_id: id });
  return !error;
}

// --- HQ Activity Center ---
// HQ-wide aggregated feed over audit_logs + hq_governance_audit_log, with a
// per-HQ-user "last seen" cursor. Distinct from HQ Alert Center (threshold-
// triggered alerts) — this is a pure activity/visibility feed.

export interface HqActivityEvent {
  sourceTable: string;
  eventId: string;
  occurredAt: string;
  actorEmail: string | null;
  actorRole: string | null;
  module: string;
  action: string;
  tenantId: string | null;
  detail: Record<string, unknown>;
}

export async function getHqActivityFeed(limit = 50): Promise<HqActivityEvent[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase.rpc("get_hq_activity_feed", { p_limit: limit });
  if (error || !data) return [];
  return data.map((row: any) => ({
    sourceTable: row.source_table,
    eventId: row.event_id,
    occurredAt: row.occurred_at,
    actorEmail: row.actor_email,
    actorRole: row.actor_role,
    module: row.module,
    action: row.action,
    tenantId: row.tenant_id,
    detail: row.detail || {},
  }));
}

export async function markHqActivitySeen(): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { error } = await supabase.rpc("mark_hq_activity_seen");
  return !error;
}

export async function getHqActivityUnseenCount(): Promise<number> {
  if (!isSupabaseConfigured() || !supabase) return 0;
  const { data, error } = await supabase.rpc("get_hq_activity_unseen_count");
  if (error) return 0;
  return Number(data) || 0;
}

// --- HQ Cost Center ---
// Platform-level revenue/AI-cost/operating-cost/margin summary. Distinct
// from AI Cost Governance (per-call cost rates) and Resource Wallet
// Dashboard (per-tenant credit balances) — this is the only module that
// blends MRR against real operating costs.

export interface HqOperatingCost {
  id: string;
  category: string;
  description: string;
  amountMyr: number;
  incurredOn: string;
  recordedBy: string;
  createdAt: string;
}

export async function getHqOperatingCosts(limit = 100): Promise<HqOperatingCost[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase.rpc("get_hq_operating_costs", { p_limit: limit });
  if (error || !data) return [];
  return data.map((row: any) => ({
    id: row.id,
    category: row.category,
    description: row.description,
    amountMyr: Number(row.amount_myr) || 0,
    incurredOn: row.incurred_on,
    recordedBy: row.recorded_by,
    createdAt: row.created_at,
  }));
}

export async function recordHqOperatingCost(
  category: string, description: string, amountMyr: number, incurredOn: string
): Promise<string | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase.rpc("record_hq_operating_cost", {
    p_category: category, p_description: description, p_amount_myr: amountMyr, p_incurred_on: incurredOn,
  });
  if (error) return null;
  return data as string;
}

export async function deleteHqOperatingCost(id: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { error } = await supabase.rpc("delete_hq_operating_cost", { p_id: id });
  return !error;
}

export interface HqCostCenterSummary {
  mrrMyr: number;
  aiCostUsd30d: number;
  aiCostMyr30d: number;
  operatingCostMyr30d: number;
  usdMyrRate: number;
  estimatedMarginMyr30d: number;
  activeSubscriptions: number;
}

export async function getHqCostCenterSummary(): Promise<HqCostCenterSummary | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase.rpc("get_hq_cost_center_summary");
  if (error || !data || !data[0]) return null;
  const row = data[0];
  return {
    mrrMyr: Number(row.mrr_myr) || 0,
    aiCostUsd30d: Number(row.ai_cost_usd_30d) || 0,
    aiCostMyr30d: Number(row.ai_cost_myr_30d) || 0,
    operatingCostMyr30d: Number(row.operating_cost_myr_30d) || 0,
    usdMyrRate: Number(row.usd_myr_rate) || 4.45,
    estimatedMarginMyr30d: Number(row.estimated_margin_myr_30d) || 0,
    activeSubscriptions: Number(row.active_subscriptions) || 0,
  };
}

// --- HQ Knowledge Center ---
// Internal-only HQ knowledge base (runbooks/support scripts/troubleshooting
// notes) — never tenant/public-facing. Distinct from the public FAQ /
// Website CMS. HQ_OWNER and HQ_STAFF share create/update rights; delete is
// HQ_OWNER-only.

export interface HqKnowledgeArticle {
  id: string;
  title: string;
  body: string;
  category: string;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function getHqKnowledgeArticles(category: string | null = null): Promise<HqKnowledgeArticle[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase.rpc("get_hq_knowledge_articles", { p_category: category });
  if (error || !data) return [];
  return data.map((row: any) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    category: row.category,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function createHqKnowledgeArticle(title: string, body: string, category = "general"): Promise<string | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase.rpc("create_hq_knowledge_article", {
    p_title: title, p_body: body, p_category: category,
  });
  if (error) return null;
  return data as string;
}

export async function updateHqKnowledgeArticle(
  id: string, title: string, body: string, category: string
): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { error } = await supabase.rpc("update_hq_knowledge_article", {
    p_id: id, p_title: title, p_body: body, p_category: category,
  });
  return !error;
}

export async function deleteHqKnowledgeArticle(id: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { error } = await supabase.rpc("delete_hq_knowledge_article", { p_id: id });
  return !error;
}

export async function getHqKnowledgeArticleForReply(id: string): Promise<{ title: string; body: string } | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase.rpc("get_hq_knowledge_article_for_reply", { p_id: id });
  if (error || !data || !data[0]) return null;
  return { title: data[0].title, body: data[0].body };
}
