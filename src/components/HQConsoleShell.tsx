import React, { useState, useEffect } from "react";
import { type Tenant, type Workspace, type UserSessionProfile } from "../types";
import {
  LayoutDashboard, Users, CreditCard, BarChart3, DollarSign, Settings,
  Headphones, Server, TrendingUp, TrendingDown, AlertCircle, CheckCircle2,
  Clock, Search, Plus, RefreshCw, ChevronRight, Zap, HardDrive,
  Brain, Building2, UserCheck, UserX, Edit3, Bell, Shield, LogOut,
  ArrowUpRight, Menu, X, Activity, Package, Receipt, ToggleLeft,
  ToggleRight, AlertTriangle, Circle, FileText, MessageSquare,
  User, Send, Star, Repeat, Archive,
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
type HQPage = "dashboard" | "customers" | "billing" | "usage" | "support" | "revenue" | "settings" | "system" | "subscriptions";

// â"€â"€ Mock data (demo accounts only) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const MOCK_CUSTOMERS = [
  { id: "c1", name: "Kedai Makan Pak Ali Sdn Bhd",    plan: "Starter",    status: "active",    renewal: "15 Jul 2026", aiUsage: 45,  storageGB: 0.8, attention: false, mrr: 99 },
  { id: "c2", name: "Syarikat Binaan Teguh MY",        plan: "Pro",        status: "active",    renewal: "3 Jul 2026",  aiUsage: 312, storageGB: 8.2, attention: true,  mrr: 299 },
  { id: "c3", name: "Butik Raudah Enterprise",         plan: "Starter",    status: "suspended", renewal: "1 Jul 2026",  aiUsage: 12,  storageGB: 0.3, attention: true,  mrr: 0 },
  { id: "c4", name: "TechVenture Solutions MY",        plan: "Enterprise", status: "active",    renewal: "28 Jul 2026", aiUsage: 891, storageGB: 42,  attention: false, mrr: 899 },
  { id: "c5", name: "Ladang Hijau Organik Sdn Bhd",   plan: "Pro",        status: "active",    renewal: "10 Jul 2026", aiUsage: 178, storageGB: 5.1, attention: false, mrr: 299 },
];

const MOCK_TICKETS = [
  { id: "T-001", customer: "Butik Raudah Enterprise",  subject: "Tidak boleh log masuk",     priority: "high",   status: "open",     summary: "Pengguna tidak dapat masuk sejak 2 hari lalu. AI mengesan isu kata laluan.",     assigned: "-" },
  { id: "T-002", customer: "Syarikat Binaan Teguh MY", subject: "Resit tidak dapat dimuat naik", priority: "medium", status: "pending",  summary: "Saiz fail melebihi had. AI cadangkan kurangkan saiz atau naik taraf storan.", assigned: "Amir" },
  { id: "T-003", customer: "Ladang Hijau Organik",     subject: "Soalan tentang laporan P&L", priority: "low",    status: "resolved", summary: "AI telah menjawab soalan. Pengguna berpuas hati.",                                assigned: "Siti" },
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
    resolved: "bg-slate-100 text-slate-500 border-slate-200",
    high: "bg-red-50 text-red-600 border-red-200",
    medium: "bg-amber-50 text-amber-700 border-amber-200",
    low: "bg-slate-100 text-slate-500 border-slate-200",
  };
  const labels: Record<string, string> = {
    active: "Aktif", suspended: "Digantung", open: "Terbuka", pending: "Dalam Proses",
    resolved: "Selesai", high: "Tinggi", medium: "Sederhana", low: "Rendah",
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
  storageGB: number;
  maxUsers: number;
  featured?: boolean;
}

