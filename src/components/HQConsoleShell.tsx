import React, { useState, useEffect } from "react";
import { type Tenant, type Workspace, type UserSessionProfile } from "../types";
import {
  LayoutDashboard, Users, CreditCard, BarChart3, DollarSign, Settings,
  Headphones, Server, TrendingUp, TrendingDown, AlertCircle, CheckCircle2,
  Clock, Search, Plus, RefreshCw, ChevronRight, Zap, HardDrive,
  Brain, Building2, UserCheck, UserX, Edit3, Bell, Shield, LogOut,
  ArrowUpRight, Menu, X, Activity, Package, Receipt, ToggleLeft,
  ToggleRight, AlertTriangle, Circle, FileText, MessageSquare,
  User, Send, Star, Repeat, Archive, Globe, HelpCircle, Trash2, ShieldAlert,
  Paperclip, MessageCircle, Copy,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useNotifications, buildHQNotifs, fmtNotifTime } from "../lib/notifications";
import { getAllWorkspacesStorageUsage, fmtBytes as fmtDocBytes } from "../lib/documentStorage";
import { storageQuotaKey } from "../lib/storageQuota";
import { isSupabaseConfigured } from "../lib/supabase";
import * as hqService from "../lib/hqService";

interface HQConsoleShellProps {
  tenants: Tenant[];
  workspaces: Workspace[];
  user: UserSessionProfile | null;
  activeWorkspace: Workspace | null;
}

// HQ_OWNER pages: all 8
// HQ_STAFF pages: dashboard, customers, subscriptions, support
type HQPage = "dashboard" | "customers" | "billing" | "usage" | "support" | "revenue" | "settings" | "system" | "subscriptions" | "website"
  | "customer360" | "alertCenter" | "walletDashboard" | "healthScores" | "governance" | "paymentGovernance" | "storageGovernance"
  | "aiCostGovernance" | "dataMaskingGovernance" | "approvalCenter"
  | "activityCenter" | "costCenter" | "knowledgeCenter" | "addonCatalog" | "phase4Ops";

// â"€â"€ Mock data (demo accounts only) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const MOCK_CUSTOMERS = [
  { id: "c1", name: "Kedai Makan Pak Ali Sdn Bhd",    plan: "Starter",    status: "active",    renewal: "15 Jul 2026", aiUsage: 45,  storageGB: 0.8, attention: false, mrr: 99 },
  { id: "c2", name: "Syarikat Binaan Teguh MY",        plan: "Pro",        status: "active",    renewal: "3 Jul 2026",  aiUsage: 312, storageGB: 8.2, attention: true,  mrr: 299 },
  { id: "c3", name: "Butik Raudah Enterprise",         plan: "Starter",    status: "suspended", renewal: "1 Jul 2026",  aiUsage: 12,  storageGB: 0.3, attention: true,  mrr: 0 },
  { id: "c4", name: "TechVenture Solutions MY",        plan: "Enterprise", status: "active",    renewal: "28 Jul 2026", aiUsage: 891, storageGB: 42,  attention: false, mrr: 899 },
  { id: "c5", name: "Ladang Hijau Organik Sdn Bhd",   plan: "Pro",        status: "active",    renewal: "10 Jul 2026", aiUsage: 178, storageGB: 5.1, attention: false, mrr: 299 },
];

const MOCK_TICKETS = [
  { id: "T-001", customer: "Butik Raudah Enterprise",  subject: "Tidak boleh log masuk",     priority: "high" as const,   status: "open" as const,     category: "login_issue",  summary: "Pengguna tidak dapat masuk sejak 2 hari lalu. AI mengesan isu kata laluan.",     assigned: "-" },
  { id: "T-002", customer: "Syarikat Binaan Teguh MY", subject: "Resit tidak dapat dimuat naik", priority: "medium" as const, status: "in_progress" as const, category: "upload_failure", summary: "Saiz fail melebihi had. AI cadangkan kurangkan saiz atau naik taraf storan.", assigned: "Amir" },
  { id: "T-003", customer: "Ladang Hijau Organik",     subject: "Soalan tentang laporan P&L", priority: "low" as const,    status: "resolved" as const, category: "other", summary: "AI telah menjawab soalan. Pengguna berpuas hati.",                                assigned: "Siti" },
];

const MOCK_PLANS = [
  { id: "p1", name: "Starter",    price: 99,  aiCredits: 500,   storage: "5 GB",  customers: 3 },
  { id: "p2", name: "Pro",        price: 299, aiCredits: 2000,  storage: "25 GB", customers: 2 },
  { id: "p3", name: "Enterprise", price: 899, aiCredits: 10000, storage: "100 GB",customers: 1 },
];

// â"€â"€ AI Router: Provider Catalogue â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
type ModelTier = "fast" | "balanced" | "pro";
interface AIModel   { id: string; name: string; inputPer1M: number; outputPer1M: number; tier: ModelTier; }
interface AIProvDef { id: string; company: string; name: string; badge: string; models: AIModel[]; }
type RouterStrategy = "cheapest" | "balanced" | "quality" | "custom";
interface ProviderCfg { enabled: boolean; apiKey: string; hasKey: boolean; selectedModel: string; testStatus: "idle" | "ok" | "fail"; }
interface PlanRoute   { planId: string; providerId: string; modelId: string; }

const AI_PROVIDERS: AIProvDef[] = [
  { id: "gemini",    company: "Google",        name: "Google Gemini",      badge: "G",  models: [
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", inputPer1M: 0.075, outputPer1M: 0.30,  tier: "fast"     },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", inputPer1M: 0.15,  outputPer1M: 0.60,  tier: "balanced" },
    { id: "gemini-2.5-pro",   name: "Gemini 2.5 Pro",   inputPer1M: 1.25,  outputPer1M: 10.00, tier: "pro"      },
  ]},
  { id: "openai",    company: "OpenAI",         name: "OpenAI / ChatGPT",   badge: "OA", models: [
    { id: "gpt-4o-mini", name: "GPT-4o mini", inputPer1M: 0.15,  outputPer1M: 0.60,  tier: "fast"     },
    { id: "gpt-4o",      name: "GPT-4o",      inputPer1M: 2.50,  outputPer1M: 10.00, tier: "pro"      },
    { id: "o4-mini",     name: "o4-mini",     inputPer1M: 1.10,  outputPer1M: 4.40,  tier: "balanced" },
  ]},
  { id: "anthropic", company: "Anthropic",      name: "Claude (Anthropic)", badge: "AN", models: [
    { id: "claude-haiku-4-5",  name: "Claude Haiku 4.5",  inputPer1M: 0.80, outputPer1M: 4.00,  tier: "fast" },
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", inputPer1M: 3.00, outputPer1M: 15.00, tier: "pro"  },
  ]},
  { id: "deepseek",  company: "DeepSeek AI",    name: "DeepSeek",           badge: "DS", models: [
    { id: "deepseek-v3", name: "DeepSeek V3", inputPer1M: 0.27, outputPer1M: 1.10, tier: "balanced" },
    { id: "deepseek-r1", name: "DeepSeek R1", inputPer1M: 0.55, outputPer1M: 2.19, tier: "pro"      },
  ]},
  { id: "xai",       company: "xAI",            name: "Grok (xAI)",         badge: "XA", models: [
    { id: "grok-3-mini", name: "Grok 3 Mini", inputPer1M: 0.30, outputPer1M: 0.50,  tier: "fast" },
    { id: "grok-3",      name: "Grok 3",      inputPer1M: 3.00, outputPer1M: 15.00, tier: "pro"  },
  ]},
  { id: "mistral",   company: "Mistral AI",     name: "Mistral",            badge: "MI", models: [
    { id: "mistral-small-3", name: "Mistral Small 3.1", inputPer1M: 0.10, outputPer1M: 0.30, tier: "fast" },
    { id: "mistral-large-2", name: "Mistral Large 2",   inputPer1M: 2.00, outputPer1M: 6.00, tier: "pro"  },
  ]},
  { id: "groq",      company: "Groq / Meta",    name: "Llama (via Groq)",   badge: "LL", models: [
    { id: "llama-3.3-70b",    name: "Llama 3.3 70B",    inputPer1M: 0.05, outputPer1M: 0.10, tier: "fast"     },
    { id: "llama-4-scout",    name: "Llama 4 Scout",    inputPer1M: 0.11, outputPer1M: 0.34, tier: "balanced" },
    { id: "llama-4-maverick", name: "Llama 4 Maverick", inputPer1M: 0.50, outputPer1M: 0.77, tier: "pro"      },
  ]},
  { id: "alibaba",   company: "Alibaba / Qwen", name: "Qwen (Alibaba)",     badge: "QW", models: [
    { id: "qwen-turbo",  name: "Qwen Turbo",  inputPer1M: 0.05, outputPer1M: 0.20, tier: "fast"     },
    { id: "qwen2.5-72b", name: "Qwen2.5 72B", inputPer1M: 0.20, outputPer1M: 0.60, tier: "balanced" },
    { id: "qwen-plus",   name: "Qwen Plus",   inputPer1M: 0.40, outputPer1M: 1.20, tier: "pro"      },
  ]},
];

function qCostUSD(m: AIModel): number { return (600 * m.inputPer1M + 900 * m.outputPer1M) / 1_000_000; }

function defaultProviderCfgs(): Record<string, ProviderCfg> {
  const out: Record<string, ProviderCfg> = {};
  AI_PROVIDERS.forEach(p => { out[p.id] = { enabled: p.id === "gemini", apiKey: "", hasKey: false, selectedModel: p.models[0].id, testStatus: "idle" }; });
  return out;
}

