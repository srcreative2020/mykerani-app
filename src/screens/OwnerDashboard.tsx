import React, { useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { useFinancials } from "../context/FinancialRecordsContext";
import {
  LayoutDashboard, ArrowDownCircle, ArrowUpCircle, FileText, Receipt,
  BarChart3, Bot, Users, History, Settings, LogOut, Plus, Upload,
  AlertCircle, TrendingUp, TrendingDown, Wallet, Clock, ChevronRight,
  CheckCircle2, Bell, Search, Filter, Download, Edit3, Trash2, X,
  Building2, UserPlus, Star, Send, MessageSquare, RefreshCw, DollarSign,
  Calendar, Tag, CreditCard, Repeat, Archive, MoreHorizontal, ArrowRight,
  Banknote, PiggyBank, AlertTriangle,
} from "lucide-react";
import { AIFinancialAssistant } from "../components/AIFinancialAssistant";
import { FinancialEvidencePackageManager } from "../components/FinancialEvidencePackage";
import { FinancialReportsAnalytics } from "../components/FinancialReportsAnalytics";

type OwnerTab =
  | "dashboard" | "transactions" | "documents" | "bills"
  | "reports" | "assistant" | "team" | "history" | "settings";

const TABS: { id: OwnerTab; label: string; shortLabel: string; icon: React.ElementType }[] = [
  { id: "dashboard",    label: "Dashboard",    shortLabel: "Home",   icon: LayoutDashboard },
  { id: "transactions", label: "Transaksi",    shortLabel: "Transaksi", icon: ArrowDownCircle },
  { id: "documents",    label: "Dokumen",      shortLabel: "Dokumen",icon: FileText },
  { id: "bills",        label: "Bil",          shortLabel: "Bil",    icon: Receipt },
  { id: "reports",      label: "Laporan",      shortLabel: "Laporan",icon: BarChart3 },
  { id: "assistant",    label: "Kerani AI",    shortLabel: "AI",     icon: Bot },
  { id: "team",         label: "Pasukan",      shortLabel: "Pasukan",icon: Users },
  { id: "history",      label: "Sejarah",      shortLabel: "Sejarah",icon: History },
  { id: "settings",     label: "Tetapan",      shortLabel: "Tetapan",icon: Settings },
];

// ── Add Transaction Modal ──────────────────────────────────────────────────────
function AddTransactionModal({
  type, onClose, onSave,
}: {
  type: "INCOME" | "EXPENSE" | "RECEIVABLE" | "PAYABLE" | "DEBT";
  onClose: () => void;
  onSave: (data: { type: string; amount: number; description: string; party: string; date: string }) => void;
}) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [party, setParty] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  const typeLabels = {
    INCOME: { label: "Tambah Pendapatan", color: "emerald", placeholder: "Nama pelanggan / sumber" },
    EXPENSE: { label: "Tambah Perbelanjaan", color: "rose", placeholder: "Nama pembekal / penerima" },
    RECEIVABLE: { label: "Wang Perlu Dikutip", color: "amber", placeholder: "Nama penghutang" },
    PAYABLE: { label: "Wang Perlu Dibayar", color: "orange", placeholder: "Nama pemiutang" },
    DEBT: { label: "Hutang / Pinjaman", color: "violet", placeholder: "Nama pemberi pinjaman" },
  };
  const cfg = typeLabels[type];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className={`bg-${cfg.color}-500 p-5 rounded-t-2xl flex items-center justify-between`}>
          <h3 className="text-white font-bold text-base">{cfg.label}</h3>
          <button onClick={onClose} className="text-white/70 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase">Jumlah (RM)</label>
            <input
              type="number" step="0.01" min="0" value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00" autoFocus
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-lg font-bold focus:outline-none focus:border-indigo-400 text-slate-900"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase">Penerangan</label>
            <input
              type="text" value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Cth: Jualan produk, Bayar sewa..."
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 text-slate-800"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase">{cfg.placeholder}</label>
            <input
              type="text" value={party} onChange={e => setParty(e.target.value)}
              placeholder={cfg.placeholder}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 text-slate-800"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase">Tarikh</label>
            <input
              type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 text-slate-700"
            />
          </div>
          <button
            onClick={() => {
              if (!amount || parseFloat(amount) <= 0) return;
              onSave({ type, amount: parseFloat(amount), description: description || type, party: party || "Tidak dinyatakan", date });
              onClose();
            }}
            className={`w-full py-3 bg-${cfg.color}-500 hover:bg-${cfg.color}-600 text-white rounded-xl text-sm font-bold transition cursor-pointer shadow-md`}
          >
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function OwnerDashboard() {
  const { user, signOut } = useAuth();
  const { activeWorkspace, workspaces, selectWorkspace } = useWorkspace();
  const { financialEvents, addFinancialEvent } = useFinancials();

  const [activeTab, setActiveTab] = useState<OwnerTab>("dashboard");
  const [addModal, setAddModal] = useState<"INCOME" | "EXPENSE" | "RECEIVABLE" | "PAYABLE" | "DEBT" | null>(null);
  const [txSearch, setTxSearch] = useState("");
  const [showCompanySwitcher, setShowCompanySwitcher] = useState(false);

  // ── Financial summary ───────────────────────────────────────────────────
  const wsId = activeWorkspace?.id;
  const myEvents = useMemo(() =>
    financialEvents.filter(e => e.workspaceId === wsId),
    [financialEvents, wsId]
  );

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const incomeThisMonth = useMemo(() =>
    myEvents.filter(e => e.type === "INCOME" && e.date.startsWith(thisMonth))
      .reduce((s, e) => s + e.amountMyr, 0), [myEvents, thisMonth]);

  const expenseThisMonth = useMemo(() =>
    myEvents.filter(e => e.type === "EXPENSE" && e.date.startsWith(thisMonth))
      .reduce((s, e) => s + e.amountMyr, 0), [myEvents, thisMonth]);

  const toCollect = useMemo(() =>
    myEvents.filter(e => e.type === "RECEIVABLE" && !e.isCompleted)
      .reduce((s, e) => s + e.amountMyr, 0), [myEvents]);

  const toPay = useMemo(() =>
    myEvents.filter(e => e.type === "PAYABLE" && !e.isCompleted)
      .reduce((s, e) => s + e.amountMyr, 0), [myEvents]);

  const netBalance = incomeThisMonth - expenseThisMonth;
  const recentTx = [...myEvents].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  // ── Save transaction ──────────────────────────────────────────────────────
  const handleSaveTx = (data: { type: string; amount: number; description: string; party: string; date: string }) => {
    if (!activeWorkspace) return;
    addFinancialEvent({
      workspaceId: activeWorkspace.id,
      type: data.type as any,
      categoryName: data.description,
      amountMyr: data.amount,
      partyName: data.party,
      date: data.date,
      referenceNumber: `TXN-${Date.now()}`,
      description: data.description,
      isCompleted: false,
    });
  };

  const fmt = (n: number) => `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const greeting = () => {
    const h = now.getHours();
    if (h < 12) return "Selamat pagi";
    if (h < 18) return "Selamat tengah hari";
    return "Selamat petang";
  };

  const filteredTx = myEvents.filter(e =>
    e.categoryName.toLowerCase().includes(txSearch.toLowerCase()) ||
    e.partyName.toLowerCase().includes(txSearch.toLowerCase())
  ).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col" id="owner_dashboard_root">

      {/* ── HEADER ── */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm" id="owner_header">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm">MK</div>
          <div className="min-w-0">
            <div className="flex items-center space-x-1.5">
              <span className="font-bold text-slate-900 text-sm tracking-tight">MYKERANI</span>
              <span className="text-[9px] bg-slate-900 text-white px-1.5 py-0.5 rounded-full font-bold">V1.0</span>
            </div>
            <button
              onClick={() => workspaces.length > 1 && setShowCompanySwitcher(v => !v)}
              className="text-[11px] text-slate-500 truncate max-w-[160px] text-left flex items-center space-x-0.5"
            >
              <span className="truncate">{activeWorkspace?.name || "Pilih Syarikat"}</span>
              {workspaces.length > 1 && <ChevronRight className="w-3 h-3 shrink-0" />}
            </button>
          </div>
        </div>
        <div className="flex items-center space-x-2 shrink-0">
          <button className="relative p-2 text-slate-400 hover:text-slate-700 transition cursor-pointer">
            <Bell className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-sm font-bold shadow cursor-pointer" onClick={() => setActiveTab("settings")}>
            {user?.fullName?.charAt(0).toUpperCase() || "P"}
          </div>
        </div>
      </header>

      {/* Company switcher dropdown */}
      {showCompanySwitcher && workspaces.length > 1 && (
        <div className="bg-white border-b border-slate-100 px-4 py-2 shadow-sm z-10">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {workspaces.map(ws => (
              <button
                key={ws.id}
                onClick={() => { selectWorkspace(ws.id); setShowCompanySwitcher(false); }}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${ws.id === activeWorkspace?.id ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                {ws.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── DESKTOP TOP TABS ── */}
      <div className="hidden md:flex bg-white border-b border-slate-200 px-4 overflow-x-auto" id="owner_desktop_tabs">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center space-x-2 px-4 py-3.5 text-xs font-semibold border-b-2 transition shrink-0 cursor-pointer ${
              activeTab === id
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 overflow-auto pb-24 md:pb-8 max-w-3xl w-full mx-auto px-4 py-5" id="owner_main">

        {/* ════ DASHBOARD ════ */}
        {activeTab === "dashboard" && (
          <div className="space-y-5" id="owner_dashboard_pane">
            {/* Greeting */}
            <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-700 rounded-2xl p-5 text-white shadow-lg shadow-indigo-200 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-10 translate-x-10" />
              <div className="absolute bottom-0 left-0 w-20 h-20 bg-white/5 rounded-full translate-y-8 -translate-x-6" />
              <p className="text-indigo-200 text-xs mb-1">{greeting()}, {user?.fullName?.split(" ")[0] || "Tuan"} 👋</p>
              <h2 className="text-lg font-bold leading-tight">{activeWorkspace?.name || "Pilih Syarikat Anda"}</h2>
              <p className="text-indigo-200 text-xs mt-1">{new Date().toLocaleDateString("ms-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
              {netBalance !== 0 && (
                <div className="mt-3 inline-flex items-center space-x-2 bg-white/10 rounded-xl px-3 py-1.5">
                  <span className="text-xs text-indigo-100">Aliran Tunai Bulan Ini:</span>
                  <span className={`text-sm font-bold ${netBalance >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                    {netBalance >= 0 ? "+" : ""}{fmt(netBalance)}
                  </span>
                </div>
              )}
            </div>

            {/* ── STAT CARDS ── */}
            {!activeWorkspace ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3 shadow-sm">
                <Building2 className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="font-semibold text-slate-700">Pilih Syarikat Dahulu</p>
                <p className="text-xs text-slate-400">Pergi ke Tetapan untuk pilih atau tambah syarikat anda.</p>
                <button onClick={() => setActiveTab("settings")} className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition cursor-pointer">
                  Pergi ke Tetapan →
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3" id="owner_stat_cards">
                  {/* Cash & Bank */}
                  <div className="col-span-2 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl p-4 text-white shadow-md shadow-emerald-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-emerald-100 text-[10px] font-bold uppercase tracking-wider">Baki Wang & Bank</p>
                        <p className="text-3xl font-bold mt-1">{fmt(incomeThisMonth - expenseThisMonth)}</p>
                        <p className="text-emerald-100 text-[10px] mt-1">Dikira dari rekod bulan ini</p>
                      </div>
                      <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center">
                        <Wallet className="w-6 h-6 text-white" />
                      </div>
                    </div>
                  </div>

                  {/* Income */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
                        <TrendingUp className="w-4 h-4 text-emerald-500" />
                      </div>
                      <span className="text-[9px] text-slate-400 uppercase font-bold">Bulan Ini</span>
                    </div>
                    <p className="text-[10px] text-slate-500 font-semibold">Pendapatan</p>
                    <p className="text-lg font-bold text-slate-900 mt-0.5">{fmt(incomeThisMonth)}</p>
                    {incomeThisMonth === 0 && <p className="text-[10px] text-slate-300 mt-0.5">Tiada rekod lagi</p>}
                  </div>

                  {/* Expense */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <div className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center">
                        <TrendingDown className="w-4 h-4 text-rose-500" />
                      </div>
                      <span className="text-[9px] text-slate-400 uppercase font-bold">Bulan Ini</span>
                    </div>
                    <p className="text-[10px] text-slate-500 font-semibold">Perbelanjaan</p>
                    <p className="text-lg font-bold text-slate-900 mt-0.5">{fmt(expenseThisMonth)}</p>
                    {expenseThisMonth === 0 && <p className="text-[10px] text-slate-300 mt-0.5">Tiada rekod lagi</p>}
                  </div>

                  {/* To Collect */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center">
                        <Banknote className="w-4 h-4 text-amber-500" />
                      </div>
                      {toCollect > 0 && <span className="text-[9px] bg-amber-100 text-amber-600 font-bold px-2 py-0.5 rounded-full">Perlu Kutip</span>}
                    </div>
                    <p className="text-[10px] text-slate-500 font-semibold">Wang Perlu Dikutip</p>
                    <p className="text-lg font-bold text-slate-900 mt-0.5">{fmt(toCollect)}</p>
                    {toCollect === 0 && <p className="text-[10px] text-slate-300 mt-0.5">Tiada hutang luar</p>}
                  </div>

                  {/* To Pay */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <div className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center">
                        <CreditCard className="w-4 h-4 text-rose-400" />
                      </div>
                      {toPay > 0 && <span className="text-[9px] bg-rose-100 text-rose-600 font-bold px-2 py-0.5 rounded-full">Perlu Bayar</span>}
                    </div>
                    <p className="text-[10px] text-slate-500 font-semibold">Bil Perlu Dibayar</p>
                    <p className="text-lg font-bold text-slate-900 mt-0.5">{fmt(toPay)}</p>
                    {toPay === 0 && <p className="text-[10px] text-slate-300 mt-0.5">Tiada bil tertunggak</p>}
                  </div>
                </div>

                {/* ── QUICK ACTIONS ── */}
                <div className="space-y-2" id="owner_quick_actions">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Tindakan Pantas</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Tambah Pendapatan", icon: TrendingUp, color: "bg-emerald-500", action: () => setAddModal("INCOME") },
                      { label: "Tambah Perbelanjaan", icon: TrendingDown, color: "bg-rose-500", action: () => setAddModal("EXPENSE") },
                      { label: "Muat Naik Resit", icon: Upload, color: "bg-blue-500", action: () => setActiveTab("documents") },
                      { label: "Tambah Bil", icon: Receipt, color: "bg-amber-500", action: () => setActiveTab("bills") },
                      { label: "Tanya MYKERANI", icon: Bot, color: "bg-violet-500", action: () => setActiveTab("assistant") },
                      { label: "Lihat Laporan", icon: BarChart3, color: "bg-indigo-500", action: () => setActiveTab("reports") },
                    ].map(({ label, icon: Icon, color, action }) => (
                      <button
                        key={label}
                        onClick={action}
                        className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-col items-center space-y-2 shadow-sm hover:shadow-md hover:border-indigo-200 transition cursor-pointer active:scale-95"
                      >
                        <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center shadow-sm`}>
                          <Icon className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-[10px] font-semibold text-slate-600 text-center leading-tight">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── ALERTS ── */}
                {(toCollect > 0 || toPay > 0) && (
                  <div className="space-y-2" id="owner_alerts">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Perlu Perhatian</h3>
                    {toCollect > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-amber-800">Wang belum dikutip</p>
                            <p className="text-[10px] text-amber-600">{fmt(toCollect)} perlu dikutip daripada penghutang</p>
                          </div>
                        </div>
                        <button onClick={() => setActiveTab("transactions")} className="text-amber-500 hover:text-amber-700 cursor-pointer shrink-0">
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    {toPay > 0 && (
                      <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-rose-800">Bil belum dibayar</p>
                            <p className="text-[10px] text-rose-600">{fmt(toPay)} perlu dibayar kepada pembekal</p>
                          </div>
                        </div>
                        <button onClick={() => setActiveTab("bills")} className="text-rose-400 hover:text-rose-600 cursor-pointer shrink-0">
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* ── RECENT TRANSACTIONS ── */}
                <div className="space-y-2" id="owner_recent_tx">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Transaksi Terkini</h3>
                    <button onClick={() => setActiveTab("transactions")} className="text-[11px] text-indigo-500 font-semibold hover:text-indigo-700 cursor-pointer">Lihat semua →</button>
                  </div>
                  {recentTx.length === 0 ? (
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-2 shadow-sm">
                      <DollarSign className="w-8 h-8 text-slate-200 mx-auto" />
                      <p className="text-xs text-slate-400">Tiada transaksi lagi</p>
                      <div className="flex gap-2 justify-center">
                        <button onClick={() => setAddModal("INCOME")} className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-[10px] font-bold cursor-pointer hover:bg-emerald-600 transition">
                          + Pendapatan
                        </button>
                        <button onClick={() => setAddModal("EXPENSE")} className="px-3 py-1.5 bg-rose-500 text-white rounded-lg text-[10px] font-bold cursor-pointer hover:bg-rose-600 transition">
                          + Perbelanjaan
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                      {recentTx.map((tx, i) => (
                        <div key={tx.id} className={`flex items-center justify-between px-4 py-3.5 ${i < recentTx.length - 1 ? "border-b border-slate-50" : ""}`}>
                          <div className="flex items-center space-x-3 min-w-0">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                              tx.type === "INCOME" ? "bg-emerald-50" :
                              tx.type === "EXPENSE" ? "bg-rose-50" :
                              tx.type === "RECEIVABLE" ? "bg-amber-50" : "bg-violet-50"
                            }`}>
                              {tx.type === "INCOME" ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> :
                               tx.type === "EXPENSE" ? <TrendingDown className="w-3.5 h-3.5 text-rose-500" /> :
                               tx.type === "RECEIVABLE" ? <Banknote className="w-3.5 h-3.5 text-amber-500" /> :
                               <CreditCard className="w-3.5 h-3.5 text-violet-500" />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-800 truncate">{tx.categoryName}</p>
                              <p className="text-[10px] text-slate-400">{tx.partyName} · {tx.date}</p>
                            </div>
                          </div>
                          <span className={`text-sm font-bold shrink-0 ml-2 ${
                            tx.type === "INCOME" ? "text-emerald-600" :
                            tx.type === "EXPENSE" ? "text-rose-500" : "text-amber-500"
                          }`}>
                            {tx.type === "INCOME" ? "+" : "-"}RM {tx.amountMyr.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ════ TRANSACTIONS ════ */}
        {activeTab === "transactions" && (
          <div className="space-y-4" id="owner_tx_pane">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Transaksi</h2>
            </div>

            {/* Add buttons */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "+ Pendapatan", type: "INCOME" as const, color: "bg-emerald-500 hover:bg-emerald-600" },
                { label: "+ Perbelanjaan", type: "EXPENSE" as const, color: "bg-rose-500 hover:bg-rose-600" },
                { label: "+ Wang Dikutip", type: "RECEIVABLE" as const, color: "bg-amber-500 hover:bg-amber-600" },
                { label: "+ Wang Dibayar", type: "PAYABLE" as const, color: "bg-orange-500 hover:bg-orange-600" },
              ].map(({ label, type, color }) => (
                <button key={type} onClick={() => setAddModal(type)}
                  className={`${color} text-white rounded-xl py-2.5 text-xs font-bold transition cursor-pointer shadow-sm`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                value={txSearch} onChange={e => setTxSearch(e.target.value)}
                placeholder="Cari transaksi..." type="text"
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-indigo-400 shadow-sm"
              />
            </div>

            {/* List */}
            {filteredTx.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-2 shadow-sm">
                <DollarSign className="w-10 h-10 text-slate-200 mx-auto" />
                <p className="text-sm text-slate-500">Tiada transaksi lagi</p>
                <p className="text-xs text-slate-400">Mulakan dengan tambah pendapatan atau perbelanjaan</p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                {filteredTx.map((tx, i) => (
                  <div key={tx.id} className={`flex items-center justify-between px-4 py-3.5 ${i < filteredTx.length - 1 ? "border-b border-slate-50" : ""}`}>
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        tx.type === "INCOME" ? "bg-emerald-50" :
                        tx.type === "EXPENSE" ? "bg-rose-50" :
                        tx.type === "RECEIVABLE" ? "bg-amber-50" : "bg-violet-50"
                      }`}>
                        {tx.type === "INCOME" ? <TrendingUp className="w-4 h-4 text-emerald-500" /> :
                         tx.type === "EXPENSE" ? <TrendingDown className="w-4 h-4 text-rose-500" /> :
                         tx.type === "RECEIVABLE" ? <Banknote className="w-4 h-4 text-amber-500" /> :
                         <CreditCard className="w-4 h-4 text-violet-500" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">{tx.categoryName}</p>
                        <p className="text-[10px] text-slate-400">{tx.partyName} · {tx.date}</p>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                          tx.type === "INCOME" ? "bg-emerald-50 text-emerald-600" :
                          tx.type === "EXPENSE" ? "bg-rose-50 text-rose-500" :
                          tx.type === "RECEIVABLE" ? "bg-amber-50 text-amber-600" : "bg-violet-50 text-violet-600"
                        }`}>
                          {tx.type === "INCOME" ? "Pendapatan" :
                           tx.type === "EXPENSE" ? "Perbelanjaan" :
                           tx.type === "RECEIVABLE" ? "Dikutip" : "Dibayar"}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className={`text-sm font-bold ${
                        tx.type === "INCOME" ? "text-emerald-600" :
                        tx.type === "EXPENSE" ? "text-rose-500" : "text-amber-500"
                      }`}>
                        {tx.type === "INCOME" ? "+" : "-"}RM {tx.amountMyr.toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════ DOCUMENTS ════ */}
        {activeTab === "documents" && (
          <div className="space-y-4" id="owner_docs_pane">
            <h2 className="text-lg font-bold text-slate-900">Dokumen</h2>
            <FinancialEvidencePackageManager />
          </div>
        )}

        {/* ════ BILLS ════ */}
        {activeTab === "bills" && (
          <div className="space-y-4" id="owner_bills_pane">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Bil & Komitmen</h2>
              <button
                onClick={() => setAddModal("PAYABLE")}
                className="flex items-center space-x-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /><span>Tambah Bil</span>
              </button>
            </div>

            {/* Bill types quick add */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Sewa", icon: Building2, color: "bg-indigo-50 text-indigo-600 border-indigo-100" },
                { label: "Internet", icon: Repeat, color: "bg-blue-50 text-blue-600 border-blue-100" },
                { label: "Elektrik", icon: Repeat, color: "bg-amber-50 text-amber-600 border-amber-100" },
                { label: "Pinjaman", icon: PiggyBank, color: "bg-violet-50 text-violet-600 border-violet-100" },
              ].map(({ label, icon: Icon, color }) => (
                <button key={label} onClick={() => setAddModal("PAYABLE")}
                  className={`flex items-center space-x-3 p-3.5 bg-white border rounded-2xl shadow-sm hover:shadow-md transition cursor-pointer ${color.includes("border") ? color.split(" ").filter(c => c.startsWith("border")).join(" ") : "border-slate-100"}`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color.split(" ").slice(0, 2).join(" ")}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-semibold text-slate-700">{label}</p>
                    <p className="text-[10px] text-slate-400">Tambah bil {label.toLowerCase()}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Bills list */}
            {myEvents.filter(e => e.type === "PAYABLE").length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-2 shadow-sm">
                <Receipt className="w-10 h-10 text-slate-200 mx-auto" />
                <p className="text-sm text-slate-500">Tiada bil lagi</p>
                <p className="text-xs text-slate-400">Tambah bil sewa, utiliti, atau pinjaman anda</p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                {myEvents.filter(e => e.type === "PAYABLE").map((bill, i, arr) => (
                  <div key={bill.id} className={`flex items-center justify-between px-4 py-3.5 ${i < arr.length - 1 ? "border-b border-slate-50" : ""}`}>
                    <div className="flex items-center space-x-3">
                      <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center">
                        <Receipt className="w-4 h-4 text-amber-500" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-800">{bill.categoryName}</p>
                        <p className="text-[10px] text-slate-400">{bill.partyName} · {bill.date}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-bold text-slate-800">RM {bill.amountMyr.toFixed(2)}</span>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${bill.isCompleted ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"}`}>
                        {bill.isCompleted ? "Dibayar" : "Belum"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════ REPORTS ════ */}
        {activeTab === "reports" && (
          <div className="space-y-4" id="owner_reports_pane">
            <h2 className="text-lg font-bold text-slate-900">Laporan Kewangan</h2>
            <FinancialReportsAnalytics />
          </div>
        )}

        {/* ════ ASSISTANT ════ */}
        {activeTab === "assistant" && (
          <div className="space-y-4" id="owner_assistant_pane">
            <div className="bg-gradient-to-r from-violet-600 to-indigo-600 rounded-2xl p-4 text-white">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="font-bold text-base">Kerani AI</h2>
                  <p className="text-violet-200 text-[11px]">Pembantu Kewangan Pintar Anda</p>
                </div>
              </div>
            </div>
            {activeWorkspace ? (
              <AIFinancialAssistant onTriggerUpload={() => setActiveTab("documents")} />
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-2 shadow-sm">
                <Bot className="w-10 h-10 text-slate-200 mx-auto" />
                <p className="text-sm text-slate-500">Pilih syarikat dahulu untuk bercakap dengan Kerani AI</p>
              </div>
            )}
          </div>
        )}

        {/* ════ TEAM ════ */}
        {activeTab === "team" && (
          <div className="space-y-4" id="owner_team_pane">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Pasukan Saya</h2>
              <button className="flex items-center space-x-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-sm">
                <UserPlus className="w-3.5 h-3.5" /><span>Jemput Kakitangan</span>
              </button>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
              <div className="flex items-center space-x-4 p-4 bg-indigo-50 rounded-xl">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-lg font-bold shadow">
                  {user?.fullName?.charAt(0).toUpperCase() || "P"}
                </div>
                <div>
                  <p className="font-bold text-slate-900">{user?.fullName || "Pemilik"}</p>
                  <p className="text-xs text-slate-500">{user?.email}</p>
                  <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full">Pemilik Syarikat</span>
                </div>
              </div>
              <div className="p-6 text-center bg-slate-50 rounded-xl">
                <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-500">Belum ada kakitangan lagi</p>
                <p className="text-[10px] text-slate-400 mt-1">Jemput kakitangan untuk bantu rekod transaksi</p>
                <button className="mt-3 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition cursor-pointer">
                  Jemput Kakitangan
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════ HISTORY ════ */}
        {activeTab === "history" && (
          <div className="space-y-4" id="owner_history_pane">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Sejarah Aktiviti</h2>
              <button className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer shadow-sm">
                <Download className="w-3.5 h-3.5" /><span>Eksport</span>
              </button>
            </div>
            {myEvents.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-2 shadow-sm">
                <History className="w-10 h-10 text-slate-200 mx-auto" />
                <p className="text-sm text-slate-500">Tiada sejarah lagi</p>
                <p className="text-xs text-slate-400">Semua transaksi akan disenaraikan di sini</p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                {[...myEvents].sort((a, b) => b.date.localeCompare(a.date)).map((e, i, arr) => (
                  <div key={e.id} className={`flex items-center justify-between px-4 py-3.5 ${i < arr.length - 1 ? "border-b border-slate-50" : ""}`}>
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${e.type === "INCOME" ? "bg-emerald-50" : e.type === "EXPENSE" ? "bg-rose-50" : "bg-amber-50"}`}>
                        {e.type === "INCOME" ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> :
                         e.type === "EXPENSE" ? <TrendingDown className="w-3.5 h-3.5 text-rose-500" /> :
                         <Banknote className="w-3.5 h-3.5 text-amber-500" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">{e.categoryName}</p>
                        <p className="text-[10px] text-slate-400">{e.date}</p>
                      </div>
                    </div>
                    <span className={`text-sm font-bold shrink-0 ${e.type === "INCOME" ? "text-emerald-600" : "text-rose-500"}`}>
                      {e.type === "INCOME" ? "+" : "-"}RM {e.amountMyr.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════ SETTINGS ════ */}
        {activeTab === "settings" && (
          <div className="space-y-4" id="owner_settings_pane">
            <h2 className="text-lg font-bold text-slate-900">Tetapan</h2>

            {/* Profile */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-800">Profil Saya</h3>
              <div className="flex items-center space-x-4 p-4 bg-slate-50 rounded-xl">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xl font-bold shadow">
                  {user?.fullName?.charAt(0).toUpperCase() || "P"}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-slate-900">{user?.fullName || "Pemilik"}</p>
                  <p className="text-xs text-slate-500">{user?.email}</p>
                  <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full">Pemilik Syarikat</span>
                </div>
                <button className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer">
                  Edit
                </button>
              </div>
            </div>

            {/* Company */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-slate-800">Syarikat</h3>
              {workspaces.map(ws => (
                <div key={ws.id} className={`flex items-center justify-between p-3 rounded-xl border ${ws.id === activeWorkspace?.id ? "bg-indigo-50 border-indigo-200" : "bg-slate-50 border-slate-100"}`}>
                  <div className="flex items-center space-x-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${ws.id === activeWorkspace?.id ? "bg-indigo-600" : "bg-slate-200"}`}>
                      <Building2 className={`w-4 h-4 ${ws.id === activeWorkspace?.id ? "text-white" : "text-slate-500"}`} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-800">{ws.name}</p>
                      {ws.id === activeWorkspace?.id && <p className="text-[9px] text-indigo-500 font-bold">Syarikat Aktif</p>}
                    </div>
                  </div>
                  {ws.id !== activeWorkspace?.id && (
                    <button onClick={() => selectWorkspace(ws.id)} className="text-xs text-indigo-500 font-semibold hover:text-indigo-700 cursor-pointer">Pilih</button>
                  )}
                </div>
              ))}
            </div>

            {/* Logout */}
            <button
              onClick={() => signOut()}
              className="w-full py-3 border-2 border-rose-200 text-rose-500 rounded-2xl text-sm font-bold hover:bg-rose-50 transition cursor-pointer flex items-center justify-center space-x-2"
            >
              <LogOut className="w-4 h-4" />
              <span>Log Keluar</span>
            </button>
          </div>
        )}
      </main>

      {/* ── MOBILE BOTTOM NAV ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-20 shadow-lg" id="owner_bottom_nav">
        <div className="flex items-center justify-around px-1 py-2">
          {TABS.slice(0, 5).map(({ id, shortLabel, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex flex-col items-center py-1 px-2 rounded-xl transition cursor-pointer ${activeTab === id ? "text-indigo-600" : "text-slate-400"}`}
            >
              <Icon className={`w-5 h-5 ${activeTab === id ? "text-indigo-600" : ""}`} />
              <span className={`text-[9px] font-bold mt-0.5 ${activeTab === id ? "text-indigo-600" : ""}`}>{shortLabel}</span>
            </button>
          ))}
          {/* More menu for remaining tabs */}
          <div className="relative">
            <button
              onClick={() => {
                const remaining = TABS.slice(5);
                const next = remaining.find(t => t.id === activeTab) ? remaining[0] : remaining.find(t => t.id !== activeTab) || remaining[0];
                if (remaining.some(t => t.id === activeTab)) return;
                setActiveTab(remaining[0].id);
              }}
              className={`flex flex-col items-center py-1 px-2 rounded-xl transition cursor-pointer ${TABS.slice(5).some(t => t.id === activeTab) ? "text-indigo-600" : "text-slate-400"}`}
            >
              <MoreHorizontal className="w-5 h-5" />
              <span className="text-[9px] font-bold mt-0.5">Lagi</span>
            </button>
          </div>
        </div>
        {/* Secondary nav for remaining tabs - shows when "Lagi" area is active */}
        {TABS.slice(5).some(t => t.id === activeTab) && (
          <div className="flex items-center justify-around px-1 pb-2 border-t border-slate-100 bg-slate-50">
            {TABS.slice(5).map(({ id, shortLabel, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex flex-col items-center py-1.5 px-2 rounded-xl transition cursor-pointer ${activeTab === id ? "text-indigo-600" : "text-slate-400"}`}
              >
                <Icon className="w-4.5 h-4.5" />
                <span className="text-[9px] font-bold mt-0.5">{shortLabel}</span>
              </button>
            ))}
          </div>
        )}
      </nav>

      {/* ── ADD TRANSACTION MODAL ── */}
      {addModal && (
        <AddTransactionModal
          type={addModal}
          onClose={() => setAddModal(null)}
          onSave={handleSaveTx}
        />
      )}
    </div>
  );
}
