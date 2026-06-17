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
  { id: "T-001", customer: "Butik Raudah Enterprise",  subject: "Tidak boleh log masuk",     priority: "high",   status: "open",     summary: "Pengguna tidak dapat masuk sejak 2 hari lalu. AI mengesan isu kata laluan.",     assigned: "â€"" },
  { id: "T-002", customer: "Syarikat Binaan Teguh MY", subject: "Resit tidak dapat dimuat naik", priority: "medium", status: "pending",  summary: "Saiz fail melebihi had. AI cadangkan kurangkan saiz atau naik taraf storan.", assigned: "Amir" },
  { id: "T-003", customer: "Ladang Hijau Organik",     subject: "Soalan tentang laporan P&L", priority: "low",    status: "resolved", summary: "AI telah menjawab soalan. Pengguna berpuas hati.",                                assigned: "Siti" },
];

const MOCK_PLANS = [
  { id: "p1", name: "Starter",    price: 99,  aiCredits: 500,   storage: "5 GB",  customers: 3 },
  { id: "p2", name: "Pro",        price: 299, aiCredits: 2000,  storage: "25 GB", customers: 2 },
  { id: "p3", name: "Enterprise", price: 899, aiCredits: 10000, storage: "100 GB",customers: 1 },
];

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
}

const BLANK_PLAN: Omit<Plan, "id"> = { name: "", price: 0, aiCredits: 500, storageGB: 5, maxUsers: 3, featured: false };
const BLANK_CUSTOMER: Omit<Customer, "id" | "aiUsage" | "storageGB" | "attention" | "mrr" | "joinedAt"> = {
  name: "", email: "", phone: "", plan: "", status: "active", renewal: "", notes: ""
};

