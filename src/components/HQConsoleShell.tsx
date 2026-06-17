import React, { useState } from "react";
import { type Tenant, type Workspace, type UserSessionProfile } from "../types";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  BarChart3,
  PlayCircle,
  DollarSign,
  Settings,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  Clock,
  Search,
  Filter,
  Plus,
  RefreshCw,
  Download,
  MoreHorizontal,
  ChevronRight,
  Star,
  Zap,
  HardDrive,
  Brain,
  Building2,
  UserCheck,
  UserX,
  Edit3,
  Copy,
  Archive,
  RotateCcw,
  Bell,
  Globe,
  Shield,
  LogOut,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

interface HQConsoleShellProps {
  tenants: Tenant[];
  workspaces: Workspace[];
  user: UserSessionProfile | null;
  activeWorkspace: Workspace | null;
}

type HQPage = "dashboard" | "customers" | "plans" | "usage" | "demos" | "revenue" | "settings";

// ─── Mock data untuk placeholder visual ──────────────────────────────────────
const MOCK_CUSTOMERS = [
  { id: "c1", name: "Kedai Makan Pak Ali Sdn Bhd", plan: "Starter", status: "active", companies: 2, lastActivity: "2 jam lalu", attention: false },
  { id: "c2", name: "Syarikat Binaan Teguh MY", plan: "Pro", status: "active", companies: 5, lastActivity: "1 hari lalu", attention: true },
  { id: "c3", name: "Butik Raudah Enterprise", plan: "Starter", status: "suspended", companies: 1, lastActivity: "5 hari lalu", attention: true },
  { id: "c4", name: "TechVenture Solutions MY", plan: "Enterprise", status: "active", companies: 12, lastActivity: "3 jam lalu", attention: false },
  { id: "c5", name: "Ladang Hijau Organik Sdn Bhd", plan: "Pro", status: "active", companies: 3, lastActivity: "Semalam", attention: false },
];

const MOCK_PLANS = [
  { id: "p1", name: "Starter", price: 99, credits: 500, storage: "5 GB", ai: "100 panggilan", customers: 8, color: "emerald" },
  { id: "p2", name: "Pro", price: 299, credits: 2000, storage: "25 GB", ai: "500 panggilan", customers: 5, color: "indigo" },
  { id: "p3", name: "Enterprise", price: 899, credits: 10000, storage: "100 GB", ai: "Tanpa had", customers: 2, color: "violet" },
];

const MOCK_DEMOS = [
  { id: "d1", name: "Demo Restoran F&B", status: "active", lastActivity: "1 jam lalu" },
  { id: "d2", name: "Demo Perniagaan Runcit", status: "active", lastActivity: "Semalam" },
  { id: "d3", name: "Demo Kontraktor Binaan", status: "idle", lastActivity: "3 hari lalu" },
  { id: "d4", name: "Demo Perkhidmatan Profesional", status: "active", lastActivity: "4 jam lalu" },
];

