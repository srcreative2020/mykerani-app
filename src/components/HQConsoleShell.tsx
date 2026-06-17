import React, { useState } from "react";
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

// ── Mock data (demo accounts only) ────────────────────────────────────────────
const MOCK_CUSTOMERS = [
  { id: "c1", name: "Kedai Makan Pak Ali Sdn Bhd",    plan: "Starter",    status: "active",    renewal: "15 Jul 2026", aiUsage: 45,  storageGB: 0.8, attention: false, mrr: 99 },
  { id: "c2", name: "Syarikat Binaan Teguh MY",        plan: "Pro",        status: "active",    renewal: "3 Jul 2026",  aiUsage: 312, storageGB: 8.2, attention: true,  mrr: 299 },
  { id: "c3", name: "Butik Raudah Enterprise",         plan: "Starter",    status: "suspended", renewal: "1 Jul 2026",  aiUsage: 12,  storageGB: 0.3, attention: true,  mrr: 0 },
  { id: "c4", name: "TechVenture Solutions MY",        plan: "Enterprise", status: "active",    renewal: "28 Jul 2026", aiUsage: 891, storageGB: 42,  attention: false, mrr: 899 },
  { id: "c5", name: "Ladang Hijau Organik Sdn Bhd",   plan: "Pro",        status: "active",    renewal: "10 Jul 2026", aiUsage: 178, storageGB: 5.1, attention: false, mrr: 299 },
];

const MOCK_TICKETS = [
  { id: "T-001", customer: "Butik Raudah Enterprise",  subject: "Tidak boleh log masuk",     priority: "high",   status: "open",     summary: "Pengguna tidak dapat masuk sejak 2 hari lalu. AI mengesan isu kata laluan.",     assigned: "—" },
  { id: "T-002", customer: "Syarikat Binaan Teguh MY", subject: "Resit tidak dapat dimuat naik", priority: "medium", status: "pending",  summary: "Saiz fail melebihi had. AI cadangkan kurangkan saiz atau naik taraf storan.", assigned: "Amir" },
  { id: "T-003", customer: "Ladang Hijau Organik",     subject: "Soalan tentang laporan P&L", priority: "low",    status: "resolved", summary: "AI telah menjawab soalan. Pengguna berpuas hati.",                                assigned: "Siti" },
];

const MOCK_PLANS = [
  { id: "p1", name: "Starter",    price: 99,  aiCredits: 500,   storage: "5 GB",  customers: 3 },
  { id: "p2", name: "Pro",        price: 299, aiCredits: 2000,  storage: "25 GB", customers: 2 },
  { id: "p3", name: "Enterprise", price: 899, aiCredits: 10000, storage: "100 GB",customers: 1 },
];

// ── Status Badge ──────────────────────────────────────────────────────────────
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