// â"€â"€ Status Badge â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    suspended: "bg-red-50 text-red-600 border-red-200",
    open: "bg-amber-50 text-amber-700 border-amber-200",
    pending: "bg-blue-50 text-blue-700 border-blue-200",
    in_progress: "bg-blue-50 text-blue-700 border-blue-200",
    awaiting_customer: "bg-violet-50 text-violet-700 border-violet-200",
    awaiting_hq: "bg-amber-50 text-amber-700 border-amber-200",
    resolved: "bg-emerald-50 text-emerald-600 border-emerald-200",
    closed: "bg-slate-100 text-slate-500 border-slate-200",
    critical: "bg-red-100 text-red-700 border-red-300",
    high: "bg-red-50 text-red-600 border-red-200",
    medium: "bg-amber-50 text-amber-700 border-amber-200",
    low: "bg-slate-100 text-slate-500 border-slate-200",
    breached: "bg-red-100 text-red-700 border-red-300",
    near: "bg-amber-50 text-amber-700 border-amber-200",
    on_time: "bg-emerald-50 text-emerald-600 border-emerald-200",
  };
  const labels: Record<string, string> = {
    active: "Aktif", suspended: "Digantung", open: "Terbuka", pending: "Dalam Proses",
    in_progress: "Dalam Proses", awaiting_customer: "Menunggu Pelanggan", awaiting_hq: "Menunggu HQ",
    resolved: "Selesai", closed: "Ditutup",
    critical: "Kritikal", high: "Tinggi", medium: "Sederhana", low: "Rendah",
    breached: "SLA Lupus", near: "SLA Hampir", on_time: "SLA OK",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${map[status] || "bg-slate-100 text-slate-500 border-slate-200"}`}>
      {labels[status] || status}
    </span>
  );
};

// â"€â"€ Metric Card â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const MetricCard = ({ label, value, sub, icon: Icon, color = "teal", trend }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color?: "teal" | "emerald" | "red" | "amber" | "violet" | "slate";
  trend?: "up" | "down" | "neutral";
}) => {
  const colors = {
    teal:    { bg: "bg-emerald-50",    icon: "text-emerald-600",    border: "border-emerald-100" },
    emerald: { bg: "bg-emerald-50", icon: "text-emerald-600", border: "border-emerald-100" },
    red:     { bg: "bg-red-50",     icon: "text-red-500",     border: "border-red-100" },
    amber:   { bg: "bg-amber-50",   icon: "text-amber-600",   border: "border-amber-100" },
    violet:  { bg: "bg-violet-50",  icon: "text-violet-600",  border: "border-violet-100" },
    slate:   { bg: "bg-emerald-50/40",   icon: "text-slate-500",   border: "border-slate-200" },
  };
  const c = colors[color];
  return (
    <div className={`bg-white rounded-2xl border ${c.border} p-4 shadow-sm flex items-start space-x-3`}>
      <div className={`w-9 h-9 rounded-xl ${c.bg} flex items-center justify-center shrink-0`}>
        <Icon className={`w-4.5 h-4.5 ${c.icon}`} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-slate-400 font-medium">{label}</p>
        <p className="text-xl font-bold text-slate-900 leading-tight">{value}</p>
        {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
      {trend && (
        <div className="ml-auto shrink-0">
          {trend === "up" && <TrendingUp className="w-4 h-4 text-emerald-500" />}
          {trend === "down" && <TrendingDown className="w-4 h-4 text-red-400" />}
        </div>
      )}
    </div>
  );
};

// â"€â"€ Types â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
interface Plan {
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

interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  alternatePhone?: string;
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
  healthScore?: number;
  healthRiskLevel?: "low" | "medium" | "high";
  healthReasons?: string[];
  registrationNo?: string;
  taxNumber?: string;
  industry?: string;
  address?: string;
  billingContactName?: string;
  billingEmail?: string;
  supportContactName?: string;
  supportEmail?: string;
}

const BLANK_PLAN: Omit<Plan, "id"> = {
  name: "", price: 0, aiCredits: 500, ocrCredits: 50, storageGB: 5, maxUsers: 3, featured: false,
  features: [], limitations: [], isTrial: false, trialDays: 0, isCustomPricing: false,
};
const BLANK_CUSTOMER: Omit<Customer, "id" | "aiUsage" | "storageGB" | "attention" | "mrr" | "joinedAt" | "totalPaidMyr"> = {
  name: "", email: "", phone: "", alternatePhone: "", plan: "", status: "active", renewal: "", notes: "",
  registrationNo: "", taxNumber: "", industry: "", address: "",
  billingContactName: "", billingEmail: "", supportContactName: "", supportEmail: "",
};


// ─── Config Value Formatter ─────────────────────────────────────────────────
// Formats commercial_config_items values into human-readable display.
// Values are still read from commercial_config_items — only the display is changed.
function formatConfigValue(configKey: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  const v = value as Record<string, unknown>;
  switch (configKey) {
    case "avg_ai_cost_usd":
    case "avg_ocr_cost_usd":
      return `${v.cost ?? "?"} USD`;
    case "billing_usd_myr_rate":
      return String(v.rate ?? "?");
    case "markup_ai_pct":
    case "markup_ocr_pct":
      return `${v.pct ?? "?"}%`;
    case "credit_per_ai_call":
    case "credit_per_ocr_page":
      return `${v.factor ?? "?"} kredit`;
    case "free_allowance_ai":
      return `${v.credits ?? "?"} kredit`;
    case "min_charge_ai_myr":
    case "min_charge_ocr_myr":
      return `RM${v.min ?? "?"}`;
    case "promo_multiplier_ai":
      return `×${v.multiplier ?? "?"}`;
    case "rounding_rule":
      return v.rule === "ceil" ? "Ceiling" : v.rule === "floor" ? "Floor" : v.rule === "round" ? "Round" : String(v.rule ?? "?");
    default:
      if (typeof value === "object" && !Array.isArray(value)) {
        return Object.entries(v).map(([k, val]) => `${k}: ${val}`).join(" | ");
      }
      return String(value);
  }
}

function formatConfigKey(configKey: string): string {
  const labels: Record<string, string> = {
    avg_ai_cost_usd:       "Kos Purata AI (USD)",
    avg_ocr_cost_usd:      "Kos Purata OCR (USD)",
    billing_usd_myr_rate:  "Kadar USD/MYR",
    markup_ai_pct:         "Markup AI",
    markup_ocr_pct:        "Markup OCR",
    credit_per_ai_call:    "Kredit per Panggilan AI",
    credit_per_ocr_page:   "Kredit per Halaman OCR",
    min_charge_ai_myr:     "Caj Minimum AI",
    min_charge_ocr_myr:    "Caj Minimum OCR",
    free_allowance_ai:     "Elaun Percuma AI",
    promo_multiplier_ai:   "Pengganda Promosi AI",
    rounding_rule:         "Peraturan Pembundaran",
  };
  return labels[configKey] ?? configKey;
}

// â"€â"€â"€ Main Component â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
export const HQConsoleShell: React.FC<HQConsoleShellProps> = ({ user }) => {
  const { signOut, isMockUser } = useAuth();

  const isStaff = user?.role === "HQ_STAFF";
  const useRealData = isSupabaseConfigured() && !isMockUser;

  // Customers — Supabase-backed for real HQ users, localStorage demo for mock users
  const customersKey = `mykerani_customers_${user?.id ?? "guest"}`;
  const [customers, setCustomers] = useState<Customer[]>(() => {
    if (useRealData) return [];
    try {
      const stored = localStorage.getItem(customersKey);
      if (stored) return JSON.parse(stored);
    } catch {}
    return isMockUser
      ? MOCK_CUSTOMERS.map(c => ({ ...c, email: `${c.id}@demo.my`, phone: "", joinedAt: "2026-01-01", notes: "", totalPaidMyr: c.mrr * 3 }))
      : [];
  });
  const [customersLoading, setCustomersLoading] = useState(useRealData);

  const reloadCustomers = () => {
    if (!useRealData) return;
    setCustomersLoading(true);
    hqService.getCustomers().then(data => { setCustomers(data); setCustomersLoading(false); });
  };
  useEffect(() => { reloadCustomers(); }, [useRealData]);
  useEffect(() => { if (!useRealData) localStorage.setItem(customersKey, JSON.stringify(customers)); }, [customers, customersKey, useRealData]);

  // Plans — Supabase-backed for real HQ users, localStorage demo for mock users
  const plansKey = `mykerani_plans_${user?.id ?? "guest"}`;
  const [plans, setPlans] = useState<Plan[]>(() => {
    if (useRealData) return [];
    try {
      const stored = localStorage.getItem(plansKey);
      if (stored) return JSON.parse(stored);
    } catch {}
    return isMockUser
      ? MOCK_PLANS.map(p => ({ ...p, storageGB: parseInt(p.storage), maxUsers: 10, ocrCredits: 0, features: [], limitations: [], isTrial: false, trialDays: 0, isCustomPricing: false }))
      : [];
  });
  const [plansLoading, setPlansLoading] = useState(useRealData);

  const reloadPlans = () => {
    if (!useRealData) return;
    setPlansLoading(true);
    hqService.getPlans().then(data => { setPlans(data); setPlansLoading(false); });
  };
  useEffect(() => { reloadPlans(); }, [useRealData]);
  useEffect(() => { if (!useRealData) localStorage.setItem(plansKey, JSON.stringify(plans)); }, [plans, plansKey, useRealData]);

  // Plan modal state
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [planForm, setPlanForm] = useState<Omit<Plan, "id">>(BLANK_PLAN);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);

  const openCreatePlan = () => { setPlanForm(BLANK_PLAN); setEditingPlan(null); setShowPlanModal(true); };
  const openEditPlan = (p: Plan) => {
    setPlanForm({
      name: p.name, price: p.price, aiCredits: p.aiCredits, ocrCredits: p.ocrCredits,
      storageGB: p.storageGB, maxUsers: p.maxUsers, featured: p.featured,
      features: p.features ?? [], limitations: p.limitations ?? [],
      isTrial: p.isTrial ?? false, trialDays: p.trialDays ?? 0, isCustomPricing: p.isCustomPricing ?? false,
    });
    setEditingPlan(p);
    setShowPlanModal(true);
  };
  const savePlan = async () => {
    if (!planForm.name.trim()) return;
    if (useRealData) {
      if (editingPlan) await hqService.updatePlan(editingPlan.id, planForm);
      else await hqService.createPlan(planForm);
      reloadPlans();
    } else if (editingPlan) {
      setPlans(prev => prev.map(p => p.id === editingPlan.id ? { ...planForm, id: editingPlan.id } : p));
    } else {
      setPlans(prev => [...prev, { ...planForm, id: `plan-${Date.now()}` }]);
    }
    setShowPlanModal(false);
  };
  const deletePlan = async (id: string) => {
    if (useRealData) { await hqService.deletePlan(id); reloadPlans(); }
    else setPlans(prev => prev.filter(p => p.id !== id));
    setDeletingPlanId(null);
  };

  // ── Public marketing site CMS (real, Supabase-backed) ──
  const BLANK_SITE_SETTINGS: hqService.SiteSettings = {
    companyName: "MyKerani", logoUrl: "", heroHeadline: "", heroSubheadline: "",
    contactEmail: "", contactPhone: "", contactWhatsapp: "", contactAddress: "",
    businessHours: "", socialLinks: {}, demoVideoUrl: "",
  };
  const [siteSettings, setSiteSettings] = useState<hqService.SiteSettings>(BLANK_SITE_SETTINGS);
  const [siteSettingsSaving, setSiteSettingsSaving] = useState(false);
  const [siteSettingsSaved, setSiteSettingsSaved] = useState(false);
  const [faqItems, setFaqItems] = useState<hqService.FaqItem[]>([]);
  const [faqDraft, setFaqDraft] = useState<{ question: string; answer: string }>({ question: "", answer: "" });
  // Landing CMS state
  const [landingContent, setLandingContent] = useState<hqService.LandingSection[]>([]);
  const [landingActiveSection, setLandingActiveSection] = useState<string>("problem");
  const [landingItemForm, setLandingItemForm] = useState({ label: "", description: "", iconEmoji: "", sectionKey: "problem" });
  const [editingLandingId, setEditingLandingId] = useState<string | null>(null);
  const [landingModalOpen, setLandingModalOpen] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [socialDraft, setSocialDraft] = useState<{ platform: string; url: string }>({ platform: "", url: "" });

  const reloadSiteCms = () => {
    if (!useRealData) return;
    hqService.getSiteSettings().then(s => { if (s) setSiteSettings(s); });
    hqService.getFaqItems(true).then(setFaqItems);
    hqService.getLandingContent().then(setLandingContent);
  };
  useEffect(() => { reloadSiteCms(); }, [useRealData]);

  const saveSiteSettingsNow = async () => {
    setSiteSettingsSaving(true);
    setSiteSettingsSaved(false);
    await hqService.saveSiteSettings(siteSettings);
    setSiteSettingsSaving(false);
    setSiteSettingsSaved(true);
  };

  const addFaqItem = async () => {
    if (!faqDraft.question.trim() || !faqDraft.answer.trim()) return;
    await hqService.createFaqItem({ question: faqDraft.question, answer: faqDraft.answer, sortOrder: faqItems.length + 1, isPublished: true });
    setFaqDraft({ question: "", answer: "" });
    reloadSiteCms();
  };
  const toggleFaqPublished = async (item: hqService.FaqItem) => {
    await hqService.updateFaqItem(item.id, { ...item, isPublished: !item.isPublished });
    reloadSiteCms();
  };
  const removeFaqItem = async (id: string) => {
    await hqService.deleteFaqItem(id);
    reloadSiteCms();
  };

  const reloadLandingContent = () => hqService.getLandingContent().then(setLandingContent);

  const saveLandingItem = async () => {
    const maxOrder = landingContent.filter(i => i.sectionKey === landingItemForm.sectionKey).length;
    await hqService.upsertLandingItem({
      id: editingLandingId || undefined,
      sectionKey: landingItemForm.sectionKey,
      label: landingItemForm.label.trim(),
      description: landingItemForm.description,
      iconEmoji: landingItemForm.iconEmoji,
      sortOrder: editingLandingId ? landingContent.find(i => i.id === editingLandingId)?.sortOrder ?? maxOrder + 1 : maxOrder + 1,
      isVisible: true,
    });
    setLandingModalOpen(false);
    setEditingLandingId(null);
    setLandingItemForm({ label: "", description: "", iconEmoji: "", sectionKey: landingActiveSection });
    reloadLandingContent();
  };

  const duplicateLandingItem = async (item: hqService.LandingSection) => {
    const sectionItems = landingContent.filter(i => i.sectionKey === item.sectionKey);
    await hqService.upsertLandingItem({
      sectionKey: item.sectionKey,
      label: item.label + " (Salinan)",
      description: item.description,
      iconEmoji: item.iconEmoji,
      sortOrder: sectionItems.length + 1,
      isVisible: false,
    });
    reloadLandingContent();
  };

  const deleteLandingItemById = async (id: string) => {
    await hqService.deleteLandingItem(id);
    reloadLandingContent();
  };

  const toggleLandingVisibility = async (id: string, current: boolean) => {
    await hqService.toggleLandingItemVisibility(id, !current);
    reloadLandingContent();
  };

  const moveLandingItemInList = async (id: string, items: hqService.LandingSection[], dir: -1 | 1) => {
    const idx = items.findIndex(i => i.id === id);
    if (idx < 0) return;
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= items.length) return;
    const a = items[idx];
    const b = items[swapIdx];
    await Promise.all([
      hqService.moveLandingItem(a.id, b.sortOrder),
      hqService.moveLandingItem(b.id, a.sortOrder),
    ]);
    reloadLandingContent();
  };

  const LANDING_SECTION_LABELS: Record<string, string> = {
    problem: "Masalah Pelanggan",
    how_it_works: "Cara MyKerani Berfungsi",
    target_users: "Sasaran Pengguna",
    what_managed: "Apa Yang Boleh Diuruskan",
    benefits: "Kelebihan MyKerani",
  };

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    const url = await hqService.uploadSiteLogo(file);
    setLogoUploading(false);
    if (url) setSiteSettings(s => ({ ...s, logoUrl: url }));
    e.target.value = "";
  };

  const addSocialLink = () => {
    if (!socialDraft.platform.trim() || !socialDraft.url.trim()) return;
    setSiteSettings(s => ({ ...s, socialLinks: { ...s.socialLinks, [socialDraft.platform.trim()]: socialDraft.url.trim() } }));
    setSocialDraft({ platform: "", url: "" });
  };
  const removeSocialLink = (platform: string) => {
    setSiteSettings(s => {
      const next = { ...s.socialLinks };
      delete next[platform];
      return { ...s, socialLinks: next };
    });
  };

  // Customer modal & detail state
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerForm, setCustomerForm] = useState(BLANK_CUSTOMER);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [deletingCustomerId, setDeletingCustomerId] = useState<string | null>(null);

  const openAddCustomer = () => {
    const defaultPlan = plans[0]?.name ?? "";
    setCustomerForm({ ...BLANK_CUSTOMER, plan: defaultPlan });
    setEditingCustomer(null);
    setShowCustomerModal(true);
  };
  const openEditCustomer = (c: Customer) => {
    setCustomerForm({
      name: c.name, email: c.email, phone: c.phone ?? "", alternatePhone: c.alternatePhone ?? "",
      plan: c.plan, status: c.status, renewal: c.renewal, notes: c.notes ?? "",
      registrationNo: c.registrationNo ?? "", taxNumber: c.taxNumber ?? "", industry: c.industry ?? "", address: c.address ?? "",
      billingContactName: c.billingContactName ?? "", billingEmail: c.billingEmail ?? "",
      supportContactName: c.supportContactName ?? "", supportEmail: c.supportEmail ?? "",
    });
    setEditingCustomer(c);
    setSelectedCustomer(null);
    setShowCustomerModal(true);
  };
  const saveCustomer = async () => {
    if (!customerForm.name.trim() || !customerForm.email.trim()) return;
    const planObj = plans.find(p => p.name === customerForm.plan);
    const mrr = planObj?.price ?? 0;
    const renewal = customerForm.renewal || new Date(Date.now() + 30 * 86400000).toLocaleDateString("ms-MY", { day:"numeric", month:"short", year:"numeric" });
    if (useRealData) {
      if (editingCustomer) {
        await hqService.upsertCustomerSubscription(editingCustomer.id, customerForm.plan, customerForm.status, plans);
        await hqService.updateTenantMasterProfile(editingCustomer.id, {
          fullName: customerForm.name.trim(),
          mobileNumber: customerForm.phone?.trim(),
          alternateNumber: customerForm.alternatePhone?.trim(),
          registrationNo: customerForm.registrationNo?.trim(),
          taxNumber: customerForm.taxNumber?.trim(),
          industry: customerForm.industry?.trim(),
          address: customerForm.address?.trim(),
          billingContactName: customerForm.billingContactName?.trim(),
          billingEmail: customerForm.billingEmail?.trim(),
          supportContactName: customerForm.supportContactName?.trim(),
          supportEmail: customerForm.supportEmail?.trim(),
        });
      } else {
        const tenant = await hqService.createCustomerTenant(customerForm.name);
        if (tenant) await hqService.upsertCustomerSubscription(tenant.id, customerForm.plan, customerForm.status, plans);
      }
      reloadCustomers();
    } else if (editingCustomer) {
      setCustomers(prev => prev.map(c => c.id === editingCustomer.id
        ? { ...c, ...customerForm, renewal, mrr }
        : c));
      setSelectedCustomer(prev => prev?.id === editingCustomer.id ? { ...prev, ...customerForm, renewal, mrr } : prev);
    } else {
      const nc: Customer = { ...customerForm, renewal, mrr, id: `c-${Date.now()}`, aiUsage: 0, storageGB: 0, attention: false, joinedAt: new Date().toISOString().split("T")[0], totalPaidMyr: 0 };
      setCustomers(prev => [...prev, nc]);
    }
    setShowCustomerModal(false);
  };
  const toggleStatus = async (id: string) => {
    const target = customers.find(c => c.id === id);
    const nextStatus = target?.status === "active" ? "suspended" : "active";
    if (useRealData) {
      await hqService.submitPendingHqAction(nextStatus === "suspended" ? "tenant_suspend" : "tenant_reactivate", "tenant_subscriptions", id, {});
      if (pendingHqActionsFilter === "pending") await loadPendingHqActions("pending");
      return;
    }
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, status: c.status === "active" ? "suspended" : "active" } : c));
    setSelectedCustomer(prev => prev?.id === id ? { ...prev, status: prev.status === "active" ? "suspended" : "active" } : prev);
  };
  const deleteCustomer = async (id: string) => {
    if (useRealData) { await hqService.deleteCustomerTenant(id); reloadCustomers(); }
    else setCustomers(prev => prev.filter(c => c.id !== id));
    setDeletingCustomerId(null);
    setSelectedCustomer(null);
  };

  const [activePage, setActivePage] = useState<HQPage>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [customersPage, setCustomersPage] = useState(1);
  const [customersPageSize, setCustomersPageSize] = useState(20);

  // Cipta HQ Staff state
  const [showCreateStaff, setShowCreateStaff] = useState(false);
  const [staffEmail, setStaffEmail] = useState("");
  const [staffName, setStaffName] = useState("");
  const [staffCreating, setStaffCreating] = useState(false);
  const [staffResult, setStaffResult] = useState<{ success: boolean; message: string; tempPassword?: string } | null>(null);

  // Resource toggles (HQ_OWNER)
  const [allowOwnAI, setAllowOwnAI] = useState(false);
  const [allowOwnStorage, setAllowOwnStorage] = useState(false);
  const [allowOwnOCR, setAllowOwnOCR] = useState(false);

  // Storage monitor (HQ)
  const [inactiveDays, setInactiveDays] = useState(30);
  const [cleanupTenant, setCleanupTenant] = useState<string | null>(null);
  const [realStorageData, setRealStorageData] = useState<{
    workspace_id: string; workspace_name: string;
    tenant_id: string; tenant_name: string;
    total_bytes: number; file_count: number;
  }[]>([]);
  const [storageRefreshTick, setStorageRefreshTick] = useState(0);
  const [freezeStates, setFreezeStates] = useState<hqService.TenantStorageState[]>([]);
  const [storageGovernance, setStorageGovernance] = useState<hqService.StorageGovernanceSettings | null>(null);
  const [enforcementRunning, setEnforcementRunning] = useState(false);
  const [enforcementResult, setEnforcementResult] = useState<string | null>(null);

  // Data Masking Governance (Module 7)
  const [unmaskAllowed, setUnmaskAllowed] = useState(true);
  const [maskingGrants, setMaskingGrants] = useState<hqService.MaskingGrant[]>([]);
  const [hqStaffUsers, setHqStaffUsers] = useState<hqService.HqStaffUser[]>([]);
  useEffect(() => {
    if (!useRealData) return;
    hqService.isUnmaskAllowed().then(setUnmaskAllowed);
    if (!isStaff) {
      hqService.getMaskingGrants().then(setMaskingGrants);
      hqService.getHqStaffUsers().then(setHqStaffUsers);
    }
  }, [useRealData, isStaff]);
  const displayEmail = (email: string | undefined | null) => (unmaskAllowed ? (email || "") : hqService.maskEmail(email));
  const displayPhone = (phone: string | undefined | null) => (unmaskAllowed ? (phone || "") : hqService.maskPhone(phone));
  const toggleStaffUnmask = async (userId: string, currentlyGranted: boolean) => {
    if (currentlyGranted) await hqService.revokeUnmaskAccess(userId);
    else await hqService.grantUnmaskAccess(userId);
    hqService.getMaskingGrants().then(setMaskingGrants);
    hqService.getHqStaffUsers().then(setHqStaffUsers);
  };
  const changeHqStaffRole = async (u: hqService.HqStaffUser, newRole: string) => {
    if (newRole === u.role || !user?.tenantId) return;
    await hqService.hqAssignStaffRole(u.userId, u.email, u.fullName, newRole, user.tenantId);
    hqService.getHqStaffUsers().then(setHqStaffUsers);
  };
  const revokeHqStaffByUserId = async (u: hqService.HqStaffUser) => {
    if (!window.confirm(`Tarik balik semua akses ${u.fullName} (${u.email})?`)) return;
    const roster = await hqService.getTenantStaffRoles(user?.tenantId || "");
    const row = roster.find(r => r.userId === u.userId || r.email === u.email);
    if (row) await hqService.hqRevokeStaffRole(row.id);
    hqService.getHqStaffUsers().then(setHqStaffUsers);
  };

  // Approval Center (Phase 2)
  const [pendingHqActions, setPendingHqActions] = useState<hqService.PendingHqAction[]>([]);
  const [pendingHqActionsFilter, setPendingHqActionsFilter] = useState<hqService.PendingHqActionStatus>("pending");
  const [approvalActionBusy, setApprovalActionBusy] = useState<string | null>(null);
  const [approvalActionError, setApprovalActionError] = useState<string | null>(null);
  const loadPendingHqActions = (status: hqService.PendingHqActionStatus = pendingHqActionsFilter) =>
    hqService.getPendingHqActions(status).then(setPendingHqActions);
  useEffect(() => {
    if (!useRealData) return;
    loadPendingHqActions(pendingHqActionsFilter);
  }, [useRealData, pendingHqActionsFilter]);
  const [myHqNotifications, setMyHqNotifications] = useState<hqService.HqStaffNotification[]>([]);
  useEffect(() => {
    if (!useRealData) return;
    hqService.getMyHqStaffNotifications().then(setMyHqNotifications);
  }, [useRealData]);
  const reviewHqAction = async (actionId: string, approve: boolean) => {
    setApprovalActionBusy(actionId);
    setApprovalActionError(null);
    const result = await hqService.reviewPendingHqAction(actionId, approve);
    if (!result.ok) setApprovalActionError(result.error || "Tindakan gagal");
    await loadPendingHqActions(pendingHqActionsFilter);
    if (approve) {
      loadAddonPackages();
      loadCommercialGovernance();
    }
    setApprovalActionBusy(null);
  };
  const requestStaffSuspension = async (userId: string, suspend: boolean) => {
    await hqService.submitPendingHqAction(suspend ? "staff_suspend" : "staff_reactivate", "profiles", userId, {});
    if (pendingHqActionsFilter === "pending") await loadPendingHqActions("pending");
  };

  // HQ Activity Center (Phase 2)
  const [hqActivityFeed, setHqActivityFeed] = useState<hqService.HqActivityEvent[]>([]);
  const [hqActivityUnseenCount, setHqActivityUnseenCount] = useState(0);
  const loadHqActivityFeed = () => hqService.getHqActivityFeed(50).then(setHqActivityFeed);
  useEffect(() => {
    if (!useRealData) return;
    loadHqActivityFeed();
    hqService.getHqActivityUnseenCount().then(setHqActivityUnseenCount);
  }, [useRealData]);
  const markHqActivitySeenNow = async () => {
    await hqService.markHqActivitySeen();
    setHqActivityUnseenCount(0);
  };

  // HQ Cost Center (Phase 2)
  const [hqCostSummary, setHqCostSummary] = useState<hqService.HqCostCenterSummary | null>(null);
  const [hqOperatingCosts, setHqOperatingCosts] = useState<hqService.HqOperatingCost[]>([]);
  const [newCostForm, setNewCostForm] = useState({ category: "infrastructure", description: "", amountMyr: "", incurredOn: new Date().toISOString().slice(0, 10) });
  const [hqProfitSummary, setHqProfitSummary] = useState<hqService.HqResourceProfitRow[]>([]);
  const [hqStorageSummary, setHqStorageSummary] = useState<hqService.HqStorageSummaryRow[]>([]);
  const loadHqCostCenter = () => {
    hqService.getHqCostCenterSummary().then(setHqCostSummary);
    hqService.getHqOperatingCosts(50).then(setHqOperatingCosts);
    hqService.getHqResourceProfitSummary(30).then(setHqProfitSummary);
    hqService.getHqStorageLedgerSummary().then(setHqStorageSummary);
  };
  useEffect(() => {
    if (!useRealData) return;
    loadHqCostCenter();
  }, [useRealData]);
  const submitOperatingCost = async () => {
    if (!newCostForm.description.trim() || !newCostForm.amountMyr) return;
    await hqService.recordHqOperatingCost(newCostForm.category, newCostForm.description.trim(), Number(newCostForm.amountMyr), newCostForm.incurredOn);
    setNewCostForm(f => ({ ...f, description: "", amountMyr: "" }));
    loadHqCostCenter();
  };
  const removeOperatingCost = async (id: string) => {
    await hqService.deleteHqOperatingCost(id);
    loadHqCostCenter();
  };

  // HQ Knowledge Center (Phase 2)
  const [hqKnowledgeArticles, setHqKnowledgeArticles] = useState<hqService.HqKnowledgeArticle[]>([]);
  const [knowledgeForm, setKnowledgeForm] = useState({ id: "", title: "", body: "", category: "general" });
  const loadHqKnowledgeArticles = () => hqService.getHqKnowledgeArticles().then(setHqKnowledgeArticles);
  useEffect(() => {
    if (!useRealData) return;
    loadHqKnowledgeArticles();
  }, [useRealData]);
  const saveKnowledgeArticle = async () => {
    if (!knowledgeForm.title.trim() || !knowledgeForm.body.trim()) return;
    if (knowledgeForm.id) {
      await hqService.updateHqKnowledgeArticle(knowledgeForm.id, knowledgeForm.title.trim(), knowledgeForm.body.trim(), knowledgeForm.category);
    } else {
      await hqService.createHqKnowledgeArticle(knowledgeForm.title.trim(), knowledgeForm.body.trim(), knowledgeForm.category);
    }
    setKnowledgeForm({ id: "", title: "", body: "", category: "general" });
    loadHqKnowledgeArticles();
  };
  const removeKnowledgeArticle = async (id: string) => {
    await hqService.deleteHqKnowledgeArticle(id);
    loadHqKnowledgeArticles();
  };

  // Resource Wallet Dashboard (Module 11)
  const [resourceWallets, setResourceWallets] = useState<hqService.ResourceWalletSummary[]>([]);
  const [hqAlerts, setHqAlerts] = useState<hqService.HqAlert[]>([]);
  const [resourceWalletRefreshTick, setResourceWalletRefreshTick] = useState(0);

  // HQ Executive UI: Customer 360 selection, Alert Center filters, Wallet Dashboard sort/search
  const [c360SelectedId, setC360SelectedId] = useState<string | null>(null);
  const [alertTypeFilter, setAlertTypeFilter] = useState("all");
  const [alertSeverityFilter, setAlertSeverityFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [alertResolvedFilter, setAlertResolvedFilter] = useState<"all" | "resolved" | "unresolved">("all");
  const [walletSearch, setWalletSearch] = useState("");
  const [walletSortKey, setWalletSortKey] = useState<keyof hqService.ResourceWalletSummary>("aiCostUsd30d");
  const [walletSortDir, setWalletSortDir] = useState<"asc" | "desc">("desc");
  useEffect(() => {
    if (!useRealData) return;
    hqService.getResourceWalletSummary().then(setResourceWallets);
  }, [useRealData, resourceWalletRefreshTick]);

  // Fetch real storage usage + freeze/inactivity state from Supabase
  useEffect(() => {
    getAllWorkspacesStorageUsage().then(data => { if (data.length > 0) setRealStorageData(data); });
    if (useRealData) hqService.getStorageFreezeStates().then(setFreezeStates);
    if (useRealData) hqService.getStorageGovernanceSettings().then(s => { if (s) { setStorageGovernance(s); setInactiveDays(s.freezeDays); } });
  }, [storageRefreshTick, useRealData]);

  const saveInactiveDays = async (days: number) => {
    setInactiveDays(days);
    if (!storageGovernance) return;
    const updated = { ...storageGovernance, freezeDays: days };
    setStorageGovernance(updated);
    await hqService.saveStorageGovernanceSettings(updated);
  };

  // Addon/credit package catalog (HQ-configurable, dual-approval writes)
  const [addonPackages, setAddonPackages] = useState<hqService.AddonPackage[]>([]);
  const [addonForm, setAddonForm] = useState<{ creditType: hqService.AddonCreditType; amount: string; priceMyr: string; label: string; sortOrder: string; isBestValue: boolean }>({
    creditType: "STORAGE", amount: "", priceMyr: "", label: "", sortOrder: "1", isBestValue: false,
  });
  const [addonSubmitError, setAddonSubmitError] = useState<string | null>(null);
  const [addonSubmitBusy, setAddonSubmitBusy] = useState(false);

  const loadAddonPackages = () => hqService.getAddonPackages().then(setAddonPackages);
  useEffect(() => { if (useRealData) loadAddonPackages(); }, [useRealData]);

  const submitAddonPackage = async () => {
    setAddonSubmitError(null);
    const amount = parseFloat(addonForm.amount);
    const priceMyr = parseFloat(addonForm.priceMyr);
    if (!addonForm.label.trim() || !(amount > 0) || !(priceMyr > 0)) {
      setAddonSubmitError("Sila isi label, kuantiti dan harga yang sah.");
      return;
    }
    setAddonSubmitBusy(true);
    try {
      const storageAmount = addonForm.creditType === "STORAGE" ? amount * 1073741824 : amount;
      const id = await hqService.submitAddonPackageUpsert({
        creditType: addonForm.creditType, amount: storageAmount, priceMyr,
        label: addonForm.label.trim(), sortOrder: parseInt(addonForm.sortOrder, 10) || 0,
        isBestValue: addonForm.isBestValue,
      });
      if (!id) { setAddonSubmitError("Gagal menghantar permintaan."); return; }
      setAddonForm({ creditType: "STORAGE", amount: "", priceMyr: "", label: "", sortOrder: "1", isBestValue: false });
      if (pendingHqActionsFilter === "pending") await loadPendingHqActions("pending");
    } finally {
      setAddonSubmitBusy(false);
    }
  };

  const requestAddonDeactivate = async (id: string) => {
    await hqService.submitAddonPackageDeactivate(id);
    if (pendingHqActionsFilter === "pending") await loadPendingHqActions("pending");
  };

  // Phase 4 Ops: Promotions, Commercial Governance, Commercial Analytics, Production Governance, Customer Success
  const [promotions, setPromotions] = useState<hqService.Promotion[]>([]);
  const [promoForm, setPromoForm] = useState<{ code: string; kind: hqService.PromotionKind; creditType: hqService.AddonCreditType; amount: string; maxRedemptions: string; expiresAt: string }>({
    code: "", kind: "wallet_credit", creditType: "STORAGE", amount: "", maxRedemptions: "", expiresAt: "",
  });
  const [promoSubmitError, setPromoSubmitError] = useState<string | null>(null);
  const [promoSubmitBusy, setPromoSubmitBusy] = useState(false);

  const loadPromotions = () => hqService.getActivePromotions().then(setPromotions);
  useEffect(() => { if (useRealData) loadPromotions(); }, [useRealData]);

  const submitPromotion = async () => {
    setPromoSubmitError(null);
    const amount = parseFloat(promoForm.amount);
    if (!promoForm.code.trim() || !(amount > 0)) {
      setPromoSubmitError("Sila isi kod promosi dan kuantiti yang sah.");
      return;
    }
    setPromoSubmitBusy(true);
    try {
      const storageAmount = promoForm.kind === "wallet_credit" && promoForm.creditType === "STORAGE" ? amount * 1073741824 : amount;
      const id = await hqService.submitPromotionUpsert({
        code: promoForm.code.trim().toUpperCase(),
        kind: promoForm.kind,
        creditType: promoForm.kind === "wallet_credit" ? promoForm.creditType : undefined,
        amount: storageAmount,
        maxRedemptions: promoForm.maxRedemptions ? parseInt(promoForm.maxRedemptions, 10) : undefined,
        expiresAt: promoForm.expiresAt || undefined,
      });
      if (!id) { setPromoSubmitError("Gagal menghantar permintaan."); return; }
      setPromoForm({ code: "", kind: "wallet_credit", creditType: "STORAGE", amount: "", maxRedemptions: "", expiresAt: "" });
      if (pendingHqActionsFilter === "pending") await loadPendingHqActions("pending");
    } finally {
      setPromoSubmitBusy(false);
    }
  };

  const requestPromotionDeactivate = async (id: string) => {
    await hqService.submitPromotionDeactivate(id);
    if (pendingHqActionsFilter === "pending") await loadPendingHqActions("pending");
  };

  const [commercialEvents, setCommercialEvents] = useState<hqService.CommercialEvent[]>([]);
  const [planDistribution, setPlanDistribution] = useState<hqService.PlanDistributionRow[]>([]);
  const loadCommercialAnalytics = () => {
    hqService.getCommercialEvents(undefined, 50).then(setCommercialEvents);
    hqService.getPlanDistribution().then(setPlanDistribution);
  };
  useEffect(() => { if (useRealData) loadCommercialAnalytics(); }, [useRealData]);

  const [commercialConfigItems, setCommercialConfigItems] = useState<hqService.CommercialConfigItem[]>([]);
  const [approvalThresholds, setApprovalThresholds] = useState<hqService.CommercialApprovalThreshold[]>([]);

  // Pricing policy editor state
  const [pricingForm, setPricingForm] = useState<Record<string, string>>({});
  const [pricingBusy, setPricingBusy] = useState(false);
  const [pricingSuccess, setPricingSuccess] = useState<string | null>(null);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const PRICING_KEYS = [
    "avg_ai_cost_usd","avg_ocr_cost_usd","billing_usd_myr_rate",
    "credit_per_ai_call","credit_per_ocr_page","free_allowance_ai",
    "markup_ai_pct","markup_ocr_pct","min_charge_ai_myr","min_charge_ocr_myr",
    "promo_multiplier_ai","rounding_rule",
  ] as const;

  // Extract raw value from DB JSON object for a given config key
  const extractRawValue = (configKey: string, value: unknown): string => {
    if (!value || typeof value !== "object") return "";
    const v = value as Record<string, unknown>;
    switch (configKey) {
      case "avg_ai_cost_usd": case "avg_ocr_cost_usd": return String(v.cost ?? "");
      case "billing_usd_myr_rate": return String(v.rate ?? "");
      case "markup_ai_pct": case "markup_ocr_pct": return String(v.pct ?? "");
      case "credit_per_ai_call": case "credit_per_ocr_page": return String(v.factor ?? "");
      case "free_allowance_ai": return String(v.credits ?? "");
      case "min_charge_ai_myr": case "min_charge_ocr_myr": return String(v.min ?? "");
      case "promo_multiplier_ai": return String(v.multiplier ?? "");
      case "rounding_rule": return String(v.rule ?? "ceil");
      default: return JSON.stringify(value);
    }
  };

  // Build DB JSON value from raw input for a given config key
  const buildJsonValue = (configKey: string, raw: string): Record<string, unknown> => {
    const n = parseFloat(raw);
    switch (configKey) {
      case "avg_ai_cost_usd": case "avg_ocr_cost_usd": return { cost: n };
      case "billing_usd_myr_rate": return { rate: n };
      case "markup_ai_pct": case "markup_ocr_pct": return { pct: n };
      case "credit_per_ai_call": case "credit_per_ocr_page": return { factor: n };
      case "free_allowance_ai": return { credits: n };
      case "min_charge_ai_myr": case "min_charge_ocr_myr": return { min: n };
      case "promo_multiplier_ai": return { multiplier: n };
      case "rounding_rule": return { rule: raw };
      default: return { value: raw };
    }
  };

  const loadCommercialGovernance = () => {
    hqService.getCommercialConfigItems().then(items => {
      setCommercialConfigItems(items);
      // Sync pricing form from loaded items
      const initial: Record<string, string> = {};
      items.forEach(item => {
        if (PRICING_KEYS.includes(item.configKey as typeof PRICING_KEYS[number])) {
          initial[item.configKey] = extractRawValue(item.configKey, item.value);
        }
      });
      setPricingForm(prev => ({ ...prev, ...initial }));
    });
    hqService.getCommercialApprovalThresholds().then(setApprovalThresholds);
  };
  useEffect(() => { if (useRealData) loadCommercialGovernance(); }, [useRealData]);

  const submitPricingPolicy = async () => {
    setPricingBusy(true);
    setPricingSuccess(null);
    setPricingError(null);
    try {
      const keys = PRICING_KEYS;
      let submitted = 0;
      for (const key of keys) {
        const raw = pricingForm[key];
        if (raw === undefined || raw === "") continue;
        const jsonValue = buildJsonValue(key, raw);
        const id = await hqService.submitCommercialConfigUpsert(key, "global", jsonValue);
        if (id) submitted++;
      }
      if (submitted === 0) { setPricingError("Tiada perubahan untuk dihantar."); return; }
      setPricingSuccess(`${submitted} perubahan telah dihantar untuk kelulusan dual-approval.`);
      loadCommercialGovernance();
      if (pendingHqActionsFilter === "pending") loadPendingHqActions("pending");
    } catch {
      setPricingError("Gagal menghantar perubahan.");
    } finally {
      setPricingBusy(false);
    }
  };


  const [scheduledJobRuns, setScheduledJobRuns] = useState<hqService.ScheduledJobRun[]>([]);
  const loadScheduledJobRuns = () => hqService.getScheduledJobRuns(50).then(setScheduledJobRuns);
  useEffect(() => { if (useRealData) loadScheduledJobRuns(); }, [useRealData]);

  const [recommendedActions, setRecommendedActions] = useState<hqService.RecommendedAction[]>([]);
  const loadRecommendedActions = () => hqService.getRecommendedActions().then(setRecommendedActions);
  useEffect(() => { if (useRealData) loadRecommendedActions(); }, [useRealData]);

  const runEnforcementNow = async () => {
    setEnforcementRunning(true);
    setEnforcementResult(null);
    try {
      const frozen = await hqService.runStorageGovernanceEnforcement();
      setEnforcementResult(frozen.length > 0 ? `${frozen.length} tenant dibekukan` : "Tiada tenant tidak aktif melebihi tempoh");
      setStorageRefreshTick(t => t + 1);
    } finally {
      setEnforcementRunning(false);
    }
  };

  // Per-user AI usage + suspension state — real, server-enforced (HQ owner/staff/tenant owner/staff)
  const [userUsage, setUserUsage] = useState<hqService.HqUserUsage[]>([]);
  const [usageByFeature, setUsageByFeature] = useState<hqService.HqUsageByFeature[]>([]);
  const [userUsageRefreshTick, setUserUsageRefreshTick] = useState(0);
  useEffect(() => {
    if (!useRealData) return;
    hqService.getUserUsage().then(setUserUsage);
    hqService.getUsageByFeature().then(setUsageByFeature);
  }, [useRealData, userUsageRefreshTick]);
  const toggleUserSuspend = async (u: hqService.HqUserUsage) => {
    const ok = await hqService.setUserSuspended(u.userId, !u.isSuspended);
    if (ok) setUserUsageRefreshTick(t => t + 1);
  };
  const roleLabel = (role: string): string => ({
    HQ_OWNER: "Pemilik HQ", HQ_STAFF: "Kakitangan HQ",
    TENANT_OWNER: "Pemilik Syarikat", TENANT_STAFF: "Kakitangan Syarikat",
  }[role] || role);

  // Payment gateway settings (Chip Asia + manual) + pending manual-payment approvals
  const [paymentSettings, setPaymentSettings] = useState<hqService.PaymentGatewaySettings>({
    chipAsiaEnabled: false, chipAsiaApiKey: "", chipAsiaSecretKey: "", chipAsiaBrandId: "", manualPaymentEnabled: true,
  });
  const [paymentSettingsSaved, setPaymentSettingsSaved] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState<hqService.PendingPaymentApproval[]>([]);
  const [approvalsRefreshTick, setApprovalsRefreshTick] = useState(0);
  useEffect(() => {
    if (!useRealData) return;
    hqService.getPaymentGatewaySettings().then(s => { if (s) setPaymentSettings(s); });
  }, [useRealData]);
  useEffect(() => {
    if (!useRealData) return;
    hqService.getPendingPaymentApprovals().then(setPendingApprovals);
  }, [useRealData, approvalsRefreshTick]);
  const savePaymentSettings = async () => {
    const ok = await hqService.savePaymentGatewaySettings(paymentSettings);
    if (ok) { setPaymentSettingsSaved(true); setTimeout(() => setPaymentSettingsSaved(false), 2000); }
  };
  const reviewApproval = async (id: string, approve: boolean) => {
    const ok = await hqService.reviewPaymentTransaction(id, approve);
    if (ok) { setApprovalsRefreshTick(t => t + 1); reloadCustomers(); }
  };
  const [slipPreviewUrl, setSlipPreviewUrl] = useState<string | null>(null);
  const viewSlip = async (path: string | null) => {
    if (!path) return;
    const url = await hqService.getPaymentSlipUrl(path);
    if (url) setSlipPreviewUrl(url);
  };

  // Security Foundation: Chip Asia webhook shadow-mode log + enforcement flag
  const [webhookEvents, setWebhookEvents] = useState<hqService.PaymentWebhookEvent[]>([]);
  const [webhookEnforce, setWebhookEnforceState] = useState(false);
  const [webhookRefreshTick, setWebhookRefreshTick] = useState(0);
  useEffect(() => {
    if (!useRealData) return;
    hqService.getRecentPaymentWebhookEvents().then(setWebhookEvents);
    hqService.getWebhookEnforceFlag().then(setWebhookEnforceState);
  }, [useRealData, webhookRefreshTick]);
  const [webhookProposalSent, setWebhookProposalSent] = useState(false);
  const toggleWebhookEnforce = async () => {
    const id = await hqService.proposeWebhookEnforceFlagChange(!webhookEnforce);
    if (id) { setWebhookProposalSent(true); setTimeout(() => setWebhookProposalSent(false), 3000); }
  };

  // Notifications (HQ)
  const notif = useNotifications(`hq_${user?.id || "guest"}`);
  const [showNotifPanel, setShowNotifPanel] = useState(false);

  // Tickets — persistent for all users (deklarasi di sini supaya boleh dipakai dalam useEffect bawah)
  interface Ticket {
    id: string;
    customer: string;
    email?: string;
    subject: string;
    priority: hqService.SupportTicketPriority;
    status: hqService.SupportTicketStatus;
    summary: string;
    category?: string;
    assigned: string;
    createdAt: string;
    slaDueAt?: string | null;
    firstResponseAt?: string | null;
    resolvedAt?: string | null;
    closedAt?: string | null;
    resolutionNotes?: string;
    replies: { id: string; author: string; text: string; at: string }[];
    internalNotes?: { id: string; author: string; note: string; at: string }[];
    attachments?: { id: string; fileName: string; filePath: string; fileType: string; uploadedByName: string; at: string }[];
  }
  const ticketsKey = `mykerani_tickets_${user?.id ?? "guest"}`;
  const [allTickets, setAllTickets] = useState<Ticket[]>(() => {
    try {
      const stored = localStorage.getItem(ticketsKey);
      if (stored) return JSON.parse(stored);
    } catch {}
    return isMockUser ? MOCK_TICKETS.map(t => ({
      ...t, email: "", createdAt: "2026-06-01",
      replies: [] as { id: string; author: string; text: string; at: string }[],
      internalNotes: [] as { id: string; author: string; note: string; at: string }[],
      attachments: [] as { id: string; fileName: string; filePath: string; fileType: string; uploadedByName: string; at: string }[],
    })) : [];
  });

  useEffect(() => {
    if (useRealData) return;
    const totalUsed = customers.reduce((s, c) => {
      try { const raw = localStorage.getItem(`mykerani_storage_quota_${c.id}`); return s + (raw ? JSON.parse(raw).usedBytes || 0 : 0); } catch { return s; }
    }, 0);
    const supabasePlan = 100 * 1024 * 1024 * 1024;
    const frozenTenants   = customers.filter(c => { try { const r = localStorage.getItem(`mykerani_storage_quota_${c.id}`); return r && JSON.parse(r).isFrozen; } catch { return false; } }).map(c => c.name);
    const inactiveTenants = customers.filter(c => { try { const r = localStorage.getItem(`mykerani_storage_quota_${c.id}`); if (!r) return false; const s = JSON.parse(r); return Math.floor((Date.now() - new Date(s.lastActiveAt || 0).getTime()) / 86400000) >= (s.inactiveDaysLimit || 30); } catch { return false; } }).map(c => c.name);
    const highStorage     = customers.map(c => { try { const r = localStorage.getItem(`mykerani_storage_quota_${c.id}`); if (!r) return null; const s = JSON.parse(r); return { name: c.name, pct: s.usedBytes / s.quotaBytes }; } catch { return null; } }).filter((t): t is { name: string; pct: number } => !!t && t.pct >= 0.90);
    const openTickets = allTickets.filter(t => t.status !== "resolved" && t.status !== "closed").length;
    buildHQNotifs({ frozenTenants, inactiveTenants, highStorageTenants: highStorage, openTickets, supabasePct: totalUsed / supabasePlan, newCustomers: [] }).forEach(n => notif.push(n));
  }, [customers.length, allTickets.length, useRealData]);

  // HQ Alert Center (Module 9) — real persistent alerts, shared across all HQ staff
  useEffect(() => {
    if (!useRealData) return;
    hqService.refreshHqAlerts().finally(() => {
      hqService.getHqAlerts().then(alerts => {
        setHqAlerts(alerts);
        alerts.forEach(a => {
          const tenantName = customers.find(c => c.id === a.tenantId)?.name;
          notif.push({
            type: a.alertType,
            severity: a.severity === "high" ? "critical" : a.severity === "medium" ? "warn" : "info",
            title: a.alertType === "churn_risk" ? "Risiko Churn" : a.alertType === "storage_frozen" ? "Storan Dibekukan" : a.alertType === "storage_warning" ? "Amaran Storan" : "Amaran HQ",
            body: a.message,
            action: a.alertType === "churn_risk" ? "customers" : a.alertType === "storage_frozen" ? "storage" : a.alertType === "storage_warning" ? "storage" : "system",
            tenantName,
          });
        });
      });
    });
  }, [useRealData, customers.length]);

  // AI Router state
  const aiRouterKey = `mykerani_airouter_${user?.id ?? "guest"}`;
  const [routerStrategy, setRouterStrategy] = useState<RouterStrategy>(() => {
    if (useRealData) return "cheapest";
    try { const s = JSON.parse(localStorage.getItem(aiRouterKey) || "{}"); return s.strategy || "cheapest"; } catch { return "cheapest"; }
  });
  const [providerCfgs, setProviderCfgs] = useState<Record<string, ProviderCfg>>(() => {
    if (useRealData) return defaultProviderCfgs();
    try {
      const s = JSON.parse(localStorage.getItem(aiRouterKey) || "{}");
      return s.providers ? { ...defaultProviderCfgs(), ...s.providers } : defaultProviderCfgs();
    } catch { return defaultProviderCfgs(); }
  });
  const [planRoutes, setPlanRoutes] = useState<PlanRoute[]>(() => {
    if (useRealData) return [];
    try { const s = JSON.parse(localStorage.getItem(aiRouterKey) || "{}"); return s.planRoutes || []; } catch { return []; }
  });
  const [usdMyr, setUsdMyr] = useState<number>(() => {
    if (useRealData) return 4.45;
    try { const s = JSON.parse(localStorage.getItem(aiRouterKey) || "{}"); return s.usdMyr || 4.45; } catch { return 4.45; }
  });
  const [testingProv, setTestingProv] = useState<string | null>(null);
  const [systemHealth, setSystemHealth] = useState<{ label: string; ok: boolean; latencyMs: number }[]>([]);
  const [systemHealthLoading, setSystemHealthLoading] = useState(false);
  const [aiRouterLoaded, setAiRouterLoaded] = useState(!useRealData);

  // AI Cost Governance: real per-call cost rates + aggregated spend by tenant/provider
  const [aiCostRates, setAiCostRates] = useState<hqService.AiCostRate[]>([]);
  const [aiCostSummary, setAiCostSummary] = useState<hqService.AiCostSummaryRow[]>([]);
  const [aiCostRefreshTick, setAiCostRefreshTick] = useState(0);
  useEffect(() => {
    if (!useRealData) return;
    hqService.getAiCostRates().then(setAiCostRates);
    hqService.getAiCostSummary().then(setAiCostSummary);
  }, [useRealData, aiCostRefreshTick]);
  const saveAiCostRate = async (provider: string, model: string, cost: number) => {
    const ok = await hqService.upsertAiCostRate(provider, model, cost);
    if (ok) setAiCostRefreshTick(t => t + 1);
  };

  // Load real AI Router config from Supabase (source of truth for the whole app's AI behavior)
  useEffect(() => {
    if (!useRealData) return;
    let cancelled = false;
    (async () => {
      const [settings, statuses] = await Promise.all([hqService.getAiRouterSettings(), hqService.getAiProviderStatuses()]);
      if (cancelled) return;
      if (settings) {
        setRouterStrategy(settings.strategy);
        setUsdMyr(settings.usdMyr);
        setPlanRoutes(settings.planRoutes);
      }
      if (statuses.length > 0) {
        setProviderCfgs(prev => {
          const next = { ...defaultProviderCfgs() };
          statuses.forEach(s => {
            next[s.provider] = {
              enabled: s.enabled,
              apiKey: "",
              hasKey: s.hasKey,
              selectedModel: s.selectedModel || next[s.provider]?.selectedModel || AI_PROVIDERS.find(p => p.id === s.provider)?.models[0].id || "",
              testStatus: "idle",
            };
          });
          return next;
        });
      }
      setAiRouterLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [useRealData]);

  useEffect(() => {
    if (useRealData) return;
    localStorage.setItem(aiRouterKey, JSON.stringify({ strategy: routerStrategy, providers: providerCfgs, planRoutes, usdMyr }));
  }, [routerStrategy, providerCfgs, planRoutes, usdMyr, aiRouterKey, useRealData]);

  // Persist non-secret strategy/exchange-rate/plan-route settings to Supabase
  useEffect(() => {
    if (!useRealData || !aiRouterLoaded) return;
    hqService.saveAiRouterSettings({ strategy: routerStrategy, usdMyr, planRoutes });
  }, [useRealData, aiRouterLoaded, routerStrategy, usdMyr, planRoutes]);

  const updateProviderCfg = (id: string, patch: Partial<ProviderCfg>) => {
    setProviderCfgs(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    if (useRealData) {
      const merged = { ...(providerCfgs[id] || defaultProviderCfgs()[id]), ...patch };
      const apiKeyToSave = patch.apiKey ? patch.apiKey : (merged.apiKey || null);
      hqService.upsertAiProviderConfig(id, merged.enabled, apiKeyToSave, merged.selectedModel);
    }
  };

  useEffect(() => {
    if (activePage !== "system" || !useRealData) return;
    let active = true;
    const load = async () => {
      setSystemHealthLoading(true);
      try {
        const { supabase } = await import("../lib/supabase");
        const { data: sessionData } = await supabase!.auth.getSession();
        const jwt = sessionData?.session?.access_token || "";
        const res = await fetch("/api/admin/system-health", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        });
        const json = await res.json();
        if (active) setSystemHealth(json.checks || []);
      } catch {
        if (active) setSystemHealth([]);
      }
      if (active) setSystemHealthLoading(false);
    };
    load();
    return () => { active = false; };
  }, [activePage, useRealData]);

  const testConnection = async (providerId: string) => {
    setTestingProv(providerId);
    updateProviderCfg(providerId, { testStatus: "idle" });
    const cfg = providerCfgs[providerId];
    if (!cfg?.apiKey) {
      updateProviderCfg(providerId, { testStatus: "fail" });
      setTestingProv(null);
      return;
    }
    try {
      const { supabase } = await import("../lib/supabase");
      const { data: sessionData } = await supabase!.auth.getSession();
      const jwt = sessionData?.session?.access_token || "";
      const res = await fetch("/api/admin/test-ai-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ providerId, apiKey: cfg.apiKey }),
      });
      const json = await res.json();
      updateProviderCfg(providerId, { testStatus: json.ok ? "ok" : "fail" });
    } catch {
      updateProviderCfg(providerId, { testStatus: "fail" });
    }
    setTestingProv(null);
  };

  const getAutoModel = (strategy: RouterStrategy): { prov: AIProvDef; model: AIModel } | null => {
    const enabled = AI_PROVIDERS.filter(p => providerCfgs[p.id]?.enabled);
    if (!enabled.length) return null;
    const candidates = enabled.flatMap(p =>
      p.models
        .filter(m => {
          if (strategy === "quality") return m.tier === "pro";
          if (strategy === "balanced") return m.tier === "balanced" || m.tier === "fast";
          return true; // cheapest: all tiers
        })
        .map(m => ({ prov: p, model: m, cost: qCostUSD(m) }))
    );
    if (!candidates.length) return null;
    const best = candidates.reduce((a, b) => (a.cost <= b.cost ? a : b));
    return { prov: best.prov, model: best.model };
  };

  // Business settings — persistent
  interface BizSettings {
    bizName: string; bizTagline: string; bizEmail: string; bizPhone: string;
    notifyNewCustomer: boolean; notifyRenewal: boolean; notifySupport: boolean; notifyHighUsage: boolean;
    currency: string; timezone: string;
  }
  const settingsKey = `mykerani_bizsettings_${user?.id ?? "guest"}`;
  const defaultSettings: BizSettings = {
    bizName: "MYKERANI", bizTagline: "AI Financial Clerk", bizEmail: user?.email || "", bizPhone: "",
    notifyNewCustomer: true, notifyRenewal: true, notifySupport: true, notifyHighUsage: false,
    currency: "MYR", timezone: "Asia/Kuala_Lumpur",
  };
  const [bizSettings, setBizSettings] = useState<BizSettings>(() => {
    try { const s = localStorage.getItem(settingsKey); if (s) return { ...defaultSettings, ...JSON.parse(s) }; } catch {}
    return defaultSettings;
  });
  const [settingsSaved, setSettingsSaved] = useState(false);
  const saveBizSettings = (patch: Partial<BizSettings>) => {
    const updated = { ...bizSettings, ...patch };
    setBizSettings(updated);
    localStorage.setItem(settingsKey, JSON.stringify(updated));
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  };

  useEffect(() => { if (!useRealData) localStorage.setItem(ticketsKey, JSON.stringify(allTickets)); }, [allTickets, ticketsKey, useRealData]);

  const [ticketsRefreshTick, setTicketsRefreshTick] = useState(0);
  useEffect(() => {
    if (!useRealData) return;
    hqService.getSupportTickets().then(rows => setAllTickets(rows as Ticket[]));
  }, [useRealData, ticketsRefreshTick]);

  const [ticketFilter, setTicketFilter] = useState<"all" | "unassigned" | hqService.SupportTicketStatus>("all");
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [ticketForm, setTicketForm] = useState({ customer: "", email: "", subject: "", priority: "medium" as hqService.SupportTicketPriority, summary: "", category: "" });
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [internalNoteText, setInternalNoteText] = useState("");
  const [resolutionNoteText, setResolutionNoteText] = useState("");
  const [assignDraft, setAssignDraft] = useState("");

  const saveTicket = async () => {
    if (!ticketForm.customer.trim() || !ticketForm.subject.trim()) return;
    if (useRealData) {
      await hqService.hqCreateSupportTicketForTenant(ticketForm.customer, ticketForm.subject, ticketForm.summary, ticketForm.priority, ticketForm.category);
      setTicketsRefreshTick(t => t + 1);
      setTicketForm({ customer: "", email: "", subject: "", priority: "medium", summary: "", category: "" });
      setShowTicketModal(false);
      return;
    }
    const t: Ticket = {
      id: `T-${String(allTickets.length + 1).padStart(3, "0")}`,
      customer: ticketForm.customer, email: ticketForm.email,
      subject: ticketForm.subject, priority: ticketForm.priority,
      status: "open", summary: ticketForm.summary || "Tiada ringkasan.", category: ticketForm.category,
      assigned: "-", createdAt: new Date().toISOString().split("T")[0], replies: [], internalNotes: [], attachments: []
    };
    setAllTickets(prev => [t, ...prev]);
    setTicketForm({ customer: "", email: "", subject: "", priority: "medium", summary: "", category: "" });
    setShowTicketModal(false);
  };
  const updateTicketStatus = async (id: string, status: hqService.SupportTicketStatus, resolutionNotes?: string) => {
    if (useRealData) { await hqService.updateSupportTicketStatus(id, status, resolutionNotes); setTicketsRefreshTick(t => t + 1); return; }
    setAllTickets(prev => prev.map(t => t.id === id ? { ...t, status, resolutionNotes: resolutionNotes ?? t.resolutionNotes } : t));
  };
  const resolveTicket = (id: string) => updateTicketStatus(id, "resolved", resolutionNoteText.trim() || undefined);
  const reopenTicket = (id: string) => updateTicketStatus(id, "open");
  const sendReply = async (id: string) => {
    if (!replyText.trim()) return;
    if (useRealData) {
      await hqService.replySupportTicket(id, user?.fullName || "HQ", replyText.trim());
      setReplyText("");
      setTicketsRefreshTick(t => t + 1);
      return;
    }
    const reply = { id: `r-${Date.now()}`, author: user?.fullName || "HQ", text: replyText.trim(), at: new Date().toLocaleString("ms-MY") };
    setAllTickets(prev => prev.map(t => t.id === id ? { ...t, status: "awaiting_customer" as const, replies: [...t.replies, reply] } : t));
    setReplyText("");
  };
  const assignTicket = async (id: string, name: string) => {
    if (!name.trim()) return;
    if (useRealData) { await hqService.assignSupportTicket(id, name); setTicketsRefreshTick(t => t + 1); return; }
    setAllTickets(prev => prev.map(t => t.id === id ? { ...t, assigned: name, status: t.status === "open" ? "in_progress" : t.status } : t));
  };
  const addInternalNote = async (id: string) => {
    if (!internalNoteText.trim()) return;
    if (useRealData) {
      await hqService.addTicketInternalNote(id, user?.fullName || "HQ", internalNoteText.trim());
      setInternalNoteText("");
      setTicketsRefreshTick(t => t + 1);
      return;
    }
    const note = { id: `n-${Date.now()}`, author: user?.fullName || "HQ", note: internalNoteText.trim(), at: new Date().toLocaleString("ms-MY") };
    setAllTickets(prev => prev.map(t => t.id === id ? { ...t, internalNotes: [...(t.internalNotes || []), note] } : t));
    setInternalNoteText("");
  };

  const filteredTickets = allTickets.filter(t =>
    ticketFilter === "all" ? true : ticketFilter === "unassigned" ? !t.assigned || t.assigned === "-" : t.status === ticketFilter
  );

  const totalMRR    = customers.reduce((s, c) => s + (c.status === "active" ? c.mrr : 0), 0);
  const activeCount = customers.filter(c => c.status === "active").length;
  const openCases   = allTickets.filter(t => t.status !== "resolved" && t.status !== "closed").length;
  const slaBreachedCount = allTickets.filter(t => hqService.ticketSlaState(t as hqService.SupportTicket) === "breached").length;
  const slaNearCount     = allTickets.filter(t => hqService.ticketSlaState(t as hqService.SupportTicket) === "near").length;
  const unassignedCount  = allTickets.filter(t => (!t.assigned || t.assigned === "-") && t.status !== "resolved" && t.status !== "closed").length;
  const avgResponseMins = (() => {
    const withResponse = allTickets.filter(t => t.firstResponseAt && t.createdAt);
    if (!withResponse.length) return null;
    const total = withResponse.reduce((s, t) => s + (new Date(t.firstResponseAt!).getTime() - new Date(t.createdAt).getTime()), 0);
    return Math.round(total / withResponse.length / 60000);
  })();
  const avgResolutionHours = (() => {
    const withResolution = allTickets.filter(t => t.resolvedAt && t.createdAt);
    if (!withResolution.length) return null;
    const total = withResolution.reduce((s, t) => s + (new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime()), 0);
    return Math.round(total / withResolution.length / 3600000);
  })();
  const totalAI     = customers.reduce((s, c) => s + c.aiUsage, 0);

  const handleCreateHQStaff = async () => {
    if (!staffEmail.trim() || !staffName.trim()) return;
    setStaffCreating(true);
    setStaffResult(null);
    try {
      const { supabase } = await import("../lib/supabase");
      const { data: sessionData } = await supabase!.auth.getSession();
      const jwt = sessionData?.session?.access_token || "";
      const res = await fetch("/api/admin/create-staff", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ email: staffEmail.trim(), fullName: staffName.trim(), role: "HQ_STAFF" }),
      });
      const data = await res.json() as any;
      if (data.success) {
        setStaffResult({ success: true, message: data.message, tempPassword: data.tempPassword });
        setStaffEmail(""); setStaffName("");
      } else {
        setStaffResult({ success: false, message: data.error || "Gagal cipta akaun." });
      }
    } catch (err: any) {
      setStaffResult({ success: false, message: err?.message || "Ralat sambungan." });
    } finally {
      setStaffCreating(false);
    }
  };

  // â"€â"€ Nav items (grouped for the simplified, section-based sidebar) â"€â"€
  const ownerNav = [
    { id: "dashboard" as HQPage,   label: "Dashboard",      icon: LayoutDashboard, section: "Utama" },
    { id: "customers" as HQPage,   label: "Pelanggan",      icon: Users, section: "Utama" },
    { id: "customer360" as HQPage,       label: "Customer 360",         icon: UserCheck, section: "Utama" },
    { id: "healthScores" as HQPage,      label: "Skor Kesihatan",       icon: Activity, section: "Utama" },
    { id: "billing" as HQPage,     label: "Pengebilan",     icon: CreditCard, section: "Operasi" },
    { id: "usage" as HQPage,       label: "Penggunaan",     icon: Activity, section: "Operasi" },
    { id: "support" as HQPage,     label: "Sokongan",       icon: Headphones, badge: openCases, section: "Operasi" },
    { id: "revenue" as HQPage,     label: "Hasil",          icon: DollarSign, section: "Operasi" },
    { id: "alertCenter" as HQPage,       label: "Pusat Amaran",         icon: Bell, badge: hqAlerts.filter(a => !a.resolvedAt).length, section: "Tadbir Urus" },
    { id: "walletDashboard" as HQPage,   label: "Dompet Sumber",        icon: Package, section: "Tadbir Urus" },
    { id: "governance" as HQPage,        label: "Tadbir Urus",          icon: ShieldAlert, section: "Tadbir Urus" },
    { id: "paymentGovernance" as HQPage, label: "Tadbir Bayaran",       icon: CreditCard, section: "Tadbir Urus" },
    { id: "storageGovernance" as HQPage, label: "Tadbir Storan",        icon: HardDrive, section: "Tadbir Urus" },
    { id: "aiCostGovernance" as HQPage,      label: "Tadbir Kos AI",        icon: DollarSign, section: "Tadbir Urus" },
    { id: "addonCatalog" as HQPage,      label: "Katalog Add-On",       icon: Package, section: "Tadbir Urus" },
    { id: "phase4Ops" as HQPage,         label: "Promosi & Analitik",   icon: TrendingUp, section: "Tadbir Urus" },
    { id: "dataMaskingGovernance" as HQPage, label: "Tadbir Topeng Data",   icon: Shield, section: "Tadbir Urus" },
    { id: "approvalCenter" as HQPage, label: "Pusat Kelulusan",   icon: ShieldAlert, section: "Tadbir Urus" },
    { id: "activityCenter" as HQPage, label: "Pusat Aktiviti",    icon: Clock, badge: hqActivityUnseenCount, section: "Tadbir Urus" },
    { id: "costCenter" as HQPage,     label: "Pusat Kos",         icon: TrendingUp, section: "Tadbir Urus" },
    { id: "knowledgeCenter" as HQPage, label: "Pusat Pengetahuan", icon: FileText, section: "Tadbir Urus" },
    { id: "website" as HQPage,     label: "Tapak Web",      icon: Globe, section: "Sistem" },
    { id: "system" as HQPage,      label: "Pusat Sistem",   icon: Server, section: "Sistem" },
    { id: "settings" as HQPage,    label: "Tetapan",        icon: Settings, section: "Sistem" },
  ];

  const staffNav = [
    { id: "dashboard" as HQPage,     label: "Dashboard",      icon: LayoutDashboard, section: "Utama" },
    { id: "customers" as HQPage,     label: "Pelanggan",      icon: Users, section: "Utama" },
    { id: "subscriptions" as HQPage, label: "Langganan",      icon: Repeat, section: "Utama" },
    { id: "support" as HQPage,       label: "Sokongan",       icon: Headphones, badge: openCases, section: "Utama" },
    { id: "approvalCenter" as HQPage, label: "Pusat Kelulusan", icon: ShieldAlert, section: "Utama" },
    { id: "activityCenter" as HQPage, label: "Pusat Aktiviti",  icon: Clock, badge: hqActivityUnseenCount, section: "Utama" },
    { id: "knowledgeCenter" as HQPage, label: "Pusat Pengetahuan", icon: FileText, section: "Utama" },
  ];

  const navItems = isStaff ? staffNav : ownerNav;
  const firstName = user?.fullName?.split(" ")[0] || "HQ";
  const navSections = Array.from(new Set(navItems.map((n: any) => n.section)));
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Selamat pagi" : hour < 18 ? "Selamat tengahari" : "Selamat petang";

  // â"€â"€ Sidebar (grouped sections, KERI-branded header) â"€â"€
  const Sidebar = ({ mobile }: { mobile?: boolean }) => (
    <aside className={`${mobile ? "w-full" : "w-60"} flex flex-col h-full bg-white border-r border-slate-200`}>
      {/* KERI brand mark */}
      <div className="px-5 py-5 border-b border-slate-100" style={{background:"linear-gradient(135deg,#0F2A22 0%,#16382C 100%)"}}>
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm" style={{background:"#5A9E7A"}}>
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-white text-sm leading-tight">MYKERANI HQ</p>
            <p className="text-[10px] text-emerald-200/80 truncate">Dikuasakan oleh KERI &middot; {isStaff ? "Operasi" : "Pentadbiran"}</p>
          </div>
        </div>
      </div>

      {/* Nav, grouped */}
      <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
        {navSections.map(section => (
          <div key={section} className="space-y-0.5">
            <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{section}</p>
            {navItems.filter((n: any) => n.section === section).map(({ id, label, icon: Icon, badge }: any) => {
              const active = activePage === id;
              return (
                <button key={id} onClick={() => { setActivePage(id); setSidebarOpen(false); }}
                  className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer relative ${active ? "bg-emerald-50 text-emerald-800 font-semibold" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}>
                  {active && <div className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full bg-emerald-600" />}
                  <Icon className={`w-4 h-4 shrink-0 ${active ? "text-emerald-700" : "text-slate-400"}`} />
                  <span className="flex-1 text-left">{label}</span>
                  {badge > 0 && (
                    <span className="bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center shrink-0">{badge}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="px-3 py-4 border-t border-slate-100">
        <div className="flex items-center space-x-3 px-3 py-2.5 rounded-xl bg-emerald-50/40">
          <div className="w-7 h-7 rounded-full bg-emerald-700 text-white flex items-center justify-center text-xs font-bold shrink-0">
            {firstName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-800 truncate">{user?.fullName || "HQ User"}</p>
            <p className="text-[10px] text-slate-400">{isStaff ? "HQ_STAFF" : "HQ_OWNER"}</p>
          </div>
          <button onClick={() => signOut()} title="Log Keluar"
            className="p-1 hover:bg-rose-50 hover:text-rose-500 text-slate-300 rounded-lg transition cursor-pointer">
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="h-screen flex flex-col overflow-hidden" id="hq_root" style={{background:"#F4F8F5"}}>
      <style>{`
        #hq_root .bg-emerald-700,.bg-emerald-700{background-color:#5A9E7A!important}
        #hq_root .bg-emerald-800{background-color:#3D7057!important}
        #hq_root .bg-emerald-600{background-color:#6AAD8A!important}
        #hq_root .bg-emerald-50,.bg-emerald-50{background-color:#DFF0E8!important}
        #hq_root .bg-emerald-100{background-color:#CCE8D9!important}
        #hq_root .text-emerald-700{color:#2C5040!important}
        #hq_root .text-emerald-800{color:#1A3D2B!important}
        #hq_root .text-emerald-600{color:#3D7057!important}
        #hq_root .text-emerald-900{color:#122B1E!important}
        #hq_root .border-emerald-100{border-color:#CCE8D9!important}
        #hq_root .border-emerald-200{border-color:#B3D9C5!important}
        #hq_root .hover\\:bg-emerald-100:hover{background-color:#CCE8D9!important}
        #hq_root .hover\\:bg-emerald-800:hover{background-color:#3D7057!important}
        #hq_root .focus\\:border-emerald-400:focus{border-color:#7DC4A5!important}
        #hq_root .text-emerald-500{color:#5A9E7A!important}
        #hq_root aside{background:#fff}
        #hq_root .bg-white{background:#fff!important}
      `}</style>

      {/* Mobile top header */}
      <header className="md:hidden bg-white border-b px-3 py-3 flex items-center justify-between shrink-0" style={{borderColor:"#CCE8D9"}}>
        <div className="flex items-center space-x-2">
          <button onClick={() => setSidebarOpen(true)} aria-label="Buka menu"
            className="p-1.5 rounded-xl text-slate-500 hover:bg-slate-50 cursor-pointer">
            <Menu className="w-[18px] h-[18px]" />
          </button>
          <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 shadow-sm" style={{background:"#5A9E7A"}}>
            <Zap className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <p className="font-bold text-slate-900 text-sm leading-tight">MYKERANI HQ</p>
            <p className="text-[10px]" style={{color:"#5A9E7A"}}>{isStaff ? "Kakitangan HQ" : "Pemilik HQ"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold" style={{color:"#2C5040"}}>{navItems.find((n: any) => n.id === activePage)?.label}</span>
          {/* Bell */}
          <div className="relative">
            <button onClick={() => setShowNotifPanel(p => !p)}
              className="relative p-1.5 rounded-xl border border-slate-200 text-slate-400 hover:text-indigo-500 bg-white cursor-pointer transition">
              <Bell className="w-3.5 h-3.5" />
              {notif.unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {notif.unreadCount > 9 ? "9+" : notif.unreadCount}
                </span>
              )}
            </button>
          </div>
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{background:"#5A9E7A"}}>
            {firstName.charAt(0).toUpperCase()}
          </div>
        </div>
      </header>

      {/* HQ Notification Panel */}
      {showNotifPanel && (
        <div className="fixed inset-0 z-50" onClick={() => setShowNotifPanel(false)}>
          <div className="absolute top-14 right-3 w-80 max-h-[75vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-slate-900">Notifikasi HQ</p>
                {notif.unreadCount > 0 && (
                  <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">{notif.unreadCount} baru</span>
                )}
              </div>
              <button onClick={notif.markAllRead} className="text-[11px] text-indigo-500 font-semibold cursor-pointer hover:text-indigo-700">Tandai semua</button>
            </div>
            <div className="overflow-y-auto flex-1">
              {notif.notifs.length === 0 ? (
                <div className="py-10 text-center">
                  <CheckCircle2 className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">Tiada notifikasi</p>
                </div>
              ) : (
                notif.notifs.map(n => {
                  const bar = n.severity === "critical" ? "bg-red-500" : n.severity === "warn" ? "bg-amber-400" : "bg-blue-400";
                  const bg  = n.read ? "bg-white" : n.severity === "critical" ? "bg-red-50" : n.severity === "warn" ? "bg-amber-50/60" : "bg-blue-50/40";
                  return (
                    <div key={n.id} className={`flex gap-3 px-4 py-3 border-b border-slate-50 cursor-pointer hover:bg-slate-50 ${bg}`}
                      onClick={() => { notif.markRead(n.id); setShowNotifPanel(false); if (n.action) setActivePage(n.action as any); }}>
                      <div className={`w-1 rounded-full shrink-0 self-stretch ${bar}`} />
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-start justify-between gap-1">
                          <p className={`text-xs font-bold ${n.read ? "text-slate-600" : "text-slate-900"}`}>{n.title}</p>
                          <button onClick={e => { e.stopPropagation(); notif.dismiss(n.id); }} className="text-slate-300 hover:text-slate-500 cursor-pointer shrink-0">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-snug">{n.body}</p>
                        <p className="text-[10px] text-slate-400">{fmtNotifTime(n.at)}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {notif.notifs.length > 0 && (
              <div className="px-4 py-2.5 border-t border-slate-100 flex justify-end">
                <button onClick={notif.clearAll} className="text-[11px] text-slate-400 cursor-pointer hover:text-slate-600">Padam semua</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile nav drawer — gives mobile access to every page, not just the 5-item bottom bar */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex" onClick={() => setSidebarOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-72 max-w-[85vw] h-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <Sidebar mobile />
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <div className="hidden md:flex">
          <Sidebar />
        </div>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto" id="hq_main">
          <div className="max-w-5xl mx-auto p-4 md:p-5 pb-28 md:pb-10 space-y-4 md:space-y-5">

            {/* â•â•â•â• DASHBOARD â•â•â•â• */}
            {activePage === "dashboard" && (() => {
              // â"€â"€ Intelligence computations â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
              // hq_alerts (churn_risk) is the single source of truth — Dashboard must not
              // recompute churn risk independently, or it can disagree with the Alert Center.
              const churnAlerts  = useRealData ? hqAlerts.filter(a => a.alertType === "churn_risk" && !a.resolvedAt) : [];
              const mrrAtRisk    = useRealData
                ? churnAlerts.reduce((s, a) => s + (customers.find(c => c.id === a.tenantId)?.mrr || 0), 0)
                : customers.filter(c => c.status === "suspended").reduce((s, c) => s + c.mrr, 0);
              const arr          = totalMRR * 12;
              const growthRate   = 0.05;
              const forecast     = [1, 2, 3].map(m => Math.round(totalMRR * Math.pow(1 + growthRate, m)));
              const revenueScore = totalMRR === 0 ? 0 : Math.min(100, Math.round((totalMRR / (totalMRR + mrrAtRisk + 1)) * 100));

              // Upsell targets: active customers using >75% AI credits or storage
              const upsellTargets = customers
                .filter(c => c.status === "active")
                .map(c => {
                  const plan   = plans.find(p => p.name === c.plan);
                  const aiPct  = plan && plan.aiCredits > 0 ? c.aiUsage / plan.aiCredits : 0;
                  const stPct  = plan && plan.storageGB > 0 ? c.storageGB / plan.storageGB : 0;
                  const score  = Math.max(aiPct, stPct);
                  const reason = aiPct >= stPct ? `AI ${Math.round(aiPct*100)}% digunakan` : `Storan ${Math.round(stPct*100)}% digunakan`;
                  const nextPlan = plans.find(p => p.price > (plan?.price || 0));
                  return { ...c, aiPct, stPct, score, reason, nextPlan };
                })
                .filter(c => c.score >= 0.75)
                .sort((a, b) => b.score - a.score);

              // Churn risks — derived from hq_alerts (churn_risk), the single source of truth
              // shared with the Alert Center, so the two views can never disagree.
              const churnRisks = useRealData
                ? churnAlerts
                    .map(a => {
                      const c = customers.find(cust => cust.id === a.tenantId);
                      return c ? {
                        ...c,
                        riskLevel: (a.severity === "high") ? "high" : "medium" as "high"|"medium",
                        riskReason: a.message,
                        potentialLoss: c.mrr,
                      } : null;
                    })
                    .filter((c): c is NonNullable<typeof c> => c !== null)
                    .sort((a, b) => (b.riskLevel === "high" ? 1 : 0) - (a.riskLevel === "high" ? 1 : 0))
                : customers
                    .filter(c => c.status === "suspended" || c.attention || c.healthRiskLevel === "high" || allTickets.some(t => t.customer === c.name && t.status !== "resolved"))
                    .map(c => ({
                      ...c,
                      riskLevel: (c.status === "suspended" || c.healthRiskLevel === "high") ? "high" : "medium" as "high"|"medium",
                      riskReason: c.status === "suspended" ? "Digantung - tiada bayaran" : (c.healthReasons && c.healthReasons.length > 0) ? c.healthReasons[0] : c.attention ? "Perlu perhatian" : "Tiket sokongan terbuka",
                      potentialLoss: c.mrr,
                    }))
                    .sort((a, b) => (b.riskLevel === "high" ? 1 : 0) - (a.riskLevel === "high" ? 1 : 0));

              // Today's briefing items — categorized so KERI can speak action-first:
              // Tindakan (do now) > Risiko > Peluang > Sokongan > Hasil. Same source data
              // as before (hq_alerts / churn / upsell), just reframed as KERI's voice.
              type BriefingCategory = "tindakan" | "risiko" | "peluang" | "sokongan" | "hasil";
              const categoryRank: Record<BriefingCategory, number> = { tindakan: 0, risiko: 1, peluang: 2, sokongan: 3, hasil: 4 };
              const categoryLabel: Record<BriefingCategory, string> = { tindakan: "Tindakan", risiko: "Risiko", peluang: "Peluang", sokongan: "Sokongan", hasil: "Hasil" };
              const unresolvedAlerts = useRealData ? hqAlerts.filter(a => !a.resolvedAt) : [];
              const webhookAlerts = unresolvedAlerts.filter(a => a.alertType === "webhook_failed");
              const upsellPotential = upsellTargets.reduce((s,c)=>s+(c.nextPlan?.price||0)-(c.mrr),0);
              const briefing: { icon: string; text: string; action: () => void; urgent: boolean; category: BriefingCategory }[] = [];
              if (webhookAlerts.length > 0) briefing.push({ icon: "!", text: `Saya kesan kegagalan webhook: ${webhookAlerts[0].message}`, action: () => setActivePage("billing"), urgent: true, category: "tindakan" });
              if (churnRisks.filter(r => r.riskLevel === "high").length > 0) briefing.push({ icon: "!", text: `${churnRisks.filter(r=>r.riskLevel==="high").length} pelanggan digantung — RM ${mrrAtRisk} MRR terancam. Saya cadangkan aktifkan semula segera.`, action: () => setActivePage("customers"), urgent: true, category: "tindakan" });
              if (churnRisks.filter(r => r.riskLevel === "medium").length > 0) briefing.push({ icon: "R", text: `${churnRisks.filter(r=>r.riskLevel==="medium").length} pelanggan menunjukkan tanda risiko churn sederhana — ${churnRisks.find(r=>r.riskLevel==="medium")?.name} antaranya.`, action: () => setActivePage("customers"), urgent: false, category: "risiko" });
              if (upsellTargets.length > 0) briefing.push({ icon: "U", text: `${upsellTargets.length} pelanggan hampir had plan mereka — peluang upsell bernilai +RM ${upsellPotential}/bln jika dinaiktaraf.`, action: () => {}, urgent: false, category: "peluang" });
              if (openCases > 0) briefing.push({ icon: "S", text: `${openCases} tiket sokongan sedang menunggu respons anda.`, action: () => setActivePage("support"), urgent: openCases >= 3, category: "sokongan" });
              briefing.push({ icon: "H", text: `Hasil bulanan stabil di RM ${totalMRR.toLocaleString()}, dijangka RM ${forecast[2]?.toLocaleString() ?? totalMRR.toLocaleString()} dalam 3 bulan.`, action: () => setActivePage("revenue"), urgent: false, category: "hasil" });
              if (briefing.length === 1) briefing.unshift({ icon: "OK", text: "Semua baik hari ini — tiada tindakan segera diperlukan.", action: () => {}, urgent: false, category: "tindakan" });
              briefing.sort((a, b) => categoryRank[a.category] - categoryRank[b.category]);

              const topUrgent = briefing.find(b => b.urgent) || briefing[0];

              return (
              <div className="space-y-5" id="hq_dashboard">

                {/* KERI Command Center hero — KERI speaks first, in natural language, action-first */}
                <div className="rounded-2xl p-5 space-y-4 relative overflow-hidden" style={{background:"linear-gradient(135deg,#0A1F18 0%,#0F2A22 45%,#16382C 75%,#1E4A38 100%)"}}>
                  <div className="pointer-events-none absolute -top-10 -right-10 w-44 h-44 rounded-full" style={{background:"radial-gradient(circle,rgba(90,158,122,0.35) 0%,transparent 70%)"}} />
                  <div className="flex items-start justify-between gap-3 relative">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg" style={{background:"#5A9E7A", boxShadow:"0 0 0 6px rgba(90,158,122,0.18), 0 8px 20px rgba(0,0,0,0.25)"}}>
                          <Zap className="w-7 h-7 text-white" />
                        </div>
                        <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2" style={{borderColor:"#0F2A22"}} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-black uppercase tracking-wider text-white">KERI</p>
                          <span className="text-[9px] font-bold text-emerald-300/90 bg-emerald-900/40 border border-emerald-700/40 px-1.5 py-0.5 rounded-full">AI Financial Clerk</span>
                        </div>
                        <h1 className="text-base font-bold text-emerald-100/90 leading-tight mt-0.5">KERI Command Center &middot; {greeting}, {firstName}</h1>
                        <p className="text-[11px] text-emerald-100/50 mt-0.5">{new Date().toLocaleDateString("ms-MY",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</p>
                      </div>
                    </div>
                    {!isStaff && (
                      <button onClick={() => { setActivePage("customers"); openAddCustomer(); }}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-white text-emerald-800 hover:bg-emerald-50 rounded-xl text-xs font-bold transition cursor-pointer shadow-sm">
                        <Plus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Tambah Pelanggan</span>
                      </button>
                    )}
                  </div>

                  {/* KERI's spoken synthesis — one natural-language sentence over everything it sees */}
                  <div className="rounded-xl px-3.5 py-3 bg-black/20 border border-white/10 relative">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300/70 mb-1">KERI berkata</p>
                    <p className="text-sm text-white leading-relaxed">
                      "{churnRisks.length > 0 ? `Saya kesan ${churnRisks.length} pelanggan berisiko (RM ${mrrAtRisk.toLocaleString()} MRR terancam)` : "Portfolio anda sihat hari ini"}{upsellTargets.length > 0 ? `, dan ${upsellTargets.length} peluang upsell bernilai +RM ${upsellPotential.toLocaleString()}/bln` : ""}{openCases > 0 ? `. ${openCases} tiket sokongan menunggu respons anda` : ""}."
                    </p>
                  </div>

                  {/* Action-first list — Tindakan > Risiko > Peluang > Sokongan > Hasil */}
                  <div className="space-y-1.5">
                    {briefing.map((b, i) => (
                      <button key={i} onClick={b.action}
                        className={`w-full flex items-center gap-3 text-left rounded-xl px-3 py-2.5 cursor-pointer transition group ${b.urgent ? "bg-red-500/15 hover:bg-red-500/25" : i === 0 ? "bg-white/10 hover:bg-white/15" : "hover:bg-white/5"}`}>
                        <div className={`w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black shrink-0 ${b.urgent ? "bg-red-500 text-white" : "bg-emerald-600/80 text-white"}`}>
                          {b.icon}
                        </div>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-300/60 shrink-0 w-12">{categoryLabel[b.category]}</span>
                        <p className={`text-[11px] flex-1 ${b.urgent ? "text-white font-semibold" : "text-emerald-50/90"}`}>{b.text}</p>
                        <ChevronRight className="w-3 h-3 text-white/30 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Risks — Churn Risk */}
                {!isStaff && churnRisks.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black uppercase tracking-wider text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-full">Risiko</span>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">Risiko Churn</h3>
                          <p className="text-[11px] text-slate-400 mt-0.5">Pelanggan berisiko berhenti - ambil tindakan sekarang</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                        RM {mrrAtRisk.toLocaleString()} terancam
                      </span>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {churnRisks.slice(0, 4).map(c => (
                        <div key={c.id} className={`px-5 py-3.5 flex items-center gap-4 ${c.riskLevel === "high" ? "bg-red-50/30" : ""}`}>
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${c.riskLevel === "high" ? "bg-red-100 text-red-600" : "bg-amber-50 text-amber-600"}`}>
                            {c.name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-800 truncate">{c.name}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="text-[10px] text-slate-400">{c.plan} &middot; RM {c.mrr}/bln</span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${c.riskLevel === "high" ? "text-red-600 bg-red-50" : "text-amber-600 bg-amber-50"}`}>{c.riskReason}</span>
                            </div>
                          </div>
                          <button onClick={() => setActivePage("customers")}
                            className={`shrink-0 px-3 py-1.5 text-[10px] font-bold rounded-lg cursor-pointer transition border ${c.riskLevel === "high" ? "bg-red-500 text-white hover:bg-red-600 border-red-500" : "bg-white text-slate-600 hover:bg-slate-50 border-slate-200"}`}>
                            {c.riskLevel === "high" ? "Aktifkan" : "Semak"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Opportunities — Upsell Radar */}
                {!isStaff && upsellTargets.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-full">Peluang</span>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">Radar Upsell</h3>
                          <p className="text-[11px] text-slate-400 mt-0.5">Pelanggan hampir had - peluang naik taraf plan</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">{upsellTargets.length} peluang</span>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {upsellTargets.slice(0, 5).map(c => (
                        <div key={c.id} className="px-5 py-3.5 flex items-center gap-4">
                          <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-700 font-bold text-sm shrink-0">
                            {c.name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-800 truncate">{c.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-slate-400">{c.plan}</span>
                              <span className="text-[10px] font-semibold text-amber-600">{c.reason}</span>
                            </div>
                            <div className="h-1 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                              <div className={`h-full rounded-full ${c.score >= 0.95 ? "bg-red-500" : "bg-amber-400"}`} style={{width:`${Math.min(c.score*100,100)}%`}} />
                            </div>
                          </div>
                          {c.nextPlan && (
                            <div className="text-right shrink-0">
                              <p className="text-[10px] text-slate-400">Naik ke</p>
                              <p className="text-xs font-bold text-emerald-700">{c.nextPlan.name}</p>
                              <p className="text-[10px] text-slate-500">+RM {c.nextPlan.price - c.mrr}/bln</p>
                            </div>
                          )}
                          <button onClick={() => setActivePage("customers")}
                            className="shrink-0 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-[10px] font-bold rounded-lg cursor-pointer transition">
                            Hubungi
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Support — Open tickets */}
                {allTickets.filter(t => t.status !== "resolved").length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-full">Sokongan</span>
                        <h3 className="text-sm font-bold text-slate-900">Tiket Sokongan Terbuka</h3>
                      </div>
                      <button onClick={() => setActivePage("support")} className="text-xs text-emerald-700 font-semibold cursor-pointer hover:text-emerald-900">Urus -&gt;</button>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {allTickets.filter(t => t.status !== "resolved").slice(0, 3).map(t => (
                        <div key={t.id} className="px-5 py-3 flex items-start gap-3">
                          <StatusBadge status={t.priority} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-800">{t.subject}</p>
                            <p className="text-[11px] text-slate-400">{t.customer}</p>
                          </div>
                          <button onClick={() => setActivePage("support")} className="text-slate-300 hover:text-emerald-600 cursor-pointer shrink-0">
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Revenue — Kesihatan Hasil, comes after actions/risks/opportunities/support */}
                {!isStaff && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 col-span-2 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-full">Hasil</span>
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Kesihatan Hasil</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${revenueScore >= 80 ? "bg-emerald-500" : revenueScore >= 50 ? "bg-amber-500" : "bg-red-500"}`} />
                          <span className={`text-xs font-bold ${revenueScore >= 80 ? "text-emerald-600" : revenueScore >= 50 ? "text-amber-600" : "text-red-600"}`}>
                            Skor {revenueScore}/100
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div>
                          <p className="text-[10px] text-slate-400">MRR Semasa</p>
                          <p className="text-lg font-black text-slate-900">RM {totalMRR.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400">MRR Terancam</p>
                          <p className={`text-lg font-black ${mrrAtRisk > 0 ? "text-red-500" : "text-slate-300"}`}>RM {mrrAtRisk.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400">ARR Tahunan</p>
                          <p className="text-lg font-black text-slate-900">RM {arr.toLocaleString()}</p>
                        </div>
                      </div>
                      {/* 3-month forecast */}
                      <div className="border-t border-slate-50 pt-3">
                        <p className="text-[10px] text-slate-400 mb-2">Ramalan MRR (5% pertumbuhan/bln)</p>
                        <div className="grid grid-cols-3 gap-2">
                          {forecast.map((v, i) => {
                            const maxV = Math.max(...forecast, totalMRR, 1);
                            const h = Math.max(8, Math.round((v / maxV) * 48));
                            return (
                              <div key={i} className="flex flex-col items-center gap-1">
                                <p className="text-[10px] font-bold text-emerald-700">RM {v.toLocaleString()}</p>
                                <div className="w-full bg-emerald-100 rounded-lg overflow-hidden" style={{height:"48px"}}>
                                  <div className="w-full bg-emerald-500 rounded-lg transition-all" style={{height:`${h}px`, marginTop:`${48-h}px`}} />
                                </div>
                                <p className="text-[9px] text-slate-400">Bln +{i+1}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <MetricCard label="Pelanggan Aktif"  value={activeCount}  sub={`${customers.length} jumlah`}   icon={Users}      color="teal"   trend="up" />
                    <MetricCard label="Kes Sokongan"     value={openCases}    sub="perlu tindakan"                  icon={Headphones} color="amber" />
                  </div>
                )}

                {/* Staff metrics */}
                {isStaff && (
                  <div className="grid grid-cols-2 gap-3">
                    <MetricCard label="Pelanggan Aktif"   value={activeCount}  sub="memerlukan sokongan"   icon={Users}      color="teal" />
                    <MetricCard label="Kes Terbuka"       value={openCases}    sub="perlu tindakan segera" icon={Headphones} color="amber" />
                    <MetricCard label="Perlu Aktifkan"    value={customers.filter(c=>c.status==="suspended").length} sub="akaun digantung" icon={UserCheck} color="red" />
                    <MetricCard label="Perlu Perhatian"   value={customers.filter(c=>c.attention).length}  sub="semak butiran" icon={AlertTriangle} color="violet" />
                  </div>
                )}

                {/* Quick actions */}
                {!isStaff && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: "Tambah Pelanggan", icon: Plus,       action: () => { setActivePage("customers"); openAddCustomer(); }, color: "bg-emerald-700 text-white" },
                      { label: "Urus Sokongan",    icon: Headphones, action: () => setActivePage("support"),    color: "bg-white border border-slate-200 text-slate-700" },
                      { label: "Lihat Revenue",    icon: TrendingUp, action: () => setActivePage("revenue"),    color: "bg-white border border-slate-200 text-slate-700" },
                      { label: "AI Router",        icon: Zap,        action: () => setActivePage("system"),     color: "bg-white border border-slate-200 text-slate-700" },
                    ].map(({ label, icon: Icon, action, color }) => (
                      <button key={label} onClick={action}
                        className={`flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-bold shadow-sm transition cursor-pointer ${color}`}>
                        <Icon className="w-4 h-4 shrink-0" /><span>{label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              );
            })()}

            {/* â•â•â•â• CUSTOMERS â•â•â•â• */}
            {activePage === "customers" && (
              <div className="space-y-4" id="hq_customers">
                <div className="flex items-center justify-between">
                  <h1 className="text-xl font-bold text-slate-900">Pelanggan</h1>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Cari pelanggan..."
                        className="pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-xl outline-none focus:border-emerald-400 bg-white w-44" />
                    </div>
                    <button onClick={openAddCustomer} className="flex items-center space-x-1.5 px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-sm">
                      <Plus className="w-3.5 h-3.5" /><span>Tambah</span>
                    </button>
                  </div>
                </div>

                {customersLoading ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center shadow-sm">
                    <RefreshCw className="w-6 h-6 text-slate-300 mx-auto mb-3 animate-spin" />
                    <p className="text-sm font-semibold text-slate-400">Memuatkan pelanggan...</p>
                  </div>
                ) : customers.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center shadow-sm">
                    <Building2 className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-slate-500">Tiada pelanggan lagi</p>
                    <p className="text-xs text-slate-400 mt-1">Pelanggan yang mendaftar akan muncul di sini</p>
                    <button onClick={openAddCustomer} className="mt-4 px-5 py-2.5 bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-emerald-800 transition">
                      Tambah Pelanggan Pertama
                    </button>
                  </div>
                ) : (() => {
                  const filtered = customers
                    .filter(c => !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.email.toLowerCase().includes(searchQuery.toLowerCase()))
                    .slice()
                    .sort((a, b) => (b.joinedAt || "").localeCompare(a.joinedAt || ""));
                  const totalCount = filtered.length;
                  const totalPages = Math.max(1, Math.ceil(totalCount / customersPageSize));
                  const page = Math.min(customersPage, totalPages);
                  const pageRows = filtered.slice((page - 1) * customersPageSize, page * customersPageSize);
                  return (
                  <>
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Jumlah Pelanggan</p>
                        <p className="text-xl font-bold text-slate-900">{totalCount.toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>Papar</span>
                        <select value={customersPageSize} onChange={e => { setCustomersPageSize(Number(e.target.value)); setCustomersPage(1); }}
                          className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white outline-none focus:border-emerald-400">
                          {[10, 20, 50, 100, 500, 1000].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <span>setiap halaman</span>
                      </div>
                    </div>
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="grid grid-cols-12 px-5 py-3 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <div className="col-span-3">Pelanggan</div>
                      <div className="col-span-2">Plan</div>
                      <div className="col-span-1">Status</div>
                      <div className="col-span-1 hidden md:block">Mula</div>
                      <div className="col-span-2 hidden md:block">Bayaran Seterusnya</div>
                      <div className="col-span-1 hidden lg:block">Dibayar</div>
                      <div className="col-span-2">Tindakan</div>
                    </div>
                    {pageRows.map(c => (
                        <div key={c.id} className="grid grid-cols-12 px-5 py-4 border-b border-slate-50 hover:bg-slate-50 transition items-center">
                          <div className="col-span-3 flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 font-bold text-sm flex items-center justify-center shrink-0">
                              {c.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-800 truncate">{c.name}</p>
                              <p className="text-[10px] text-slate-400 truncate">{displayEmail(c.email)}</p>
                              {c.attention && <span className="text-[9px] text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded-full">Perlu Perhatian</span>}
                              {typeof c.healthScore === "number" && (
                                <span className={`ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                  c.healthRiskLevel === "high" ? "text-red-600 bg-red-50" :
                                  c.healthRiskLevel === "medium" ? "text-amber-600 bg-amber-50" :
                                  "text-emerald-600 bg-emerald-50"
                                }`} title={c.healthReasons?.join(", ")}>
                                  Kesihatan: {c.healthScore}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="col-span-2">
                            <span className="text-xs font-semibold text-slate-600">{c.plan || "—"}</span>
                          </div>
                          <div className="col-span-1">
                            <StatusBadge status={c.status} />
                          </div>
                          <div className="col-span-1 hidden md:block">
                            <span className="text-xs text-slate-500">{c.joinedAt || "—"}</span>
                          </div>
                          <div className="col-span-2 hidden md:block">
                            <span className="text-xs text-slate-500">{c.renewal || "—"}</span>
                          </div>
                          <div className="col-span-1 hidden lg:block">
                            <span className="text-xs font-semibold text-slate-600">RM {c.totalPaidMyr.toLocaleString()}</span>
                          </div>
                          <div className="col-span-2 flex items-center gap-1.5">
                            <button onClick={() => setSelectedCustomer(c)} className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-bold cursor-pointer transition">Buka</button>
                            <button onClick={() => toggleStatus(c.id)}
                              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer transition ${c.status === "suspended" ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-700" : "bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-500"}`}>
                              {c.status === "suspended" ? "Aktif" : "Gantung"}
                            </button>
                          </div>
                        </div>
                      ))}
                    {totalCount === 0 && searchQuery && (
                      <div className="p-10 text-center text-xs text-slate-400">Tiada hasil carian untuk "{searchQuery}"</div>
                    )}
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between px-2">
                      <button disabled={page <= 1} onClick={() => setCustomersPage(p => Math.max(1, p - 1))}
                        className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 disabled:opacity-40 cursor-pointer hover:bg-slate-50">Sebelum</button>
                      <span className="text-xs text-slate-500">Halaman {page} / {totalPages}</span>
                      <button disabled={page >= totalPages} onClick={() => setCustomersPage(p => Math.min(totalPages, p + 1))}
                        className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 disabled:opacity-40 cursor-pointer hover:bg-slate-50">Seterusnya</button>
                    </div>
                  )}
                  </>
                  );
                })()}
              </div>
            )}

            {/* â•â•â•â• BILLING (HQ_OWNER only) â•â•â•â• */}
            {activePage === "billing" && !isStaff && (
              <div className="space-y-5" id="hq_billing">
                <h1 className="text-xl font-bold text-slate-900">Pengebilan</h1>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <MetricCard label="Hasil Bulan Ini"     value={`RM ${totalMRR.toLocaleString()}`} icon={DollarSign} color="emerald" trend="up" />
                  <MetricCard label="Perbaharui Minggu Ini" value="2"                               icon={RefreshCw}  color="amber" />
                  <MetricCard label="Akaun Tertunggak"    value="1"                                 icon={AlertCircle} color="red" />
                </div>

                {/* Plans */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900">Plan Langganan</h3>
                    <button onClick={openCreatePlan} className="flex items-center space-x-1 px-3 py-2 bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-emerald-800 transition">
                      <Plus className="w-3.5 h-3.5" /><span>Cipta Plan</span>
                    </button>
                  </div>
                  <div className="grid md:grid-cols-3 gap-3">
                    {plans.map(p => {
                      const activeCount = customers.filter(c => c.plan === p.name && c.status === "active").length;
                      return (
                        <div key={p.id} className={`border rounded-2xl p-4 space-y-2 relative ${p.featured ? "border-emerald-300 bg-emerald-50/30" : "border-slate-200 bg-white"}`}>
                          {p.featured && <span className="absolute top-3 right-3 text-[9px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">Popular</span>}
                          {p.isTrial && <span className="absolute top-3 right-3 text-[9px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">Percubaan</span>}
                          <div className="flex items-center justify-between pr-14">
                            <span className="font-bold text-slate-900">{p.name}</span>
                          </div>
                          {p.isCustomPricing ? (
                            <p className="text-lg font-bold text-slate-900">Harga Tersuai</p>
                          ) : (
                            <p className="text-2xl font-bold text-slate-900">RM {p.price.toLocaleString()}<span className="text-xs text-slate-400 font-normal">/bln</span></p>
                          )}
                          <div className="text-[11px] text-slate-400 space-y-0.5">
                            <p>AI: {p.aiCredits.toLocaleString()} kredit/bln</p>
                            <p>OCR: {(p.ocrCredits ?? 0).toLocaleString()} kredit/bln</p>
                            <p>Storan: {p.storageGB} GB</p>
                            <p>Pengguna: sehingga {p.maxUsers}</p>
                            {p.isTrial && p.trialDays > 0 && <p>Tempoh percubaan: {p.trialDays} hari</p>}
                            {isMockUser && <p className="text-emerald-600 font-semibold">{activeCount} pelanggan aktif</p>}
                          </div>
                          {(p.features?.length > 0 || p.limitations?.length > 0) && (
                            <div className="text-[10px] space-y-1 pt-1 border-t border-slate-100">
                              {p.features?.length > 0 && (
                                <ul className="space-y-0.5">
                                  {p.features.map((f, i) => <li key={i} className="text-emerald-700">+ {f}</li>)}
                                </ul>
                              )}
                              {p.limitations?.length > 0 && (
                                <ul className="space-y-0.5">
                                  {p.limitations.map((l, i) => <li key={i} className="text-slate-400">- {l}</li>)}
                                </ul>
                              )}
                            </div>
                          )}
                          <div className="flex gap-2 pt-1">
                            <button onClick={() => openEditPlan(p)} className="flex-1 py-1.5 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 cursor-pointer hover:bg-slate-50 transition flex items-center justify-center gap-1">
                              <Edit3 className="w-3 h-3" />Edit
                            </button>
                            <button onClick={() => setDeletingPlanId(p.id)} className="py-1.5 px-3 border border-red-100 rounded-lg text-[10px] font-bold text-red-400 cursor-pointer hover:bg-red-50 transition">
                              Padam
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {plans.length === 0 && (
                      <div className="col-span-3 py-12 text-center">
                        <Package className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                        <p className="text-sm font-semibold text-slate-400">Tiada plan lagi</p>
                        <p className="text-xs text-slate-300 mt-1">Klik "Cipta Plan" untuk mulakan</p>
                        <button onClick={openCreatePlan} className="mt-4 px-4 py-2 bg-emerald-700 text-white text-xs font-bold rounded-xl cursor-pointer hover:bg-emerald-800 transition">
                          Cipta Plan Pertama
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Pending manual payment approvals */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-amber-600" />
                    Menunggu Kelulusan Pembayaran
                    {pendingApprovals.length > 0 && <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">{pendingApprovals.length}</span>}
                  </h3>
                  {pendingApprovals.length === 0 ? (
                    <div className="text-center py-6">
                      <Receipt className="w-7 h-7 text-slate-200 mx-auto mb-2" />
                      <p className="text-xs text-slate-400">Tiada pembayaran menunggu kelulusan</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {pendingApprovals.map(a => (
                        <div key={a.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-xl">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-800 truncate">{a.tenantName} — {a.kind === "addon" ? a.addonLabel : a.planName}</p>
                            <p className="text-[10px] text-slate-400 truncate">
                              RM {a.amountMyr.toLocaleString()} · {a.method === "manual" ? "Manual (slip)" : "Chip Asia"} · dihantar oleh {a.submittedByName || a.submittedByEmail}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {a.slipPath && (
                              <button onClick={() => viewSlip(a.slipPath)} className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold cursor-pointer transition">Lihat Slip</button>
                            )}
                            <button onClick={() => reviewApproval(a.id, true)} className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-bold cursor-pointer transition">Lulus</button>
                            <button onClick={() => reviewApproval(a.id, false)} className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-[10px] font-bold cursor-pointer transition">Tolak</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {slipPreviewUrl && (
                  <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" onClick={() => setSlipPreviewUrl(null)}>
                    <div className="bg-white rounded-2xl p-4 max-w-lg w-full" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-bold text-slate-900">Slip Pembayaran</h4>
                        <button onClick={() => setSlipPreviewUrl(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">✕</button>
                      </div>
                      <img src={slipPreviewUrl} alt="Slip pembayaran" className="w-full rounded-xl border border-slate-100" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* â•â•â•â• USAGE (HQ_OWNER only) â•â•â•â• */}
            {activePage === "usage" && !isStaff && (
              <div className="space-y-5" id="hq_usage">
                <h1 className="text-xl font-bold text-slate-900">Penggunaan Platform</h1>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <MetricCard label="Jumlah Kredit AI"  value={totalAI.toLocaleString()}      sub="semua pelanggan bulan ini" icon={Zap}      color="amber" />
                  <MetricCard label="Jumlah Storan"     value={`${customers.reduce((s,c)=>s+c.storageGB,0).toFixed(1)} GB`} sub="digunakan" icon={HardDrive} color="slate" />
                  <MetricCard label="OCR Digunakan"     value={(usageByFeature.find(f => f.feature === "ocr")?.usageCount ?? 0).toLocaleString()} sub="imbasan bulan ini" icon={Brain} color="violet" />
                </div>

                {/* Resource Wallet Dashboard (Module 11) — relocated to its own dedicated page: "walletDashboard" */}
                {useRealData && (
                  <button onClick={() => setActivePage("walletDashboard")}
                    className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center justify-between cursor-pointer hover:border-emerald-300 transition">
                    <div className="text-left">
                      <h3 className="text-sm font-bold text-slate-900">Dompet Sumber Tenant</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">Lihat baki kredit & penggunaan penuh mengikut tenant di Dompet Sumber</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>
                )}

                {/* Top usage customers */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100">
                    <h3 className="text-sm font-bold text-slate-900">Pelanggan Penggunaan Tertinggi</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Pantau untuk elak kerugian kos</p>
                  </div>
                  {customers.length === 0 ? (
                    <div className="p-8 text-center"><p className="text-xs text-slate-400">Tiada data penggunaan</p></div>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {[...customers].sort((a, b) => b.aiUsage - a.aiUsage).map(c => (
                        <div key={c.id} className="px-5 py-3.5 flex items-center space-x-4">
                          <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 font-bold text-xs flex items-center justify-center shrink-0">
                            {c.name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate">{c.name}</p>
                            <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.min((c.aiUsage / 1000) * 100, 100)}%` }} />
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-bold text-slate-700">{c.aiUsage} kredit</p>
                            <p className="text-[10px] text-slate-400">{c.storageGB} GB storan</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Per-user breakdown — HQ owner/staff, tenant owner/staff, individually */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100">
                    <h3 className="text-sm font-bold text-slate-900">Penggunaan Mengikut Pengguna</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Sekat atau luluskan akses AI bagi mana-mana pengguna individu</p>
                  </div>
                  {!useRealData ? (
                    <div className="p-8 text-center"><p className="text-xs text-slate-400">Tersedia hanya dengan data sebenar (bukan akaun ujian)</p></div>
                  ) : userUsage.length === 0 ? (
                    <div className="p-8 text-center"><p className="text-xs text-slate-400">Tiada data pengguna</p></div>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {[...userUsage].sort((a, b) => b.aiUsageCount - a.aiUsageCount).map(u => (
                        <div key={u.userId} className="px-5 py-3.5 flex items-center gap-4">
                          <div className={`w-7 h-7 rounded-lg font-bold text-xs flex items-center justify-center shrink-0 ${u.isSuspended ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"}`}>
                            {(u.fullName || u.email || "?").charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate">{u.fullName || u.email}</p>
                            <p className="text-[10px] text-slate-400 truncate">{roleLabel(u.role)} · {u.tenantName || "—"}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-bold text-slate-700">{u.aiUsageCount} kredit</p>
                            {u.isSuspended && <p className="text-[10px] text-red-500 font-semibold">Disekat</p>}
                          </div>
                          <button onClick={() => toggleUserSuspend(u)}
                            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer transition shrink-0 ${u.isSuspended ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-700" : "bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-500"}`}>
                            {u.isSuspended ? "Luluskan" : "Sekat"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ════ SUPPORT ════ */}
            {activePage === "support" && (
              <div className="space-y-4" id="hq_support">
                <div className="flex items-center justify-between">
                  <h1 className="text-xl font-bold text-slate-900">Sokongan Pelanggan</h1>
                  <button onClick={() => setShowTicketModal(true)}
                    className="text-[11px] text-slate-400 hover:text-slate-600 underline cursor-pointer">
                    + Tiket HQ (jarang digunakan)
                  </button>
                </div>

                {/* Operational health row */}
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2.5">
                  <MetricCard label="Terbuka" value={allTickets.filter(t=>t.status==="open").length} icon={AlertCircle} color="red" />
                  <MetricCard label="Dalam Proses" value={allTickets.filter(t=>t.status==="in_progress").length} icon={Clock} color="amber" />
                  <MetricCard label="Tunggu Pelanggan" value={allTickets.filter(t=>t.status==="awaiting_customer").length} icon={MessageCircle} color="violet" />
                  <MetricCard label="Tunggu HQ" value={allTickets.filter(t=>t.status==="awaiting_hq").length} icon={Headphones} color="amber" />
                  <MetricCard label="Selesai" value={allTickets.filter(t=>t.status==="resolved").length} icon={CheckCircle2} color="emerald" />
                  <MetricCard label="Ditutup" value={allTickets.filter(t=>t.status==="closed").length} icon={X} color="slate" />
                </div>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2.5">
                  <MetricCard label="Kritikal" value={allTickets.filter(t=>t.priority==="critical").length} icon={AlertCircle} color="red" />
                  <MetricCard label="Tinggi" value={allTickets.filter(t=>t.priority==="high").length} icon={AlertCircle} color="red" />
                  <MetricCard label="SLA Lupus" value={slaBreachedCount} icon={AlertCircle} color="red" />
                  <MetricCard label="SLA Hampir" value={slaNearCount} icon={Clock} color="amber" />
                  <MetricCard label="Belum Ditugaskan" value={unassignedCount} icon={UserX} color="amber" />
                  <MetricCard label="Masa Respons (min)" value={avgResponseMins ?? "-"} icon={Clock} color="teal" />
                </div>

                {/* Filter tabs */}
                <div className="flex gap-2 flex-wrap">
                  {([["all","Semua"],["open","Terbuka"],["in_progress","Dalam Proses"],["awaiting_customer","Tunggu Pelanggan"],["awaiting_hq","Tunggu HQ"],["resolved","Selesai"],["closed","Ditutup"],["unassigned","Belum Ditugaskan"]] as const).map(([val, label]) => (
                    <button key={val} onClick={() => setTicketFilter(val)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition ${ticketFilter === val ? "bg-emerald-700 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-emerald-300"}`}>
                      {label}
                    </button>
                  ))}
                </div>

                {avgResolutionHours !== null && (
                  <p className="text-[11px] text-slate-400">Purata masa penyelesaian: {avgResolutionHours} jam</p>
                )}

                {filteredTickets.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center shadow-sm">
                    <Headphones className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-slate-500">Tiada tiket dalam kategori ini</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredTickets.map(t => {
                      const isExpanded = expandedTicket === t.id;
                      const sla = hqService.ticketSlaState(t as hqService.SupportTicket);
                      return (
                        <div key={t.id} className={`bg-white border rounded-2xl shadow-sm overflow-hidden ${t.status === "open" ? "border-red-100" : sla === "breached" ? "border-red-200" : "border-slate-200"}`}>
                          {/* Header */}
                          <div className="p-5 space-y-2">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">#{t.id.slice(0,8)}</span>
                                  <StatusBadge status={t.status} />
                                  <StatusBadge status={t.priority} />
                                  {sla !== "none" && <StatusBadge status={sla} />}
                                  {t.replies.length > 0 && <span className="text-[9px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{t.replies.length} balasan</span>}
                                  {(t.attachments?.length || 0) > 0 && <span className="text-[9px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full flex items-center gap-1"><Paperclip className="w-2.5 h-2.5" />{t.attachments!.length}</span>}
                                </div>
                                <p className="text-sm font-bold text-slate-900 mt-1.5">{t.subject}</p>
                                <p className="text-xs text-slate-500">{t.customer}{t.email ? ` - ${t.email}` : ""}</p>
                              </div>
                              <div className="text-right shrink-0 space-y-1">
                                <p className="text-[10px] text-slate-400">{t.createdAt}</p>
                                <p className="text-[10px] text-slate-400">Staf: {t.assigned || "Belum ditugaskan"}</p>
                              </div>
                            </div>

                            {/* Summary */}
                            <div className="flex items-start gap-2.5 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                              <Brain className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                              <p className="text-xs text-emerald-800 leading-relaxed">{t.summary}</p>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <button onClick={() => { setExpandedTicket(isExpanded ? null : t.id); setReplyText(""); setAssignDraft(t.assigned || ""); setResolutionNoteText(t.resolutionNotes || ""); }}
                                className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold cursor-pointer transition">
                                {isExpanded ? "Tutup" : "Buka Tiket"}
                              </button>
                              {t.status !== "resolved" && t.status !== "closed" ? (
                                <button onClick={() => resolveTicket(t.id)}
                                  className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold cursor-pointer hover:bg-emerald-100 transition">
                                  Tandakan Selesai
                                </button>
                              ) : (
                                <button onClick={() => reopenTicket(t.id)}
                                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold cursor-pointer hover:bg-slate-100 transition">
                                  Buka Semula
                                </button>
                              )}
                              {t.status === "resolved" && (
                                <button onClick={() => updateTicketStatus(t.id, "closed")}
                                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold cursor-pointer hover:bg-slate-100 transition">
                                  Tutup Tiket
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Ticket workspace */}
                          {isExpanded && (
                            <div className="border-t border-slate-100 bg-slate-50 p-4 space-y-4">
                              {/* Full ticket data */}
                              <div className="grid grid-cols-2 gap-2 text-[11px] bg-white border border-slate-200 rounded-xl p-3">
                                <div><span className="text-slate-400">ID Tiket:</span> <span className="font-bold text-slate-700">{t.id}</span></div>
                                <div><span className="text-slate-400">Kategori:</span> <span className="font-bold text-slate-700">{t.category || "-"}</span></div>
                                <div><span className="text-slate-400">Dihantar:</span> <span className="font-bold text-slate-700">{t.createdAt}</span></div>
                                <div><span className="text-slate-400">SLA Tamat:</span> <span className="font-bold text-slate-700">{t.slaDueAt ? new Date(t.slaDueAt).toLocaleString("ms-MY") : "-"}</span></div>
                                <div><span className="text-slate-400">Respons Pertama:</span> <span className="font-bold text-slate-700">{t.firstResponseAt ? new Date(t.firstResponseAt).toLocaleString("ms-MY") : "-"}</span></div>
                                <div><span className="text-slate-400">Diselesaikan:</span> <span className="font-bold text-slate-700">{t.resolvedAt ? new Date(t.resolvedAt).toLocaleString("ms-MY") : "-"}</span></div>
                              </div>

                              {/* Assignment */}
                              <div className="flex items-center gap-2">
                                <input value={assignDraft} onChange={e => setAssignDraft(e.target.value)} placeholder="Tugaskan kepada staf..."
                                  className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-emerald-400 bg-white" />
                                <button onClick={() => assignTicket(t.id, assignDraft)} disabled={!assignDraft.trim()}
                                  className="px-3 py-2 bg-slate-700 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-slate-800 transition disabled:opacity-40">
                                  Tugaskan
                                </button>
                              </div>

                              {/* Attachments */}
                              {(t.attachments?.length || 0) > 0 && (
                                <div className="space-y-1.5">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase">Lampiran</p>
                                  {t.attachments!.map(a => (
                                    <div key={a.id} className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-3 py-2 text-[11px]">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                        <span className="font-semibold text-slate-700 truncate">{a.fileName}</span>
                                        <span className="text-slate-400 shrink-0">{a.uploadedByName} · {new Date(a.at).toLocaleDateString("ms-MY")}</span>
                                      </div>
                                      <button
                                        onClick={async () => { const url = await hqService.getTicketAttachmentUrl(a.filePath); if (url) window.open(url, "_blank"); }}
                                        className="text-emerald-700 font-bold cursor-pointer shrink-0">Muat Turun</button>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Conversation timeline */}
                              {t.replies.length > 0 && (
                                <div className="space-y-2">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase">Garis Masa Perbualan</p>
                                  {t.replies.map(r => (
                                    <div key={r.id} className="bg-white border border-slate-200 rounded-xl px-4 py-3">
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="text-[10px] font-bold text-emerald-700">{r.author}</span>
                                        <span className="text-[10px] text-slate-400">{r.at}</span>
                                      </div>
                                      <p className="text-xs text-slate-700 leading-relaxed">{r.text}</p>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Internal notes (HQ only, never shown to tenant) */}
                              <div className="space-y-2">
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Nota Dalaman HQ (tidak dilihat pelanggan)</p>
                                {(t.internalNotes?.length || 0) > 0 && (
                                  <div className="space-y-1.5">
                                    {t.internalNotes!.map(n => (
                                      <div key={n.id} className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                                        <div className="flex items-center justify-between mb-0.5">
                                          <span className="text-[10px] font-bold text-amber-700">{n.author}</span>
                                          <span className="text-[10px] text-amber-500">{n.at}</span>
                                        </div>
                                        <p className="text-xs text-amber-800">{n.note}</p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div className="flex gap-2">
                                  <input value={internalNoteText} onChange={e => setInternalNoteText(e.target.value)} placeholder="Tambah nota dalaman..."
                                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-amber-400 bg-white" />
                                  <button onClick={() => addInternalNote(t.id)} disabled={!internalNoteText.trim()}
                                    className="px-3 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-amber-700 transition disabled:opacity-40">
                                    Tambah
                                  </button>
                                </div>
                              </div>

                              {/* Resolution notes */}
                              <div className="space-y-1.5">
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Nota Penyelesaian</p>
                                <textarea value={resolutionNoteText} onChange={e => setResolutionNoteText(e.target.value)}
                                  placeholder="Catatan penyelesaian (akan disimpan apabila tiket ditandakan selesai)..."
                                  rows={2}
                                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xs outline-none focus:border-emerald-400 bg-white resize-none" />
                              </div>

                              {/* Reply box */}
                              <div className="space-y-2">
                                {hqKnowledgeArticles.length > 0 && (
                                  <select
                                    defaultValue=""
                                    onChange={async (e) => {
                                      const articleId = e.target.value;
                                      if (!articleId) return;
                                      const article = await hqService.getHqKnowledgeArticleForReply(articleId);
                                      if (article) setReplyText(prev => (prev ? `${prev}\n\n${article.body}` : article.body));
                                      e.target.value = "";
                                    }}
                                    className="text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 w-full"
                                  >
                                    <option value="">Sisip dari Pusat Pengetahuan...</option>
                                    {hqKnowledgeArticles.map((a) => (
                                      <option key={a.id} value={a.id}>{a.title}</option>
                                    ))}
                                  </select>
                                )}
                                <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                                  placeholder="Taip jawapan kepada pelanggan..."
                                  rows={3}
                                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xs outline-none focus:border-emerald-400 bg-white resize-none" />
                                <div className="flex gap-2">
                                  <button onClick={() => { setExpandedTicket(null); setReplyText(""); }}
                                    className="px-3 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold cursor-pointer hover:bg-slate-50 transition">
                                    Batal
                                  </button>
                                  <button onClick={() => sendReply(t.id)} disabled={!replyText.trim()}
                                    className="flex-1 py-2 bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-emerald-800 transition disabled:opacity-40 flex items-center justify-center gap-1.5">
                                    <Send className="w-3.5 h-3.5" />Hantar Jawapan
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* â•â•â•â• SUBSCRIPTIONS (HQ_STAFF only) â•â•â•â• */}
            {activePage === "subscriptions" && isStaff && (
              <div className="space-y-4" id="hq_subscriptions">
                <h1 className="text-xl font-bold text-slate-900">Langganan</h1>

                <div className="grid grid-cols-2 gap-3">
                  <MetricCard label="Perbaharui Minggu Ini" value="2"           icon={RefreshCw}  color="amber" />
                  <MetricCard label="Akaun Digantung"       value={customers.filter(c=>c.status==="suspended").length} icon={UserX} color="red" />
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100">
                    <h3 className="text-sm font-bold text-slate-900">Semua Langganan</h3>
                  </div>
                  {customers.length === 0 ? (
                    <div className="p-10 text-center"><p className="text-xs text-slate-400">Tiada langganan</p></div>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {customers.map(c => (
                        <div key={c.id} className="px-5 py-4 flex items-center space-x-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">{c.name}</p>
                            <p className="text-[11px] text-slate-400">{c.plan} &middot; Perbaharui {c.renewal || "-"}</p>
                          </div>
                          <StatusBadge status={c.status} />
                          <div className="flex gap-1.5">
                            <button className="px-2.5 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-bold cursor-pointer hover:bg-emerald-100 transition">Perbaharui</button>
                            <button className="px-2.5 py-1.5 bg-slate-50 text-slate-600 rounded-lg text-[10px] font-bold cursor-pointer hover:bg-slate-100 transition">Naik Taraf</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* â•â•â•â• REVENUE (HQ_OWNER only) â•â•â•â• */}
            {activePage === "revenue" && !isStaff && (() => {
              const activeC = customers.filter(c => c.status === "active");
              const suspendedC = customers.filter(c => c.status === "suspended");
              const arr = totalMRR * 12;
              return (
              <div className="space-y-5" id="hq_revenue">
                <h1 className="text-xl font-bold text-slate-900">Hasil & Pendapatan</h1>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MetricCard label="MRR" value={`RM ${totalMRR.toLocaleString()}`} sub="bulan ini" icon={DollarSign} color="emerald" trend="up" />
                  <MetricCard label="ARR" value={`RM ${arr.toLocaleString()}`} sub="anggaran tahunan" icon={TrendingUp} color="teal" trend="up" />
                  <MetricCard label="Pelanggan Aktif" value={activeC.length} sub={`${suspendedC.length} digantung`} icon={UserCheck} color="violet" />
                  <MetricCard label="Perlu Perhatian" value={customers.filter(c=>c.attention).length} sub="berisiko" icon={AlertCircle} color={customers.filter(c=>c.attention).length > 0 ? "red" : "slate"} />
                </div>

                {/* Revenue by plan */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <h3 className="text-sm font-bold text-slate-900">Hasil Mengikut Plan</h3>
                  {plans.length === 0 && <p className="text-xs text-slate-400 text-center py-4">Tiada plan lagi. Cipta plan di halaman Pengebilan.</p>}
                  {plans.map(p => {
                    const subs = activeC.filter(c => c.plan === p.name);
                    const rev = subs.length * p.price;
                    const pct = totalMRR > 0 ? (rev / totalMRR) * 100 : 0;
                    return (
                      <div key={p.id} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700">{p.name} <span className="text-slate-400 font-normal">({subs.length} aktif)</span></span>
                          <span className="font-bold text-slate-800">RM {rev.toLocaleString()}/bln</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Customer MRR table */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900">Sumbangan Pelanggan</h3>
                    <span className="text-xs text-slate-400">{activeC.length} aktif</span>
                  </div>
                  {activeC.length === 0 ? (
                    <div className="p-10 text-center">
                      <DollarSign className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                      <p className="text-xs text-slate-400">Tambah pelanggan untuk lihat sumbangan hasil</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {activeC.sort((a, b) => b.mrr - a.mrr).map(c => {
                        const pct = totalMRR > 0 ? (c.mrr / totalMRR) * 100 : 0;
                        return (
                          <div key={c.id} className="px-5 py-3 flex items-center gap-4">
                            <div className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-700 font-bold text-xs flex items-center justify-center shrink-0">
                              {c.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-slate-800 truncate">{c.name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-[10px] text-slate-400 shrink-0">{pct.toFixed(0)}%</span>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs font-bold text-emerald-700">RM {c.mrr.toLocaleString()}</p>
                              <p className="text-[10px] text-slate-400">{c.plan || "tiada plan"}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* At-risk / suspended */}
                {suspendedC.length > 0 && (
                  <div className="bg-red-50 border border-red-100 rounded-2xl p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                      <h3 className="text-sm font-bold text-red-700">Akaun Digantung ({suspendedC.length})</h3>
                    </div>
                    <p className="text-xs text-red-500">
                      Potensi MRR terhilang: RM {suspendedC.reduce((s, c) => s + c.mrr, 0).toLocaleString()}/bln
                    </p>
                    <div className="space-y-2">
                      {suspendedC.map(c => (
                        <div key={c.id} className="flex items-center justify-between bg-white rounded-xl px-4 py-2.5 border border-red-100">
                          <div>
                            <p className="text-xs font-semibold text-slate-800">{c.name}</p>
                            <p className="text-[10px] text-slate-400">{c.plan} &middot; {displayEmail(c.email)}</p>
                          </div>
                          <button onClick={() => toggleStatus(c.id)}
                            className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] font-bold cursor-pointer hover:bg-emerald-700 transition">
                            Aktifkan
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              );
            })()}

            {/* â•â•â•â• SETTINGS (HQ_OWNER only) â•â•â•â• */}
            {activePage === "website" && !isStaff && (
              <div className="space-y-5" id="hq_website">
                <div className="flex items-center justify-between">
                  <h1 className="text-xl font-bold text-slate-900">Tapak Web Awam</h1>
                  {siteSettingsSaved && <span className="text-xs text-emerald-600 font-bold bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">Tersimpan</span>}
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900">Jenama & Hero</h3>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Nama Syarikat</label>
                    <input value={siteSettings.companyName} onChange={e => setSiteSettings(s => ({ ...s, companyName: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">URL Logo</label>
                    <input value={siteSettings.logoUrl} onChange={e => setSiteSettings(s => ({ ...s, logoUrl: e.target.value }))}
                      placeholder="https://..."
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400" />
                    <div className="flex items-center gap-3 mt-2">
                      {siteSettings.logoUrl && (
                        <img src={siteSettings.logoUrl} alt="Logo" className="w-12 h-12 rounded-xl object-contain border border-slate-100 bg-slate-50" />
                      )}
                      <label className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition">
                        {logoUploading ? "Memuat naik..." : "Muat Naik Logo"}
                        <input type="file" accept="image/*" className="hidden" disabled={logoUploading} onChange={handleLogoFileChange} />
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Tajuk Utama (Hero Headline)</label>
                    <textarea rows={2} value={siteSettings.heroHeadline} onChange={e => setSiteSettings(s => ({ ...s, heroHeadline: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Sub-tajuk (Hero Subheadline)</label>
                    <textarea rows={2} value={siteSettings.heroSubheadline} onChange={e => setSiteSettings(s => ({ ...s, heroSubheadline: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">URL Video Demo</label>
                    <input value={siteSettings.demoVideoUrl} onChange={e => setSiteSettings(s => ({ ...s, demoVideoUrl: e.target.value }))}
                      placeholder="https://..."
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400" />
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900">Maklumat Hubungan</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">E-mel</label>
                      <input value={siteSettings.contactEmail} onChange={e => setSiteSettings(s => ({ ...s, contactEmail: e.target.value }))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">Telefon</label>
                      <input value={siteSettings.contactPhone} onChange={e => setSiteSettings(s => ({ ...s, contactPhone: e.target.value }))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">WhatsApp</label>
                      <input value={siteSettings.contactWhatsapp} onChange={e => setSiteSettings(s => ({ ...s, contactWhatsapp: e.target.value }))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">Waktu Perniagaan</label>
                      <input value={siteSettings.businessHours} onChange={e => setSiteSettings(s => ({ ...s, businessHours: e.target.value }))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">Alamat</label>
                      <input value={siteSettings.contactAddress} onChange={e => setSiteSettings(s => ({ ...s, contactAddress: e.target.value }))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400" />
                    </div>
                  </div>
                  <button onClick={saveSiteSettingsNow} disabled={siteSettingsSaving}
                    className="px-4 py-2.5 bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-emerald-800 transition disabled:opacity-40">
                    {siteSettingsSaving ? "Menyimpan..." : "Simpan Tapak Web"}
                  </button>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Globe className="w-4 h-4 text-sky-500" /> Pautan Media Sosial</h3>
                  <div className="space-y-2">
                    {Object.entries(siteSettings.socialLinks || {}).map(([platform, url]) => (
                      <div key={platform} className="flex items-center justify-between gap-3 p-3 border border-slate-100 rounded-xl">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800">{platform}</p>
                          <p className="text-[11px] text-slate-400 truncate">{url}</p>
                        </div>
                        <button onClick={() => removeSocialLink(platform)} className="text-rose-400 hover:text-rose-600 cursor-pointer shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                    {Object.keys(siteSettings.socialLinks || {}).length === 0 && <p className="text-xs text-slate-400 text-center py-3">Tiada pautan media sosial lagi.</p>}
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                    <input value={socialDraft.platform} onChange={e => setSocialDraft(d => ({ ...d, platform: e.target.value }))}
                      placeholder="Platform (cth: Facebook)"
                      className="w-1/3 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-400" />
                    <input value={socialDraft.url} onChange={e => setSocialDraft(d => ({ ...d, url: e.target.value }))}
                      placeholder="https://..."
                      className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-400" />
                    <button onClick={addSocialLink} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-indigo-700 transition shrink-0">Tambah</button>
                  </div>
                  <button onClick={saveSiteSettingsNow} disabled={siteSettingsSaving}
                    className="px-4 py-2.5 bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-emerald-800 transition disabled:opacity-40">
                    {siteSettingsSaving ? "Menyimpan..." : "Simpan Tapak Web"}
                  </button>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><HelpCircle className="w-4 h-4 text-indigo-500" /> Soalan Lazim (FAQ)</h3>
                  <div className="space-y-2">
                    {faqItems.map(f => (
                      <div key={f.id} className="flex items-start justify-between gap-3 p-3 border border-slate-100 rounded-xl">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800">{f.question}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{f.answer}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => toggleFaqPublished(f)} className={`text-[10px] font-bold px-2 py-1 rounded-full cursor-pointer ${f.isPublished ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
                            {f.isPublished ? "Tersiar" : "Disembunyikan"}
                          </button>
                          <button onClick={() => removeFaqItem(f.id)} className="text-rose-400 hover:text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    ))}
                    {faqItems.length === 0 && <p className="text-xs text-slate-400 text-center py-3">Tiada soalan lazim lagi.</p>}
                  </div>
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <input value={faqDraft.question} onChange={e => setFaqDraft(d => ({ ...d, question: e.target.value }))}
                      placeholder="Soalan baru..."
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-400" />
                    <textarea rows={2} value={faqDraft.answer} onChange={e => setFaqDraft(d => ({ ...d, answer: e.target.value }))}
                      placeholder="Jawapan..."
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-400" />
                    <button onClick={addFaqItem} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-indigo-700 transition">Tambah Soalan</button>
                  </div>
                </div>

                {/* Landing Page Content CMS */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Globe className="w-4 h-4 text-emerald-600" /> Kandungan Landing Page
                    </h3>
                    <button
                      onClick={() => { setLandingItemForm({ label: "", description: "", iconEmoji: "", sectionKey: landingActiveSection }); setEditingLandingId(null); setLandingModalOpen(true); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-emerald-800 transition">
                      <Plus className="w-3.5 h-3.5" /> Tambah Item
                    </button>
                  </div>

                  {/* Section tabs */}
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(LANDING_SECTION_LABELS).map(([key, label]) => (
                      <button key={key}
                        onClick={() => { setLandingActiveSection(key); setEditingLandingId(null); }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${landingActiveSection === key ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Card grid */}
                  {(() => {
                    const items = landingContent.filter(i => i.sectionKey === landingActiveSection).sort((a, b) => a.sortOrder - b.sortOrder);
                    if (items.length === 0) return (
                      <p className="text-xs text-slate-400 text-center py-8">Tiada item lagi untuk seksyen ini. Klik "Tambah Item" untuk bermula.</p>
                    );
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {items.map((item, idx) => (
                          <div key={item.id} className={`flex flex-col rounded-2xl border transition-all ${item.isVisible ? "border-slate-200 bg-white shadow-sm" : "border-dashed border-slate-200 bg-slate-50 opacity-60"}`}>
                            {/* Card header: icon preview + status badge */}
                            <div className="flex items-start justify-between p-4 pb-2">
                              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                                {item.iconEmoji
                                  ? <span className="text-2xl">{item.iconEmoji}</span>
                                  : <span className="text-lg text-slate-300 font-bold">#</span>}
                              </div>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.isVisible ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                                {item.isVisible ? "Aktif" : "Tersembunyi"}
                              </span>
                            </div>
                            {/* Card body: title + description */}
                            <div className="px-4 pb-3 flex-1">
                              <p className="text-xs font-bold text-slate-900 leading-snug">{item.label}</p>
                              {item.description && <p className="text-[10px] text-slate-400 mt-1 leading-snug">{item.description}</p>}
                              <p className="text-[10px] text-slate-300 mt-1.5">Urutan: {idx + 1}</p>
                            </div>
                            {/* Card footer: actions */}
                            <div className="flex items-center justify-between gap-1 px-3 py-2.5 border-t border-slate-100">
                              <div className="flex items-center gap-0.5">
                                <button title="Naik" onClick={() => moveLandingItemInList(item.id, items, -1)} disabled={idx === 0}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-25 cursor-pointer transition text-xs">↑</button>
                                <button title="Turun" onClick={() => moveLandingItemInList(item.id, items, 1)} disabled={idx === items.length - 1}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-25 cursor-pointer transition text-xs">↓</button>
                              </div>
                              <div className="flex items-center gap-0.5">
                                <button title={item.isVisible ? "Sembunyikan" : "Aktifkan"} onClick={() => toggleLandingVisibility(item.id, item.isVisible)}
                                  className={`p-1.5 rounded-lg cursor-pointer transition ${item.isVisible ? "text-emerald-600 hover:bg-emerald-50" : "text-slate-400 hover:bg-slate-100"}`}>
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                </button>
                                <button title="Edit" onClick={() => { setEditingLandingId(item.id); setLandingItemForm({ label: item.label, description: item.description, iconEmoji: item.iconEmoji, sectionKey: item.sectionKey }); setLandingModalOpen(true); }}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer transition">
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button title="Duplikasi" onClick={() => duplicateLandingItem(item)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 cursor-pointer transition">
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                                <button title="Padam" onClick={() => deleteLandingItemById(item.id)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 cursor-pointer transition">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* Landing CMS Edit/Add Modal */}
                {landingModalOpen && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) { setLandingModalOpen(false); setEditingLandingId(null); } }}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                        <p className="text-sm font-bold text-slate-900">{editingLandingId ? "Edit Item" : "Tambah Item Baharu"}</p>
                        <button onClick={() => { setLandingModalOpen(false); setEditingLandingId(null); setLandingItemForm({ label: "", description: "", iconEmoji: "", sectionKey: landingActiveSection }); }}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer transition">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="p-5 space-y-4">
                        {/* Icon preview */}
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center shrink-0">
                            {landingItemForm.iconEmoji
                              ? <span className="text-3xl">{landingItemForm.iconEmoji}</span>
                              : <span className="text-slate-300 text-xs font-bold">IKON</span>}
                          </div>
                          <div className="flex-1">
                            <label className="text-[10px] font-semibold text-slate-500 mb-1 block">Emoji / Ikon</label>
                            <input value={landingItemForm.iconEmoji}
                              onChange={e => setLandingItemForm(f => ({ ...f, iconEmoji: e.target.value }))}
                              placeholder="cth: 🧾 📋 💸"
                              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-400" />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-500 mb-1 block">Tajuk <span className="text-rose-500">*</span></label>
                          <input value={landingItemForm.label}
                            onChange={e => setLandingItemForm(f => ({ ...f, label: e.target.value }))}
                            placeholder="Masukkan tajuk item..."
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-400" />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-500 mb-1 block">Penerangan <span className="text-slate-400">(pilihan)</span></label>
                          <textarea value={landingItemForm.description}
                            onChange={e => setLandingItemForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="Huraian ringkas tentang item ini..."
                            rows={3}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-400 resize-none" />
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button onClick={saveLandingItem} disabled={!landingItemForm.label.trim()}
                            className="flex-1 py-2.5 bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-emerald-800 transition disabled:opacity-40">
                            Simpan
                          </button>
                          <button onClick={() => { setLandingModalOpen(false); setEditingLandingId(null); setLandingItemForm({ label: "", description: "", iconEmoji: "", sectionKey: landingActiveSection }); }}
                            className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold cursor-pointer hover:bg-slate-200 transition">
                            Batal
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activePage === "settings" && !isStaff && (
              <div className="space-y-5" id="hq_settings">
                <div className="flex items-center justify-between">
                  <h1 className="text-xl font-bold text-slate-900">Tetapan</h1>
                  {settingsSaved && <span className="text-xs text-emerald-600 font-bold bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">Tersimpan</span>}
                </div>

                {/* Account */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><User className="w-4 h-4 text-emerald-600" />Akaun HQ</h3>
                  <div className="flex items-center gap-4 p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-700 text-white flex items-center justify-center text-xl font-bold shadow shrink-0">
                      {user?.fullName?.charAt(0).toUpperCase() || "H"}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{user?.fullName || "HQ Owner"}</p>
                      <p className="text-xs text-slate-500">{user?.email}</p>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">HQ_OWNER</span>
                    </div>
                  </div>
                </div>

                {/* Business Profile */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Building2 className="w-4 h-4 text-emerald-600" />Profil Perniagaan</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">Nama Perniagaan</label>
                      <input value={bizSettings.bizName} onChange={e => setBizSettings(s => ({...s, bizName: e.target.value}))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">Tagline</label>
                      <input value={bizSettings.bizTagline} onChange={e => setBizSettings(s => ({...s, bizTagline: e.target.value}))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">E-mel Perniagaan</label>
                      <input type="email" value={bizSettings.bizEmail} onChange={e => setBizSettings(s => ({...s, bizEmail: e.target.value}))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">No. Telefon</label>
                      <input value={bizSettings.bizPhone} onChange={e => setBizSettings(s => ({...s, bizPhone: e.target.value}))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">Mata Wang</label>
                      <select value={bizSettings.currency} onChange={e => setBizSettings(s => ({...s, currency: e.target.value}))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 bg-white">
                        <option value="MYR">MYR - Ringgit Malaysia</option>
                        <option value="USD">USD - US Dollar</option>
                        <option value="SGD">SGD - Singapore Dollar</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">Zon Masa</label>
                      <select value={bizSettings.timezone} onChange={e => setBizSettings(s => ({...s, timezone: e.target.value}))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 bg-white">
                        <option value="Asia/Kuala_Lumpur">Asia/Kuala Lumpur (UTC+8)</option>
                        <option value="Asia/Singapore">Asia/Singapore (UTC+8)</option>
                        <option value="UTC">UTC</option>
                      </select>
                    </div>
                  </div>
                  <button onClick={() => saveBizSettings(bizSettings)}
                    className="px-4 py-2 bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-emerald-800 transition">
                    Simpan Profil
                  </button>
                </div>

                {/* Payment Gateway Settings */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><CreditCard className="w-4 h-4 text-emerald-600" />Tetapan Pembayaran</h3>

                  <div className="flex items-center justify-between p-3 border border-slate-100 rounded-xl">
                    <div>
                      <p className="text-xs font-bold text-slate-800">Chip Asia (auto)</p>
                      <p className="text-[10px] text-slate-400">Bayaran online disahkan automatik oleh sistem bila berjaya.</p>
                    </div>
                    <button onClick={() => setPaymentSettings(s => ({ ...s, chipAsiaEnabled: !s.chipAsiaEnabled }))}
                      className={`w-11 h-6 rounded-full relative transition cursor-pointer ${paymentSettings.chipAsiaEnabled ? "bg-emerald-600" : "bg-slate-200"}`}>
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition ${paymentSettings.chipAsiaEnabled ? "translate-x-5" : ""}`} />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">Brand ID</label>
                      <input value={paymentSettings.chipAsiaBrandId} onChange={e => setPaymentSettings(s => ({ ...s, chipAsiaBrandId: e.target.value }))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">Secret Key</label>
                      <input type="password" value={paymentSettings.chipAsiaSecretKey} onChange={e => setPaymentSettings(s => ({ ...s, chipAsiaSecretKey: e.target.value }))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 border border-slate-100 rounded-xl">
                    <div>
                      <p className="text-xs font-bold text-slate-800">Manual (slip bank)</p>
                      <p className="text-[10px] text-slate-400">Tenant owner muat naik slip; HQ owner/staf perlu luluskan sebelum pakej diaktifkan.</p>
                    </div>
                    <button onClick={() => setPaymentSettings(s => ({ ...s, manualPaymentEnabled: !s.manualPaymentEnabled }))}
                      className={`w-11 h-6 rounded-full relative transition cursor-pointer ${paymentSettings.manualPaymentEnabled ? "bg-emerald-600" : "bg-slate-200"}`}>
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition ${paymentSettings.manualPaymentEnabled ? "translate-x-5" : ""}`} />
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <button onClick={savePaymentSettings} className="px-4 py-2 bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-emerald-800 transition">
                      Simpan Tetapan Pembayaran
                    </button>
                    {paymentSettingsSaved && <span className="text-xs text-emerald-600 font-bold">Tersimpan</span>}
                  </div>
                </div>

                {/* Security Foundation: Chip Asia webhook shadow-mode log + enforcement — relocated to "paymentGovernance" page */}
                <button onClick={() => setActivePage("paymentGovernance")}
                  className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center justify-between cursor-pointer hover:border-emerald-300 transition">
                  <div className="flex items-center gap-3 text-left">
                    <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Keselamatan Webhook Chip Asia</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {webhookEnforce ? "Penguatkuasaan AKTIF" : "Mod bayang (shadow)"} &middot; Lihat log penuh di Tadbir Bayaran
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                </button>

                {/* Credit Limits per Plan */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <h3 className="text-sm font-bold text-slate-900">Had Kredit AI Mengikut Plan</h3>
                  </div>
                  {plans.length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-xs text-slate-400">Cipta plan dahulu di halaman Pengebilan</p>
                      <button onClick={() => setActivePage("billing")} className="mt-2 text-xs text-emerald-600 font-semibold cursor-pointer hover:underline">Pergi ke Pengebilan</button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {plans.map(p => (
                        <div key={p.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                          <div className="flex-1">
                            <p className="text-xs font-bold text-slate-800">{p.name}</p>
                            <p className="text-[10px] text-slate-400">RM {p.price}/bln</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-[10px] text-slate-500 font-semibold">Kredit/bln:</label>
                            <input type="number" min={0} value={p.aiCredits}
                              onChange={e => setPlans(prev => prev.map(pl => pl.id === p.id ? { ...pl, aiCredits: Number(e.target.value) } : pl))}
                              onBlur={async e => {
                                const aiCredits = Number(e.target.value);
                                if (useRealData) {
                                  // Route through the same HQ Package Catalog RPC the
                                  // Edit Plan modal uses, so this quick-edit field can't
                                  // silently diverge from subscription_plans / wallets.
                                  await hqService.updatePlan(p.id, {
                                    name: p.name, price: p.price, aiCredits, ocrCredits: p.ocrCredits,
                                    storageGB: p.storageGB, maxUsers: p.maxUsers, featured: p.featured,
                                    features: p.features ?? [], limitations: p.limitations ?? [],
                                    isTrial: p.isTrial ?? false, trialDays: p.trialDays ?? 0, isCustomPricing: p.isCustomPricing ?? false,
                                  });
                                  reloadPlans();
                                } else {
                                  localStorage.setItem(plansKey, JSON.stringify(plans));
                                }
                              }}
                              className="w-24 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-center focus:outline-none focus:border-emerald-400 bg-white" />
                          </div>
                        </div>
                      ))}
                      <p className="text-[10px] text-slate-400">Perubahan disimpan secara automatik apabila anda klik di luar medan.</p>
                    </div>
                  )}
                </div>

                {/* HQ Staff account creation — masking/unmask administration relocated to "dataMaskingGovernance" */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Users className="w-4 h-4 text-emerald-600" />Kakitangan HQ</h3>
                    <button onClick={() => { setShowCreateStaff(v => !v); setStaffResult(null); }}
                      className="flex items-center gap-1.5 px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold cursor-pointer transition">
                      <Plus className="w-3.5 h-3.5" />Tambah Staf
                    </button>
                  </div>
                  {showCreateStaff && (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 space-y-3">
                      <p className="text-xs font-bold text-emerald-800">Cipta Akaun HQ_STAFF</p>
                      <input value={staffName} onChange={e => setStaffName(e.target.value)} placeholder="Nama penuh"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-400 bg-white" />
                      <input type="email" value={staffEmail} onChange={e => setStaffEmail(e.target.value)} placeholder="Email kakitangan"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-400 bg-white" />
                      <button onClick={handleCreateHQStaff} disabled={staffCreating || !staffEmail.trim() || !staffName.trim()}
                        className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 text-white rounded-xl text-sm font-bold cursor-pointer transition">
                        {staffCreating ? "Mencipta..." : "Cipta Akaun"}
                      </button>
                      {staffResult && (
                        <div className={`rounded-xl p-3 text-xs ${staffResult.success ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"}`}>
                          <p className={`font-bold ${staffResult.success ? "text-emerald-700" : "text-red-700"}`}>{staffResult.success ? "Berjaya!" : "Gagal"}</p>
                          <p className={staffResult.success ? "text-emerald-600" : "text-red-600"}>{staffResult.message}</p>
                          {staffResult.tempPassword && (
                            <div className="mt-2 p-2 bg-white border border-emerald-200 rounded-lg">
                              <p className="text-[10px] text-slate-500 mb-0.5">Kata Laluan Sementara:</p>
                              <p className="font-mono font-bold text-slate-900 select-all">{staffResult.tempPassword}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <button onClick={() => setActivePage("dataMaskingGovernance")}
                    className="w-full flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition text-left">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-slate-900">Tadbir Topeng Data (PII)</p>
                        <p className="text-[11px] text-slate-400">{hqStaffUsers.filter(u => u.unmaskGranted).length}/{hqStaffUsers.length} staf diberi akses unmask &middot; Uruskan akses penuh</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>
                </div>

                {/* Notifications */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Bell className="w-4 h-4 text-emerald-600" />Pemberitahuan</h3>
                  {([
                    ["notifyNewCustomer", "Pelanggan baru mendaftar"],
                    ["notifyRenewal", "Perbaharuan akan tamat"],
                    ["notifySupport", "Kes sokongan baharu"],
                    ["notifyHighUsage", "Penggunaan tinggi dikesan"],
                  ] as const).map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                      <span className="text-xs text-slate-700">{label}</span>
                      <button onClick={() => saveBizSettings({ [key]: !bizSettings[key] })}
                        className={`w-9 h-5 rounded-full flex items-center px-0.5 cursor-pointer transition-all ${bizSettings[key] ? "bg-emerald-600 justify-end" : "bg-slate-200 justify-start"}`}>
                        <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Danger Zone */}
                <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-5 space-y-3">
                  <h3 className="text-sm font-bold text-red-600 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Zon Berbahaya</h3>
                  <button onClick={() => { if (window.confirm("Log keluar dari akaun ini?")) signOut(); }}
                    className="flex items-center gap-2 px-4 py-2.5 border border-red-200 text-red-600 rounded-xl text-xs font-bold cursor-pointer hover:bg-red-50 transition">
                    <LogOut className="w-3.5 h-3.5" />Log Keluar
                  </button>
                </div>
              </div>
            )}

            {/* â•â•â•â• SYSTEM CENTER (HQ_OWNER only) â•â•â•â• */}
            {activePage === "system" && !isStaff && (() => {
              const autoResult = getAutoModel(routerStrategy);

              // Profit Advisor calculation per plan
              const profitRows = plans.map(pl => {
                let prov: AIProvDef | undefined;
                let model: AIModel | undefined;
                if (routerStrategy === "custom") {
                  const route = planRoutes.find(r => r.planId === pl.id);
                  prov = AI_PROVIDERS.find(p => p.id === route?.providerId);
                  model = prov?.models.find(m => m.id === route?.modelId);
                } else if (autoResult) {
                  prov = autoResult.prov;
                  model = autoResult.model;
                }
                const costUSD = model ? qCostUSD(model) * pl.aiCredits : 0;
                const costMYR = costUSD * usdMyr;
                const margin = pl.price - costMYR;
                const marginPct = pl.price > 0 ? (margin / pl.price) * 100 : 0;
                return { pl, prov, model, costMYR, margin, marginPct };
              });

              const hasLoss    = profitRows.some(r => r.marginPct < 0);
              const hasRisk    = profitRows.some(r => r.marginPct >= 0 && r.marginPct < 15);

              return (
              <div className="space-y-5" id="hq_system">
                <div className="flex items-center justify-between">
                  <h1 className="text-xl font-bold text-slate-900">AI Router</h1>
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                    {AI_PROVIDERS.filter(p => providerCfgs[p.id]?.enabled).length} Pembekal Aktif
                  </span>
                </div>

                {/* Profit Warnings */}
                {hasLoss && (
                  <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-red-700">AMARAN: Plan Anda Menanggung KERUGIAN</p>
                      <p className="text-xs text-red-600 mt-0.5">Kos AI melebihi harga yang anda cas pelanggan. Naikkan harga plan atau tukar ke model AI lebih murah segera.</p>
                    </div>
                  </div>
                )}
                {!hasLoss && hasRisk && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-amber-700">Margin Tipis - Risiko Tinggi</p>
                      <p className="text-xs text-amber-600 mt-0.5">Margin keuntungan kurang 15%. Jika penggunaan AI pelanggan tinggi, anda boleh rugi. Semak jadual Penasihat Keuntungan di bawah.</p>
                    </div>
                  </div>
                )}

                {/* Strategy Selector */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-emerald-600" /> Strategi Penghalaan AI
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-1">Router akan pilih pembekal berdasarkan strategi ini untuk setiap pertanyaan pelanggan</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { id: "cheapest",  label: "Paling Murah",    desc: "Guna model termurah yang aktif - maksimum untung" },
                      { id: "balanced",  label: "Seimbang",         desc: "Imbang kos dan kualiti - model tier sederhana" },
                      { id: "quality",   label: "Kualiti Terbaik",  desc: "Guna model terbaik - untuk pelanggan premium" },
                      { id: "custom",    label: "Tersuai",          desc: "Tetapkan sendiri pembekal bagi setiap plan" },
                    ] as { id: RouterStrategy; label: string; desc: string }[]).map(s => (
                      <button key={s.id} onClick={() => setRouterStrategy(s.id)}
                        className={`text-left p-3 rounded-xl border-2 transition cursor-pointer ${routerStrategy === s.id ? "border-emerald-500 bg-emerald-50" : "border-slate-100 hover:border-slate-200"}`}>
                        <p className={`text-xs font-bold ${routerStrategy === s.id ? "text-emerald-700" : "text-slate-700"}`}>{s.label}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{s.desc}</p>
                      </button>
                    ))}
                  </div>
                  {routerStrategy !== "custom" && autoResult && (
                    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <p className="text-xs text-emerald-700">
                        Auto-pilih: <strong>{autoResult.prov.name}</strong> &middot; {autoResult.model.name} &middot; RM {(qCostUSD(autoResult.model) * usdMyr).toFixed(5)} / soalan
                      </p>
                    </div>
                  )}
                  {routerStrategy !== "custom" && !autoResult && (
                    <p className="text-xs text-red-500">Tiada pembekal aktif. Aktifkan sekurang-kurangnya satu pembekal di bawah.</p>
                  )}
                </div>

                {/* USD/MYR Rate */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-800">Kadar Pertukaran USD/MYR</p>
                      <p className="text-[11px] text-slate-400">Digunakan untuk kira kos AI dalam Ringgit Malaysia</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">1 USD =</span>
                      <input type="number" step="0.01" min="1" max="10" value={usdMyr}
                        onChange={e => setUsdMyr(parseFloat(e.target.value) || 4.45)}
                        className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-center focus:outline-none focus:border-emerald-400" />
                      <span className="text-xs text-slate-500">MYR</span>
                    </div>
                  </div>
                </div>

                {/* AI Cost Governance — relocated to its own dedicated page: "aiCostGovernance" */}
                <button onClick={() => setActivePage("aiCostGovernance")}
                  className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center justify-between cursor-pointer hover:border-emerald-300 transition">
                  <div className="flex items-center gap-3 text-left">
                    <DollarSign className="w-4 h-4 text-amber-500 shrink-0" />
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Tadbir Urus Kos AI</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">Lihat & uruskan kadar kos panggilan dan perbelanjaan sebenar mengikut syarikat di Tadbir Kos AI</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                </button>

                {/* Provider Cards */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Brain className="w-4 h-4 text-emerald-600" /> Pembekal AI
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-1">Aktifkan pembekal, masukkan API key dan pilih model. Kos dikira per soalan (purata 600 input + 900 output token).</p>
                  </div>
                  <div className="space-y-3">
                    {AI_PROVIDERS.map(prov => {
                      const cfg = providerCfgs[prov.id] || { enabled: false, apiKey: "", selectedModel: prov.models[0].id, testStatus: "idle" as const };
                      const selModel = prov.models.find(m => m.id === cfg.selectedModel) || prov.models[0];
                      const costMYR = qCostUSD(selModel) * usdMyr;
                      const isTesting = testingProv === prov.id;
                      const isCheapest = autoResult?.prov.id === prov.id && autoResult?.model.id === selModel.id && routerStrategy === "cheapest";
                      return (
                        <div key={prov.id} className={`border rounded-xl p-4 transition ${cfg.enabled ? "border-emerald-200 bg-emerald-50/30" : "border-slate-100 bg-slate-50/50"}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-black shrink-0 ${cfg.enabled ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500"}`}>
                                {prov.badge}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-xs font-bold text-slate-800">{prov.name}</p>
                                  {isCheapest && <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded-full">PALING MURAH</span>}
                                  {cfg.testStatus === "ok" && <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">Sambungan OK</span>}
                                  {cfg.testStatus === "fail" && <span className="text-[9px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">API Key Gagal</span>}
                                </div>
                                <p className="text-[10px] text-slate-400">{prov.company}</p>
                              </div>
                            </div>
                            <button onClick={() => updateProviderCfg(prov.id, { enabled: !cfg.enabled })}
                              className={`w-11 h-6 rounded-full flex items-center px-0.5 cursor-pointer transition-colors shrink-0 ${cfg.enabled ? "bg-emerald-600 justify-end" : "bg-slate-200 justify-start"}`}>
                              <div className="w-5 h-5 rounded-full bg-white shadow-sm" />
                            </button>
                          </div>

                          {cfg.enabled && (
                            <div className="mt-3 space-y-2">
                              {/* Model selector */}
                              <select value={cfg.selectedModel}
                                onChange={e => updateProviderCfg(prov.id, { selectedModel: e.target.value, testStatus: "idle" })}
                                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:border-emerald-400 bg-white cursor-pointer">
                                {prov.models.map(m => (
                                  <option key={m.id} value={m.id}>
                                    {m.name} - Input ${m.inputPer1M}/1M | Output ${m.outputPer1M}/1M ({m.tier})
                                  </option>
                                ))}
                              </select>
                              {/* API Key */}
                              <div className="flex gap-2">
                                <input type="password" value={cfg.apiKey}
                                  onChange={e => updateProviderCfg(prov.id, { apiKey: e.target.value, testStatus: "idle" })}
                                  placeholder={cfg.hasKey ? "API key tersimpan (masukkan baru untuk tukar)" : `API Key ${prov.name}`}
                                  className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-emerald-400" />
                                <button onClick={() => testConnection(prov.id)} disabled={isTesting || (!cfg.apiKey && !cfg.hasKey)}
                                  className="px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer disabled:opacity-40 bg-white border-slate-200 text-slate-600 hover:border-emerald-400 hover:text-emerald-600 shrink-0">
                                  {isTesting ? "..." : "Test"}
                                </button>
                              </div>
                              {/* Cost info */}
                              <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                                <span>Kos / soalan: <strong className="text-slate-600">RM {costMYR.toFixed(5)}</strong></span>
                                <span>Est. 1,000 soalan: <strong className={costMYR * 1000 > 5 ? "text-amber-600" : "text-emerald-600"}>RM {(costMYR * 1000).toFixed(2)}</strong></span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Per-Plan Routing */}
                {routerStrategy === "custom" && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Penugasan Per Pelan</h3>
                      <p className="text-[11px] text-slate-400 mt-1">Pilih pembekal AI untuk setiap pelan langganan</p>
                    </div>
                    {plans.map(pl => {
                      const route = planRoutes.find(r => r.planId === pl.id);
                      const selProvId = route?.providerId || AI_PROVIDERS.find(p => providerCfgs[p.id]?.enabled)?.id || "";
                      const selProv = AI_PROVIDERS.find(p => p.id === selProvId);
                      const selModelId = route?.modelId || selProv?.models[0]?.id || "";
                      return (
                        <div key={pl.id} className="flex items-center gap-3 py-3 border-b border-slate-50 last:border-0 flex-wrap">
                          <div className="min-w-[80px]">
                            <p className="text-xs font-bold text-slate-800">{pl.name}</p>
                            <p className="text-[10px] text-slate-400">RM {pl.price}/bln</p>
                          </div>
                          <select value={selProvId}
                            onChange={e => {
                              const p = AI_PROVIDERS.find(x => x.id === e.target.value);
                              setPlanRoutes(prev => {
                                const rest = prev.filter(r => r.planId !== pl.id);
                                return [...rest, { planId: pl.id, providerId: e.target.value, modelId: p?.models[0]?.id || "" }];
                              });
                            }}
                            className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-emerald-400 bg-white cursor-pointer">
                            {AI_PROVIDERS.filter(p => providerCfgs[p.id]?.enabled).map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                          <select value={selModelId}
                            onChange={e => {
                              setPlanRoutes(prev => {
                                const rest = prev.filter(r => r.planId !== pl.id);
                                return [...rest, { planId: pl.id, providerId: selProvId, modelId: e.target.value }];
                              });
                            }}
                            className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-emerald-400 bg-white cursor-pointer">
                            {selProv?.models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Profit Advisor */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-600" /> Penasihat Keuntungan
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-1">Anggaran kos AI vs harga yang anda cas - berdasarkan penggunaan penuh kredit AI setiap bulan</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="text-left py-2 text-[10px] font-bold text-slate-400 pr-3">PELAN</th>
                          <th className="text-right py-2 text-[10px] font-bold text-slate-400 pr-3">HARGA</th>
                          <th className="text-right py-2 text-[10px] font-bold text-slate-400 pr-3">KREDIT AI</th>
                          <th className="text-left py-2 text-[10px] font-bold text-slate-400 pr-3">PEMBEKAL</th>
                          <th className="text-right py-2 text-[10px] font-bold text-slate-400 pr-3">KOS AI/BLN</th>
                          <th className="text-right py-2 text-[10px] font-bold text-slate-400 pr-3">MARGIN</th>
                          <th className="text-right py-2 text-[10px] font-bold text-slate-400">STATUS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profitRows.map(({ pl, prov, model, costMYR, margin, marginPct }) => {
                          const status = marginPct < 0 ? "loss" : marginPct < 15 ? "risk" : marginPct < 40 ? "ok" : "good";
                          const statusLabel = { loss: "RUGI", risk: "Risiko", ok: "OK", good: "Sihat" }[status];
                          const statusCls = { loss: "text-red-600 bg-red-50 border-red-200", risk: "text-amber-600 bg-amber-50 border-amber-200", ok: "text-blue-600 bg-blue-50 border-blue-100", good: "text-emerald-600 bg-emerald-50 border-emerald-200" }[status];
                          return (
                            <tr key={pl.id} className="border-b border-slate-50 last:border-0">
                              <td className="py-3 font-semibold text-slate-800 pr-3">{pl.name}</td>
                              <td className="py-3 text-right text-slate-700 pr-3">RM {pl.price}</td>
                              <td className="py-3 text-right text-slate-500 pr-3">{pl.aiCredits.toLocaleString()}</td>
                              <td className="py-3 text-slate-500 pr-3">{prov ? `${prov.name}` : <span className="text-amber-500">Tiada</span>}</td>
                              <td className="py-3 text-right pr-3">
                                <span className={costMYR > pl.price ? "text-red-600 font-bold" : "text-slate-700"}>
                                  RM {costMYR.toFixed(2)}
                                </span>
                              </td>
                              <td className="py-3 text-right pr-3">
                                <span className={marginPct < 0 ? "text-red-600 font-bold" : marginPct < 15 ? "text-amber-600 font-bold" : "text-emerald-600 font-bold"}>
                                  {marginPct.toFixed(1)}%
                                </span>
                                <span className="text-[10px] text-slate-400 ml-1">(RM {margin.toFixed(2)})</span>
                              </td>
                              <td className="py-3 text-right">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusCls}`}>{statusLabel}</span>
                              </td>
                            </tr>
                          );
                        })}
                        {plans.length === 0 && (
                          <tr><td colSpan={7} className="py-6 text-center text-slate-400 text-xs">Tiada plan ditetapkan. Buka halaman Billing untuk cipta plan.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {profitRows.length > 0 && (
                    <div className="bg-slate-50 rounded-xl p-3 space-y-1.5 text-[11px] text-slate-500">
                      <p className="font-bold text-slate-700 text-xs">Panduan Margin Sihat:</p>
                      <p>Margin &gt; 40% - Keuntungan kukuh, selamat walaupun penggunaan pelanggan tinggi</p>
                      <p>Margin 15-40% - OK, tetapi pantau penggunaan tinggi</p>
                      <p>Margin 0-15% - Risiko rugi jika pelanggan guna AI lebih dari jangkaan</p>
                      <p>Margin &lt; 0% - KERUGIAN PASTI. Naikkan harga atau tukar ke model lebih murah</p>
                      <p className="pt-1 text-[10px] text-slate-400">* Pengiraan berdasarkan penggunaan 100% kredit AI setiap bulan. Penggunaan sebenar biasanya 40-70%.</p>
                    </div>
                  )}
                </div>

                {/* Resource Governance */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-emerald-600" /> Kawalan Sumber Pelanggan
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-1">Benarkan pelanggan guna sumber luar mereka sendiri</p>
                  </div>
                  {[
                    { label: "Benarkan AI Sendiri",     desc: "Pelanggan boleh guna API AI mereka sendiri",        val: allowOwnAI,      set: setAllowOwnAI },
                    { label: "Benarkan Storan Sendiri", desc: "Pelanggan boleh sambung GDrive/OneDrive/Dropbox",   val: allowOwnStorage, set: setAllowOwnStorage },
                    { label: "Benarkan OCR Sendiri",    desc: "Pelanggan boleh guna perkhidmatan OCR sendiri",     val: allowOwnOCR,     set: setAllowOwnOCR },
                  ].map(({ label, desc, val, set }) => (
                    <div key={label} className="flex items-start justify-between py-3 border-b border-slate-50 last:border-0">
                      <div>
                        <p className="text-xs font-semibold text-slate-800">{label}</p>
                        <p className="text-[11px] text-slate-400">{desc}</p>
                      </div>
                      <button onClick={() => set(!val)}
                        className={`w-11 h-6 rounded-full flex items-center px-0.5 cursor-pointer transition-colors ${val ? "bg-emerald-600 justify-end" : "bg-slate-200 justify-start"}`}>
                        <div className="w-5 h-5 rounded-full bg-white shadow-sm transition-all" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* HQ Storage Monitor — relocated to its own dedicated page: "storageGovernance" */}
                <button onClick={() => setActivePage("storageGovernance")}
                  className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center justify-between cursor-pointer hover:border-emerald-300 transition">
                  <div className="flex items-center gap-3 text-left">
                    <HardDrive className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Pemantauan Storan</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">Lihat & uruskan beku/penguatkuasaan storan tenant penuh di Tadbir Storan</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                </button>

                {/* System Health */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-600" /> Kesihatan Sistem
                  </h3>
                  {!useRealData ? (
                    <p className="text-xs text-slate-400">Mod demo — tidak tersambung ke sistem sebenar.</p>
                  ) : systemHealthLoading ? (
                    <div className="grid grid-cols-2 gap-3">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {systemHealth.map(({ label, ok, latencyMs }) => (
                        <div key={label} className={`flex items-center gap-3 p-3.5 border rounded-xl ${ok ? "border-slate-100 bg-emerald-50/40" : "border-red-100 bg-red-50/60"}`}>
                          <div className={`w-2 h-2 rounded-full shrink-0 ${ok ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
                          <div>
                            <p className="text-xs font-semibold text-slate-700">{label}</p>
                            <p className="text-[10px] text-slate-400">{latencyMs}ms &middot; {ok ? "Operasi normal" : "Tidak responsif"}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
              );
            })()}

            {/* â•â•â•â• CUSTOMER 360 FULL PAGE (HQ_OWNER only) â•â•â•â• */}
            {activePage === "customer360" && !isStaff && (() => {
              const c360Wallet = (id: string) => resourceWallets.find(w => w.tenantId === id);
              const c360Alerts = (id: string) => hqAlerts.filter(a => a.tenantId === id);
              const filtered = customers.filter(c => !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.email.toLowerCase().includes(searchQuery.toLowerCase()));
              const detail = customers.find(c => c.id === c360SelectedId) || null;
              return (
              <div className="space-y-4" id="hq_customer360">
                <div className="flex items-center justify-between">
                  <h1 className="text-xl font-bold text-slate-900">Customer 360</h1>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Cari pelanggan..."
                      className="pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-xl outline-none focus:border-emerald-400 bg-white w-48" />
                  </div>
                </div>
                <div className="grid md:grid-cols-5 gap-4">
                  {/* Master list */}
                  <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Senarai Tenant ({filtered.length})
                    </div>
                    <div className="max-h-[600px] overflow-y-auto divide-y divide-slate-50">
                      {filtered.map(c => {
                        const w = c360Wallet(c.id);
                        const active = c360SelectedId === c.id;
                        return (
                          <button key={c.id} onClick={() => setC360SelectedId(c.id)}
                            className={`w-full text-left px-4 py-3 flex items-center gap-3 transition cursor-pointer ${active ? "bg-emerald-50" : "hover:bg-slate-50"}`}>
                            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 font-bold text-sm flex items-center justify-center shrink-0">
                              {c.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-slate-800 truncate">{c.name}</p>
                              <p className="text-[10px] text-slate-400 truncate">{c.plan || "—"} &middot; {w ? `$${w.aiCostUsd30d.toFixed(2)} kos AI/30hr` : "tiada dompet"}</p>
                            </div>
                            {typeof c.healthScore === "number" && (
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                                c.healthRiskLevel === "high" ? "text-red-600 bg-red-50" : c.healthRiskLevel === "medium" ? "text-amber-600 bg-amber-50" : "text-emerald-600 bg-emerald-50"
                              }`}>{c.healthScore}</span>
                            )}
                          </button>
                        );
                      })}
                      {filtered.length === 0 && <div className="p-8 text-center text-xs text-slate-400">Tiada pelanggan</div>}
                    </div>
                  </div>

                  {/* Detail panel */}
                  <div className="md:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    {!detail ? (
                      <div className="h-full flex flex-col items-center justify-center py-16 text-center">
                        <UserCheck className="w-10 h-10 text-slate-200 mb-3" />
                        <p className="text-sm font-semibold text-slate-400">Pilih pelanggan untuk lihat profil 360</p>
                      </div>
                    ) : (() => {
                      const w = c360Wallet(detail.id);
                      const al = c360Alerts(detail.id);
                      return (
                      <div className="space-y-4">
                        <div className="rounded-2xl p-4 flex items-center justify-between" style={{background:"linear-gradient(135deg,#0F2A22 0%,#16382C 100%)"}}>
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-2xl text-white font-bold text-base flex items-center justify-center shadow-sm" style={{background:"#5A9E7A"}}>
                              {detail.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-white">{detail.name}</p>
                              <p className="text-[11px] text-emerald-100/70">{displayEmail(detail.email)}</p>
                            </div>
                          </div>
                          <StatusBadge status={detail.status} />
                        </div>

                        {/* Visual hierarchy: Health / Revenue / Support / Usage / Risk — at a glance */}
                        <div className="grid grid-cols-5 gap-1.5">
                          {(() => {
                            const customerTickets = allTickets.filter(t => t.customer === detail.name && t.status !== "resolved");
                            const riskLevel = detail.status === "suspended" ? "high" : detail.healthRiskLevel === "high" ? "high" : detail.healthRiskLevel === "medium" ? "medium" : "low";
                            const tiles = [
                              { label: "Kesihatan", icon: Activity, value: typeof detail.healthScore === "number" ? `${detail.healthScore}` : "—", tone: detail.healthRiskLevel === "high" ? "red" : detail.healthRiskLevel === "medium" ? "amber" : "emerald" },
                              { label: "Hasil", icon: DollarSign, value: `RM ${detail.mrr.toLocaleString()}`, tone: "emerald" },
                              { label: "Sokongan", icon: Headphones, value: `${customerTickets.length}`, tone: customerTickets.length > 0 ? "amber" : "slate" },
                              { label: "Penggunaan", icon: Zap, value: w ? `${Math.round((w.aiConsumed30d / Math.max(w.aiCreditsBalance + w.aiConsumed30d, 1)) * 100)}%` : "—", tone: "teal" },
                              { label: "Risiko", icon: ShieldAlert, value: riskLevel === "high" ? "Tinggi" : riskLevel === "medium" ? "Sederhana" : "Rendah", tone: riskLevel === "high" ? "red" : riskLevel === "medium" ? "amber" : "emerald" },
                            ] as const;
                            const toneClasses: Record<string, string> = {
                              red: "bg-red-50 border-red-100 text-red-700",
                              amber: "bg-amber-50 border-amber-100 text-amber-700",
                              emerald: "bg-emerald-50 border-emerald-100 text-emerald-700",
                              teal: "bg-teal-50 border-teal-100 text-teal-700",
                              slate: "bg-slate-50 border-slate-100 text-slate-500",
                            };
                            return tiles.map(t => (
                              <div key={t.label} className={`rounded-xl px-1 py-2 border text-center overflow-hidden ${toneClasses[t.tone]}`}>
                                <t.icon className="w-3.5 h-3.5 mx-auto mb-1 opacity-70" />
                                <p className="text-[9px] font-bold leading-tight whitespace-nowrap">{t.value}</p>
                                <p className="text-[7px] font-bold uppercase tracking-wide mt-1 opacity-70 leading-tight">{t.label}</p>
                              </div>
                            ));
                          })()}
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-slate-50 rounded-xl p-3"><p className="text-[10px] text-slate-400">Plan</p><p className="text-sm font-bold text-slate-800">{detail.plan || "—"}</p></div>
                          <div className="bg-slate-50 rounded-xl p-3"><p className="text-[10px] text-slate-400">MRR</p><p className="text-sm font-bold text-emerald-700">RM {detail.mrr.toLocaleString()}</p></div>
                          <div className="bg-slate-50 rounded-xl p-3"><p className="text-[10px] text-slate-400">Jumlah Dibayar</p><p className="text-sm font-bold text-slate-800">RM {detail.totalPaidMyr.toLocaleString()}</p></div>
                        </div>

                        {typeof detail.healthScore === "number" && (
                          <div className={`rounded-xl p-3 border ${detail.healthRiskLevel === "high" ? "bg-red-50 border-red-100" : detail.healthRiskLevel === "medium" ? "bg-amber-50 border-amber-100" : "bg-emerald-50 border-emerald-100"}`}>
                            <p className="text-xs font-bold text-slate-700">Skor Kesihatan: {detail.healthScore}/100</p>
                            {!!detail.healthReasons?.length && (
                              <ul className="mt-1 space-y-0.5">{detail.healthReasons.map((r, i) => <li key={i} className="text-[11px] text-slate-500">- {r}</li>)}</ul>
                            )}
                          </div>
                        )}

                        {w && (
                          <div className="border border-slate-100 rounded-xl p-3 space-y-1">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Dompet Sumber</p>
                            <p className="text-xs text-slate-600">AI: {w.aiCreditsBalance.toLocaleString()} baki, {w.aiConsumed30d.toLocaleString()} digunakan/30hr &middot; ${w.aiCostUsd30d.toFixed(2)} kos</p>
                            <p className="text-xs text-slate-600">OCR: {w.ocrCreditsBalance.toLocaleString()} baki, {w.ocrConsumed30d.toLocaleString()} digunakan/30hr</p>
                            <p className="text-xs text-slate-600">Storan: {fmtDocBytes(w.storageUsedBytes)} / {fmtDocBytes(w.storageLimitBytes)}</p>
                          </div>
                        )}

                        <div className="border border-slate-100 rounded-xl p-3 space-y-1.5">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Amaran Terkini ({al.length})</p>
                          {al.length === 0 ? <p className="text-xs text-slate-400">Tiada amaran</p> : al.slice(0, 5).map(a => (
                            <div key={a.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-2.5 py-1.5">
                              <span className="text-[11px] text-slate-700 truncate">{a.message}</span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${a.severity === "high" ? "bg-red-100 text-red-700" : a.severity === "medium" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{a.severity}</span>
                            </div>
                          ))}
                        </div>

                        <div className="flex gap-2 pt-1">
                          <button onClick={() => openEditCustomer(detail)} className="flex-1 py-2 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl text-xs font-bold cursor-pointer hover:bg-emerald-100 transition">Edit</button>
                          <button onClick={() => toggleStatus(detail.id)} className="flex-1 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold cursor-pointer hover:bg-slate-50 transition">
                            {detail.status === "suspended" ? "Aktifkan" : "Gantung"}
                          </button>
                        </div>
                      </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
              );
            })()}

            {/* â•â•â•â• ALERT CENTER FULL PAGE (HQ_OWNER only) â•â•â•â• */}
            {activePage === "alertCenter" && !isStaff && (() => {
              const typeOptions = Array.from(new Set(hqAlerts.map(a => a.alertType)));
              const filteredAlerts = hqAlerts.filter(a =>
                (alertTypeFilter === "all" || a.alertType === alertTypeFilter) &&
                (alertSeverityFilter === "all" || a.severity === alertSeverityFilter) &&
                (alertResolvedFilter === "all" || (alertResolvedFilter === "resolved" ? !!a.resolvedAt : !a.resolvedAt))
              );
              return (
              <div className="space-y-4" id="hq_alert_center">
                <h1 className="text-xl font-bold text-slate-900">Pusat Amaran</h1>
                <div className="grid grid-cols-3 gap-3">
                  <MetricCard label="Jumlah Amaran" value={hqAlerts.length} icon={Bell} color="slate" />
                  <MetricCard label="Belum Selesai" value={hqAlerts.filter(a => !a.resolvedAt).length} icon={AlertCircle} color="red" />
                  <MetricCard label="Risiko Tinggi" value={hqAlerts.filter(a => a.severity === "high" && !a.resolvedAt).length} icon={AlertTriangle} color="amber" />
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-center gap-3">
                  <select value={alertTypeFilter} onChange={e => setAlertTypeFilter(e.target.value)}
                    className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white outline-none focus:border-emerald-400 cursor-pointer">
                    <option value="all">Semua Jenis</option>
                    {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select value={alertSeverityFilter} onChange={e => setAlertSeverityFilter(e.target.value as any)}
                    className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white outline-none focus:border-emerald-400 cursor-pointer">
                    <option value="all">Semua Keseriusan</option>
                    <option value="high">Tinggi</option>
                    <option value="medium">Sederhana</option>
                    <option value="low">Rendah</option>
                  </select>
                  <select value={alertResolvedFilter} onChange={e => setAlertResolvedFilter(e.target.value as any)}
                    className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white outline-none focus:border-emerald-400 cursor-pointer">
                    <option value="all">Semua Status</option>
                    <option value="unresolved">Belum Selesai</option>
                    <option value="resolved">Selesai</option>
                  </select>
                  <span className="text-[11px] text-slate-400 ml-auto">{filteredAlerts.length} hasil</span>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  {filteredAlerts.length === 0 ? (
                    <div className="p-12 text-center"><p className="text-xs text-slate-400">Tiada amaran sepadan dengan tapisan</p></div>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {filteredAlerts.map(a => {
                        const tenantName = customers.find(c => c.id === a.tenantId)?.name;
                        return (
                          <div key={a.id} className="px-5 py-3.5 flex items-center gap-4">
                            <div className={`w-2 h-2 rounded-full shrink-0 ${a.severity === "high" ? "bg-red-500" : a.severity === "medium" ? "bg-amber-500" : "bg-slate-300"}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-slate-800">{a.message}</p>
                              <p className="text-[10px] text-slate-400">{a.alertType} &middot; {tenantName || "—"} &middot; {new Date(a.createdAt).toLocaleString("ms-MY")}</p>
                            </div>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${a.resolvedAt ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-700"}`}>
                              {a.resolvedAt ? "Selesai" : "Belum Selesai"}
                            </span>
                            {!a.resolvedAt && (
                              <button onClick={() => hqService.resolveHqAlert(a.id).then(() => hqService.getHqAlerts().then(setHqAlerts))}
                                className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-bold cursor-pointer transition shrink-0">
                                Selesaikan
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              );
            })()}

            {/* â•â•â•â• RESOURCE WALLET DASHBOARD FULL PAGE (HQ_OWNER only) â•â•â•â• */}
            {activePage === "walletDashboard" && !isStaff && (() => {
              const sorted = [...resourceWallets].sort((a, b) => {
                const dir = walletSortDir === "asc" ? 1 : -1;
                const av = (a as any)[walletSortKey] ?? 0;
                const bv = (b as any)[walletSortKey] ?? 0;
                if (typeof av === "string") return av.localeCompare(bv) * dir;
                return (av - bv) * dir;
              }).filter(w => !walletSearch || w.tenantName.toLowerCase().includes(walletSearch.toLowerCase()));
              const sortHeader = (key: typeof walletSortKey, label: string) => (
                <th onClick={() => { if (walletSortKey === key) setWalletSortDir(d => d === "asc" ? "desc" : "asc"); else { setWalletSortKey(key); setWalletSortDir("desc"); } }}
                  className="text-right py-2 text-[10px] font-bold text-slate-400 pr-3 cursor-pointer hover:text-emerald-600 select-none">
                  {label}{walletSortKey === key ? (walletSortDir === "asc" ? " ▲" : " ▼") : ""}
                </th>
              );
              return (
              <div className="space-y-4" id="hq_wallet_dashboard">
                <div className="flex items-center justify-between">
                  <h1 className="text-xl font-bold text-slate-900">Dompet Sumber Tenant</h1>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input type="text" value={walletSearch} onChange={e => setWalletSearch(e.target.value)}
                        placeholder="Cari tenant..."
                        className="pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-xl outline-none focus:border-emerald-400 bg-white w-44" />
                    </div>
                    <button onClick={() => setResourceWalletRefreshTick(t => t + 1)} className="text-slate-300 hover:text-emerald-600 cursor-pointer p-2" title="Refresh">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left py-2.5 px-4 text-[10px] font-bold text-slate-400">TENANT</th>
                        {sortHeader("aiCreditsBalance", "AI BAKI")}
                        {sortHeader("aiConsumed30d", "AI 30HR")}
                        {sortHeader("ocrCreditsBalance", "OCR BAKI")}
                        {sortHeader("ocrConsumed30d", "OCR 30HR")}
                        {sortHeader("storageUsedBytes", "STORAN")}
                        {sortHeader("aiCostUsd30d", "KOS AI/30HR")}
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map(w => (
                        <tr key={w.tenantId} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                          <td className="py-3 px-4 font-semibold text-slate-800">{w.tenantName}</td>
                          <td className="py-3 text-right pr-3 text-slate-600">{w.aiCreditsBalance.toLocaleString()}</td>
                          <td className="py-3 text-right pr-3 text-slate-500">{w.aiConsumed30d.toLocaleString()}</td>
                          <td className="py-3 text-right pr-3 text-slate-600">{w.ocrCreditsBalance.toLocaleString()}</td>
                          <td className="py-3 text-right pr-3 text-slate-500">{w.ocrConsumed30d.toLocaleString()}</td>
                          <td className="py-3 text-right pr-3 text-slate-600">{fmtDocBytes(w.storageUsedBytes)} / {fmtDocBytes(w.storageLimitBytes)}</td>
                          <td className="py-3 text-right pr-3 font-bold text-emerald-700">${w.aiCostUsd30d.toFixed(2)}</td>
                        </tr>
                      ))}
                      {sorted.length === 0 && (
                        <tr><td colSpan={7} className="py-10 text-center text-slate-400">Tiada dompet sumber direkodkan</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              );
            })()}

            {/* â•â•â•â• HEALTH SCORE DASHBOARD (HQ_OWNER only) â•â•â•â• */}
            {activePage === "healthScores" && !isStaff && (() => {
              const ranked = customers
                .filter(c => typeof c.healthScore === "number")
                .slice()
                .sort((a, b) => {
                  const order = { high: 0, medium: 1, low: 2 } as Record<string, number>;
                  const ra = order[a.healthRiskLevel || "low"] ?? 2;
                  const rb = order[b.healthRiskLevel || "low"] ?? 2;
                  if (ra !== rb) return ra - rb;
                  return (a.healthScore || 0) - (b.healthScore || 0);
                });
              const highRisk = ranked.filter(c => c.healthRiskLevel === "high");
              return (
              <div className="space-y-4" id="hq_health_scores">
                <h1 className="text-xl font-bold text-slate-900">Skor Kesihatan Pelanggan</h1>
                <div className="grid grid-cols-3 gap-3">
                  <MetricCard label="Risiko Tinggi" value={highRisk.length} icon={AlertTriangle} color="red" />
                  <MetricCard label="Risiko Sederhana" value={ranked.filter(c => c.healthRiskLevel === "medium").length} icon={AlertCircle} color="amber" />
                  <MetricCard label="Sihat" value={ranked.filter(c => c.healthRiskLevel === "low").length} icon={CheckCircle2} color="emerald" />
                </div>
                {highRisk.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-red-700">{highRisk.length} pelanggan berisiko churn tinggi</p>
                      <p className="text-xs text-red-600 mt-0.5">Semak senarai di bawah dan ambil tindakan susulan segera.</p>
                    </div>
                  </div>
                )}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  {ranked.length === 0 ? (
                    <div className="p-12 text-center"><p className="text-xs text-slate-400">Tiada data skor kesihatan</p></div>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {ranked.map(c => (
                        <div key={c.id} className={`px-5 py-3.5 flex items-center gap-4 ${c.healthRiskLevel === "high" ? "bg-red-50/40" : ""}`}>
                          <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 font-bold text-sm flex items-center justify-center shrink-0">
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate">{c.name}</p>
                            <p className="text-[10px] text-slate-400 truncate">{c.plan || "—"} &middot; {c.healthReasons?.join(", ") || "Tiada sebab direkod"}</p>
                          </div>
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${
                            c.healthRiskLevel === "high" ? "text-red-600 bg-red-50 border border-red-200" :
                            c.healthRiskLevel === "medium" ? "text-amber-600 bg-amber-50 border border-amber-200" :
                            "text-emerald-600 bg-emerald-50 border border-emerald-200"
                          }`}>{c.healthScore}/100</span>
                          <button onClick={() => { setC360SelectedId(c.id); setActivePage("customer360"); }}
                            className="px-2.5 py-1.5 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 text-slate-500 rounded-lg text-[10px] font-bold cursor-pointer transition shrink-0">
                            Lihat 360
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              );
            })()}

            {/* â•â•â•â• GOVERNANCE DASHBOARD HUB (HQ_OWNER only) â•â•â•â• */}
            {activePage === "governance" && !isStaff && (
              <div className="space-y-4" id="hq_governance">
                <h1 className="text-xl font-bold text-slate-900">Tadbir Urus HQ</h1>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Shield className="w-4 h-4 text-emerald-600" />Topeng Data (PII)</h3>
                    <p className="text-[11px] text-slate-400">Unmask: {unmaskAllowed ? "Dibenarkan" : "Disekat"} &middot; {hqStaffUsers.filter(u => u.unmaskGranted).length}/{hqStaffUsers.length} staf diberi akses unmask &middot; {maskingGrants.length} geran aktif</p>
                    <button onClick={() => setActivePage("dataMaskingGovernance")} className="text-xs font-bold text-emerald-600 cursor-pointer hover:underline">Buka Tadbir Topeng Data &rarr;</button>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><HardDrive className="w-4 h-4 text-emerald-600" />Tadbir Storan</h3>
                    <p className="text-[11px] text-slate-400">{storageGovernance ? `Beku selepas ${storageGovernance.freezeDays} hari tidak aktif` : "Tetapan belum dimuat"} &middot; {freezeStates.filter(f => f.isFrozen).length} tenant dibekukan</p>
                    <button onClick={() => setActivePage("storageGovernance")} className="text-xs font-bold text-emerald-600 cursor-pointer hover:underline">Buka Tadbir Storan &rarr;</button>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-rose-500" />Tadbir Bayaran</h3>
                    <p className="text-[11px] text-slate-400">Webhook: {webhookEnforce ? "Penguatkuasaan AKTIF" : "Mod bayang"} &middot; {webhookEvents.length} log terkini &middot; {webhookEvents.filter(e => e.wouldHaveBlocked).length} akan disekat</p>
                    <button onClick={() => setActivePage("paymentGovernance")} className="text-xs font-bold text-emerald-600 cursor-pointer hover:underline">Buka Tadbir Bayaran &rarr;</button>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><DollarSign className="w-4 h-4 text-amber-500" />Tadbir Kos AI</h3>
                    <p className="text-[11px] text-slate-400">{aiCostSummary.length} rekod perbelanjaan &middot; Jumlah: ${aiCostSummary.reduce((s, r) => s + r.totalCostUsd, 0).toFixed(2)}</p>
                    <button onClick={() => setActivePage("aiCostGovernance")} className="text-xs font-bold text-emerald-600 cursor-pointer hover:underline">Buka Tadbir Kos AI &rarr;</button>
                  </div>
                </div>
              </div>
            )}

            {/* â•â•â•â• PAYMENT GOVERNANCE DASHBOARD (HQ_OWNER only) â•â•â•â• */}
            {activePage === "paymentGovernance" && !isStaff && (
              <div className="space-y-5" id="hq_payment_governance">
                <h1 className="text-xl font-bold text-slate-900">Tadbir Bayaran</h1>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-500" />
                    <h3 className="text-sm font-bold text-slate-900">Keselamatan Webhook Chip Asia</h3>
                  </div>
                  <div className="flex items-center justify-between p-3 border border-slate-100 rounded-xl">
                    <div>
                      <p className="text-xs font-bold text-slate-800">Penguatkuasaan tandatangan (enforce)</p>
                      <p className="text-[10px] text-slate-400">
                        {webhookEnforce
                          ? "AKTIF — webhook yang gagal pengesahan tandatangan akan ditolak (401)."
                          : "Mod bayang (shadow) — pengesahan direkod tetapi tidak menyekat. Semak log di bawah sebelum mengaktifkan."}
                      </p>
                    </div>
                    <button onClick={toggleWebhookEnforce}
                      className={`w-11 h-6 rounded-full relative transition cursor-pointer ${webhookEnforce ? "bg-rose-600" : "bg-slate-200"}`}>
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition ${webhookEnforce ? "translate-x-5" : ""}`} />
                    </button>
                  </div>
                  {webhookProposalSent && (
                    <p className="text-[10px] text-emerald-600 font-semibold">Cadangan perubahan dihantar untuk kelulusan dua peringkat HQ. Lihat Pusat Kelulusan.</p>
                  )}
                  <p className="text-[10px] text-slate-400">Perubahan kepada tetapan ini memerlukan kelulusan HQ_OWNER kedua melalui Pusat Kelulusan.</p>
                  <div className="space-y-1.5 max-h-[28rem] overflow-y-auto">
                    {webhookEvents.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4">Tiada log webhook lagi.</p>
                    ) : webhookEvents.map(ev => (
                      <div key={ev.id} className="flex items-center justify-between text-[11px] p-2 bg-slate-50 rounded-lg">
                        <span className="text-slate-600">{ev.transactionReference || "-"}</span>
                        <span className={`font-bold ${ev.verificationResult === "verified" ? "text-emerald-600" : "text-rose-600"}`}>
                          {ev.verificationResult}
                        </span>
                        {ev.wouldHaveBlocked && <span className="text-amber-600 font-semibold">akan disekat</span>}
                        <span className="text-slate-400">{new Date(ev.createdAt).toLocaleString("ms-MY")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* â•â•â•â• STORAGE GOVERNANCE DASHBOARD (HQ_OWNER only) â•â•â•â• */}
            {activePage === "storageGovernance" && !isStaff && (() => {
              const GB = 1_073_741_824;
              const supabasePlan = 100 * GB; // Supabase Pro 100GB

              // Merge real Supabase data with customer list
              const tenantViews = customers.map(c => {
                const real = realStorageData.find(r => r.tenant_id === c.id);
                const quotaMap: Record<string, number> = { Starter: 5*GB, Pro: 25*GB, Enterprise: 100*GB };
                const quota = quotaMap[c.plan] || quotaMap.Starter;
                const used  = real ? Number(real.total_bytes) : 0;
                const fileCount = real ? Number(real.file_count) : 0;
                const pct   = used / quota;
                // Freeze/inactivity settings: real Supabase state when available (HQ + tenant
                // both read/enforce the same record), localStorage fallback for sandbox/mock mode.
                const freezeState = freezeStates.find(f => f.tenantId === c.id);
                const cfgRaw = useRealData ? null : localStorage.getItem(storageQuotaKey(c.id));
                const cfg = cfgRaw ? JSON.parse(cfgRaw) : {};
                const lastActive = freezeState?.lastActiveAt || cfg.lastActiveAt || new Date().toISOString();
                const daysSinceActive = Math.floor((Date.now() - new Date(lastActive).getTime()) / 86400000);
                const isFrozen = freezeState?.isFrozen ?? cfg.isFrozen ?? false;
                const frozenReason = freezeState?.frozenReason ?? cfg.frozenReason ?? "";
                return { id: c.id, name: c.name, plan: c.plan, used, quota, pct, fileCount, isFrozen, frozenReason, lastActive, daysSince: daysSinceActive, isInactive: daysSinceActive >= inactiveDays };
              });

              const totalUsed = tenantViews.reduce((s, t) => s + t.used, 0);
              const supabasePct = totalUsed / supabasePlan;

              const toggleFreeze = async (tenantId: string, isFrozen: boolean) => {
                if (useRealData) {
                  await hqService.setTenantFrozen(tenantId, !isFrozen, !isFrozen ? "hq_manual" : "");
                  setStorageRefreshTick(t => t + 1);
                  return;
                }
                const key = storageQuotaKey(tenantId);
                try {
                  const raw = localStorage.getItem(key);
                  const s = raw ? JSON.parse(raw) : {};
                  localStorage.setItem(key, JSON.stringify({ ...s, isFrozen: !isFrozen, frozenReason: !isFrozen ? "hq_manual" : "" }));
                  setStorageRefreshTick(t => t + 1);
                } catch {}
              };

              const doCleanup = (_tenantId: string) => {
                setCleanupTenant(null);
                setStorageRefreshTick(t => t + 1);
              };

              return (
              <div className="space-y-5" id="hq_storage_governance">
                <h1 className="text-xl font-bold text-slate-900">Tadbir Storan</h1>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-emerald-600" /> Pemantauan Storan
                    </h3>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setStorageRefreshTick(t => t + 1)} className="text-slate-300 hover:text-emerald-600 cursor-pointer" title="Refresh">
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[10px] text-slate-400">{fmtDocBytes(totalUsed)} / {fmtDocBytes(supabasePlan)} Supabase</span>
                    </div>
                  </div>

                  {/* Supabase HQ bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">Storan Supabase Anda (HQ)</span>
                      <span className={`font-bold ${supabasePct > 0.85 ? "text-red-600" : supabasePct > 0.70 ? "text-amber-600" : "text-emerald-600"}`}>{(supabasePct*100).toFixed(1)}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${supabasePct > 0.85 ? "bg-red-500" : supabasePct > 0.70 ? "bg-amber-500" : "bg-emerald-500"}`}
                        style={{ width: `${Math.min(supabasePct*100, 100)}%` }} />
                    </div>
                    {supabasePct > 0.70 && (
                      <p className={`text-[10px] font-semibold ${supabasePct > 0.85 ? "text-red-600" : "text-amber-600"}`}>
                        {supabasePct > 0.85 ? "KRITIKAL: Upgrade Supabase plan sebelum pelanggan terjejas!" : "Hampir 70% - Sedia upgrade Supabase Pro plan"}
                      </p>
                    )}
                  </div>

                  {/* Auto-cleanup settings */}
                  <div className="flex items-center justify-between py-2 border-t border-slate-50">
                    <div>
                      <p className="text-xs font-semibold text-slate-700">Tempoh Beku Tidak Aktif</p>
                      <p className="text-[10px] text-slate-400">Bekukan storan tenant yang tidak aktif melebihi tempoh ini</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input type="number" min="7" max="365" value={inactiveDays}
                        onChange={e => saveInactiveDays(parseInt(e.target.value) || 30)}
                        className="w-14 border border-slate-200 rounded-lg px-2 py-1 text-xs text-center focus:outline-none focus:border-emerald-400" />
                      <span className="text-[10px] text-slate-400">hari</span>
                    </div>
                  </div>

                  {/* HQ-triggered enforcement (never autonomous) */}
                  <div className="flex items-center justify-between py-2 border-t border-slate-50">
                    <div>
                      <p className="text-xs font-semibold text-slate-700">Jalankan Penguatkuasaan Sekarang</p>
                      <p className="text-[10px] text-slate-400">
                        {enforcementResult ?? "Bekukan storan semua tenant tidak aktif mengikut tempoh di atas (manual, bukan automatik)"}
                      </p>
                    </div>
                    <button
                      onClick={runEnforcementNow}
                      disabled={enforcementRunning}
                      className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white cursor-pointer"
                    >
                      {enforcementRunning ? "Memproses..." : "Run Enforcement Now"}
                    </button>
                  </div>

                  {/* Per-tenant table */}
                  <div className="space-y-2">
                    {tenantViews.map((t: any) => (
                      <div key={t.id} className={`rounded-xl border p-3 space-y-2 ${t.isFrozen ? "border-red-200 bg-red-50/40" : t.isInactive ? "border-amber-200 bg-amber-50/30" : "border-slate-100"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-xs font-bold text-slate-800 truncate">{t.name}</p>
                              {t.isFrozen && <span className="text-[9px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full border border-red-200">BEKU</span>}
                              {t.isInactive && !t.isFrozen && <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200">Tidak Aktif {t.daysSince}h</span>}
                            </div>
                            <p className="text-[10px] text-slate-400">{t.plan} &middot; {fmtDocBytes(t.used)} / {fmtDocBytes(t.quota)} &middot; {t.fileCount} fail</p>
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            {t.isInactive && (
                              <button onClick={() => setCleanupTenant(t.id)}
                                className="px-2 py-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg cursor-pointer hover:bg-amber-100 transition">
                                Bersih
                              </button>
                            )}
                            <button onClick={() => toggleFreeze(t.id, t.isFrozen)}
                              className={`px-2 py-1 text-[10px] font-bold rounded-lg cursor-pointer transition border ${t.isFrozen ? "text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100" : "text-slate-600 bg-slate-50 border-slate-200 hover:bg-slate-100"}`}>
                              {t.isFrozen ? "Lepas" : "Beku"}
                            </button>
                          </div>
                        </div>
                        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${t.pct > 0.85 ? "bg-red-500" : t.pct > 0.70 ? "bg-amber-500" : "bg-emerald-500"}`}
                            style={{ width: `${Math.min(t.pct*100,100).toFixed(0)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Cleanup confirm */}
                  {cleanupTenant && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                      <p className="text-xs font-bold text-amber-800">Sahkan Padam Fail</p>
                      <p className="text-[11px] text-amber-700">Semua fail dokumen tenant ini akan dipadam. Data kewangan TIDAK terjejas.</p>
                      <div className="flex gap-2">
                        <button onClick={() => doCleanup(cleanupTenant)}
                          className="flex-1 py-2 bg-amber-500 text-white rounded-lg text-xs font-bold cursor-pointer hover:bg-amber-600 transition">
                          Ya, Padam
                        </button>
                        <button onClick={() => setCleanupTenant(null)}
                          className="flex-1 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 cursor-pointer hover:bg-slate-50 transition">
                          Batal
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              );
            })()}

            {/* ═════ AI COST GOVERNANCE (HQ_OWNER only) ═════ */}
            {activePage === "aiCostGovernance" && !isStaff && (
              <div className="space-y-4" id="hq_ai_cost_governance">
                <h1 className="text-xl font-bold text-slate-900">Tadbir Urus Kos AI</h1>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-amber-500" />
                    <h3 className="text-sm font-bold text-slate-900">Kadar Kos Per Panggilan</h3>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold text-slate-500">Kadar kos per panggilan (USD)</p>
                    {AI_PROVIDERS.flatMap(prov => prov.models.map(m => {
                      const existing = aiCostRates.find(r => r.provider === prov.id && r.model === m.id);
                      return (
                        <div key={`${prov.id}:${m.id}`} className="flex items-center justify-between text-xs p-2 bg-slate-50 rounded-lg">
                          <span className="text-slate-600">{prov.name} / {m.id}</span>
                          <input type="number" step="0.0001" min="0" defaultValue={existing?.costPerCallUsd ?? 0}
                            onBlur={e => saveAiCostRate(prov.id, m.id, parseFloat(e.target.value) || 0)}
                            className="w-24 border border-slate-200 rounded-lg px-2 py-1 text-right focus:outline-none focus:border-emerald-400" />
                        </div>
                      );
                    }))}
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-amber-500" />
                    <h3 className="text-sm font-bold text-slate-900">Perbelanjaan Sebenar Mengikut Syarikat</h3>
                  </div>
                  <p className="text-[11px] text-slate-400">Jumlah keseluruhan: ${aiCostSummary.reduce((s, r) => s + r.totalCostUsd, 0).toFixed(4)} (RM{(aiCostSummary.reduce((s, r) => s + r.totalCostUsd, 0) * usdMyr).toFixed(2)})</p>
                  <div className="space-y-2">
                    {aiCostSummary.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-3">Tiada data perbelanjaan lagi.</p>
                    ) : aiCostSummary.map((r, i) => (
                      <div key={`${r.tenantId}-${r.provider}-${i}`} className="flex items-center justify-between text-xs p-2 bg-amber-50 rounded-lg">
                        <span className="text-slate-700 font-semibold">{r.tenantName}</span>
                        <span className="text-slate-500">{r.provider} · {r.totalCalls} panggilan</span>
                        <span className="font-bold text-amber-700">${r.totalCostUsd.toFixed(4)} (RM{(r.totalCostUsd * usdMyr).toFixed(2)})</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activePage === "addonCatalog" && !isStaff && (
              <div className="space-y-4" id="hq_addon_catalog">
                <h1 className="text-xl font-bold text-slate-900">Katalog Pakej Add-On</h1>
                <p className="text-xs text-slate-400">Pakej storan/kredit AI/kredit OCR yang dipaparkan kepada tenant semasa membeli tambahan. Perubahan dihantar ke Pusat Kelulusan dan memerlukan kelulusan kakitangan HQ kedua sebelum berkuat kuasa.</p>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Package className="w-4 h-4 text-emerald-600" />Pakej Aktif</h3>
                  {addonPackages.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-3">Tiada pakej aktif.</p>
                  ) : (
                    <div className="space-y-2">
                      {addonPackages.map((p) => (
                        <div key={p.id} className="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900">{p.label} <span className="text-slate-400 font-normal">({p.creditType})</span> {p.isBestValue && <span className="text-emerald-600">★ Terbaik</span>}</p>
                            <p className="text-[11px] text-slate-500">RM {p.priceMyr.toFixed(2)} &middot; susunan {p.sortOrder}</p>
                          </div>
                          <button
                            onClick={() => requestAddonDeactivate(p.id)}
                            className="shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition bg-red-100 text-red-800 hover:bg-red-200"
                            title="Hantar permintaan nyahaktif ke Pusat Kelulusan"
                          >
                            Minta Nyahaktif
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Package className="w-4 h-4 text-amber-500" />Tambah Pakej Baharu</h3>
                  {addonSubmitError && (
                    <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-700 font-semibold">{addonSubmitError}</div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <select value={addonForm.creditType} onChange={e => setAddonForm({ ...addonForm, creditType: e.target.value as hqService.AddonCreditType })}
                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-emerald-400">
                      {(["STORAGE", "AI", "OCR"] as hqService.AddonCreditType[]).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input placeholder="Label (cth: +5 GB)" value={addonForm.label} onChange={e => setAddonForm({ ...addonForm, label: e.target.value })}
                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-emerald-400" />
                    <input placeholder={addonForm.creditType === "STORAGE" ? "Kuantiti (GB)" : "Kuantiti (kredit)"} type="number" min="0" value={addonForm.amount}
                      onChange={e => setAddonForm({ ...addonForm, amount: e.target.value })}
                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-emerald-400" />
                    <input placeholder="Harga (RM)" type="number" min="0" step="0.01" value={addonForm.priceMyr}
                      onChange={e => setAddonForm({ ...addonForm, priceMyr: e.target.value })}
                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-emerald-400" />
                    <input placeholder="Susunan" type="number" min="0" value={addonForm.sortOrder}
                      onChange={e => setAddonForm({ ...addonForm, sortOrder: e.target.value })}
                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-emerald-400" />
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input type="checkbox" checked={addonForm.isBestValue} onChange={e => setAddonForm({ ...addonForm, isBestValue: e.target.checked })} />
                      Tanda "Terbaik"
                    </label>
                  </div>
                  <button
                    disabled={addonSubmitBusy}
                    onClick={submitAddonPackage}
                    className="px-4 py-2 rounded-lg text-xs font-bold cursor-pointer transition bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Hantar ke Pusat Kelulusan
                  </button>
                </div>
              </div>
            )}

            {/* ═════ PHASE 4 OPS: PROMOTIONS, COMMERCIAL GOVERNANCE & ANALYTICS, PRODUCTION GOVERNANCE, CUSTOMER SUCCESS (HQ_OWNER only) ═════ */}
            {activePage === "phase4Ops" && !isStaff && (
              <div className="space-y-4" id="hq_phase4_ops">
                <h1 className="text-xl font-bold text-slate-900">Promosi, Tadbir Urus &amp; Analitik Komersial</h1>
                <p className="text-xs text-slate-400">Promosi tenant, konfigurasi komersial global, ambang kelulusan, aliran peristiwa komersial, taburan pelan, status tugas berjadual dan tindakan kejayaan pelanggan yang disyorkan.</p>

                {/* Promotions */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Star className="w-4 h-4 text-emerald-600" />Promosi Aktif</h3>
                  {promotions.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-3">Tiada promosi aktif.</p>
                  ) : (
                    <div className="space-y-2">
                      {promotions.map((p) => (
                        <div key={p.id} className="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900">{p.code} <span className="text-slate-400 font-normal">({p.kind === "wallet_credit" ? `kredit ${p.creditType}` : "lanjutan percubaan"})</span></p>
                            <p className="text-[11px] text-slate-500">Tebusan: {p.redemptionsCount}{p.maxRedemptions ? ` / ${p.maxRedemptions}` : ""} &middot; {p.expiresAt ? `tamat ${new Date(p.expiresAt).toLocaleDateString("ms-MY")}` : "tiada tamat tempoh"}</p>
                          </div>
                          <button
                            onClick={() => requestPromotionDeactivate(p.id)}
                            className="shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition bg-red-100 text-red-800 hover:bg-red-200"
                            title="Hantar permintaan nyahaktif ke Pusat Kelulusan"
                          >
                            Minta Nyahaktif
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Star className="w-4 h-4 text-amber-500" />Cipta Promosi Baharu</h3>
                  {promoSubmitError && (
                    <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-700 font-semibold">{promoSubmitError}</div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <input placeholder="Kod promosi (cth: LAUNCH50)" value={promoForm.code} onChange={e => setPromoForm({ ...promoForm, code: e.target.value })}
                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-emerald-400" />
                    <select value={promoForm.kind} onChange={e => setPromoForm({ ...promoForm, kind: e.target.value as hqService.PromotionKind })}
                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-emerald-400">
                      <option value="wallet_credit">Kredit Dompet</option>
                      <option value="trial_extension_days">Lanjutan Percubaan (hari)</option>
                    </select>
                    {promoForm.kind === "wallet_credit" && (
                      <select value={promoForm.creditType} onChange={e => setPromoForm({ ...promoForm, creditType: e.target.value as hqService.AddonCreditType })}
                        className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-emerald-400">
                        {(["STORAGE", "AI", "OCR"] as hqService.AddonCreditType[]).map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    )}
                    <input placeholder={promoForm.kind === "wallet_credit" && promoForm.creditType === "STORAGE" ? "Kuantiti (GB)" : "Kuantiti"} type="number" min="0" value={promoForm.amount}
                      onChange={e => setPromoForm({ ...promoForm, amount: e.target.value })}
                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-emerald-400" />
                    <input placeholder="Had tebusan (kosongkan jika tiada had)" type="number" min="0" value={promoForm.maxRedemptions}
                      onChange={e => setPromoForm({ ...promoForm, maxRedemptions: e.target.value })}
                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-emerald-400" />
                    <input placeholder="Tamat tempoh" type="date" value={promoForm.expiresAt}
                      onChange={e => setPromoForm({ ...promoForm, expiresAt: e.target.value })}
                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-emerald-400" />
                  </div>
                  <button
                    disabled={promoSubmitBusy}
                    onClick={submitPromotion}
                    className="px-4 py-2 rounded-lg text-xs font-bold cursor-pointer transition bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Hantar ke Pusat Kelulusan
                  </button>
                </div>

                {/* Commercial Governance: config audit view + approval thresholds */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-emerald-600" />Nilai Konfigurasi Semasa</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Nilai aktif dalam sistem. Untuk mengubah, gunakan panel "Dasar Harga Sumber" di bawah.</p>
                  </div>
                  {commercialConfigItems.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-3">Tiada item konfigurasi.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {commercialConfigItems.map((c) => (
                        <div key={c.id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                          <p className="text-[11px] font-semibold text-slate-700">{formatConfigKey(c.configKey)}</p>
                          <p className="text-[11px] font-bold text-slate-900">{formatConfigValue(c.configKey, c.value)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="border-t border-slate-100 pt-3">
                    <p className="text-xs font-bold text-slate-900 mb-2">Ambang Kelulusan</p>
                    {approvalThresholds.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-3">Tiada ambang ditetapkan.</p>
                    ) : (
                      <div className="space-y-1">
                        {approvalThresholds.map((t) => (
                          <div key={t.actionType} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg text-[11px]">
                            <span className="text-slate-700 font-semibold">{t.actionType}</span>
                            <span className="text-slate-500">RM {t.valueThresholdMyr.toFixed(2)} &middot; {t.requiresDualApproval ? "perlu kelulusan kembar" : "kelulusan tunggal"}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Commercial Analytics: events + plan distribution */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-emerald-600" />Taburan Pelan</h3>
                  {planDistribution.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-3">Tiada data.</p>
                  ) : (
                    <div className="space-y-1">
                      {planDistribution.map((p) => (
                        <div key={p.planName} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg text-[11px]">
                          <span className="text-slate-700 font-semibold">{p.planName}</span>
                          <span className="text-slate-500">{p.tenantCount} tenant &middot; RM {p.mrrMyr.toFixed(2)} MRR</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-600" />Aliran Peristiwa Komersial</h3>
                  {commercialEvents.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-3">Tiada peristiwa.</p>
                  ) : (
                    <div className="space-y-1 max-h-72 overflow-y-auto">
                      {commercialEvents.map((e) => (
                        <div key={e.id} className="p-2 bg-slate-50 rounded-lg text-[11px]">
                          <p className="font-semibold text-slate-700">{e.eventType} {e.tenantName && <span className="text-slate-400 font-normal">&middot; {e.tenantName}</span>}</p>
                          <p className="text-slate-400">{new Date(e.occurredAt).toLocaleString("ms-MY")}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Production Governance: scheduled job runs */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Server className="w-4 h-4 text-emerald-600" />Tugas Berjadual</h3>
                  {scheduledJobRuns.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-3">Tiada rekod tugas berjadual.</p>
                  ) : (
                    <div className="space-y-1 max-h-72 overflow-y-auto">
                      {scheduledJobRuns.map((j, idx) => (
                        <div key={`${j.jobName}-${j.startedAt}-${idx}`} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg text-[11px]">
                          <span className="text-slate-700 font-semibold">{j.jobName}</span>
                          <span className={`font-semibold ${j.status === "success" ? "text-emerald-600" : j.status === "failed" ? "text-red-600" : "text-slate-500"}`}>{j.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Customer Success: recommended actions */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><UserCheck className="w-4 h-4 text-emerald-600" />Tindakan Disyorkan (Kejayaan Pelanggan)</h3>
                  {recommendedActions.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-3">Tiada tindakan disyorkan.</p>
                  ) : (
                    <div className="space-y-2">
                      {recommendedActions.map((a, idx) => (
                        <div key={`${a.tenantId}-${idx}`} className="p-3 bg-slate-50 rounded-xl">
                          <p className="text-xs font-bold text-slate-900">{a.tenantName} <span className="text-slate-400 font-normal">(skor: {a.healthScore})</span></p>
                          <p className="text-[11px] text-slate-500">{a.playbookName}: {a.recommendedAction}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ═════ DATA MASKING GOVERNANCE (HQ_OWNER only) ═════ */}
            {activePage === "dataMaskingGovernance" && !isStaff && (
              <div className="space-y-4" id="hq_data_masking_governance">
                <h1 className="text-xl font-bold text-slate-900">Tadbir Topeng Data (PII)</h1>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Shield className="w-4 h-4 text-emerald-600" />Status Akses Unmask</h3>
                  <p className="text-[11px] text-slate-400">Unmask: {unmaskAllowed ? "Dibenarkan" : "Disekat"} &middot; {hqStaffUsers.filter(u => u.unmaskGranted).length}/{hqStaffUsers.length} staf diberi akses unmask &middot; {maskingGrants.length} geran aktif</p>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Users className="w-4 h-4 text-emerald-600" />Senarai Akses Kakitangan</h3>
                  {hqStaffUsers.length === 0 ? (
                    <div className="text-center py-4 bg-slate-50 rounded-xl">
                      <Users className="w-6 h-6 text-slate-200 mx-auto mb-1" />
                      <p className="text-xs text-slate-400">Hanya anda sebagai pentadbir HQ</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {hqStaffUsers.map((u) => (
                        <div key={u.userId} className="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 truncate">{u.fullName} <span className="text-slate-400 font-normal">({u.role})</span></p>
                            <p className="text-[11px] text-slate-500 truncate">{u.email}</p>
                          </div>
                          <div className="shrink-0 flex items-center gap-1.5">
                            <select
                              value={u.role}
                              onChange={(e) => changeHqStaffRole(u, e.target.value)}
                              title="Tukar peranan HQ — direkodkan dalam role_change_audit_log"
                              className="px-2 py-1.5 rounded-lg text-[11px] font-bold border border-slate-200 bg-white cursor-pointer focus:outline-none focus:border-emerald-400"
                            >
                              {["HQ_OWNER", "HQ_ADMIN", "HQ_SUPPORT", "HQ_AUDITOR", "HQ_STAFF"].map(r => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => toggleStaffUnmask(u.userId, u.unmaskGranted)}
                              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition ${
                                u.unmaskGranted
                                  ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                                  : "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                              }`}
                            >
                              {u.unmaskGranted ? "Tarik Balik Unmask" : "Beri Akses Unmask"}
                            </button>
                            <button
                              onClick={() => requestStaffSuspension(u.userId, true)}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition bg-red-100 text-red-800 hover:bg-red-200"
                              title="Hantar permintaan gantung ke Pusat Kelulusan — perlu kelulusan kakitangan HQ lain"
                            >
                              Minta Gantung
                            </button>
                            <button
                              onClick={() => revokeHqStaffByUserId(u)}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition bg-slate-100 text-slate-700 hover:bg-slate-200"
                              title="Buang sepenuhnya peranan HQ ini — direkodkan dalam role_change_audit_log"
                            >
                              Buang Peranan
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Bell className="w-4 h-4 text-amber-500" />Permintaan Belum Selesai</h3>
                  <div className="text-center py-4 bg-slate-50 rounded-xl">
                    <p className="text-xs text-slate-400">Tiada sistem permintaan unmask ditubuhkan. Akses diberi/ditarik balik terus oleh pentadbir HQ di atas.</p>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-600" />Sejarah Geran Akses</h3>
                  {maskingGrants.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-3">Tiada sejarah geran lagi.</p>
                  ) : (
                    <div className="space-y-2">
                      {maskingGrants.map((g) => {
                        const u = hqStaffUsers.find(s => s.userId === g.userId);
                        return (
                          <div key={g.userId} className="flex items-center justify-between text-xs p-2 bg-slate-50 rounded-lg">
                            <span className="text-slate-700 font-semibold">{u?.fullName || g.userId}</span>
                            <span className="text-slate-400">{new Date(g.grantedAt).toLocaleString("ms-MY")}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activePage === "approvalCenter" && (
              <div className="space-y-4" id="hq_approval_center">
                <h1 className="text-xl font-bold text-slate-900">Pusat Kelulusan HQ</h1>
                <p className="text-xs text-slate-400">Tindakan sensitif (gantung/aktifkan kakitangan, dsb.) memerlukan kelulusan kakitangan HQ kedua sebelum dilaksanakan. Pemohon tidak boleh meluluskan permintaan sendiri.</p>

                {myHqNotifications.filter(n => n.status === "UNREAD").length > 0 && (
                  <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-2">
                    <h3 className="text-xs font-bold text-amber-800">Notifikasi Akaun Anda</h3>
                    {myHqNotifications.filter(n => n.status === "UNREAD").map((n) => (
                      <div key={n.id} className="flex items-start justify-between gap-3 text-xs">
                        <div>
                          <p className="font-bold text-amber-900">{n.title}</p>
                          <p className="text-amber-700">{n.message}</p>
                        </div>
                        <button
                          onClick={() => hqService.markHqStaffNotificationRead(n.id).then(() => hqService.getMyHqStaffNotifications().then(setMyHqNotifications))}
                          className="shrink-0 px-2 py-1 rounded-lg bg-amber-100 text-amber-800 font-bold hover:bg-amber-200 cursor-pointer"
                        >
                          Tandai Dibaca
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  {(["pending", "approved", "rejected"] as hqService.PendingHqActionStatus[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setPendingHqActionsFilter(s)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition ${
                        pendingHqActionsFilter === s ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {s === "pending" ? "Belum Selesai" : s === "approved" ? "Diluluskan" : "Ditolak"}
                    </button>
                  ))}
                </div>

                {approvalActionError && (
                  <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-700 font-semibold">{approvalActionError}</div>
                )}

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                  {pendingHqActions.length === 0 ? (
                    <div className="text-center py-6 bg-slate-50 rounded-xl">
                      <ShieldAlert className="w-6 h-6 text-slate-200 mx-auto mb-1" />
                      <p className="text-xs text-slate-400">Tiada permintaan dalam kategori ini.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {pendingHqActions.map((a) => (
                        <div key={a.id} className="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900">
                              {a.actionType === "staff_suspend" ? "Gantung Kakitangan"
                                : a.actionType === "staff_reactivate" ? "Aktifkan Semula Kakitangan"
                                : a.actionType === "tenant_suspend" ? "Gantung Pelanggan"
                                : a.actionType === "tenant_reactivate" ? "Aktifkan Semula Pelanggan"
                                : a.actionType === "addon_package_upsert" ? `Tambah/Kemaskini Pakej Add-On${(a.payload as any)?.label ? `: ${(a.payload as any).label}` : ""}`
                                : a.actionType === "addon_package_deactivate" ? "Nyahaktifkan Pakej Add-On"
                                : a.actionType === "commercial_config_upsert" ? `Kemaskini Konfigurasi Komersial${(a.payload as any)?.config_key ? `: ${(a.payload as any).config_key}` : ""}`
                                : a.actionType}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate">
                              Dipohon oleh {a.requestedByEmail || a.requestedBy} &middot; {new Date(a.requestedAt).toLocaleString("ms-MY")}
                            </p>
                            {a.status !== "pending" && (
                              <p className="text-[11px] text-slate-400 truncate">
                                {a.status === "approved" ? "Diluluskan" : "Ditolak"} oleh {a.reviewedByEmail || a.reviewedBy} &middot; {a.reviewedAt ? new Date(a.reviewedAt).toLocaleString("ms-MY") : ""}
                              </p>
                            )}
                          </div>
                          {a.status === "pending" && (
                            <div className="shrink-0 flex items-center gap-1.5">
                              <button
                                disabled={approvalActionBusy === a.id}
                                onClick={() => reviewHqAction(a.id, true)}
                                className="px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition bg-emerald-100 text-emerald-800 hover:bg-emerald-200 disabled:opacity-50"
                              >
                                Luluskan
                              </button>
                              <button
                                disabled={approvalActionBusy === a.id}
                                onClick={() => reviewHqAction(a.id, false)}
                                className="px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition bg-slate-200 text-slate-700 hover:bg-slate-300 disabled:opacity-50"
                              >
                                Tolak
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ═════ ACTIVITY CENTER (Phase 2) ═════ */}
            {activePage === "activityCenter" && (
              <div className="space-y-4" id="hq_activity_center">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-xl font-bold text-slate-900">Pusat Aktiviti HQ</h1>
                    <p className="text-xs text-slate-400">Aliran tindakan tadbir urus seluruh ekosistem — log audit pelanggan &amp; keputusan kelulusan HQ dalam satu paparan.</p>
                  </div>
                  <button
                    onClick={markHqActivitySeenNow}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition bg-slate-100 text-slate-600 hover:bg-slate-200"
                  >
                    Tandai Semua Dibaca {hqActivityUnseenCount > 0 ? `(${hqActivityUnseenCount})` : ""}
                  </button>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-2">
                  {hqActivityFeed.length === 0 ? (
                    <div className="text-center py-6 bg-slate-50 rounded-xl">
                      <Clock className="w-6 h-6 text-slate-200 mx-auto mb-1" />
                      <p className="text-xs text-slate-400">Tiada aktiviti direkodkan.</p>
                    </div>
                  ) : (
                    hqActivityFeed.map((e) => (
                      <div key={`${e.sourceTable}-${e.eventId}`} className="flex items-start justify-between gap-3 p-3 bg-slate-50 rounded-xl">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900">{e.module} &middot; {e.action}</p>
                          <p className="text-[11px] text-slate-500 truncate">{e.actorEmail || "—"} ({e.actorRole}) &middot; {new Date(e.occurredAt).toLocaleString("ms-MY")}</p>
                        </div>
                        <span className="shrink-0 text-[10px] font-bold text-slate-400 bg-white border border-slate-200 px-2 py-0.5 rounded-full">{e.sourceTable === "audit_logs" ? "Audit" : "Kelulusan"}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ═════ COST CENTER (Phase 2, HQ_OWNER only) ═════ */}
            {activePage === "costCenter" && !isStaff && (
              <div className="space-y-4" id="hq_cost_center">
                <h1 className="text-xl font-bold text-slate-900">Pusat Kos HQ</h1>
                <p className="text-xs text-slate-400">Ringkasan margin platform — MRR sebenar, kos AI sebenar (30 hari), dan kos operasi yang direkodkan.</p>

                {hqCostSummary && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                      <p className="text-[11px] text-slate-400">MRR (semasa)</p>
                      <p className="text-lg font-bold text-slate-900">RM{hqCostSummary.mrrMyr.toFixed(2)}</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                      <p className="text-[11px] text-slate-400">Kos AI (30 hari)</p>
                      <p className="text-lg font-bold text-slate-900">RM{hqCostSummary.aiCostMyr30d.toFixed(2)}</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                      <p className="text-[11px] text-slate-400">Kos Operasi (30 hari)</p>
                      <p className="text-lg font-bold text-slate-900">RM{hqCostSummary.operatingCostMyr30d.toFixed(2)}</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                      <p className="text-[11px] text-slate-400">Anggaran Margin (30 hari)</p>
                      <p className={`text-lg font-bold ${hqCostSummary.estimatedMarginMyr30d >= 0 ? "text-emerald-700" : "text-red-700"}`}>RM{hqCostSummary.estimatedMarginMyr30d.toFixed(2)}</p>
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h3 className="text-xs font-bold text-slate-700">Rekod Kos Operasi Baharu</h3>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    <select
                      value={newCostForm.category}
                      onChange={(e) => setNewCostForm(f => ({ ...f, category: e.target.value }))}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5"
                    >
                      {["infrastructure", "vendor", "staffing", "marketing", "other"].map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Keterangan"
                      value={newCostForm.description}
                      onChange={(e) => setNewCostForm(f => ({ ...f, description: e.target.value }))}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 col-span-2"
                    />
                    <input
                      type="number"
                      placeholder="RM"
                      value={newCostForm.amountMyr}
                      onChange={(e) => setNewCostForm(f => ({ ...f, amountMyr: e.target.value }))}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5"
                    />
                    <input
                      type="date"
                      value={newCostForm.incurredOn}
                      onChange={(e) => setNewCostForm(f => ({ ...f, incurredOn: e.target.value }))}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5"
                    />
                  </div>
                  <button
                    onClick={submitOperatingCost}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    Tambah Kos
                  </button>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-2">
                  {hqOperatingCosts.length === 0 ? (
                    <div className="text-center py-6 bg-slate-50 rounded-xl">
                      <TrendingUp className="w-6 h-6 text-slate-200 mx-auto mb-1" />
                      <p className="text-xs text-slate-400">Tiada kos operasi direkodkan.</p>
                    </div>
                  ) : (
                    hqOperatingCosts.map((c) => (
                      <div key={c.id} className="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900">{c.description}</p>
                          <p className="text-[11px] text-slate-500">{c.category} &middot; RM{c.amountMyr.toFixed(2)} &middot; {c.incurredOn}</p>
                        </div>
                        <button
                          onClick={() => removeOperatingCost(c.id)}
                          className="shrink-0 px-2 py-1 rounded-lg bg-red-50 text-red-700 font-bold hover:bg-red-100 cursor-pointer text-[11px]"
                        >
                          Padam
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* WS4: Resource Profit Summary */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <div>
                    <h3 className="text-xs font-bold text-slate-700">Untung Sumber — Anggaran 30 Hari</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Berdasarkan commercial_config_items (Single Source of Truth).</p>
                  </div>
                  {hqProfitSummary.length === 0 ? (
                    <p className="text-[11px] text-slate-400 py-3 text-center">Tiada penggunaan AI/OCR dalam 30 hari lepas.</p>
                  ) : (
                    <div className="space-y-2">
                      {hqProfitSummary.map(row => (
                        <div key={row.creditType} className="p-3 bg-slate-50 rounded-xl space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-700">{row.creditType} ({row.usageCount} penggunaan)</span>
                            <span className={`text-[11px] font-bold ${row.estimatedMarginMyr >= 0 ? "text-emerald-700" : "text-red-600"}`}>Margin Sumber: RM{row.estimatedMarginMyr.toFixed(4)}</span>
                          </div>
                          <div className="grid grid-cols-4 gap-2 text-[10px] text-slate-500">
                            <div><p className="text-slate-400">Kos Pembekal (USD)</p><p className="font-semibold text-slate-700">${row.avgCostUsd.toFixed(4)}</p></div>
                            <div><p className="text-slate-400">Kos Sumber (MYR)</p><p className="font-semibold text-slate-700">RM{row.estimatedCostMyr.toFixed(4)}</p></div>
                            <div><p className="text-slate-400">Hasil Sumber (MYR)</p><p className="font-semibold text-emerald-700">RM{row.estimatedRevenueMyr.toFixed(4)}</p></div>
                            <div><p className="text-slate-400">Markup</p><p className="font-semibold text-slate-700">{row.markupPct}%</p></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400">Kadar USD/MYR: {hqProfitSummary[0]?.billingUsdMyrRate ?? 4.45} • Berdasarkan commercial_config_items semasa.</p>
                </div>

                {/* WS3: Storage Ledger Summary */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <div>
                    <h3 className="text-xs font-bold text-slate-700">Ringkasan Storan Sumber (Storage Ledger)</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Berdasarkan resource_wallet_transactions — konsisten dengan Lejar Sumber Tenant.</p>
                  </div>
                  {hqStorageSummary.length === 0 ? (
                    <p className="text-[11px] text-slate-400 py-3 text-center">Tiada rekod storan dalam lejar sumber.</p>
                  ) : (
                    <div className="space-y-2">
                      {hqStorageSummary.map(row => (
                        <div key={row.workspaceId} className="p-3 bg-slate-50 rounded-xl space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-700">{row.workspaceName}</span>
                            <span className="text-[10px] text-slate-400">{row.tenantName ?? row.tenantId ?? "—"}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-[10px] text-slate-500">
                            <div><p className="text-slate-400">Muat Naik</p><p className="font-semibold text-slate-700">{(row.totalUploadBytes / 1048576).toFixed(2)} MB ({row.uploadCount})</p></div>
                            <div><p className="text-slate-400">Padam</p><p className="font-semibold text-slate-700">{(Math.abs(row.totalDeleteBytes) / 1048576).toFixed(2)} MB ({row.deleteCount})</p></div>
                            <div><p className="text-slate-400">Bersih</p><p className={`font-semibold ${row.netBytes >= 0 ? "text-slate-700" : "text-emerald-700"}`}>{(row.netBytes / 1048576).toFixed(2)} MB</p></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Resource Pricing Policy — Editable */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <div>
                    <h3 className="text-xs font-bold text-slate-700">Dasar Harga Sumber (Resource Pricing Policy)</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Konfigurasi billing tenant. Perubahan akan dihantar untuk kelulusan dual-approval HQ melalui Tindakan Belum Selesai.</p>
                  </div>
                  <div className="space-y-2">
                    {([
                      { key: "avg_ai_cost_usd",       label: "Kos Purata AI (USD)",     type: "number", step: "0.0001" },
                      { key: "avg_ocr_cost_usd",       label: "Kos Purata OCR (USD)",    type: "number", step: "0.0001" },
                      { key: "billing_usd_myr_rate",   label: "Kadar USD/MYR",           type: "number", step: "0.01"   },
                      { key: "markup_ai_pct",          label: "Markup AI (%)",           type: "number", step: "1"      },
                      { key: "markup_ocr_pct",         label: "Markup OCR (%)",          type: "number", step: "1"      },
                      { key: "credit_per_ai_call",     label: "Kredit per Panggilan AI", type: "number", step: "1"      },
                      { key: "credit_per_ocr_page",    label: "Kredit per Halaman OCR",  type: "number", step: "1"      },
                      { key: "min_charge_ai_myr",      label: "Caj Minimum AI (MYR)",    type: "number", step: "0.001"  },
                      { key: "min_charge_ocr_myr",     label: "Caj Minimum OCR (MYR)",   type: "number", step: "0.001"  },
                      { key: "free_allowance_ai",      label: "Elaun Percuma AI",        type: "number", step: "1"      },
                      { key: "promo_multiplier_ai",    label: "Pengganda Promosi AI",    type: "number", step: "0.1"    },
                    ] as { key: string; label: string; type: string; step: string }[]).map(({ key, label, step }) => (
                      <div key={key} className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold text-slate-700">{label}</p>
                          <p className="text-2xs text-slate-400 font-mono">{key}</p>
                        </div>
                        <input
                          type="number"
                          step={step}
                          min="0"
                          value={pricingForm[key] ?? ""}
                          onChange={e => setPricingForm(f => ({ ...f, [key]: e.target.value }))}
                          className="w-28 text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-right font-mono focus:outline-none focus:ring-1 focus:ring-slate-400"
                        />
                      </div>
                    ))}
                    {/* rounding_rule dropdown */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold text-slate-700">Peraturan Pembundaran</p>
                        <p className="text-2xs text-slate-400 font-mono">rounding_rule</p>
                      </div>
                      <select
                        value={pricingForm["rounding_rule"] ?? "ceil"}
                        onChange={e => setPricingForm(f => ({ ...f, rounding_rule: e.target.value }))}
                        className="w-28 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white"
                      >
                        <option value="ceil">Ceiling</option>
                        <option value="floor">Floor</option>
                        <option value="round">Round</option>
                      </select>
                    </div>
                  </div>
                  {pricingSuccess && <p className="text-[11px] text-emerald-600 font-medium">{pricingSuccess}</p>}
                  {pricingError && <p className="text-[11px] text-rose-600 font-medium">{pricingError}</p>}
                  <button
                    onClick={submitPricingPolicy}
                    disabled={pricingBusy}
                    className="w-full text-xs font-semibold bg-slate-900 text-white rounded-xl py-2 hover:bg-slate-700 transition disabled:opacity-50 cursor-pointer"
                  >
                    {pricingBusy ? "Menghantar..." : "Simpan Perubahan"}
                  </button>
                </div>
              </div>
            )}

            {/* ═════ KNOWLEDGE CENTER (Phase 2) ═════ */}
            {activePage === "knowledgeCenter" && (
              <div className="space-y-4" id="hq_knowledge_center">
                <h1 className="text-xl font-bold text-slate-900">Pusat Pengetahuan HQ</h1>
                <p className="text-xs text-slate-400">Pangkalan pengetahuan dalaman HQ — panduan operasi, skrip sokongan, nota penyelesaian masalah.</p>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-2">
                  <h3 className="text-xs font-bold text-slate-700">{knowledgeForm.id ? "Sunting Artikel" : "Artikel Baharu"}</h3>
                  <input
                    type="text"
                    placeholder="Tajuk"
                    value={knowledgeForm.title}
                    onChange={(e) => setKnowledgeForm(f => ({ ...f, title: e.target.value }))}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 w-full"
                  />
                  <input
                    type="text"
                    placeholder="Kategori"
                    value={knowledgeForm.category}
                    onChange={(e) => setKnowledgeForm(f => ({ ...f, category: e.target.value }))}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 w-full"
                  />
                  <textarea
                    placeholder="Kandungan"
                    value={knowledgeForm.body}
                    onChange={(e) => setKnowledgeForm(f => ({ ...f, body: e.target.value }))}
                    rows={4}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 w-full"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={saveKnowledgeArticle}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      {knowledgeForm.id ? "Kemaskini" : "Simpan"}
                    </button>
                    {knowledgeForm.id && (
                      <button
                        onClick={() => setKnowledgeForm({ id: "", title: "", body: "", category: "general" })}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition bg-slate-100 text-slate-600 hover:bg-slate-200"
                      >
                        Batal
                      </button>
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-2">
                  {hqKnowledgeArticles.length === 0 ? (
                    <div className="text-center py-6 bg-slate-50 rounded-xl">
                      <FileText className="w-6 h-6 text-slate-200 mx-auto mb-1" />
                      <p className="text-xs text-slate-400">Tiada artikel pengetahuan.</p>
                    </div>
                  ) : (
                    hqKnowledgeArticles.map((a) => (
                      <div key={a.id} className="flex items-start justify-between gap-3 p-3 bg-slate-50 rounded-xl">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900">{a.title}</p>
                          <p className="text-[11px] text-slate-500 line-clamp-2">{a.body}</p>
                          <p className="text-[10px] text-slate-400">{a.category} &middot; dikemaskini {new Date(a.updatedAt).toLocaleString("ms-MY")}</p>
                        </div>
                        <div className="shrink-0 flex items-center gap-1.5">
                          <button
                            onClick={() => setKnowledgeForm({ id: a.id, title: a.title, body: a.body, category: a.category })}
                            className="px-2 py-1 rounded-lg bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 cursor-pointer text-[11px]"
                          >
                            Sunting
                          </button>
                          {!isStaff && (
                            <button
                              onClick={() => removeKnowledgeArticle(a.id)}
                              className="px-2 py-1 rounded-lg bg-red-50 text-red-700 font-bold hover:bg-red-100 cursor-pointer text-[11px]"
                            >
                              Padam
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

          </div>
        </main>
      </div>

      {/* ── New Ticket Modal ── */}
      {showTicketModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowTicketModal(false)}>
          <div className="w-full max-w-md bg-white rounded-t-3xl md:rounded-3xl shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Buka Tiket Sokongan</h2>
              <button onClick={() => setShowTicketModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 cursor-pointer"><X className="w-4 h-4 text-slate-500" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Pelanggan (Tenant) *</label>
                  <select value={ticketForm.customer} onChange={e => setTicketForm(f => ({...f, customer: e.target.value}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 bg-white">
                    <option value="">Pilih pelanggan...</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">Tiket mesti dikaitkan dengan tenant sedia ada supaya kelihatan kepada pelanggan.</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">E-mel</label>
                  <input type="email" value={ticketForm.email} onChange={e => setTicketForm(f => ({...f, email: e.target.value}))}
                    placeholder="email@syarikat.com"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Subjek *</label>
                <input value={ticketForm.subject} onChange={e => setTicketForm(f => ({...f, subject: e.target.value}))}
                  placeholder="cth: Tidak boleh log masuk"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Keutamaan</label>
                <select value={ticketForm.priority} onChange={e => setTicketForm(f => ({...f, priority: e.target.value as any}))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 bg-white">
                  <option value="low">Rendah</option>
                  <option value="medium">Sederhana</option>
                  <option value="high">Tinggi</option>
                  <option value="critical">Kritikal</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Jenis Isu</label>
                <select value={ticketForm.category} onChange={e => {
                  const key = e.target.value;
                  const tmpl = hqService.SUPPORT_TICKET_TEMPLATES.find(t => t.key === key);
                  setTicketForm(f => ({...f, category: key, subject: f.subject.trim() || (tmpl?.subject ?? f.subject)}));
                }}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 bg-white">
                  <option value="">Pilih jenis isu...</option>
                  {hqService.SUPPORT_TICKET_TEMPLATES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Ringkasan Masalah</label>
                <textarea value={ticketForm.summary} onChange={e => setTicketForm(f => ({...f, summary: e.target.value}))}
                  rows={3} placeholder="Terangkan masalah pelanggan..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 resize-none" />
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowTicketModal(false)} className="flex-1 py-3 border border-slate-200 rounded-2xl text-sm font-bold text-slate-500 cursor-pointer hover:bg-slate-50">Batal</button>
              <button onClick={saveTicket} disabled={!ticketForm.customer.trim() || !ticketForm.subject.trim()}
                className="flex-1 py-3 bg-emerald-700 text-white rounded-2xl text-sm font-bold cursor-pointer hover:bg-emerald-800 disabled:opacity-40">
                Buka Tiket
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Customer Detail Panel ── */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSelectedCustomer(null)}>
          <div className="w-full max-w-md bg-white rounded-t-3xl md:rounded-3xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 font-bold text-base flex items-center justify-center">
                  {selectedCustomer.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">{selectedCustomer.name}</p>
                  <p className="text-[11px] text-slate-400">{displayEmail(selectedCustomer.email)}</p>
                </div>
              </div>
              <button onClick={() => setSelectedCustomer(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 cursor-pointer"><X className="w-4 h-4 text-slate-500" /></button>
            </div>

            <div className="px-6 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-2xl p-3 space-y-0.5">
                  <p className="text-[10px] text-slate-400 font-semibold">Plan</p>
                  <p className="text-sm font-bold text-slate-800">{selectedCustomer.plan || "—"}</p>
                </div>
                <div className="bg-slate-50 rounded-2xl p-3 space-y-0.5">
                  <p className="text-[10px] text-slate-400 font-semibold">Status</p>
                  <StatusBadge status={selectedCustomer.status} />
                </div>
                <div className="bg-slate-50 rounded-2xl p-3 space-y-0.5">
                  <p className="text-[10px] text-slate-400 font-semibold">MRR</p>
                  <p className="text-sm font-bold text-emerald-700">RM {selectedCustomer.mrr.toLocaleString()}</p>
                </div>
                <div className="bg-slate-50 rounded-2xl p-3 space-y-0.5">
                  <p className="text-[10px] text-slate-400 font-semibold">Perbaharui</p>
                  <p className="text-sm font-bold text-slate-800">{selectedCustomer.renewal || "—"}</p>
                </div>
              </div>
              {selectedCustomer.phone && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold">Tel:</span><span>{displayPhone(selectedCustomer.phone)}</span>
                </div>
              )}
              {selectedCustomer.alternatePhone && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold">Tel Alt:</span><span>{displayPhone(selectedCustomer.alternatePhone)}</span>
                </div>
              )}
              {selectedCustomer.registrationNo && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold">SSM:</span><span>{selectedCustomer.registrationNo}</span>
                </div>
              )}
              {selectedCustomer.industry && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold">Industri:</span><span>{selectedCustomer.industry}</span>
                </div>
              )}
              {selectedCustomer.billingEmail && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold">E-mel Bil:</span><span>{selectedCustomer.billingEmail}</span>
                </div>
              )}
              {selectedCustomer.supportEmail && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold">E-mel Sokongan:</span><span>{selectedCustomer.supportEmail}</span>
                </div>
              )}
              {selectedCustomer.notes && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                  <p className="text-[11px] text-amber-700">{selectedCustomer.notes}</p>
                </div>
              )}

              {/* Customer 360 — consolidated cross-module view (Module 10) */}
              <div className="border-t border-slate-100 pt-3 space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Profil 360</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                    <p className="text-[9px] text-slate-400">Penggunaan AI</p>
                    <p className="text-xs font-bold text-slate-800">{selectedCustomer.aiUsage}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                    <p className="text-[9px] text-slate-400">Storan</p>
                    <p className="text-xs font-bold text-slate-800">{selectedCustomer.storageGB.toFixed(2)} GB</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                    <p className="text-[9px] text-slate-400">Jumlah Dibayar</p>
                    <p className="text-xs font-bold text-emerald-700">RM {selectedCustomer.totalPaidMyr.toLocaleString()}</p>
                  </div>
                </div>
                {typeof selectedCustomer.healthScore === "number" && (
                  <div className={`rounded-xl p-3 ${
                    selectedCustomer.healthRiskLevel === "high" ? "bg-red-50 border border-red-100" :
                    selectedCustomer.healthRiskLevel === "medium" ? "bg-amber-50 border border-amber-100" :
                    "bg-emerald-50 border border-emerald-100"
                  }`}>
                    <p className="text-[10px] font-bold text-slate-500">Skor Kesihatan: {selectedCustomer.healthScore}/100</p>
                    {!!selectedCustomer.healthReasons?.length && (
                      <ul className="mt-1 space-y-0.5">
                        {selectedCustomer.healthReasons.map((r, i) => (
                          <li key={i} className="text-[10px] text-slate-500">- {r}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {(() => {
                  const custTickets = allTickets.filter(t => t.customer === selectedCustomer.name);
                  if (custTickets.length === 0) return null;
                  return (
                    <div className="space-y-1">
                      <p className="text-[10px] text-slate-400">Tiket Sokongan ({custTickets.length})</p>
                      {custTickets.slice(0, 3).map(t => (
                        <div key={t.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-2.5 py-1.5">
                          <span className="text-[11px] text-slate-700 truncate">{t.subject}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${t.status === "resolved" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{t.status}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              <div className="text-[10px] text-slate-400">Sejak: {selectedCustomer.joinedAt}</div>
            </div>

            <div className="px-6 pb-6 grid grid-cols-3 gap-2">
              <button onClick={() => openEditCustomer(selectedCustomer)}
                className="py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 cursor-pointer hover:bg-slate-50 transition flex items-center justify-center gap-1">
                <Edit3 className="w-3.5 h-3.5" />Edit
              </button>
              <button onClick={() => { toggleStatus(selectedCustomer.id); }}
                className={`py-2.5 rounded-xl text-xs font-bold cursor-pointer transition ${selectedCustomer.status === "suspended" ? "bg-emerald-50 border border-emerald-100 text-emerald-700 hover:bg-emerald-100" : "bg-amber-50 border border-amber-100 text-amber-600 hover:bg-amber-100"}`}>
                {selectedCustomer.status === "suspended" ? "Aktifkan" : "Gantung"}
              </button>
              <button onClick={() => setDeletingCustomerId(selectedCustomer.id)}
                className="py-2.5 bg-red-50 border border-red-100 rounded-xl text-xs font-bold text-red-500 cursor-pointer hover:bg-red-100 transition">
                Padam
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add/Edit Customer Modal ── */}
      {showCustomerModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowCustomerModal(false)}>
          <div className="w-full max-w-md bg-white rounded-t-3xl md:rounded-3xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">{editingCustomer ? "Edit Pelanggan" : "Tambah Pelanggan"}</h2>
              <button onClick={() => setShowCustomerModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 cursor-pointer"><X className="w-4 h-4 text-slate-500" /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Nama Syarikat / Individu *</label>
                <input value={customerForm.name} onChange={e => setCustomerForm(f => ({...f, name: e.target.value}))}
                  placeholder="cth: Kedai Makan Pak Ali Sdn Bhd"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">E-mel *</label>
                <input type="email" value={customerForm.email} onChange={e => setCustomerForm(f => ({...f, email: e.target.value}))}
                  placeholder="owner@syarikat.com"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">No. Telefon</label>
                  <input value={customerForm.phone ?? ""} onChange={e => setCustomerForm(f => ({...f, phone: e.target.value}))}
                    placeholder="0123456789"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">No. Telefon Alternatif</label>
                  <input value={customerForm.alternatePhone ?? ""} onChange={e => setCustomerForm(f => ({...f, alternatePhone: e.target.value}))}
                    placeholder="0123456789"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Plan</label>
                <select value={customerForm.plan} onChange={e => setCustomerForm(f => ({...f, plan: e.target.value}))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 bg-white">
                  <option value="">— Pilih Plan —</option>
                  {plans.map(p => <option key={p.id} value={p.name}>{p.name} (RM {p.price}/bln)</option>)}
                </select>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <p className="text-xs font-bold text-slate-700 mb-2">Maklumat Syarikat</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">No. Pendaftaran (SSM)</label>
                    <input value={customerForm.registrationNo ?? ""} onChange={e => setCustomerForm(f => ({...f, registrationNo: e.target.value}))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">No. Cukai</label>
                    <input value={customerForm.taxNumber ?? ""} onChange={e => setCustomerForm(f => ({...f, taxNumber: e.target.value}))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Industri</label>
                  <input value={customerForm.industry ?? ""} onChange={e => setCustomerForm(f => ({...f, industry: e.target.value}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                </div>
                <div className="mt-3">
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Alamat</label>
                  <textarea value={customerForm.address ?? ""} onChange={e => setCustomerForm(f => ({...f, address: e.target.value}))}
                    rows={2}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 resize-none" />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <p className="text-xs font-bold text-slate-700 mb-2">Hubungan Bil &amp; Sokongan</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Nama Kontak Bil</label>
                    <input value={customerForm.billingContactName ?? ""} onChange={e => setCustomerForm(f => ({...f, billingContactName: e.target.value}))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">E-mel Bil</label>
                    <input type="email" value={customerForm.billingEmail ?? ""} onChange={e => setCustomerForm(f => ({...f, billingEmail: e.target.value}))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Nama Kontak Sokongan</label>
                    <input value={customerForm.supportContactName ?? ""} onChange={e => setCustomerForm(f => ({...f, supportContactName: e.target.value}))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">E-mel Sokongan</label>
                    <input type="email" value={customerForm.supportEmail ?? ""} onChange={e => setCustomerForm(f => ({...f, supportEmail: e.target.value}))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Nota (pilihan)</label>
                <textarea value={customerForm.notes ?? ""} onChange={e => setCustomerForm(f => ({...f, notes: e.target.value}))}
                  rows={2} placeholder="Nota dalaman tentang pelanggan ini..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 resize-none" />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowCustomerModal(false)} className="flex-1 py-3 border border-slate-200 rounded-2xl text-sm font-bold text-slate-500 cursor-pointer hover:bg-slate-50 transition">Batal</button>
              <button onClick={saveCustomer} disabled={!customerForm.name.trim() || !customerForm.email.trim()}
                className="flex-1 py-3 bg-emerald-700 text-white rounded-2xl text-sm font-bold cursor-pointer hover:bg-emerald-800 transition disabled:opacity-40 disabled:cursor-not-allowed">
                {editingCustomer ? "Simpan" : "Tambah Pelanggan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Customer Confirmation ── */}
      {deletingCustomerId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDeletingCustomerId(null)}>
          <div className="w-80 bg-white rounded-3xl shadow-2xl p-6 space-y-4 mx-4" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-bold text-slate-900">Padam Pelanggan?</h3>
              <p className="text-xs text-slate-400">Rekod pelanggan ini akan dipadam. Tindakan ini tidak boleh dibatalkan.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeletingCustomerId(null)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-500 cursor-pointer hover:bg-slate-50">Batal</button>
              <button onClick={() => deleteCustomer(deletingCustomerId)} className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-bold cursor-pointer hover:bg-red-600">Padam</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Plan Create/Edit Modal ── */}
      {showPlanModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowPlanModal(false)}>
          <div className="w-full max-w-md bg-white rounded-t-3xl md:rounded-3xl shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">{editingPlan ? "Edit Plan" : "Cipta Plan Baru"}</h2>
              <button onClick={() => setShowPlanModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 cursor-pointer"><X className="w-4 h-4 text-slate-500" /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Nama Plan *</label>
                <input value={planForm.name} onChange={e => setPlanForm(f => ({...f, name: e.target.value}))}
                  placeholder="cth: Starter, Pro, Enterprise"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={!!planForm.isCustomPricing} onChange={e => setPlanForm(f => ({...f, isCustomPricing: e.target.checked}))}
                  className="w-4 h-4 rounded accent-emerald-600" />
                <span className="text-xs font-semibold text-slate-600">Harga tersuai (Hubungi Jualan, cth: Enterprise)</span>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Harga (RM/bln) *</label>
                  <input type="number" min={0} value={planForm.price} disabled={planForm.isCustomPricing}
                    onChange={e => setPlanForm(f => ({...f, price: Number(e.target.value)}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:opacity-40" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Kredit AI/bln</label>
                  <input type="number" min={0} value={planForm.aiCredits} onChange={e => setPlanForm(f => ({...f, aiCredits: Number(e.target.value)}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Kredit OCR/bln</label>
                  <input type="number" min={0} value={planForm.ocrCredits} onChange={e => setPlanForm(f => ({...f, ocrCredits: Number(e.target.value)}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Storan (GB)</label>
                  <input type="number" min={1} value={planForm.storageGB} onChange={e => setPlanForm(f => ({...f, storageGB: Number(e.target.value)}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Maks Pengguna</label>
                  <input type="number" min={1} value={planForm.maxUsers} onChange={e => setPlanForm(f => ({...f, maxUsers: Number(e.target.value)}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={!!planForm.featured} onChange={e => setPlanForm(f => ({...f, featured: e.target.checked}))}
                  className="w-4 h-4 rounded accent-emerald-600" />
                <span className="text-xs font-semibold text-slate-600">Tandai sebagai plan popular</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={!!planForm.isTrial} onChange={e => setPlanForm(f => ({...f, isTrial: e.target.checked}))}
                  className="w-4 h-4 rounded accent-emerald-600" />
                <span className="text-xs font-semibold text-slate-600">Plan percubaan percuma (Trial)</span>
              </label>
              {planForm.isTrial && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Tempoh percubaan (hari)</label>
                  <input type="number" min={1} value={planForm.trialDays} onChange={e => setPlanForm(f => ({...f, trialDays: Number(e.target.value)}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Ciri-ciri (satu baris setiap ciri)</label>
                <textarea rows={4} value={planForm.features.join("\n")}
                  onChange={e => setPlanForm(f => ({...f, features: e.target.value.split("\n").map(s => s.trim()).filter(Boolean)}))}
                  placeholder={"1 Syarikat\nSehingga 3 Pengguna\nPengurusan Pendapatan"}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Limitasi (satu baris setiap limitasi)</label>
                <textarea rows={3} value={planForm.limitations.join("\n")}
                  onChange={e => setPlanForm(f => ({...f, limitations: e.target.value.split("\n").map(s => s.trim()).filter(Boolean)}))}
                  placeholder={"Kredit AI Terhad\nTiada Ramalan Aliran Tunai"}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowPlanModal(false)} className="flex-1 py-3 border border-slate-200 rounded-2xl text-sm font-bold text-slate-500 cursor-pointer hover:bg-slate-50 transition">
                Batal
              </button>
              <button onClick={savePlan} disabled={!planForm.name.trim()}
                className="flex-1 py-3 bg-emerald-700 text-white rounded-2xl text-sm font-bold cursor-pointer hover:bg-emerald-800 transition disabled:opacity-40 disabled:cursor-not-allowed">
                {editingPlan ? "Simpan Perubahan" : "Cipta Plan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Plan Confirmation ── */}
      {deletingPlanId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDeletingPlanId(null)}>
          <div className="w-80 bg-white rounded-3xl shadow-2xl p-6 space-y-4 mx-4" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-bold text-slate-900">Padam Plan?</h3>
              <p className="text-xs text-slate-400">Plan yang dipadam tidak boleh dipulihkan. Pelanggan sedia ada tidak terjejas.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeletingPlanId(null)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-500 cursor-pointer hover:bg-slate-50">Batal</button>
              <button onClick={() => deletePlan(deletingPlanId)} className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-bold cursor-pointer hover:bg-red-600">Padam</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile Bottom Nav ── */}
      {(() => {
        const ownerBottomNav = [
          { id: "dashboard" as HQPage,  label: "Dashboard",  icon: LayoutDashboard },
          { id: "customers" as HQPage,  label: "Pelanggan",  icon: Users },
          { id: "support" as HQPage,    label: "Sokongan",   icon: Headphones, badge: openCases },
          { id: "alertCenter" as HQPage, label: "Amaran",    icon: Bell, badge: hqAlerts.filter(a => !a.resolvedAt).length },
          { id: "__more__" as any,      label: "Lagi",       icon: Menu },
        ];
        const staffBottomNav = [
          { id: "dashboard" as HQPage,      label: "Dashboard",  icon: LayoutDashboard },
          { id: "customers" as HQPage,      label: "Pelanggan",  icon: Users },
          { id: "support" as HQPage,        label: "Sokongan",   icon: Headphones, badge: openCases },
          { id: "approvalCenter" as HQPage, label: "Kelulusan",  icon: Bell, badge: pendingHqActions.length },
          { id: "__more__" as any,          label: "Lagi",       icon: Menu },
        ];
        const mobileNav = isStaff ? staffBottomNav : ownerBottomNav;
        return (
          <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t flex items-stretch" style={{borderColor:"#CCE8D9", paddingBottom:"env(safe-area-inset-bottom)"}}>
            {mobileNav.map(({ id, label, icon: Icon, badge }: any) => {
              const active = activePage === id;
              return (
                <button key={id} onClick={() => id === "__more__" ? setSidebarOpen(true) : setActivePage(id)}
                  className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 relative cursor-pointer transition-all"
                  style={{color: active ? "#5A9E7A" : "#94a3b8"}}>
                  <div className="relative">
                    <Icon className="w-5 h-5" />
                    {badge > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center">{badge}</span>
                    )}
                  </div>
                  <span className="text-[10px] font-semibold leading-tight">{label}</span>
                  {active && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full" style={{background:"#5A9E7A"}} />}
                </button>
              );
            })}
          </nav>
        );
      })()}
    </div>
  );
};