interface Customer {
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

const BLANK_PLAN: Omit<Plan, "id"> = { name: "", price: 0, aiCredits: 500, storageGB: 5, maxUsers: 3, featured: false };
const BLANK_CUSTOMER: Omit<Customer, "id" | "aiUsage" | "storageGB" | "attention" | "mrr" | "joinedAt" | "totalPaidMyr"> = {
  name: "", email: "", phone: "", plan: "", status: "active", renewal: "", notes: ""
};

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
      ? MOCK_PLANS.map(p => ({ ...p, storageGB: parseInt(p.storage), maxUsers: 10 }))
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
  const openEditPlan = (p: Plan) => { setPlanForm({ name: p.name, price: p.price, aiCredits: p.aiCredits, storageGB: p.storageGB, maxUsers: p.maxUsers, featured: p.featured }); setEditingPlan(p); setShowPlanModal(true); };
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
    setCustomerForm({ name: c.name, email: c.email, phone: c.phone ?? "", plan: c.plan, status: c.status, renewal: c.renewal, notes: c.notes ?? "" });
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
      await hqService.setCustomerStatus(id, nextStatus);
      reloadCustomers();
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

  // Fetch real storage usage + freeze/inactivity state from Supabase
  useEffect(() => {
    getAllWorkspacesStorageUsage().then(data => { if (data.length > 0) setRealStorageData(data); });
    if (useRealData) hqService.getStorageFreezeStates().then(setFreezeStates);
  }, [storageRefreshTick, useRealData]);

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

  // Notifications (HQ)
  const notif = useNotifications(`hq_${user?.id || "guest"}`);
  const [showNotifPanel, setShowNotifPanel] = useState(false);

  // Tickets — persistent for all users (deklarasi di sini supaya boleh dipakai dalam useEffect bawah)
  interface Ticket {
    id: string;
    customer: string;
    email?: string;
    subject: string;
    priority: "high" | "medium" | "low";
    status: "open" | "pending" | "resolved";
    summary: string;
    assigned: string;
    createdAt: string;
    replies: { id: string; author: string; text: string; at: string }[];
  }
  const ticketsKey = `mykerani_tickets_${user?.id ?? "guest"}`;
  const [allTickets, setAllTickets] = useState<Ticket[]>(() => {
    try {
      const stored = localStorage.getItem(ticketsKey);
      if (stored) return JSON.parse(stored);
    } catch {}
    return isMockUser ? MOCK_TICKETS.map(t => ({
      ...t, email: "", createdAt: "2026-06-01",
      replies: [] as { id: string; author: string; text: string; at: string }[]
    })) : [];
  });

  useEffect(() => {
    const totalUsed = customers.reduce((s, c) => {
      try { const raw = localStorage.getItem(`mykerani_storage_quota_${c.id}`); return s + (raw ? JSON.parse(raw).usedBytes || 0 : 0); } catch { return s; }
    }, 0);
    const supabasePlan = 100 * 1024 * 1024 * 1024;
    const frozenTenants   = customers.filter(c => { try { const r = localStorage.getItem(`mykerani_storage_quota_${c.id}`); return r && JSON.parse(r).isFrozen; } catch { return false; } }).map(c => c.name);
    const inactiveTenants = customers.filter(c => { try { const r = localStorage.getItem(`mykerani_storage_quota_${c.id}`); if (!r) return false; const s = JSON.parse(r); return Math.floor((Date.now() - new Date(s.lastActiveAt || 0).getTime()) / 86400000) >= (s.inactiveDaysLimit || 30); } catch { return false; } }).map(c => c.name);
    const highStorage     = customers.map(c => { try { const r = localStorage.getItem(`mykerani_storage_quota_${c.id}`); if (!r) return null; const s = JSON.parse(r); return { name: c.name, pct: s.usedBytes / s.quotaBytes }; } catch { return null; } }).filter((t): t is { name: string; pct: number } => !!t && t.pct >= 0.90);
    const openTickets = allTickets.filter(t => t.status === "open" || t.status === "pending").length;
    buildHQNotifs({ frozenTenants, inactiveTenants, highStorageTenants: highStorage, openTickets, supabasePct: totalUsed / supabasePlan, newCustomers: [] }).forEach(n => notif.push(n));
  }, [customers.length, allTickets.length]);

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
  const [aiRouterLoaded, setAiRouterLoaded] = useState(!useRealData);

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