// â"€â"€â"€ Main Component â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
export const HQConsoleShell: React.FC<HQConsoleShellProps> = ({ user }) => {
  const { signOut, isMockUser } = useAuth();

  const isStaff = user?.role === "HQ_STAFF";
  const tickets = isMockUser ? MOCK_TICKETS : [];

  // Customers — persistent for all users
  const customersKey = `mykerani_customers_${user?.id ?? "guest"}`;
  const [customers, setCustomers] = useState<Customer[]>(() => {
    try {
      const stored = localStorage.getItem(customersKey);
      if (stored) return JSON.parse(stored);
    } catch {}
    return isMockUser
      ? MOCK_CUSTOMERS.map(c => ({ ...c, email: `${c.id}@demo.my`, phone: "", joinedAt: "2026-01-01", notes: "" }))
      : [];
  });
  useEffect(() => { localStorage.setItem(customersKey, JSON.stringify(customers)); }, [customers, customersKey]);

  // Plans — persistent for all users
  const plansKey = `mykerani_plans_${user?.id ?? "guest"}`;
  const [plans, setPlans] = useState<Plan[]>(() => {
    try {
      const stored = localStorage.getItem(plansKey);
      if (stored) return JSON.parse(stored);
    } catch {}
    return isMockUser
      ? MOCK_PLANS.map(p => ({ ...p, storageGB: parseInt(p.storage), maxUsers: 10 }))
      : [];
  });
  useEffect(() => { localStorage.setItem(plansKey, JSON.stringify(plans)); }, [plans, plansKey]);

  // Plan modal state
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [planForm, setPlanForm] = useState<Omit<Plan, "id">>(BLANK_PLAN);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);

  const openCreatePlan = () => { setPlanForm(BLANK_PLAN); setEditingPlan(null); setShowPlanModal(true); };
  const openEditPlan = (p: Plan) => { setPlanForm({ name: p.name, price: p.price, aiCredits: p.aiCredits, storageGB: p.storageGB, maxUsers: p.maxUsers, featured: p.featured }); setEditingPlan(p); setShowPlanModal(true); };
  const savePlan = () => {
    if (!planForm.name.trim()) return;
    if (editingPlan) {
      setPlans(prev => prev.map(p => p.id === editingPlan.id ? { ...planForm, id: editingPlan.id } : p));
    } else {
      setPlans(prev => [...prev, { ...planForm, id: `plan-${Date.now()}` }]);
    }
    setShowPlanModal(false);
  };
  const deletePlan = (id: string) => { setPlans(prev => prev.filter(p => p.id !== id)); setDeletingPlanId(null); };

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
  const saveCustomer = () => {
    if (!customerForm.name.trim() || !customerForm.email.trim()) return;
    const planObj = plans.find(p => p.name === customerForm.plan);
    const mrr = planObj?.price ?? 0;
    const renewal = customerForm.renewal || new Date(Date.now() + 30 * 86400000).toLocaleDateString("ms-MY", { day:"numeric", month:"short", year:"numeric" });
    if (editingCustomer) {
      setCustomers(prev => prev.map(c => c.id === editingCustomer.id
        ? { ...c, ...customerForm, renewal, mrr }
        : c));
      setSelectedCustomer(prev => prev?.id === editingCustomer.id ? { ...prev, ...customerForm, renewal, mrr } : prev);
    } else {
      const nc: Customer = { ...customerForm, renewal, mrr, id: `c-${Date.now()}`, aiUsage: 0, storageGB: 0, attention: false, joinedAt: new Date().toISOString().split("T")[0] };
      setCustomers(prev => [...prev, nc]);
    }
    setShowCustomerModal(false);
  };
  const toggleStatus = (id: string) => {
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, status: c.status === "active" ? "suspended" : "active" } : c));
    setSelectedCustomer(prev => prev?.id === id ? { ...prev, status: prev.status === "active" ? "suspended" : "active" } : prev);
  };
  const deleteCustomer = (id: string) => {
    setCustomers(prev => prev.filter(c => c.id !== id));
    setDeletingCustomerId(null);
    setSelectedCustomer(null);
  };

  const [activePage, setActivePage] = useState<HQPage>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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

  // Support ticket reply
  const [replyTicket, setReplyTicket] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const totalMRR    = customers.reduce((s, c) => s + (c.status === "active" ? c.mrr : 0), 0);
  const activeCount = customers.filter(c => c.status === "active").length;
  const openCases   = tickets.filter(t => t.status === "open" || t.status === "pending").length;
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
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{background:"#5A9E7A"}}>
            {firstName.charAt(0).toUpperCase()}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <div className="hidden md:flex">
          <Sidebar />
        </div>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto" id="hq_main">
          <div className="max-w-5xl mx-auto p-4 md:p-5 pb-28 md:pb-10 space-y-4 md:space-y-5">

            {/* â•â•â•â• DASHBOARD â•â•â•â• */}
            {activePage === "dashboard" && (
              <div className="space-y-5" id="hq_dashboard">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-xl font-bold text-slate-900">
                      {isStaff ? `Selamat datang, ${firstName}` : "HQ Dashboard"}
                    </h1>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {new Date().toLocaleDateString("ms-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    </p>
                  </div>
                  {!isStaff && (
                    <button onClick={() => setActivePage("customers")}
                      className="flex items-center space-x-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-sm">
                      <Plus className="w-3.5 h-3.5" /><span>Tambah Pelanggan</span>
                    </button>
                  )}
                </div>

                {/* Owner metrics */}
                {!isStaff ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <MetricCard label="Pelanggan Aktif"   value={activeCount}           sub={`${customers.length} jumlah`}      icon={Users}    color="teal"    trend="up" />
                    <MetricCard label="Hasil Bulanan"     value={`RM ${totalMRR.toLocaleString()}`} sub="MRR semasa"              icon={DollarSign} color="emerald" trend="up" />
                    <MetricCard label="Kes Sokongan"      value={openCases}             sub="perlu tindakan"                    icon={Headphones} color="amber" />
                    <MetricCard label="Penggunaan AI"     value={`${totalAI.toLocaleString()} kredit`} sub="bulan ini"          icon={Zap}      color="violet" />
                    <MetricCard label="Storan Digunakan"  value={`${customers.reduce((s,c)=>s+c.storageGB,0).toFixed(1)} GB`} sub="jumlah" icon={HardDrive} color="slate" />
                    <MetricCard label="Akun Perlu Perhatian" value={customers.filter(c=>c.attention).length} sub="semak segera" icon={AlertCircle} color="red" />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <MetricCard label="Pelanggan Aktif"    value={activeCount}  sub="memerlukan sokongan"     icon={Users}      color="teal" />
                    <MetricCard label="Kes Terbuka"        value={openCases}    sub="perlu tindakan segera"   icon={Headphones} color="amber" />
                    <MetricCard label="Perlu Aktifkan"     value={customers.filter(c=>c.status==="suspended").length} sub="akaun digantung" icon={UserCheck} color="red" />
                    <MetricCard label="Perlu Perhatian"    value={customers.filter(c=>c.attention).length} sub="semak butiran" icon={AlertTriangle} color="violet" />
                  </div>
                )}

                {/* Recent customers */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900">{isStaff ? "Pelanggan Perlu Perhatian" : "Pelanggan Terkini"}</h3>
                    <button onClick={() => setActivePage("customers")} className="text-xs text-emerald-700 font-semibold hover:text-emerald-900 cursor-pointer">Lihat semua â†'</button>
                  </div>
                  {customers.length === 0 ? (
                    <div className="p-10 text-center">
                      <Users className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                      <p className="text-xs text-slate-400">Tiada pelanggan lagi</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {(isStaff ? customers.filter(c => c.attention || c.status === "suspended") : customers).slice(0, 4).map(c => (
                        <div key={c.id} className="px-5 py-3.5 flex items-center space-x-4 hover:bg-slate-50 transition">
                          <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-700 font-bold text-sm shrink-0">
                            {c.name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">{c.name}</p>
                            <p className="text-[11px] text-slate-400">{c.plan} Â· Perbaharui {c.renewal}</p>
                          </div>
                          <StatusBadge status={c.status} />
                          <button onClick={() => setActivePage("customers")} className="text-slate-300 hover:text-emerald-600 transition cursor-pointer">
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Open support tickets */}
                {tickets.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-900">Kes Sokongan Terbuka</h3>
                      <button onClick={() => setActivePage("support")} className="text-xs text-emerald-700 font-semibold hover:text-emerald-900 cursor-pointer">Urus â†'</button>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {tickets.filter(t => t.status !== "resolved").map(t => (
                        <div key={t.id} className="px-5 py-4 space-y-1">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-slate-800">{t.id} â€" {t.subject}</p>
                            <StatusBadge status={t.priority} />
                          </div>
                          <p className="text-xs text-slate-500">{t.customer}</p>
                          <p className="text-[11px] text-slate-400 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                            AI: {t.summary}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick Actions */}
                {!isStaff && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: "Tambah Pelanggan", icon: Plus,       page: "customers" as HQPage,  color: "bg-emerald-700 text-white" },
                      { label: "Urus Sokongan",    icon: Headphones, page: "support" as HQPage,    color: "bg-white border border-slate-200 text-slate-700" },
                      { label: "Semak Penggunaan", icon: Activity,   page: "usage" as HQPage,      color: "bg-white border border-slate-200 text-slate-700" },
                      { label: "Urus Plan",        icon: Package,    page: "billing" as HQPage,    color: "bg-white border border-slate-200 text-slate-700" },
                    ].map(({ label, icon: Icon, page, color }) => (
                      <button key={label} onClick={() => { setActivePage(page); if (label === "Tambah Pelanggan") openAddCustomer(); }}
                        className={`flex items-center space-x-2 px-4 py-3 rounded-xl text-xs font-bold shadow-sm transition cursor-pointer ${color}`}>
                        <Icon className="w-4 h-4 shrink-0" /><span>{label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

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

                {customers.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center shadow-sm">
                    <Building2 className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-slate-500">Tiada pelanggan lagi</p>
                    <p className="text-xs text-slate-400 mt-1">Pelanggan yang mendaftar akan muncul di sini</p>
                    <button onClick={openAddCustomer} className="mt-4 px-5 py-2.5 bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-emerald-800 transition">
                      Tambah Pelanggan Pertama
                    </button>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="grid grid-cols-12 px-5 py-3 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <div className="col-span-4">Pelanggan</div>
                      <div className="col-span-2">Plan</div>
                      <div className="col-span-2">Status</div>
                      <div className="col-span-2 hidden md:block">Perbaharui</div>
                      <div className="col-span-2">Tindakan</div>
                    </div>
                    {customers
                      .filter(c => !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.email.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map(c => (
                        <div key={c.id} className="grid grid-cols-12 px-5 py-4 border-b border-slate-50 hover:bg-slate-50 transition items-center">
                          <div className="col-span-4 flex items-center space-x-3">
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
                          <div className="col-span-2">
                            <StatusBadge status={c.status} />
                          </div>
                          <div className="col-span-2 hidden md:block">
                            <span className="text-xs text-slate-500">{c.renewal || "—"}</span>
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
                    {customers.filter(c => !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.email.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && searchQuery && (
                      <div className="p-10 text-center text-xs text-slate-400">Tiada hasil carian untuk "{searchQuery}"</div>
                    )}
                  </div>
                )}
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

                {/* Invoices */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900">Invois Terkini</h3>
                  <div className="text-center py-6">
                    <Receipt className="w-7 h-7 text-slate-200 mx-auto mb-2" />
                    <p className="text-xs text-slate-400">Tiada invois lagi</p>
                  </div>
                </div>
              </div>
            )}

            {/* â•â•â•â• USAGE (HQ_OWNER only) â•â•â•â• */}
            {activePage === "usage" && !isStaff && (
              <div className="space-y-5" id="hq_usage">
                <h1 className="text-xl font-bold text-slate-900">Penggunaan Platform</h1>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <MetricCard label="Jumlah Kredit AI"  value={totalAI.toLocaleString()}      sub="semua pelanggan bulan ini" icon={Zap}      color="amber" />
                  <MetricCard label="Jumlah Storan"     value={`${customers.reduce((s,c)=>s+c.storageGB,0).toFixed(1)} GB`} sub="digunakan" icon={HardDrive} color="slate" />
                  <MetricCard label="OCR Digunakan"     value="â€""                              sub="belum diaktifkan"          icon={Brain}    color="violet" />
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
              </div>
            )}

            {/* â•â•â•â• SUPPORT â•â•â•â• */}
            {activePage === "support" && (
              <div className="space-y-4" id="hq_support">
                <h1 className="text-xl font-bold text-slate-900">Sokongan Pelanggan</h1>

                {/* Status filter tabs */}
                <div className="flex gap-2">
                  {["Semua", "Terbuka", "Dalam Proses", "Selesai"].map(f => (
                    <button key={f} className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition ${f === "Semua" ? "bg-emerald-700 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-emerald-300"}`}>
                      {f}
                    </button>
                  ))}
                </div>

                {tickets.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center shadow-sm">
                    <Headphones className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-slate-500">Tiada kes sokongan</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {tickets.map(t => (
                      <div key={t.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{t.id}</span>
                              <StatusBadge status={t.status} />
                              <StatusBadge status={t.priority} />
                            </div>
                            <p className="text-sm font-bold text-slate-900 mt-1.5">{t.subject}</p>
                            <p className="text-xs text-slate-500">{t.customer}</p>
                          </div>
                          <span className="text-[11px] text-slate-400 shrink-0">Ditugaskan: {t.assigned}</span>
                        </div>

                        {/* AI Summary */}
                        <div className="flex items-start space-x-2.5 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                          <Brain className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-[10px] font-bold text-emerald-700 mb-1">Ringkasan AI</p>
                            <p className="text-xs text-emerald-800 leading-relaxed">{t.summary}</p>
                          </div>
                        </div>

                        {/* Reply form */}
                        {replyTicket === t.id ? (
                          <div className="space-y-2">
                            <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                              placeholder="Taip jawapan anda..."
                              rows={3}
                              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xs outline-none focus:border-emerald-400 bg-white resize-none" />
                            <div className="flex gap-2">
                              <button onClick={() => { setReplyTicket(null); setReplyText(""); }}
                                className="flex-1 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold cursor-pointer hover:bg-slate-50 transition">
                                Batal
                              </button>
                              <button className="flex-1 py-2 bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-emerald-800 transition">
                                Hantar Jawapan
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button onClick={() => setReplyTicket(t.id)}
                              className="px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold cursor-pointer transition">
                              Balas
                            </button>
                            <button className="px-3 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold cursor-pointer hover:bg-slate-50 transition">
                              Tugaskan
                            </button>
                            {t.status !== "resolved" && (
                              <button className="px-3 py-2 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl text-xs font-bold cursor-pointer transition">
                                Tandakan Selesai
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
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
                            <p className="text-[11px] text-slate-400">{c.plan} Â· Perbaharui {c.renewal}</p>
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
            {activePage === "revenue" && !isStaff && (
              <div className="space-y-5" id="hq_revenue">
                <h1 className="text-xl font-bold text-slate-900">Hasil & Keuntungan</h1>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <MetricCard label="Hasil Bulan Ini"  value={`RM ${totalMRR.toLocaleString()}`} icon={DollarSign} color="emerald" trend="up" />
                  <MetricCard label="Kos AI"           value="RM â€""    sub="anggaran"   icon={Zap}        color="amber" />
                  <MetricCard label="Kos Storan"       value="RM â€""    sub="anggaran"   icon={HardDrive}  color="slate" />
                  <MetricCard label="Keuntungan Kasar" value="RM â€""    sub="anggaran"   icon={TrendingUp} color="teal" trend="up" />
                  <MetricCard label="MRR"              value={`RM ${totalMRR.toLocaleString()}`} sub="Recurring Revenue" icon={RefreshCw} color="violet" />
                  <MetricCard label="Kos OCR"          value="RM â€""    sub="anggaran"   icon={Brain}      color="slate" />
                </div>

                {/* Revenue by plan */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <h3 className="text-sm font-bold text-slate-900">Hasil Mengikut Plan</h3>
                  {plans.map(p => {
                    const rev = customers.filter(c => c.plan === p.name && c.status === "active").length * p.price;
                    return (
                      <div key={p.id} className="flex items-center space-x-4">
                        <span className="text-xs font-semibold text-slate-700 w-24 shrink-0">{p.name}</span>
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${totalMRR > 0 ? (rev/totalMRR)*100 : 0}%` }} />
                        </div>
                        <span className="text-xs font-bold text-slate-800 w-20 text-right shrink-0">RM {rev.toLocaleString()}</span>
                      </div>
                    );
                  })}
                  {plans.length === 0 && <p className="text-xs text-slate-400 text-center py-4">Tiada data lagi</p>}
                </div>
              </div>
            )}

            {/* â•â•â•â• SETTINGS (HQ_OWNER only) â•â•â•â• */}
            {activePage === "settings" && !isStaff && (
              <div className="space-y-5" id="hq_settings">
                <h1 className="text-xl font-bold text-slate-900">Tetapan</h1>

                {/* HQ Profile */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                    <Shield className="w-4 h-4 text-emerald-600" /><span>Profil HQ</span>
                  </h3>
                  <div className="flex items-center space-x-4 p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-700 text-white flex items-center justify-center text-xl font-bold shadow">
                      {user?.fullName?.charAt(0).toUpperCase() || "H"}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{user?.fullName || "HQ Owner"}</p>
                      <p className="text-xs text-slate-500">{user?.email}</p>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">HQ_OWNER</span>
                    </div>
                  </div>
                </div>

                {/* HQ Staff */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                      <Users className="w-4 h-4 text-emerald-600" /><span>Kakitangan HQ</span>
                    </h3>
                    <button onClick={() => { setShowCreateStaff(v => !v); setStaffResult(null); }}
                      className="flex items-center space-x-1.5 px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold cursor-pointer transition">
                      <Plus className="w-3.5 h-3.5" /><span>Tambah Staf</span>
                    </button>
                  </div>

                  {showCreateStaff && (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 space-y-3">
                      <p className="text-xs font-bold text-emerald-800">Cipta Akaun HQ_STAFF</p>
                      <input type="text" value={staffName} onChange={e => setStaffName(e.target.value)} placeholder="Nama penuh"
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-400 bg-white" />
                      <input type="email" value={staffEmail} onChange={e => setStaffEmail(e.target.value)} placeholder="Email kakitangan"
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-400 bg-white" />
                      <button onClick={handleCreateHQStaff} disabled={staffCreating || !staffEmail.trim() || !staffName.trim()}
                        className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold cursor-pointer transition">
                        {staffCreating ? "Mencipta..." : "Cipta Akaun"}
                      </button>
                      {staffResult && (
                        <div className={`rounded-xl p-3 text-xs ${staffResult.success ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"}`}>
                          <p className={`font-bold ${staffResult.success ? "text-emerald-700" : "text-red-700"}`}>{staffResult.success ? "âœ" Berjaya!" : "âœ— Gagal"}</p>
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
                  <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                    <Bell className="w-4 h-4 text-emerald-600" /><span>Pemberitahuan</span>
                  </h3>
                  {[
                    { label: "Pelanggan baru mendaftar",  on: true },
                    { label: "Perbaharuan akan tamat",     on: true },
                    { label: "Kes sokongan baharu",        on: true },
                    { label: "Penggunaan tinggi dikesan",  on: false },
                  ].map(({ label, on }) => (
                    <div key={label} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                      <span className="text-xs text-slate-700">{label}</span>
                      <div className={`w-9 h-5 rounded-full flex items-center px-0.5 cursor-pointer transition ${on ? "bg-emerald-600 justify-end" : "bg-slate-200 justify-start"}`}>
                        <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* â•â•â•â• SYSTEM CENTER (HQ_OWNER only) â•â•â•â• */}
            {activePage === "system" && !isStaff && (
              <div className="space-y-5" id="hq_system">
                <h1 className="text-xl font-bold text-slate-900">Pusat Sistem</h1>

                {/* System Health */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                    <Activity className="w-4 h-4 text-emerald-600" /><span>Kesihatan Sistem</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "AI MYKERANI",     status: "ok", latency: "120ms" },
                      { label: "Storan",          status: "ok", latency: "45ms" },
                      { label: "Pengesahan",      status: "ok", latency: "89ms" },
                      { label: "Pangkalan Data",  status: "ok", latency: "67ms" },
                    ].map(({ label, status, latency }) => (
                      <div key={label} className="flex items-center space-x-3 p-3.5 border border-slate-100 rounded-xl bg-emerald-50/40">
                        <div className={`w-2 h-2 rounded-full ${status === "ok" ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
                        <div>
                          <p className="text-xs font-semibold text-slate-700">{label}</p>
                          <p className="text-[10px] text-slate-400">{latency} Â· Operasi normal</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Resource Governance */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                      <Shield className="w-4 h-4 text-emerald-600" /><span>Kawalan Sumber</span>
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-1">Izinkan pelanggan guna sumber luar</p>
                  </div>
                  {[
                    { label: "Benarkan AI Sendiri",     desc: "Pelanggan boleh guna API AI mereka sendiri",    val: allowOwnAI,      set: setAllowOwnAI },
                    { label: "Benarkan Storan Sendiri", desc: "Pelanggan boleh sambung GDrive/OneDrive/Dropbox", val: allowOwnStorage, set: setAllowOwnStorage },
                    { label: "Benarkan OCR Sendiri",    desc: "Pelanggan boleh guna perkhidmatan OCR sendiri",  val: allowOwnOCR,     set: setAllowOwnOCR },
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

                {/* Providers */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900">Pembekal Aktif</h3>
                  {[
                    { label: "AI",      provider: "MYKERANI AI (Gemini)",  status: "Aktif" },
                    { label: "Storan",  provider: "MYKERANI Storan",        status: "Aktif" },
                    { label: "OCR",     provider: "MYKERANI OCR",           status: "Aktif" },
                  ].map(({ label, provider, status }) => (
                    <div key={label} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
                      <div>
                        <p className="text-xs font-semibold text-slate-700">{label}</p>
                        <p className="text-[11px] text-slate-400">{provider}</p>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">{status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </main>
      </div>

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