const MOCK_ACTIVITY = [
  { id: "a1", type: "new_customer", text: "Pelanggan baru: TechVenture Solutions MY", time: "3 jam lalu", color: "emerald" },
  { id: "a2", type: "attention", text: "Syarikat Binaan Teguh MY — kredit hampir habis", time: "5 jam lalu", color: "amber" },
  { id: "a3", type: "payment", text: "Bayaran diterima: Pro Plan — RM 299", time: "Semalam", color: "indigo" },
  { id: "a4", type: "suspended", text: "Akaun digantung: Butik Raudah Enterprise", time: "5 hari lalu", color: "rose" },
  { id: "a5", type: "payment", text: "Bayaran diterima: Enterprise Plan — RM 899", time: "6 hari lalu", color: "indigo" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const PlanBadge = ({ plan }: { plan: string }) => {
  const colors: Record<string, string> = {
    Starter: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Pro: "bg-indigo-50 text-indigo-700 border-indigo-200",
    Enterprise: "bg-violet-50 text-violet-700 border-violet-200",
    Demo: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${colors[plan] || "bg-slate-50 text-slate-600 border-slate-200"}`}>
      {plan}
    </span>
  );
};

const StatusBadge = ({ status }: { status: string }) => {
  if (status === "active") return (
    <span className="flex items-center space-x-1 text-[10px] font-bold text-emerald-600">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
      <span>Aktif</span>
    </span>
  );
  if (status === "suspended") return (
    <span className="flex items-center space-x-1 text-[10px] font-bold text-rose-500">
      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block" />
      <span>Digantung</span>
    </span>
  );
  return (
    <span className="flex items-center space-x-1 text-[10px] font-bold text-amber-500">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
      <span>Tidak aktif</span>
    </span>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export const HQConsoleShell: React.FC<HQConsoleShellProps> = ({ user }) => {
  const { signOut } = useAuth();
  const [activePage, setActivePage] = useState<HQPage>("dashboard");
  const [searchQuery, setSearchQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<typeof MOCK_CUSTOMERS[0] | null>(null);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 1200);
  };

  const attentionCount = MOCK_CUSTOMERS.filter(c => c.attention).length;
  const activeCustomers = MOCK_CUSTOMERS.filter(c => c.status === "active").length;
  const monthlyRevenue = MOCK_CUSTOMERS.reduce((sum, c) => {
    const plan = MOCK_PLANS.find(p => p.name === c.plan);
    return sum + (c.status === "active" ? (plan?.price || 0) : 0);
  }, 0);

  const navItems: { id: HQPage; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "customers", label: "Pelanggan", icon: Users, badge: attentionCount > 0 ? attentionCount : undefined },
    { id: "plans", label: "Plan", icon: CreditCard },
    { id: "usage", label: "Penggunaan", icon: BarChart3 },
    { id: "demos", label: "Demo", icon: PlayCircle },
    { id: "revenue", label: "Hasil", icon: DollarSign },
    { id: "settings", label: "Tetapan", icon: Settings },
  ];

  return (
    <div className="flex flex-col md:flex-row min-h-screen md:min-h-[80vh] md:rounded-2xl md:overflow-hidden md:border md:border-slate-200 md:shadow-sm bg-white" id="hq_console_root">

      {/* ── MOBILE TOP BAR ── */}
      <header className="md:hidden bg-slate-950 px-4 py-3 flex items-center justify-between sticky top-0 z-20" id="hq_mobile_header">
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-rose-500 to-rose-700 flex items-center justify-center">
            <Shield className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-none">MYKERANI</p>
            <p className="text-rose-400 text-[9px] font-semibold">HQ Control</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-rose-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold">
            {user?.fullName?.charAt(0).toUpperCase() || "H"}
          </div>
          <button onClick={() => signOut()} className="p-1.5 text-slate-400 hover:text-rose-400 transition cursor-pointer">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ── DESKTOP SIDEBAR ── */}
      <aside className="hidden md:flex w-56 bg-slate-950 flex-col shrink-0" id="hq_sidebar">
        {/* Brand */}
        <div className="px-5 py-5 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500 to-rose-700 flex items-center justify-center shadow-md">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm tracking-tight leading-none">MYKERANI</p>
              <p className="text-rose-400 text-[9px] font-semibold tracking-widest uppercase mt-0.5">HQ Control</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5" id="hq_nav_desktop">
          {navItems.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              onClick={() => setActivePage(id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition cursor-pointer group ${
                activePage === id
                  ? "bg-white/10 text-white"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <div className="flex items-center space-x-3">
                <Icon className={`w-4 h-4 ${activePage === id ? "text-rose-400" : "text-slate-500 group-hover:text-slate-300"}`} />
                <span className="text-xs font-semibold">{label}</span>
              </div>
              {badge !== undefined && (
                <span className="w-5 h-5 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* User */}
        <div className="px-3 py-4 border-t border-slate-800">
          <div className="flex items-center space-x-2.5 px-2 py-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-rose-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {user?.fullName?.charAt(0).toUpperCase() || "H"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white text-[11px] font-semibold truncate">{user?.fullName || "HQ Admin"}</p>
              <p className="text-slate-500 text-[9px]">Pentadbir Sistem</p>
            </div>
            <button onClick={() => signOut()} className="text-slate-500 hover:text-rose-400 transition cursor-pointer" title="Log Keluar">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 bg-slate-50 overflow-auto pb-20 md:pb-0" id="hq_main">

        {/* ════ DASHBOARD ════ */}
        {activePage === "dashboard" && (
          <div className="p-6 space-y-6" id="hq_dashboard">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
                <p className="text-xs text-slate-500 mt-0.5">Selamat datang, {user?.fullName?.split(" ")[0] || "HQ"}. Ini ringkasan platform anda hari ini.</p>
              </div>
              <button
                onClick={handleRefresh}
                className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer shadow-sm"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </button>
            </div>

            {/* ── STAT CARDS ── */}
            <div className="grid grid-cols-2 gap-4" id="hq_stat_cards">
              {/* Monthly Revenue */}
              <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-2xl p-4 text-white shadow-lg shadow-indigo-200">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-indigo-200 text-[9px] font-bold uppercase tracking-wider leading-tight">Hasil Bulanan</p>
                  <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                    <DollarSign className="w-3.5 h-3.5 text-indigo-200" />
                  </div>
                </div>
                <p className="text-xl font-bold leading-tight">RM {monthlyRevenue.toLocaleString()}</p>
                <div className="flex items-center space-x-1 mt-1">
                  <ArrowUpRight className="w-3 h-3 text-emerald-300 shrink-0" />
                  <span className="text-[9px] text-indigo-200">+12% bulan ini</span>
                </div>
              </div>

              {/* Active Customers */}
              <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-2xl p-4 text-white shadow-lg shadow-emerald-200">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-emerald-100 text-[9px] font-bold uppercase tracking-wider leading-tight">Pelanggan Aktif</p>
                  <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                    <Users className="w-3.5 h-3.5 text-emerald-100" />
                  </div>
                </div>
                <p className="text-xl font-bold">{activeCustomers}</p>
                <span className="text-[9px] text-emerald-100">drpd {MOCK_CUSTOMERS.length} jumlah</span>
              </div>

              {/* Active Subscriptions */}
              <div className="bg-gradient-to-br from-violet-500 to-violet-700 rounded-2xl p-4 text-white shadow-lg shadow-violet-200">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-violet-100 text-[9px] font-bold uppercase tracking-wider leading-tight">Langganan Aktif</p>
                  <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                    <CreditCard className="w-3.5 h-3.5 text-violet-100" />
                  </div>
                </div>
                <p className="text-xl font-bold">{activeCustomers}</p>
                <span className="text-[9px] text-violet-100">Starter · Pro · Enterprise</span>
              </div>

              {/* Attention */}
              <div className={`rounded-2xl p-4 text-white shadow-lg ${attentionCount > 0 ? "bg-gradient-to-br from-rose-500 to-rose-700 shadow-rose-200" : "bg-gradient-to-br from-slate-600 to-slate-800 shadow-slate-200"}`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-rose-100 text-[9px] font-bold uppercase tracking-wider leading-tight">Perlu Perhatian</p>
                  <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-100" />
                  </div>
                </div>
                <p className="text-xl font-bold">{attentionCount}</p>
                <span className="text-[9px] text-rose-100">{attentionCount > 0 ? "perlu tindakan" : "semua baik"}</span>
              </div>
            </div>

            {/* ── SECOND ROW CARDS ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* AI Usage */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center">
                      <Brain className="w-4 h-4 text-amber-500" />
                    </div>
                    <p className="text-xs font-bold text-slate-700">Penggunaan AI</p>
                  </div>
                  <span className="text-[10px] text-slate-400">Bulan ini</span>
                </div>
                <p className="text-2xl font-bold text-slate-900">2,847</p>
                <p className="text-xs text-slate-400 mb-3">panggilan daripada 10,000</p>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-gradient-to-r from-amber-400 to-amber-500 h-2 rounded-full" style={{ width: "28.5%" }} />
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5 text-right">28.5% digunakan</p>
              </div>

              {/* Storage */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
                      <HardDrive className="w-4 h-4 text-blue-500" />
                    </div>
                    <p className="text-xs font-bold text-slate-700">Storan</p>
                  </div>
                  <span className="text-[10px] text-slate-400">Semua pelanggan</span>
                </div>
                <p className="text-2xl font-bold text-slate-900">18.4 GB</p>
                <p className="text-xs text-slate-400 mb-3">daripada 135 GB diperuntukkan</p>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-400 to-blue-500 h-2 rounded-full" style={{ width: "13.6%" }} />
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5 text-right">13.6% digunakan</p>
              </div>

              {/* Demo Accounts */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center">
                      <PlayCircle className="w-4 h-4 text-violet-500" />
                    </div>
                    <p className="text-xs font-bold text-slate-700">Akaun Demo</p>
                  </div>
                  <button onClick={() => setActivePage("demos")} className="text-[10px] text-indigo-500 font-semibold hover:text-indigo-700 cursor-pointer">Lihat semua</button>
                </div>
                <p className="text-2xl font-bold text-slate-900">{MOCK_DEMOS.length}</p>
                <p className="text-xs text-slate-400 mb-3">{MOCK_DEMOS.filter(d => d.status === "active").length} aktif sekarang</p>
                <div className="space-y-1.5">
                  {MOCK_DEMOS.slice(0, 2).map(d => (
                    <div key={d.id} className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-600 truncate max-w-[160px]">{d.name}</span>
                      <StatusBadge status={d.status} />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── BOTTOM ROW ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Customers Requiring Attention */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 text-rose-500" />
                    <span>Perlu Perhatian</span>
                  </h3>
                  <button onClick={() => setActivePage("customers")} className="text-[10px] text-indigo-500 font-semibold hover:text-indigo-700 cursor-pointer">Lihat semua →</button>
                </div>
                {MOCK_CUSTOMERS.filter(c => c.attention).length === 0 ? (
                  <div className="py-6 text-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                    <p className="text-xs text-slate-500">Semua pelanggan baik</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {MOCK_CUSTOMERS.filter(c => c.attention).map(c => (
                      <div key={c.id} className="flex items-center justify-between p-3 bg-rose-50 border border-rose-100 rounded-xl">
                        <div>
                          <p className="text-xs font-semibold text-slate-800">{c.name}</p>
                          <p className="text-[10px] text-rose-500">Kredit hampir habis · {c.lastActivity}</p>
                        </div>
                        <button
                          onClick={() => { setSelectedCustomer(c); setActivePage("customers"); }}
                          className="px-3 py-1 bg-rose-500 text-white rounded-lg text-[10px] font-bold hover:bg-rose-600 transition cursor-pointer"
                        >
                          Tindakan
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Activity */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span>Aktiviti Terkini</span>
                  </h3>
                </div>
                <div className="space-y-3">
                  {MOCK_ACTIVITY.map(a => (
                    <div key={a.id} className="flex items-start space-x-3">
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                        a.color === "emerald" ? "bg-emerald-400" :
                        a.color === "amber" ? "bg-amber-400" :
                        a.color === "rose" ? "bg-rose-400" : "bg-indigo-400"
                      }`} />
                      <div>
                        <p className="text-xs text-slate-700">{a.text}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{a.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── QUICK ACTIONS ── */}
            <div className="bg-gradient-to-r from-slate-900 to-indigo-950 rounded-2xl p-5">
              <p className="text-white font-bold text-sm mb-4">Tindakan Pantas</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "Lihat Pelanggan", page: "customers" as HQPage, icon: Users, color: "bg-white/10 hover:bg-white/15" },
                  { label: "Urus Plan", page: "plans" as HQPage, icon: CreditCard, color: "bg-indigo-600/40 hover:bg-indigo-600/60" },
                  { label: "Semak Penggunaan", page: "usage" as HQPage, icon: BarChart3, color: "bg-white/10 hover:bg-white/15" },
                  { label: "Buka Demo", page: "demos" as HQPage, icon: PlayCircle, color: "bg-white/10 hover:bg-white/15" },
                  { label: "Lihat Hasil", page: "revenue" as HQPage, icon: DollarSign, color: "bg-white/10 hover:bg-white/15" },
                ].map(({ label, page, icon: Icon, color }) => (
                  <button
                    key={page}
                    onClick={() => setActivePage(page)}
                    className={`flex items-center space-x-2 px-4 py-2.5 ${color} text-white rounded-xl text-xs font-semibold transition cursor-pointer`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ════ CUSTOMERS ════ */}
        {activePage === "customers" && (
          <div className="p-6 space-y-5" id="hq_customers">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Pelanggan</h1>
                <p className="text-xs text-slate-500 mt-0.5">{MOCK_CUSTOMERS.length} pelanggan berdaftar</p>
              </div>
              <div className="flex items-center gap-2">
                <button className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer shadow-sm">
                  <Download className="w-3.5 h-3.5" />
                  <span>Eksport</span>
                </button>
                <button className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-xs font-semibold text-white transition cursor-pointer shadow-sm">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Pelanggan</span>
                </button>
              </div>
            </div>

            {/* Search + Filter */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari pelanggan..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-indigo-400 shadow-sm"
                />
              </div>
              <button className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer shadow-sm">
                <Filter className="w-3.5 h-3.5" />
                <span>Filter</span>
              </button>
            </div>

            {/* Customers List — mobile card, desktop table */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              {/* Desktop header */}
              <div className="hidden md:grid grid-cols-12 px-5 py-3 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <div className="col-span-5">Nama Pelanggan</div>
                <div className="col-span-2">Plan</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-2">Aktiviti</div>
                <div className="col-span-1" />
              </div>
              <div className="divide-y divide-slate-100">
                {MOCK_CUSTOMERS
                  .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map(c => (
                  <div key={c.id} className={`p-4 hover:bg-slate-50/80 transition ${c.attention ? "border-l-4 border-rose-400" : ""}`}>
                    {/* Mobile layout */}
                    <div className="flex items-start justify-between md:hidden">
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center shrink-0">
                          <span className="text-indigo-700 font-bold text-sm">{c.name.charAt(0)}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 truncate">{c.name}</p>
                          <div className="flex items-center space-x-2 mt-1">
                            <PlanBadge plan={c.plan} />
                            <StatusBadge status={c.status} />
                          </div>
                          {c.attention && <p className="text-[10px] text-rose-500 mt-0.5 flex items-center space-x-1"><AlertCircle className="w-3 h-3 shrink-0" /><span>Perlu perhatian</span></p>}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className="text-[10px] text-slate-400">{c.lastActivity}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{c.companies} syarikat</p>
                      </div>
                    </div>
                    {/* Desktop layout */}
                    <div className="hidden md:grid grid-cols-12 items-center">
                      <div className="col-span-5 flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center shrink-0">
                          <span className="text-indigo-700 font-bold text-xs">{c.name.charAt(0)}</span>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-900">{c.name}</p>
                          {c.attention && <p className="text-[10px] text-rose-500 flex items-center space-x-1"><AlertCircle className="w-3 h-3" /><span>Perlu perhatian</span></p>}
                        </div>
                      </div>
                      <div className="col-span-2"><PlanBadge plan={c.plan} /></div>
                      <div className="col-span-2"><StatusBadge status={c.status} /></div>
                      <div className="col-span-2 text-[11px] text-slate-400">{c.lastActivity}</div>
                      <div className="col-span-1 flex justify-end">
                        <button className="p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer text-slate-400 hover:text-indigo-600">
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ════ PLANS ════ */}
        {activePage === "plans" && (
          <div className="p-6 space-y-5" id="hq_plans">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Plan Langganan</h1>
                <p className="text-xs text-slate-500 mt-0.5">{MOCK_PLANS.length} plan aktif</p>
              </div>
              <button className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-xs font-semibold text-white transition cursor-pointer shadow-sm">
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Plan</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {MOCK_PLANS.map(plan => {
                const gradients: Record<string, string> = {
                  emerald: "from-emerald-500 to-emerald-700",
                  indigo: "from-indigo-500 to-indigo-700",
                  violet: "from-violet-500 to-violet-700",
                };
                const borders: Record<string, string> = {
                  emerald: "border-emerald-200",
                  indigo: "border-indigo-200",
                  violet: "border-violet-200",
                };
                return (
                  <div key={plan.id} className={`bg-white border ${borders[plan.color]} rounded-2xl overflow-hidden shadow-sm`}>
                    <div className={`bg-gradient-to-br ${gradients[plan.color]} p-5 text-white`}>
                      <p className="text-xs font-bold opacity-80 uppercase tracking-wider mb-1">{plan.name}</p>
                      <p className="text-3xl font-bold">RM {plan.price}</p>
                      <p className="text-xs opacity-70">/ bulan</p>
                    </div>
                    <div className="p-5 space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">Kredit AI</span>
                        <span className="font-semibold text-slate-800">{plan.ai}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">Storan</span>
                        <span className="font-semibold text-slate-800">{plan.storage}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">Pelanggan Aktif</span>
                        <span className="font-bold text-slate-900">{plan.customers} pelanggan</span>
                      </div>
                      <div className="border-t border-slate-100 pt-3 flex gap-2">
                        <button className="flex-1 py-2 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer flex items-center justify-center space-x-1">
                          <Edit3 className="w-3 h-3" /><span>Edit</span>
                        </button>
                        <button className="flex-1 py-2 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer flex items-center justify-center space-x-1">
                          <Copy className="w-3 h-3" /><span>Duplikat</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ════ USAGE ════ */}
        {activePage === "usage" && (
          <div className="p-6 space-y-5" id="hq_usage">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Penggunaan Platform</h1>
                <p className="text-xs text-slate-500 mt-0.5">Pantau penggunaan sumber semua pelanggan</p>
              </div>
              <div className="flex gap-2">
                <button className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer shadow-sm">
                  <Filter className="w-3.5 h-3.5" />
                  <span>Filter</span>
                </button>
                <button className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer shadow-sm">
                  <Download className="w-3.5 h-3.5" />
                  <span>Eksport</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: "Penggunaan AI", value: "2,847", max: "10,000", pct: 28.5, icon: Brain, color: "amber", unit: "panggilan" },
                { label: "Penggunaan OCR", value: "412", max: "2,000", pct: 20.6, icon: Sparkles, color: "violet", unit: "dokumen" },
                { label: "Storan Digunakan", value: "18.4 GB", max: "135 GB", pct: 13.6, icon: HardDrive, color: "blue", unit: "" },
              ].map(({ label, value, max, pct, icon: Icon, color, unit }) => (
                <div key={label} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className={`w-9 h-9 rounded-xl bg-${color}-50 flex items-center justify-center`}>
                      <Icon className={`w-4.5 h-4.5 text-${color}-500`} />
                    </div>
                    <p className="text-xs font-bold text-slate-700">{label}</p>
                  </div>
                  <p className="text-2xl font-bold text-slate-900">{value}</p>
                  <p className="text-[10px] text-slate-400 mb-3">daripada {max} {unit}</p>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div className={`bg-${color}-400 h-2.5 rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5 text-right">{pct}% digunakan</p>
                </div>
              ))}
            </div>

            {/* High Usage Table */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">Pelanggan Penggunaan Tinggi</h3>
                <button className="text-xs text-indigo-500 font-semibold hover:text-indigo-700 cursor-pointer">Lihat semua</button>
              </div>
              <div className="grid grid-cols-12 px-5 py-3 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <div className="col-span-4">Pelanggan</div>
                <div className="col-span-2">Plan</div>
                <div className="col-span-3">Penggunaan AI</div>
                <div className="col-span-3">Storan</div>
              </div>
              {[
                { name: "TechVenture Solutions MY", plan: "Enterprise", ai: 92, storage: 78 },
                { name: "Syarikat Binaan Teguh MY", plan: "Pro", ai: 78, storage: 45 },
                { name: "Kedai Makan Pak Ali Sdn Bhd", plan: "Starter", ai: 65, storage: 30 },
              ].map((c, i) => (
                <div key={i} className="grid grid-cols-12 px-5 py-3.5 items-center border-b border-slate-50 hover:bg-slate-50 transition">
                  <div className="col-span-4 text-xs font-semibold text-slate-800">{c.name}</div>
                  <div className="col-span-2"><PlanBadge plan={c.plan} /></div>
                  <div className="col-span-3">
                    <div className="flex items-center space-x-2">
                      <div className="flex-1 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div className={`h-1.5 rounded-full ${c.ai > 80 ? "bg-rose-400" : "bg-amber-400"}`} style={{ width: `${c.ai}%` }} />
                      </div>
                      <span className="text-[10px] text-slate-500 w-8">{c.ai}%</span>
                    </div>
                  </div>
                  <div className="col-span-3">
                    <div className="flex items-center space-x-2">
                      <div className="flex-1 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-blue-400 h-1.5 rounded-full" style={{ width: `${c.storage}%` }} />
                      </div>
                      <span className="text-[10px] text-slate-500 w-8">{c.storage}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════ DEMOS ════ */}
        {activePage === "demos" && (
          <div className="p-6 space-y-5" id="hq_demos">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Akaun Demo</h1>
                <p className="text-xs text-slate-500 mt-0.5">{MOCK_DEMOS.length} akaun demo · {MOCK_DEMOS.filter(d => d.status === "active").length} aktif</p>
              </div>
              <button className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-xs font-semibold text-white transition cursor-pointer shadow-sm">
                <Plus className="w-3.5 h-3.5" />
                <span>Cipta Demo</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {MOCK_DEMOS.map(demo => (
                <div key={demo.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center">
                        <PlayCircle className="w-5 h-5 text-violet-500" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{demo.name}</p>
                        <p className="text-[10px] text-slate-400">Aktiviti terakhir: {demo.lastActivity}</p>
                      </div>
                    </div>
                    <StatusBadge status={demo.status} />
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button className="flex-1 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-[10px] font-bold transition cursor-pointer flex items-center justify-center space-x-1">
                      <PlayCircle className="w-3 h-3" /><span>Buka</span>
                    </button>
                    <button className="flex-1 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-[10px] font-bold transition cursor-pointer flex items-center justify-center space-x-1">
                      <RotateCcw className="w-3 h-3" /><span>Reset</span>
                    </button>
                    <button className="flex-1 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-[10px] font-bold transition cursor-pointer flex items-center justify-center space-x-1">
                      <Edit3 className="w-3 h-3" /><span>Nama</span>
                    </button>
                    <button className="py-2 px-3 bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-400 rounded-xl text-[10px] font-bold transition cursor-pointer">
                      <Archive className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════ REVENUE ════ */}
        {activePage === "revenue" && (
          <div className="p-6 space-y-5" id="hq_revenue">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Hasil Perniagaan</h1>
                <p className="text-xs text-slate-500 mt-0.5">Prestasi kewangan platform MYKERANI</p>
              </div>
              <button className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer shadow-sm">
                <Download className="w-3.5 h-3.5" />
                <span>Eksport Laporan</span>
              </button>
            </div>

            {/* Revenue KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: "Hasil Bulanan (MRR)", value: `RM ${monthlyRevenue.toLocaleString()}`, trend: "+12%", up: true, color: "indigo" },
                { label: "Jangkaan Tahunan (ARR)", value: `RM ${(monthlyRevenue * 12).toLocaleString()}`, trend: "+12%", up: true, color: "violet" },
                { label: "Purata Per Pelanggan", value: `RM ${activeCustomers > 0 ? Math.round(monthlyRevenue / activeCustomers).toLocaleString() : 0}`, trend: "+5%", up: true, color: "emerald" },
              ].map(({ label, value, trend, up, color }) => (
                <div key={label} className={`bg-gradient-to-br from-${color}-50 to-${color}-100 border border-${color}-200 rounded-2xl p-5`}>
                  <p className={`text-[10px] font-bold text-${color}-600 uppercase tracking-wider mb-2`}>{label}</p>
                  <p className="text-2xl font-bold text-slate-900">{value}</p>
                  <div className="flex items-center space-x-1 mt-1">
                    {up ? <ArrowUpRight className="w-3 h-3 text-emerald-500" /> : <ArrowDownRight className="w-3 h-3 text-rose-500" />}
                    <span className={`text-[10px] font-semibold ${up ? "text-emerald-600" : "text-rose-500"}`}>{trend} bulan lalu</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Revenue by Plan */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Hasil Mengikut Plan</h3>
              <div className="space-y-3">
                {MOCK_PLANS.map(plan => {
                  const planRevenue = MOCK_CUSTOMERS
                    .filter(c => c.plan === plan.name && c.status === "active")
                    .length * plan.price;
                  const pct = monthlyRevenue > 0 ? (planRevenue / monthlyRevenue) * 100 : 0;
                  const colors: Record<string, string> = { emerald: "bg-emerald-400", indigo: "bg-indigo-500", violet: "bg-violet-500" };
                  return (
                    <div key={plan.id} className="flex items-center space-x-4">
                      <div className="w-20 shrink-0">
                        <PlanBadge plan={plan.name} />
                      </div>
                      <div className="flex-1">
                        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                          <div className={`${colors[plan.color]} h-2.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <div className="w-24 text-right">
                        <span className="text-xs font-bold text-slate-800">RM {planRevenue.toLocaleString()}</span>
                        <span className="text-[10px] text-slate-400 ml-1">({pct.toFixed(0)}%)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Revenue by Customer */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900">Hasil Mengikut Pelanggan</h3>
              </div>
              <div className="divide-y divide-slate-50">
                {MOCK_CUSTOMERS.filter(c => c.status === "active").map(c => {
                  const plan = MOCK_PLANS.find(p => p.name === c.plan);
                  return (
                    <div key={c.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition">
                      <div className="flex items-center space-x-3">
                        <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center">
                          <span className="text-indigo-700 font-bold text-xs">{c.name.charAt(0)}</span>
                        </div>
                        <p className="text-xs font-semibold text-slate-800">{c.name}</p>
                      </div>
                      <div className="flex items-center space-x-3">
                        <PlanBadge plan={c.plan} />
                        <span className="text-xs font-bold text-slate-900">RM {(plan?.price || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ════ SETTINGS ════ */}
        {activePage === "settings" && (
          <div className="p-6 space-y-5" id="hq_settings">
            <div>
              <h1 className="text-xl font-bold text-slate-900">Tetapan</h1>
              <p className="text-xs text-slate-500 mt-0.5">Urus profil HQ dan konfigurasi platform</p>
            </div>

            {/* HQ Profile */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                <Shield className="w-4 h-4 text-rose-500" />
                <span>Profil HQ</span>
              </h3>
              <div className="flex items-center space-x-4 p-4 bg-slate-50 rounded-xl">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-500 to-violet-600 flex items-center justify-center text-white text-xl font-bold shadow">
                  {user?.fullName?.charAt(0).toUpperCase() || "H"}
                </div>
                <div>
                  <p className="font-bold text-slate-900">{user?.fullName || "HQ Admin"}</p>
                  <p className="text-xs text-slate-500">{user?.email}</p>
                  <span className="text-[10px] bg-rose-100 text-rose-700 font-bold px-2 py-0.5 rounded-full">Pentadbir Sistem HQ</span>
                </div>
                <button className="ml-auto px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer">
                  Edit Profil
                </button>
              </div>
            </div>

            {/* Operators */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                  <Users className="w-4 h-4 text-indigo-500" />
                  <span>Operator HQ</span>
                </h3>
                <button className="flex items-center space-x-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition cursor-pointer">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Operator</span>
                </button>
              </div>
              <div className="p-6 text-center bg-slate-50 rounded-xl">
                <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-500">Hanya anda sebagai operator buat masa ini</p>
              </div>
            </div>

            {/* Platform Settings */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                <Globe className="w-4 h-4 text-slate-400" />
                <span>Tetapan Platform</span>
              </h3>
              <div className="space-y-3">
                {[
                  { label: "Nama Platform", value: "MYKERANI" },
                  { label: "Mata Wang Lalai", value: "MYR (Ringgit Malaysia)" },
                  { label: "Zon Masa", value: "Asia/Kuala_Lumpur (UTC+8)" },
                  { label: "Bahasa Lalai", value: "Bahasa Melayu" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between py-3 border-b border-slate-50">
                    <span className="text-xs text-slate-500">{label}</span>
                    <span className="text-xs font-semibold text-slate-800">{value}</span>
                  </div>
                ))}
              </div>
              <button className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition cursor-pointer">
                Simpan Tetapan
              </button>
            </div>
          </div>
        )}

      </main>

      {/* ── MOBILE BOTTOM NAV ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-950 border-t border-slate-800 z-20 px-1 py-2 flex items-center justify-around" id="hq_bottom_nav">
        {navItems.map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            onClick={() => setActivePage(id)}
            className={`flex flex-col items-center px-2 py-1 rounded-xl transition cursor-pointer relative ${
              activePage === id ? "text-rose-400" : "text-slate-500"
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[9px] font-semibold mt-0.5">{label}</span>
            {badge !== undefined && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-rose-500 text-white text-[8px] font-bold flex items-center justify-center">
                {badge}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
};