  const testConnection = async (providerId: string) => {
    setTestingProv(providerId);
    updateProviderCfg(providerId, { testStatus: "idle" });
    await new Promise(r => setTimeout(r, 1600));
    const cfg = providerCfgs[providerId];
    const ok = Boolean(cfg?.apiKey ? cfg.apiKey.length >= 10 : cfg?.hasKey);
    updateProviderCfg(providerId, { testStatus: ok ? "ok" : "fail" });
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

  useEffect(() => { localStorage.setItem(ticketsKey, JSON.stringify(allTickets)); }, [allTickets, ticketsKey]);

  const [ticketFilter, setTicketFilter] = useState<"all" | "open" | "pending" | "resolved">("all");
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [ticketForm, setTicketForm] = useState({ customer: "", email: "", subject: "", priority: "medium" as "high"|"medium"|"low", summary: "" });
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const saveTicket = () => {
    if (!ticketForm.customer.trim() || !ticketForm.subject.trim()) return;
    const t: Ticket = {
      id: `T-${String(allTickets.length + 1).padStart(3, "0")}`,
      customer: ticketForm.customer, email: ticketForm.email,
      subject: ticketForm.subject, priority: ticketForm.priority,
      status: "open", summary: ticketForm.summary || "Tiada ringkasan.",
      assigned: "-", createdAt: new Date().toISOString().split("T")[0], replies: []
    };
    setAllTickets(prev => [t, ...prev]);
    setTicketForm({ customer: "", email: "", subject: "", priority: "medium", summary: "" });
    setShowTicketModal(false);
  };
  const resolveTicket = (id: string) => setAllTickets(prev => prev.map(t => t.id === id ? { ...t, status: "resolved" } : t));
  const reopenTicket = (id: string) => setAllTickets(prev => prev.map(t => t.id === id ? { ...t, status: "open" } : t));
  const sendReply = (id: string) => {
    if (!replyText.trim()) return;
    const reply = { id: `r-${Date.now()}`, author: user?.fullName || "HQ", text: replyText.trim(), at: new Date().toLocaleString("ms-MY") };
    setAllTickets(prev => prev.map(t => t.id === id ? { ...t, status: "pending" as const, replies: [...t.replies, reply] } : t));
    setReplyText("");
  };
  const assignTicket = (id: string, name: string) => setAllTickets(prev => prev.map(t => t.id === id ? { ...t, assigned: name } : t));

  const filteredTickets = allTickets.filter(t => ticketFilter === "all" || t.status === ticketFilter);

  const totalMRR    = customers.reduce((s, c) => s + (c.status === "active" ? c.mrr : 0), 0);
  const activeCount = customers.filter(c => c.status === "active").length;
  const openCases   = allTickets.filter(t => t.status === "open" || t.status === "pending").length;
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: staffEmail.trim(), fullName: staffName.trim(), role: "HQ_STAFF", tenantId: "tenant-hq-0001", callerJwt: jwt }),
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

  // â"€â"€ Nav items â"€â"€
  const ownerNav = [
    { id: "dashboard" as HQPage,   label: "Dashboard",      icon: LayoutDashboard },
    { id: "customers" as HQPage,   label: "Pelanggan",      icon: Users },
    { id: "billing" as HQPage,     label: "Pengebilan",     icon: CreditCard },
    { id: "usage" as HQPage,       label: "Penggunaan",     icon: Activity },
    { id: "support" as HQPage,     label: "Sokongan",       icon: Headphones, badge: openCases },
    { id: "revenue" as HQPage,     label: "Hasil",          icon: DollarSign },
    { id: "settings" as HQPage,    label: "Tetapan",        icon: Settings },
    { id: "system" as HQPage,      label: "Pusat Sistem",   icon: Server },
  ];

  const staffNav = [
    { id: "dashboard" as HQPage,     label: "Dashboard",      icon: LayoutDashboard },
    { id: "customers" as HQPage,     label: "Pelanggan",      icon: Users },
    { id: "subscriptions" as HQPage, label: "Langganan",      icon: Repeat },
    { id: "support" as HQPage,       label: "Sokongan",       icon: Headphones, badge: openCases },
  ];

  const navItems = isStaff ? staffNav : ownerNav;
  const firstName = user?.fullName?.split(" ")[0] || "HQ";

  // â"€â"€ Sidebar â"€â"€
  const Sidebar = ({ mobile }: { mobile?: boolean }) => (
    <aside className={`${mobile ? "w-full" : "w-56"} flex flex-col h-full bg-white border-r border-slate-200`}>
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-100">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-700 flex items-center justify-center text-white font-bold text-sm shadow-sm">MK</div>
          <div>
            <p className="font-bold text-slate-900 text-sm leading-tight">MYKERANI</p>
            <p className="text-[10px] text-slate-400">{isStaff ? "HQ Operasi" : "HQ Pentadbiran"}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ id, label, icon: Icon, badge }: any) => {
          const active = activePage === id;
          return (
            <button key={id} onClick={() => { setActivePage(id); setSidebarOpen(false); }}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer ${active ? "bg-emerald-50 text-emerald-800 font-semibold" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}>
              <Icon className={`w-4 h-4 shrink-0 ${active ? "text-emerald-700" : "text-slate-400"}`} />
              <span className="flex-1 text-left">{label}</span>
              {badge > 0 && (
                <span className="bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center shrink-0">{badge}</span>
              )}
              {active && <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 shrink-0" />}
            </button>
          );
        })}
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
      <header className="md:hidden bg-white border-b px-4 py-3 flex items-center justify-between shrink-0" style={{borderColor:"#CCE8D9"}}>
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-sm" style={{background:"#5A9E7A"}}>MK</div>
          <div>
            <p className="font-bold text-slate-900 text-sm leading-tight">MYKERANI HQ</p>
            <p className="text-[10px]" style={{color:"#5A9E7A"}}>{isStaff ? "Kakitangan HQ" : "Pemilik HQ"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold" style={{color:"#2C5040"}}>{navItems.find(n => n.id === activePage)?.label}</span>
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
              const mrrAtRisk    = customers.filter(c => c.status === "suspended").reduce((s, c) => s + c.mrr, 0);
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
                  const stPct  = (() => { try { const r = localStorage.getItem(`mykerani_storage_quota_${c.id}`); if (!r) return 0; const s = JSON.parse(r); return s.usedBytes / s.quotaBytes; } catch { return 0; } })();
                  const score  = Math.max(aiPct, stPct);
                  const reason = aiPct >= stPct ? `AI ${Math.round(aiPct*100)}% digunakan` : `Storan ${Math.round(stPct*100)}% digunakan`;
                  const nextPlan = plans.find(p => p.price > (plan?.price || 0));
                  return { ...c, aiPct, stPct, score, reason, nextPlan };
                })
                .filter(c => c.score >= 0.75)
                .sort((a, b) => b.score - a.score);

              // Churn risks
              const churnRisks = customers
                .filter(c => c.status === "suspended" || c.attention || allTickets.some(t => t.customer === c.name && t.status !== "resolved"))
                .map(c => ({
                  ...c,
                  riskLevel: c.status === "suspended" ? "high" : "medium" as "high"|"medium",
                  riskReason: c.status === "suspended" ? "Digantung - tiada bayaran" : c.attention ? "Perlu perhatian" : "Tiket sokongan terbuka",
                  potentialLoss: c.mrr,
                }))
                .sort((a, b) => (b.riskLevel === "high" ? 1 : 0) - (a.riskLevel === "high" ? 1 : 0));

              // Today's briefing items
              const briefing: { icon: string; text: string; action: () => void; urgent: boolean }[] = [];
              if (openCases > 0) briefing.push({ icon: "S", text: `${openCases} tiket sokongan menunggu respons`, action: () => setActivePage("support"), urgent: true });
              if (churnRisks.filter(r => r.riskLevel === "high").length > 0) briefing.push({ icon: "!", text: `${churnRisks.filter(r=>r.riskLevel==="high").length} pelanggan digantung - RM ${mrrAtRisk} MRR terancam`, action: () => setActivePage("customers"), urgent: true });
              if (upsellTargets.length > 0) briefing.push({ icon: "U", text: `${upsellTargets.length} peluang upsell - potensi RM ${upsellTargets.reduce((s,c)=>s+(c.nextPlan?.price||0)-(c.mrr),0)}/bln tambahan`, action: () => {}, urgent: false });
              if (briefing.length === 0) briefing.push({ icon: "OK", text: "Semua baik! Tiada tindakan segera diperlukan.", action: () => {}, urgent: false });

              return (
              <div className="space-y-5" id="hq_dashboard">

                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-xl font-bold text-slate-900">{isStaff ? `Selamat datang, ${firstName}` : "Command Center"}</h1>
                    <p className="text-xs text-slate-400 mt-0.5">{new Date().toLocaleDateString("ms-MY",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</p>
                  </div>
                  {!isStaff && (
                    <button onClick={() => { setActivePage("customers"); openAddCustomer(); }}
                      className="flex items-center gap-1.5 px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-sm">
                      <Plus className="w-3.5 h-3.5" /> Tambah Pelanggan
                    </button>
                  )}
                </div>

                {/* Morning Briefing */}
                <div className="bg-slate-900 rounded-2xl p-4 space-y-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Briefing Hari Ini</p>
                  {briefing.map((b, i) => (
                    <button key={i} onClick={b.action}
                      className={`w-full flex items-center gap-3 text-left cursor-pointer group ${b.action.toString().includes("setActivePage") ? "hover:opacity-80" : ""}`}>
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-black shrink-0 ${b.urgent ? "bg-red-500 text-white" : "bg-emerald-600 text-white"}`}>
                        {b.icon}
                      </div>
                      <p className={`text-xs ${b.urgent ? "text-white font-semibold" : "text-slate-300"}`}>{b.text}</p>
                      {b.action.toString().includes("setActivePage") && <ChevronRight className="w-3 h-3 text-slate-500 shrink-0 ml-auto group-hover:text-slate-300" />}
                    </button>
                  ))}
                </div>

                {/* Revenue Health */}
                {!isStaff && (
                  <div className="grid grid-cols-2 gap-3">
                    {/* MRR card */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 col-span-2 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Kesihatan Hasil</p>
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

                {/* Upsell Radar */}
                {!isStaff && upsellTargets.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">Radar Upsell</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">Pelanggan hampir had - peluang naik taraf plan</p>
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

                {/* Churn Risk */}
                {!isStaff && churnRisks.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">Risiko Churn</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">Pelanggan berisiko berhenti - ambil tindakan sekarang</p>
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

                {/* Open tickets */}
                {allTickets.filter(t => t.status !== "resolved").length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-900">Tiket Sokongan Terbuka</h3>
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
                              <p className="text-[10px] text-slate-400 truncate">{c.email}</p>
                              {c.attention && <span className="text-[9px] text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded-full">Perlu Perhatian</span>}
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
                          <div className="flex items-center justify-between pr-14">
                            <span className="font-bold text-slate-900">{p.name}</span>
                          </div>
                          <p className="text-2xl font-bold text-slate-900">RM {p.price.toLocaleString()}<span className="text-xs text-slate-400 font-normal">/bln</span></p>
                          <div className="text-[11px] text-slate-400 space-y-0.5">
                            <p>AI: {p.aiCredits.toLocaleString()} kredit/bln</p>
                            <p>Storan: {p.storageGB} GB</p>
                            <p>Pengguna: sehingga {p.maxUsers}</p>
                            {isMockUser && <p className="text-emerald-600 font-semibold">{activeCount} pelanggan aktif</p>}
                          </div>
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
                            <p className="text-xs font-bold text-slate-800 truncate">{a.tenantName} — {a.planName}</p>
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

            {/* â•â•â•â• SUPPORT â•â•â•â• */}
            {activePage === "support" && (
              <div className="space-y-4" id="hq_support">
                <div className="flex items-center justify-between">
                  <h1 className="text-xl font-bold text-slate-900">Sokongan Pelanggan</h1>
                  <button onClick={() => setShowTicketModal(true)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-emerald-800 transition">
                    <Plus className="w-3.5 h-3.5" /><span>Tiket Baru</span>
                  </button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <MetricCard label="Terbuka" value={allTickets.filter(t=>t.status==="open").length} icon={AlertCircle} color="red" />
                  <MetricCard label="Dalam Proses" value={allTickets.filter(t=>t.status==="pending").length} icon={Clock} color="amber" />
                  <MetricCard label="Selesai" value={allTickets.filter(t=>t.status==="resolved").length} icon={CheckCircle2} color="emerald" />
                </div>

                {/* Filter tabs */}
                <div className="flex gap-2 flex-wrap">
                  {([["all","Semua"],["open","Terbuka"],["pending","Dalam Proses"],["resolved","Selesai"]] as const).map(([val, label]) => (
                    <button key={val} onClick={() => setTicketFilter(val)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition ${ticketFilter === val ? "bg-emerald-700 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-emerald-300"}`}>
                      {label} {val !== "all" && `(${allTickets.filter(t=>t.status===val).length})`}
                    </button>
                  ))}
                </div>

                {filteredTickets.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center shadow-sm">
                    <Headphones className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-slate-500">Tiada tiket dalam kategori ini</p>
                    <button onClick={() => setShowTicketModal(true)} className="mt-4 px-4 py-2 bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-emerald-800 transition">
                      Buka Tiket Pertama
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredTickets.map(t => {
                      const isExpanded = expandedTicket === t.id;
                      return (
                        <div key={t.id} className={`bg-white border rounded-2xl shadow-sm overflow-hidden ${t.status === "open" ? "border-red-100" : t.status === "pending" ? "border-amber-100" : "border-slate-200"}`}>
                          {/* Header */}
                          <div className="p-5 space-y-2">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{t.id}</span>
                                  <StatusBadge status={t.status} />
                                  <StatusBadge status={t.priority} />
                                  {t.replies.length > 0 && <span className="text-[9px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{t.replies.length} balasan</span>}
                                </div>
                                <p className="text-sm font-bold text-slate-900 mt-1.5">{t.subject}</p>
                                <p className="text-xs text-slate-500">{t.customer}{t.email ? ` - ${t.email}` : ""}</p>
                              </div>
                              <div className="text-right shrink-0 space-y-1">
                                <p className="text-[10px] text-slate-400">{t.createdAt}</p>
                                <p className="text-[10px] text-slate-400">Staf: {t.assigned}</p>
                              </div>
                            </div>

                            {/* Summary */}
                            <div className="flex items-start gap-2.5 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                              <Brain className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                              <p className="text-xs text-emerald-800 leading-relaxed">{t.summary}</p>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <button onClick={() => { setExpandedTicket(isExpanded ? null : t.id); setReplyText(""); }}
                                className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold cursor-pointer transition">
                                {isExpanded ? "Tutup" : "Balas"}
                              </button>
                              {t.status !== "resolved" ? (
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
                            </div>
                          </div>

                          {/* Expanded replies */}
                          {isExpanded && (
                            <div className="border-t border-slate-100 bg-slate-50 p-4 space-y-3">
                              {t.replies.length > 0 && (
                                <div className="space-y-2">
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
                              <div className="space-y-2">
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
                            <p className="text-[10px] text-slate-400">{c.plan} &middot; {c.email}</p>
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
                              onBlur={() => localStorage.setItem(plansKey, JSON.stringify(plans))}
                              className="w-24 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-center focus:outline-none focus:border-emerald-400 bg-white" />
                          </div>
                        </div>
                      ))}
                      <p className="text-[10px] text-slate-400">Perubahan disimpan secara automatik apabila anda klik di luar medan.</p>
                    </div>
                  )}
                </div>

                {/* HQ Staff */}
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
                  <div className="text-center py-4 bg-slate-50 rounded-xl">
                    <Users className="w-6 h-6 text-slate-200 mx-auto mb-1" />
                    <p className="text-xs text-slate-400">Hanya anda sebagai pentadbir HQ</p>
                  </div>
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

                {/* HQ Storage Monitor */}
                {(() => {
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
                        <p className="text-xs font-semibold text-slate-700">Auto-Cleanup Tidak Aktif</p>
                        <p className="text-[10px] text-slate-400">Padam fail tenant yang tidak aktif melebihi tempoh</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input type="number" min="7" max="365" value={inactiveDays}
                          onChange={e => setInactiveDays(parseInt(e.target.value) || 30)}
                          className="w-14 border border-slate-200 rounded-lg px-2 py-1 text-xs text-center focus:outline-none focus:border-emerald-400" />
                        <span className="text-[10px] text-slate-400">hari</span>
                      </div>
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
                  );
                })()}

                {/* System Health */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-600" /> Kesihatan Sistem
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "AI Router",       latency: "120ms" },
                      { label: "Storan",          latency: "45ms"  },
                      { label: "Pengesahan",      latency: "89ms"  },
                      { label: "Pangkalan Data",  latency: "67ms"  },
                    ].map(({ label, latency }) => (
                      <div key={label} className="flex items-center gap-3 p-3.5 border border-slate-100 rounded-xl bg-emerald-50/40">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-slate-700">{label}</p>
                          <p className="text-[10px] text-slate-400">{latency} &middot; Operasi normal</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
              );
            })()}

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
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Nama Pelanggan *</label>
                  <input value={ticketForm.customer} onChange={e => setTicketForm(f => ({...f, customer: e.target.value}))}
                    list="ticket-customers" placeholder="Nama syarikat"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400" />
                  <datalist id="ticket-customers">
                    {customers.map(c => <option key={c.id} value={c.name} />)}
                  </datalist>
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
                  <p className="text-[11px] text-slate-400">{selectedCustomer.email}</p>
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
                  <span className="font-semibold">Tel:</span><span>{selectedCustomer.phone}</span>
                </div>
              )}
              {selectedCustomer.notes && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                  <p className="text-[11px] text-amber-700">{selectedCustomer.notes}</p>
                </div>
              )}
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
          <div className="w-full max-w-md bg-white rounded-t-3xl md:rounded-3xl shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
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
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Plan</label>
                  <select value={customerForm.plan} onChange={e => setCustomerForm(f => ({...f, plan: e.target.value}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 bg-white">
                    <option value="">— Pilih Plan —</option>
                    {plans.map(p => <option key={p.id} value={p.name}>{p.name} (RM {p.price}/bln)</option>)}
                  </select>
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Harga (RM/bln) *</label>
                  <input type="number" min={0} value={planForm.price} onChange={e => setPlanForm(f => ({...f, price: Number(e.target.value)}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Kredit AI/bln</label>
                  <input type="number" min={0} value={planForm.aiCredits} onChange={e => setPlanForm(f => ({...f, aiCredits: Number(e.target.value)}))}
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
          { id: "revenue" as HQPage,    label: "Hasil",      icon: DollarSign },
          { id: "settings" as HQPage,   label: "Tetapan",    icon: Settings },
        ];
        const staffBottomNav = [
          { id: "dashboard" as HQPage,     label: "Dashboard",  icon: LayoutDashboard },
          { id: "customers" as HQPage,     label: "Pelanggan",  icon: Users },
          { id: "subscriptions" as HQPage, label: "Langganan",  icon: Repeat },
          { id: "support" as HQPage,       label: "Sokongan",   icon: Headphones, badge: openCases },
        ];
        const mobileNav = isStaff ? staffBottomNav : ownerBottomNav;
        return (
          <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t flex items-stretch" style={{borderColor:"#CCE8D9", paddingBottom:"env(safe-area-inset-bottom)"}}>
            {mobileNav.map(({ id, label, icon: Icon, badge }: any) => {
              const active = activePage === id;
              return (
                <button key={id} onClick={() => setActivePage(id)}
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

