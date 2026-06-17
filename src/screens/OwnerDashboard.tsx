import React, { useState, useRef, useEffect, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { useFinancials } from "../context/FinancialRecordsContext";
import { useTenant } from "../context/TenantContext";
import {
  Home, LayoutDashboard, FileText, BarChart3, MoreHorizontal,
  Send, Receipt, FileSpreadsheet, Landmark, Brain, User as UserIcon,
  TrendingUp, TrendingDown, Wallet, Clock,
  ChevronRight, Upload, LogOut, Users,
  History, Settings, User, X, Bot, UserPlus, RefreshCw,
  HelpCircle, CreditCard, Cpu, HardDrive, Bell, Shield,
  BookOpen, Ticket, MessageCircle, Zap, Database, Edit3,
  UserCheck, UserX, KeyRound, AlertCircle, CheckCircle2,
  ToggleLeft, ToggleRight, ExternalLink,
} from "lucide-react";
import { FinancialEvidencePackageManager } from "../components/FinancialEvidencePackage";
import { FinancialReportsAnalytics } from "../components/FinancialReportsAnalytics";

type MainTab = "home" | "dashboard" | "documents" | "reports" | "more";
type MorePage = "menu" | "team" | "history" | "settings" | "profile" | "support" | "billing" | "resources";

interface ChatMsg { id: string; sender: "user" | "ai"; text: string; }

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Selamat Pagi";
  if (h < 17) return "Selamat Tengah Hari";
  if (h < 20) return "Selamat Petang";
  return "Selamat Malam";
}

