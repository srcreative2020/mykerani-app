import React, { useState, useRef, useEffect, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { useFinancials } from "../context/FinancialRecordsContext";
import { useTenant } from "../context/TenantContext";
import {
  Home, Plus, Upload, Search, Bell, User as UserIcon,
  Send, Brain, RefreshCw, Receipt, FileSpreadsheet, Landmark,
  TrendingUp, TrendingDown, Clock, ChevronRight, X,
  CheckCircle2, LogOut, ClipboardList, HelpCircle,
  MessageCircle, BookOpen, Ticket,
} from "lucide-react";

type StaffTab = "home" | "tambah" | "muat_naik" | "rekod" | "notifikasi" | "profil";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Selamat Pagi";
  if (h < 17) return "Selamat Tengah Hari";
  if (h < 20) return "Selamat Petang";
  return "Selamat Malam";
}

// â"€â"€ Quick Add Form (inline) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function AddRecordForm({
  defaultType,
  onSave,
  onDone,
}: {
  defaultType: "INCOME" | "EXPENSE";
  onSave: (d: { type: string; amount: number; description: string; party: string; date: string }) => void;
  onDone: () => void;
}) {
  const [type, setType] = useState<"INCOME" | "EXPENSE">(defaultType);
  const [amount, setAmount] = useState("");
  const [party, setParty] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [saved, setSaved] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount) return;
    onSave({ type, amount: parseFloat(amount), description, party, date });
    setSaved(true);
    setAmount(""); setParty(""); setDescription("");
    setTimeout(() => { setSaved(false); onDone(); }, 1500);
  };

  if (saved) return (
    <div className="flex flex-col items-center justify-center py-12 space-y-3">
      <CheckCircle2 className="w-12 h-12 text-emerald-500" />
      <p className="text-sm font-bold text-emerald-700">Rekod berjaya disimpan!</p>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Type toggle */}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setType("EXPENSE")}
          className={`py-3 rounded-2xl text-sm font-bold transition cursor-pointer ${type === "EXPENSE" ? "bg-rose-500 text-white shadow" : "bg-slate-100 text-slate-500"}`}>
          Perbelanjaan
        </button>
        <button type="button" onClick={() => setType("INCOME")}
          className={`py-3 rounded-2xl text-sm font-bold transition cursor-pointer ${type === "INCOME" ? "bg-emerald-500 text-white shadow" : "bg-slate-100 text-slate-500"}`}>
          Pendapatan
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Jumlah (RM)</label>
          <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="0.00" required
            className="w-full mt-1 border border-slate-200 rounded-xl px-4 py-3 text-xl font-bold focus:outline-none focus:border-indigo-400 bg-white" />
        </div>
        <div>
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {type === "INCOME" ? "Daripada (Pelanggan)" : "Kepada (Pembekal)"}
          </label>
          <input type="text" value={party} onChange={e => setParty(e.target.value)}
            placeholder={type === "INCOME" ? "Nama pelanggan" : "Nama pembekal"}
            className="w-full mt-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 bg-white" />
        </div>
        <div>
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Penerangan</label>
          <input type="text" value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Cth: Bayar minyak, Terima deposit..."
            className="w-full mt-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 bg-white" />
        </div>
        <div>
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tarikh</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full mt-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 bg-white" />
        </div>
      </div>

      <button type="submit"
        className={`w-full py-3.5 rounded-2xl text-sm font-bold text-white shadow-sm transition cursor-pointer ${type === "INCOME" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-rose-500 hover:bg-rose-600"}`}>
        Simpan Rekod
      </button>
    </form>
  );
}