// ── Metric Card ───────────────────────────────────────────────────────────────
const MetricCard = ({ label, value, sub, icon: Icon, color = "teal", trend }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color?: "teal" | "emerald" | "red" | "amber" | "violet" | "slate";
  trend?: "up" | "down" | "neutral";
}) => {
  const colors = {
    teal:    { bg: "bg-teal-50",    icon: "text-teal-600",    border: "border-teal-100" },
    emerald: { bg: "bg-emerald-50", icon: "text-emerald-600", border: "border-emerald-100" },
    red:     { bg: "bg-red-50",     icon: "text-red-500",     border: "border-red-100" },
    amber:   { bg: "bg-amber-50",   icon: "text-amber-600",   border: "border-amber-100" },
    violet:  { bg: "bg-violet-50",  icon: "text-violet-600",  border: "border-violet-100" },
    slate:   { bg: "bg-slate-50",   icon: "text-slate-500",   border: "border-slate-200" },
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

// ─── Main Component ───────────────────────────────────────────────────────────
export const HQConsoleShell: React.FC<HQConsoleShellProps> = ({ user }) => {
  const { signOut, isMockUser } = useAuth();

  const isStaff = user?.role === "HQ_STAFF";
  const customers = isMockUser ? MOCK_CUSTOMERS : [];
  const tickets   = isMockUser ? MOCK_TICKETS   : [];
  const plans     = isMockUser ? MOCK_PLANS     : [];

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

  const totalMRR    = customers.reduce((s, c) => s + c.mrr, 0);
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

  // ── Nav items ──
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

  // ── Sidebar ──
  const Sidebar = ({ mobile }: { mobile?: boolean }) => (
    <aside className={`${mobile ? "w-full" : "w-56"} flex flex-col h-full bg-white border-r border-slate-200`}>
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-100">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-teal-700 flex items-center justify-center text-white font-bold text-sm shadow-sm">MK</div>
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
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer ${active ? "bg-teal-50 text-teal-800 font-semibold" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}>
              <Icon className={`w-4 h-4 shrink-0 ${active ? "text-teal-700" : "text-slate-400"}`} />
              <span className="flex-1 text-left">{label}</span>
              {badge > 0 && (
                <span className="bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center shrink-0">{badge}</span>
              )}
              {active && <div className="w-1.5 h-1.5 rounded-full bg-teal-600 shrink-0" />}
            </button>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="px-3 py-4 border-t border-slate-100">
        <div className="flex items-center space-x-3 px-3 py-2.5 rounded-xl bg-slate-50">
          <div className="w-7 h-7 rounded-full bg-teal-700 text-white flex items-center justify-center text-xs font-bold shrink-0">
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
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden" id="hq_root">

      {/* Mobile header */}
      <header className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded-lg bg-teal-700 flex items-center justify-center text-white font-bold text-xs">MK</div>
          <span className="font-bold text-slate-900 text-sm">MYKERANI HQ</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">{navItems.find(n => n.id === activePage)?.label}</span>
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer">
            <Menu className="w-5 h-5 text-slate-600" />
          </button>
        </div>
      </header>

      {/* Mobile sidebar drawer */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-64 h-full z-10">
            <div className="absolute top-3 right-3">
              <button onClick={() => setSidebarOpen(false)} className="p-1.5 bg-white rounded-lg shadow cursor-pointer">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
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
          <div className="max-w-5xl mx-auto p-5 pb-10 space-y-5">

            {/* ════ DASHBOARD ════ */}
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
                      className="flex items-center space-x-1.5 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-sm">
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
                    <button onClick={() => setActivePage("customers")} className="text-xs text-teal-700 font-semibold hover:text-teal-900 cursor-pointer">Lihat semua →</button>
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
                          <div className="w-8 h-8 rounded-xl bg-teal-50 flex items-center justify-center text-teal-700 font-bold text-sm shrink-0">
                            {c.name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">{c.name}</p>
                            <p className="text-[11px] text-slate-400">{c.plan} · Perbaharui {c.renewal}</p>
                          </div>
                          <StatusBadge status={c.status} />
                          <button onClick={() => setActivePage("customers")} className="text-slate-300 hover:text-teal-600 transition cursor-pointer">
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
                      <button onClick={() => setActivePage("support")} className="text-xs text-teal-700 font-semibold hover:text-teal-900 cursor-pointer">Urus →</button>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {tickets.filter(t => t.status !== "resolved").map(t => (
                        <div key={t.id} className="px-5 py-4 space-y-1">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-slate-800">{t.id} — {t.subject}</p>
                            <StatusBadge status={t.priority} />
                          </div>
                          <p className="text-xs text-slate-500">{t.customer}</p>
                          <p className="text-[11px] text-slate-400 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                            🤖 AI: {t.summary}
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
                      { label: "Tambah Pelanggan", icon: Plus,       page: "customers" as HQPage,  color: "bg-teal-700 text-white" },
                      { label: "Urus Sokongan",    icon: Headphones, page: "support" as HQPage,    color: "bg-white border border-slate-200 text-slate-700" },
                      { label: "Semak Penggunaan", icon: Activity,   page: "usage" as HQPage,      color: "bg-white border border-slate-200 text-slate-700" },
                      { label: "Urus Plan",        icon: Package,    page: "billing" as HQPage,    color: "bg-white border border-slate-200 text-slate-700" },
                    ].map(({ label, icon: Icon, page, color }) => (
                      <button key={label} onClick={() => setActivePage(page)}
                        className={`flex items-center space-x-2 px-4 py-3 rounded-xl text-xs font-bold shadow-sm transition cursor-pointer ${color}`}>
                        <Icon className="w-4 h-4 shrink-0" /><span>{label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ════ CUSTOMERS ════ */}
            {activePage === "customers" && (
              <div className="space-y-4" id="hq_customers">
                <div className="flex items-center justify-between">
                  <h1 className="text-xl font-bold text-slate-900">Pelanggan</h1>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Cari pelanggan..."
                        className="pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-xl outline-none focus:border-teal-400 bg-white w-44" />
                    </div>
                    <button className="flex items-center space-x-1.5 px-3 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-sm">
                      <Plus className="w-3.5 h-3.5" /><span>Tambah</span>
                    </button>
                  </div>
                </div>

                {customers.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center shadow-sm">
                    <Building2 className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-slate-500">Tiada pelanggan lagi</p>
                    <p className="text-xs text-slate-400 mt-1">Pelanggan yang mendaftar akan muncul di sini</p>
                    <button className="mt-4 px-5 py-2.5 bg-teal-700 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-teal-800 transition">
                      Tambah Pelanggan Pertama
                    </button>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    {/* Table header */}
                    <div className="grid grid-cols-12 px-5 py-3 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <div className="col-span-4">Pelanggan</div>
                      <div className="col-span-2">Plan</div>
                      <div className="col-span-2">Status</div>
                      <div className="col-span-2 hidden md:block">Perbaharui</div>
                      <div className="col-span-2">Tindakan</div>
                    </div>
                    {customers
                      .filter(c => !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map(c => (
                        <div key={c.id} className="grid grid-cols-12 px-5 py-4 border-b border-slate-50 hover:bg-slate-50 transition items-center">
                          <div className="col-span-4 flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 font-bold text-sm flex items-center justify-center shrink-0">
                              {c.name.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-800 truncate">{c.name}</p>
                              {c.attention && <span className="text-[9px] text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded-full">Perlu Perhatian</span>}
                            </div>
                          </div>
                          <div className="col-span-2">
                            <span className="text-xs font-semibold text-slate-600">{c.plan}</span>
                          </div>
                          <div className="col-span-2">
                            <StatusBadge status={c.status} />
                          </div>
                          <div className="col-span-2 hidden md:block">
                            <span className="text-xs text-slate-500">{c.renewal}</span>
                          </div>
                          <div className="col-span-2 flex items-center gap-1.5">
                            <button className="px-2.5 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 rounded-lg text-[10px] font-bold cursor-pointer transition">Buka</button>
                            {c.status === "suspended" ? (
                              <button className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-bold cursor-pointer transition">Aktif</button>
                            ) : (
                              <button className="px-2.5 py-1.5 bg-slate-50 hover:bg-red-50 text-slate-500 hover:text-red-600 rounded-lg text-[10px] font-bold cursor-pointer transition">Gantung</button>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* ════ BILLING (HQ_OWNER only) ════ */}
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
                    <h3 className="text-sm font-bold text-slate-900">Plan Semasa</h3>
                    <button className="flex items-center space-x-1 px-3 py-2 bg-teal-700 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-teal-800 transition">
                      <Plus className="w-3.5 h-3.5" /><span>Cipta Plan</span>
                    </button>
                  </div>
                  <div className="grid md:grid-cols-3 gap-3">
                    {plans.map(p => (
                      <div key={p.id} className="border border-slate-200 rounded-2xl p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{p.name}</span>
                          <span className="text-xs text-teal-700 font-bold bg-teal-50 px-2 py-0.5 rounded-full">{p.customers} pelanggan</span>
                        </div>
                        <p className="text-2xl font-bold text-slate-900">RM {p.price}<span className="text-xs text-slate-400 font-normal">/bln</span></p>
                        <div className="text-[11px] text-slate-400 space-y-0.5">
                          <p>AI: {p.aiCredits.toLocaleString()} kredit</p>
                          <p>Storan: {p.storage}</p>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button className="flex-1 py-1.5 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 cursor-pointer hover:bg-slate-50 transition">Edit</button>
                          <button className="flex-1 py-1.5 bg-teal-50 border border-teal-100 rounded-lg text-[10px] font-bold text-teal-700 cursor-pointer hover:bg-teal-100 transition">Paket Kredit</button>
                        </div>
                      </div>
                    ))}
                    {plans.length === 0 && (
                      <div className="col-span-3 py-10 text-center">
                        <Package className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                        <p className="text-xs text-slate-400">Tiada plan lagi</p>
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

            {/* ════ USAGE (HQ_OWNER only) ════ */}
            {activePage === "usage" && !isStaff && (
              <div className="space-y-5" id="hq_usage">
                <h1 className="text-xl font-bold text-slate-900">Penggunaan Platform</h1>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <MetricCard label="Jumlah Kredit AI"  value={totalAI.toLocaleString()}      sub="semua pelanggan bulan ini" icon={Zap}      color="amber" />
                  <MetricCard label="Jumlah Storan"     value={`${customers.reduce((s,c)=>s+c.storageGB,0).toFixed(1)} GB`} sub="digunakan" icon={HardDrive} color="slate" />
                  <MetricCard label="OCR Digunakan"     value="—"                              sub="belum diaktifkan"          icon={Brain}    color="violet" />
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
                          <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-700 font-bold text-xs flex items-center justify-center shrink-0">
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

            {/* ════ SUPPORT ════ */}
            {activePage === "support" && (
              <div className="space-y-4" id="hq_support">
                <h1 className="text-xl font-bold text-slate-900">Sokongan Pelanggan</h1>

                {/* Status filter tabs */}
                <div className="flex gap-2">
                  {["Semua", "Terbuka", "Dalam Proses", "Selesai"].map(f => (
                    <button key={f} className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition ${f === "Semua" ? "bg-teal-700 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-teal-300"}`}>
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
                              <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full">{t.id}</span>
                              <StatusBadge status={t.status} />
                              <StatusBadge status={t.priority} />
                            </div>
                            <p className="text-sm font-bold text-slate-900 mt-1.5">{t.subject}</p>
                            <p className="text-xs text-slate-500">{t.customer}</p>
                          </div>
                          <span className="text-[11px] text-slate-400 shrink-0">Ditugaskan: {t.assigned}</span>
                        </div>

                        {/* AI Summary */}
                        <div className="flex items-start space-x-2.5 p-3 bg-teal-50 border border-teal-100 rounded-xl">
                          <Brain className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-[10px] font-bold text-teal-700 mb-1">Ringkasan AI</p>
                            <p className="text-xs text-teal-800 leading-relaxed">{t.summary}</p>
                          </div>
                        </div>

                        {/* Reply form */}
                        {replyTicket === t.id ? (
                          <div className="space-y-2">
                            <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                              placeholder="Taip jawapan anda..."
                              rows={3}
                              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xs outline-none focus:border-teal-400 bg-white resize-none" />
                            <div className="flex gap-2">
                              <button onClick={() => { setReplyTicket(null); setReplyText(""); }}
                                className="flex-1 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold cursor-pointer hover:bg-slate-50 transition">
                                Batal
                              </button>
                              <button className="flex-1 py-2 bg-teal-700 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-teal-800 transition">
                                Hantar Jawapan
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button onClick={() => setReplyTicket(t.id)}
                              className="px-3 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold cursor-pointer transition">
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

            {/* ════ SUBSCRIPTIONS (HQ_STAFF only) ════ */}
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
                            <p className="text-[11px] text-slate-400">{c.plan} · Perbaharui {c.renewal}</p>
                          </div>
                          <StatusBadge status={c.status} />
                          <div className="flex gap-1.5">
                            <button className="px-2.5 py-1.5 bg-teal-50 text-teal-700 rounded-lg text-[10px] font-bold cursor-pointer hover:bg-teal-100 transition">Perbaharui</button>
                            <button className="px-2.5 py-1.5 bg-slate-50 text-slate-600 rounded-lg text-[10px] font-bold cursor-pointer hover:bg-slate-100 transition">Naik Taraf</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ════ REVENUE (HQ_OWNER only) ════ */}
            {activePage === "revenue" && !isStaff && (
              <div className="space-y-5" id="hq_revenue">
                <h1 className="text-xl font-bold text-slate-900">Hasil & Keuntungan</h1>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <MetricCard label="Hasil Bulan Ini"  value={`RM ${totalMRR.toLocaleString()}`} icon={DollarSign} color="emerald" trend="up" />
                  <MetricCard label="Kos AI"           value="RM —"    sub="anggaran"   icon={Zap}        color="amber" />
                  <MetricCard label="Kos Storan"       value="RM —"    sub="anggaran"   icon={HardDrive}  color="slate" />
                  <MetricCard label="Keuntungan Kasar" value="RM —"    sub="anggaran"   icon={TrendingUp} color="teal" trend="up" />
                  <MetricCard label="MRR"              value={`RM ${totalMRR.toLocaleString()}`} sub="Recurring Revenue" icon={RefreshCw} color="violet" />
                  <MetricCard label="Kos OCR"          value="RM —"    sub="anggaran"   icon={Brain}      color="slate" />
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
                          <div className="h-full bg-teal-500 rounded-full" style={{ width: `${totalMRR > 0 ? (rev/totalMRR)*100 : 0}%` }} />
                        </div>
                        <span className="text-xs font-bold text-slate-800 w-20 text-right shrink-0">RM {rev.toLocaleString()}</span>
                      </div>
                    );
                  })}
                  {plans.length === 0 && <p className="text-xs text-slate-400 text-center py-4">Tiada data lagi</p>}
                </div>
              </div>
            )}

            {/* ════ SETTINGS (HQ_OWNER only) ════ */}
            {activePage === "settings" && !isStaff && (
              <div className="space-y-5" id="hq_settings">
                <h1 className="text-xl font-bold text-slate-900">Tetapan</h1>

                {/* HQ Profile */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                    <Shield className="w-4 h-4 text-teal-600" /><span>Profil HQ</span>
                  </h3>
                  <div className="flex items-center space-x-4 p-4 bg-teal-50 rounded-xl border border-teal-100">
                    <div className="w-12 h-12 rounded-2xl bg-teal-700 text-white flex items-center justify-center text-xl font-bold shadow">
                      {user?.fullName?.charAt(0).toUpperCase() || "H"}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{user?.fullName || "HQ Owner"}</p>
                      <p className="text-xs text-slate-500">{user?.email}</p>
                      <span className="text-[10px] bg-teal-100 text-teal-800 font-bold px-2 py-0.5 rounded-full">HQ_OWNER</span>
                    </div>
                  </div>
                </div>

                {/* HQ Staff */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                      <Users className="w-4 h-4 text-teal-600" /><span>Kakitangan HQ</span>
                    </h3>
                    <button onClick={() => { setShowCreateStaff(v => !v); setStaffResult(null); }}
                      className="flex items-center space-x-1.5 px-3 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold cursor-pointer transition">
                      <Plus className="w-3.5 h-3.5" /><span>Tambah Staf</span>
                    </button>
                  </div>

                  {showCreateStaff && (
                    <div className="bg-teal-50 border border-teal-100 rounded-xl p-4 space-y-3">
                      <p className="text-xs font-bold text-teal-800">Cipta Akaun HQ_STAFF</p>
                      <input type="text" value={staffName} onChange={e => setStaffName(e.target.value)} placeholder="Nama penuh"
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-teal-400 bg-white" />
                      <input type="email" value={staffEmail} onChange={e => setStaffEmail(e.target.value)} placeholder="Email kakitangan"
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-teal-400 bg-white" />
                      <button onClick={handleCreateHQStaff} disabled={staffCreating || !staffEmail.trim() || !staffName.trim()}
                        className="w-full py-2.5 bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold cursor-pointer transition">
                        {staffCreating ? "Mencipta..." : "Cipta Akaun"}
                      </button>
                      {staffResult && (
                        <div className={`rounded-xl p-3 text-xs ${staffResult.success ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"}`}>
                          <p className={`font-bold ${staffResult.success ? "text-emerald-700" : "text-red-700"}`}>{staffResult.success ? "✓ Berjaya!" : "✗ Gagal"}</p>
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
                    <Bell className="w-4 h-4 text-teal-600" /><span>Pemberitahuan</span>
                  </h3>
                  {[
                    { label: "Pelanggan baru mendaftar",  on: true },
                    { label: "Perbaharuan akan tamat",     on: true },
                    { label: "Kes sokongan baharu",        on: true },
                    { label: "Penggunaan tinggi dikesan",  on: false },
                  ].map(({ label, on }) => (
                    <div key={label} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                      <span className="text-xs text-slate-700">{label}</span>
                      <div className={`w-9 h-5 rounded-full flex items-center px-0.5 cursor-pointer transition ${on ? "bg-teal-600 justify-end" : "bg-slate-200 justify-start"}`}>
                        <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ════ SYSTEM CENTER (HQ_OWNER only) ════ */}
            {activePage === "system" && !isStaff && (
              <div className="space-y-5" id="hq_system">
                <h1 className="text-xl font-bold text-slate-900">Pusat Sistem</h1>

                {/* System Health */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                    <Activity className="w-4 h-4 text-teal-600" /><span>Kesihatan Sistem</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "AI MYKERANI",     status: "ok", latency: "120ms" },
                      { label: "Storan",          status: "ok", latency: "45ms" },
                      { label: "Pengesahan",      status: "ok", latency: "89ms" },
                      { label: "Pangkalan Data",  status: "ok", latency: "67ms" },
                    ].map(({ label, status, latency }) => (
                      <div key={label} className="flex items-center space-x-3 p-3.5 border border-slate-100 rounded-xl bg-slate-50">
                        <div className={`w-2 h-2 rounded-full ${status === "ok" ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
                        <div>
                          <p className="text-xs font-semibold text-slate-700">{label}</p>
                          <p className="text-[10px] text-slate-400">{latency} · Operasi normal</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Resource Governance */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                      <Shield className="w-4 h-4 text-teal-600" /><span>Kawalan Sumber</span>
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
                        className={`w-11 h-6 rounded-full flex items-center px-0.5 cursor-pointer transition-colors ${val ? "bg-teal-600 justify-end" : "bg-slate-200 justify-start"}`}>
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
    </div>
  );
};