// ── Quick Add Record Modal ────────────────────────────────────────────────────
function QuickAddModal({
  type, onClose, onSave,
}: {
  type: "INCOME" | "EXPENSE";
  onClose: () => void;
  onSave: (d: { type: string; amount: number; description: string; party: string; date: string }) => void;
}) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [party, setParty] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const isIncome = type === "INCOME";

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount) return;
    onSave({ type, amount: parseFloat(amount), description, party, date });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-base">{isIncome ? "Rekod Pendapatan" : "Rekod Perbelanjaan"}</h3>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
        <form onSubmit={handleSave} className="space-y-3">
          <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="Jumlah (RM)" required
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-lg font-bold focus:outline-none focus:border-indigo-400" />
          <input type="text" value={party} onChange={e => setParty(e.target.value)}
            placeholder={isIncome ? "Dari siapa? (Pelanggan)" : "Kepada siapa? (Pembekal)"}
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
          <input type="text" value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Penerangan (pilihan)"
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
          <button type="submit"
            className={`w-full py-3 rounded-xl text-sm font-bold text-white shadow transition cursor-pointer ${isIncome ? "bg-emerald-500 hover:bg-emerald-600" : "bg-rose-500 hover:bg-rose-600"}`}>
            Simpan
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function OwnerDashboard() {
  const { user, signOut } = useAuth();
  const { activeWorkspace, workspaces, selectWorkspace } = useWorkspace();
  const { activeTenant } = useTenant();
  const { financialEvents, addFinancialEvent } = useFinancials();

  const [activeTab, setActiveTab] = useState<MainTab>("home");
  const [morePage, setMorePage] = useState<MorePage>("menu");
  const [quickAdd, setQuickAdd] = useState<"INCOME" | "EXPENSE" | null>(null);

  // ── AI Chat State ──
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── Invite staff ──
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ success: boolean; message: string; tempPassword?: string } | null>(null);

  // ── Support Center ──
  const [supportMessages, setSupportMessages] = useState<{ id: string; sender: "user" | "ai"; text: string }[]>([]);
  const [supportInput, setSupportInput] = useState("");
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportView, setSupportView] = useState<"chat" | "faq" | "ticket" | "ticket_status">("chat");
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketDesc, setTicketDesc] = useState("");
  const [ticketSent, setTicketSent] = useState(false);
  const supportEndRef = useRef<HTMLDivElement>(null);

  // ── Reminder Settings ──
  const [reminders, setReminders] = useState({ subscription: "7", bill: "3", aiCredit: "7", storage: "7" });

  // ── Resource Settings ──
  const [resAI, setResAI] = useState<"mykerani" | "own">("mykerani");
  const [resStorage, setResStorage] = useState<"mykerani" | "gdrive" | "onedrive" | "dropbox">("mykerani");

  const wsId = activeWorkspace?.id || "";
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const firstName = user?.fullName?.split(" ")[0] || "Anda";
  const greeting = getGreeting();

  const myEvents = useMemo(() => financialEvents.filter(e => e.workspaceId === wsId), [financialEvents, wsId]);
  const incomeThisMonth = useMemo(() => myEvents.filter(e => e.type === "INCOME" && e.date.startsWith(thisMonth)).reduce((s, e) => s + e.amountMyr, 0), [myEvents, thisMonth]);
  const expenseThisMonth = useMemo(() => myEvents.filter(e => e.type === "EXPENSE" && e.date.startsWith(thisMonth)).reduce((s, e) => s + e.amountMyr, 0), [myEvents, thisMonth]);
  const totalReceivable = useMemo(() => myEvents.filter(e => e.type === "RECEIVABLE" && !e.isCompleted).reduce((s, e) => s + e.amountMyr, 0), [myEvents]);
  const totalPayable = useMemo(() => myEvents.filter(e => e.type === "PAYABLE" && !e.isCompleted).reduce((s, e) => s + e.amountMyr, 0), [myEvents]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages, chatLoading]);
  useEffect(() => { supportEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [supportMessages, supportLoading]);

  const sendChat = async (text?: string) => {
    const q = (text || chatInput).trim();
    if (!q || chatLoading) return;
    setChatInput("");
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, sender: "user", text: q };
    setChatMessages(prev => [...prev, userMsg]);
    setChatLoading(true);
    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q,
          financialContext: { activeTenant, activeWorkspace, financialEvents }
        }),
      });
      const data = await res.json() as any;
      let reply = data.text || "Saya sedang cuba membantu anda.";
      reply = reply.replace(/tenant/gi, "syarikat").replace(/sandbox/gi, "ujian");
      setChatMessages(prev => [...prev, { id: `a-${Date.now()}`, sender: "ai", text: reply }]);
    } catch {
      setChatMessages(prev => [...prev, { id: `e-${Date.now()}`, sender: "ai", text: "Minta maaf, sambungan terputus sebentar. Sila cuba lagi." }]);
    } finally {
      setChatLoading(false);
    }
  };

  const sendSupport = async (text?: string) => {
    const q = (text || supportInput).trim();
    if (!q || supportLoading) return;
    setSupportInput("");
    setSupportMessages(prev => [...prev, { id: `u-${Date.now()}`, sender: "user", text: q }]);
    setSupportLoading(true);
    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `[SOKONGAN MYKERANI] ${q}`,
          financialContext: { activeTenant, activeWorkspace, financialEvents },
        }),
      });
      const data = await res.json() as any;
      setSupportMessages(prev => [...prev, { id: `a-${Date.now()}`, sender: "ai", text: data.text || "Saya sedang menyemak soalan anda." }]);
    } catch {
      setSupportMessages(prev => [...prev, { id: `e-${Date.now()}`, sender: "ai", text: "Maaf, sambungan terputus. Cuba lagi atau buka tiket sokongan." }]);
    } finally {
      setSupportLoading(false);
    }
  };

  const handleSaveRecord = (data: { type: string; amount: number; description: string; party: string; date: string }) => {
    if (!activeWorkspace) return;
    addFinancialEvent({
      workspaceId: activeWorkspace.id,
      type: data.type as any,
      categoryName: data.type === "INCOME" ? "Pendapatan" : "Perbelanjaan",
      amountMyr: data.amount,
      partyName: data.party || "Tidak dinyatakan",
      date: data.date,
      referenceNumber: `TXN-${Date.now().toString().slice(-6)}`,
      description: data.description,
      isCompleted: false,
    });
  };

  const handleInviteSubmit = async () => {
    if (!inviteEmail.trim() || !inviteName.trim()) return;
    setInviteLoading(true);
    setInviteResult(null);
    try {
      const { supabase } = await import("../lib/supabase");
      const { data: sessionData } = await supabase!.auth.getSession();
      const jwt = sessionData?.session?.access_token || "";
      const res = await fetch("/api/admin/create-staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), fullName: inviteName.trim(), role: "TENANT_STAFF", tenantId: user?.tenantId || "", callerJwt: jwt }),
      });
      const data = await res.json() as any;
      if (data.success) {
        setInviteResult({ success: true, message: data.message, tempPassword: data.tempPassword });
        setInviteEmail(""); setInviteName("");
      } else {
        setInviteResult({ success: false, message: data.error || "Gagal cipta akaun." });
      }
    } catch (err: any) {
      setInviteResult({ success: false, message: err?.message || "Ralat sambungan." });
    } finally {
      setInviteLoading(false);
    }
  };

  const QUICK_PROMPTS = [
    { label: "💰 Baki tunai saya?", q: "Berapa baki tunai saya sekarang?" },
    { label: "📊 Ringkasan bulan ini", q: "Ringkaskan kewangan saya bulan ini." },
    { label: "📋 Bil tertunggak?", q: "Adakah ada bil yang perlu dibayar?" },
    { label: "📈 Pendapatan vs Perbelanjaan", q: "Bandingkan pendapatan dan perbelanjaan bulan ini." },
  ];

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden" id="owner_root">

      {/* ── HEADER ── */}
      <header className="bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between shrink-0 z-30" id="owner_header">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center text-white font-bold text-sm shadow-sm">MK</div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-bold text-slate-900 text-sm">MYKERANI</span>
              <span className="text-[9px] font-bold bg-slate-900 text-white px-1.5 py-0.5 rounded-md">V1.0</span>
            </div>
            {activeWorkspace && <p className="text-[10px] text-slate-400 leading-none mt-0.5">{activeWorkspace.name}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {workspaces.length > 1 && (
            <select value={activeWorkspace?.id || ""} onChange={e => selectWorkspace(e.target.value)}
              className="text-[11px] font-semibold border border-slate-200 rounded-lg px-2 py-1 bg-white outline-none cursor-pointer">
              {workspaces.map(ws => <option key={ws.id} value={ws.id}>{ws.name}</option>)}
            </select>
          )}
          <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
            <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[9px] font-bold">
              {firstName.charAt(0).toUpperCase()}
            </div>
            <span className="text-[11px] font-semibold text-slate-700 hidden sm:block">{firstName}</span>
            <span className="text-[10px] text-slate-400 hidden sm:block">·</span>
            <span className="text-[10px] text-indigo-500 font-semibold hidden sm:block">Pemilik</span>
          </div>
          <button onClick={() => signOut()}
            className="p-1.5 bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-400 hover:text-rose-500 rounded-xl transition cursor-pointer">
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* ── MAIN ── */}
      <div className="flex-1 overflow-hidden flex flex-col" id="owner_main">

        {/* ════ HOME — AI CONVERSATION (Primary Screen) ════ */}
        {activeTab === "home" && (
          <div className="flex-1 flex flex-col overflow-hidden" id="owner_home_pane">

            {/* Conversation area */}
            <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2 space-y-4" id="owner_chat_area">

              {/* Welcome — shown only if no messages */}
              {chatMessages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 space-y-2 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center shadow-lg mb-1">
                    <Brain className="w-7 h-7 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">{greeting}, {firstName}</h2>
                  <p className="text-sm text-slate-500 max-w-xs">Apa yang anda ingin MYKERANI bantu hari ini?</p>
                </div>
              )}

              {/* Chat messages */}
              {chatMessages.map(msg => {
                const isUser = msg.sender === "user";
                return (
                  <div key={msg.id} className={`flex items-start gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
                    <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${isUser ? "bg-indigo-600 text-white" : "bg-slate-900 text-white"}`}>
                      {isUser ? <UserIcon className="w-3.5 h-3.5" /> : <Brain className="w-3.5 h-3.5" />}
                    </div>
                    <div className={`max-w-[78%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${isUser ? "bg-indigo-600 text-white rounded-tr-none" : "bg-white border border-slate-200 text-slate-800 rounded-tl-none whitespace-pre-wrap shadow-sm"}`}>
                      {msg.text}
                    </div>
                  </div>
                );
              })}

              {/* Loading */}
              {chatLoading && (
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  </div>
                  <div className="px-4 py-3 bg-white border border-slate-200 rounded-2xl rounded-tl-none text-xs text-slate-400 shadow-sm animate-pulse">
                    MYKERANI sedang menyemak maklumat...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Quick prompts — shown only if no messages */}
            {chatMessages.length === 0 && (
              <div className="px-4 pb-2 flex flex-wrap gap-2">
                {QUICK_PROMPTS.map(({ label, q }) => (
                  <button key={label} onClick={() => sendChat(q)}
                    className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:border-indigo-300 hover:text-indigo-700 transition cursor-pointer shadow-sm">
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Upload shortcuts */}
            <div className="px-4 pb-2 flex gap-2">
              {[
                { label: "📷 Resit", desc: "RECEIPT" },
                { label: "📄 Invois", desc: "INVOICE" },
                { label: "🏦 Penyata Bank", desc: "STATEMENT" },
              ].map(({ label }) => (
                <button key={label} onClick={() => setActiveTab("documents")}
                  className="flex-1 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 transition cursor-pointer shadow-sm">
                  {label}
                </button>
              ))}
            </div>

            {/* Chat input */}
            <div className="px-4 pb-4 shrink-0">
              <form onSubmit={e => { e.preventDefault(); sendChat(); }}
                className="flex items-center gap-2 bg-white border border-slate-300 rounded-2xl px-4 py-3 shadow-sm focus-within:border-indigo-400 transition">
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder="Taip di sini... Cth: Saya bayar pembekal RM500"
                  className="flex-1 text-sm outline-none text-slate-800 placeholder-slate-400 bg-transparent"
                />
                <button type="submit" disabled={!chatInput.trim() || chatLoading}
                  className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center disabled:bg-slate-200 transition cursor-pointer shrink-0">
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>

              {/* Smart quick actions */}
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  { label: "+ Pendapatan", action: () => setQuickAdd("INCOME"), color: "text-emerald-600 bg-emerald-50 border-emerald-100" },
                  { label: "- Perbelanjaan", action: () => setQuickAdd("EXPENSE"), color: "text-rose-600 bg-rose-50 border-rose-100" },
                  { label: "📊 Dashboard", action: () => setActiveTab("dashboard"), color: "text-indigo-600 bg-indigo-50 border-indigo-100" },
                ].map(({ label, action, color }) => (
                  <button key={label} onClick={action}
                    className={`py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${color}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ════ DASHBOARD ════ */}
        {activeTab === "dashboard" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-2xl mx-auto w-full pb-20" id="owner_dashboard_pane">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Dashboard</h2>
              <p className="text-xs text-slate-400">{now.toLocaleDateString("ms-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-4 text-white shadow">
                <p className="text-[11px] text-emerald-100">Pendapatan Bulan Ini</p>
                <p className="text-xl font-bold mt-1">RM {incomeThisMonth.toLocaleString("ms-MY", { minimumFractionDigits: 2 })}</p>
                <TrendingUp className="w-4 h-4 text-emerald-200 mt-1" />
              </div>
              <div className="bg-gradient-to-br from-rose-500 to-pink-600 rounded-2xl p-4 text-white shadow">
                <p className="text-[11px] text-rose-100">Perbelanjaan Bulan Ini</p>
                <p className="text-xl font-bold mt-1">RM {expenseThisMonth.toLocaleString("ms-MY", { minimumFractionDigits: 2 })}</p>
                <TrendingDown className="w-4 h-4 text-rose-200 mt-1" />
              </div>
            </div>

            <div className={`rounded-2xl p-4 shadow-sm border bg-white ${(incomeThisMonth - expenseThisMonth) >= 0 ? "border-emerald-100" : "border-rose-100"}`}>
              <p className="text-xs text-slate-500">Untung / Rugi Bulan Ini</p>
              <p className={`text-2xl font-bold mt-1 ${(incomeThisMonth - expenseThisMonth) >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                {(incomeThisMonth - expenseThisMonth) >= 0 ? "+" : "-"}RM {Math.abs(incomeThisMonth - expenseThisMonth).toLocaleString("ms-MY", { minimumFractionDigits: 2 })}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                <p className="text-[11px] text-slate-500 mb-1">Perlu Dikutip</p>
                <p className="text-lg font-bold text-amber-600">RM {totalReceivable.toLocaleString("ms-MY", { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                <p className="text-[11px] text-slate-500 mb-1">Perlu Dibayar</p>
                <p className="text-lg font-bold text-indigo-600">RM {totalPayable.toLocaleString("ms-MY", { minimumFractionDigits: 2 })}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setQuickAdd("INCOME")} className="flex items-center space-x-2 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 transition cursor-pointer hover:bg-emerald-100">
                <TrendingUp className="w-4 h-4 text-emerald-600" /><span className="text-xs font-bold text-emerald-700">Rekod Pendapatan</span>
              </button>
              <button onClick={() => setQuickAdd("EXPENSE")} className="flex items-center space-x-2 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3 transition cursor-pointer hover:bg-rose-100">
                <TrendingDown className="w-4 h-4 text-rose-500" /><span className="text-xs font-bold text-rose-600">Rekod Perbelanjaan</span>
              </button>
            </div>

            {myEvents.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Transaksi Terkini</p>
                {myEvents.slice(-8).reverse().map(ev => (
                  <div key={ev.id} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between shadow-sm">
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${ev.type === "INCOME" ? "bg-emerald-50" : "bg-rose-50"}`}>
                        {ev.type === "INCOME" ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> : <TrendingDown className="w-3.5 h-3.5 text-rose-500" />}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-800 truncate max-w-[150px]">{ev.partyName || ev.categoryName}</p>
                        <p className="text-[10px] text-slate-400">{ev.date}</p>
                      </div>
                    </div>
                    <span className={`text-sm font-bold ${ev.type === "INCOME" ? "text-emerald-600" : "text-rose-500"}`}>
                      {ev.type === "INCOME" ? "+" : "-"}RM {ev.amountMyr.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm">
                <Bot className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-sm text-slate-400">Belum ada transaksi</p>
                <button onClick={() => setActiveTab("home")} className="mt-3 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-indigo-700">
                  Beritahu MYKERANI
                </button>
              </div>
            )}
          </div>
        )}

        {/* ════ DOCUMENTS ════ */}
        {activeTab === "documents" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-2xl mx-auto w-full pb-20" id="owner_docs_pane">
            <h2 className="text-lg font-bold text-slate-900">Dokumen</h2>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Muat Naik Resit", icon: Receipt, bg: "bg-amber-50 border-amber-100 text-amber-500" },
                { label: "Muat Naik Invois", icon: FileSpreadsheet, bg: "bg-blue-50 border-blue-100 text-blue-500" },
                { label: "Penyata Bank", icon: Landmark, bg: "bg-violet-50 border-violet-100 text-violet-500" },
              ].map(({ label, icon: Icon, bg }) => (
                <button key={label} className={`flex flex-col items-center space-y-2 p-4 bg-white border ${bg} rounded-2xl shadow-sm hover:shadow-md transition cursor-pointer`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bg}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-700 text-center leading-tight">{label}</span>
                </button>
              ))}
            </div>
            <FinancialEvidencePackageManager />
          </div>
        )}

        {/* ════ REPORTS ════ */}
        {activeTab === "reports" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-2xl mx-auto w-full pb-20" id="owner_reports_pane">
            <h2 className="text-lg font-bold text-slate-900">Laporan</h2>
            <FinancialReportsAnalytics />
          </div>
        )}

        {/* ════ MORE ════ */}
        {activeTab === "more" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-2xl mx-auto w-full pb-20" id="owner_more_pane">

            {morePage === "menu" && (
              <>
                <h2 className="text-lg font-bold text-slate-900">Lagi</h2>
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm divide-y divide-slate-100">
                  {([
                    { id: "team" as MorePage,      label: "Pasukan",           desc: "Tambah, edit & urus kakitangan",        icon: Users },
                    { id: "billing" as MorePage,   label: "Bil & Langganan",   desc: "Plan, kredit AI & storan",              icon: CreditCard },
                    { id: "resources" as MorePage, label: "Tetapan Sumber",    desc: "AI & storan yang digunakan",            icon: Cpu },
                    { id: "support" as MorePage,   label: "Pusat Sokongan",    desc: "Bantuan, FAQ & tiket sokongan",         icon: HelpCircle },
                    { id: "history" as MorePage,   label: "Sejarah Aktiviti",  desc: "Log semua transaksi & aktiviti",        icon: History },
                    { id: "settings" as MorePage,  label: "Tetapan",           desc: "Konfigurasi & peringatan",              icon: Settings },
                    { id: "profile" as MorePage,   label: "Profil Saya",       desc: user?.email || "",                       icon: User },
                  ]).map(({ id, label, desc, icon: Icon }) => (
                    <button key={id} onClick={() => setMorePage(id)}
                      className="w-full flex items-center space-x-4 px-4 py-4 hover:bg-slate-50 transition cursor-pointer text-left">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
                        <Icon className="w-4 h-4 text-slate-600" />
                      </div>
                      <div className="flex-grow">
                        <p className="text-sm font-semibold text-slate-900">{label}</p>
                        <p className="text-[11px] text-slate-400 truncate">{desc}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </button>
                  ))}
                </div>
                <button onClick={() => signOut()} className="w-full py-3 border border-rose-200 text-rose-500 rounded-2xl text-sm font-semibold hover:bg-rose-50 transition cursor-pointer">
                  Log Keluar
                </button>
              </>
            )}

            {morePage !== "menu" && (
              <button onClick={() => setMorePage("menu")} className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-slate-600 cursor-pointer transition mb-2">
                <ChevronRight className="w-3.5 h-3.5 rotate-180" /><span>Kembali</span>
              </button>
            )}

            {/* Team */}
            {morePage === "team" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-900">Pasukan Saya</h2>
                  <button onClick={() => { setShowInvite(v => !v); setInviteResult(null); }}
                    className="flex items-center space-x-1.5 px-3 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold cursor-pointer">
                    <UserPlus className="w-3.5 h-3.5" /><span>Jemput Staf</span>
                  </button>
                </div>
                {showInvite && (
                  <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 space-y-3">
                    <p className="text-xs font-bold text-indigo-800">Cipta Akaun Kakitangan Baru</p>
                    <input type="text" value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Nama penuh kakitangan"
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 bg-white" />
                    <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="Email kakitangan"
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 bg-white" />
                    <button onClick={handleInviteSubmit} disabled={inviteLoading || !inviteEmail.trim() || !inviteName.trim()}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold cursor-pointer transition">
                      {inviteLoading ? "Mencipta akaun..." : "Cipta & Jemput"}
                    </button>
                    {inviteResult && (
                      <div className={`rounded-xl p-3 text-xs ${inviteResult.success ? "bg-emerald-50 border border-emerald-200" : "bg-rose-50 border border-rose-200"}`}>
                        <p className={`font-bold ${inviteResult.success ? "text-emerald-700" : "text-rose-700"}`}>{inviteResult.success ? "✓ Berjaya!" : "✗ Gagal"}</p>
                        <p className={inviteResult.success ? "text-emerald-600" : "text-rose-600"}>{inviteResult.message}</p>
                        {inviteResult.tempPassword && (
                          <div className="mt-2 p-2 bg-white border border-emerald-200 rounded-lg">
                            <p className="text-[10px] text-slate-500 mb-1">Kata Laluan Sementara:</p>
                            <p className="font-mono font-bold text-slate-900 select-all">{inviteResult.tempPassword}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-sm">
                  <div className="flex items-center space-x-3 p-3 bg-indigo-50 rounded-xl">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold">
                      {firstName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{user?.fullName}</p>
                      <p className="text-xs text-slate-500">{user?.email}</p>
                      <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full">Pemilik</span>
                    </div>
                  </div>
                  <div className="text-center py-4">
                    <Users className="w-7 h-7 text-slate-200 mx-auto mb-1" />
                    <p className="text-xs text-slate-400">Belum ada kakitangan lagi</p>
                  </div>
                </div>
              </div>
            )}

            {/* History */}
            {morePage === "history" && (
              <div className="space-y-3">
                <h2 className="text-lg font-bold text-slate-900">Sejarah Aktiviti</h2>
                {myEvents.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center shadow-sm">
                    <History className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">Tiada aktiviti lagi</p>
                  </div>
                ) : myEvents.slice().reverse().map(ev => (
                  <div key={ev.id} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between shadow-sm">
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${ev.type === "INCOME" ? "bg-emerald-50" : "bg-rose-50"}`}>
                        {ev.type === "INCOME" ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> : <TrendingDown className="w-3.5 h-3.5 text-rose-500" />}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-800">{ev.partyName || ev.categoryName}</p>
                        <p className="text-[10px] text-slate-400">{ev.date}</p>
                      </div>
                    </div>
                    <span className={`text-sm font-bold ${ev.type === "INCOME" ? "text-emerald-600" : "text-rose-500"}`}>
                      {ev.type === "INCOME" ? "+" : "-"}RM {ev.amountMyr.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Settings */}
            {morePage === "settings" && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-slate-900">Tetapan</h2>
                {/* Company info */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Maklumat Syarikat</p>
                  {[
                    { label: "Nama Syarikat", value: activeWorkspace?.name || "-" },
                    { label: "Mata Wang", value: "MYR (Ringgit Malaysia)" },
                    { label: "Zon Masa", value: "Asia/Kuala_Lumpur (UTC+8)" },
                    { label: "Bahasa", value: "Bahasa Melayu" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
                      <span className="text-xs text-slate-500">{label}</span>
                      <span className="text-xs font-semibold text-slate-800">{value}</span>
                    </div>
                  ))}
                </div>

                {/* Reminder Settings — Feature 6 */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                  <div className="flex items-center space-x-2">
                    <Bell className="w-4 h-4 text-indigo-500" />
                    <p className="text-sm font-bold text-slate-900">Tetapan Peringatan</p>
                  </div>
                  {[
                    { key: "subscription" as const, label: "Peringatan Langganan" },
                    { key: "bill" as const,         label: "Peringatan Bil" },
                    { key: "aiCredit" as const,     label: "Peringatan Kredit AI" },
                    { key: "storage" as const,      label: "Peringatan Storan" },
                  ].map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-xs text-slate-600">{label}</span>
                      <select value={reminders[key]} onChange={e => setReminders(r => ({ ...r, [key]: e.target.value }))}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none cursor-pointer font-semibold text-slate-700">
                        {[{ v: "30", l: "30 Hari" }, { v: "14", l: "14 Hari" }, { v: "7", l: "7 Hari" }, { v: "3", l: "3 Hari" }, { v: "1", l: "1 Hari" }].map(o => (
                          <option key={o.v} value={o.v}>{o.l}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                  <button className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition cursor-pointer">
                    Simpan Peringatan
                  </button>
                </div>
              </div>
            )}

            {/* Profile */}
            {morePage === "profile" && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-slate-900">Profil Saya</h2>
                <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
                  <div className="flex items-center space-x-4">
                    <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-2xl font-bold shadow">
                      {firstName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{user?.fullName}</p>
                      <p className="text-xs text-slate-500">{user?.email}</p>
                      <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full mt-1 inline-block">Pemilik Syarikat</span>
                    </div>
                  </div>
                  <button onClick={() => signOut()} className="w-full py-3 border border-rose-200 text-rose-500 rounded-xl text-sm font-semibold hover:bg-rose-50 transition cursor-pointer">
                    Log Keluar
                  </button>
                </div>
              </div>
            )}

            {/* ═══ SUPPORT CENTER — Feature 1 ═══ */}
            {morePage === "support" && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-slate-900">Pusat Sokongan</h2>

                {/* Sub-nav */}
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {([
                    { id: "chat" as const,          label: "Tanya AI",        icon: MessageCircle },
                    { id: "faq" as const,           label: "FAQ",             icon: BookOpen },
                    { id: "ticket" as const,        label: "Buka Tiket",      icon: Ticket },
                    { id: "ticket_status" as const, label: "Status Tiket",    icon: CheckCircle2 },
                  ]).map(({ id, label, icon: Icon }) => (
                    <button key={id} onClick={() => setSupportView(id)}
                      className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${supportView === id ? "bg-indigo-600 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>
                      <Icon className="w-3.5 h-3.5" /><span>{label}</span>
                    </button>
                  ))}
                </div>

                {/* AI Support Chat */}
                {supportView === "chat" && (
                  <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col" style={{ height: "420px" }}>
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center space-x-2">
                      <Brain className="w-4 h-4 text-indigo-500" />
                      <span className="text-xs font-bold text-slate-700">MYKERANI AI Sokongan</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                      {supportMessages.length === 0 && (
                        <div className="text-center py-6 space-y-3">
                          <HelpCircle className="w-10 h-10 text-slate-200 mx-auto" />
                          <p className="text-xs text-slate-400">Tanya apa sahaja tentang cara guna MYKERANI</p>
                          <div className="flex flex-wrap gap-2 justify-center">
                            {["Cara muat naik resit?", "Cara rekod perbelanjaan?", "Cara cari rekod lama?", "Cara lampir dokumen?"].map(q => (
                              <button key={q} onClick={() => sendSupport(q)}
                                className="px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-xl text-xs text-indigo-700 font-semibold cursor-pointer hover:bg-indigo-100 transition">
                                {q}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {supportMessages.map(msg => {
                        const isUser = msg.sender === "user";
                        return (
                          <div key={msg.id} className={`flex items-start gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${isUser ? "bg-indigo-600 text-white" : "bg-slate-900 text-white"}`}>
                              {isUser ? <UserIcon className="w-3 h-3" /> : <Brain className="w-3 h-3" />}
                            </div>
                            <div className={`max-w-[80%] px-3 py-2 rounded-xl text-xs leading-relaxed ${isUser ? "bg-indigo-600 text-white rounded-tr-none" : "bg-slate-50 border border-slate-200 text-slate-800 rounded-tl-none whitespace-pre-wrap"}`}>
                              {msg.text}
                            </div>
                          </div>
                        );
                      })}
                      {supportLoading && (
                        <div className="flex items-start gap-2">
                          <div className="w-6 h-6 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          </div>
                          <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-400 animate-pulse">Mencari jawapan...</div>
                        </div>
                      )}
                      <div ref={supportEndRef} />
                    </div>
                    <div className="p-3 border-t border-slate-100">
                      <form onSubmit={e => { e.preventDefault(); sendSupport(); }} className="flex gap-2">
                        <input type="text" value={supportInput} onChange={e => setSupportInput(e.target.value)}
                          placeholder="Tanya soalan tentang MYKERANI..."
                          className="flex-1 text-xs border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-400 bg-white" />
                        <button type="submit" disabled={!supportInput.trim() || supportLoading}
                          className="px-3 py-2 bg-indigo-600 text-white rounded-xl disabled:bg-slate-200 cursor-pointer transition">
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      </form>
                      <button onClick={() => setSupportView("ticket")} className="mt-2 w-full text-center text-[11px] text-slate-400 hover:text-indigo-600 transition cursor-pointer">
                        Masalah tidak selesai? Buka tiket sokongan →
                      </button>
                    </div>
                  </div>
                )}

                {/* FAQ */}
                {supportView === "faq" && (
                  <div className="space-y-2">
                    {[
                      { q: "Bagaimana cara muat naik resit?", a: "Pergi ke tab Dokumen → klik 'Muat Naik Resit' → pilih gambar atau PDF resit anda." },
                      { q: "Bagaimana cara rekod perbelanjaan?", a: "Di Home, taip 'Saya bayar [nama] RM[jumlah]' atau klik '- Rekod Perbelanjaan' di bawah kotak chat." },
                      { q: "Bagaimana cara cari rekod lama?", a: "Pergi ke Dashboard → skrol ke bawah untuk lihat senarai transaksi terkini." },
                      { q: "Bagaimana cara jemput kakitangan?", a: "Pergi ke Lagi → Pasukan → klik 'Jemput Staf' → masukkan nama dan email." },
                      { q: "Bagaimana cara lihat laporan?", a: "Klik tab 'Laporan' di bawah navigasi untuk lihat P&L, Cashflow dan ringkasan kewangan." },
                      { q: "Boleh saya guna AI saya sendiri?", a: "Ya, jika HQ mengizinkan. Pergi ke Lagi → Tetapan Sumber untuk tukar ke AI anda sendiri." },
                      { q: "Apa itu kredit AI?", a: "Kredit AI digunakan apabila anda bertanya kepada MYKERANI. Semak baki di Lagi → Bil & Langganan." },
                    ].map(({ q, a }) => (
                      <details key={q} className="bg-white border border-slate-200 rounded-xl shadow-sm group">
                        <summary className="px-4 py-3.5 text-xs font-semibold text-slate-800 cursor-pointer list-none flex items-center justify-between">
                          {q}
                          <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-open:rotate-90 transition-transform" />
                        </summary>
                        <p className="px-4 pb-4 text-xs text-slate-500 leading-relaxed">{a}</p>
                      </details>
                    ))}
                  </div>
                )}

                {/* Open Ticket */}
                {supportView === "ticket" && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center space-x-2">
                      <Ticket className="w-4 h-4 text-indigo-500" />
                      <h3 className="text-sm font-bold text-slate-900">Buka Tiket Sokongan</h3>
                    </div>
                    {ticketSent ? (
                      <div className="text-center py-8 space-y-3">
                        <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                        <p className="text-sm font-bold text-emerald-700">Tiket berjaya dihantar!</p>
                        <p className="text-xs text-slate-400">Pasukan HQ akan menjawab dalam 1-2 hari bekerja.</p>
                        <button onClick={() => { setTicketSent(false); setTicketSubject(""); setTicketDesc(""); setSupportView("ticket_status"); }}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold cursor-pointer">
                          Semak Status Tiket
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-3">
                          <div>
                            <label className="text-[11px] font-bold text-slate-400 uppercase">Tajuk Masalah</label>
                            <input type="text" value={ticketSubject} onChange={e => setTicketSubject(e.target.value)}
                              placeholder="Cth: Tidak boleh muat naik resit"
                              className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 bg-white" />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-slate-400 uppercase">Penerangan</label>
                            <textarea value={ticketDesc} onChange={e => setTicketDesc(e.target.value)}
                              placeholder="Terangkan masalah anda dengan terperinci..."
                              rows={4}
                              className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 bg-white resize-none" />
                          </div>
                          <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
                            <p className="text-[11px] text-indigo-700 font-semibold">AI akan ringkaskan isu anda sebelum hantar ke pasukan HQ.</p>
                          </div>
                        </div>
                        <button
                          onClick={() => { if (ticketSubject.trim() && ticketDesc.trim()) setTicketSent(true); }}
                          disabled={!ticketSubject.trim() || !ticketDesc.trim()}
                          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white rounded-xl text-sm font-bold transition cursor-pointer">
                          Hantar Tiket
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Ticket Status */}
                {supportView === "ticket_status" && (
                  <div className="space-y-3">
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                      <div className="flex items-center space-x-2 mb-4">
                        <Ticket className="w-4 h-4 text-indigo-500" />
                        <h3 className="text-sm font-bold text-slate-900">Status Tiket Saya</h3>
                      </div>
                      {ticketSent ? (
                        <div className="space-y-3">
                          <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl flex items-start space-x-3">
                            <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-bold text-amber-800">#{Date.now().toString().slice(-6)} — {ticketSubject}</p>
                              <p className="text-[11px] text-amber-600 mt-0.5">Status: Sedang diproses oleh HQ Staff</p>
                              <p className="text-[10px] text-amber-400 mt-1">Dihantar hari ini</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-6">
                          <CheckCircle2 className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                          <p className="text-xs text-slate-400">Tiada tiket aktif</p>
                          <button onClick={() => setSupportView("ticket")} className="mt-3 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold cursor-pointer">
                            Buka Tiket Baru
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ═══ BILLING — Features 2, 3, 4 ═══ */}
            {morePage === "billing" && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-slate-900">Bil & Langganan</h2>

                {/* Current Plan */}
                <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-5 text-white shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-[11px] text-indigo-200">Plan Semasa</p>
                      <p className="text-2xl font-bold">Starter</p>
                    </div>
                    <span className="bg-emerald-400 text-emerald-900 text-[10px] font-bold px-2.5 py-1 rounded-full">Aktif</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div><p className="text-indigo-300">Tarikh Pembaharuan</p><p className="font-semibold">17 Jul 2026</p></div>
                    <div><p className="text-indigo-300">Harga Bulanan</p><p className="font-semibold">RM 99/bulan</p></div>
                  </div>
                </div>

                {/* Plan actions */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Perbaharui", color: "bg-emerald-50 border-emerald-100 text-emerald-700" },
                    { label: "Naik Taraf", color: "bg-indigo-50 border-indigo-100 text-indigo-700" },
                    { label: "Turun Taraf", color: "bg-slate-50 border-slate-200 text-slate-600" },
                  ].map(({ label, color }) => (
                    <button key={label} className={`py-2.5 rounded-xl text-xs font-bold border transition cursor-pointer ${color}`}>{label}</button>
                  ))}
                </div>

                {/* AI Credits — Feature 3 */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Zap className="w-4 h-4 text-amber-500" />
                      <p className="text-sm font-bold text-slate-900">Kredit AI</p>
                    </div>
                    <span className="text-xs text-slate-400">Paket Starter</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Digunakan</span>
                      <span className="font-semibold text-slate-800">47 / 500 kredit</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full" style={{ width: "9.4%" }} />
                    </div>
                    <p className="text-[10px] text-slate-400">453 kredit berbaki</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button className="py-2.5 bg-amber-50 border border-amber-100 text-amber-700 rounded-xl text-xs font-bold cursor-pointer hover:bg-amber-100 transition">Beli Kredit</button>
                    <button className="py-2.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold cursor-pointer hover:bg-slate-100 transition">Lihat Penggunaan</button>
                  </div>
                </div>

                {/* Storage — Feature 4 */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Database className="w-4 h-4 text-blue-500" />
                      <p className="text-sm font-bold text-slate-900">Storan</p>
                    </div>
                    <span className="text-xs text-slate-400">5 GB termasuk</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Digunakan</span>
                      <span className="font-semibold text-slate-800">0.3 GB / 5 GB</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-400 rounded-full" style={{ width: "6%" }} />
                    </div>
                    <p className="text-[10px] text-slate-400">4.7 GB berbaki</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button className="py-2.5 bg-blue-50 border border-blue-100 text-blue-700 rounded-xl text-xs font-bold cursor-pointer hover:bg-blue-100 transition">Beli Storan</button>
                    <button className="py-2.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold cursor-pointer hover:bg-slate-100 transition">Lihat Penggunaan</button>
                  </div>
                </div>

                {/* Invoices */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
                  <p className="text-sm font-bold text-slate-900">Invois & Sejarah Pembayaran</p>
                  <div className="text-center py-4">
                    <Receipt className="w-7 h-7 text-slate-200 mx-auto mb-1" />
                    <p className="text-xs text-slate-400">Tiada invois lagi</p>
                  </div>
                </div>
              </div>
            )}

            {/* ═══ RESOURCE SETTINGS — Feature 5 ═══ */}
            {morePage === "resources" && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-slate-900">Tetapan Sumber</h2>
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-700">Pilihan yang dipaparkan bergantung kepada kebenaran yang ditetapkan oleh HQ.</p>
                </div>

                {/* AI Resource */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                  <div className="flex items-center space-x-2">
                    <Cpu className="w-4 h-4 text-indigo-500" />
                    <p className="text-sm font-bold text-slate-900">Sumber AI</p>
                  </div>
                  {([
                    { id: "mykerani" as const, label: "Guna MYKERANI AI", desc: "AI rasmi MYKERANI — disyorkan" },
                    { id: "own" as const,      label: "Guna AI Sendiri",  desc: "Sambung API AI anda sendiri" },
                  ] as const).map(({ id, label, desc }) => (
                    <button key={id} onClick={() => setResAI(id)}
                      className={`w-full flex items-center space-x-3 p-4 rounded-xl border-2 transition cursor-pointer ${resAI === id ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${resAI === id ? "border-indigo-500 bg-indigo-500" : "border-slate-300"}`}>
                        {resAI === id && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      <div className="text-left">
                        <p className={`text-sm font-semibold ${resAI === id ? "text-indigo-800" : "text-slate-700"}`}>{label}</p>
                        <p className="text-[11px] text-slate-400">{desc}</p>
                      </div>
                    </button>
                  ))}
                  {resAI === "own" && (
                    <input placeholder="Masukkan API Key anda" type="password"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 bg-white font-mono" />
                  )}
                </div>

                {/* Storage Resource */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                  <div className="flex items-center space-x-2">
                    <HardDrive className="w-4 h-4 text-blue-500" />
                    <p className="text-sm font-bold text-slate-900">Sumber Storan</p>
                  </div>
                  {([
                    { id: "mykerani" as const,  label: "Guna Storan MYKERANI", desc: "Storan selamat MYKERANI" },
                    { id: "gdrive" as const,    label: "Google Drive",          desc: "Sambung akaun Google Drive anda" },
                    { id: "onedrive" as const,  label: "OneDrive",              desc: "Sambung akaun Microsoft OneDrive" },
                    { id: "dropbox" as const,   label: "Dropbox",               desc: "Sambung akaun Dropbox anda" },
                  ] as const).map(({ id, label, desc }) => (
                    <button key={id} onClick={() => setResStorage(id)}
                      className={`w-full flex items-center space-x-3 p-3.5 rounded-xl border-2 transition cursor-pointer ${resStorage === id ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${resStorage === id ? "border-indigo-500 bg-indigo-500" : "border-slate-300"}`}>
                        {resStorage === id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <div className="text-left">
                        <p className={`text-xs font-semibold ${resStorage === id ? "text-indigo-800" : "text-slate-700"}`}>{label}</p>
                        <p className="text-[10px] text-slate-400">{desc}</p>
                      </div>
                    </button>
                  ))}
                  {resStorage !== "mykerani" && (
                    <button className="w-full flex items-center justify-center space-x-2 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-slate-800 transition">
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Sambung {resStorage === "gdrive" ? "Google Drive" : resStorage === "onedrive" ? "OneDrive" : "Dropbox"}</span>
                    </button>
                  )}
                </div>

                <button className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-sm font-bold transition cursor-pointer">
                  Simpan Tetapan Sumber
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── BOTTOM NAV ── */}
      <nav className="bg-white border-t border-slate-200 flex items-center justify-around px-2 py-1.5 shrink-0 z-40" id="owner_bottom_nav">
        {([
          { id: "home" as MainTab,      label: "Home",      icon: Home },
          { id: "dashboard" as MainTab, label: "Dashboard", icon: LayoutDashboard },
          { id: "documents" as MainTab, label: "Dokumen",   icon: FileText },
          { id: "reports" as MainTab,   label: "Laporan",   icon: BarChart3 },
          { id: "more" as MainTab,      label: "Lagi",      icon: MoreHorizontal },
        ]).map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button key={id} onClick={() => { setActiveTab(id); if (id === "more") setMorePage("menu"); }}
              className={`flex flex-col items-center py-1.5 px-3 rounded-xl transition cursor-pointer ${active ? "text-indigo-600" : "text-slate-400"}`}>
              <Icon className={`w-5 h-5 ${active ? "text-indigo-600" : ""}`} />
              <span className={`text-[10px] font-bold mt-0.5 ${active ? "text-indigo-600" : ""}`}>{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Quick Add Modals */}
      {quickAdd && <QuickAddModal type={quickAdd} onClose={() => setQuickAdd(null)} onSave={handleSaveRecord} />}
    </div>
  );
}