// â"€â"€â"€ Main Component â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
export function StaffHomeScreen() {
  const { user, signOut } = useAuth();
  const { activeWorkspace, workspaces, selectWorkspace } = useWorkspace();
  const { financialEvents, addFinancialEvent } = useFinancials();
  const { activeTenant } = useTenant();

  const [activeTab, setActiveTab] = useState<StaffTab>("home");
  const [addDefaultType, setAddDefaultType] = useState<"INCOME" | "EXPENSE">("EXPENSE");

  // â"€â"€ AI Chat â"€â"€
  const [chatMessages, setChatMessages] = useState<{ id: string; sender: "user" | "ai"; text: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // â"€â"€ Support Center â"€â"€
  const [showSupport, setShowSupport] = useState(false);
  const [supportView, setSupportView] = useState<"chat" | "faq" | "ticket">("chat");
  const [supportMessages, setSupportMessages] = useState<{ id: string; sender: "user" | "ai"; text: string }[]>([]);
  const [supportInput, setSupportInput] = useState("");
  const [supportLoading, setSupportLoading] = useState(false);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketDesc, setTicketDesc] = useState("");
  const [ticketSent, setTicketSent] = useState(false);
  const supportEndRef = useRef<HTMLDivElement>(null);

  const wsId = activeWorkspace?.id || "";
  const firstName = user?.fullName?.split(" ")[0] || "Anda";
  const greeting = getGreeting();
  const today = new Date().toLocaleDateString("ms-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const myRecords = useMemo(() =>
    financialEvents.filter(e => e.workspaceId === wsId).slice().reverse(),
    [financialEvents, wsId]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages, chatLoading]);
  useEffect(() => { supportEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [supportMessages, supportLoading]);

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
        body: JSON.stringify({ query: `[SOKONGAN MYKERANI] ${q}`, financialContext: { activeTenant, activeWorkspace, financialEvents }, userId: user?.id }),
      });
      const data = await res.json() as any;
      setSupportMessages(prev => [...prev, { id: `a-${Date.now()}`, sender: "ai", text: data.text || data.error || "Saya sedang menyemak soalan anda." }]);
    } catch {
      setSupportMessages(prev => [...prev, { id: `e-${Date.now()}`, sender: "ai", text: "Maaf, sambungan terputus. Cuba lagi atau buka tiket sokongan." }]);
    } finally {
      setSupportLoading(false);
    }
  };

  const sendChat = async (text?: string) => {
    const q = (text || chatInput).trim();
    if (!q || chatLoading) return;
    setChatInput("");
    setChatMessages(prev => [...prev, { id: `u-${Date.now()}`, sender: "user", text: q }]);
    setChatLoading(true);
    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q,
          financialContext: { activeTenant, activeWorkspace, financialEvents },
          userId: user?.id,
        }),
      });
      const data = await res.json() as any;
      if (res.status === 403) {
        setChatMessages(prev => [...prev, { id: `a-${Date.now()}`, sender: "ai", text: data.error || "Akaun anda telah disekat." }]);
        setChatLoading(false);
        return;
      }
      let reply = data.text || "Saya sedang cuba membantu anda.";
      reply = reply.replace(/tenant/gi, "syarikat").replace(/sandbox/gi, "ujian");
      setChatMessages(prev => [...prev, { id: `a-${Date.now()}`, sender: "ai", text: reply }]);
    } catch {
      setChatMessages(prev => [...prev, { id: `e-${Date.now()}`, sender: "ai", text: "Minta maaf, sambungan terputus. Sila cuba lagi." }]);
    } finally {
      setChatLoading(false);
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
      referenceNumber: `TXN-STAFF-${Date.now().toString().slice(-6)}`,
      description: data.description,
      isCompleted: false,
    });
  };

  const QUICK_PROMPTS = [
    { label: "Rekod hari ini", q: "Apakah rekod yang telah dimasukkan hari ini?" },
    { label: "Tambah perbelanjaan", action: () => { setAddDefaultType("EXPENSE"); setActiveTab("tambah"); } },
    { label: "Tambah pendapatan", action: () => { setAddDefaultType("INCOME"); setActiveTab("tambah"); } },
    { label: "Muat naik resit", action: () => setActiveTab("muat_naik") },
  ];

  return (
    <div className="h-screen flex flex-col overflow-hidden" id="staff_root" style={{background:"#F4F8F5"}}>
      <style>{`
        #staff_root .bg-emerald-700{background-color:#5A9E7A!important}
        #staff_root .bg-emerald-800{background-color:#3D7057!important}
        #staff_root .bg-emerald-600{background-color:#6AAD8A!important}
        #staff_root .bg-emerald-50{background-color:#DFF0E8!important}
        #staff_root .bg-emerald-100{background-color:#CCE8D9!important}
        #staff_root .text-emerald-700{color:#2C5040!important}
        #staff_root .text-emerald-800{color:#1A3D2B!important}
        #staff_root .text-emerald-600{color:#3D7057!important}
        #staff_root .text-emerald-900{color:#122B1E!important}
        #staff_root .text-emerald-500{color:#5A9E7A!important}
        #staff_root .border-emerald-100{border-color:#CCE8D9!important}
        #staff_root .border-emerald-200{border-color:#B3D9C5!important}
        #staff_root .hover\\:bg-emerald-800:hover{background-color:#3D7057!important}
        #staff_root .hover\\:bg-emerald-100:hover{background-color:#CCE8D9!important}
        #staff_root .focus\\:border-emerald-400:focus{border-color:#7DC4A5!important}
        #staff_root .from-emerald-600{--tw-gradient-from:#5A9E7A!important}
        #staff_root .to-emerald-800{--tw-gradient-to:#3D7057!important}
      `}</style>

      {/* â"€â"€ HEADER â"€â"€ */}
      <header className="bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between shrink-0" id="staff_header">
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
            <div className="w-5 h-5 rounded-full bg-slate-700 text-white flex items-center justify-center text-[9px] font-bold">
              {firstName.charAt(0).toUpperCase()}
            </div>
            <span className="text-[11px] font-semibold text-slate-700 hidden sm:block">{firstName}</span>
            <span className="text-[10px] text-slate-400 hidden sm:block">·</span>
            <span className="text-[10px] text-slate-500 font-semibold hidden sm:block">Kakitangan</span>
          </div>
          <button onClick={() => signOut()}
            className="p-1.5 bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-400 hover:text-rose-500 rounded-xl transition cursor-pointer">
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* â"€â"€ MAIN â"€â"€ */}
      <div className="flex-1 overflow-hidden flex flex-col" id="staff_main">

        {/* â•â•â•â• HOME â€" AI CONVERSATION â•â•â•â• */}
        {activeTab === "home" && (
          <div className="flex-1 flex flex-col overflow-hidden" id="staff_home_pane">

            {/* Conversation area */}
            <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2 space-y-4" id="staff_chat_area">

              {/* Welcome â€" shown only if no messages */}
              {chatMessages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 space-y-2 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center shadow-lg mb-1">
                    <Brain className="w-7 h-7 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">{greeting}, {firstName}</h2>
                  <p className="text-sm text-slate-500 max-w-xs">Apa yang berlaku hari ini?</p>
                  <p className="text-[11px] text-slate-400">{today}</p>
                </div>
              )}

              {/* Chat messages */}
              {chatMessages.map(msg => {
                const isUser = msg.sender === "user";
                return (
                  <div key={msg.id} className={`flex items-start gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
                    <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${isUser ? "bg-slate-700 text-white" : "bg-slate-900 text-white"}`}>
                      {isUser ? <UserIcon className="w-3.5 h-3.5" /> : <Brain className="w-3.5 h-3.5" />}
                    </div>
                    <div className={`max-w-[78%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${isUser ? "bg-slate-700 text-white rounded-tr-none" : "bg-white border border-slate-200 text-slate-800 rounded-tl-none whitespace-pre-wrap shadow-sm"}`}>
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
                    MYKERANI sedang menyemak...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Quick prompts â€" shown only if no messages */}
            {chatMessages.length === 0 && (
              <div className="px-4 pb-2 flex flex-wrap gap-2">
                {QUICK_PROMPTS.map(({ label, q, action }) => (
                  <button key={label}
                    onClick={() => action ? action() : sendChat(q)}
                    className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:border-slate-400 transition cursor-pointer shadow-sm">
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Upload shortcuts */}
            <div className="px-4 pb-2 flex gap-2">
              {[
                { label: "Resit" },
                { label: "Invois" },
                { label: "Penyata" },
              ].map(({ label }) => (
                <button key={label} onClick={() => setActiveTab("muat_naik")}
                  className="flex-1 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:border-slate-400 hover:bg-slate-50 transition cursor-pointer shadow-sm">
                  {label}
                </button>
              ))}
            </div>

            {/* Chat input */}
            <div className="px-4 pb-4 shrink-0">
              <form onSubmit={e => { e.preventDefault(); sendChat(); }}
                className="flex items-center gap-2 bg-white border border-slate-300 rounded-2xl px-4 py-3 shadow-sm focus-within:border-slate-500 transition">
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder="Taip di sini... Cth: Saya bayar minyak RM80"
                  className="flex-1 text-sm outline-none text-slate-800 placeholder-slate-400 bg-transparent"
                />
                <button type="submit" disabled={!chatInput.trim() || chatLoading}
                  className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center disabled:bg-slate-200 transition cursor-pointer shrink-0">
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>

              {/* Quick actions below input */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={() => { setAddDefaultType("EXPENSE"); setActiveTab("tambah"); }}
                  className="py-2 rounded-xl text-xs font-bold bg-rose-50 border border-rose-100 text-rose-600 transition cursor-pointer hover:bg-rose-100">
                  - Rekod Perbelanjaan
                </button>
                <button onClick={() => { setAddDefaultType("INCOME"); setActiveTab("tambah"); }}
                  className="py-2 rounded-xl text-xs font-bold bg-emerald-50 border border-emerald-100 text-emerald-600 transition cursor-pointer hover:bg-emerald-100">
                  + Rekod Pendapatan
                </button>
              </div>
            </div>
          </div>
        )}

        {/* â•â•â•â• TAMBAH REKOD â•â•â•â• */}
        {activeTab === "tambah" && (
          <div className="flex-1 overflow-y-auto p-4 pb-24 max-w-lg mx-auto w-full" id="staff_add_pane">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Tambah Rekod</h2>
            {!activeWorkspace ? (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
                <p className="text-sm font-semibold text-amber-800">Sila pilih syarikat dahulu</p>
              </div>
            ) : (
              <AddRecordForm
                defaultType={addDefaultType}
                onSave={handleSaveRecord}
                onDone={() => setActiveTab("home")}
              />
            )}
          </div>
        )}

        {/* â•â•â•â• MUAT NAIK â•â•â•â• */}
        {activeTab === "muat_naik" && (
          <div className="flex-1 overflow-y-auto p-4 pb-24 max-w-lg mx-auto w-full space-y-4" id="staff_upload_pane">
            <h2 className="text-lg font-bold text-slate-900">Muat Naik Dokumen</h2>

            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4 shadow-sm">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto">
                <Upload className="w-7 h-7 text-slate-500" />
              </div>
              <div>
                <p className="font-semibold text-slate-800">Muat Naik Dokumen</p>
                <p className="text-xs text-slate-400 mt-1">Foto atau fail PDF resit, invois & penyata</p>
              </div>
              <label className="block cursor-pointer">
                <span className="inline-block px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition shadow cursor-pointer">
                  Pilih Fail
                </span>
                <input type="file" accept="image/*,.pdf" className="hidden" />
              </label>
              <p className="text-[10px] text-slate-300">JPG, PNG atau PDF · Maks 10MB</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Resit", icon: Receipt, bg: "bg-amber-50 text-amber-500 border-amber-100" },
                { label: "Invois", icon: FileSpreadsheet, bg: "bg-blue-50 text-blue-500 border-blue-100" },
                { label: "Penyata", icon: Landmark, bg: "bg-violet-50 text-violet-500 border-violet-100" },
              ].map(({ label, icon: Icon, bg }) => (
                <button key={label} className={`flex flex-col items-center space-y-2 p-4 bg-white border ${bg} rounded-2xl shadow-sm cursor-pointer hover:shadow-md transition`}>
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${bg}`}>
                    <Icon className="w-4.5 h-4.5" />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-700">{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* â•â•â•â• REKOD â•â•â•â• */}
        {activeTab === "rekod" && (
          <div className="flex-1 overflow-y-auto p-4 pb-24 max-w-lg mx-auto w-full space-y-3" id="staff_records_pane">
            <h2 className="text-lg font-bold text-slate-900">Rekod Saya</h2>
            {myRecords.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center shadow-sm space-y-3">
                <ClipboardList className="w-10 h-10 text-slate-200 mx-auto" />
                <p className="text-sm text-slate-400">Tiada rekod lagi</p>
                <button onClick={() => setActiveTab("tambah")}
                  className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-slate-800">
                  Tambah Rekod Pertama
                </button>
              </div>
            ) : myRecords.map(rec => (
              <div key={rec.id} className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-sm">
                <div className="flex items-center space-x-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${rec.type === "INCOME" ? "bg-emerald-50" : "bg-rose-50"}`}>
                    {rec.type === "INCOME"
                      ? <TrendingUp className="w-4 h-4 text-emerald-500" />
                      : <TrendingDown className="w-4 h-4 text-rose-500" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 truncate max-w-[170px]">{rec.partyName || rec.categoryName}</p>
                    <p className="text-[11px] text-slate-400">{rec.date}</p>
                  </div>
                </div>
                <span className={`text-sm font-bold ${rec.type === "INCOME" ? "text-emerald-600" : "text-rose-500"}`}>
                  {rec.type === "INCOME" ? "+" : "-"}RM {rec.amountMyr.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* â•â•â•â• NOTIFIKASI â•â•â•â• */}
        {activeTab === "notifikasi" && (
          <div className="flex-1 overflow-y-auto p-4 pb-24 max-w-lg mx-auto w-full space-y-4" id="staff_notif_pane">
            <h2 className="text-lg font-bold text-slate-900">Notifikasi</h2>
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center shadow-sm">
              <Bell className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-400">Tiada notifikasi baru</p>
            </div>
          </div>
        )}

        {/* â•â•â•â• PROFIL â•â•â•â• */}
        {activeTab === "profil" && (
          <div className="flex-1 overflow-y-auto p-4 pb-24 max-w-lg mx-auto w-full space-y-4" id="staff_profile_pane">
            <h2 className="text-lg font-bold text-slate-900">Profil Saya</h2>
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-sm">
              <div className="flex items-center space-x-4">
                <div className="w-14 h-14 rounded-2xl bg-slate-800 text-white flex items-center justify-center text-2xl font-bold shadow">
                  {firstName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-slate-900">{user?.fullName || "Kakitangan"}</p>
                  <p className="text-xs text-slate-500">{user?.email}</p>
                  <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-full mt-1 inline-block">Kakitangan Syarikat</span>
                </div>
              </div>
              {activeWorkspace && (
                <div className="border-t border-slate-100 pt-4 space-y-2">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Syarikat Aktif</p>
                  <p className="text-sm font-semibold text-slate-800">{activeWorkspace.name}</p>
                </div>
              )}
              <div className="border-t border-slate-100 pt-4 text-[11px] text-slate-400 space-y-1">
                <p>Anda log masuk sebagai <span className="font-semibold text-slate-600">TENANT_STAFF</span></p>
                <p>Untuk tukar tetapan syarikat, hubungi Pemilik.</p>
              </div>

              {/* Support Center button */}
              <button onClick={() => setShowSupport(true)}
                className="w-full py-3 border border-indigo-200 text-indigo-600 rounded-xl text-sm font-semibold hover:bg-indigo-50 transition cursor-pointer flex items-center justify-center space-x-2">
                <HelpCircle className="w-4 h-4" /><span>Pusat Sokongan</span>
              </button>

              <button onClick={() => signOut()}
                className="w-full py-3 border border-rose-200 text-rose-500 rounded-xl text-sm font-semibold hover:bg-rose-50 transition cursor-pointer">
                Log Keluar
              </button>
            </div>
          </div>
        )}

        {/* Support Center Modal */}
        {showSupport && (
          <div className="fixed inset-0 z-50 flex flex-col bg-slate-50">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <HelpCircle className="w-5 h-5 text-indigo-500" />
                <h2 className="font-bold text-slate-900 text-base">Pusat Sokongan</h2>
              </div>
              <button onClick={() => setShowSupport(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {/* Sub-nav */}
            <div className="bg-white border-b border-slate-100 px-4 py-2 flex gap-2">
              {([
                { id: "chat" as const,   label: "Tanya AI",   icon: MessageCircle },
                { id: "faq" as const,    label: "FAQ",         icon: BookOpen },
                { id: "ticket" as const, label: "Buka Tiket",  icon: Ticket },
              ]).map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setSupportView(id)}
                  className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${supportView === id ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                  <Icon className="w-3.5 h-3.5" /><span>{label}</span>
                </button>
              ))}
            </div>

            {/* AI Chat */}
            {supportView === "chat" && (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {supportMessages.length === 0 && (
                    <div className="text-center py-8 space-y-3">
                      <Brain className="w-10 h-10 text-slate-200 mx-auto" />
                      <p className="text-xs text-slate-400">Tanya apa sahaja tentang cara guna MYKERANI</p>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {["Cara muat naik resit?", "Cara rekod perbelanjaan?", "Cara cari rekod?", "Cara lampir dokumen?"].map(q => (
                          <button key={q} onClick={() => sendSupport(q)}
                            className="px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-xl text-xs text-indigo-700 font-semibold cursor-pointer">
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
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${isUser ? "bg-slate-700 text-white" : "bg-slate-900 text-white"}`}>
                          {isUser ? <UserIcon className="w-3 h-3" /> : <Brain className="w-3 h-3" />}
                        </div>
                        <div className={`max-w-[80%] px-3 py-2 rounded-xl text-xs leading-relaxed ${isUser ? "bg-slate-700 text-white rounded-tr-none" : "bg-white border border-slate-200 text-slate-800 rounded-tl-none whitespace-pre-wrap"}`}>
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
                      <div className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-400 animate-pulse">Mencari jawapan...</div>
                    </div>
                  )}
                  <div ref={supportEndRef} />
                </div>
                <div className="p-4 border-t border-slate-200 bg-white">
                  <form onSubmit={e => { e.preventDefault(); sendSupport(); }} className="flex gap-2">
                    <input type="text" value={supportInput} onChange={e => setSupportInput(e.target.value)}
                      placeholder="Tanya soalan tentang MYKERANI..."
                      className="flex-1 text-xs border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-slate-400 bg-white" />
                    <button type="submit" disabled={!supportInput.trim() || supportLoading}
                      className="px-3 py-2 bg-slate-900 text-white rounded-xl disabled:bg-slate-200 cursor-pointer transition">
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>
                  <button onClick={() => setSupportView("ticket")} className="mt-2 w-full text-center text-[11px] text-slate-400 hover:text-indigo-600 cursor-pointer">
                    Masalah tidak selesai? Buka tiket â†'
                  </button>
                </div>
              </div>
            )}

            {/* FAQ */}
            {supportView === "faq" && (
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {[
                  { q: "Bagaimana cara muat naik resit?", a: "Klik tab 'Muat Naik' di bawah â†' pilih 'Resit' â†' ambil gambar atau pilih fail." },
                  { q: "Bagaimana cara rekod perbelanjaan?", a: "Klik tab 'Tambah' â†' pilih 'Perbelanjaan' â†' isi jumlah dan butiran." },
                  { q: "Bagaimana cara lihat rekod lama?", a: "Klik tab 'Rekod' untuk lihat semua rekod yang telah dimasukkan." },
                  { q: "Boleh saya padam rekod?", a: "Rekod tidak boleh dipadam oleh kakitangan. Hubungi Pemilik Syarikat untuk bantuan." },
                  { q: "Apa yang boleh saya lakukan di MYKERANI?", a: "Anda boleh rekod transaksi, muat naik dokumen, cari rekod, dan tanya soalan kepada AI MYKERANI." },
                ].map(({ q, a }) => (
                  <details key={q} className="bg-white border border-slate-200 rounded-xl group">
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
              <div className="flex-1 overflow-y-auto p-4">
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
                    </div>
                  ) : (
                    <>
                      <input type="text" value={ticketSubject} onChange={e => setTicketSubject(e.target.value)}
                        placeholder="Tajuk masalah"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 bg-white" />
                      <textarea value={ticketDesc} onChange={e => setTicketDesc(e.target.value)}
                        placeholder="Terangkan masalah anda..." rows={4}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 bg-white resize-none" />
                      <button
                        onClick={() => { if (ticketSubject.trim() && ticketDesc.trim()) setTicketSent(true); }}
                        disabled={!ticketSubject.trim() || !ticketDesc.trim()}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white rounded-xl text-sm font-bold transition cursor-pointer">
                        Hantar Tiket
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* â"€â"€ BOTTOM NAV â"€â"€ */}
      <nav className="bg-white border-t border-slate-200 flex items-center justify-around px-2 py-1.5 shrink-0 z-40" id="staff_bottom_nav">
        {([
          { id: "home" as StaffTab,        label: "Home",     icon: Home },
          { id: "tambah" as StaffTab,      label: "Tambah",   icon: Plus },
          { id: "muat_naik" as StaffTab,   label: "Muat Naik",icon: Upload },
          { id: "rekod" as StaffTab,       label: "Rekod",    icon: ClipboardList },
          { id: "notifikasi" as StaffTab,  label: "Notif",    icon: Bell },
          { id: "profil" as StaffTab,      label: "Profil",   icon: UserIcon },
        ]).map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex flex-col items-center py-1.5 px-2 rounded-xl transition cursor-pointer ${active ? "text-slate-900" : "text-slate-400"}`}>
              <Icon className={`w-5 h-5 ${active ? "text-slate-900" : ""}`} />
              <span className={`text-[9px] font-bold mt-0.5 ${active ? "text-slate-900" : ""}`}>{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

