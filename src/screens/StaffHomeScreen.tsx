import React, { useState, useRef, useEffect, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { useFinancials } from "../context/FinancialRecordsContext";
import { useTenant } from "../context/TenantContext";
import { loadChatHistory, saveChatMessage } from "../lib/chatHistory";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { isDemoWorkspace } from "../lib/seeder";
import { uploadDocument, getDocumentUrl } from "../lib/documentStorage";
import {
  loadPersonalProfile, loadBusinessProfile, loadVehicles, loadDependents, loadBusinesses,
  EMPTY_PERSONAL_PROFILE, EMPTY_BUSINESS_PROFILE, type Vehicle, type Dependent, type Business,
} from "../lib/profileData";
import { addAssetPurchase, addOwnerTransaction } from "../lib/assetOwnerData";
import {
  Home, Plus, Upload, Search, Bell, User as UserIcon,
  Send, Brain, RefreshCw, Receipt, FileSpreadsheet, Landmark,
  TrendingUp, TrendingDown, Clock, ChevronRight, X,
  CheckCircle2, LogOut, ClipboardList, HelpCircle,
  MessageCircle, BookOpen, Ticket, Edit3,
  Paperclip, Mic, Square, File as FileIcon,
} from "lucide-react";

type StaffTab = "home" | "tambah" | "muat_naik" | "rekod" | "notifikasi" | "profil";

interface ChatSuggestion {
  id: string;
  title: string;
  description: string;
  actionType: string;
  payload: {
    transactionType?: "INCOME" | "EXPENSE" | "DEBT" | "RECEIVABLE" | "PAYABLE" | "COMMITMENT" | "ASSET_PURCHASE" | "OWNER_TRANSACTION";
    category?: string;
    amount?: number;
    date?: string;
    relatedParty?: string;
    confidenceScore?: number;
    ownerTransactionSubtype?: "CAPITAL_INJECTION" | "DRAWING";
  };
  businessId?: string | null;
  businessName?: string;
  businessPicked?: boolean;
  evidenceStatus?: "NONE" | "ATTACHED" | "SKIPPED";
  evidenceFileName?: string;
  accountingRecommendation?: string;
  accountingLevel1Group?: string;
  accountingReason?: string;
  financialStatementImpact?: string;
  accountingRiskLevel?: "LOW" | "MEDIUM" | "HIGH";
  accountingExplanationText?: string;
  accountingMatchStatus?: "MATCH" | "POSSIBLE_MISMATCH" | "HIGH_RISK_MISMATCH";
  accountingConfidence?: number;
}
type ChatSuggestionRecordType = "INCOME" | "EXPENSE" | "RECEIVABLE" | "PAYABLE" | "DEBT" | "COMMITMENT";
type ChatSuggestionStatusValue = "pending" | "confirmed" | "rejected";
interface ChatSuggestionStatus {
  status: ChatSuggestionStatusValue;
  recordId?: string;
  recordType?: ChatSuggestionRecordType;
  confirmedAt?: string;
  confirmedByName?: string;
  confirmedByUserId?: string;
  editedAmount?: number;
  editedCategory?: string;
  editedRelatedParty?: string;
  editedDate?: string;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Selamat Pagi";
  if (h < 17) return "Selamat Tengah Hari";
  if (h < 20) return "Selamat Petang";
  return "Selamat Malam";
}

const TRANSACTION_TYPE_LABEL_MS: Record<string, string> = {
  INCOME: "Pendapatan",
  EXPENSE: "Perbelanjaan",
  DEBT: "Hutang",
  RECEIVABLE: "Belum Terima",
  PAYABLE: "Belum Bayar",
  COMMITMENT: "Komitmen",
  ASSET_PURCHASE: "Belian Aset",
  OWNER_TRANSACTION: "Transaksi Pemilik",
};

// â"€â"€ Quick Add Form (inline) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function AddRecordForm({
  defaultType,
  onSave,
  onDone,
}: {
  defaultType: "INCOME" | "EXPENSE";
  onSave: (d: { type: string; amount: number; description: string; party: string; date: string; category: string }) => void;
  onDone: () => void;
}) {
  const [type, setType] = useState<"INCOME" | "EXPENSE">(defaultType);
  const [amount, setAmount] = useState("");
  const [party, setParty] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [saved, setSaved] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount) return;
    onSave({ type, amount: parseFloat(amount), description, party, date, category });
    setSaved(true);
    setAmount(""); setParty(""); setCategory(""); setDescription("");
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
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Kategori</label>
          <input type="text" value={category} onChange={e => setCategory(e.target.value)}
            placeholder="Cth: Sewa, Minyak, Jualan Produk"
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
  const { user, signOut, isMockUser } = useAuth();
  const { activeWorkspace, workspaces, selectWorkspace } = useWorkspace();
  const { financialEvents, addFinancialEvent, editFinancialEvent, addDebtRecord, editDebtRecord, addFinancialCommitment, editFinancialCommitment, learnOcrPattern } = useFinancials();
  const { activeTenant } = useTenant();

  const [activeTab, setActiveTab] = useState<StaffTab>("home");
  const [addDefaultType, setAddDefaultType] = useState<"INCOME" | "EXPENSE">("EXPENSE");

  // â"€â"€ AI Chat â"€â"€
  const [chatMessages, setChatMessages] = useState<{ id: string; sender: "user" | "ai"; text: string; suggestions?: ChatSuggestion[]; createdAt?: string; attachmentUrl?: string; attachmentName?: string; attachmentType?: "image" | "pdf" | "audio" }[]>([]);
  // Full conversation history (all dates) — kept separate from chatMessages so the
  // active home thread can always start fresh on login/refresh while Arkib Perbualan
  // still has access to everything that was ever said.
  const [chatHistoryAll, setChatHistoryAll] = useState<typeof chatMessages>([]);
  const [showChatArchive, setShowChatArchive] = useState(false);
  const [showProfileView, setShowProfileView] = useState(false);
  const [chatArchiveDate, setChatArchiveDate] = useState<string | null>(null);
  const [chatArchiveYear, setChatArchiveYear] = useState<string | null>(null);
  const [chatArchiveMonth, setChatArchiveMonth] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  // Persisted (localStorage) so a confirmed/rejected suggestion is not re-actioned (and
  // duplicate-inserted) after a page refresh, remount, or chat history reload.
  const chatSuggestionStatusKey = (wsId: string) => `mykerani_chat_suggestion_status_${wsId}`;
  const [chatSuggestionStatus, setChatSuggestionStatus] = useState<Record<string, ChatSuggestionStatus>>({});
  // Tracks which already-confirmed suggestions have had their saved record edited at least
  // once, purely to switch the status line wording to "Dikemaskini." — not persisted, ephemeral UI only.
  const [chatSuggestionJustUpdated, setChatSuggestionJustUpdated] = useState<Record<string, boolean>>({});
  const [editingChatSuggestionId, setEditingChatSuggestionId] = useState<string | null>(null);
  const [chatEditDraft, setChatEditDraft] = useState({ amount: "", category: "", relatedParty: "", date: "" });
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  // Per-suggestion business pick + evidence step, layered on top of the AI suggestion before final Sahkan.
  const [chatSuggestionExtra, setChatSuggestionExtra] = useState<Record<string, { businessId: string | null; businessName: string; businessPicked: boolean; evidenceStatus: "NONE" | "ATTACHED" | "SKIPPED" }>>({});
  // Accounting Knowledge Base V1: per-suggestion dismissal of the "Cadangan Semakan" review banner.
  const [accountingBannerDismissed, setAccountingBannerDismissed] = useState<Record<string, boolean>>({});
  const chatEvidenceFilesRef = useRef<Record<string, File>>({});
  const chatEvidenceInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [chatAttaching, setChatAttaching] = useState(false);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const [chatRecording, setChatRecording] = useState(false);
  const chatMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chatRecordedChunksRef = useRef<Blob[]>([]);

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

  const [txnFilterFrom, setTxnFilterFrom] = useState("");
  const [txnFilterTo, setTxnFilterTo] = useState("");
  const [editingTxnId, setEditingTxnId] = useState<string | null>(null);
  const [editTxnDraft, setEditTxnDraft] = useState({ amountMyr: "", categoryName: "", partyName: "", date: "" });
  const startEditTxn = (ev: { id: string; amountMyr: number; categoryName: string; partyName: string; date: string }) => {
    setEditingTxnId(ev.id);
    setEditTxnDraft({ amountMyr: String(ev.amountMyr), categoryName: ev.categoryName, partyName: ev.partyName, date: ev.date });
  };
  const saveEditTxn = () => {
    if (!editingTxnId) return;
    const editedEvent = financialEvents.find(e => e.id === editingTxnId);
    editFinancialEvent(editingTxnId, {
      amountMyr: Number(editTxnDraft.amountMyr) || 0,
      categoryName: editTxnDraft.categoryName,
      partyName: editTxnDraft.partyName,
      date: editTxnDraft.date,
    });
    if (editedEvent && editTxnDraft.partyName.trim() && (editTxnDraft.categoryName !== editedEvent.categoryName || editTxnDraft.partyName !== editedEvent.partyName)) {
      learnOcrPattern({
        workspaceId: editedEvent.workspaceId,
        vendorName: editTxnDraft.partyName.trim(),
        category: editTxnDraft.categoryName,
        recordType: editedEvent.type,
        confidenceScore: 0.95,
      });
    }
    setEditingTxnId(null);
  };
  const myRecords = useMemo(() =>
    financialEvents.filter(e => e.workspaceId === wsId).slice().reverse(),
    [financialEvents, wsId]);
  const filteredRecords = useMemo(
    () => myRecords.filter(r => (!txnFilterFrom || r.date >= txnFilterFrom) && (!txnFilterTo || r.date <= txnFilterTo)),
    [myRecords, txnFilterFrom, txnFilterTo]
  );

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages, chatLoading]);

  useEffect(() => {
    if (!wsId) return;
    // Every login/page-load starts on a fresh chat home view — previous
    // conversations (today's or older) stay reachable via Arkib Perbualan
    // instead of auto-resuming and silently replacing whatever the user
    // was just typing into a "Chat Baharu".
    setChatMessages([]);
    loadChatHistory(wsId, isMockUser).then(history => {
      setChatHistoryAll(history.map(h => ({ id: h.id, sender: h.sender, text: h.text, suggestions: h.suggestions, createdAt: h.createdAt, attachmentUrl: h.attachmentUrl, attachmentName: h.attachmentName, attachmentType: h.attachmentType })));
    });
    try {
      const stored = localStorage.getItem(chatSuggestionStatusKey(wsId));
      const parsed = stored ? JSON.parse(stored) : {};
      // Backward compat: older cached values stored a plain status string
      // (e.g. "confirmed") instead of the { status, recordId, recordType } object.
      // Loose-compat them into the new shape (no recordId/recordType available).
      const normalized: Record<string, ChatSuggestionStatus> = {};
      Object.entries(parsed || {}).forEach(([id, v]) => {
        if (v && typeof v === "object" && "status" in (v as any)) {
          normalized[id] = v as ChatSuggestionStatus;
        } else if (typeof v === "string") {
          normalized[id] = { status: v as ChatSuggestionStatusValue };
        }
      });
      setChatSuggestionStatus(normalized);
    } catch {
      setChatSuggestionStatus({});
    }
  }, [wsId, isMockUser]);

  // Persist confirmed/rejected suggestion status to localStorage so refresh/remount cannot
  // forget it and re-trigger a duplicate database insert via handleChatConfirmSuggestion.
  const markChatSuggestionStatus = (id: string, status: ChatSuggestionStatus) => {
    setChatSuggestionStatus(prev => {
      const next = { ...prev, [id]: status };
      if (wsId) {
        try {
          localStorage.setItem(chatSuggestionStatusKey(wsId), JSON.stringify(next));
        } catch {
          // best-effort only
        }
      }
      return next;
    });
  };
  useEffect(() => { supportEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [supportMessages, supportLoading]);

  const [personalProfile, setPersonalProfile] = useState(EMPTY_PERSONAL_PROFILE);
  const [businessProfile, setBusinessProfile] = useState(EMPTY_BUSINESS_PROFILE);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [dependents, setDependents] = useState<Dependent[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  useEffect(() => {
    if (!wsId) return;
    loadPersonalProfile(wsId, isMockUser).then(setPersonalProfile);
    loadBusinessProfile(wsId, isMockUser).then(setBusinessProfile);
    loadVehicles(wsId, isMockUser).then(setVehicles);
    loadDependents(wsId, isMockUser).then(setDependents);
    loadBusinesses(wsId, isMockUser).then(setBusinesses);
  }, [wsId, isMockUser]);

  const sendSupport = async (text?: string) => {
    const q = (text || supportInput).trim();
    if (!q || supportLoading) return;
    setSupportInput("");
    setSupportMessages(prev => [...prev, { id: `u-${Date.now()}`, sender: "user", text: q }]);
    setSupportLoading(true);
    try {
      const { getAuthHeader } = await import("../lib/supabase");
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
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
    setChatMessages(prev => [...prev, { id: `u-${Date.now()}`, sender: "user", text: q, createdAt: new Date().toISOString() }]);
    saveChatMessage(wsId, user?.id, isMockUser, { sender: "user", text: q });
    setChatLoading(true);
    try {
      const { getAuthHeader } = await import("../lib/supabase");
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
        body: JSON.stringify({
          query: q,
          financialContext: { activeTenant, activeWorkspace, financialEvents, personalProfile, businessProfile, vehicles, dependents },
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
      const aiMsgId = `a-${Date.now()}`;
      const suggestions: ChatSuggestion[] = Array.isArray(data.suggestions)
        ? data.suggestions
            .filter((s: ChatSuggestion) => s.actionType === "CONFIRM_TRANSACTION")
            .map((s: ChatSuggestion, idx: number) => ({ ...s, id: `${aiMsgId}-sugg-${idx}` }))
        : [];
      setChatMessages(prev => [...prev, { id: aiMsgId, sender: "ai", text: reply, suggestions, createdAt: new Date().toISOString() }]);
      saveChatMessage(wsId, user?.id, isMockUser, { sender: "ai", text: reply, suggestions });
      const activeBusinesses = businesses.filter(b => b.isActive);
      setChatSuggestionExtra(prev => {
        const next = { ...prev };
        suggestions.forEach(s => {
          next[s.id] = activeBusinesses.length > 0
            ? { businessId: null, businessName: "", businessPicked: false, evidenceStatus: "NONE" }
            : { businessId: null, businessName: "Personal", businessPicked: true, evidenceStatus: "NONE" };
        });
        return next;
      });
    } catch {
      setChatMessages(prev => [...prev, { id: `e-${Date.now()}`, sender: "ai", text: "Minta maaf, sambungan terputus. Sila cuba lagi." }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleChatRejectSuggestion = (id: string) => {
    markChatSuggestionStatus(id, { status: "rejected" });
  };

  const handleChatStartEdit = (s: ChatSuggestion) => {
    setEditingChatSuggestionId(s.id);
    setChatEditDraft({
      amount: String(s.payload?.amount ?? ""),
      category: s.payload?.category || "",
      relatedParty: s.payload?.relatedParty || "",
      date: s.payload?.date || new Date().toISOString().split("T")[0],
    });
  };

  // Accounting Knowledge Base V1: "Tukar" never auto-applies — it opens the
  // existing manual category-edit field pre-filled with the recommended
  // category, exactly like a user-initiated edit. User must still tap Sahkan.
  const handleChatApplyAccountingRecommendation = (s: ChatSuggestion) => {
    setAccountingBannerDismissed(prev => ({ ...prev, [s.id]: true }));
    setEditingChatSuggestionId(s.id);
    setChatEditDraft({
      amount: String(s.payload?.amount ?? ""),
      category: s.accountingRecommendation || s.payload?.category || "",
      relatedParty: s.payload?.relatedParty || "",
      date: s.payload?.date || new Date().toISOString().split("T")[0],
    });
  };

  const handleChatPickBusiness = (suggestionId: string, businessId: string | null, businessName: string) => {
    setChatSuggestionExtra(prev => ({
      ...prev,
      [suggestionId]: { ...(prev[suggestionId] || { businessId: null, businessName: "", businessPicked: false, evidenceStatus: "NONE" }), businessId, businessName, businessPicked: true },
    }));
  };

  const handleChatEvidenceAttach = (suggestionId: string, file: File) => {
    chatEvidenceFilesRef.current[suggestionId] = file;
    setChatSuggestionExtra(prev => ({
      ...prev,
      [suggestionId]: { ...(prev[suggestionId] || { businessId: null, businessName: "Personal", businessPicked: true, evidenceStatus: "NONE" }), evidenceStatus: "ATTACHED" },
    }));
  };

  const handleChatEvidenceSkip = (suggestionId: string) => {
    setChatSuggestionExtra(prev => ({
      ...prev,
      [suggestionId]: { ...(prev[suggestionId] || { businessId: null, businessName: "Personal", businessPicked: true, evidenceStatus: "NONE" }), evidenceStatus: "SKIPPED" },
    }));
  };

  const handleChatConfirmSuggestion = (s: ChatSuggestion, edited?: typeof chatEditDraft) => {
    if (!activeWorkspace || chatSuggestionStatus[s.id]?.status === "confirmed") return;
    const extra = chatSuggestionExtra[s.id];
    if (!extra || !extra.businessPicked) return;
    const businessId = extra.businessId;
    const transactionType = s.payload?.transactionType;
    const amount = Number(edited ? edited.amount : s.payload?.amount) || 0;
    const category = (edited ? edited.category : s.payload?.category) || "Lain-lain";
    const relatedParty = (edited ? edited.relatedParty : s.payload?.relatedParty) || "Tidak Dinyatakan";
    const date = (edited ? edited.date : s.payload?.date) || new Date().toISOString().split("T")[0];
    const confidenceScore = s.payload?.confidenceScore ?? 0.7;

    let newRecordId: string | undefined;
    let newRecordType: ChatSuggestionRecordType | undefined;

    if (transactionType === "INCOME" || transactionType === "EXPENSE") {
      const ev = addFinancialEvent({
        workspaceId: activeWorkspace.id,
        businessId: businessId || undefined,
        type: transactionType,
        categoryName: category,
        amountMyr: amount,
        partyName: relatedParty,
        date,
        referenceNumber: `AI-${s.id}`,
        description: `Direkodkan melalui pengesahan cadangan Kerani AI: ${s.title}`,
        isCompleted: true,
      });
      newRecordId = ev.id;
      newRecordType = transactionType;
    } else if (transactionType === "DEBT") {
      const debt = addDebtRecord({
        workspaceId: activeWorkspace.id,
        businessId: businessId || undefined,
        creditorName: relatedParty,
        borrowedDate: date,
        totalAmountMyr: amount,
        repaidAmountMyr: 0,
        status: "ACTIVE",
        description: `Direkodkan melalui pengesahan cadangan Kerani AI: ${s.title}`,
      });
      newRecordId = debt.id;
      newRecordType = "DEBT";
    } else if (transactionType === "RECEIVABLE") {
      const ev = addFinancialEvent({
        workspaceId: activeWorkspace.id,
        businessId: businessId || undefined,
        type: "RECEIVABLE",
        categoryName: category,
        amountMyr: amount,
        partyName: relatedParty,
        date,
        referenceNumber: `AI-${s.id}`,
        description: `Direkodkan melalui pengesahan cadangan Kerani AI: ${s.title}`,
        isCompleted: false,
      });
      newRecordId = ev.id;
      newRecordType = "RECEIVABLE";
    } else if (transactionType === "PAYABLE") {
      const ev = addFinancialEvent({
        workspaceId: activeWorkspace.id,
        businessId: businessId || undefined,
        type: "PAYABLE",
        categoryName: category,
        amountMyr: amount,
        partyName: relatedParty,
        date,
        referenceNumber: `AI-${s.id}`,
        description: `Direkodkan melalui pengesahan cadangan Kerani AI: ${s.title}`,
        isCompleted: false,
      });
      newRecordId = ev.id;
      newRecordType = "PAYABLE";
    } else if (transactionType === "COMMITMENT") {
      const cmt = addFinancialCommitment({
        workspaceId: activeWorkspace.id,
        businessId: businessId || undefined,
        description: `Direkodkan melalui pengesahan cadangan Kerani AI: ${s.title}`,
        obligeeName: relatedParty,
        amountPerIntervalMyr: amount,
        recurrence: "MONTHLY",
        startDate: date,
        isActive: true,
        status: "ACTIVE",
      });
      newRecordId = cmt.id;
      newRecordType = "COMMITMENT";
    } else if (transactionType === "ASSET_PURCHASE") {
      addAssetPurchase(activeWorkspace.id, isMockUser, {
        assetName: category,
        category,
        purchaseAmountMyr: amount,
        purchaseDate: date,
        vendorName: relatedParty,
        notes: `Direkodkan melalui pengesahan cadangan Kerani AI: ${s.title}`,
      });
    } else if (transactionType === "OWNER_TRANSACTION") {
      addOwnerTransaction(activeWorkspace.id, isMockUser, {
        type: s.payload?.ownerTransactionSubtype || (category.toUpperCase().includes("DRAWING") ? "DRAWING" : "CAPITAL_INJECTION"),
        amountMyr: amount,
        transactionDate: date,
        description: `Direkodkan melalui pengesahan cadangan Kerani AI: ${s.title}`,
      });
    } else {
      return;
    }

    // Mark confirmed (and persist) only after the insert succeeded, capturing the new
    // record's id/type so a later post-confirm Edit can UPDATE instead of re-inserting.
    markChatSuggestionStatus(s.id, {
      status: "confirmed",
      recordId: newRecordId,
      recordType: newRecordType,
      confirmedAt: new Date().toISOString(),
      editedAmount: amount,
      editedCategory: category,
      editedRelatedParty: relatedParty,
      editedDate: date,
      confirmedByName: user?.fullName || undefined,
      confirmedByUserId: user?.id || undefined,
    });

    if (transactionType !== "ASSET_PURCHASE" && transactionType !== "OWNER_TRANSACTION") learnOcrPattern({
      workspaceId: activeWorkspace.id,
      vendorName: relatedParty,
      category,
      recordType: transactionType === "COMMITMENT" ? "EXPENSE" : transactionType,
      confidenceScore,
    });

    setEditingChatSuggestionId(null);
  };

  // Save an edit to an ALREADY-confirmed chat suggestion: update the saved record in place
  // (instead of inserting a new one) using the recordId/recordType captured at confirm time.
  const handleChatSaveConfirmedEdit = (s: ChatSuggestion, edited: typeof chatEditDraft) => {
    const current = chatSuggestionStatus[s.id];
    if (!current?.recordId || !current.recordType) return;
    const amountMyr = Number(edited.amount) || 0;
    const categoryName = edited.category || "Lain-lain";
    const partyName = edited.relatedParty || "Tidak Dinyatakan";
    const date = edited.date || new Date().toISOString().split("T")[0];

    if (current.recordType === "DEBT") {
      editDebtRecord(current.recordId, {
        creditorName: partyName,
        totalAmountMyr: amountMyr,
        borrowedDate: date,
        description: categoryName,
      });
    } else if (current.recordType === "COMMITMENT") {
      editFinancialCommitment(current.recordId, {
        obligeeName: partyName,
        amountPerIntervalMyr: amountMyr,
        startDate: date,
        description: categoryName,
      });
    } else {
      // INCOME / EXPENSE / RECEIVABLE / PAYABLE all live in financialEvents.
      editFinancialEvent(current.recordId, {
        amountMyr,
        categoryName,
        partyName,
        date,
      });
    }

    markChatSuggestionStatus(s.id, {
      ...current,
      status: "confirmed",
      editedAmount: amountMyr,
      editedCategory: categoryName,
      editedRelatedParty: partyName,
      editedDate: date,
    });
    setChatSuggestionJustUpdated(prev => ({ ...prev, [s.id]: true }));
    setEditingChatSuggestionId(null);
  };

  const handleSaveRecord = (data: { type: string; amount: number; description: string; party: string; date: string; category: string }) => {
    if (!activeWorkspace) return;
    const categoryName = data.category.trim() || (data.type === "INCOME" ? "Pendapatan" : "Perbelanjaan");
    addFinancialEvent({
      workspaceId: activeWorkspace.id,
      type: data.type as any,
      categoryName,
      amountMyr: data.amount,
      partyName: data.party || "Tidak dinyatakan",
      date: data.date,
      referenceNumber: `TXN-STAFF-${Date.now().toString().slice(-6)}`,
      description: data.description,
      isCompleted: false,
    });
    if (data.party.trim()) {
      learnOcrPattern({
        workspaceId: activeWorkspace.id,
        vendorName: data.party.trim(),
        category: categoryName,
        recordType: data.type as any,
        confidenceScore: 0.9,
      });
    }
  };

  const canUploadChatAttachment = !!wsId && isSupabaseConfigured() && !isMockUser && !!supabase && !isDemoWorkspace(wsId);

  // Persisted via the same evidence_documents pipeline as the Owner's Dokumen tab
  // (docType SUPPORTING_DOC/RECEIPT) so the Owner can see staff-uploaded chat
  // attachments there too, with full uploader/date/size metadata.
  const fileToDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const uploadChatAttachment = async (file: File, kind: "image" | "pdf" | "audio") => {
    setChatAttaching(true);
    try {
      let url = "";
      if (canUploadChatAttachment && user) {
        const { doc, error } = await uploadDocument(file, wsId, user.id, kind === "audio" ? "SUPPORTING_DOC" : "RECEIPT");
        if (doc && !error) url = (await getDocumentUrl(doc.file_path_supabase)) || "";
      }
      if (!url) url = URL.createObjectURL(file);

      const userMsgId = `u-${Date.now()}`;
      setChatMessages(prev => [...prev, {
        id: userMsgId, sender: "user", text: kind === "audio" ? "🎤 Nota suara" : `📎 ${file.name}`,
        createdAt: new Date().toISOString(), attachmentUrl: url, attachmentName: file.name, attachmentType: kind,
      }]);
      saveChatMessage(wsId, user?.id, isMockUser, {
        sender: "user", text: kind === "audio" ? "🎤 Nota suara" : `📎 ${file.name}`,
        attachmentUrl: url, attachmentName: file.name, attachmentType: kind,
      });

      // Actually read the attachment's content before asking the AI to act on it —
      // otherwise the assistant only sees a filename and can only say "please wait"
      // (image/pdf) or "I can't listen to audio" (voice notes), as it had no real
      // content to reason about.
      let extractedContext = "";
      try {
        if (kind === "audio") {
          const audioDataUrl = await fileToDataUrl(file);
          const { getAuthHeader } = await import("../lib/supabase");
          const res = await fetch("/api/ai/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
            body: JSON.stringify({ fileDataUrl: audioDataUrl, fileName: file.name, tenantId: activeWorkspace?.tenantId, workspaceId: wsId, userId: user?.id }),
          });
          if (res.ok) {
            const { text } = await res.json();
            if (text) extractedContext = `Transkripsi nota suara: "${text}"`;
          }
        } else {
          const fileDataUrl = await fileToDataUrl(file);
          const { getAuthHeader } = await import("../lib/supabase");
          const res = await fetch("/api/ocr/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
            body: JSON.stringify({ fileDataUrl, fileName: file.name, documentType: "RECEIPT", tenantId: activeWorkspace?.tenantId, workspaceId: wsId, userId: user?.id }),
          });
          if (res.ok) {
            const payload = await res.json();
            extractedContext = `Maklumat dibaca daripada dokumen: merchant=${payload.merchantName || "-"}, tarikh=${payload.date || "-"}, jumlah=${payload.amount ?? "-"}, kategori cadangan=${payload.suggestedCategory || "-"}.`;
          }
        }
      } catch {
        // best-effort — fall back to the plain acknowledgment below
      }

      await sendChat(
        kind === "audio"
          ? (extractedContext ? `Saya hantar nota suara berkaitan transaksi. ${extractedContext} Sila semak dan bantu saya rekod jika perlu.` : "Saya hantar nota suara berkaitan transaksi. Sila semak dan bantu saya rekod jika perlu.")
          : (extractedContext ? `Saya muat naik dokumen "${file.name}". ${extractedContext} Sila semak dan bantu saya rekod transaksi berkaitan jika ada.` : `Saya muat naik dokumen "${file.name}". Sila semak dan bantu saya rekod transaksi berkaitan jika ada.`)
      );
    } finally {
      setChatAttaching(false);
    }
  };

  const handleChatFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert("Saiz fail terlalu besar. Maksimum 10MB.");
      return;
    }
    const kind: "image" | "pdf" = file.type.startsWith("image/") ? "image" : "pdf";
    uploadChatAttachment(file, kind);
  };

  const startChatVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chatRecordedChunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chatRecordedChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chatRecordedChunksRef.current, { type: "audio/webm" });
        const file = new File([blob], `nota-suara-${Date.now()}.webm`, { type: "audio/webm" });
        uploadChatAttachment(file, "audio");
      };
      chatMediaRecorderRef.current = recorder;
      recorder.start();
      setChatRecording(true);
    } catch {
      alert("Tidak dapat mengakses mikrofon. Sila benarkan akses mikrofon.");
    }
  };

  const stopChatVoiceRecording = () => {
    chatMediaRecorderRef.current?.stop();
    chatMediaRecorderRef.current = null;
    setChatRecording(false);
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

            {chatMessages.length > 0 && (
              <div className="px-4 pt-3 flex justify-end shrink-0">
                <button type="button" onClick={() => setChatMessages([])}
                  className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Chat Baharu
                </button>
              </div>
            )}

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
                const hasTxnSuggestion = (msg.suggestions || []).some(s => s.actionType === "CONFIRM_TRANSACTION");
                return (
                  <React.Fragment key={msg.id}>
                    {(!hasTxnSuggestion || isUser) && (
                      <div className={`flex items-start gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
                        <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${isUser ? "bg-slate-700 text-white" : "bg-slate-900 text-white"}`}>
                          {isUser ? <UserIcon className="w-3.5 h-3.5" /> : <Brain className="w-3.5 h-3.5" />}
                        </div>
                        <div className={`max-w-[78%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${isUser ? "bg-slate-700 text-white rounded-tr-none" : "bg-white border border-slate-200 text-slate-800 rounded-tl-none whitespace-pre-wrap shadow-sm"}`}>
                          {msg.attachmentUrl && msg.attachmentType === "image" && (
                            <img src={msg.attachmentUrl} alt={msg.attachmentName || "lampiran"} className="rounded-xl max-h-48 mb-2" />
                          )}
                          {msg.attachmentUrl && msg.attachmentType === "audio" && (
                            <audio controls src={msg.attachmentUrl} className="mb-2 max-w-full" />
                          )}
                          {msg.attachmentUrl && msg.attachmentType === "pdf" && (
                            <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer"
                              className={`flex items-center gap-2 mb-2 px-3 py-2 rounded-xl text-xs font-semibold ${isUser ? "bg-slate-600" : "bg-slate-100 text-slate-700"}`}>
                              <FileIcon className="w-4 h-4" /> {msg.attachmentName || "Dokumen"}
                            </a>
                          )}
                          {msg.text}
                        </div>
                      </div>
                    )}
                    {(msg.suggestions || []).map(s => {
                      const statusObj = chatSuggestionStatus[s.id] || { status: "pending" as const };
                      const status = statusObj.status;
                      if (status === "rejected") return null;
                      const extra = chatSuggestionExtra[s.id] || { businessId: null, businessName: "", businessPicked: businesses.filter(b => b.isActive).length === 0, evidenceStatus: "NONE" as const };
                      const confidencePct = Math.round((s.payload?.confidenceScore ?? 0.7) * 100);
                      const confidenceClass = confidencePct >= 90 ? "text-emerald-700" : confidencePct >= 75 ? "text-amber-700" : "text-rose-700";
                      const activeBusinesses = businesses.filter(b => b.isActive);
                      return (
                        <div key={s.id} className="flex items-start gap-2.5">
                          <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 bg-slate-900 text-white">
                            <Brain className="w-3.5 h-3.5" />
                          </div>
                          <div className="max-w-[78%] p-3.5 bg-white border border-slate-200 rounded-2xl text-sm space-y-2 shadow-sm">
                            <div className="font-mono text-slate-800 space-y-0.5">
                              <div>Jenis: {TRANSACTION_TYPE_LABEL_MS[s.payload?.transactionType || ""] || s.payload?.transactionType || "-"}</div>
                              <div>Kategori: {statusObj.editedCategory ?? s.payload?.category ?? "-"}</div>
                              <div>Jumlah: RM{Number(statusObj.editedAmount ?? s.payload?.amount ?? 0).toFixed(2)}</div>
                              <div>Confidence: <span className={`font-bold ${confidenceClass}`}>{confidencePct}%</span></div>
                            </div>
                            {status === "pending" && s.accountingMatchStatus && s.accountingMatchStatus !== "MATCH" && !accountingBannerDismissed[s.id] && (
                              <div className={`space-y-1 rounded-lg px-2.5 py-1.5 text-2xs border ${s.accountingRiskLevel === "HIGH" ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                                <div className="font-bold">Cadangan Semakan</div>
                                <div>Berdasarkan amalan perakaunan biasa, transaksi ini lazimnya direkodkan sebagai: <strong>{s.accountingRecommendation}</strong></div>
                                {s.accountingRiskLevel !== "LOW" && (
                                  <>
                                    {s.accountingReason && <div>Sebab: {s.accountingReason}</div>}
                                    {s.financialStatementImpact && <div>Kesan Penyata Kewangan: {s.financialStatementImpact}</div>}
                                    <div>Tahap Risiko: {s.accountingRiskLevel === "HIGH" ? "🔴 HIGH" : s.accountingRiskLevel === "MEDIUM" ? "🟡 MEDIUM" : "🟢 LOW"}</div>
                                    {s.accountingExplanationText && <div>Penjelasan: {s.accountingExplanationText}</div>}
                                  </>
                                )}
                                <div className="flex gap-1.5 pt-0.5">
                                  <button
                                    type="button"
                                    onClick={() => setAccountingBannerDismissed(prev => ({ ...prev, [s.id]: true }))}
                                    className="px-2 py-1 rounded-md bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold"
                                  >
                                    Kekalkan
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleChatApplyAccountingRecommendation(s)}
                                    className={`px-2 py-1 rounded-md text-white font-semibold ${s.accountingRiskLevel === "HIGH" ? "bg-rose-600 hover:bg-rose-700" : "bg-amber-600 hover:bg-amber-700"}`}
                                  >
                                    Tukar ke {s.accountingRecommendation}
                                  </button>
                                </div>
                              </div>
                            )}
                            {status === "confirmed" && editingChatSuggestionId !== s.id && (
                              <div className="space-y-1.5">
                                <div className="text-emerald-700 font-bold">
                                  {chatSuggestionJustUpdated[s.id] ? "✅ Dikemaskini." : "✅ Disahkan & direkodkan."}
                                </div>
                                {statusObj.confirmedAt && (
                                  <div className="text-[10px] text-slate-400">
                                    {new Date(statusObj.confirmedAt).toLocaleString("ms-MY", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                    {statusObj.confirmedByName && ` · ${statusObj.confirmedByName}`}
                                    {statusObj.confirmedByUserId && ` · ID: ${statusObj.confirmedByUserId.slice(0, 8)}`}
                                  </div>
                                )}
                                <button type="button" onClick={() => handleChatStartEdit(s)}
                                  className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold text-xs">
                                  Edit
                                </button>
                              </div>
                            )}
                            {status === "pending" && !extra.businessPicked && activeBusinesses.length > 0 && (
                              <div className="space-y-1.5 pt-1">
                                <p className="text-xs text-slate-500">Transaksi ini untuk:</p>
                                <div className="flex flex-wrap gap-2">
                                  {activeBusinesses.map(b => (
                                    <button key={b.id} type="button" onClick={() => handleChatPickBusiness(s.id, b.id, b.businessName)}
                                      title={b.businessName}
                                      className="px-3 py-1.5 text-sm rounded-full bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-semibold truncate max-w-[160px]">
                                      {b.businessName}
                                    </button>
                                  ))}
                                  <button type="button" onClick={() => handleChatPickBusiness(s.id, null, "Personal")}
                                    className="px-3 py-1.5 text-sm rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-semibold">
                                    Personal
                                  </button>
                                </div>
                              </div>
                            )}
                            {status === "pending" && extra.businessPicked && (
                              <div className="text-xs text-slate-500">Bisnes: <span className="font-semibold text-slate-700">{extra.businessName || "Personal"}</span></div>
                            )}
                            {status === "pending" && extra.businessPicked && (
                              <div className="space-y-1.5">
                                {extra.evidenceStatus === "NONE" ? (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-500">Evidence:</span>
                                    <button type="button" onClick={() => chatEvidenceInputRefs.current[s.id]?.click()}
                                      className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold">Lampir Resit</button>
                                    <button type="button" onClick={() => handleChatEvidenceSkip(s.id)}
                                      className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold">Tiada Resit</button>
                                    <input
                                      ref={el => { chatEvidenceInputRefs.current[s.id] = el; }}
                                      type="file" accept="image/*,.pdf" className="hidden"
                                      onChange={e => { const f = e.target.files?.[0]; if (f) handleChatEvidenceAttach(s.id, f); }}
                                    />
                                  </div>
                                ) : (
                                  <div className="text-xs text-slate-500">
                                    Evidence: {extra.evidenceStatus === "ATTACHED"
                                      ? <span className="font-semibold text-emerald-700">Resit dilampirkan: {chatEvidenceFilesRef.current[s.id]?.name || "fail"}</span>
                                      : <span className="font-semibold text-slate-600">Tiada resit</span>}
                                  </div>
                                )}
                              </div>
                            )}
                            {status === "pending" && editingChatSuggestionId !== s.id && extra.businessPicked && extra.evidenceStatus !== "NONE" && (
                              <div className="flex gap-2 pt-1">
                                <button type="button" onClick={() => handleChatConfirmSuggestion(s)} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">Sahkan</button>
                                <button type="button" onClick={() => handleChatStartEdit(s)} className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold">Edit</button>
                                <button type="button" onClick={() => handleChatRejectSuggestion(s.id)} className="px-3 py-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 font-semibold">Tolak</button>
                              </div>
                            )}
                            {(status === "pending" || status === "confirmed") && editingChatSuggestionId === s.id && (
                              <div className="space-y-1.5 pt-1">
                                <input value={chatEditDraft.amount} onChange={e => setChatEditDraft(d => ({ ...d, amount: e.target.value }))} placeholder="Amount (RM)" className="w-full px-2 py-1 rounded border border-slate-300 text-xs" />
                                <input value={chatEditDraft.category} onChange={e => setChatEditDraft(d => ({ ...d, category: e.target.value }))} placeholder="Category" className="w-full px-2 py-1 rounded border border-slate-300 text-xs" />
                                <input value={chatEditDraft.relatedParty} onChange={e => setChatEditDraft(d => ({ ...d, relatedParty: e.target.value }))} placeholder="Related Party" className="w-full px-2 py-1 rounded border border-slate-300 text-xs" />
                                <input value={chatEditDraft.date} onChange={e => setChatEditDraft(d => ({ ...d, date: e.target.value }))} type="date" className="w-full px-2 py-1 rounded border border-slate-300 text-xs" />
                                <div className="flex gap-2 pt-1">
                                  <button type="button"
                                    onClick={() => status === "confirmed" ? handleChatSaveConfirmedEdit(s, chatEditDraft) : handleChatConfirmSuggestion(s, chatEditDraft)}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
                                    Sahkan Perubahan
                                  </button>
                                  <button type="button" onClick={() => setEditingChatSuggestionId(null)} className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold">Batal</button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </React.Fragment>
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
              {chatRecording && (
                <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                  <span className="text-xs font-semibold text-rose-700 flex-1">Merekod nota suara...</span>
                  <button type="button" onClick={stopChatVoiceRecording}
                    className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-bold cursor-pointer">
                    Hentikan & Hantar
                  </button>
                </div>
              )}
              <input ref={chatFileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleChatFilePicked} />
              <form onSubmit={e => { e.preventDefault(); sendChat(); }}
                className="flex items-center gap-2 bg-white border border-slate-300 rounded-2xl px-4 py-3 shadow-sm focus-within:border-slate-500 transition">
                <button type="button" onClick={() => chatFileInputRef.current?.click()} disabled={chatAttaching || chatRecording}
                  className="w-7 h-7 rounded-xl flex items-center justify-center text-indigo-600 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-40 cursor-pointer shrink-0">
                  <Paperclip className="w-4 h-4" />
                </button>
                <button type="button" onClick={chatRecording ? stopChatVoiceRecording : startChatVoiceRecording} disabled={chatAttaching}
                  className={`w-7 h-7 rounded-xl flex items-center justify-center disabled:opacity-40 cursor-pointer shrink-0 ${chatRecording ? "text-white bg-rose-500" : "text-emerald-600 bg-emerald-50 hover:bg-emerald-100"}`}>
                  {chatRecording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
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
            ) : (
              <>
                <div className="flex items-center justify-between">
                  {(txnFilterFrom || txnFilterTo) && (
                    <button onClick={() => { setTxnFilterFrom(""); setTxnFilterTo(""); }} className="text-[10px] text-indigo-500 font-semibold cursor-pointer hover:underline">
                      Kosongkan tapisan
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 pb-1">
                  <input type="date" value={txnFilterFrom} onChange={e => setTxnFilterFrom(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] text-slate-600" />
                  <span className="text-[10px] text-slate-400">hingga</span>
                  <input type="date" value={txnFilterTo} onChange={e => setTxnFilterTo(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] text-slate-600" />
                </div>
                {filteredRecords.length === 0 && (
                  <p className="text-[11px] text-slate-400 text-center py-3">Tiada transaksi dalam tempoh ini.</p>
                )}
                {filteredRecords.map(rec => (
                  <div key={rec.id} className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
                    {editingTxnId === rec.id ? (
                      <div className="space-y-1.5">
                        <input value={editTxnDraft.partyName} onChange={e => setEditTxnDraft(d => ({ ...d, partyName: e.target.value }))} placeholder="Pihak Berkaitan" className="w-full px-2 py-1 rounded border border-slate-300 text-xs" />
                        <input value={editTxnDraft.categoryName} onChange={e => setEditTxnDraft(d => ({ ...d, categoryName: e.target.value }))} placeholder="Kategori" className="w-full px-2 py-1 rounded border border-slate-300 text-xs" />
                        <input value={editTxnDraft.amountMyr} onChange={e => setEditTxnDraft(d => ({ ...d, amountMyr: e.target.value }))} type="number" placeholder="Jumlah (RM)" className="w-full px-2 py-1 rounded border border-slate-300 text-xs" />
                        <input value={editTxnDraft.date} onChange={e => setEditTxnDraft(d => ({ ...d, date: e.target.value }))} type="date" className="w-full px-2 py-1 rounded border border-slate-300 text-xs" />
                        <div className="flex gap-2 pt-1">
                          <button onClick={saveEditTxn} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer">Simpan</button>
                          <button onClick={() => setEditingTxnId(null)} className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold cursor-pointer">Batal</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${rec.type === "INCOME" ? "bg-emerald-50" : "bg-rose-50"}`}>
                            {rec.type === "INCOME"
                              ? <TrendingUp className="w-4 h-4 text-emerald-500" />
                              : <TrendingDown className="w-4 h-4 text-rose-500" />}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-800 truncate max-w-[170px]">{(rec.partyName && rec.partyName !== "Tidak Dinyatakan") ? rec.partyName : rec.categoryName}</p>
                            <p className="text-[11px] text-slate-400">{rec.categoryName} · {rec.referenceNumber}</p>
                            <p className="text-[10px] text-slate-300">
                              {rec.date}{rec.createdAt ? ` ${new Date(rec.createdAt).toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit" })}` : ""}
                              {rec.createdByName ? ` · ${rec.createdByName}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-bold ${rec.type === "INCOME" ? "text-emerald-600" : "text-rose-500"}`}>
                            {rec.type === "INCOME" ? "+" : "-"}RM {rec.amountMyr.toFixed(2)}
                          </span>
                          <button onClick={() => startEditTxn(rec)} className="p-1 text-slate-300 hover:text-indigo-500 cursor-pointer" aria-label="Edit transaksi">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
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

              <button onClick={() => setShowChatArchive(true)}
                className="w-full py-3 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition cursor-pointer flex items-center justify-center space-x-2">
                <MessageCircle className="w-4 h-4" /><span>Arkib Perbualan</span>
              </button>

              <button onClick={() => setShowProfileView(true)}
                className="w-full py-3 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition cursor-pointer flex items-center justify-center space-x-2">
                <Brain className="w-4 h-4" /><span>Profil Kewangan AI</span>
              </button>

              <button onClick={() => signOut()}
                className="w-full py-3 border border-rose-200 text-rose-500 rounded-xl text-sm font-semibold hover:bg-rose-50 transition cursor-pointer">
                Log Keluar
              </button>
            </div>
          </div>
        )}

        {/* Profile System view (read-only — Owner manages edits in OwnerDashboard) */}
        {showProfileView && (
          <div className="fixed inset-0 z-50 flex flex-col bg-slate-50">
            <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <Brain className="w-5 h-5 text-indigo-500" />
                <h2 className="font-bold text-slate-900 text-base">Profil Kewangan AI</h2>
              </div>
              <button onClick={() => setShowProfileView(false)} className="p-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 max-w-lg mx-auto w-full space-y-4">
              <p className="text-xs text-slate-400">Maklumat ini membantu AI bezakan transaksi peribadi & perniagaan. Hanya Pemilik boleh kemas kini.</p>
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1 shadow-sm">
                <h3 className="text-sm font-bold text-slate-800 mb-1">Profil Peribadi</h3>
                <p className="text-xs text-slate-600">{personalProfile.fullName || "Belum diisi"}</p>
                {personalProfile.occupation && <p className="text-xs text-slate-400">{personalProfile.occupation}</p>}
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1 shadow-sm">
                <h3 className="text-sm font-bold text-slate-800 mb-1">Profil Perniagaan</h3>
                <p className="text-xs text-slate-600">{businessProfile.industry || "Belum diisi"}</p>
                {businessProfile.branchName && <p className="text-xs text-slate-400">Cawangan: {businessProfile.branchName}</p>}
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 shadow-sm">
                <h3 className="text-sm font-bold text-slate-800">Kenderaan</h3>
                {vehicles.length === 0 ? (
                  <p className="text-xs text-slate-400">Tiada kenderaan didaftarkan</p>
                ) : vehicles.map(v => (
                  <div key={v.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                    <p className="text-sm font-semibold text-slate-800">{v.name} {v.plateNumber && <span className="text-slate-400 font-normal">· {v.plateNumber}</span>}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${v.ownership === "BUSINESS" ? "bg-indigo-100 text-indigo-700" : "bg-amber-100 text-amber-700"}`}>{v.ownership === "BUSINESS" ? "Perniagaan" : "Peribadi"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Chat Archive Modal */}
        {showChatArchive && (
          <div className="fixed inset-0 z-50 flex flex-col bg-slate-50">
            <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <MessageCircle className="w-5 h-5 text-indigo-500" />
                <h2 className="font-bold text-slate-900 text-base">Arkib Perbualan</h2>
              </div>
              <button onClick={() => { setShowChatArchive(false); setChatArchiveDate(null); setChatArchiveYear(null); setChatArchiveMonth(null); }}
                className="p-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 max-w-lg mx-auto w-full space-y-3">
              {(() => {
                const merged = new Map<string, typeof chatMessages[number]>();
                chatHistoryAll.forEach(m => merged.set(m.id, m));
                chatMessages.forEach(m => merged.set(m.id, m));
                const allMessages = Array.from(merged.values());
                return allMessages.length === 0;
              })() ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center shadow-sm">
                  <MessageCircle className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">Tiada perbualan lagi</p>
                </div>
              ) : (() => {
                const merged = new Map<string, typeof chatMessages[number]>();
                chatHistoryAll.forEach(m => merged.set(m.id, m));
                chatMessages.forEach(m => merged.set(m.id, m));
                const allMessages = Array.from(merged.values());
                const byDate: Record<string, typeof chatMessages> = {};
                allMessages.forEach(m => {
                  const d = (m.createdAt || new Date().toISOString()).slice(0, 10);
                  (byDate[d] = byDate[d] || []).push(m);
                });
                const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
                const years = Array.from(new Set(dates.map(d => d.slice(0, 4)))).sort((a, b) => b.localeCompare(a));
                const monthsInYear = chatArchiveYear ? Array.from(new Set(dates.filter(d => d.startsWith(chatArchiveYear)).map(d => d.slice(0, 7)))).sort((a, b) => b.localeCompare(a)) : [];
                const daysInMonth = chatArchiveMonth ? dates.filter(d => d.startsWith(chatArchiveMonth)) : [];
                if (!chatArchiveYear) {
                  return (
                    <div className="grid grid-cols-3 gap-2">
                      {years.map(y => (
                        <button key={y} onClick={() => setChatArchiveYear(y)}
                          className="px-2 py-3 rounded-xl text-center border bg-white border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer">
                          <p className="text-sm font-bold">{y}</p>
                          <p className="text-[9px] text-slate-400">{dates.filter(d => d.startsWith(y)).reduce((n, d) => n + byDate[d].length, 0)} mesej</p>
                        </button>
                      ))}
                    </div>
                  );
                }
                if (!chatArchiveMonth) {
                  return (
                    <>
                      <button onClick={() => setChatArchiveYear(null)} className="text-[11px] text-indigo-500 font-semibold cursor-pointer hover:underline">← Tahun</button>
                      <div className="grid grid-cols-3 gap-2">
                        {monthsInYear.map(m => (
                          <button key={m} onClick={() => setChatArchiveMonth(m)}
                            className="px-2 py-3 rounded-xl text-center border bg-white border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer">
                            <p className="text-[11px] font-bold">{new Date(`${m}-01`).toLocaleDateString("ms-MY", { month: "long" })}</p>
                            <p className="text-[9px] text-slate-400">{dates.filter(d => d.startsWith(m)).reduce((n, d) => n + byDate[d].length, 0)} mesej</p>
                          </button>
                        ))}
                      </div>
                    </>
                  );
                }
                return (
                  <>
                    <button onClick={() => setChatArchiveMonth(null)} className="text-[11px] text-indigo-500 font-semibold cursor-pointer hover:underline">← Bulan</button>
                    <div className="grid grid-cols-3 gap-2">
                      {daysInMonth.map(d => (
                        <button key={d} onClick={() => setChatArchiveDate(chatArchiveDate === d ? null : d)}
                          className={`px-2 py-2.5 rounded-xl text-center border transition cursor-pointer ${chatArchiveDate === d ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
                          <p className="text-[11px] font-bold">{new Date(d).toLocaleDateString("ms-MY", { day: "numeric", month: "short" })}</p>
                          <p className={`text-[9px] ${chatArchiveDate === d ? "text-indigo-100" : "text-slate-400"}`}>{byDate[d].length} mesej</p>
                        </button>
                      ))}
                    </div>
                    {chatArchiveDate && (
                      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                          {new Date(chatArchiveDate).toLocaleDateString("ms-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                        </p>
                        {byDate[chatArchiveDate].map(m => (
                          <div key={m.id} className={`flex items-start gap-2.5 ${m.sender === "user" ? "flex-row-reverse" : ""}`}>
                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${m.sender === "user" ? "bg-indigo-600 text-white" : "bg-slate-900 text-white"}`}>
                              {m.sender === "user" ? <UserIcon className="w-3 h-3" /> : <Brain className="w-3 h-3" />}
                            </div>
                            <div className={`max-w-[80%] px-3 py-2 rounded-xl text-xs leading-relaxed ${m.sender === "user" ? "bg-indigo-50 text-indigo-900" : "bg-slate-50 text-slate-700 whitespace-pre-wrap"}`}>
                              {m.text}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
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

