import React, { useState, useRef, useEffect, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { useFinancials } from "../context/FinancialRecordsContext";
import { useTenant } from "../context/TenantContext";
import { loadChatHistory, loadActiveSessionMessages, saveChatMessage } from "../lib/chatHistory";
import { getOrCreateActiveSession } from "../lib/chatSession";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { isDemoWorkspace } from "../lib/seeder";
import { uploadDocument, getDocumentUrl, type UploadedDoc } from "../lib/documentStorage";
import { logEvent } from "../lib/eventLog";
import { createTenantSupportTicket, getMyTenantSupportTickets, SupportTicket, SUPPORT_TICKET_TEMPLATES, uploadTicketAttachment, getTicketAttachmentUrl, ticketSlaState, TICKET_STATUS_LABEL_MS, TICKET_STATUS_STYLE, tenantSubmitAppeal, tenantReplySupportTicket, logTenantActivity } from "../lib/hqService";
import { TenantResourceLedger } from "../components/TenantResourceLedger";
import { usePermission } from "../context/PermissionContext";
import { useStorageQuota } from "../lib/storageQuota";
import { useAiCredits, useOcrCredits } from "../lib/aiCredits";

import { DocumentsManager } from "../components/DocumentsManager";
import { NotificationCenterConsole } from "../components/NotificationCenterConsole";
import { AuditConsole } from "../components/AuditConsole";
import {
  loadPersonalProfile, loadBusinessProfile, loadVehicles, loadDependents, loadBusinesses,
  EMPTY_PERSONAL_PROFILE, EMPTY_BUSINESS_PROFILE, type Vehicle, type Dependent, type Business,
} from "../lib/profileData";
import { addAssetPurchase, addOwnerTransaction } from "../lib/assetOwnerData";
import { buildFinancialContext } from "../lib/buildFinancialContext";
import { matchOwnBusiness, matchOwnBusinessAndBranch } from "../lib/businessMatching";
import { loadBusinessBranches, type BusinessBranch } from "../lib/profileData";
import { DuplicateReviewQueue } from "../components/DuplicateReviewQueue";
import { HistoricalRecoveryWorkspace } from "../components/HistoricalRecoveryWorkspace";
import { getImportFailures } from "../lib/importFailureLog";
import { useConfirmChatSuggestion } from "../hooks/useConfirmChatSuggestion";
import { useCrossWorkspacePattern } from "../hooks/useCrossWorkspacePattern";
import type { ChatSuggestion, ChatSuggestionExtra, ChatSuggestionRecordType, ChatSuggestionStatus, ChatSuggestionStatusValue, PendingChatEvidence } from "../lib/chatSuggestionTypes";
import { enrichChatSuggestionPayload } from "../lib/chatSuggestionMapper";
import BankStatementProcessor from "../components/BankStatementProcessor";
import { confirmFinancialRecord, type ConfirmInput } from "../lib/financialRecordConfirmation";
import { type StatementTransaction } from "../lib/bankStatementTypes";
import {
  Home, Plus, Upload, Search, Bell, User as UserIcon,
  Send, Brain, RefreshCw, Receipt, FileSpreadsheet, Landmark,
  TrendingUp, TrendingDown, Clock, ChevronRight, X,
  CheckCircle2, LogOut, ClipboardList, HelpCircle,
  MessageCircle, BookOpen, Ticket, Edit3,
  Paperclip, Mic, Square, File as FileIcon,
  LayoutDashboard, FileText, MoreHorizontal, AlertCircle, ShieldCheck,
} from "lucide-react";

type StaffTab = "home" | "dashboard" | "documents" | "more";

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
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Jumlah (RM)</label>
          <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="0.00" required
            className="w-full mt-1 border border-slate-200 rounded-xl px-4 py-3 text-xl font-bold focus:outline-none focus:border-indigo-400 bg-white" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            {type === "INCOME" ? "Daripada (Pelanggan)" : "Kepada (Pembekal)"}
          </label>
          <input type="text" value={party} onChange={e => setParty(e.target.value)}
            placeholder={type === "INCOME" ? "Nama pelanggan" : "Nama pembekal"}
            className="w-full mt-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 bg-white" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Kategori</label>
          <input type="text" value={category} onChange={e => setCategory(e.target.value)}
            placeholder="Cth: Sewa, Minyak, Jualan Produk"
            className="w-full mt-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 bg-white" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Penerangan</label>
          <input type="text" value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Cth: Bayar minyak, Terima deposit..."
            className="w-full mt-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 bg-white" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tarikh</label>
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
  const { user, signOut, isMockUser, updateProfile } = useAuth();
  const { activeWorkspace, workspaces, selectWorkspace } = useWorkspace();
  const { financialEvents, addFinancialEvent, addFinancialEventAwaited, addFinancialEventsBatch, editFinancialEvent, addDebtRecord, addDebtRecordAwaited, editDebtRecord, addFinancialCommitment, addFinancialCommitmentAwaited, editFinancialCommitment, learnOcrPattern, learnOcrPatternsBatch, ocrLearnedPatterns, addFinancialEvidencePackage, linkEvidenceToRecord, financialEvidencePackages, duplicateFlags, addBankAccount, scanForDuplicates, cashAccounts, bankAccounts, debtRecords, financialCommitments } = useFinancials();
  const { activeTenant } = useTenant();
  const { userRoles, hasPermission } = usePermission();
  const userNameById = useMemo(() => {
    const map: Record<string, string> = {};
    userRoles.forEach(r => { map[r.userId] = r.fullName; });
    return map;
  }, [userRoles]);
  const { confirmChatSuggestion } = useConfirmChatSuggestion();
  const { crossWorkspaceHints, checkCrossWorkspacePattern } = useCrossWorkspacePattern();

  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [activeTab, setActiveTab] = useState<StaffTab>("home");
  const [showBankStatementImport, setShowBankStatementImport] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAuditHistory, setShowAuditHistory] = useState(false);
  const [addDefaultType, setAddDefaultType] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  // Issue #1 parity fix — "Tambah Rekod" is reachable as a modal from Home,
  // same access pattern as Owner's QuickAddModal, instead of its own
  // bottom-nav tab (Owner's bottom nav has no "Tambah" tab either).
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  // â"€â"€ AI Chat â"€â"€
  const [chatMessages, setChatMessages] = useState<{ id: string; sender: "user" | "ai"; text: string; suggestions?: ChatSuggestion[]; createdAt?: string; attachmentUrl?: string; attachmentName?: string; attachmentType?: "image" | "pdf" | "audio" }[]>([]);
  // Full conversation history (all dates) — kept separate from chatMessages so the
  // active home thread can always start fresh on login/refresh while Arkib Perbualan
  // still has access to everything that was ever said.
  const [chatHistoryAll, setChatHistoryAll] = useState<typeof chatMessages>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showChatArchive, setShowChatArchive] = useState(false);
  const [editingAccount, setEditingAccount] = useState(false);
  const [accountDraft, setAccountDraft] = useState({ fullName: "", email: "" });
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountMsg, setAccountMsg] = useState<string | null>(null);
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
  const [confirmingChatId, setConfirmingChatId] = useState<string | null>(null);
  const [editingChatSuggestionId, setEditingChatSuggestionId] = useState<string | null>(null);
  const [chatEditDraft, setChatEditDraft] = useState({ amount: "", category: "", relatedParty: "", date: "", transactionType: "" });
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  // Per-suggestion business pick + evidence step, layered on top of the AI suggestion before final Sahkan.
  const [chatSuggestionExtra, setChatSuggestionExtra] = useState<Record<string, ChatSuggestionExtra>>({});
  // Accounting Knowledge Base V1: per-suggestion dismissal of the "Cadangan Semakan" review banner.
  const [accountingBannerDismissed, setAccountingBannerDismissed] = useState<Record<string, boolean>>({});
  const chatEvidenceFilesRef = useRef<Record<string, File>>({});
  // M-01: object URLs for evidence previews, tracked so they can be revoked.
  const [evidencePreviewUrls, setEvidencePreviewUrls] = useState<Record<string, string>>({});
  // Holds uploaded-but-not-yet-linked evidence metadata per suggestion id, until
  // Sahkan creates the underlying financial record and we know its id to link to.
  const pendingChatEvidenceRef = useRef<Record<string, PendingChatEvidence>>({});
  const [chatActionErrors, setChatActionErrors] = useState<Record<string, string>>({});
  const [businessBranches, setBusinessBranches] = useState<Record<string, BusinessBranch[]>>({});
  const chatEvidenceInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [chatAttaching, setChatAttaching] = useState(false);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const [chatRecording, setChatRecording] = useState(false);
  const chatMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chatRecordedChunksRef = useRef<Blob[]>([]);

  // â"€â"€ Support Center â"€â"€
  const [showSupport, setShowSupport] = useState(false);
  const [supportView, setSupportView] = useState<"chat" | "faq" | "ticket" | "ticket_status">("chat");
  const [supportMessages, setSupportMessages] = useState<{ id: string; sender: "user" | "ai"; text: string }[]>([]);
  const [supportInput, setSupportInput] = useState("");
  const [supportLoading, setSupportLoading] = useState(false);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketDesc, setTicketDesc] = useState("");
  const [ticketCategory, setTicketCategory] = useState("");
  const [ticketSent, setTicketSent] = useState(false);
  const [ticketSending, setTicketSending] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [myTickets, setMyTickets] = useState<SupportTicket[]>([]);
  const [myTicketsLoading, setMyTicketsLoading] = useState(false);
  const [ticketReplyDraft, setTicketReplyDraft] = useState("");
  const [ticketReplySending, setTicketReplySending] = useState(false);
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [ticketAttachFile, setTicketAttachFile] = useState<File | null>(null);
  const [showAppeal, setShowAppeal] = useState(false);
  const [appealReason, setAppealReason] = useState("");
  const [appealLoading, setAppealLoading] = useState(false);
  const [appealResult, setAppealResult] = useState<{ success: boolean; message: string } | null>(null);
  const supportEndRef = useRef<HTMLDivElement>(null);

  const handleSubmitAppeal = async () => {
    if (!appealReason.trim()) return;
    setAppealLoading(true);
    setAppealResult(null);
    try {
      const id = await tenantSubmitAppeal(appealReason.trim());
      if (id) {
        setAppealResult({ success: true, message: "Rayuan anda telah dihantar kepada HQ untuk semakan." });
        setAppealReason("");
      } else {
        setAppealResult({ success: false, message: "Gagal menghantar rayuan. Sila cuba lagi." });
      }
    } finally {
      setAppealLoading(false);
    }
  };

  const wsId = activeWorkspace?.id || "";
  const tenantId = activeTenant?.id || user?.id || "guest";
  const storageQuota = useStorageQuota(tenantId, wsId || undefined);
  const aiCredits = useAiCredits(tenantId, wsId || undefined);
  const ocrCredits = useOcrCredits(tenantId, wsId || undefined);
  const firstName = user?.fullName?.split(" ")[0] || "Anda";
  const startEditAccount = () => { setAccountDraft({ fullName: user?.fullName || "", email: user?.email || "" }); setAccountMsg(null); setEditingAccount(true); };
  const saveAccount = async () => {
    setAccountSaving(true);
    const res = await updateProfile(accountDraft.fullName, accountDraft.email);
    setAccountSaving(false);
    setAccountMsg(res.message);
    if (res.success) setEditingAccount(false);
  };
  const greeting = getGreeting();
  const today = new Date().toLocaleDateString("ms-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const [txnFilterFrom, setTxnFilterFrom] = useState("");
  const [txnFilterTo, setTxnFilterTo] = useState("");
  const [editingTxnId, setEditingTxnId] = useState<string | null>(null);
  const [editTxnDraft, setEditTxnDraft] = useState({ amountMyr: "", categoryName: "", partyName: "", date: "", businessId: "", branchId: "" });
  const txnReceiptInputRef = useRef<HTMLInputElement>(null);
  const [uploadingTxnReceipt, setUploadingTxnReceipt] = useState(false);
  const evidenceByRecordId = useMemo(() => {
    const map: Record<string, typeof financialEvidencePackages> = {};
    financialEvidencePackages.forEach(pkg => {
      if (!pkg.relatedRecordId) return;
      (map[pkg.relatedRecordId] ||= []).push(pkg);
    });
    return map;
  }, [financialEvidencePackages]);
  const previewTxnEvidence = async (pkg: { fileUrl: string }) => {
    const url = pkg.fileUrl.startsWith("http") ? pkg.fileUrl : await getDocumentUrl(pkg.fileUrl);
    if (url) window.open(url, "_blank");
  };
  const startEditTxn = (ev: { id: string; amountMyr: number; categoryName: string; partyName: string; date: string; businessId?: string; branchId?: string }) => {
    setEditingTxnId(ev.id);
    setEditTxnDraft({ amountMyr: String(ev.amountMyr), categoryName: ev.categoryName, partyName: ev.partyName, date: ev.date, businessId: ev.businessId || "", branchId: ev.branchId || "" });
  };
  const attachTxnReceipt = async (ev: { id: string; type: string }, file: File) => {
    if (!activeWorkspace) return;
    setUploadingTxnReceipt(true);
    try {
      if (!isSupabaseConfigured() || isMockUser || !supabase || isDemoWorkspace(activeWorkspace.id) || !user) return;
      const { doc, error } = await uploadDocument(file, activeWorkspace.id, user.id, "RECEIPT");
      if (error || !doc) return;
      addFinancialEvidencePackage({
        workspaceId: activeWorkspace.id,
        documentType: "RECEIPT",
        uploadDate: new Date().toISOString().slice(0, 10),
        fileName: doc.file_name,
        fileUrl: doc.file_path_supabase,
        relatedRecordType: ev.type,
        relatedRecordId: ev.id,
      });
    } finally {
      setUploadingTxnReceipt(false);
    }
  };
  const saveEditTxn = () => {
    if (!editingTxnId) return;
    const editedEvent = financialEvents.find(e => e.id === editingTxnId);
    editFinancialEvent(editingTxnId, {
      amountMyr: Number(editTxnDraft.amountMyr) || 0,
      categoryName: editTxnDraft.categoryName,
      partyName: editTxnDraft.partyName,
      date: editTxnDraft.date,
      businessId: editTxnDraft.businessId || undefined,
      branchId: editTxnDraft.businessId ? (editTxnDraft.branchId || undefined) : undefined,
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
  const [healthFilterRecordIds, setHealthFilterRecordIds] = useState<string[] | null>(null);
  const [healthFilterLabel, setHealthFilterLabel] = useState<string>("");
  const [showDuplicateQueue, setShowDuplicateQueue] = useState(false);
  const [showImportRecovery, setShowImportRecovery] = useState(false);
  const [importFailureRefresh, setImportFailureRefresh] = useState(0);
  // Phase 2D.1 — Financial Overview (Section 1): mirrors OwnerDashboard.tsx's
  // day/week/month/year period toggle so both screens show totals scoped to
  // the same window — previously Staff summed all-time while Owner summed
  // only the selected period, making the two screens' totals diverge.
  const [dashboardPeriod, setDashboardPeriod] = useState<"day" | "week" | "month" | "year">("month");
  const nowIso = new Date().toISOString().slice(0, 10);
  const periodRange = useMemo(() => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const [y, m, d] = nowIso.split("-").map(Number);
    const today = new Date(y, (m || 1) - 1, d || 1);
    if (dashboardPeriod === "day") {
      const iso = toIso(today);
      return { from: iso, to: iso, label: today.toLocaleDateString("ms-MY", { day: "numeric", month: "long", year: "numeric" }) };
    }
    if (dashboardPeriod === "week") {
      const dow = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - ((dow + 6) % 7));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { from: toIso(monday), to: toIso(sunday), label: `${monday.toLocaleDateString("ms-MY", { day: "numeric", month: "short" })} - ${sunday.toLocaleDateString("ms-MY", { day: "numeric", month: "short" })}` };
    }
    if (dashboardPeriod === "year") {
      return { from: `${today.getFullYear()}-01-01`, to: `${today.getFullYear()}-12-31`, label: String(today.getFullYear()) };
    }
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { from: toIso(new Date(today.getFullYear(), today.getMonth(), 1)), to: toIso(lastDay), label: today.toLocaleDateString("ms-MY", { month: "long", year: "numeric" }) };
  }, [dashboardPeriod, nowIso]);
  const filteredRecords = useMemo(() => {
    if (healthFilterRecordIds) {
      const idSet = new Set(healthFilterRecordIds);
      return myRecords.filter(r => idSet.has(r.id));
    }
    return myRecords.filter(r => (!txnFilterFrom || r.date >= txnFilterFrom) && (!txnFilterTo || r.date <= txnFilterTo));
  }, [myRecords, txnFilterFrom, txnFilterTo, healthFilterRecordIds]);
  const allChatSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const list: ChatSuggestion[] = [];
    chatMessages.forEach(m => (m.suggestions || []).forEach(s => {
      if (!seen.has(s.id)) { seen.add(s.id); list.push(s); }
    }));
    return list;
  }, [chatMessages]);
  const importFailures = useMemo(
    () => (activeWorkspace ? getImportFailures(activeWorkspace.id) : []),
    [activeWorkspace, importFailureRefresh]
  );
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages, chatLoading]);
  // M-01: revoke all tracked evidence preview object URLs on unmount.
  useEffect(() => () => { Object.values(evidencePreviewUrls).forEach(url => URL.revokeObjectURL(url)); }, [evidencePreviewUrls]);
  // M-03: stop the MediaRecorder on unmount so it doesn't keep the mic busy.
  useEffect(() => () => { if (chatMediaRecorderRef.current && chatMediaRecorderRef.current.state !== "inactive") chatMediaRecorderRef.current.stop(); }, []);

  useEffect(() => {
    if (!wsId || !user) return;
    let active = true;
    // A fresh login already archived the previous session and cleared the
    // local pointer (see AuthContext signIn/endActiveSession), so this either
    // resumes the same session across a page refresh or starts a new one —
    // older conversations stay reachable via Arkib Perbualan either way.
    getOrCreateActiveSession(user.id, wsId, isMockUser).then(sessionId => {
      if (!active) return;
      setActiveSessionId(sessionId);
      loadActiveSessionMessages(sessionId, isMockUser, wsId).then(history => {
        if (!active) return;
        setChatMessages(history.map(h => ({ id: h.id, sender: h.sender, text: h.text, suggestions: h.suggestions, createdAt: h.createdAt, attachmentUrl: h.attachmentUrl, attachmentName: h.attachmentName, attachmentType: h.attachmentType })));
      });
    });
    loadChatHistory(wsId, isMockUser).then(history => {
      if (!active) return;
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
      if (active) setChatSuggestionStatus(normalized);
    } catch {
      if (active) setChatSuggestionStatus({});
    }
    // R-01: restore per-suggestion business/branch/evidence picks so a refresh
    // mid-confirmation doesn't lose the user's selections.
    try {
      const extraStored = localStorage.getItem(`mykerani_chat_suggestion_extra_${wsId}`);
      if (extraStored && active) setChatSuggestionExtra(JSON.parse(extraStored));
      const evidenceStored = localStorage.getItem(`mykerani_chat_suggestion_evidence_${wsId}`);
      if (evidenceStored && active) {
        const parsedEvidence = JSON.parse(evidenceStored);
        pendingChatEvidenceRef.current = parsedEvidence;
      }
    } catch {
      // best-effort only
    }
    // R-02: restore accounting-banner dismissal state.
    try {
      const bannerStored = localStorage.getItem(`mykerani_accounting_banner_dismissed_${wsId}`);
      if (bannerStored && active) setAccountingBannerDismissed(JSON.parse(bannerStored));
    } catch {
      // best-effort only
    }
    return () => { active = false; };
  }, [wsId, isMockUser, user]);

  // Persist confirmed/rejected suggestion status to localStorage so refresh/remount cannot
  // forget it and re-trigger a duplicate database insert via handleChatConfirmSuggestion.
  const markChatSuggestionStatus = (id: string, status: ChatSuggestionStatus, wsIdArg?: string) => {
    const scopeWsId = wsIdArg || wsId;
    setChatSuggestionStatus(prev => {
      const next = { ...prev, [id]: status };
      if (scopeWsId) {
        try {
          localStorage.setItem(chatSuggestionStatusKey(scopeWsId), JSON.stringify(next));
        } catch {
          // best-effort only
        }
      }
      return next;
    });
  };
  useEffect(() => { supportEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [supportMessages, supportLoading]);
  // R-01/R-02: persist per-suggestion extra state, pending evidence, and
  // accounting-banner dismissal so a refresh mid-confirmation restores them.
  useEffect(() => {
    if (!wsId) return;
    try { localStorage.setItem(`mykerani_chat_suggestion_extra_${wsId}`, JSON.stringify(chatSuggestionExtra)); } catch { /* best-effort */ }
    try { localStorage.setItem(`mykerani_chat_suggestion_evidence_${wsId}`, JSON.stringify(pendingChatEvidenceRef.current)); } catch { /* best-effort */ }
  }, [wsId, chatSuggestionExtra]);
  useEffect(() => {
    if (!wsId) return;
    try { localStorage.setItem(`mykerani_accounting_banner_dismissed_${wsId}`, JSON.stringify(accountingBannerDismissed)); } catch { /* best-effort */ }
  }, [wsId, accountingBannerDismissed]);
  useEffect(() => {
    if (supportView !== "ticket_status" || isMockUser) return;
    let active = true;
    setMyTicketsLoading(true);
    getMyTenantSupportTickets().then(tickets => { if (active) { setMyTickets(tickets); setMyTicketsLoading(false); } });
    return () => { active = false; };
  }, [supportView, isMockUser]);

  const [personalProfile, setPersonalProfile] = useState(EMPTY_PERSONAL_PROFILE);
  const [businessProfile, setBusinessProfile] = useState(EMPTY_BUSINESS_PROFILE);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [dependents, setDependents] = useState<Dependent[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [profileLoading, setProfileLoading] = useState(true);
  const profileLoadingRef = useRef(profileLoading);
  useEffect(() => { profileLoadingRef.current = profileLoading; }, [profileLoading]);
  useEffect(() => {
    if (!wsId) return;
    setProfileLoading(true);
    Promise.all([
      loadPersonalProfile(wsId, isMockUser).then(setPersonalProfile),
      loadBusinessProfile(wsId, isMockUser).then(setBusinessProfile),
      loadVehicles(wsId, isMockUser).then(setVehicles),
      loadDependents(wsId, isMockUser).then(setDependents),
      loadBusinesses(wsId, isMockUser).then(setBusinesses),
    ]).finally(() => setProfileLoading(false));
  }, [wsId, isMockUser]);

  const [allBranchesLoaded, setAllBranchesLoaded] = useState(false);
  // Branch Mapping needs every active business's branches available up front,
  // same as OwnerDashboard.tsx, so the shared matching engine below can check
  // a chat suggestion's text against the full branch list before Sahkan.
  useEffect(() => {
    if (!wsId || allBranchesLoaded) return;
    const activeBusinesses = businesses.filter((b) => b.isActive);
    if (activeBusinesses.length === 0) return;
    setAllBranchesLoaded(true);
    Promise.all(activeBusinesses.map((b) => loadBusinessBranches(wsId, isMockUser, b.id).then((branches) => ({ id: b.id, branches }))))
      .then((results) => {
        setBusinessBranches((prev) => {
          const next = { ...prev };
          results.forEach(({ id, branches }) => { next[id] = branches; });
          return next;
        });
      })
      .catch(() => { /* best-effort only */ });
  }, [wsId, businesses, allBranchesLoaded]);

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

  const sendChat = async (text?: string, attachment?: { documentType: "RECEIPT"; fileName: string; fileUrl: string }) => {
    const q = (text || chatInput).trim();
    if (!q || chatLoading) return;
    // Gap H-07: enforce AI credit quota before consuming credits
    if (aiCredits.total > 0 && aiCredits.used >= aiCredits.total) {
      setChatMessages(prev => [...prev, { id: `e-${Date.now()}`, sender: "ai", text: "Kredit AI habis. Sila hubungi pemilik untuk menambah kredit." }]);
      return;
    }
    if (profileLoading) {
      // Issue #5 fix: personalProfile/businesses/vehicles are still mid-fetch
      // (e.g. right after login/workspace switch) — sending now would ship an
      // empty financialContext to the AI, making the workspace look like it
      // has no profile/vehicles at all. Wait for the in-flight load instead.
      // Bounded to 8s: if the underlying loaders never settle (a hung/dropped
      // query), profileLoading would otherwise stay true forever and this await
      // would block sendChat indefinitely with zero feedback — proceed with
      // whatever context is available rather than hang the chat. Same fix as
      // OwnerDashboard.tsx's sendChat.
      await new Promise<void>(resolve => {
        const deadline = Date.now() + 8000;
        const check = () => {
          if (!profileLoadingRef.current || Date.now() >= deadline) resolve();
          else setTimeout(check, 100);
        };
        check();
      });
    }
    setChatInput("");
    setChatMessages(prev => [...prev, { id: `u-${Date.now()}`, sender: "user", text: q, createdAt: new Date().toISOString() }]);
    saveChatMessage(wsId, user?.id, isMockUser, { sender: "user", text: q }, activeSessionId ?? undefined);
    setChatLoading(true);
    try {
      const { getAuthHeader } = await import("../lib/supabase");
      // The server can try multiple AI candidates in sequence (each with its own
      // ~90s upstream timeout), which can exceed a typical gateway timeout and leave
      // this fetch neither resolved nor rejected. Bound it client-side so chat always
      // gets a reply. Same engine/fix as OwnerDashboard.tsx's sendChat.
      const assistantController = new AbortController();
      const assistantTimeoutId = setTimeout(() => assistantController.abort(), 110000);
      let res: Response;
      try {
        res = await fetch("/api/ai/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
          body: JSON.stringify({
            query: q,
            financialContext: { activeTenant, activeWorkspace, financialEvents, cashAccounts, bankAccounts, personalProfile, businessProfile, businesses, businessBranches, vehicles, dependents },
            userId: user?.id,
          }),
          signal: assistantController.signal,
        });
      } finally {
        clearTimeout(assistantTimeoutId);
      }
      const data = await res.json() as any;
      if (res.status === 403) {
        setChatMessages(prev => [...prev, { id: `a-${Date.now()}`, sender: "ai", text: data.error || "Akaun anda telah disekat." }]);
        setChatLoading(false);
        return;
      }
      if (res.status === 402) {
        setChatMessages(prev => [...prev, { id: `a-${Date.now()}`, sender: "ai", text: data.error || "Kredit AI anda telah habis. Sila hubungi pentadbir untuk menambah kredit." }]);
        setChatLoading(false);
        return;
      }
      let reply = data.text || "Saya sedang cuba membantu anda.";
      reply = reply.replace(/tenant/gi, "syarikat").replace(/sandbox/gi, "ujian");
      const aiMsgId = `a-${Date.now()}`;
      const suggestions: ChatSuggestion[] = Array.isArray(data.suggestions)
        ? data.suggestions
            .filter((s: ChatSuggestion) => s.actionType === "CONFIRM_TRANSACTION")
            .map((s: ChatSuggestion, idx: number) => ({ ...enrichChatSuggestionPayload(s, { cashAccounts, bankAccounts, businesses, vehicles, dependents, personalProfile }), id: `${aiMsgId}-sugg-${idx}` }))
        : [];
      setChatMessages(prev => [...prev, { id: aiMsgId, sender: "ai", text: reply, suggestions, createdAt: new Date().toISOString() }]);
      saveChatMessage(wsId, user?.id, isMockUser, { sender: "ai", text: reply, suggestions }, activeSessionId ?? undefined);
      suggestions.forEach(s => checkCrossWorkspacePattern(s));
      const activeBusinesses = businesses.filter(b => b.isActive);
      // If this AI reply was triggered by an OCR/image/PDF attachment upload, that
      // attachment is the evidence for whatever transaction the AI now suggests —
      // pre-link it to every suggestion in this batch so confirming creates the
      // financial_evidence_packages row automatically, with no extra staff action.
      if (attachment) {
        suggestions.forEach(s => {
          pendingChatEvidenceRef.current[s.id] = attachment;
        });
      }
      setChatSuggestionExtra(prev => {
        const next = { ...prev };
        suggestions.forEach(s => {
          const evidenceStatus: ChatSuggestionExtra["evidenceStatus"] = attachment ? "ATTACHED" : "NONE";
          if (activeBusinesses.length === 0) {
            // No branch concept applies to the implicit "Personal" workspace —
            // branchPicked must be true here or the Sahkan button never renders
            // (its gate checks businessPicked && branchPicked && evidence).
            next[s.id] = { businessId: null, businessName: "Personal", businessPicked: true, branchPicked: true, evidenceStatus };
            return;
          }
          // Reuse the same Business/Branch Mapping engine as OwnerDashboard.tsx —
          // never duplicate the matching logic for AI Chat.
          const chatMatchText = [s.payload?.relatedParty, s.description, s.payload?.category].filter(Boolean).join(" ");
          const branchMatch = matchOwnBusinessAndBranch(chatMatchText, activeBusinesses, businessBranches);
          if (branchMatch && !branchMatch.ambiguous) {
            next[s.id] = {
              businessId: branchMatch.business.id,
              businessName: branchMatch.business.businessName,
              businessPicked: true,
              evidenceStatus,
              branchId: branchMatch.branch?.id ?? null,
              branchName: branchMatch.branch?.branchName ?? "",
              branchPicked: true,
              autoMapped: true,
            };
          } else if (branchMatch && branchMatch.ambiguous) {
            next[s.id] = {
              businessId: branchMatch.business.id,
              businessName: branchMatch.business.businessName,
              businessPicked: true,
              evidenceStatus,
              branchId: null,
              branchName: "",
              branchPicked: false,
              autoMapped: true,
              branchCandidates: branchMatch.candidateLabels,
            };
          } else {
            next[s.id] = { businessId: null, businessName: "", businessPicked: false, evidenceStatus };
          }
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
    const statusObj = chatSuggestionStatus[s.id];
    const savedAmount = statusObj?.editedAmount ?? s.payload?.amount;
    const savedCategory = statusObj?.editedCategory ?? s.payload?.category;
    const savedRelatedParty = statusObj?.editedRelatedParty ?? s.payload?.relatedParty;
    const savedDate = statusObj?.editedDate ?? s.payload?.date;
    const savedTransactionType = statusObj?.editedTransactionType ?? s.payload?.transactionType;
    setEditingChatSuggestionId(s.id);
    setChatEditDraft({
      amount: String(savedAmount ?? ""),
      category: savedCategory || "",
      relatedParty: savedRelatedParty || "",
      date: savedDate || new Date().toISOString().split("T")[0],
      transactionType: savedTransactionType || "",
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
      transactionType: s.payload?.transactionType || "",
    });
  };

  const handleChatPickBusiness = (suggestionId: string, businessId: string | null, businessName: string) => {
    setChatSuggestionExtra(prev => ({
      ...prev,
      [suggestionId]: {
        ...(prev[suggestionId] || { businessId: null, businessName: "", businessPicked: false, evidenceStatus: "NONE" }),
        businessId, businessName, businessPicked: true,
        // Manual business pick overrides any auto-mapping; branch must be re-resolved for the new business.
        branchId: null, branchName: "", branchPicked: !businessId || (businessBranches[businessId] || []).filter(br => br.isActive).length === 0,
        autoMapped: false, branchCandidates: undefined,
      },
    }));
  };

  const handleChatPickBranch = (suggestionId: string, branchId: string | null, branchName: string) => {
    setChatSuggestionExtra(prev => ({
      ...prev,
      [suggestionId]: { ...(prev[suggestionId] || { businessId: null, businessName: "", businessPicked: false, evidenceStatus: "NONE" }), branchId, branchName, branchPicked: true },
    }));
  };

  const handleChatEvidenceAttach = async (suggestionId: string, file: File) => {
    chatEvidenceFilesRef.current[suggestionId] = file;
    // M-01: create a tracked preview URL for image evidence so it can be revoked.
    if (file.type.startsWith("image/")) {
      const previewUrl = URL.createObjectURL(file);
      setEvidencePreviewUrls(prev => {
        const old = prev[suggestionId];
        if (old) URL.revokeObjectURL(old);
        return { ...prev, [suggestionId]: previewUrl };
      });
    }
    if (!activeWorkspace) return;

    let finalUrl: string | null = null;
    if (isSupabaseConfigured() && !isMockUser && supabase && !isDemoWorkspace(activeWorkspace.id) && user) {
      const { doc, error } = await uploadDocument(file, activeWorkspace.id, user.id, "RECEIPT");
      if (!error && doc) finalUrl = doc.file_path_supabase;
    }
    if (!finalUrl) {
      finalUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    // The financial record doesn't exist yet at this point in the chat flow — the
    // evidence package gets linked to it (relatedRecordId) once Sahkan creates the
    // record, via the pending evidence info kept here.
    pendingChatEvidenceRef.current[suggestionId] = {
      documentType: "RECEIPT",
      fileName: file.name,
      fileUrl: finalUrl,
    };
    setChatSuggestionExtra(prev => ({
      ...prev,
      [suggestionId]: { ...(prev[suggestionId] || { businessId: null, businessName: "Personal", businessPicked: true, branchPicked: true, evidenceStatus: "NONE" }), evidenceStatus: "ATTACHED" },
    }));
  };

  const handleChatEvidenceSkip = (suggestionId: string) => {
    setChatSuggestionExtra(prev => ({
      ...prev,
      [suggestionId]: { ...(prev[suggestionId] || { businessId: null, businessName: "Personal", businessPicked: true, branchPicked: true, evidenceStatus: "NONE" }), evidenceStatus: "SKIPPED" },
    }));
  };

  const handleChatConfirmSuggestion = async (s: ChatSuggestion, edited?: typeof chatEditDraft) => {
    if (!activeWorkspace || chatSuggestionStatus[s.id]?.status === "confirmed") return;
    // R-06: Permission check before allowing record creation
    if (!hasPermission('Financial Records', 'create')) {
      setChatMessages(prev => [...prev, { id: `e-${Date.now()}`, sender: "ai", text: "Anda tidak mempunyai kebenaran untuk menyimpan rekod kewangan." }]);
      return;
    }
    // S-01: capture the workspace id at call time so a switch mid-flight
    // doesn't persist this suggestion's status under the wrong workspace key.
    const wsIdAtCall = wsId;
    setConfirmingChatId(s.id);
    setChatActionErrors(prev => { const next = { ...prev }; delete next[s.id]; return next; });
    const extra = chatSuggestionExtra[s.id];
    if (!extra || !extra.businessPicked) return;

    try {
    const result = await confirmChatSuggestion(s, extra, edited, pendingChatEvidenceRef.current[s.id]);
    if (!result.ok) {
      setChatActionErrors(prev => ({ ...prev, [s.id]: result.error || "Ralat tidak diketahui." }));
      return;
    }
    delete pendingChatEvidenceRef.current[s.id];

    // Mark confirmed (and persist) only after the insert succeeded, capturing the new
    // record's id/type so a later post-confirm Edit can UPDATE instead of re-inserting.
    markChatSuggestionStatus(s.id, {
      status: "confirmed",
      recordId: result.recordId,
      recordType: result.recordType,
      confirmedAt: new Date().toISOString(),
      editedAmount: result.amount,
      editedCategory: result.category,
      editedRelatedParty: result.relatedParty,
      editedDate: result.date,
      editedTransactionType: result.transactionType as string | undefined,
      confirmedByName: user?.fullName || undefined,
      confirmedByUserId: user?.id || undefined,
    }, wsIdAtCall);

    // C-02: Log staff financial record action for owner review
    if (isSupabaseConfigured() && !isMockUser && user && activeWorkspace) {
      const isEdit = false; // This confirm path always creates a new record
      logTenantActivity({
        workspaceId: activeWorkspace.id,
        actorId: user.id,
        actorEmail: user.email || '',
        actorRole: user.role || 'TENANT_STAFF',
        actorName: user.fullName,
        actionType: 'RECORD_CREATED',
        module: 'Financial Records',
        description: `Staff telah ${isEdit ? 'kemaskini' : 'tambah'} rekod ${s.payload?.transactionType || 'kewangan'} — RM${s.payload?.amount || 0}`,
        metadata: { recordId: result.recordId, type: s.payload?.transactionType, amount: s.payload?.amount },
      }).catch(() => {}); // fire and forget
    }

    // M-01: trigger duplicate scan after confirming a chat suggestion record
    if (financialEvents.length > 0) {
      scanForDuplicates().catch(() => {});
    }

    setEditingChatSuggestionId(null);
    } finally {
      setConfirmingChatId(null);
    }
  };

  // Save an edit to an ALREADY-confirmed chat suggestion: update the saved record in place
  // (instead of inserting a new one) using the recordId/recordType captured at confirm time.
  const handleChatSaveConfirmedEdit = (s: ChatSuggestion, edited: typeof chatEditDraft) => {
    // PB-1: staff must have update permission to edit an already-confirmed record.
    if (!hasPermission('Financial Records', 'update')) { setChatActionErrors(prev => ({ ...prev, [s.id]: "Tiada kebenaran untuk mengubah rekod." })); return; }
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
      // INCOME / EXPENSE / RECEIVABLE / PAYABLE / TRANSFER all live in financialEvents.
      const editFields: any = { amountMyr, categoryName, partyName, date };
      if (edited.transactionType === "INCOME" || edited.transactionType === "EXPENSE" ||
          edited.transactionType === "RECEIVABLE" || edited.transactionType === "PAYABLE") {
        editFields.type = edited.transactionType;
      }
      editFinancialEvent(current.recordId, editFields);
    }

    markChatSuggestionStatus(s.id, {
      ...current,
      status: "confirmed",
      editedAmount: amountMyr,
      editedCategory: categoryName,
      editedRelatedParty: partyName,
      editedDate: date,
      editedTransactionType: edited.transactionType || current.editedTransactionType,
    });
    setChatSuggestionJustUpdated(prev => ({ ...prev, [s.id]: true }));
    setEditingChatSuggestionId(null);
  };

  const handleSaveRecord = (data: { type: string; amount: number; description: string; party: string; date: string; category: string }) => {
    // R-06: Permission check before allowing record creation
    if (!hasPermission('Financial Records', 'create')) {
      alert("Anda tidak mempunyai kebenaran untuk menambah rekod.");
      return;
    }
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
    // C-02: Log staff record addition for owner review
    if (isSupabaseConfigured() && !isMockUser && user && activeWorkspace) {
      logTenantActivity({
        workspaceId: activeWorkspace.id,
        actorId: user.id,
        actorEmail: user.email || '',
        actorRole: user.role || 'TENANT_STAFF',
        actorName: user.fullName,
        actionType: 'RECORD_CREATED',
        module: 'Financial Records',
        description: `Staff tambah rekod ${data.type} — RM${data.amount}`,
        metadata: { type: data.type, amount: data.amount, category: categoryName, party: data.party, date: data.date },
      }).catch(() => {}); // fire and forget
    }
    // M-01: trigger duplicate scan after saving a financial record
    if (financialEvents.length > 0) {
      scanForDuplicates().catch(() => {});
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
      let evidenceFileUrl = "";
      if (canUploadChatAttachment && user) {
        const { doc, error, isDuplicate } = await uploadDocument(file, wsId, user.id, kind === "audio" ? "SUPPORTING_DOC" : "RECEIPT");
        if (doc && !error) {
          url = (await getDocumentUrl(doc.file_path_supabase)) || "";
          evidenceFileUrl = url || doc.file_path_supabase;
          if (isDuplicate) {
            setChatMessages(prev => [...prev, { id: `dup-${Date.now()}`, sender: "ai", text: `Fail "${file.name}" ini sudah pernah dimuat naik sebelum ini — saya guna rekod sedia ada, tidak muat naik dua kali.` }]);
          }
          logEvent({
            tenantId: activeWorkspace?.tenantId || "", workspaceId: wsId, userId: user?.id,
            userEmail: user?.email, userRole: user?.role, eventType: "UPLOAD",
            description: `Receipt/document uploaded via chat: ${file.name}`,
            metadata: { fileName: file.name, docId: doc.id, filePath: doc.file_path_supabase },
          });
        } else if (kind !== "audio") {
          // Storage success must be verified before OCR/AI ever runs on this file —
          // a receipt must never be analyzed if it was not actually persisted.
          setChatMessages(prev => [...prev, { id: `e-${Date.now()}`, sender: "ai", text: `Muat naik "${file.name}" gagal disimpan${error ? ` (${error})` : ""}. Sila cuba muat naik semula — saya tidak akan menganalisis fail yang gagal disimpan.` }]);
          return;
        }
      }
      if (!url) url = URL.createObjectURL(file);
      // Voice notes are transcribed, not filed as accounting evidence — only
      // OCR/image/PDF/attachment uploads become a linked financial_evidence_packages row.
      const evidenceAttachment = kind !== "audio"
        ? { documentType: "RECEIPT" as const, fileName: file.name, fileUrl: evidenceFileUrl || url }
        : undefined;

      const userMsgId = `u-${Date.now()}`;
      setChatMessages(prev => [...prev, {
        id: userMsgId, sender: "user", text: kind === "audio" ? "🎤 Nota suara" : `📎 ${file.name}`,
        createdAt: new Date().toISOString(), attachmentUrl: url, attachmentName: file.name, attachmentType: kind,
      }]);
      saveChatMessage(wsId, user?.id, isMockUser, {
        sender: "user", text: kind === "audio" ? "🎤 Nota suara" : `📎 ${file.name}`,
        attachmentUrl: url, attachmentName: file.name, attachmentType: kind,
      }, activeSessionId ?? undefined);

      // Actually read the attachment's content before asking the AI to act on it —
      // otherwise the assistant only sees a filename and can only say "please wait"
      // (image/pdf) or "I can't listen to audio" (voice notes), as it had no real
      // content to reason about.
      let extractedContext = "";
      try {
        // Same client-side bound as OwnerDashboard.tsx's uploadChatAttachment: the
        // server can try multiple AI candidates in sequence (each with its own ~90s
        // upstream timeout), which can exceed a typical gateway timeout and leave
        // this fetch neither resolved nor rejected — blocking the sendChat() call
        // below forever. Bound it client-side so chat always gets a reply.
        const attachmentController = new AbortController();
        const attachmentTimeoutId = setTimeout(() => attachmentController.abort(), 110000);
        try {
          if (kind === "audio") {
            const audioDataUrl = await fileToDataUrl(file);
            const { getAuthHeader } = await import("../lib/supabase");
            const res = await fetch("/api/ai/transcribe", {
              method: "POST",
              headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
              body: JSON.stringify({ fileDataUrl: audioDataUrl, fileName: file.name, tenantId: activeWorkspace?.tenantId, workspaceId: wsId, userId: user?.id }),
              signal: attachmentController.signal,
            });
            if (res.ok) {
              const { text } = await res.json();
              if (text) extractedContext = `Transkripsi nota suara: "${text}"`;
            }
          } else {
            // Gap H-07: enforce OCR credit quota before consuming credits
            if (ocrCredits.total > 0 && ocrCredits.used >= ocrCredits.total) {
              setChatMessages(prev => [...prev, { id: `e-${Date.now()}`, sender: "ai", text: "Kredit OCR habis. Sila hubungi pemilik untuk menambah kredit." }]);
              return;
            }
            const fileDataUrl = await fileToDataUrl(file);
            const { getAuthHeader } = await import("../lib/supabase");
            const res = await fetch("/api/ocr/analyze", {
              method: "POST",
              headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
              body: JSON.stringify({ fileDataUrl, fileName: file.name, documentType: "RECEIPT", tenantId: activeWorkspace?.tenantId, workspaceId: wsId, userId: user?.id }),
              signal: attachmentController.signal,
            });
            if (res.ok) {
              const payload = await res.json();
              extractedContext = `Maklumat dibaca daripada dokumen: merchant=${payload.merchantName || "-"}, tarikh=${payload.date || "-"}, jumlah=${payload.amount ?? "-"}, kategori cadangan=${payload.suggestedCategory || "-"}.`;
              logEvent({
                tenantId: activeWorkspace?.tenantId || "", workspaceId: wsId, userId: user?.id,
                userEmail: user?.email, userRole: user?.role, eventType: "OCR_PROCESS",
                description: `Staff processed document via OCR: ${file.name}`,
                metadata: { fileName: file.name, merchantName: payload.merchantName, amount: payload.amount, suggestedCategory: payload.suggestedCategory },
              });
            }
          }
        } finally {
          clearTimeout(attachmentTimeoutId);
        }
      } catch {
        // best-effort (including a client-side timeout abort) — fall back to the
        // plain acknowledgment below; sendChat() below still always fires.
      }

      await sendChat(
        kind === "audio"
          ? (extractedContext ? `Saya hantar nota suara berkaitan transaksi. ${extractedContext} Sila semak dan bantu saya rekod jika perlu.` : "Saya hantar nota suara berkaitan transaksi. Sila semak dan bantu saya rekod jika perlu.")
          : (extractedContext ? `Saya muat naik dokumen "${file.name}". ${extractedContext} Sila semak dan bantu saya rekod transaksi berkaitan jika ada.` : `Saya muat naik dokumen "${file.name}". Sila semak dan bantu saya rekod transaksi berkaitan jika ada.`),
        evidenceAttachment
      );
    } catch {
      // Any unhandled failure anywhere above (upload, signed-URL fetch,
      // saveChatMessage, etc.) must never silently drop the attachment —
      // this was the root cause of "no attachment appears, no AI response,
      // refresh required": uploadChatAttachment() is fire-and-forget at the
      // call site, so without this catch a thrown error here vanished with
      // no trace and no user-visible feedback. Same fix as OwnerDashboard.tsx.
      setChatMessages(prev => [...prev, { id: `e-${Date.now()}`, sender: "ai", text: `Muat naik "${file.name}" gagal — sambungan terputus. Sila cuba lagi.` }]);
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

  // Issue #3 fix: "Muat Naik Dokumen" tab and the Resit/Invois/Penyata
  // shortcuts previously had no onChange/onClick handlers at all (dead,
  // cosmetic UI — violates the "everything must be real" rule). Rather than
  // duplicating Owner's separate document-review pipeline, these now route
  // into the same already-working, parity-verified chat attachment + OCR +
  // AI-suggestion pipeline used by the paperclip button in AI Chat, then
  // jump to Home so the user sees OCR/AI processing happen immediately.
  const docUploadInputRef = useRef<HTMLInputElement>(null);
  const triggerDocUpload = () => docUploadInputRef.current?.click();
  const handleDocUploadPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert("Saiz fail terlalu besar. Maksimum 10MB.");
      return;
    }
    const kind: "image" | "pdf" = file.type.startsWith("image/") ? "image" : "pdf";
    setActiveTab("home");
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
    { label: "Tambah perbelanjaan", action: () => { setAddDefaultType("EXPENSE"); setShowQuickAdd(true); } },
    { label: "Tambah pendapatan", action: () => { setAddDefaultType("INCOME"); setShowQuickAdd(true); } },
    { label: "Muat naik resit", action: () => setActiveTab("documents") },
  ];

  return (
    <div className="h-screen flex flex-col lg:flex-row overflow-hidden mk-dark" id="staff_root" style={{background:"#F7F6F2"}}>
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

      {/* DESKTOP SIDEBAR */}
      <aside className="hidden lg:flex flex-col w-60 xl:w-64 bg-white border-r border-slate-100 shrink-0 z-20" id="staff_sidebar">
        <div className="px-4 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold text-sm shrink-0" style={{boxShadow:"0 2px 8px rgba(34,197,94,0.20)"}}>MK</div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-900 text-sm">MYKERANI</span>
                <span className="text-3xs font-bold bg-emerald-600 text-white px-1.5 py-0.5 rounded-md">V1.0</span>
              </div>
              {activeWorkspace && <p className="text-2xs text-slate-400 leading-none mt-0.5 truncate">{activeWorkspace.name}</p>}
            </div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {([
            { id: "home" as StaffTab, label: "Home", icon: Home },
            { id: "dashboard" as StaffTab, label: "Rekod Saya", icon: LayoutDashboard },
            { id: "documents" as StaffTab, label: "Dokumen", icon: FileText },
            { id: "more" as StaffTab, label: "Lagi", icon: MoreHorizontal },
          ]).map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button key={id}
                onClick={() => setActiveTab(id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer text-left ${
                  active ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}>
                <Icon className={`w-4 h-4 shrink-0 ${active ? "text-white" : "text-slate-400"}`} />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
        <div className="p-3 border-t border-slate-100 space-y-2 shrink-0">
          <div className="flex items-center gap-2 px-1.5 py-1">
            <div className="w-7 h-7 rounded-full bg-slate-700 text-white flex items-center justify-center text-xs font-bold shrink-0">
              {firstName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-800 truncate">{firstName}</p>
              <p className="text-2xs text-slate-500 font-medium">Staf</p>
            </div>
            <button onClick={() => signOut()}
              className="p-1.5 hover:bg-rose-50 rounded-lg transition cursor-pointer text-slate-400 hover:text-rose-500">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Content column */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

      {/* â"€â"€ HEADER â"€â"€ */}
      <header className="bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between shrink-0" id="staff_header">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold text-sm shrink-0" style={{boxShadow:"0 2px 6px rgba(34,197,94,0.18)"}}>MK</div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-bold text-slate-900 text-sm">MYKERANI</span>
              <span className="text-3xs font-bold bg-emerald-600 text-white px-1.5 py-0.5 rounded-md">V1.0</span>
            </div>
            {activeWorkspace && <p className="text-2xs text-slate-400 leading-none mt-0.5">{activeWorkspace.name}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {workspaces.length > 1 && (
            <select value={activeWorkspace?.id || ""} onChange={e => selectWorkspace(e.target.value)}
              className="text-xs font-semibold border border-slate-200 rounded-lg px-2 py-1 bg-white outline-none cursor-pointer">
              {workspaces.map(ws => <option key={ws.id} value={ws.id}>{ws.name}</option>)}
            </select>
          )}
          <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
            <div className="w-5 h-5 rounded-full bg-slate-700 text-white flex items-center justify-center text-3xs font-bold">
              {firstName.charAt(0).toUpperCase()}
            </div>
            <span className="text-xs font-semibold text-slate-700 hidden sm:block">{firstName}</span>
            <span className="text-2xs text-slate-400 hidden sm:block">·</span>
            <span className="text-2xs text-slate-500 font-semibold hidden sm:block">Kakitangan</span>
          </div>
          <button onClick={() => setShowNotifications(true)}
            className="p-1.5 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-slate-400 hover:text-indigo-500 rounded-xl transition cursor-pointer active:scale-95"
            title="Notifikasi Ruang Kerja">
            <Bell className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setShowAuditHistory(true)}
            className="p-1.5 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 text-slate-400 hover:text-emerald-600 rounded-xl transition cursor-pointer active:scale-95"
            title="Sejarah Tindakan Saya">
            <ShieldCheck className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => signOut()}
            className="p-1.5 bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-400 hover:text-rose-500 rounded-xl transition cursor-pointer active:scale-95">
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Notification Center modal — GAP-H3: Staff previously had no
          access to the workspace_notifications closed loop at all. */}
      {showNotifications && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-start sm:items-center justify-center p-4" onClick={() => setShowNotifications(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto mt-12 sm:mt-0" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white">
              <h3 className="font-bold text-slate-900 text-sm">Notifikasi</h3>
              <button onClick={() => setShowNotifications(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4">
              <NotificationCenterConsole />
            </div>
          </div>
        </div>
      )}

      {/* Personal audit history modal — GAP-M9: pairs with M1's RLS
          narrowing so Staff can see their own action trail (audit_logs
          RLS now scopes SELECT to own user_id for TENANT_STAFF/HQ_STAFF). */}
      {showAuditHistory && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-start sm:items-center justify-center p-4" onClick={() => setShowAuditHistory(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-y-auto mt-12 sm:mt-0" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h3 className="font-bold text-slate-900 text-sm">Sejarah Tindakan Saya</h3>
              <button onClick={() => setShowAuditHistory(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4">
              <AuditConsole />
            </div>
          </div>
        </div>
      )}

      {/* â"€â"€ MAIN â"€â"€ */}
      <div className="flex-1 overflow-hidden flex flex-col" id="staff_main">

        {/* â•â•â•â• HOME â€" AI CONVERSATION â•â•â•â• */}
        {activeTab === "home" && (
          <div className="flex-1 flex flex-col overflow-hidden" id="staff_home_pane">

            {chatMessages.length > 0 && (
              <div className="px-4 pt-3 flex justify-end shrink-0">
                <button type="button" onClick={() => setChatMessages([])}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer flex items-center gap-1">
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
                  <p className="text-xs text-slate-400">{today}</p>
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
                            <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer" title={msg.attachmentName}
                              className={`flex items-center gap-2 mb-2 px-3 py-2 rounded-xl text-xs font-semibold max-w-[220px] truncate ${isUser ? "bg-slate-600" : "bg-slate-100 text-slate-700"}`}>
                              <FileIcon className="w-4 h-4 shrink-0" /> <span className="truncate">{msg.attachmentName ? (msg.attachmentName.length > 20 ? msg.attachmentName.substring(0, 12) + "..." + msg.attachmentName.substring(msg.attachmentName.length - 5) : msg.attachmentName) : "Dokumen"}</span>
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
                              <div>Jenis: {TRANSACTION_TYPE_LABEL_MS[statusObj.editedTransactionType ?? s.payload?.transactionType ?? ""] || statusObj.editedTransactionType || s.payload?.transactionType || "-"}</div>
                              <div>Kategori: {statusObj.editedCategory ?? s.payload?.category ?? "-"}</div>
                              <div>Pihak Berkaitan: {statusObj.editedRelatedParty ?? s.payload?.relatedParty ?? "-"}</div>
                              <div>Tarikh: {statusObj.editedDate ?? s.payload?.date ?? "-"}</div>
                              <div>Jumlah: RM{Number(statusObj.editedAmount ?? s.payload?.amount ?? 0).toFixed(2)}</div>
                              <div>Confidence: <span className={`font-bold ${confidenceClass}`}>{confidencePct}%</span></div>
                            </div>
                            {status === "pending" && crossWorkspaceHints[s.id] && (
                              <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 text-2xs text-amber-800">
                                <span>Berdasarkan sejarah, "{s.payload?.relatedParty}" biasa direkodkan di bawah <strong>{crossWorkspaceHints[s.id].workspaceName}</strong>.</span>
                                <button
                                  type="button"
                                  onClick={() => selectWorkspace(crossWorkspaceHints[s.id].workspaceId)}
                                  className="shrink-0 px-2 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                                >
                                  Tukar
                                </button>
                              </div>
                            )}
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
                                  <div className="text-2xs text-slate-400">
                                    {new Date(statusObj.confirmedAt).toLocaleString("ms-MY", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                    {statusObj.confirmedByName && ` · ${statusObj.confirmedByName}`}
                                    {statusObj.confirmedByUserId && ` · ID: ${statusObj.confirmedByUserId.slice(0, 8)}`}
                                  </div>
                                )}
                                <button type="button" onClick={() => handleChatStartEdit(s)}
                                  disabled={statusObj.recordType === "TRANSFER" || !statusObj.recordId}
                                  className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold text-xs disabled:opacity-50 disabled:cursor-not-allowed">
                                  Edit
                                </button>
                              </div>
                            )}
                            {status === "pending" && (!extra.businessPicked || !extra.branchPicked || extra.evidenceStatus === "NONE") && (
                              <div className="bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5 text-2xs text-blue-800 font-medium">
                                ⚠️ Cadangan ini belum disahkan — lengkapkan langkah di bawah untuk melihat butang [Sahkan].
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
                              <div className="text-xs text-slate-500">
                                Bisnes: <span className="font-semibold text-slate-700">{extra.branchName ? `${extra.businessName} - ${extra.branchName}` : (extra.businessName || "Personal")}</span>
                                {extra.autoMapped && <span className="ml-1.5 text-2xs text-emerald-600 font-semibold">✓ Auto-mapped</span>}
                              </div>
                            )}
                            {status === "pending" && extra.businessPicked && extra.businessId && !extra.branchPicked && (
                              <div className="space-y-1.5 pt-1">
                                <p className="text-xs text-amber-600">
                                  {(extra.branchCandidates && extra.branchCandidates.length > 0)
                                    ? `Lebih daripada satu cawangan sepadan (${extra.branchCandidates.join(", ")}) — sila pilih cawangan:`
                                    : "Pilih cawangan (jika berkaitan):"}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {(businessBranches[extra.businessId] || []).filter(br => br.isActive).map(br => (
                                    <button key={br.id} type="button" onClick={() => handleChatPickBranch(s.id, br.id, br.branchName)}
                                      title={br.branchName}
                                      className="px-3 py-1.5 text-sm rounded-full bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 font-semibold truncate max-w-[160px]">
                                      {br.branchName}
                                    </button>
                                  ))}
                                  <button type="button" onClick={() => handleChatPickBranch(s.id, null, "")}
                                    className="px-3 py-1.5 text-sm rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-semibold">
                                    Tiada Cawangan Tertentu
                                  </button>
                                </div>
                              </div>
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
                            {chatActionErrors[s.id] && (
                              <div className="flex items-start gap-1.5 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1.5">
                                <span>{chatActionErrors[s.id]}</span>
                              </div>
                            )}
                            {status === "pending" && editingChatSuggestionId !== s.id && extra.businessPicked && !!extra.branchPicked && extra.evidenceStatus !== "NONE" && (
                              <div className="flex gap-2 pt-1">
                                <button type="button" onClick={() => handleChatConfirmSuggestion(s)} disabled={confirmingChatId === s.id} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed">Sahkan</button>
                                <button type="button" onClick={() => handleChatStartEdit(s)} className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold">Edit</button>
                                <button type="button" onClick={() => handleChatRejectSuggestion(s.id)} className="px-3 py-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 font-semibold">Tolak</button>
                              </div>
                            )}
                            {(status === "pending" || status === "confirmed") && editingChatSuggestionId === s.id && (
                              <div className="space-y-1.5 pt-1">
                                <select value={chatEditDraft.transactionType} onChange={e => setChatEditDraft(d => ({ ...d, transactionType: e.target.value }))} className="w-full px-2 py-1 rounded border border-slate-300 text-xs bg-white">
                                  <option value="">Jenis Transaksi...</option>
                                  <option value="INCOME">Pendapatan (Income)</option>
                                  <option value="EXPENSE">Perbelanjaan (Expense)</option>
                                  <option value="TRANSFER">Pemindahan (Transfer)</option>
                                  <option value="OWNER_TRANSACTION">Modal Pemilik (Owner Capital)</option>
                                  <option value="ASSET_PURCHASE">Belian Aset (Asset Purchase)</option>
                                  <option value="RECEIVABLE">Belum Terima (Receivable)</option>
                                  <option value="PAYABLE">Belum Bayar (Payable)</option>
                                  <option value="DEBT">Liabiliti (Liability)</option>
                                  <option value="COMMITMENT">Komitmen (Commitment)</option>
                                </select>
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

              {/* Loading — shown during both the attachment OCR/transcribe phase
                  (chatAttaching) and the AI assistant phase (chatLoading), so the
                  thread never goes visually silent while either fetch is in flight. */}
              {(chatAttaching || chatLoading) && (
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  </div>
                  <div className="px-4 py-3 bg-white border border-slate-200 rounded-2xl rounded-tl-none text-xs text-slate-400 shadow-sm animate-pulse">
                    {chatAttaching
                      ? "MYKERANI sedang membaca dokumen anda... Ini mungkin mengambil masa sehingga 2 minit. Sila jangan refresh halaman."
                      : "MYKERANI sedang menyemak..."}
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
                <button key={label} onClick={triggerDocUpload}
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
                    className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-xs font-bold cursor-pointer">
                    Hentikan & Hantar
                  </button>
                </div>
              )}
              <input ref={chatFileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleChatFilePicked} />
              <form onSubmit={e => { e.preventDefault(); sendChat(); }}
                className="flex items-center gap-2 bg-white border border-slate-300 rounded-2xl px-4 py-3 shadow-sm focus-within:border-slate-500 transition">
                <button type="button" onClick={() => chatFileInputRef.current?.click()} disabled={chatAttaching || chatRecording}
                  className="w-7 h-7 rounded-xl flex items-center justify-center text-indigo-600 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-40 cursor-pointer shrink-0 transition disabled:cursor-not-allowed active:scale-95">
                  <Paperclip className="w-4 h-4" />
                </button>
                <button type="button" onClick={chatRecording ? stopChatVoiceRecording : startChatVoiceRecording} disabled={chatAttaching}
                  className={`w-7 h-7 rounded-xl flex items-center justify-center disabled:opacity-40 cursor-pointer shrink-0 transition disabled:cursor-not-allowed active:scale-95 ${chatRecording ? "text-white bg-rose-500" : "text-emerald-600 bg-emerald-50 hover:bg-emerald-100"}`}>
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
                  className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center disabled:bg-slate-200 transition cursor-pointer shrink-0 disabled:cursor-not-allowed active:scale-95">
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>

              {/* Quick actions below input */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={() => { setAddDefaultType("EXPENSE"); setShowQuickAdd(true); }}
                  className="py-2 rounded-xl text-xs font-bold bg-rose-50 border border-rose-100 text-rose-600 transition cursor-pointer hover:bg-rose-100">
                  - Rekod Perbelanjaan
                </button>
                <button onClick={() => { setAddDefaultType("INCOME"); setShowQuickAdd(true); }}
                  className="py-2 rounded-xl text-xs font-bold bg-emerald-50 border border-emerald-100 text-emerald-600 transition cursor-pointer hover:bg-emerald-100">
                  + Rekod Pendapatan
                </button>
              </div>
            </div>
          </div>
        )}

        {/* â•â•â•â• TAMBAH REKOD â•â•â•â• */}
        {showQuickAdd && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center" onClick={() => setShowQuickAdd(false)}>
            <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto p-4" onClick={e => e.stopPropagation()} id="staff_add_pane">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-900">Tambah Rekod</h2>
                <button onClick={() => setShowQuickAdd(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>
              {!activeWorkspace ? (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
                  <p className="text-sm font-semibold text-amber-800">Sila pilih syarikat dahulu</p>
                </div>
              ) : (
                <AddRecordForm
                  defaultType={addDefaultType}
                  onSave={handleSaveRecord}
                  onDone={() => setShowQuickAdd(false)}
                />
              )}
            </div>
          </div>
        )}

        {/* â•â•â•â• MUAT NAIK â•â•â•â• */}
        {activeTab === "documents" && !showBankStatementImport && (
          <DocumentsManager
            workspaceId={wsId}
            workspaceName={activeWorkspace?.name || ""}
            tenantId={activeWorkspace?.tenantId}
            currentUserId={user?.id}
            currentUserEmail={user?.email}
            currentUserRole="TENANT_STAFF"
            currentUserFullName={user?.fullName}
            isMockUser={isMockUser}
            activeSessionId={activeSessionId}
            userNameById={userNameById}
            storageQuota={storageQuota}
            financialEvents={financialEvents}
            businesses={businesses}
            businessBranches={businessBranches}
            ocrLearnedPatterns={ocrLearnedPatterns}
            addFinancialEventAwaited={addFinancialEventAwaited}
            addFinancialEventsBatch={addFinancialEventsBatch}
            addFinancialEvidencePackage={addFinancialEvidencePackage}
            learnOcrPattern={learnOcrPattern}
            learnOcrPatternsBatch={learnOcrPatternsBatch}
            onBankStatementImport={() => setShowBankStatementImport(true)}
            docs={docs}
            onDocsChange={setDocs}
          />
        )}
        {activeTab === "documents" && showBankStatementImport && (
          <BankStatementProcessor
            onBack={() => setShowBankStatementImport(false)}
            onConfirmTransaction={async (tx: StatementTransaction, jobId: string) => {
              const wsId2 = activeWorkspace?.id || "";
              const tenantId2 = user?.tenantId || activeWorkspace?.tenantId || "";
              const recordType = tx.type === "CREDIT" ? "INCOME" : "EXPENSE";
              const fileName = `bank_statement_${jobId}`;
              const fileUrl = "";
              const input: ConfirmInput = {
                workspaceId: wsId2,
                tenantId: tenantId2,
                userId: user?.id,
                userEmail: user?.email,
                userRole: user?.role,
                transactionType: recordType as any,
                amount: tx.amount,
                category: tx.suggestedCategory || "Lain-lain",
                relatedParty: tx.description,
                date: tx.date,
                confidenceScore: tx.confidenceScore ?? 0.8,
                referenceNumber: `STMT-${jobId}-${tx.date}-${tx.amount}`,
                description: `Linked automated OCR bank statement line item: ${tx.description}`,
                pendingEvidence: { documentType: "STATEMENT", fileName, fileUrl },
                evidenceAttached: true,
                source: "BANK_STATEMENT",
                sourceTitle: `bank statement transaction: ${tx.description}`,
                auditDestination: "NONE",
                precheckDuplicate: false,
              };
              await confirmFinancialRecord(input, {
                addFinancialEventAwaited,
                addFinancialEvent,
                addDebtRecordAwaited,
                addDebtRecord,
                addFinancialCommitmentAwaited,
                addFinancialCommitment,
                addAssetPurchase: async () => undefined,
                addOwnerTransaction: async () => undefined,
                linkEvidenceToRecord,
                learnOcrPattern,
                scanForDuplicates: async () => [],
                logEvent: () => undefined,
                logTenantActivity: () => undefined,
              });
            }}
          />
        )}

        {/* â•â•â•â• REKOD â•â•â•â• */}
        {activeTab === "dashboard" && (
          <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-3 w-full pb-6" id="staff_records_pane">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Rekod Saya</h2>
                <p className="text-xs text-slate-400">{periodRange.label}</p>
              </div>
              <div className="flex bg-slate-100 rounded-xl p-0.5 gap-0.5">
                {([
                  { key: "day", label: "Harian" },
                  { key: "week", label: "Mingguan" },
                  { key: "month", label: "Bulanan" },
                  { key: "year", label: "Tahunan" },
                ] as const).map(({ key, label }) => (
                  <button key={key} onClick={() => setDashboardPeriod(key)}
                    className={`px-2 py-1.5 rounded-lg text-2xs font-bold transition cursor-pointer ${dashboardPeriod === key ? "bg-indigo-600 text-white shadow" : "text-slate-500 hover:bg-slate-200"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Section 4 — Recent Transactions (Staff operational scope: their
                own recorded transactions only — no income/expense totals,
                profit/loss, receivable/payable, or health score, which are
                owner-level financial intelligence per MYKERANI role
                separation). */}
            {myRecords.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center shadow-sm space-y-3">
                <ClipboardList className="w-10 h-10 text-slate-200 mx-auto" />
                <p className="text-sm text-slate-400">Tiada rekod lagi</p>
                <button onClick={() => setShowQuickAdd(true)}
                  className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-slate-800">
                  Tambah Rekod Pertama
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  {healthFilterRecordIds && (
                    <span className="text-2xs text-slate-500">Ditapis: {healthFilterLabel}</span>
                  )}
                  {(txnFilterFrom || txnFilterTo || healthFilterRecordIds) && (
                    <button onClick={() => { setTxnFilterFrom(""); setTxnFilterTo(""); setHealthFilterRecordIds(null); setHealthFilterLabel(""); }} className="text-2xs text-indigo-500 font-semibold cursor-pointer hover:underline">
                      Kosongkan tapisan
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 pb-1">
                  <input type="date" value={txnFilterFrom} onChange={e => setTxnFilterFrom(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600" />
                  <span className="text-2xs text-slate-400">hingga</span>
                  <input type="date" value={txnFilterTo} onChange={e => setTxnFilterTo(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600" />
                </div>
                {filteredRecords.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-3">Tiada transaksi dalam tempoh ini.</p>
                )}
                {filteredRecords.map(rec => (
                  <div key={rec.id} className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
                    {editingTxnId === rec.id ? (
                      <div className="space-y-1.5">
                        <input value={editTxnDraft.partyName} onChange={e => setEditTxnDraft(d => ({ ...d, partyName: e.target.value }))} placeholder="Pihak Berkaitan" className="w-full px-2 py-1 rounded border border-slate-300 text-xs" />
                        <input value={editTxnDraft.categoryName} onChange={e => setEditTxnDraft(d => ({ ...d, categoryName: e.target.value }))} placeholder="Kategori" className="w-full px-2 py-1 rounded border border-slate-300 text-xs" />
                        <input value={editTxnDraft.amountMyr} onChange={e => setEditTxnDraft(d => ({ ...d, amountMyr: e.target.value }))} type="number" placeholder="Jumlah (RM)" className="w-full px-2 py-1 rounded border border-slate-300 text-xs" />
                        <input value={editTxnDraft.date} onChange={e => setEditTxnDraft(d => ({ ...d, date: e.target.value }))} type="date" className="w-full px-2 py-1 rounded border border-slate-300 text-xs" />
                        <select value={editTxnDraft.businessId} onChange={e => setEditTxnDraft(d => ({ ...d, businessId: e.target.value, branchId: "" }))}
                          className="w-full px-2 py-1 rounded border border-slate-300 text-xs">
                          <option value="">Tiada Bisnes (Personal)</option>
                          {businesses.filter(b => b.isActive).map(b => (
                            <option key={b.id} value={b.id}>{b.businessName}</option>
                          ))}
                        </select>
                        {editTxnDraft.businessId && (businessBranches[editTxnDraft.businessId] || []).filter(br => br.isActive).length > 0 && (
                          <select value={editTxnDraft.branchId} onChange={e => setEditTxnDraft(d => ({ ...d, branchId: e.target.value }))}
                            className="w-full px-2 py-1 rounded border border-slate-300 text-xs">
                            <option value="">Tiada Cawangan Tertentu</option>
                            {(businessBranches[editTxnDraft.businessId] || []).filter(br => br.isActive).map(br => (
                              <option key={br.id} value={br.id}>{br.branchName}</option>
                            ))}
                          </select>
                        )}
                        <div className="pt-1">
                          <input ref={txnReceiptInputRef} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) attachTxnReceipt(rec, f); e.target.value = ""; }} />
                          {(evidenceByRecordId[rec.id] || []).map(pkg => (
                            <button key={pkg.id} type="button" onClick={() => previewTxnEvidence(pkg)}
                              className="w-full flex items-center gap-2 px-2 py-1.5 mb-1 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-semibold cursor-pointer hover:bg-emerald-100">
                              <Receipt className="w-3 h-3 shrink-0" /> <span className="truncate">{pkg.fileName}</span> <span className="ml-auto text-2xs text-emerald-500">Lihat</span>
                            </button>
                          ))}
                          <button type="button" onClick={() => txnReceiptInputRef.current?.click()} disabled={uploadingTxnReceipt}
                            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded border border-dashed border-slate-300 text-xs font-semibold text-slate-500 hover:border-indigo-400 hover:text-indigo-600 cursor-pointer disabled:opacity-50">
                            <Paperclip className="w-3 h-3" /> {uploadingTxnReceipt ? "Memuat naik..." : "Lampirkan Resit"}
                          </button>
                        </div>
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
                            <p className="text-xs text-slate-400">{rec.categoryName} · {rec.referenceNumber}</p>
                            <p className="text-2xs text-slate-300">
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

        {/* MORE */}
        {activeTab === "more" && (
          <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4 w-full pb-6" id="staff_profile_pane">
            <h2 className="text-lg font-bold text-slate-900">Profil Saya</h2>

            {/* Hero Profile Card — unified card replacing the old two-block layout */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
              {/* Header section with avatar + identity */}
              <div className="px-6 pt-6 pb-4 flex items-center space-x-4">
                <div className="w-16 h-16 rounded-2xl bg-slate-800 text-white flex items-center justify-center text-2xl font-bold shadow shrink-0">
                  {firstName.charAt(0).toUpperCase()}
                </div>
                {!editingAccount ? (
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900 truncate text-base">{user?.fullName || "Kakitangan"}</p>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{user?.email}</p>
                    <span className="text-2xs bg-indigo-50 text-indigo-700 font-bold px-2.5 py-1 rounded-full mt-1.5 inline-block">Kakitangan Syarikat</span>
                  </div>
                ) : (
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <input value={accountDraft.fullName} onChange={e => setAccountDraft(d => ({ ...d, fullName: e.target.value }))} placeholder="Nama penuh" className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm" />
                    <input value={accountDraft.email} onChange={e => setAccountDraft(d => ({ ...d, email: e.target.value }))} placeholder="Email" type="email" className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm" />
                  </div>
                )}
              </div>

              {/* Personal info merged inline (no separate Maklumat Peribadi block) */}
              {!editingAccount && (personalProfile.occupation || personalProfile.monthlyIncomeMyr) && (
                <div className="px-6 pb-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
                  {personalProfile.occupation && <span><span className="font-semibold text-slate-700">Pekerjaan:</span> {personalProfile.occupation}</span>}
                  {personalProfile.monthlyIncomeMyr && <span><span className="font-semibold text-slate-700">Pendapatan:</span> RM {Number(personalProfile.monthlyIncomeMyr).toLocaleString()}</span>}
                </div>
              )}

              {/* Edit / Save buttons */}
              <div className="px-6 pb-4">
                {accountMsg && (
                  <p className={`text-xs mb-3 ${accountMsg.startsWith("Profil") || accountMsg.startsWith("Nama") ? "text-emerald-600" : "text-rose-500"}`}>{accountMsg}</p>
                )}
                {!editingAccount ? (
                  <button onClick={startEditAccount} className="w-full py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 transition cursor-pointer">
                    Edit Profil
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={saveAccount} disabled={accountSaving} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 cursor-pointer">
                      {accountSaving ? "Menyimpan..." : "Simpan"}
                    </button>
                    <button onClick={() => setEditingAccount(false)} className="flex-1 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-sm font-semibold cursor-pointer">
                      Batal
                    </button>
                  </div>
                )}
              </div>

              {/* Divider + workspace info */}
              {activeWorkspace && (
                <div className="border-t border-slate-100 px-6 py-4 space-y-1">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Syarikat Aktif</p>
                  <p className="text-sm font-semibold text-slate-800">{activeWorkspace.name}</p>
                </div>
              )}
              <div className="border-t border-slate-100 px-6 py-3 text-xs text-slate-400 space-y-1">
                <p>Anda log masuk sebagai <span className="font-semibold text-slate-600">TENANT_STAFF</span></p>
                <p>Untuk tukar tetapan syarikat, hubungi Pemilik.</p>
              </div>

              {/* Support + Appeal buttons */}
              <div className="border-t border-slate-100 px-6 py-4 space-y-2">
                <button onClick={() => setShowSupport(true)}
                  className="w-full py-3 border border-indigo-200 text-indigo-600 rounded-xl text-sm font-semibold hover:bg-indigo-50 transition cursor-pointer flex items-center justify-center space-x-2">
                  <HelpCircle className="w-4 h-4" /><span>Pusat Sokongan</span>
                </button>

                <button onClick={() => { setShowAppeal(v => !v); setAppealResult(null); }}
                  className="w-full py-3 border border-amber-200 text-amber-600 rounded-xl text-sm font-semibold hover:bg-amber-50 transition cursor-pointer flex items-center justify-center space-x-2">
                  <AlertCircle className="w-4 h-4" /><span>Hantar Rayuan ke HQ</span>
                </button>
                {showAppeal && (
                  <div className="space-y-2 border border-amber-100 bg-amber-50 rounded-xl p-3">
                    <p className="text-xs text-slate-500">Jika akaun syarikat anda digantung atau dibekukan dan ini silap, hantar rayuan untuk semakan HQ.</p>
                    <textarea value={appealReason} onChange={e => setAppealReason(e.target.value)}
                      placeholder="Terangkan sebab rayuan anda..." rows={3}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 bg-white" />
                    <button onClick={handleSubmitAppeal} disabled={appealLoading || !appealReason.trim()}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold cursor-pointer transition">
                      {appealLoading ? "Menghantar..." : "Hantar Rayuan"}
                    </button>
                    {appealResult && (
                      <div className={`rounded-xl p-3 text-xs ${appealResult.success ? "bg-emerald-50 border border-emerald-200" : "bg-rose-50 border border-rose-200"}`}>
                        <p className={appealResult.success ? "text-emerald-600" : "text-rose-600"}>{appealResult.message}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Chat Archive + Sign Out */}
              <div className="border-t border-slate-100 px-6 py-4 space-y-3">
                <button onClick={() => setShowChatArchive(true)}
                  className="w-full py-3 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition cursor-pointer flex items-center justify-center space-x-2">
                  <MessageCircle className="w-4 h-4" /><span>Arkib Perbualan</span>
                </button>

                <button onClick={() => signOut()}
                  className="w-full py-3 border border-rose-200 text-rose-500 rounded-xl text-sm font-semibold hover:bg-rose-50 transition cursor-pointer">
                  Log Keluar
                </button>
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
            <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-3 w-full pb-6">
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
                          <p className="text-3xs text-slate-400">{dates.filter(d => d.startsWith(y)).reduce((n, d) => n + byDate[d].length, 0)} mesej</p>
                        </button>
                      ))}
                    </div>
                  );
                }
                if (!chatArchiveMonth) {
                  return (
                    <>
                      <button onClick={() => setChatArchiveYear(null)} className="text-xs text-indigo-500 font-semibold cursor-pointer hover:underline">← Tahun</button>
                      <div className="grid grid-cols-3 gap-2">
                        {monthsInYear.map(m => (
                          <button key={m} onClick={() => setChatArchiveMonth(m)}
                            className="px-2 py-3 rounded-xl text-center border bg-white border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer">
                            <p className="text-xs font-bold">{new Date(`${m}-01`).toLocaleDateString("ms-MY", { month: "long" })}</p>
                            <p className="text-3xs text-slate-400">{dates.filter(d => d.startsWith(m)).reduce((n, d) => n + byDate[d].length, 0)} mesej</p>
                          </button>
                        ))}
                      </div>
                    </>
                  );
                }
                return (
                  <>
                    <button onClick={() => setChatArchiveMonth(null)} className="text-xs text-indigo-500 font-semibold cursor-pointer hover:underline">← Bulan</button>
                    <div className="grid grid-cols-3 gap-2">
                      {daysInMonth.map(d => (
                        <button key={d} onClick={() => setChatArchiveDate(chatArchiveDate === d ? null : d)}
                          className={`px-2 py-2.5 rounded-xl text-center border transition cursor-pointer ${chatArchiveDate === d ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
                          <p className="text-xs font-bold">{new Date(d).toLocaleDateString("ms-MY", { day: "numeric", month: "short" })}</p>
                          <p className={`text-3xs ${chatArchiveDate === d ? "text-indigo-100" : "text-slate-400"}`}>{byDate[d].length} mesej</p>
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
                { id: "ticket_status" as const, label: "Status Tiket", icon: CheckCircle2 },
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
                  <button onClick={() => setSupportView("ticket")} className="mt-2 w-full text-center text-xs text-slate-400 hover:text-indigo-600 cursor-pointer">
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
                      <button onClick={() => { setTicketSent(false); setTicketSubject(""); setTicketDesc(""); setSupportView("ticket_status"); }}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold cursor-pointer">
                        Semak Status Tiket
                      </button>
                    </div>
                  ) : (
                    <>
                      <select value={ticketCategory} onChange={e => {
                        const key = e.target.value;
                        setTicketCategory(key);
                        const tmpl = SUPPORT_TICKET_TEMPLATES.find(t => t.key === key);
                        if (tmpl && tmpl.subject && !ticketSubject.trim()) setTicketSubject(tmpl.subject);
                      }}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 bg-white">
                        <option value="">Pilih jenis isu...</option>
                        {SUPPORT_TICKET_TEMPLATES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                      </select>
                      <input type="text" value={ticketSubject} onChange={e => setTicketSubject(e.target.value)}
                        placeholder="Tajuk masalah"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 bg-white" />
                      <textarea value={ticketDesc} onChange={e => setTicketDesc(e.target.value)}
                        placeholder="Terangkan masalah anda..." rows={4}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 bg-white resize-none" />
                      <input type="file" accept="image/*,.pdf,.doc,.docx" onChange={e => setTicketAttachFile(e.target.files?.[0] || null)}
                        className="w-full text-xs text-slate-500" />
                      {ticketError && (
                        <p className="text-xs font-bold text-red-600">{ticketError}</p>
                      )}
                      <button
                        onClick={async () => {
                          if (!ticketSubject.trim() || !ticketDesc.trim()) return;
                          setTicketSending(true);
                          setTicketError(null);
                          const ticketId = await createTenantSupportTicket(ticketSubject.trim(), ticketDesc.trim(), "medium", ticketCategory || undefined);
                          if (ticketId && ticketAttachFile && user?.tenantId) {
                            await uploadTicketAttachment(ticketId, user.tenantId, ticketAttachFile, user?.fullName || "Staf");
                          }
                          setTicketSending(false);
                          if (ticketId) { setTicketSent(true); setTicketAttachFile(null); }
                          else setTicketError("Gagal menghantar tiket. Sila cuba lagi.");
                        }}
                        disabled={!ticketSubject.trim() || !ticketDesc.trim() || ticketSending}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white rounded-xl text-sm font-bold transition cursor-pointer">
                        {ticketSending ? "Menghantar..." : "Hantar Tiket"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Ticket Status */}
            {supportView === "ticket_status" && (
              <div className="flex-1 overflow-y-auto p-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center space-x-2 mb-4">
                    <Ticket className="w-4 h-4 text-indigo-500" />
                    <h3 className="text-sm font-bold text-slate-900">Status Tiket Syarikat</h3>
                  </div>
                  {myTicketsLoading ? (
                    <div className="text-center py-6">
                      <RefreshCw className="w-5 h-5 text-slate-300 mx-auto animate-spin" />
                    </div>
                  ) : myTickets.length === 0 ? (
                    <div className="text-center py-6">
                      <CheckCircle2 className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                      <p className="text-xs text-slate-400">Tiada tiket aktif</p>
                      <button onClick={() => setSupportView("ticket")} className="mt-3 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold cursor-pointer">
                        Buka Tiket Baru
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {myTickets.map(t => {
                        const style = TICKET_STATUS_STYLE[t.status];
                        const sla = ticketSlaState(t);
                        const isOpen = openTicketId === t.id;
                        return (
                          <div key={t.id} className={`p-3 rounded-xl border ${style.bg}`}>
                            <button onClick={() => setOpenTicketId(isOpen ? null : t.id)} className="w-full flex items-start space-x-3 text-left cursor-pointer">
                              {style.icon === "check" ? <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${style.text}`} /> : <Clock className={`w-4 h-4 shrink-0 mt-0.5 ${style.text}`} />}
                              <div className="flex-1">
                                <p className={`text-xs font-bold ${style.text}`}>#{t.id.slice(0, 8)} — {t.subject}</p>
                                <p className={`text-xs mt-0.5 ${style.text}`}>Status: {TICKET_STATUS_LABEL_MS[t.status]}</p>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  <span className="text-2xs text-slate-400">Dihantar {new Date(t.createdAt).toLocaleDateString("ms-MY")}</span>
                                  {t.assigned && <span className="text-2xs text-slate-400">• Staf HQ: {t.assigned}</span>}
                                  {sla === "breached" && <span className="text-3xs font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">SLA Lewat</span>}
                                  {sla === "near" && <span className="text-3xs font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">SLA Hampir Tamat</span>}
                                  {t.replies.length > 0 && <span className="text-2xs text-slate-400">• {t.replies.length} balasan</span>}
                                  {t.attachments.length > 0 && <span className="text-2xs text-slate-400">• {t.attachments.length} lampiran</span>}
                                </div>
                              </div>
                              <ChevronRight className={`w-3.5 h-3.5 text-slate-300 shrink-0 mt-1 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                            </button>
                            {isOpen && (
                              <div className="mt-3 pt-3 border-t border-slate-200/70 space-y-3">
                                {t.replies.length > 0 && (
                                  <div className="space-y-1.5">
                                    {t.replies.map(r => (
                                      <div key={r.id} className="text-xs text-slate-600 bg-white/60 rounded-lg px-2.5 py-1.5">
                                        <span className="font-bold text-slate-700">{r.author}: </span>{r.text}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {t.status !== "resolved" && t.status !== "closed" && (
                                  <div className="space-y-1.5">
                                    <textarea
                                      value={ticketReplyDraft}
                                      onChange={e => setTicketReplyDraft(e.target.value)}
                                      placeholder="Balas tiket ini..."
                                      rows={2}
                                      className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                    />
                                    <button
                                      disabled={!ticketReplyDraft.trim() || ticketReplySending}
                                      onClick={async () => {
                                        setTicketReplySending(true);
                                        const ok = await tenantReplySupportTicket(t.id, ticketReplyDraft.trim());
                                        setTicketReplySending(false);
                                        if (ok) {
                                          setTicketReplyDraft("");
                                          getMyTenantSupportTickets().then(setMyTickets);
                                        }
                                      }}
                                      className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold disabled:opacity-40 cursor-pointer"
                                    >
                                      {ticketReplySending ? "Menghantar..." : "Hantar Balasan"}
                                    </button>
                                  </div>
                                )}
                                {t.attachments.length > 0 && (
                                  <div className="space-y-1">
                                    {t.attachments.map(a => (
                                      <button key={a.id} onClick={async () => {
                                        const url = await getTicketAttachmentUrl(a.filePath);
                                        if (url) window.open(url, "_blank");
                                      }} className="flex items-center gap-1.5 text-xs text-indigo-600 hover:underline cursor-pointer">
                                        <FileText className="w-3 h-3" />{a.fileName}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                {t.resolutionNotes && (
                                  <div className="p-2 bg-emerald-50 border border-emerald-100 rounded-lg">
                                    <p className="text-2xs font-bold text-emerald-700 uppercase">Nota Penyelesaian</p>
                                    <p className="text-xs text-emerald-700 mt-0.5">{t.resolutionNotes}</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {wsId && <TenantResourceLedger workspaceId={wsId} />}
          </div>
        )}
      </div>

      {/* Phase 2D — Financial Health Command Center drill-downs. Same shared
          components used by Owner — no Staff-only duplicate-review or
          import-recovery logic. */}
      {showDuplicateQueue && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-bold text-slate-900">Semakan Kemungkinan Pendua</h3>
              <button onClick={() => setShowDuplicateQueue(false)} className="text-slate-300 hover:text-slate-600 cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5"><DuplicateReviewQueue /></div>
          </div>
        </div>
      )}
      {showImportRecovery && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-bold text-slate-900">Pemulihan Import Penyata Bank</h3>
              <button onClick={() => { setShowImportRecovery(false); setImportFailureRefresh(n => n + 1); }} className="text-slate-300 hover:text-slate-600 cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5"><HistoricalRecoveryWorkspace /></div>
          </div>
        </div>
      )}

      {/* UAT FIX #01 (Issue 1) — Staff bottom nav intentionally diverges from
          Owner's here: TENANT_STAFF is operational-only (record transactions,
          upload documents, OCR/AI review, chat) and must not see Owner-level
          financial intelligence (dashboard analytics, reports, tax/financing/
          audit readiness, export report) per MYKERANI role separation. The
          "Laporan" tab has been removed and "dashboard" now renders only the
          staff member's own record list (no totals/health score/readiness). */}
      <nav className="lg:hidden bg-white border-t border-slate-200 flex items-center justify-around px-2 py-1.5 shrink-0 z-40" id="staff_bottom_nav">
        {([
          { id: "home" as StaffTab,       label: "Home",      icon: Home },
          { id: "dashboard" as StaffTab,  label: "Rekod Saya", icon: LayoutDashboard },
          { id: "documents" as StaffTab,  label: "Dokumen",   icon: FileText },
          { id: "more" as StaffTab,       label: "Lagi",      icon: MoreHorizontal },
        ]).map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex flex-col items-center py-1.5 px-2 rounded-xl transition cursor-pointer ${active ? "text-slate-900" : "text-slate-400"}`}>
              <Icon className={`w-5 h-5 ${active ? "text-slate-900" : ""}`} />
              <span className={`text-3xs font-bold mt-0.5 ${active ? "text-slate-900" : ""}`}>{label}</span>
            </button>
          );
        })}
      </nav>
      </div>{/* end content column */}
    </div>
  );
}

