import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { useFinancials } from "../context/FinancialRecordsContext";
import { useTenant } from "../context/TenantContext";
import { usePermission } from "../context/PermissionContext";
import { type FinancialEvent } from "../types";
import {
  Home, LayoutDashboard, FileText, BarChart3, MoreHorizontal,
  Send, Receipt, FileSpreadsheet, Landmark, Brain, User as UserIcon,
  TrendingUp, TrendingDown, Wallet, Clock,
  ChevronRight, Upload, LogOut, Users,
  History, Settings, User, X, Bot, UserPlus, RefreshCw,
  HelpCircle, CreditCard, Cpu, HardDrive, Bell, Shield,
  BookOpen, Ticket, MessageCircle, Zap, Database, Edit3,
  UserCheck, UserX, KeyRound, AlertCircle, CheckCircle2,
  ToggleLeft, ToggleRight, ExternalLink, Trash2, Download,
  Paperclip, Mic, Square, File as FileIcon, Plus, ScanLine, Star,
} from "lucide-react";
import { FinancialEvidencePackageManager } from "../components/FinancialEvidencePackage";
import { createTenantSupportTicket, getMyTenantSupportTickets, SupportTicket, updateTenantMasterProfile, SUPPORT_TICKET_TEMPLATES, uploadTicketAttachment, getTicketAttachmentUrl, ticketSlaState, TICKET_STATUS_LABEL_MS, TICKET_STATUS_STYLE, tenantAssignStaffRole, tenantRevokeStaffRole, tenantSubmitAppeal, tenantReplySupportTicket, getTenantMyHealthScore, TenantHealthScore, getTenantAiCostSummary, TenantAiCostSummary, getMyDataAccessLog, DataAccessLogEntry, getAddonPackages, AddonPackage, redeemPromotion, getTenantActivityFeed, getMyPromotionRedemptions, logTenantActivity } from "../lib/hqService";
import { FinancialReportsAnalytics } from "../components/FinancialReportsAnalytics";
import { StorageBar } from "../components/StorageBar";
import { DocumentsManager } from "../components/DocumentsManager";
import { useStorageQuota, PLAN_QUOTAS } from "../lib/storageQuota";
import { useAiCredits, useOcrCredits } from "../lib/aiCredits";
import { useNotifications, buildTenantNotifs, buildFinancialNotifs, fmtNotifTime } from "../lib/notifications";
import { computeFinancialHealthScoring } from "../lib/financialHealth";
import {
  uploadDocument, listDocuments, deleteDocument, getDocumentUrl, updateDocumentReview,
  isAllowedFileType, MAX_FILE_SIZE, fmtBytes as fmtDocBytes,
  type UploadedDoc, type DocType,
} from "../lib/documentStorage";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { isDemoWorkspace } from "../lib/seeder";
import { loadChatHistory, loadActiveSessionMessages, saveChatMessage } from "../lib/chatHistory";
import { getOrCreateActiveSession } from "../lib/chatSession";
import { logEvent } from "../lib/eventLog";
import { getFriendlyTransactionLabel } from "../lib/transactionLabelNormalization";
import { matchOwnBusinessAndBranch } from "../lib/businessMatching";
import { computeFinancialHealth, type HealthBucketKey } from "../lib/financialHealthCenter";
import { FinancialHealthCenter } from "../components/FinancialHealthCenter";
import { FinancialHealthSummary } from "../components/FinancialHealthSummary";
import { QuickActionsRow } from "../components/QuickActionsRow";
import { DuplicateReviewQueue } from "../components/DuplicateReviewQueue";
import { HistoricalRecoveryWorkspace } from "../components/HistoricalRecoveryWorkspace";
import { getImportFailures } from "../lib/importFailureLog";
import {
  loadPersonalProfile, savePersonalProfile,
  loadVehicles, addVehicle, updateVehicle, deleteVehicle, loadDependents, addDependent, updateDependent, deleteDependent,
  loadBusinesses, addBusiness, updateBusiness, deleteBusiness,
  loadBusinessBranches, addBusinessBranch, deleteBusinessBranch,
  EMPTY_PERSONAL_PROFILE,
  type PersonalProfile, type Vehicle, type Dependent,
  type Business, type BusinessBranch,
} from "../lib/profileData";
import { buildFinancialContext } from "../lib/buildFinancialContext";
import {
  addAssetPurchase, addOwnerTransaction, loadAssetPurchases, loadOwnerTransactions,
  deleteAssetPurchase, deleteOwnerTransaction, type AssetPurchase, type OwnerTransaction,
} from "../lib/assetOwnerData";
import {
  submitManualPayment, initiateChipAsiaPayment, getTenantPaymentTransactions, startTrialSubscription,
  purchaseAddonManual, purchaseAddonChipAsia,
  type TenantPaymentTransaction, type ResourceCreditType,
} from "../lib/paymentService";

type MainTab = "home" | "dashboard" | "documents" | "reports" | "more";
type MorePage = "menu" | "team" | "history" | "settings" | "myProfile" | "support" | "billing" | "resources" | "chatArchive" | "activity" | "account360";

// AI chat suggestions may carry a server-computed default date; if the AI
// didn't extract a date from the user's message, normalize to the user's
// OWN browser-local date rather than trusting the AI's default, so it always
// matches the Dashboard's local-date-based period filters (avoids UTC vs
// Asia/Kuala_Lumpur skew during the nightly window where they disagree).
const todayLocalIso = (): string => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

import type { ChatSuggestion, ChatSuggestionExtra, ChatSuggestionRecordType, ChatSuggestionStatus, ChatSuggestionStatusValue, PendingChatEvidence } from "../lib/chatSuggestionTypes";
import { enrichChatSuggestionPayload } from "../lib/chatSuggestionMapper";
import { useConfirmChatSuggestion } from "../hooks/useConfirmChatSuggestion";
import { useCrossWorkspacePattern } from "../hooks/useCrossWorkspacePattern";

interface ChatMsg {
  id: string;
  sender: "user" | "ai";
  text: string;
  suggestions?: ChatSuggestion[];
  createdAt?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: "image" | "pdf" | "audio";
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

// â"€â"€ Quick Add Record Modal â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function QuickAddModal({
  type, onClose, onSave,
}: {
  type: "INCOME" | "EXPENSE";
  onClose: () => void;
  onSave: (d: { type: string; amount: number; description: string; party: string; date: string; category: string }) => void;
}) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [party, setParty] = useState("");
  const [date, setDate] = useState(todayLocalIso());
  const isIncome = type === "INCOME";

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount) return;
    onSave({ type, amount: parseFloat(amount), description, party, date, category });
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
          <input type="text" value={category} onChange={e => setCategory(e.target.value)}
            placeholder="Kategori (contoh: Sewa, Minyak, Jualan Produk)"
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

// â"€â"€â"€ Main Component â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
export function OwnerDashboard() {
  const { user, signOut, isMockUser, updateProfile } = useAuth();
  const { activeWorkspace, workspaces, selectWorkspace } = useWorkspace();
  const { activeTenant } = useTenant();
  const { userRoles, hasPermission } = usePermission();
  const userNameById = useMemo(() => {
    const map: Record<string, string> = {};
    userRoles.forEach(r => { map[r.userId] = r.fullName; });
    return map;
  }, [userRoles]);
  const { financialEvents, addFinancialEvent, addFinancialEventAwaited, addFinancialEventsBatch, editFinancialEvent, deleteFinancialEvent, addDebtRecord, addDebtRecordAwaited, editDebtRecord, deleteDebtRecord, addFinancialCommitment, addFinancialCommitmentAwaited, editFinancialCommitment, deleteFinancialCommitment, learnOcrPattern, learnOcrPatternsBatch, ocrLearnedPatterns, cashAccounts, bankAccounts, addBankAccount, debtRecords, financialCommitments, financialEvidencePackages, addFinancialEvidencePackage, duplicateFlags } = useFinancials();
  const { confirmChatSuggestion } = useConfirmChatSuggestion();
  const { crossWorkspaceHints, checkCrossWorkspacePattern } = useCrossWorkspacePattern();

  const [activeTab, setActiveTab] = useState<MainTab>("home");
  const [morePage, setMorePage] = useState<MorePage>("menu");
  const [quickAdd, setQuickAdd] = useState<"INCOME" | "EXPENSE" | null>(null);
  // Persisted (localStorage) so a confirmed/rejected suggestion is not re-actioned (and
  // duplicate-inserted) after a page refresh, remount, or chat history reload — the chat
  // message itself is reloaded from ai_chat_messages on every mount, but without this the
  // suggestion buttons would always come back as "pending" even though the record was
  // already saved to the database.
  const chatSuggestionStatusKey = (wsId: string) => `mykerani_chat_suggestion_status_${wsId}`;
  const [chatSuggestionStatus, setChatSuggestionStatus] = useState<Record<string, ChatSuggestionStatus>>({});
  // Tracks which already-confirmed suggestions have had their saved record edited at least
  // once, purely to switch the status line wording to "Dikemaskini." — not persisted, ephemeral UI only.
  const [chatSuggestionJustUpdated, setChatSuggestionJustUpdated] = useState<Record<string, boolean>>({});
  const [confirmingChatId, setConfirmingChatId] = useState<string | null>(null);
  const [editingChatSuggestionId, setEditingChatSuggestionId] = useState<string | null>(null);
  const [chatEditDraft, setChatEditDraft] = useState({ amount: "", category: "", relatedParty: "", date: "", transactionType: "" });
  // Per-suggestion business pick + evidence step, layered on top of the AI suggestion before final Sahkan.
  const [chatSuggestionExtra, setChatSuggestionExtra] = useState<Record<string, ChatSuggestionExtra>>({});
  const chatEvidenceFilesRef = useRef<Record<string, File>>({});
  // M-01: object URLs for evidence previews, tracked so they can be revoked
  // on detach/unmount instead of leaking indefinitely.
  const [evidencePreviewUrls, setEvidencePreviewUrls] = useState<Record<string, string>>({});
  const pendingChatEvidenceRef = useRef<Record<string, PendingChatEvidence>>({});
  const chatEvidenceInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // Accounting Knowledge Base V1: per-suggestion dismissal of the "Cadangan Semakan" review banner.
  const [accountingBannerDismissed, setAccountingBannerDismissed] = useState<Record<string, boolean>>({});

  // â"€â"€ Onboarding Wizard â"€â"€
  const onboardKey = `mykerani_onboarded_${user?.id ?? "guest"}`;
  const [onboardDone, setOnboardDone] = useState(() => !!localStorage.getItem(onboardKey));
  const [onboardStep, setOnboardStep] = useState(1);
  // Workspace type choice (Personal/Business) — drives the bizName default below.
  // Per the onboarding-flow audit: the name field must NEVER silently default to
  // the user's own full name (that was the original bug). "Peribadi" prefills
  // an honest, editable placeholder; "Perniagaan" starts blank so the user is
  // forced to type their actual business name.
  const [obWorkspaceType, setObWorkspaceType] = useState<"PERSONAL" | "BUSINESS" | null>(null);
  const [obBizName, setObBizName] = useState("");
  const [obBizType, setObBizType] = useState("");
  const [obSavingName, setObSavingName] = useState(false);

  const pickObWorkspaceType = (type: "PERSONAL" | "BUSINESS") => {
    setObWorkspaceType(type);
    setObBizName(type === "PERSONAL" ? "Nama Peribadi" : "");
  };

  // Persist the chosen workspace/tenant name for real — provisioning (signUp/signIn)
  // already created the tenant+workspace row with a neutral placeholder name
  // ("Nama Peribadi"); this is where the user's actual choice gets written back.
  const saveObBizName = async (): Promise<boolean> => {
    const name = obBizName.trim();
    if (!name) return false;
    if (!isSupabaseConfigured() || isMockUser || !supabase) return true; // sandbox/demo — nothing to persist
    setObSavingName(true);
    try {
      if (activeTenant) {
        await supabase.from("tenants").update({ name }).eq("id", activeTenant.id);
      }
      if (activeWorkspace) {
        await supabase.from("workspaces").update({ name }).eq("id", activeWorkspace.id);
      }
      return true;
    } catch {
      return false; // best-effort — never block onboarding on a naming write failure
    } finally {
      setObSavingName(false);
    }
  };

  const finishOnboard = () => {
    localStorage.setItem(onboardKey, "1");
    setOnboardDone(true);
  };

  // â"€â"€ AI Chat State â"€â"€
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  // Full conversation history (all dates) — kept separate from chatMessages so the
  // active home thread can always start fresh on login/refresh while Arkib Perbualan
  // still has access to everything that was ever said.
  const [chatHistoryAll, setChatHistoryAll] = useState<ChatMsg[]>([]);
  const [chatArchiveDate, setChatArchiveDate] = useState<string | null>(null);
  // Current active chat session: created fresh on login, reused across a
  // page refresh (see getOrCreateActiveSession), archived on logout.
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  // â•â• Chat attachments: receipts/PDFs uploaded directly + recorded voice notes â•â•
  const [chatAttaching, setChatAttaching] = useState(false);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const [chatRecording, setChatRecording] = useState(false);
  const chatMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chatRecordedChunksRef = useRef<Blob[]>([]);

  // â"€â"€ Invite staff â"€â"€
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ success: boolean; message: string; tempPassword?: string } | null>(null);
  const [roleChangeLoadingId, setRoleChangeLoadingId] = useState<string | null>(null);
  const [memberRoleOverrides, setMemberRoleOverrides] = useState<Record<string, string>>({});
  const [revokedMemberIds, setRevokedMemberIds] = useState<Record<string, boolean>>({});
  const [showAppeal, setShowAppeal] = useState(false);
  const [appealReason, setAppealReason] = useState("");
  const [appealLoading, setAppealLoading] = useState(false);
  const [appealResult, setAppealResult] = useState<{ success: boolean; message: string } | null>(null);

  // ── Support Center ──
  const [supportMessages, setSupportMessages] = useState<{ id: string; sender: "user" | "ai"; text: string }[]>([]);
  const [supportInput, setSupportInput] = useState("");
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportView, setSupportView] = useState<"chat" | "faq" | "ticket" | "ticket_status">("chat");
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketDesc, setTicketDesc] = useState("");
  const [ticketCategory, setTicketCategory] = useState("");
  const [ticketSent, setTicketSent] = useState(false);
  const [ticketSending, setTicketSending] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [myTickets, setMyTickets] = useState<SupportTicket[]>([]);
  const [myTicketsLoading, setMyTicketsLoading] = useState(false);
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [ticketReplyDraft, setTicketReplyDraft] = useState("");
  const [ticketReplySending, setTicketReplySending] = useState(false);
  const [myHealthScore, setMyHealthScore] = useState<TenantHealthScore | null>(null);
  const [aiCostSummary, setAiCostSummary] = useState<TenantAiCostSummary[]>([]);
  const [dataAccessLog, setDataAccessLog] = useState<DataAccessLogEntry[]>([]);
  const [showDataAccessLog, setShowDataAccessLog] = useState(false);
  const [ticketAttachFile, setTicketAttachFile] = useState<File | null>(null);
  const [ticketAttachUploading, setTicketAttachUploading] = useState(false);
  const supportEndRef = useRef<HTMLDivElement>(null);

  // â"€â"€ Tenant Activity Center â"€â"€
  const [tenantActivity, setTenantActivity] = useState<any[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  // â"€â"€ Reminder Settings â"€â"€
  const [reminders, setReminders] = useState({ subscription: "7", bill: "3", aiCredit: "7", storage: "7" });

  // â"€â"€ Resource Settings â"€â"€
  const [resAI, setResAI] = useState<"mykerani" | "own">("mykerani");
  const [resAIKey, setResAIKey] = useState("");
  const [resStorage, setResStorage] = useState<"mykerani" | "gdrive" | "onedrive" | "dropbox">("mykerani");

  // â"€â"€ BYOS Storage Connection â"€â"€
  interface StorageConn { provider: "gdrive" | "onedrive" | "dropbox"; email: string; folder: string; usedGB: number; lastSync: string; }
  const storageKey = `mykerani_storage_${user?.id ?? "guest"}`;
  const [storageConn, setStorageConn] = useState<StorageConn | null>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || "null"); } catch { return null; }
  });
  const [connectingProv, setConnectingProv] = useState<string | null>(null);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [folderInput, setFolderInput] = useState("");

  useEffect(() => {
    if (storageConn) localStorage.setItem(storageKey, JSON.stringify(storageConn));
    else localStorage.removeItem(storageKey);
  }, [storageConn, storageKey]);

  const connectStorage = async (prov: "gdrive" | "onedrive" | "dropbox") => {
    setConnectingProv(prov);
    await new Promise(r => setTimeout(r, 2000));
    const emails: Record<string, string> = { gdrive: user?.email || "anda@gmail.com", onedrive: user?.email || "anda@outlook.com", dropbox: user?.email || "anda@dropbox.com" };
    setStorageConn({ provider: prov, email: emails[prov], folder: "MYKERANI Dokumen", usedGB: 0.0, lastSync: new Date().toISOString() });
    setConnectingProv(null);
    setResStorage(prov);
  };

  const disconnectStorage = () => { setStorageConn(null); setResStorage("mykerani"); };

  const wsId = activeWorkspace?.id || "";
  const nowIso = new Date().toISOString().slice(0, 10);
  const thisMonth = nowIso.slice(0, 7);
  const firstName = user?.fullName?.split(" ")[0] || "Anda";
  const greeting = getGreeting();

  const myEvents = useMemo(() => financialEvents.filter(e => e.workspaceId === wsId), [financialEvents, wsId]);
  const [txnFilterFrom, setTxnFilterFrom] = useState("");
  const [txnFilterTo, setTxnFilterTo] = useState("");
  // â•â• Dashboard period (day/week/month/year) + income/expense type filter â•â•
  const [dashboardPeriod, setDashboardPeriod] = useState<"day" | "week" | "month" | "year">("month");
  const [dashboardTypeFilter, setDashboardTypeFilter] = useState<"ALL" | "INCOME" | "EXPENSE">("ALL");
  // â•â• Phase 1: search, business/category/source filters, pagination â•â•
  const [txnSearch, setTxnSearch] = useState("");
  const [txnFilterBusiness, setTxnFilterBusiness] = useState<string>("ALL");
  const [txnFilterCategory, setTxnFilterCategory] = useState<string>("ALL");
  const [txnFilterSource, setTxnFilterSource] = useState<"ALL" | "AI_CHAT" | "RECEIPT_OCR" | "INVOICE_OCR" | "BANK_STATEMENT" | "MANUAL">("ALL");
  const [txnPageSize, setTxnPageSize] = useState<50 | 100 | 250 | 500>(50);
  const [txnPage, setTxnPage] = useState(0);
  // â•â• Sejarah Aktiviti (Activity History) -- own search/filter/pagination, but
  // reads from the exact same `myEvents` Master Ledger array as the Dashboard
  // table above. No separate storage, no separate fetch.
  const [historySearch, setHistorySearch] = useState("");
  const [historyFilterFrom, setHistoryFilterFrom] = useState("");
  const [historyFilterTo, setHistoryFilterTo] = useState("");
  const [historyFilterSource, setHistoryFilterSource] = useState<"ALL" | "AI_CHAT" | "RECEIPT_OCR" | "INVOICE_OCR" | "BANK_STATEMENT" | "MANUAL">("ALL");
  const [historyFilterBusiness, setHistoryFilterBusiness] = useState<string>("ALL");
  const [historyFilterType, setHistoryFilterType] = useState<"ALL" | "INCOME" | "EXPENSE" | "RECEIVABLE" | "PAYABLE" | "DEBT">("ALL");
  const [historyFilterCategory, setHistoryFilterCategory] = useState<string>("ALL");
  const [historyPage, setHistoryPage] = useState(0);
  const [historyPageSize, setHistoryPageSize] = useState(100);
  const getTxnSource = (ev: { referenceNumber: string }): "AI_CHAT" | "RECEIPT_OCR" | "INVOICE_OCR" | "BANK_STATEMENT" | "MANUAL" => {
    const ref = ev.referenceNumber || "";
    if (ref.startsWith("STMT-")) return "BANK_STATEMENT";
    if (ref.startsWith("AI-")) return "AI_CHAT";
    if (ref.startsWith("DOC-")) return "RECEIPT_OCR";
    if (ref.startsWith("INV-")) return "INVOICE_OCR";
    return "MANUAL";
  };
  const txnSourceLabel = (src: ReturnType<typeof getTxnSource>) => ({
    AI_CHAT: "Chat AI",
    RECEIPT_OCR: "Resit (OCR)",
    INVOICE_OCR: "Invois (OCR)",
    BANK_STATEMENT: "Penyata Bank",
    MANUAL: "Manual",
  }[src]);
  const txnSourceBadgeClass = (src: ReturnType<typeof getTxnSource>) => ({
    AI_CHAT: "bg-violet-50 text-violet-600",
    RECEIPT_OCR: "bg-amber-50 text-amber-600",
    INVOICE_OCR: "bg-blue-50 text-blue-600",
    BANK_STATEMENT: "bg-indigo-50 text-indigo-600",
    MANUAL: "bg-slate-100 text-slate-500",
  }[src]);
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
      const dow = today.getDay(); // 0=Sun
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
  const periodEvents = useMemo(
    () => myEvents.filter(e => e.date >= periodRange.from && e.date <= periodRange.to),
    [myEvents, periodRange]
  );
  const incomeInPeriod = useMemo(() => periodEvents.filter(e => e.type === "INCOME").reduce((s, e) => s + e.amountMyr, 0), [periodEvents]);
  const expenseInPeriod = useMemo(() => periodEvents.filter(e => e.type === "EXPENSE").reduce((s, e) => s + e.amountMyr, 0), [periodEvents]);
  // Phase 2D — Financial Health Command Center: clicking a health card jumps
  // straight to the underlying records instead of making the owner search.
  // When set, this overrides every other dashboard filter so the exact set
  // of flagged records is always shown regardless of period/search state.
  const [healthFilterRecordIds, setHealthFilterRecordIds] = useState<string[] | null>(null);
  const [healthFilterLabel, setHealthFilterLabel] = useState<string>("");
  const [showDuplicateQueue, setShowDuplicateQueue] = useState(false);
  const [showImportRecovery, setShowImportRecovery] = useState(false);
  const [importFailureRefresh, setImportFailureRefresh] = useState(0);
  // Phase 2D.1 — Mobile Dashboard UX Redesign: the full 6-bucket/4-score
  // FinancialHealthCenter detail is now hidden behind this toggle; the
  // compact FinancialHealthSummary card is shown by default instead.
  const [showHealthDetail, setShowHealthDetail] = useState(false);
  // Phase 2D.3A — Problem 1: Report Center's "Tunai Semasa" empty state
  // ("Tiada Akaun Bank Direkodkan") needs a real "[Tambah Akaun Bank]"
  // navigation target. OwnerDashboard.tsx had no existing bank-account-add
  // UI of its own (the only existing form lives in FinancialRecordsConsole.tsx,
  // mounted under the separate MyKeraniAppTabs.tsx HQ/mock-user surface, not
  // reachable from the real tenant Owner app) — this reuses the existing
  // addBankAccount() context action verbatim, just adding the missing
  // lightweight form UI for it, no new financial calculation.
  const [showAddBankAccountModal, setShowAddBankAccountModal] = useState(false);
  const [newBankName, setNewBankName] = useState("");
  const [newBankNumber, setNewBankNumber] = useState("");
  const [newBankHolder, setNewBankHolder] = useState("");
  const [newBankBalance, setNewBankBalance] = useState("");
  const handleAddBankAccountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBankName || !newBankNumber || !newBankHolder || !newBankBalance) return;
    addBankAccount({
      workspaceId: activeWorkspace.id,
      bankName: newBankName,
      accountNumber: newBankNumber,
      accountName: newBankHolder,
      branchName: "",
      currentBalanceMyr: parseFloat(newBankBalance) || 0,
    });
    setNewBankName(""); setNewBankNumber(""); setNewBankHolder(""); setNewBankBalance("");
    setShowAddBankAccountModal(false);
  };

  const filteredEvents = useMemo(() => {
    if (healthFilterRecordIds) {
      const idSet = new Set(healthFilterRecordIds);
      return myEvents.filter(e => idSet.has(e.id));
    }
    const usingCustomRange = !!(txnFilterFrom || txnFilterTo);
    const q = txnSearch.trim().toLowerCase();
    return myEvents.filter(e => {
      const inRange = usingCustomRange
        ? (!txnFilterFrom || e.date >= txnFilterFrom) && (!txnFilterTo || e.date <= txnFilterTo)
        : (e.date >= periodRange.from && e.date <= periodRange.to);
      const matchesType = dashboardTypeFilter === "ALL" || e.type === dashboardTypeFilter;
      const matchesBusiness = txnFilterBusiness === "ALL" || (e.businessId || "") === txnFilterBusiness;
      const matchesCategory = txnFilterCategory === "ALL" || e.categoryName === txnFilterCategory;
      const matchesSource = txnFilterSource === "ALL" || getTxnSource(e) === txnFilterSource;
      const matchesSearch = !q ||
        e.description?.toLowerCase().includes(q) ||
        e.partyName?.toLowerCase().includes(q) ||
        e.referenceNumber?.toLowerCase().includes(q) ||
        e.categoryName?.toLowerCase().includes(q);
      return inRange && matchesType && matchesBusiness && matchesCategory && matchesSource && matchesSearch;
    });
  }, [myEvents, txnFilterFrom, txnFilterTo, periodRange, dashboardTypeFilter, txnSearch, txnFilterBusiness, txnFilterCategory, txnFilterSource, healthFilterRecordIds]);
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
  const financialHealth = useMemo(() => computeFinancialHealth({
    events: myEvents,
    evidencePackages: financialEvidencePackages,
    duplicateFlags,
    chatSuggestions: allChatSuggestions,
    chatSuggestionStatus,
    importFailureCount: importFailures.reduce((s, r) => s + r.skippedCount, 0),
    importFailureBatchCount: importFailures.length,
  }), [myEvents, financialEvidencePackages, duplicateFlags, allChatSuggestions, chatSuggestionStatus, importFailures]);
  const handleHealthBucketSelect = (key: HealthBucketKey) => {
    if (key === "pendingConfirmation" || key === "reviewRecommended") {
      setActiveTab("home");
      return;
    }
    const bucket = financialHealth.buckets.find(b => b.key === key);
    if (!bucket) return;
    setHealthFilterRecordIds(bucket.recordIds);
    setHealthFilterLabel(bucket.label);
    setActiveTab("dashboard");
  };
  const txnCategoryOptions = useMemo(() => Array.from(new Set(myEvents.map(e => e.categoryName).filter(Boolean))).sort(), [myEvents]);
  const sortedFilteredEvents = useMemo(() => [...filteredEvents].reverse(), [filteredEvents]);
  const txnTotalPages = Math.max(1, Math.ceil(sortedFilteredEvents.length / txnPageSize));
  const pagedEvents = useMemo(() => {
    const start = txnPage * txnPageSize;
    return sortedFilteredEvents.slice(start, start + txnPageSize);
  }, [sortedFilteredEvents, txnPage, txnPageSize]);
  useEffect(() => { setTxnPage(0); }, [txnSearch, txnFilterBusiness, txnFilterCategory, txnFilterSource, txnFilterFrom, txnFilterTo, dashboardTypeFilter, txnPageSize]);

  const historyFilteredEvents = useMemo(() => {
    // Same default window as the Dashboard (periodRange) when no custom date
    // range is set, so "no filter selected" produces an identical count on
    // both screens -- they read the same myEvents source under the same rules.
    const usingCustomRange = !!(historyFilterFrom || historyFilterTo);
    const q = historySearch.trim().toLowerCase();
    return myEvents.filter(e => {
      const inRange = usingCustomRange
        ? (!historyFilterFrom || e.date >= historyFilterFrom) && (!historyFilterTo || e.date <= historyFilterTo)
        : (e.date >= periodRange.from && e.date <= periodRange.to);
      const matchesSource = historyFilterSource === "ALL" || getTxnSource(e) === historyFilterSource;
      const matchesBusiness = historyFilterBusiness === "ALL" || (e.businessId || "") === historyFilterBusiness;
      const matchesType = historyFilterType === "ALL" || e.type === historyFilterType;
      const matchesCategory = historyFilterCategory === "ALL" || e.categoryName === historyFilterCategory;
      const matchesSearch = !q ||
        e.description?.toLowerCase().includes(q) ||
        e.partyName?.toLowerCase().includes(q) ||
        e.referenceNumber?.toLowerCase().includes(q) ||
        e.categoryName?.toLowerCase().includes(q);
      return inRange && matchesSource && matchesBusiness && matchesType && matchesCategory && matchesSearch;
    }).slice().reverse();
  }, [myEvents, historySearch, historyFilterFrom, historyFilterTo, periodRange, historyFilterSource, historyFilterBusiness, historyFilterType, historyFilterCategory]);
  const historyTotalPages = Math.max(1, Math.ceil(historyFilteredEvents.length / historyPageSize));
  const pagedHistoryEvents = useMemo(() => {
    const start = historyPage * historyPageSize;
    return historyFilteredEvents.slice(start, start + historyPageSize);
  }, [historyFilteredEvents, historyPage, historyPageSize]);
  useEffect(() => { setHistoryPage(0); }, [historySearch, historyFilterFrom, historyFilterTo, historyFilterSource, historyFilterBusiness, historyFilterType, historyFilterCategory, historyPageSize]);

  // â•â• Phase 2: computed-only Transaction Health Flags. No new tables/state --
  // derived purely from fields already on FinancialEvent at render time.
  type HealthFlag = "MISSING_ATTACHMENT" | "LOW_CONFIDENCE" | "POSSIBLE_DUPLICATE" | "UNCATEGORIZED" | "REVIEW_REQUIRED" | "READY";
  const possibleDuplicateIds = useMemo(() => {
    const flagged = new Set<string>();
    const byKey = new Map<string, FinancialEvent[]>();
    for (const e of myEvents) {
      const key = `${e.type}|${e.amountMyr.toFixed(2)}|${e.date}`;
      const bucket = byKey.get(key) || [];
      bucket.push(e);
      byKey.set(key, bucket);
    }
    byKey.forEach(bucket => { if (bucket.length > 1) bucket.forEach(e => flagged.add(e.id)); });
    return flagged;
  }, [myEvents]);
  const getHealthFlags = (ev: FinancialEvent): HealthFlag[] => {
    const flags: HealthFlag[] = [];
    const hasAttachment = financialEvidencePackages.some(p => p.relatedRecordId === ev.id);
    const isOcrOrChatSourced = getTxnSource(ev) !== "MANUAL";
    if (isOcrOrChatSourced && !hasAttachment) flags.push("MISSING_ATTACHMENT");
    const confidencePct = findTxnConfidence(ev);
    if (confidencePct !== null && confidencePct < 75) flags.push("LOW_CONFIDENCE");
    if (possibleDuplicateIds.has(ev.id)) flags.push("POSSIBLE_DUPLICATE");
    if (!ev.categoryName || ev.categoryName.trim() === "" || ev.categoryName === "Lain-lain") flags.push("UNCATEGORIZED");
    if (!ev.businessId && businesses.some(b => b.isActive)) flags.push("REVIEW_REQUIRED");
    if (flags.length === 0) flags.push("READY");
    return flags;
  };
  const healthFlagLabel = (f: HealthFlag) => ({
    MISSING_ATTACHMENT: "Tiada Lampiran",
    LOW_CONFIDENCE: "Keyakinan Rendah",
    POSSIBLE_DUPLICATE: "Mungkin Pendua",
    UNCATEGORIZED: "Belum Dikategorikan",
    REVIEW_REQUIRED: "Perlu Disemak",
    READY: "Sedia",
  }[f]);
  const healthFlagBadgeClass = (f: HealthFlag) => ({
    MISSING_ATTACHMENT: "bg-orange-50 text-orange-600",
    LOW_CONFIDENCE: "bg-amber-50 text-amber-600",
    POSSIBLE_DUPLICATE: "bg-rose-50 text-rose-600",
    UNCATEGORIZED: "bg-slate-100 text-slate-500",
    REVIEW_REQUIRED: "bg-yellow-50 text-yellow-700",
    READY: "bg-emerald-50 text-emerald-600",
  }[f]);

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
  const getBusinessBranchLabel = (ev: { businessId?: string; branchId?: string }) => {
    const business = businesses.find(b => b.id === ev.businessId);
    if (!business) return "Bisnes";
    const branch = ev.branchId ? (businessBranches[ev.businessId!] || []).find(br => br.id === ev.branchId) : undefined;
    return branch ? `${business.businessName} - ${branch.branchName}` : business.businessName;
  };
  const findTxnConfidence = (ev: typeof myEvents[number]) => {
    const match = ocrLearnedPatterns.find(p => p.vendorName.toLowerCase() === ev.partyName.toLowerCase() && p.category === ev.categoryName && p.recordType === ev.type);
    return match ? Math.round(match.confidenceScore * 100) : null;
  };
  const previewTxnEvidence = async (pkg: { fileUrl: string }) => {
    const url = pkg.fileUrl.startsWith("http") ? pkg.fileUrl : await getDocumentUrl(pkg.fileUrl);
    if (url) window.open(url, "_blank");
  };
  const startEditTxn = (ev: typeof myEvents[number]) => {
    setEditingTxnId(ev.id);
    setEditTxnDraft({ amountMyr: String(ev.amountMyr), categoryName: ev.categoryName, partyName: ev.partyName, date: ev.date, businessId: ev.businessId || "", branchId: ev.branchId || "" });
  };
  const attachTxnReceipt = async (ev: typeof myEvents[number], file: File) => {
    if (!activeWorkspace) return;
    setUploadingTxnReceipt(true);
    try {
      const canPersist = isSupabaseConfigured() && !isMockUser && !!supabase && !isDemoWorkspace(activeWorkspace.id) && !!user;
      if (!canPersist) {
        setUploadError("Akaun demo tidak boleh melampirkan resit. Log masuk dengan akaun sebenar.");
        return;
      }
      const { doc, error, isDuplicate } = await uploadDocument(file, activeWorkspace.id, user!.id, "RECEIPT");
      if (error || !doc) {
        setUploadError(error || "Gagal memuat naik resit.");
        return;
      }
      if (isDuplicate) {
        setUploadError(`Fail "${doc.file_name}" sudah pernah dimuat naik sebelum ini — rekod sedia ada digunakan semula, tidak dimuat naik dua kali.`);
        setDocs(prev => (prev.some(d => d.id === doc.id) ? prev : [doc, ...prev]));
      } else {
        setDocs(prev => [doc, ...prev]);
      }
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
    const editedEvent = myEvents.find(e => e.id === editingTxnId);
    editFinancialEvent(editingTxnId, {
      amountMyr: Number(editTxnDraft.amountMyr) || 0,
      categoryName: editTxnDraft.categoryName,
      partyName: editTxnDraft.partyName,
      date: editTxnDraft.date,
      businessId: editTxnDraft.businessId || undefined,
      // A branch only belongs to one business -- if the user changes the
      // business, any previously-picked branch from a different business
      // would be stale, so clear it rather than carrying it forward.
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
  const incomeThisMonth = useMemo(() => myEvents.filter(e => e.type === "INCOME" && e.date.startsWith(thisMonth)).reduce((s, e) => s + e.amountMyr, 0), [myEvents, thisMonth]);
  const expenseThisMonth = useMemo(() => myEvents.filter(e => e.type === "EXPENSE" && e.date.startsWith(thisMonth)).reduce((s, e) => s + e.amountMyr, 0), [myEvents, thisMonth]);
  const totalReceivable = useMemo(() => myEvents.filter(e => e.type === "RECEIVABLE" && !e.isCompleted).reduce((s, e) => s + e.amountMyr, 0), [myEvents]);
  const totalPayable = useMemo(() => myEvents.filter(e => e.type === "PAYABLE" && !e.isCompleted).reduce((s, e) => s + e.amountMyr, 0), [myEvents]);
  const showOnboard = !onboardDone && !user?.email?.endsWith(".demo") && user?.role === "TENANT_OWNER";

  // â"€â"€ Storage Quota â"€â"€
  const tenantId = activeTenant?.id || user?.id || "guest";
  const storageQuota = useStorageQuota(tenantId, wsId || undefined);
  const aiCredits = useAiCredits(tenantId, wsId || undefined);
  const ocrCredits = useOcrCredits(tenantId, wsId || undefined);
  const [showAddonModal, setShowAddonModal] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState<"AI" | "OCR" | null>(null);
  const [storagePackages, setStoragePackages] = useState<AddonPackage[]>([]);
  const [aiCreditPackages, setAiCreditPackages] = useState<AddonPackage[]>([]);
  const [ocrCreditPackages, setOcrCreditPackages] = useState<AddonPackage[]>([]);
  useEffect(() => {
    let active = true;
    Promise.all([
      getAddonPackages("STORAGE"),
      getAddonPackages("AI"),
      getAddonPackages("OCR"),
    ]).then(([s, a, o]) => {
      if (!active) return;
      setStoragePackages(s);
      setAiCreditPackages(a);
      setOcrCreditPackages(o);
    });
    return () => { active = false; };
  }, []);
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoResult, setPromoResult] = useState<string | null>(null);
  const [promoHistory, setPromoHistory] = useState<any[]>([]);
  const submitPromoRedeem = async () => {
    if (!promoCode.trim() || !activeWorkspace) return;
    setPromoBusy(true);
    setPromoResult(null);
    try {
      const res = await redeemPromotion(promoCode.trim().toUpperCase(), activeWorkspace.tenantId, activeWorkspace.id);
      if (res.ok) {
        setPromoResult(res.kind === "trial_extension_days" ? `Berjaya! Percubaan dilanjutkan ${res.amount} hari.` : `Berjaya! Kredit ditambah ke dompet anda.`);
        setPromoCode("");
        if (activeTenant?.id) getMyPromotionRedemptions(activeTenant.id).then(setPromoHistory);
      } else {
        setPromoResult(res.message || "Kod promosi tidak sah atau telah tamat tempoh.");
      }
    } finally {
      setPromoBusy(false);
    }
  };

  // ── Subscription plan + payment (real, Supabase-backed) ──
  interface PlanOption {
    id: string; name: string; price: number;
    features: string[]; limitations: string[]; isTrial: boolean; isCustomPricing: boolean;
  }
  const [availablePlans, setAvailablePlans] = useState<PlanOption[]>([]);
  const [currentSub, setCurrentSub] = useState<{ planId: string; planName: string; price: number; status: string; renewal: string } | null>(null);
  const [paymentMethods, setPaymentMethods] = useState({ chipAsiaEnabled: false, manualPaymentEnabled: true });
  const [paymentTxs, setPaymentTxs] = useState<TenantPaymentTransaction[]>([]);
  const [paymentTxRefresh, setPaymentTxRefresh] = useState(0);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentModalPlanId, setPaymentModalPlanId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"chip_asia" | "manual">("manual");
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [trialSubmitting, setTrialSubmitting] = useState(false);
  const [trialError, setTrialError] = useState<string | null>(null);
  const [addonPurchase, setAddonPurchase] = useState<{ creditType: ResourceCreditType; creditAmount: number; label: string; amountMyr: number } | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase || !activeTenant?.id) return;
    let active = true;
    supabase.from("subscription_plans").select("id,name,monthly_price_myr,features").order("monthly_price_myr", { ascending: true })
      .then(({ data }) => { if (active) setAvailablePlans((data || []).map((p: any) => ({
        id: p.id, name: p.name, price: Number(p.monthly_price_myr) || 0,
        features: p.features?.featureList ?? [], limitations: p.features?.limitations ?? [],
        isTrial: p.features?.isTrial ?? false, isCustomPricing: p.features?.isCustomPricing ?? false,
      }))); });
    supabase.from("payment_gateway_settings").select("chip_asia_enabled,manual_payment_enabled").eq("id", "global").maybeSingle()
      .then(({ data }) => { if (active && data) setPaymentMethods({ chipAsiaEnabled: Boolean(data.chip_asia_enabled), manualPaymentEnabled: Boolean(data.manual_payment_enabled) }); });
    supabase.from("tenant_subscriptions").select("plan_id,status,current_period_end,subscription_plans(name,monthly_price_myr)").eq("tenant_id", activeTenant.id).maybeSingle()
      .then(({ data }: any) => {
        if (!active) return;
        if (data) {
          setCurrentSub({
            planId: data.plan_id,
            planName: data.subscription_plans?.name || "",
            price: Number(data.subscription_plans?.monthly_price_myr) || 0,
            status: data.status,
            renewal: data.current_period_end ? new Date(data.current_period_end).toLocaleDateString("ms-MY", { day: "numeric", month: "short", year: "numeric" }) : "",
          });
        }
      });
    getTenantPaymentTransactions(activeTenant.id).then(t => { if (active) setPaymentTxs(t); });
    getMyPromotionRedemptions(activeTenant.id).then(t => { if (active) setPromoHistory(t); });
    return () => { active = false; };
  }, [activeTenant?.id, paymentTxRefresh]);

  const openPaymentModal = (planId?: string) => {
    setAddonPurchase(null);
    setPaymentModalPlanId(planId || currentSub?.planId || availablePlans[0]?.id || "");
    setPaymentMethod(paymentMethods.chipAsiaEnabled ? "chip_asia" : "manual");
    setSlipFile(null);
    setPaymentError(null);
    setShowPaymentModal(true);
  };

  const openAddonPurchaseModal = (creditType: ResourceCreditType, creditAmount: number, label: string, amountMyr: number) => {
    setAddonPurchase({ creditType, creditAmount, label, amountMyr });
    setPaymentMethod(paymentMethods.chipAsiaEnabled ? "chip_asia" : "manual");
    setSlipFile(null);
    setPaymentError(null);
    setShowPaymentModal(true);
  };

  const startTrial = async () => {
    if (!activeTenant?.id) return;
    setTrialSubmitting(true);
    setTrialError(null);
    try {
      const { success, error } = await startTrialSubscription(activeTenant.id);
      if (!success) { setTrialError(error || "Gagal mengaktifkan percubaan percuma."); return; }
      setPaymentTxRefresh(t => t + 1);
    } finally {
      setTrialSubmitting(false);
    }
  };

  const submitPayment = async () => {
    if (!activeTenant?.id) return;

    if (addonPurchase) {
      if (!wsId) return;
      setPaymentSubmitting(true);
      setPaymentError(null);
      try {
        if (paymentMethod === "manual") {
          if (!slipFile) { setPaymentError("Sila muat naik slip pembayaran."); return; }
          const { error } = await purchaseAddonManual(
            activeTenant.id, wsId, addonPurchase.creditType, addonPurchase.creditAmount, addonPurchase.amountMyr, addonPurchase.label, slipFile
          );
          if (error) { setPaymentError(error); return; }
        } else {
          const { checkoutUrl, error } = await purchaseAddonChipAsia(
            activeTenant.id, wsId, addonPurchase.creditType, addonPurchase.creditAmount, addonPurchase.amountMyr, addonPurchase.label
          );
          if (error || !checkoutUrl) { setPaymentError(error || "Gagal memulakan pembayaran."); return; }
          window.location.href = checkoutUrl;
          return;
        }
        setShowPaymentModal(false);
        setAddonPurchase(null);
        setPaymentTxRefresh(t => t + 1);
      } finally {
        setPaymentSubmitting(false);
      }
      return;
    }

    if (!paymentModalPlanId) return;
    const plan = availablePlans.find(p => p.id === paymentModalPlanId);
    if (!plan) return;
    setPaymentSubmitting(true);
    setPaymentError(null);
    try {
      if (paymentMethod === "manual") {
        if (!slipFile) { setPaymentError("Sila muat naik slip pembayaran."); return; }
        const { error } = await submitManualPayment(activeTenant.id, plan.id, plan.price, slipFile);
        if (error) { setPaymentError(error); return; }
      } else {
        const { checkoutUrl, error } = await initiateChipAsiaPayment(activeTenant.id, plan.id, plan.price);
        if (error || !checkoutUrl) { setPaymentError(error || "Gagal memulakan pembayaran."); return; }
        window.location.href = checkoutUrl;
        return;
      }
      setShowPaymentModal(false);
      setPaymentTxRefresh(t => t + 1);
    } finally {
      setPaymentSubmitting(false);
    }
  };

  // â"€â"€ Document upload state â"€â"€
  // `docs`/`docsLoading` are also consumed outside the Dokumen tab (financial
  // notification engine below, and chat-attachment uploads), so OwnerDashboard
  // keeps fetching/holding this list itself and passes it down as a controlled
  // prop to the shared DocumentsManager (see Owner-Staff Parity Rule — the
  // documents tab UI itself is now identical for both roles, see
  // src/components/DocumentsManager.tsx).
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [chatActionErrors, setChatActionErrors] = useState<Record<string, string>>({});
  // Still used by attachTxnReceipt() below (Rekod tab "Lampirkan Resit" on an
  // existing transaction) — unrelated to the Dokumen tab, which now surfaces
  // its own upload errors internally inside the shared DocumentsManager.
  const [uploadError, setUploadError] = useState<string | null>(null);


  // Load documents when workspace ready
  useEffect(() => {
    if (!wsId) return;
    let active = true;
    setDocsLoading(true);
    listDocuments(wsId).then(d => { if (active) { setDocs(d); setDocsLoading(false); } })
      .catch(e => { if (active) { setUploadError("Gagal memuatkan dokumen."); setDocsLoading(false); } });
    return () => { active = false; };
  }, [wsId]);

  const fileToDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  // Upload trigger/file-select, delete/preview/download handlers, and
  // doc-type filter + pagination now live in the shared DocumentsManager
  // component (rendered for activeTab === "documents" below); `docs` itself
  // stays here only because the financial notification engine below also
  // needs it.

  // Update activity timestamp on financial events change
  useEffect(() => { if (myEvents.length > 0) storageQuota.touchActive(); }, [myEvents.length]);

  // â"€â"€ Notifications â"€â"€
  const notif = useNotifications(user?.id || "guest");
  const [showNotifPanel, setShowNotifPanel] = useState(false);

  // M-01: revoke all tracked evidence preview object URLs on unmount.
  useEffect(() => () => { Object.values(evidencePreviewUrls).forEach(url => URL.revokeObjectURL(url)); }, [evidencePreviewUrls]);
  // M-03: stop the MediaRecorder on unmount so it doesn't keep the mic busy.
  useEffect(() => () => { if (chatMediaRecorderRef.current && chatMediaRecorderRef.current.state !== "inactive") chatMediaRecorderRef.current.stop(); }, []);

  // Auto-generate notifications from app state
  useEffect(() => {
    const ctx = {
      storagePct: storageQuota.pctUsed,
      isFrozen: storageQuota.isFrozen,
      frozenReason: storageQuota.frozenReason,
      aiCreditsUsed: aiCredits.used,
      aiCreditsTotal: aiCredits.total,
      renewalDaysLeft: 29,
      hasOpenTicket: false,
    };
    buildTenantNotifs(ctx).forEach(n => notif.push(n));
  }, [storageQuota.warnLevel, storageQuota.isFrozen, aiCredits.used, aiCredits.total]);

  // Auto-generate financial-pattern notifications (missing evidence, health risk, spending anomaly)
  useEffect(() => {
    if (myEvents.length === 0) return;
    const myCash = cashAccounts.filter(a => a.workspaceId === wsId);
    const myBank = bankAccounts.filter(a => a.workspaceId === wsId);
    const myDebts = debtRecords.filter(d => d.workspaceId === wsId);
    const myCommitments = financialCommitments.filter(c => c.workspaceId === wsId);
    const scoring = computeFinancialHealthScoring(myCash, myBank, myEvents, myDebts, myCommitments, new Date());
    const alerts = buildFinancialNotifs(myEvents, docs, scoring, new Date());
    alerts.forEach(n => notif.push(n));
  }, [myEvents, docs, cashAccounts, bankAccounts, debtRecords, financialCommitments, wsId]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages, chatLoading]);
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
  useEffect(() => { supportEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [supportMessages, supportLoading]);
  const refreshMyTickets = useCallback(() => {
    if (isMockUser) return;
    getMyTenantSupportTickets().then(tickets => setMyTickets(tickets));
  }, [isMockUser]);
  useEffect(() => {
    if (morePage !== "support" || supportView !== "ticket_status" || isMockUser) return;
    let active = true;
    setMyTicketsLoading(true);
    getMyTenantSupportTickets().then(tickets => { if (active) { setMyTickets(tickets); setMyTicketsLoading(false); } });
    return () => { active = false; };
  }, [morePage, supportView, isMockUser]);
  useEffect(() => {
    if (isMockUser) return;
    let active = true;
    getTenantMyHealthScore().then(s => { if (active) setMyHealthScore(s); });
    return () => { active = false; };
  }, [isMockUser]);
  useEffect(() => {
    if (isMockUser || morePage !== "resources") return;
    getTenantAiCostSummary().then(setAiCostSummary);
  }, [isMockUser, morePage]);
  useEffect(() => {
    if (isMockUser || !showDataAccessLog || !tenantId) return;
    getMyDataAccessLog(tenantId).then(setDataAccessLog);
  }, [isMockUser, showDataAccessLog, tenantId]);
  useEffect(() => {
    if (morePage !== 'activity' || !isSupabaseConfigured() || isMockUser) return;
    let active = true;
    setActivityLoading(true);
    getTenantActivityFeed(activeWorkspace?.id).then(data => {
      if (!active) return;
      setTenantActivity(data);
      setActivityLoading(false);
    }).catch(() => { if (active) setActivityLoading(false); });
    return () => { active = false; };
  }, [morePage, activeWorkspace?.id]);

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
        pendingChatEvidenceRef.current = JSON.parse(evidenceStored);
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

  const [personalProfile, setPersonalProfile] = useState<PersonalProfile>(EMPTY_PERSONAL_PROFILE);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessBranches, setBusinessBranches] = useState<Record<string, BusinessBranch[]>>({});
  const [allBranchesLoaded, setAllBranchesLoaded] = useState(false);
  // Branch Mapping needs every active business's branches available up front
  // (not just the ones the user has manually expanded in My Profile), so the
  // matching engine below can check a transaction's text against the full
  // branch list at doc-review time.
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
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [dependents, setDependents] = useState<Dependent[]>([]);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSavedAt, setProfileSavedAt] = useState<number | null>(null);
  const [editingAccount, setEditingAccount] = useState(false);
  const [accountDraft, setAccountDraft] = useState({ fullName: "", email: "", mobileNumber: "", alternateNumber: "" });
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountMsg, setAccountMsg] = useState<string | null>(null);
  const startEditAccount = () => { setAccountDraft({ fullName: user?.fullName || "", email: user?.email || "", mobileNumber: (user as any)?.mobileNumber || "", alternateNumber: (user as any)?.alternateNumber || "" }); setAccountMsg(null); setEditingAccount(true); };
  const saveAccount = async () => {
    setAccountSaving(true);
    const res = await updateProfile(accountDraft.fullName, accountDraft.email);
    if (res.success && user?.tenantId) {
      await updateTenantMasterProfile(user.tenantId, {
        mobileNumber: accountDraft.mobileNumber.trim(),
        alternateNumber: accountDraft.alternateNumber.trim(),
      });
    }
    setAccountSaving(false);
    setAccountMsg(res.message);
    if (res.success) setEditingAccount(false);
  };
  const [newVehicle, setNewVehicle] = useState({ name: "", plateNumber: "", vehicleType: "", ownership: "BUSINESS" as "PERSONAL" | "BUSINESS" });
  const [newDependent, setNewDependent] = useState({ name: "", relationship: "", dateOfBirth: "" });
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [editVehicleForm, setEditVehicleForm] = useState({ name: "", plateNumber: "", vehicleType: "", ownership: "BUSINESS" as "PERSONAL" | "BUSINESS" });
  const [editingDependentId, setEditingDependentId] = useState<string | null>(null);
  const [editDependentForm, setEditDependentForm] = useState({ name: "", relationship: "", dateOfBirth: "" });
  const EMPTY_BUSINESS_FORM = { businessName: "", industry: "", businessType: "", registrationNo: "", notes: "" };
  const [newBusiness, setNewBusiness] = useState(EMPTY_BUSINESS_FORM);
  const [addingBusiness, setAddingBusiness] = useState(false);
  const [companyMasterForm, setCompanyMasterForm] = useState({
    registrationNo: "", taxNumber: "", industry: "", address: "",
    billingContactName: "", billingEmail: "", supportContactName: "", supportEmail: "",
  });
  const [companyMasterSaving, setCompanyMasterSaving] = useState(false);
  const [companyMasterMsg, setCompanyMasterMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!user?.tenantId || !isSupabaseConfigured() || !supabase) return;
    supabase.from("tenants").select("registration_no, tax_number, industry, address, billing_contact_name, billing_email, support_contact_name, support_email")
      .eq("id", user.tenantId).single().then(({ data }) => {
        if (data) {
          setCompanyMasterForm({
            registrationNo: data.registration_no || "", taxNumber: data.tax_number || "",
            industry: data.industry || "", address: data.address || "",
            billingContactName: data.billing_contact_name || "", billingEmail: data.billing_email || "",
            supportContactName: data.support_contact_name || "", supportEmail: data.support_email || "",
          });
        }
      });
  }, [user?.tenantId]);
  const saveCompanyMaster = async () => {
    if (!user?.tenantId) return;
    setCompanyMasterSaving(true);
    const ok = await updateTenantMasterProfile(user.tenantId, companyMasterForm);
    setCompanyMasterSaving(false);
    setCompanyMasterMsg(ok ? "Maklumat syarikat disimpan ✓" : "Gagal menyimpan. Sila cuba lagi.");
  };
  const [editingBusinessId, setEditingBusinessId] = useState<string | null>(null);
  const [editBusinessForm, setEditBusinessForm] = useState(EMPTY_BUSINESS_FORM);
  const [confirmDeleteBusinessId, setConfirmDeleteBusinessId] = useState<string | null>(null);
  const [newBranchByBusiness, setNewBranchByBusiness] = useState<Record<string, { branchName: string; location: string }>>({});
  const [expandedBusinessId, setExpandedBusinessId] = useState<string | null>(null);
  const [assetPurchases, setAssetPurchases] = useState<AssetPurchase[]>([]);
  const [ownerTransactions, setOwnerTransactions] = useState<OwnerTransaction[]>([]);
  const [profileNudgeDismissed, setProfileNudgeDismissed] = useState(false);
  useEffect(() => {
    if (wsId && localStorage.getItem(`mk_profile_nudge_dismissed_${wsId}`)) setProfileNudgeDismissed(true);
  }, [wsId]);

  // BUG-UI-01 — personalProfile/businesses/vehicles start out as empty
  // defaults (EMPTY_PERSONAL_PROFILE/[]/[]) on every render until their async
  // loads resolve, so the "fill profile" nudge below — which decides whether
  // to render based on those being empty — briefly evaluates true even for a
  // user with an already-complete profile. profileLoading gates the nudge so
  // it is only ever decided once the real data has actually arrived.
  const [profileLoading, setProfileLoading] = useState(true);
  const profileLoadingRef = useRef(profileLoading);
  useEffect(() => { profileLoadingRef.current = profileLoading; }, [profileLoading]);

  const refreshProfileData = () => {
    if (!wsId) return;
    // S-03: clear branches accumulated from the previous workspace so they
    // don't bleed into the new workspace's branch-matching results.
    setBusinessBranches({});
    setProfileLoading(true);
    Promise.all([
      loadPersonalProfile(wsId, isMockUser).then(setPersonalProfile),
      loadBusinesses(wsId, isMockUser).then(setBusinesses),
      loadVehicles(wsId, isMockUser).then(setVehicles),
    ]).finally(() => setProfileLoading(false));
    setAllBranchesLoaded(false);
    loadDependents(wsId, isMockUser).then(setDependents);
    loadAssetPurchases(wsId).then(setAssetPurchases);
    loadOwnerTransactions(wsId).then(setOwnerTransactions);
  };

  useEffect(() => { refreshProfileData(); }, [wsId, isMockUser]);

  const saveProfiles = async () => {
    setProfileSaving(true);
    // Save personal profile
    await savePersonalProfile(wsId, isMockUser, personalProfile);
    // Save company master data if the function exists
    if (typeof saveCompanyMaster === 'function') {
      await saveCompanyMaster();
    }
    // Save account info if editing
    if (editingAccount) {
      await updateProfile(accountDraft.fullName, accountDraft.email);
      setEditingAccount(false);
    }
    setProfileSaving(false);
    setProfileSavedAt(Date.now());
  };

  const submitNewBusiness = async () => {
    if (!newBusiness.businessName.trim()) return;
    await addBusiness(wsId, isMockUser, newBusiness);
    setNewBusiness(EMPTY_BUSINESS_FORM);
    setAddingBusiness(false);
    refreshProfileData();
  };

  const startEditBusiness = (b: Business) => {
    setEditingBusinessId(b.id);
    setEditBusinessForm({
      businessName: b.businessName,
      industry: b.industry,
      businessType: b.businessType,
      registrationNo: b.registrationNo,
      notes: b.notes,
    });
  };

  const submitEditBusiness = async () => {
    if (!editingBusinessId || !editBusinessForm.businessName.trim()) return;
    await updateBusiness(wsId, isMockUser, editingBusinessId, editBusinessForm);
    setEditingBusinessId(null);
    setEditBusinessForm(EMPTY_BUSINESS_FORM);
    refreshProfileData();
  };

  const removeBusiness = async (id: string) => {
    await deleteBusiness(wsId, isMockUser, id);
    setConfirmDeleteBusinessId(null);
    refreshProfileData();
  };

  const toggleBusinessBranches = (businessId: string) => {
    if (expandedBusinessId === businessId) {
      setExpandedBusinessId(null);
      return;
    }
    setExpandedBusinessId(businessId);
    loadBusinessBranches(wsId, isMockUser, businessId).then(branches => {
      setBusinessBranches(prev => ({ ...prev, [businessId]: branches }));
    });
  };

  const submitNewBranch = async (businessId: string) => {
    const form = newBranchByBusiness[businessId];
    if (!form || !form.branchName.trim()) return;
    await addBusinessBranch(wsId, isMockUser, { businessId, branchName: form.branchName, location: form.location });
    setNewBranchByBusiness(prev => ({ ...prev, [businessId]: { branchName: "", location: "" } }));
    loadBusinessBranches(wsId, isMockUser, businessId).then(branches => {
      setBusinessBranches(prev => ({ ...prev, [businessId]: branches }));
    });
  };

  const removeBranch = async (businessId: string, branchId: string) => {
    await deleteBusinessBranch(wsId, isMockUser, branchId);
    loadBusinessBranches(wsId, isMockUser, businessId).then(branches => {
      setBusinessBranches(prev => ({ ...prev, [businessId]: branches }));
    });
  };

  const submitNewVehicle = async () => {
    if (!newVehicle.name.trim()) return;
    await addVehicle(wsId, isMockUser, newVehicle);
    setNewVehicle({ name: "", plateNumber: "", vehicleType: "", ownership: "BUSINESS" });
    refreshProfileData();
  };

  const removeVehicle = async (id: string) => {
    await deleteVehicle(wsId, isMockUser, id);
    refreshProfileData();
  };

  const startEditVehicle = (v: Vehicle) => {
    setEditingVehicleId(v.id);
    setEditVehicleForm({ name: v.name, plateNumber: v.plateNumber, vehicleType: v.vehicleType, ownership: v.ownership });
  };

  const submitEditVehicle = async () => {
    if (!editingVehicleId || !editVehicleForm.name.trim()) return;
    await updateVehicle(wsId, isMockUser, editingVehicleId, editVehicleForm);
    setEditingVehicleId(null);
    refreshProfileData();
  };

  const submitNewDependent = async () => {
    if (!newDependent.name.trim()) return;
    await addDependent(wsId, isMockUser, newDependent);
    setNewDependent({ name: "", relationship: "", dateOfBirth: "" });
    refreshProfileData();
  };

  const removeDependent = async (id: string) => {
    await deleteDependent(wsId, isMockUser, id);
    refreshProfileData();
  };

  const startEditDependent = (d: Dependent) => {
    setEditingDependentId(d.id);
    setEditDependentForm({ name: d.name, relationship: d.relationship, dateOfBirth: d.dateOfBirth });
  };

  const submitEditDependent = async () => {
    if (!editingDependentId || !editDependentForm.name.trim()) return;
    await updateDependent(wsId, isMockUser, editingDependentId, editDependentForm);
    setEditingDependentId(null);
    refreshProfileData();
  };

  const removeAssetPurchase = async (id: string) => {
    await deleteAssetPurchase(wsId, id);
    refreshProfileData();
  };

  const removeOwnerTransaction = async (id: string) => {
    await deleteOwnerTransaction(wsId, id);
    refreshProfileData();
  };

  const sendChat = async (text?: string, attachment?: { documentType: "RECEIPT"; fileName: string; fileUrl: string }) => {
    const q = (text || chatInput).trim();
    if (!q || chatLoading) return;
    if (profileLoading) {
      // Issue #5 fix: personalProfile/businesses/vehicles are still mid-fetch
      // (e.g. right after login/workspace switch) — sending now would ship an
      // empty financialContext to the AI, making it look like the workspace
      // has no profile/vehicles at all. Wait for the in-flight load instead.
      // Bounded to 8s: if refreshProfileData's underlying loaders never settle
      // (a hung/dropped query), profileLoading would otherwise stay true forever
      // and this await would block sendChat indefinitely with zero feedback —
      // proceed with whatever context is available rather than hang the chat.
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
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, sender: "user", text: q, createdAt: new Date().toISOString() };
    setChatMessages(prev => [...prev, userMsg]);
    saveChatMessage(wsId, user?.id, isMockUser, { sender: "user", text: q }, activeSessionId ?? undefined);
    setChatLoading(true);
    try {
      const { getAuthHeader } = await import("../lib/supabase");
      // Same client-side bound as uploadChatAttachment: the server can try multiple
      // AI candidates in sequence (each with its own ~90s upstream timeout), so this
      // must not be allowed to hang indefinitely past a typical gateway timeout.
      const assistantController = new AbortController();
      const assistantTimeoutId = setTimeout(() => assistantController.abort(), 110000);
      let res: Response;
      try {
        res = await fetch("/api/ai/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
          body: JSON.stringify({
            query: q,
            financialContext: { activeTenant, activeWorkspace, financialEvents, cashAccounts, bankAccounts, personalProfile, businesses, businessBranches, vehicles, dependents, assetPurchases, ownerTransactions },
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
      // financial_evidence_packages row automatically, with no extra owner action.
      // Same shared Evidence Linking engine as StaffHomeScreen.tsx's sendChat.
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
          // Reuse the same Business/Branch Mapping engine used by Bank Statement and
          // OCR confirm flows — never duplicate the matching logic for AI Chat.
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
      setChatMessages(prev => [...prev, { id: `e-${Date.now()}`, sender: "ai", text: "Minta maaf, sambungan terputus sebentar. Sila cuba lagi." }]);
    } finally {
      setChatLoading(false);
    }
  };

  // Upload a chat attachment (receipt image, PDF, or recorded voice note). Persisted
  // via the same evidence_documents pipeline as the Dokumen tab uploads (docType
  // SUPPORTING_DOC) so it shows up there too with full uploader/date/size metadata,
  // not just inside the chat thread.
  const uploadChatAttachment = async (file: File, kind: "image" | "pdf" | "audio") => {
    if (!activeWorkspace) return;
    setChatAttaching(true);
    try {
      let fileUrl = "";
      let evidenceFileUrl = "";
      const canPersistDoc = isSupabaseConfigured() && !isMockUser && supabase && !isDemoWorkspace(activeWorkspace.id) && user;
      if (canPersistDoc) {
        const { doc, error, isDuplicate } = await uploadDocument(file, activeWorkspace.id, user!.id, kind === "audio" ? "SUPPORTING_DOC" : "RECEIPT");
        if (doc && !error) {
          setDocs(prev => (isDuplicate && prev.some(d => d.id === doc.id) ? prev : [doc, ...prev]));
          fileUrl = (await getDocumentUrl(doc.file_path_supabase)) || "";
          evidenceFileUrl = fileUrl || doc.file_path_supabase;
          if (isDuplicate) {
            setChatMessages(prev => [...prev, { id: `dup-${Date.now()}`, sender: "ai", text: `Fail "${file.name}" ini sudah pernah dimuat naik sebelum ini — saya guna rekod sedia ada, tidak muat naik dua kali.` }]);
          }
          logEvent({
            tenantId: activeWorkspace.tenantId, workspaceId: activeWorkspace.id, userId: user?.id,
            userEmail: user?.email, userRole: user?.role, eventType: "UPLOAD",
            description: `Receipt/document uploaded via chat: ${file.name}`,
            metadata: { fileName: file.name, docId: doc.id, filePath: doc.file_path_supabase },
          });
        } else if (kind !== "audio") {
          // Storage success must be verified before OCR/AI ever runs on this file —
          // a receipt must never be analyzed if it was not actually persisted.
          setChatMessages(prev => [...prev, { id: `e-${Date.now()}`, sender: "ai", text: `Muat naik "${file.name}" gagal disimpan${error ? ` (${error})` : ""}. Sila cuba muat naik semula — saya tidak akan menganalisis fail yang gagal disimpan.` }]);
          setChatAttaching(false);
          return;
        }
      }
      if (!fileUrl) {
        // Fallback: embed as a local object URL so the attachment still shows in-session.
        // Only reached for demo/mock sessions (canPersistDoc false) — real workspaces
        // already returned above on any persistence failure.
        fileUrl = URL.createObjectURL(file);
      }
      // Voice notes are transcribed, not filed as accounting evidence — only
      // OCR/image/PDF attachment uploads become a linked financial_evidence_packages
      // row. Same shared Evidence Linking engine as StaffHomeScreen.tsx.
      const evidenceAttachment = kind !== "audio" && evidenceFileUrl
        ? { documentType: "RECEIPT" as const, fileName: file.name, fileUrl: evidenceFileUrl }
        : undefined;
      const label = kind === "audio" ? "Nota suara" : kind === "pdf" ? "Dokumen PDF" : "Resit";
      const msgId = `u-${Date.now()}`;
      const userMsg: ChatMsg = {
        id: msgId,
        sender: "user",
        text: `[Lampiran: ${label} - ${file.name}]`,
        createdAt: new Date().toISOString(),
        attachmentUrl: fileUrl,
        attachmentName: file.name,
        attachmentType: kind,
      };
      setChatMessages(prev => [...prev, userMsg]);
      saveChatMessage(wsId, user?.id, isMockUser, { sender: "user", text: userMsg.text, attachmentUrl: fileUrl, attachmentName: file.name, attachmentType: kind }, activeSessionId ?? undefined);

      // Actually read the attachment's content before asking the AI to act on it —
      // otherwise the assistant only sees a filename and can only say "please wait"
      // (image/pdf) or "I can't listen to audio" (voice notes), as it had no real
      // content to reason about.
      let extractedContext = "";
      try {
        // Multiple AI candidates can each be tried in sequence server-side (each with
        // its own ~90s upstream timeout), so a worst-case multi-candidate run can take
        // longer than a typical reverse-proxy/gateway timeout — leaving this fetch
        // neither resolved nor rejected and blocking the `await sendChat(...)` below
        // forever. Bound it client-side too so the chat ALWAYS gets a reply.
        const attachmentController = new AbortController();
        const attachmentTimeoutId = setTimeout(() => attachmentController.abort(), 110000);
        try {
          if (kind === "audio") {
            const audioDataUrl = await fileToDataUrl(file);
            const { getAuthHeader } = await import("../lib/supabase");
            const res = await fetch("/api/ai/transcribe", {
              method: "POST",
              headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
              body: JSON.stringify({ fileDataUrl: audioDataUrl, fileName: file.name, tenantId: activeWorkspace.tenantId, workspaceId: activeWorkspace.id, userId: user?.id }),
              signal: attachmentController.signal,
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
              body: JSON.stringify({ fileDataUrl, fileName: file.name, documentType: "RECEIPT", tenantId: activeWorkspace.tenantId, workspaceId: activeWorkspace.id, userId: user?.id }),
              signal: attachmentController.signal,
            });
            if (res.ok) {
              const payload = await res.json();
              extractedContext = `Maklumat dibaca daripada dokumen: merchant=${payload.merchantName || "-"}, tarikh=${payload.date || "-"}, jumlah=${payload.amount ?? "-"}, kategori cadangan=${payload.suggestedCategory || "-"}.`;
            }
          }
        } finally {
          clearTimeout(attachmentTimeoutId);
        }
      } catch {
        // best-effort (including a client-side timeout abort) — fall back to the
        // plain attachment label below; sendChat() below still always fires.
      }

      // Let the AI clerk acknowledge the attachment and continue the conversation.
      await sendChat(
        extractedContext
          ? `Saya telah lampirkan ${label.toLowerCase()} "${file.name}". ${extractedContext} Sila semak dan bantu saya rekodkan jika berkaitan transaksi.`
          : `Saya telah lampirkan ${label.toLowerCase()} "${file.name}". Sila semak dan bantu saya rekodkan jika berkaitan transaksi.`,
        evidenceAttachment
      );
    } catch {
      // Any unhandled failure anywhere above (upload, signed-URL fetch,
      // saveChatMessage, etc.) must never silently drop the attachment —
      // this was the root cause of "no attachment appears, no AI response,
      // refresh required": uploadChatAttachment() is fire-and-forget at the
      // call site, so without this catch a thrown error here vanished with
      // no trace and no user-visible feedback.
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
      setChatMessages(prev => [...prev, { id: `e-${Date.now()}`, sender: "ai", text: "Saiz fail melebihi had 10MB. Sila guna fail yang lebih kecil." }]);
      return;
    }
    const kind: "image" | "pdf" = file.type === "application/pdf" ? "pdf" : "image";
    uploadChatAttachment(file, kind);
  };

  const startChatVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chatRecordedChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chatRecordedChunksRef.current.push(e.data); };
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
      setChatMessages(prev => [...prev, { id: `e-${Date.now()}`, sender: "ai", text: "Tidak dapat mengakses mikrofon. Sila semak kebenaran pelayar anda." }]);
    }
  };

  const stopChatVoiceRecording = () => {
    chatMediaRecorderRef.current?.stop();
    setChatRecording(false);
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
      date: savedDate || todayLocalIso(),
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
      date: s.payload?.date || todayLocalIso(),
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
    let fileUrl = "";
    const canPersistDoc = activeWorkspace && isSupabaseConfigured() && !isMockUser && supabase && !isDemoWorkspace(activeWorkspace.id) && user;
    if (canPersistDoc) {
      const { doc, error, isDuplicate } = await uploadDocument(file, activeWorkspace!.id, user!.id, "RECEIPT");
      if (doc && !error) {
        setDocs(prev => (isDuplicate && prev.some(d => d.id === doc.id) ? prev : [doc, ...prev]));
        fileUrl = (await getDocumentUrl(doc.file_path_supabase)) || "";
      }
    }
    if (!fileUrl) fileUrl = URL.createObjectURL(file);
    pendingChatEvidenceRef.current[suggestionId] = { documentType: "RECEIPT", fileName: file.name, fileUrl };
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

    // C-02: Log owner financial record action for activity feed
    if (isSupabaseConfigured() && !isMockUser && user && activeWorkspace) {
      logTenantActivity({
        workspaceId: activeWorkspace.id,
        actorId: user.id,
        actorEmail: user.email || '',
        actorRole: user.role || 'TENANT_OWNER',
        actorName: user.fullName,
        actionType: 'RECORD_CREATED',
        module: 'Financial Records',
        description: `Owner sahkan cadangan rekod ${s.payload?.transactionType || 'kewangan'} — RM${s.payload?.amount || 0}`,
        metadata: { recordId: result.recordId, type: s.payload?.transactionType, amount: s.payload?.amount },
      }).catch(() => {}); // fire and forget
    }

    setEditingChatSuggestionId(null);
    } finally {
      setConfirmingChatId(null);
    }
  };

  // Save an edit to an ALREADY-confirmed chat suggestion: update the saved record in place
  // (instead of inserting a new one) using the recordId/recordType captured at confirm time.
  const handleChatSaveConfirmedEdit = (s: ChatSuggestion, edited: typeof chatEditDraft) => {
    // PB-1: permission check (documents intent; owner has all permissions).
    if (!hasPermission('Financial Records', 'update')) { setChatActionErrors(prev => ({ ...prev, [s.id]: "Tiada kebenaran untuk mengubah rekod." })); return; }
    const current = chatSuggestionStatus[s.id];
    if (!current?.recordId || !current.recordType) return;
    const amountMyr = Number(edited.amount) || 0;
    const categoryName = edited.category || "Lain-lain";
    const partyName = edited.relatedParty || "Tidak Dinyatakan";
    const date = edited.date || todayLocalIso();

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
      // Map edited transactionType to the correct type column
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

  // Padam (delete) an already-confirmed chat suggestion's saved record, then mark the
  // suggestion as rejected so it disappears from the thread like a never-confirmed one.
  const handleChatDeleteConfirmed = (s: ChatSuggestion) => {
    const current = chatSuggestionStatus[s.id];
    if (!current?.recordId || !current.recordType) return;
    if (!window.confirm("Padam rekod ini? Tindakan ini tidak boleh dibatalkan.")) return;
    if (current.recordType === "DEBT") deleteDebtRecord(current.recordId);
    else if (current.recordType === "COMMITMENT") deleteFinancialCommitment(current.recordId);
    else deleteFinancialEvent(current.recordId);
    markChatSuggestionStatus(s.id, { status: "rejected" });
  };

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
        body: JSON.stringify({
          query: `[SOKONGAN MYKERANI] ${q}`,
          financialContext: { activeTenant, activeWorkspace, financialEvents },
          userId: user?.id,
        }),
      });
      const data = await res.json() as any;
      setSupportMessages(prev => [...prev, { id: `a-${Date.now()}`, sender: "ai", text: data.text || data.error || "Saya sedang menyemak soalan anda." }]);
    } catch {
      setSupportMessages(prev => [...prev, { id: `e-${Date.now()}`, sender: "ai", text: "Maaf, sambungan terputus. Cuba lagi atau buka tiket sokongan." }]);
    } finally {
      setSupportLoading(false);
    }
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
      referenceNumber: `TXN-${Date.now().toString().slice(-6)}`,
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
    // C-02: Log owner record addition for activity feed
    if (isSupabaseConfigured() && !isMockUser && user && activeWorkspace) {
      logTenantActivity({
        workspaceId: activeWorkspace.id,
        actorId: user.id,
        actorEmail: user.email || '',
        actorRole: user.role || 'TENANT_OWNER',
        actorName: user.fullName,
        actionType: 'RECORD_CREATED',
        module: 'Financial Records',
        description: `Owner tambah rekod ${data.type} — RM${data.amount}`,
        metadata: { type: data.type, amount: data.amount, category: categoryName, party: data.party, date: data.date },
      }).catch(() => {}); // fire and forget
    }
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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ email: inviteEmail.trim(), fullName: inviteName.trim(), role: "TENANT_STAFF" }),
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

  const handleChangeMemberRole = async (member: { id: string; userId: string; email: string; fullName: string }, newRole: string) => {
    setRoleChangeLoadingId(member.id);
    try {
      const ok = await tenantAssignStaffRole(member.userId, member.email, member.fullName, newRole);
      if (ok) setMemberRoleOverrides(prev => ({ ...prev, [member.id]: newRole }));
    } finally {
      setRoleChangeLoadingId(null);
    }
  };

  const handleRevokeMember = async (member: { id: string; fullName: string; email: string }) => {
    if (!window.confirm(`Tarik balik akses ${member.fullName} (${member.email})?`)) return;
    setRoleChangeLoadingId(member.id);
    try {
      const ok = await tenantRevokeStaffRole(member.id);
      if (ok) setRevokedMemberIds(prev => ({ ...prev, [member.id]: true }));
    } finally {
      setRoleChangeLoadingId(null);
    }
  };

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

  const QUICK_PROMPTS = [
    { label: "Baki tunai saya?", q: "Berapa baki tunai saya sekarang?" },
    { label: "Ringkasan bulan ini", q: "Ringkaskan kewangan saya bulan ini." },
    { label: "Bil tertunggak?", q: "Adakah ada bil yang perlu dibayar?" },
    { label: "Pendapatan vs Perbelanjaan", q: "Bandingkan pendapatan dan perbelanjaan bulan ini." },
  ];

  return (
    <div className="h-screen flex flex-col overflow-hidden" id="owner_root" style={{background:"#F4F8F5"}}>
      <style>{`
        #owner_root .bg-emerald-700{background-color:#5A9E7A!important}
        #owner_root .bg-emerald-800{background-color:#3D7057!important}
        #owner_root .bg-emerald-600{background-color:#6AAD8A!important}
        #owner_root .bg-emerald-50{background-color:#DFF0E8!important}
        #owner_root .bg-emerald-100{background-color:#CCE8D9!important}
        #owner_root .text-emerald-700{color:#2C5040!important}
        #owner_root .text-emerald-800{color:#1A3D2B!important}
        #owner_root .text-emerald-600{color:#3D7057!important}
        #owner_root .text-emerald-900{color:#122B1E!important}
        #owner_root .text-emerald-500{color:#5A9E7A!important}
        #owner_root .border-emerald-100{border-color:#CCE8D9!important}
        #owner_root .border-emerald-200{border-color:#B3D9C5!important}
        #owner_root .hover\\:bg-emerald-800:hover{background-color:#3D7057!important}
        #owner_root .hover\\:bg-emerald-100:hover{background-color:#CCE8D9!important}
        #owner_root .focus\\:border-emerald-400:focus{border-color:#7DC4A5!important}
        #owner_root .from-emerald-600{--tw-gradient-from:#5A9E7A!important}
        #owner_root .to-emerald-800{--tw-gradient-to:#3D7057!important}
      `}</style>

      {/* â"€â"€ HEADER â"€â"€ */}
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
          {/* Bell */}
          <div className="relative">
            <button onClick={() => setShowNotifPanel(p => !p)}
              className="relative p-1.5 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-slate-400 hover:text-indigo-500 rounded-xl transition cursor-pointer">
              <Bell className="w-3.5 h-3.5" />
              {notif.unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {notif.unreadCount > 9 ? "9+" : notif.unreadCount}
                </span>
              )}
            </button>
          </div>

          <button onClick={() => signOut()}
            className="p-1.5 bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-400 hover:text-rose-500 rounded-xl transition cursor-pointer">
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Notification Panel */}
      {showNotifPanel && (
        <div className="fixed inset-0 z-50" onClick={() => setShowNotifPanel(false)}>
          <div className="absolute top-14 right-3 w-80 max-h-[75vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}>
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-slate-900">Notifikasi</p>
                {notif.unreadCount > 0 && (
                  <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">{notif.unreadCount} baru</span>
                )}
              </div>
              <button onClick={notif.markAllRead} className="text-[11px] text-indigo-500 font-semibold cursor-pointer hover:text-indigo-700">
                Tandai semua dibaca
              </button>
            </div>

            {/* Notification list */}
            <div className="overflow-y-auto flex-1">
              {notif.notifs.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-slate-200 mx-auto" />
                  <p className="text-xs text-slate-400">Tiada notifikasi</p>
                </div>
              ) : (
                notif.notifs.map(n => {
                  const severityBar = n.severity === "critical" ? "bg-red-500" : n.severity === "warn" ? "bg-amber-400" : "bg-blue-400";
                  const severityBg  = n.read ? "bg-white" : n.severity === "critical" ? "bg-red-50" : n.severity === "warn" ? "bg-amber-50/60" : "bg-blue-50/40";
                  return (
                    <div key={n.id} className={`flex gap-3 px-4 py-3 border-b border-slate-50 cursor-pointer hover:bg-slate-50 transition ${severityBg}`}
                      onClick={() => { notif.markRead(n.id); setShowNotifPanel(false); if (n.action === "billing") { setActiveTab("more"); setMorePage("billing"); } else if (n.action === "storage") { setActiveTab("more"); setMorePage("resources"); } else if (n.action === "support") { setActiveTab("more"); setMorePage("support"); } }}>
                      <div className={`w-1 rounded-full shrink-0 self-stretch ${severityBar}`} />
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-xs font-bold ${n.read ? "text-slate-600" : "text-slate-900"}`}>{n.title}</p>
                          <button onClick={e => { e.stopPropagation(); notif.dismiss(n.id); }}
                            className="shrink-0 text-slate-300 hover:text-slate-500 cursor-pointer mt-0.5">
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

            {/* Footer */}
            {notif.notifs.length > 0 && (
              <div className="px-4 py-2.5 border-t border-slate-100 flex justify-end">
                <button onClick={notif.clearAll} className="text-[11px] text-slate-400 cursor-pointer hover:text-slate-600">Padam semua</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* â"€â"€ MAIN â"€â"€ */}
      <div className="flex-1 overflow-hidden flex flex-col" id="owner_main">

        {/* â•â•â•â• HOME â€" AI CONVERSATION (Primary Screen) â•â•â•â• */}
        {activeTab === "home" && (
          <div className="flex-1 flex flex-col overflow-hidden" id="owner_home_pane">

            {chatMessages.length > 0 && (
              <div className="px-4 pt-3 flex justify-end shrink-0">
                <button type="button" onClick={() => setChatMessages([])}
                  className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Chat Baharu
                </button>
              </div>
            )}

            {/* Conversation area */}
            <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2 space-y-4" id="owner_chat_area">

              {/* Welcome + Financial Snapshot â€" shown only if no messages */}
              {chatMessages.length === 0 && (
                <div className="space-y-4 pt-2">
                  {/* Greeting */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center shadow shrink-0">
                      <Brain className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900">{greeting}, {firstName}</h2>
                      <p className="text-xs text-slate-400">{new Date(nowIso).toLocaleDateString("ms-MY", { weekday:"long", day:"numeric", month:"long" })}</p>
                    </div>
                  </div>

                  {/* Onboarding nudge: encourage filling the optional Profile System so AI can disambiguate */}
                  {!profileLoading && !profileNudgeDismissed && !personalProfile.fullName && businesses.length === 0 && vehicles.length === 0 && (
                    <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-start gap-3">
                      <Brain className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-indigo-800">Bantu MYKERANI AI kenal anda lebih baik</p>
                        <p className="text-xs text-indigo-600 mt-0.5">Tambah profil peribadi, perniagaan & kenderaan (pilihan) supaya AI boleh bezakan transaksi peribadi & perniagaan dengan tepat — contoh: "isi minyak RM50" untuk Hilux atau Myvi?</p>
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => { setMorePage("myProfile"); setActiveTab("more"); }} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold cursor-pointer">Isi Profil</button>
                          <button onClick={() => { setProfileNudgeDismissed(true); localStorage.setItem(`mk_profile_nudge_dismissed_${wsId}`, "1"); }} className="px-3 py-1.5 text-indigo-500 rounded-lg text-xs font-semibold cursor-pointer">Lain kali</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Financial Snapshot */}
                  {myEvents.length > 0 ? (
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ringkasan Bulan Ini</p>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="text-center">
                          <p className="text-[10px] text-slate-400 mb-0.5">Masuk</p>
                          <p className="text-sm font-bold text-emerald-600">RM {incomeThisMonth.toLocaleString("ms-MY",{minimumFractionDigits:0})}</p>
                        </div>
                        <div className="text-center border-x border-slate-100">
                          <p className="text-[10px] text-slate-400 mb-0.5">Keluar</p>
                          <p className="text-sm font-bold text-rose-500">RM {expenseThisMonth.toLocaleString("ms-MY",{minimumFractionDigits:0})}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] text-slate-400 mb-0.5">Bersih</p>
                          <p className={`text-sm font-bold ${(incomeThisMonth-expenseThisMonth)>=0?"text-slate-800":"text-rose-500"}`}>
                            {(incomeThisMonth-expenseThisMonth)>=0?"+":"-"}RM {Math.abs(incomeThisMonth-expenseThisMonth).toLocaleString("ms-MY",{minimumFractionDigits:0})}
                          </p>
                        </div>
                      </div>
                      {/* Recent 3 transactions */}
                      {myEvents.length > 0 && (
                        <div className="space-y-1.5 pt-1 border-t border-slate-100">
                          {myEvents.slice(-3).reverse().map(ev => (
                            <div key={ev.id} className="flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 ${ev.type==="INCOME"?"bg-emerald-50":"bg-rose-50"}`}>
                                  {ev.type==="INCOME"?<TrendingUp className="w-3 h-3 text-emerald-500"/>:<TrendingDown className="w-3 h-3 text-rose-400"/>}
                                </div>
                                <p className="text-[11px] text-slate-600 truncate">{getFriendlyTransactionLabel(ev, businesses).label}</p>
                              </div>
                              <span className={`text-[11px] font-bold shrink-0 ${ev.type==="INCOME"?"text-emerald-600":"text-rose-500"}`}>
                                {ev.type==="INCOME"?"+":"-"}RM {ev.amountMyr.toFixed(2)}
                              </span>
                            </div>
                          ))}
                          <button onClick={()=>setActiveTab("dashboard")} className="text-[10px] text-indigo-500 font-semibold w-full text-right cursor-pointer hover:underline">
                            Lihat semua -&gt;
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-5 text-center space-y-2">
                      <Wallet className="w-8 h-8 text-slate-200 mx-auto" />
                      <p className="text-xs font-semibold text-slate-500">Belum ada rekod kewangan</p>
                      <p className="text-[11px] text-slate-400">Beritahu MYKERANI atau gunakan butang di bawah untuk tambah rekod pertama anda.</p>
                    </div>
                  )}

                  {/* Storage compact bar */}
                  {storageQuota.warnLevel !== "none" && (
                    <StorageBar quota={storageQuota} compact onBuyAddon={() => setShowAddonModal(true)} />
                  )}

                  {/* Account Health (read-only, gap 8.3) */}
                  {myHealthScore && myHealthScore.riskLevel !== "low" && (
                    <div className={`rounded-2xl p-4 border ${myHealthScore.riskLevel === "high" ? "bg-red-50 border-red-100" : "bg-amber-50 border-amber-100"}`}>
                      <p className={`text-xs font-bold ${myHealthScore.riskLevel === "high" ? "text-red-700" : "text-amber-700"}`}>
                        Kesihatan Akaun: {myHealthScore.riskLevel === "high" ? "Perlu Perhatian" : "Sederhana"}
                      </p>
                      {myHealthScore.reasons.length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                          {myHealthScore.reasons.map((reason, i) => (
                            <li key={i} className={`text-[11px] ${myHealthScore.riskLevel === "high" ? "text-red-600" : "text-amber-600"}`}>• {reason}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  <p className="text-xs text-slate-400 text-center">Tanya saya apa sahaja tentang kewangan anda</p>
                </div>
              )}

              {/* Chat messages */}
              {chatMessages.map(msg => {
                const isUser = msg.sender === "user";
                const hasTxnSuggestion = (msg.suggestions || []).some(s => s.actionType === "CONFIRM_TRANSACTION");
                return (
                  <React.Fragment key={msg.id}>
                    {!hasTxnSuggestion && (
                      <div className={`flex items-start gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
                        <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${isUser ? "bg-indigo-600 text-white" : "bg-slate-900 text-white"}`}>
                          {isUser ? <UserIcon className="w-3.5 h-3.5" /> : <Brain className="w-3.5 h-3.5" />}
                        </div>
                        <div className={`max-w-[78%] space-y-1.5`}>
                          {msg.attachmentUrl && (
                            <div className={`rounded-2xl overflow-hidden border ${isUser ? "border-indigo-200" : "border-slate-200"}`}>
                              {msg.attachmentType === "image" ? (
                                <img src={msg.attachmentUrl} alt={msg.attachmentName || "Lampiran"} className="max-h-48 w-auto" />
                              ) : msg.attachmentType === "audio" ? (
                                <audio controls src={msg.attachmentUrl} className="w-full" />
                              ) : (
                                <a href={msg.attachmentUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2 bg-white text-xs font-semibold text-indigo-700 hover:underline max-w-[220px] truncate" title={msg.attachmentName}>
                                  <FileIcon className="w-4 h-4 shrink-0" /> <span className="truncate">{msg.attachmentName ? (msg.attachmentName.length > 20 ? msg.attachmentName.substring(0, 12) + "..." + msg.attachmentName.substring(msg.attachmentName.length - 5) : msg.attachmentName) : "Dokumen"}</span>
                                </a>
                              )}
                            </div>
                          )}
                          <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${isUser ? "bg-indigo-600 text-white rounded-tr-none" : "bg-white border border-slate-200 text-slate-800 rounded-tl-none whitespace-pre-wrap shadow-sm"}`}>
                            {msg.text}
                          </div>
                        </div>
                      </div>
                    )}
                    {hasTxnSuggestion && isUser && (
                      <div className="flex items-start gap-2.5 flex-row-reverse">
                        <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 bg-indigo-600 text-white">
                          <UserIcon className="w-3.5 h-3.5" />
                        </div>
                        <div className="max-w-[78%] px-4 py-3 rounded-2xl text-sm leading-relaxed bg-indigo-600 text-white rounded-tr-none">
                          {msg.text}
                        </div>
                      </div>
                    )}
                    {(msg.suggestions || []).map(s => {
                      const statusObj = chatSuggestionStatus[s.id] || { status: "pending" as const };
                      const status = statusObj.status;
                      if (status === "rejected") return null;
                      const extra = chatSuggestionExtra[s.id] || { businessId: null, businessName: "", businessPicked: businesses.filter(b => b.isActive).length === 0, evidenceStatus: "NONE" as const, branchPicked: true };
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
                            {chatActionErrors[s.id] && (
                              <div className="flex items-start justify-between gap-2 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5 text-2xs text-rose-700">
                                <span>{chatActionErrors[s.id]}</span>
                                <button type="button" onClick={() => setChatActionErrors(prev => { const next = { ...prev }; delete next[s.id]; return next; })} className="text-rose-400 hover:text-rose-600 cursor-pointer shrink-0">✕</button>
                              </div>
                            )}
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
                                  <div className="text-[10px] text-slate-400">
                                    {new Date(statusObj.confirmedAt).toLocaleDateString("ms-MY", { day: "numeric", month: "short", year: "numeric" })}{" "}
                                    {new Date(statusObj.confirmedAt).toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit" })}
                                    {statusObj.confirmedByName ? ` - ${statusObj.confirmedByName}` : ""}
                                    {statusObj.confirmedByUserId ? ` - ID: ${statusObj.confirmedByUserId.slice(0, 8)}` : ""}
                                  </div>
                                )}
                                <div className="flex gap-1.5">
                                  <button type="button" onClick={() => handleChatStartEdit(s)}
                                    disabled={statusObj.recordType === "TRANSFER" || !statusObj.recordId}
                                    className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold text-xs disabled:opacity-50 disabled:cursor-not-allowed">
                                    Edit
                                  </button>
                                  <button type="button" onClick={() => handleChatDeleteConfirmed(s)}
                                    className="px-3 py-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 font-semibold text-xs">
                                    Padam
                                  </button>
                                </div>
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
                                {extra.autoMapped && <span className="ml-1.5 text-[10px] text-emerald-600 font-semibold">✓ Auto-mapped</span>}
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
                                  <div className="space-y-1.5">
                                    <div className="text-xs text-slate-500">
                                      Evidence: {extra.evidenceStatus === "ATTACHED"
                                        ? <span className="font-semibold text-emerald-700">Resit dilampirkan: {chatEvidenceFilesRef.current[s.id]?.name || "fail"}</span>
                                        : <span className="font-semibold text-slate-600">Tiada resit</span>}
                                    </div>
                                    {extra.evidenceStatus === "ATTACHED" && chatEvidenceFilesRef.current[s.id]?.type.startsWith("image/") && (
                                      <img src={evidencePreviewUrls[s.id]} alt="Pratonton resit" className="max-h-32 rounded-lg border border-slate-200" />
                                    )}
                                  </div>
                                )}
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
                  thread never goes visually silent while either fetch is in flight.
                  Each call can take up to ~110s server-side; without this bubble the
                  user has no in-thread signal during the OCR phase and may refresh
                  mid-request, killing the in-flight call and losing the reply. */}
              {(chatAttaching || chatLoading) && (
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  </div>
                  <div className="px-4 py-3 bg-white border border-slate-200 rounded-2xl rounded-tl-none text-xs text-slate-400 shadow-sm animate-pulse">
                    {chatAttaching
                      ? "MYKERANI sedang membaca dokumen anda... Ini mungkin mengambil masa sehingga 2 minit. Sila jangan refresh halaman."
                      : "MYKERANI sedang menyemak maklumat..."}
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Quick prompts â€" shown only if no messages */}
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
                { label: "Resit", desc: "RECEIPT" },
                { label: "Invois", desc: "INVOICE" },
                { label: "Penyata Bank", desc: "STATEMENT" },
              ].map(({ label }) => (
                <button key={label} onClick={() => setActiveTab("documents")}
                  className="flex-1 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 transition cursor-pointer shadow-sm">
                  {label}
                </button>
              ))}
            </div>

            {/* Chat input */}
            <div className="px-4 pb-4 shrink-0">
              {chatRecording && (
                <div className="mb-2 flex items-center justify-between bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                  <span className="text-xs font-semibold text-rose-700 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" /> Sedang merekod nota suara...
                  </span>
                  <button type="button" onClick={stopChatVoiceRecording} className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-bold cursor-pointer">
                    Hentikan & Hantar
                  </button>
                </div>
              )}
              <input ref={chatFileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleChatFilePicked} />
              <form onSubmit={e => { e.preventDefault(); sendChat(); }}
                className="flex items-center gap-2 bg-white border border-slate-300 rounded-2xl px-4 py-3 shadow-sm focus-within:border-indigo-400 transition">
                <button type="button" onClick={() => chatFileInputRef.current?.click()} disabled={chatAttaching || chatRecording}
                  title="Lampir resit / PDF" aria-label="Lampir fail"
                  className="w-7 h-7 rounded-xl flex items-center justify-center text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition cursor-pointer disabled:opacity-40 shrink-0">
                  <Paperclip className="w-4 h-4" />
                </button>
                <button type="button" onClick={chatRecording ? stopChatVoiceRecording : startChatVoiceRecording} disabled={chatAttaching}
                  title="Rekod nota suara" aria-label="Rekod nota suara"
                  className={`w-7 h-7 rounded-xl flex items-center justify-center transition cursor-pointer disabled:opacity-40 shrink-0 ${chatRecording ? "text-white bg-rose-500" : "text-emerald-600 bg-emerald-50 hover:bg-emerald-100"}`}>
                  {chatRecording ? <Square className="w-3.5 h-3.5" /> : <Mic className="w-4 h-4" />}
                </button>
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder={chatAttaching ? "Memuat naik lampiran..." : "Taip di sini... Cth: Saya bayar pembekal RM500"}
                  disabled={chatAttaching}
                  className="flex-1 text-sm outline-none text-slate-800 placeholder-slate-400 bg-transparent"
                />
                <button type="submit" disabled={!chatInput.trim() || chatLoading || chatAttaching}
                  className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center disabled:bg-slate-200 transition cursor-pointer shrink-0">
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>

              {/* Smart quick actions */}
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  { label: "+ Pendapatan", action: () => setQuickAdd("INCOME"), color: "text-emerald-600 bg-emerald-50 border-emerald-100" },
                  { label: "- Perbelanjaan", action: () => setQuickAdd("EXPENSE"), color: "text-rose-600 bg-rose-50 border-rose-100" },
                  { label: "Dashboard", action: () => setActiveTab("dashboard"), color: "text-indigo-600 bg-indigo-50 border-indigo-100" },
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

        {/* â•â•â•â• DASHBOARD â•â•â•â• */}
        {activeTab === "dashboard" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-2xl mx-auto w-full pb-20" id="owner_dashboard_pane">
            {/* Section 1 — Financial Overview: visible without scrolling */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Dashboard</h2>
                <p className="text-xs text-slate-400">{healthFilterRecordIds ? `Ditapis: ${healthFilterLabel}` : periodRange.label}</p>
              </div>
              <div className="flex bg-slate-100 rounded-xl p-0.5 gap-0.5">
                {([
                  { key: "day", label: "Harian" },
                  { key: "week", label: "Mingguan" },
                  { key: "month", label: "Bulanan" },
                  { key: "year", label: "Tahunan" },
                ] as const).map(({ key, label }) => (
                  <button key={key} onClick={() => setDashboardPeriod(key)}
                    className={`px-2 py-1.5 rounded-lg text-[10px] font-bold transition cursor-pointer ${dashboardPeriod === key ? "bg-indigo-600 text-white shadow" : "text-slate-500 hover:bg-slate-200"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Empty State Rule: a workspace with zero financial records ever
                (not just zero in the selected period) gets contextual guidance
                instead of a wall of RM0.00 cards below — surfaced once, the
                cards underneath still render normally (and correctly) once a
                real record exists. */}
            {myEvents.length === 0 && (
              <button onClick={() => setActiveTab("home")}
                className="w-full bg-white border border-dashed border-slate-200 rounded-2xl p-4 text-center space-y-1.5 cursor-pointer hover:border-indigo-300 transition">
                <Wallet className="w-7 h-7 text-slate-200 mx-auto" />
                <p className="text-xs font-semibold text-slate-500">Belum ada rekod. Upload resit pertama anda.</p>
                <p className="text-[11px] text-indigo-500 font-semibold">Beritahu MYKERANI -&gt;</p>
              </button>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-4 text-white shadow">
                <p className="text-[11px] text-emerald-100">Pendapatan</p>
                <p className="text-xl font-bold mt-1">RM {incomeInPeriod.toLocaleString("ms-MY", { minimumFractionDigits: 2 })}</p>
                <TrendingUp className="w-4 h-4 text-emerald-200 mt-1" />
              </div>
              <div className="bg-gradient-to-br from-rose-500 to-pink-600 rounded-2xl p-4 text-white shadow">
                <p className="text-[11px] text-rose-100">Perbelanjaan</p>
                <p className="text-xl font-bold mt-1">RM {expenseInPeriod.toLocaleString("ms-MY", { minimumFractionDigits: 2 })}</p>
                <TrendingDown className="w-4 h-4 text-rose-200 mt-1" />
              </div>
            </div>

            <div className={`rounded-2xl p-4 shadow-sm border bg-white ${(incomeInPeriod - expenseInPeriod) >= 0 ? "border-emerald-100" : "border-rose-100"}`}>
              <p className="text-xs text-slate-500">Untung / Rugi ({periodRange.label})</p>
              <p className={`text-2xl font-bold mt-1 ${(incomeInPeriod - expenseInPeriod) >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                {(incomeInPeriod - expenseInPeriod) >= 0 ? "+" : "-"}RM {Math.abs(incomeInPeriod - expenseInPeriod).toLocaleString("ms-MY", { minimumFractionDigits: 2 })}
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

            {/* Section 2 — Financial Health Summary (compact card; full detail
                and quick actions only render below when expanded) */}
            <FinancialHealthSummary health={financialHealth} onExpand={() => setShowHealthDetail(v => !v)} />

            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setDashboardTypeFilter(f => f === "INCOME" ? "ALL" : "INCOME")}
                className={`flex items-center justify-center space-x-2 rounded-2xl px-4 py-3 transition cursor-pointer border ${dashboardTypeFilter === "INCOME" ? "bg-emerald-600 border-emerald-600 text-white shadow" : "bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-100"}`}>
                <TrendingUp className={`w-4 h-4 ${dashboardTypeFilter === "INCOME" ? "text-white" : "text-emerald-600"}`} /><span className="text-xs font-bold">Rekod Pendapatan</span>
              </button>
              <button onClick={() => setDashboardTypeFilter(f => f === "EXPENSE" ? "ALL" : "EXPENSE")}
                className={`flex items-center justify-center space-x-2 rounded-2xl px-4 py-3 transition cursor-pointer border ${dashboardTypeFilter === "EXPENSE" ? "bg-rose-600 border-rose-600 text-white shadow" : "bg-rose-50 border-rose-100 text-rose-600 hover:bg-rose-100"}`}>
                <TrendingDown className={`w-4 h-4 ${dashboardTypeFilter === "EXPENSE" ? "text-white" : "text-rose-500"}`} /><span className="text-xs font-bold">Rekod Perbelanjaan</span>
              </button>
            </div>

            {/* Section 4 — Recent Transactions (moved higher; minimal scrolling) */}
            {myEvents.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    {dashboardTypeFilter === "INCOME" ? "Senarai Pendapatan" : dashboardTypeFilter === "EXPENSE" ? "Senarai Perbelanjaan" : "Transaksi Terkini"}
                  </p>
                  {(txnFilterFrom || txnFilterTo || dashboardTypeFilter !== "ALL" || txnSearch || txnFilterBusiness !== "ALL" || txnFilterCategory !== "ALL" || txnFilterSource !== "ALL" || healthFilterRecordIds) && (
                    <button onClick={() => { setTxnFilterFrom(""); setTxnFilterTo(""); setDashboardTypeFilter("ALL"); setTxnSearch(""); setTxnFilterBusiness("ALL"); setTxnFilterCategory("ALL"); setTxnFilterSource("ALL"); setHealthFilterRecordIds(null); setHealthFilterLabel(""); }} className="text-[10px] text-indigo-500 font-semibold cursor-pointer hover:underline">
                      Kosongkan tapisan
                    </button>
                  )}
                </div>
                <input type="text" value={txnSearch} onChange={e => setTxnSearch(e.target.value)}
                  placeholder="Cari deskripsi, pihak, nombor rujukan, kategori..."
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] text-slate-600" />
                <div className="flex items-center gap-2">
                  <input type="date" value={txnFilterFrom} onChange={e => setTxnFilterFrom(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] text-slate-600" />
                  <span className="text-[10px] text-slate-400">hingga</span>
                  <input type="date" value={txnFilterTo} onChange={e => setTxnFilterTo(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] text-slate-600" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <select value={txnFilterBusiness} onChange={e => setTxnFilterBusiness(e.target.value)}
                    className="px-2 py-1.5 rounded-lg border border-slate-200 text-[10px] text-slate-600">
                    <option value="ALL">Semua Perniagaan</option>
                    {businesses.map(b => <option key={b.id} value={b.id}>{b.businessName}</option>)}
                  </select>
                  <select value={txnFilterCategory} onChange={e => setTxnFilterCategory(e.target.value)}
                    className="px-2 py-1.5 rounded-lg border border-slate-200 text-[10px] text-slate-600">
                    <option value="ALL">Semua Kategori</option>
                    {txnCategoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={txnFilterSource} onChange={e => setTxnFilterSource(e.target.value as typeof txnFilterSource)}
                    className="px-2 py-1.5 rounded-lg border border-slate-200 text-[10px] text-slate-600">
                    <option value="ALL">Semua Sumber</option>
                    <option value="AI_CHAT">Chat AI</option>
                    <option value="RECEIPT_OCR">Resit (OCR)</option>
                    <option value="INVOICE_OCR">Invois (OCR)</option>
                    <option value="BANK_STATEMENT">Penyata Bank</option>
                    <option value="MANUAL">Manual</option>
                  </select>
                </div>
                {filteredEvents.length === 0 && (
                  <p className="text-[11px] text-slate-400 text-center py-3">Tiada transaksi dalam tempoh ini.</p>
                )}
                {pagedEvents.map(ev => (
                  <div key={ev.id} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                    {editingTxnId === ev.id ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span className={`px-1.5 py-0.5 rounded font-bold ${ev.type === "INCOME" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"}`}>
                            {ev.type === "INCOME" ? "Pendapatan" : "Perbelanjaan"}
                          </span>
                          {ev.createdByName && <span>Direkod oleh: {ev.createdByName}</span>}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap text-[10px] text-slate-400">
                          <span className={`px-1 py-0.5 rounded font-semibold ${txnSourceBadgeClass(getTxnSource(ev))}`}>{txnSourceLabel(getTxnSource(ev))}</span>
                          <span>Ref: {ev.referenceNumber}</span>
                          {ev.businessId && <span>🏢 {getBusinessBranchLabel(ev)}</span>}
                          {ev.description && <span className="italic truncate max-w-[160px]">📝 {ev.description}</span>}
                        </div>
                        <input value={editTxnDraft.partyName} onChange={e => setEditTxnDraft(d => ({ ...d, partyName: e.target.value }))} placeholder="Pihak Berkaitan" className="w-full px-2 py-1 rounded border border-slate-300 text-xs" />
                        <input value={editTxnDraft.categoryName} onChange={e => setEditTxnDraft(d => ({ ...d, categoryName: e.target.value }))} placeholder="Kategori" className="w-full px-2 py-1 rounded border border-slate-300 text-xs" />
                        <input value={editTxnDraft.amountMyr} onChange={e => setEditTxnDraft(d => ({ ...d, amountMyr: e.target.value }))} type="number" placeholder="Jumlah (RM)" className="w-full px-2 py-1 rounded border border-slate-300 text-xs" />
                        <input value={editTxnDraft.date} onChange={e => setEditTxnDraft(d => ({ ...d, date: e.target.value }))} type="date" className="w-full px-2 py-1 rounded border border-slate-300 text-xs" />

                        {/* Business + Branch Mapping -- manual override/resolution when
                            auto-mapping left this unset (low confidence or multiple
                            branches matched), or to correct a wrong auto-map. */}
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

                        {/* Lampiran resit */}
                        <div className="pt-1">
                          {uploadError && (
                            <div className="bg-red-50 border border-red-200 rounded-lg px-2 py-1.5 mb-1 flex items-center justify-between">
                              <p className="text-[11px] text-red-600 font-semibold">{uploadError}</p>
                              <button onClick={() => setUploadError(null)} className="text-red-400 hover:text-red-600 cursor-pointer shrink-0 ml-1">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                          <input ref={txnReceiptInputRef} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) attachTxnReceipt(ev, f); e.target.value = ""; }} />
                          {(evidenceByRecordId[ev.id] || []).map(pkg => (
                            <button key={pkg.id} type="button" onClick={() => previewTxnEvidence(pkg)}
                              className="w-full flex items-center gap-2 px-2 py-1.5 mb-1 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 text-[11px] font-semibold cursor-pointer hover:bg-emerald-100">
                              <Receipt className="w-3 h-3 shrink-0" /> <span className="truncate">{pkg.fileName}</span> <span className="ml-auto text-[10px] text-emerald-500">Lihat</span>
                            </button>
                          ))}
                          <button type="button" onClick={() => txnReceiptInputRef.current?.click()} disabled={uploadingTxnReceipt}
                            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded border border-dashed border-slate-300 text-[11px] font-semibold text-slate-500 hover:border-indigo-400 hover:text-indigo-600 cursor-pointer disabled:opacity-50">
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
                        <div className="flex items-center space-x-3 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${ev.type === "INCOME" ? "bg-emerald-50" : "bg-rose-50"}`}>
                            {ev.type === "INCOME" ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> : <TrendingDown className="w-3.5 h-3.5 text-rose-500" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate max-w-[160px]">{getFriendlyTransactionLabel(ev, businesses).label}</p>
                            <p className="text-[10px] text-slate-400 truncate max-w-[180px]">{ev.partyName || ev.categoryName} - {ev.referenceNumber}</p>
                            <p className="text-[10px] text-slate-400">
                              {ev.date}{ev.createdAt ? ` ${new Date(ev.createdAt).toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit" })}` : ""}
                              {ev.createdByName ? ` - ${ev.createdByName}` : ""}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className={`text-[9px] px-1 py-0.5 rounded font-semibold ${txnSourceBadgeClass(getTxnSource(ev))}`}>{txnSourceLabel(getTxnSource(ev))}</span>
                              {findTxnConfidence(ev) !== null && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-indigo-50 text-indigo-500 font-semibold">Confiden {findTxnConfidence(ev)}%</span>
                              )}
                              {(evidenceByRecordId[ev.id] || []).length > 0 && (
                                <button type="button" onClick={() => previewTxnEvidence(evidenceByRecordId[ev.id][0])}
                                  className="text-[9px] px-1 py-0.5 rounded bg-emerald-50 text-emerald-600 font-semibold cursor-pointer hover:bg-emerald-100 flex items-center gap-0.5">
                                  <Receipt className="w-2.5 h-2.5" /> Resit
                                </button>
                              )}
                              {ev.businessId && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                                  🏢 {getBusinessBranchLabel(ev)}
                                </span>
                              )}
                              {getHealthFlags(ev).map(f => (
                                <span key={f} className={`text-[9px] px-1 py-0.5 rounded font-semibold ${healthFlagBadgeClass(f)}`}>{healthFlagLabel(f)}</span>
                              ))}
                            </div>
                            {ev.description && (
                              <p className="text-[10px] text-slate-400 italic truncate max-w-[220px] mt-0.5">📝 {ev.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-sm font-bold ${ev.type === "INCOME" ? "text-emerald-600" : "text-rose-500"}`}>
                            {ev.type === "INCOME" ? "+" : "-"}RM {ev.amountMyr.toFixed(2)}
                          </span>
                          <button onClick={() => startEditTxn(ev)} className="p-1 text-slate-300 hover:text-indigo-500 cursor-pointer" aria-label="Edit transaksi">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {filteredEvents.length > 0 && (
                  <div className="flex items-center justify-between pt-2">
                    <select value={txnPageSize} onChange={e => setTxnPageSize(Number(e.target.value) as typeof txnPageSize)}
                      className="px-2 py-1 rounded-lg border border-slate-200 text-[10px] text-slate-600">
                      <option value={50}>50 / muka</option>
                      <option value={100}>100 / muka</option>
                      <option value={250}>250 / muka</option>
                      <option value={500}>500 / muka</option>
                    </select>
                    <div className="flex items-center gap-2">
                      <button disabled={txnPage === 0} onClick={() => setTxnPage(p => Math.max(0, p - 1))}
                        className="px-2 py-1 rounded-lg border border-slate-200 text-[10px] font-semibold text-slate-500 disabled:opacity-40 cursor-pointer">
                        Sebelum
                      </button>
                      <span className="text-[10px] text-slate-400">Muka {txnPage + 1} / {txnTotalPages}</span>
                      <button disabled={txnPage >= txnTotalPages - 1} onClick={() => setTxnPage(p => Math.min(txnTotalPages - 1, p + 1))}
                        className="px-2 py-1 rounded-lg border border-slate-200 text-[10px] font-semibold text-slate-500 disabled:opacity-40 cursor-pointer">
                        Seterus
                      </button>
                    </div>
                  </div>
                )}
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

            {/* Section 5 — Financial Health Detail: full 6-bucket / 4-score
                command center, only rendered when expanded from the summary
                card above. Reuses the existing engine/handlers/filters as-is. */}
            {showHealthDetail && (
              <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-sm" id="financial_health_detail_section">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Butiran Kesihatan Kewangan</h3>
                  <button onClick={() => setShowHealthDetail(false)} className="text-[10px] text-indigo-500 font-semibold cursor-pointer hover:underline">
                    Tutup
                  </button>
                </div>
                <QuickActionsRow
                  onReview={() => handleHealthBucketSelect("pendingConfirmation")}
                  onDuplicate={() => setShowDuplicateQueue(true)}
                  onEvidence={() => handleHealthBucketSelect("missingEvidence")}
                  onImport={() => setShowImportRecovery(true)}
                />
                <div className="mt-3">
                  <FinancialHealthCenter
                    health={financialHealth}
                    onSelectBucket={handleHealthBucketSelect}
                    onOpenDuplicateQueue={() => setShowDuplicateQueue(true)}
                    onOpenImportRecovery={() => setShowImportRecovery(true)}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ DOCUMENTS ═══ */}
        {activeTab === "documents" && (
          <DocumentsManager
            workspaceId={wsId}
            workspaceName={activeWorkspace?.name || ""}
            tenantId={activeTenant?.id}
            currentUserId={user?.id}
            currentUserEmail={user?.email}
            currentUserRole="TENANT_OWNER"
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
            onBuyAddon={() => setShowAddonModal(true)}
            docs={docs}
            onDocsChange={setDocs}
          />
        )}

        {/* â•â•â•â• REPORTS â•â•â•â• */}
        {activeTab === "reports" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-2xl mx-auto w-full pb-20" id="owner_reports_pane">
            <h2 className="text-lg font-bold text-slate-900">Laporan</h2>
            <FinancialReportsAnalytics
              onNavigateToRecords={(recordIds, label) => {
                setHealthFilterRecordIds(recordIds);
                setHealthFilterLabel(label);
                setActiveTab("dashboard");
              }}
              health={financialHealth}
              onAddBankAccount={() => setShowAddBankAccountModal(true)}
            />
          </div>
        )}

        {/* Phase 2D.3A — Tambah Akaun Bank modal, reachable from Report
            Center's "Tunai Semasa" empty state ([Tambah Akaun Bank] button). */}
        {showAddBankAccountModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" id="add_bank_account_modal_overlay">
            <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-3" id="add_bank_account_modal">
              <h3 className="text-sm font-bold text-slate-900">Tambah Akaun Bank</h3>
              <form onSubmit={handleAddBankAccountSubmit} className="space-y-2.5">
                <input
                  type="text" required placeholder="Nama Bank (cth: Maybank)"
                  value={newBankName} onChange={(e) => setNewBankName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none"
                />
                <input
                  type="text" required placeholder="No. Akaun"
                  value={newBankNumber} onChange={(e) => setNewBankNumber(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none"
                />
                <input
                  type="text" required placeholder="Nama Pemilik Akaun"
                  value={newBankHolder} onChange={(e) => setNewBankHolder(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none"
                />
                <input
                  type="number" step="0.01" required placeholder="Baki Semasa (RM)"
                  value={newBankBalance} onChange={(e) => setNewBankBalance(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none"
                />
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={() => setShowAddBankAccountModal(false)} className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Batal</button>
                  <button type="submit" className="px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg">Simpan</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* â•â•â•â• MORE â•â•â•â• */}
        {activeTab === "more" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-2xl mx-auto w-full pb-20" id="owner_more_pane">

            {morePage === "menu" && (
              <>
                <h2 className="text-lg font-bold text-slate-900">Lagi</h2>
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm divide-y divide-slate-100">
                  {([
                    { id: "myProfile" as MorePage, label: "Profil Saya & Kewangan AI", desc: user?.email || "Akaun, perniagaan & kenderaan", icon: User },
                    { id: "team" as MorePage,      label: "Pasukan",           desc: "Tambah, edit & urus kakitangan",        icon: Users },
                    { id: "billing" as MorePage,   label: "Bil & Langganan",   desc: "Plan, kredit AI & storan",              icon: CreditCard },
                    { id: "settings" as MorePage,  label: "Tetapan",           desc: "Konfigurasi & peringatan",              icon: Settings },
                    { id: "resources" as MorePage, label: "Tetapan Sumber",    desc: "AI & storan yang digunakan",            icon: Cpu },
                    { id: "chatArchive" as MorePage, label: "Arkib Perbualan", desc: "Sejarah perbualan dengan MYKERANI ikut tarikh", icon: MessageCircle },
                    { id: "history" as MorePage,   label: "Sejarah Aktiviti",  desc: "Log semua transaksi & aktiviti",        icon: History },
                    { id: "activity" as MorePage,  label: "Pusat Aktiviti",    desc: "Pantau aktiviti staf", icon: Bell },
                    { id: "support" as MorePage,   label: "Pusat Sokongan",    desc: "Bantuan, FAQ & tiket sokongan",         icon: HelpCircle },
                    { id: "account360" as MorePage, label: "Akaun Saya 360",  desc: "Skor kesihatan, status langganan & akaun", icon: Star },
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
                  {(() => {
                    const otherMembers = userRoles
                      .filter(r => r.email !== user?.email)
                      .filter(r => !revokedMemberIds[r.id]);
                    if (otherMembers.length === 0) {
                      return (
                        <div className="text-center py-4">
                          <Users className="w-7 h-7 text-slate-200 mx-auto mb-1" />
                          <p className="text-xs text-slate-400">Belum ada kakitangan lagi</p>
                        </div>
                      );
                    }
                    return otherMembers.map(member => {
                      const effectiveRole = memberRoleOverrides[member.id] || member.role;
                      return (
                        <div key={member.id} className="flex items-center justify-between space-x-3 p-3 bg-slate-50 rounded-xl" id={`team_member_${member.id}`}>
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-xl bg-slate-400 text-white flex items-center justify-center font-bold">
                              {(member.fullName || member.email).charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 text-sm">{member.fullName}</p>
                              <p className="text-xs text-slate-500">{member.email}</p>
                              <span className="text-[10px] bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded-full">
                                {effectiveRole === "TENANT_OWNER" ? "Pemilik" : effectiveRole}
                              </span>
                            </div>
                          </div>
                          {effectiveRole !== "TENANT_OWNER" && (
                            <div className="flex flex-col items-end space-y-1">
                              <select
                                value={effectiveRole}
                                disabled={roleChangeLoadingId === member.id}
                                onChange={e => handleChangeMemberRole(member, e.target.value)}
                                title="Tukar peranan kakitangan (direkod dalam role_change_audit_log)"
                                className="text-[10px] border border-slate-200 rounded-lg px-1.5 py-1 bg-white cursor-pointer"
                              >
                                <option value="TENANT_ADMIN">TENANT_ADMIN</option>
                                <option value="MANAGER">MANAGER</option>
                                <option value="STAFF">STAFF</option>
                                <option value="VIEWER">VIEWER</option>
                              </select>
                              <button
                                onClick={() => handleRevokeMember(member)}
                                disabled={roleChangeLoadingId === member.id}
                                title="Tarik balik akses (direkod dalam role_change_audit_log)"
                                className="text-[10px] font-bold text-rose-600 hover:text-rose-700 cursor-pointer disabled:opacity-50"
                              >
                                Buang
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900">Hantar Rayuan ke HQ</h3>
                    <button onClick={() => { setShowAppeal(v => !v); setAppealResult(null); }}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer">
                      {showAppeal ? "Tutup" : "Buka"}
                    </button>
                  </div>
                  <p className="text-xs text-slate-400">Jika akaun anda digantung atau dibekukan dan anda rasa ini silap, hantar rayuan di sini untuk semakan HQ.</p>
                  {showAppeal && (
                    <div className="space-y-2">
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
              </div>
            )}

            {/* History */}
            {morePage === "history" && (
              <div className="space-y-3">
                <h2 className="text-lg font-bold text-slate-900">Sejarah Aktiviti</h2>

                <div className="bg-white border border-slate-200 rounded-2xl p-3 space-y-2 shadow-sm">
                  <input
                    type="text"
                    value={historySearch}
                    onChange={e => setHistorySearch(e.target.value)}
                    placeholder="Cari penerangan, pihak, rujukan atau kategori..."
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={historyFilterFrom}
                      onChange={e => setHistoryFilterFrom(e.target.value)}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5"
                    />
                    <input
                      type="date"
                      value={historyFilterTo}
                      onChange={e => setHistoryFilterTo(e.target.value)}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={historyFilterSource}
                      onChange={e => setHistoryFilterSource(e.target.value as typeof historyFilterSource)}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5"
                    >
                      <option value="ALL">Semua Sumber</option>
                      <option value="AI_CHAT">{txnSourceLabel("AI_CHAT")}</option>
                      <option value="RECEIPT_OCR">{txnSourceLabel("RECEIPT_OCR")}</option>
                      <option value="INVOICE_OCR">{txnSourceLabel("INVOICE_OCR")}</option>
                      <option value="BANK_STATEMENT">{txnSourceLabel("BANK_STATEMENT")}</option>
                      <option value="MANUAL">{txnSourceLabel("MANUAL")}</option>
                    </select>
                    <select
                      value={historyFilterBusiness}
                      onChange={e => setHistoryFilterBusiness(e.target.value)}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5"
                    >
                      <option value="ALL">Semua Bisnes</option>
                      {businesses.map(b => (
                        <option key={b.id} value={b.id}>{b.businessName}</option>
                      ))}
                    </select>
                    <select
                      value={historyFilterType}
                      onChange={e => setHistoryFilterType(e.target.value as typeof historyFilterType)}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5"
                    >
                      <option value="ALL">Semua Jenis</option>
                      <option value="INCOME">Pendapatan</option>
                      <option value="EXPENSE">Perbelanjaan</option>
                      <option value="RECEIVABLE">Belum Terima</option>
                      <option value="PAYABLE">Belum Bayar</option>
                    </select>
                    <select
                      value={historyFilterCategory}
                      onChange={e => setHistoryFilterCategory(e.target.value)}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5"
                    >
                      <option value="ALL">Semua Kategori</option>
                      {txnCategoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <label className="text-[11px] text-slate-400">Papar setiap halaman:</label>
                    <select
                      value={historyPageSize}
                      onChange={e => setHistoryPageSize(Number(e.target.value))}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1"
                    >
                      {[100, 500, 1000, 5000, 10000].map(size => (
                        <option key={size} value={size}>{size.toLocaleString("ms-MY")}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {historyFilteredEvents.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center shadow-sm">
                    <History className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">Tiada aktiviti dijumpai</p>
                  </div>
                ) : (
                  <>
                    {pagedHistoryEvents.map(ev => (
                      <div key={ev.id} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between shadow-sm gap-2">
                        <div className="flex items-center space-x-3 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${ev.type === "INCOME" ? "bg-emerald-50" : "bg-rose-50"}`}>
                            {ev.type === "INCOME" ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> : <TrendingDown className="w-3.5 h-3.5 text-rose-500" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate">{getFriendlyTransactionLabel(ev, businesses).label}</p>
                            <p className="text-[10px] text-slate-400 truncate">{ev.partyName || ev.categoryName} &middot; {ev.date} &middot; Ref: {ev.referenceNumber}</p>
                            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                              <span className={`text-[9px] px-1 py-0.5 rounded font-semibold ${txnSourceBadgeClass(getTxnSource(ev))}`}>{txnSourceLabel(getTxnSource(ev))}</span>
                              {findTxnConfidence(ev) !== null && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-indigo-50 text-indigo-500 font-semibold">Confiden {findTxnConfidence(ev)}%</span>
                              )}
                              {(evidenceByRecordId[ev.id] || []).length > 0 && (
                                <button type="button" onClick={() => previewTxnEvidence(evidenceByRecordId[ev.id][0])}
                                  className="text-[9px] px-1 py-0.5 rounded bg-emerald-50 text-emerald-600 font-semibold cursor-pointer hover:bg-emerald-100 flex items-center gap-0.5">
                                  <Receipt className="w-2.5 h-2.5" /> Resit
                                </button>
                              )}
                              {ev.businessId && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                                  🏢 {getBusinessBranchLabel(ev)}
                                </span>
                              )}
                              {getHealthFlags(ev).map(f => (
                                <span key={f} className={`text-[9px] px-1 py-0.5 rounded font-semibold ${healthFlagBadgeClass(f)}`}>{healthFlagLabel(f)}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-sm font-bold ${ev.type === "INCOME" ? "text-emerald-600" : "text-rose-500"}`}>
                            {ev.type === "INCOME" ? "+" : "-"}RM {ev.amountMyr.toFixed(2)}
                          </span>
                          <button onClick={() => startEditTxn(ev)} className="p-1 text-slate-300 hover:text-indigo-500 cursor-pointer" aria-label="Edit transaksi">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-1">
                      <button
                        type="button"
                        disabled={historyPage === 0}
                        onClick={() => setHistoryPage(p => Math.max(0, p - 1))}
                        className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Sebelum
                      </button>
                      <span className="text-[11px] text-slate-400">
                        Halaman {historyPage + 1} / {historyTotalPages}
                      </span>
                      <button
                        type="button"
                        disabled={historyPage >= historyTotalPages - 1}
                        onClick={() => setHistoryPage(p => Math.min(historyTotalPages - 1, p + 1))}
                        className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Seterus
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {morePage === "myProfile" && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-slate-900">Profil Saya & Kewangan AI</h2>

                <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
                  <div className="flex items-center space-x-4">
                    <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-2xl font-bold shadow shrink-0">
                      {firstName.charAt(0).toUpperCase()}
                    </div>
                    {!editingAccount ? (
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 truncate">{user?.fullName}</p>
                        <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                        <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full mt-1 inline-block">Pemilik Syarikat</span>
                      </div>
                    ) : (
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <input value={accountDraft.fullName} onChange={e => setAccountDraft(d => ({ ...d, fullName: e.target.value }))} placeholder="Nama penuh" className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm" />
                        <input value={accountDraft.email} onChange={e => setAccountDraft(d => ({ ...d, email: e.target.value }))} placeholder="Email" type="email" className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm" />
                        <input value={accountDraft.mobileNumber} onChange={e => setAccountDraft(d => ({ ...d, mobileNumber: e.target.value }))} placeholder="No. Telefon" className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm" />
                        <input value={accountDraft.alternateNumber} onChange={e => setAccountDraft(d => ({ ...d, alternateNumber: e.target.value }))} placeholder="No. Telefon Alternatif" className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm" />
                      </div>
                    )}
                  </div>

                  {accountMsg && (
                    <p className={`text-xs ${accountMsg.startsWith("Profil") || accountMsg.startsWith("Nama") ? "text-emerald-600" : "text-rose-500"}`}>{accountMsg}</p>
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

                  <button onClick={() => signOut()} className="w-full py-3 border border-rose-200 text-rose-500 rounded-xl text-sm font-semibold hover:bg-rose-50 transition cursor-pointer">
                    Log Keluar
                  </button>
                </div>

                <p className="text-xs text-slate-500">Maklumat di bawah adalah <span className="font-semibold">pilihan (optional)</span> — boleh dilangkau atau dikemas kini bila-bila masa. Lebih lengkap maklumat, lebih pintar MYKERANI AI membantu anda.</p>

                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-800">Profil Peribadi</h3>
                  <input value={personalProfile.fullName} onChange={e => setPersonalProfile(p => ({ ...p, fullName: e.target.value }))} placeholder="Nama penuh" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" value={personalProfile.dateOfBirth} onChange={e => setPersonalProfile(p => ({ ...p, dateOfBirth: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                    <input value={personalProfile.maritalStatus} onChange={e => setPersonalProfile(p => ({ ...p, maritalStatus: e.target.value }))} placeholder="Status perkahwinan" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                  </div>
                  <input value={personalProfile.occupation} onChange={e => setPersonalProfile(p => ({ ...p, occupation: e.target.value }))} placeholder="Pekerjaan" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" value={personalProfile.monthlyIncomeMyr} onChange={e => setPersonalProfile(p => ({ ...p, monthlyIncomeMyr: e.target.value }))} placeholder="Pendapatan bulanan (RM)" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                    <input type="number" value={personalProfile.dependentsCount} onChange={e => setPersonalProfile(p => ({ ...p, dependentsCount: e.target.value }))} placeholder="Bilangan tanggungan" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                  </div>
                  <textarea value={personalProfile.notes} onChange={e => setPersonalProfile(p => ({ ...p, notes: e.target.value }))} placeholder="Nota tambahan (contoh: ada perniagaan sampingan, dll)" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" rows={2} />
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-800">Profil Perniagaan</h3>
                    {!addingBusiness && (
                      <button onClick={() => setAddingBusiness(true)} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 cursor-pointer">+ Tambah Bisnes</button>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">Tambah setiap bisnes yang anda uruskan. Setiap bisnes boleh ada beberapa cawangan.</p>

                  {businesses.length === 0 && !addingBusiness && (
                    <p className="text-xs text-slate-400 italic">Belum ada bisnes ditambah.</p>
                  )}

                  {businesses.map(b => (
                    <div key={b.id} className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-2">
                      {editingBusinessId === b.id ? (
                        <div className="space-y-2">
                          <input value={editBusinessForm.businessName} onChange={e => setEditBusinessForm(f => ({ ...f, businessName: e.target.value }))} placeholder="Nama bisnes" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                          <input value={editBusinessForm.industry} onChange={e => setEditBusinessForm(f => ({ ...f, industry: e.target.value }))} placeholder="Industri (contoh: F&B, Percetakan)" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                          <div className="grid grid-cols-2 gap-2">
                            <input value={editBusinessForm.businessType} onChange={e => setEditBusinessForm(f => ({ ...f, businessType: e.target.value }))} placeholder="Jenis perniagaan (Sdn Bhd, Enterprise...)" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                            <input value={editBusinessForm.registrationNo} onChange={e => setEditBusinessForm(f => ({ ...f, registrationNo: e.target.value }))} placeholder="No. pendaftaran" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                          </div>
                          <textarea value={editBusinessForm.notes} onChange={e => setEditBusinessForm(f => ({ ...f, notes: e.target.value }))} placeholder="Nota tambahan" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" rows={2} />
                          <div className="flex space-x-2">
                            <button onClick={submitEditBusiness} className="flex-1 px-3 py-2 bg-slate-900 text-white rounded-xl text-sm font-semibold cursor-pointer">Simpan</button>
                            <button onClick={() => { setEditingBusinessId(null); setEditBusinessForm(EMPTY_BUSINESS_FORM); }} className="flex-1 px-3 py-2 bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold cursor-pointer">Batal</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-sm font-semibold text-slate-800">{b.businessName}</p>
                              <p className="text-xs text-slate-500">
                                {[b.industry, b.businessType].filter(Boolean).join(" · ")}
                                {b.registrationNo && <span className="text-slate-400"> · {b.registrationNo}</span>}
                              </p>
                            </div>
                            <div className="flex items-center space-x-2">
                              <button onClick={() => startEditBusiness(b)} className="text-slate-400 hover:text-indigo-600 cursor-pointer"><Edit3 className="w-4 h-4" /></button>
                              <button onClick={() => setConfirmDeleteBusinessId(b.id)} className="text-rose-400 hover:text-rose-600 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                            </div>
                          </div>

                          {confirmDeleteBusinessId === b.id && (
                            <div className="bg-rose-50 border border-rose-200 rounded-xl p-2 flex items-center justify-between">
                              <span className="text-xs text-rose-700">Padam "{b.businessName}"?</span>
                              <div className="flex space-x-2">
                                <button onClick={() => removeBusiness(b.id)} className="px-2 py-1 bg-rose-600 text-white rounded-lg text-xs font-semibold cursor-pointer">Padam</button>
                                <button onClick={() => setConfirmDeleteBusinessId(null)} className="px-2 py-1 bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer">Batal</button>
                              </div>
                            </div>
                          )}

                          <button onClick={() => toggleBusinessBranches(b.id)} className="text-xs font-semibold text-slate-500 hover:text-slate-700 cursor-pointer">
                            {expandedBusinessId === b.id ? "▼" : "▶"} Cawangan {businessBranches[b.id] ? `(${businessBranches[b.id].length})` : ""}
                          </button>

                          {expandedBusinessId === b.id && (
                            <div className="ml-3 pl-3 border-l border-slate-200 space-y-2">
                              {(businessBranches[b.id] || []).map(br => (
                                <div key={br.id} className="flex items-center justify-between bg-white border border-slate-100 rounded-lg px-2 py-1.5">
                                  <div>
                                    <p className="text-xs font-semibold text-slate-700">{br.branchName}</p>
                                    {br.location && <p className="text-[10px] text-slate-400">{br.location}</p>}
                                  </div>
                                  <button onClick={() => removeBranch(b.id, br.id)} className="text-rose-400 hover:text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                              ))}
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  value={newBranchByBusiness[b.id]?.branchName || ""}
                                  onChange={e => setNewBranchByBusiness(prev => ({ ...prev, [b.id]: { branchName: e.target.value, location: prev[b.id]?.location || "" } }))}
                                  placeholder="Nama cawangan"
                                  className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs"
                                />
                                <input
                                  value={newBranchByBusiness[b.id]?.location || ""}
                                  onChange={e => setNewBranchByBusiness(prev => ({ ...prev, [b.id]: { branchName: prev[b.id]?.branchName || "", location: e.target.value } }))}
                                  placeholder="Lokasi"
                                  className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs"
                                />
                              </div>
                              <button onClick={() => submitNewBranch(b.id)} className="px-2 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold cursor-pointer">+ Tambah Cawangan</button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}

                  {addingBusiness && (
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-2">
                      <input value={newBusiness.businessName} onChange={e => setNewBusiness(f => ({ ...f, businessName: e.target.value }))} placeholder="Nama bisnes (wajib)" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                      <input value={newBusiness.industry} onChange={e => setNewBusiness(f => ({ ...f, industry: e.target.value }))} placeholder="Industri (contoh: F&B, Percetakan)" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                      <div className="grid grid-cols-2 gap-2">
                        <input value={newBusiness.businessType} onChange={e => setNewBusiness(f => ({ ...f, businessType: e.target.value }))} placeholder="Jenis perniagaan (Sdn Bhd, Enterprise...)" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                        <input value={newBusiness.registrationNo} onChange={e => setNewBusiness(f => ({ ...f, registrationNo: e.target.value }))} placeholder="No. pendaftaran" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                      </div>
                      <textarea value={newBusiness.notes} onChange={e => setNewBusiness(f => ({ ...f, notes: e.target.value }))} placeholder="Nota tambahan" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" rows={2} />
                      <div className="flex space-x-2">
                        <button onClick={submitNewBusiness} className="flex-1 px-3 py-2 bg-slate-900 text-white rounded-xl text-sm font-semibold cursor-pointer">Tambah</button>
                        <button onClick={() => { setAddingBusiness(false); setNewBusiness(EMPTY_BUSINESS_FORM); }} className="flex-1 px-3 py-2 bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold cursor-pointer">Batal</button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-800">Maklumat Syarikat (Akaun)</h3>
                  <p className="text-xs text-slate-500">Maklumat ini dipaparkan kepada HQ MyKerani untuk pengurusan bil &amp; sokongan akaun anda.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={companyMasterForm.registrationNo} onChange={e => setCompanyMasterForm(f => ({ ...f, registrationNo: e.target.value }))} placeholder="No. Pendaftaran (SSM)" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                    <input value={companyMasterForm.taxNumber} onChange={e => setCompanyMasterForm(f => ({ ...f, taxNumber: e.target.value }))} placeholder="No. Cukai" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                  </div>
                  <input value={companyMasterForm.industry} onChange={e => setCompanyMasterForm(f => ({ ...f, industry: e.target.value }))} placeholder="Industri Utama" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                  <textarea value={companyMasterForm.address} onChange={e => setCompanyMasterForm(f => ({ ...f, address: e.target.value }))} placeholder="Alamat Syarikat" rows={2} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={companyMasterForm.billingContactName} onChange={e => setCompanyMasterForm(f => ({ ...f, billingContactName: e.target.value }))} placeholder="Nama Kontak Bil" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                    <input type="email" value={companyMasterForm.billingEmail} onChange={e => setCompanyMasterForm(f => ({ ...f, billingEmail: e.target.value }))} placeholder="E-mel Bil" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                    <input value={companyMasterForm.supportContactName} onChange={e => setCompanyMasterForm(f => ({ ...f, supportContactName: e.target.value }))} placeholder="Nama Kontak Sokongan" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                    <input type="email" value={companyMasterForm.supportEmail} onChange={e => setCompanyMasterForm(f => ({ ...f, supportEmail: e.target.value }))} placeholder="E-mel Sokongan" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                  </div>
                  <button onClick={saveCompanyMaster} disabled={companyMasterSaving} className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold disabled:opacity-50 cursor-pointer">
                    {companyMasterSaving ? "Menyimpan..." : "Simpan Maklumat Syarikat"}
                  </button>
                  {companyMasterMsg && <p className="text-xs text-emerald-600">{companyMasterMsg}</p>}
                </div>

                <button onClick={saveProfiles} disabled={profileSaving} className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50 cursor-pointer">
                  {profileSaving ? "Menyimpan..." : "Simpan Profil"}
                </button>
                {profileSavedAt && <p className="text-center text-xs text-emerald-600">Profil disimpan ✓</p>}

                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-800">Kenderaan</h3>
                  <p className="text-xs text-slate-500">Tambah kenderaan supaya AI boleh tanya "Hilux atau Myvi?" bila anda rekod belian minyak/tol/servis.</p>
                  {vehicles.map(v => (
                    <div key={v.id} className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 space-y-2">
                      {editingVehicleId === v.id ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <input value={editVehicleForm.name} onChange={e => setEditVehicleForm(f => ({ ...f, name: e.target.value }))} placeholder="Nama (contoh: Hilux)" className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                            <input value={editVehicleForm.plateNumber} onChange={e => setEditVehicleForm(f => ({ ...f, plateNumber: e.target.value }))} placeholder="No. plat" className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <select value={editVehicleForm.ownership} onChange={e => setEditVehicleForm(f => ({ ...f, ownership: e.target.value as "PERSONAL" | "BUSINESS" }))} className="px-3 py-2 border border-slate-200 rounded-xl text-sm">
                              <option value="BUSINESS">Perniagaan</option>
                              <option value="PERSONAL">Peribadi</option>
                            </select>
                            <input value={editVehicleForm.vehicleType} onChange={e => setEditVehicleForm(f => ({ ...f, vehicleType: e.target.value }))} placeholder="Jenis kenderaan" className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                          </div>
                          <div className="flex space-x-2">
                            <button onClick={submitEditVehicle} className="flex-1 px-3 py-2 bg-slate-900 text-white rounded-xl text-sm font-semibold cursor-pointer">Simpan</button>
                            <button onClick={() => setEditingVehicleId(null)} className="flex-1 px-3 py-2 bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold cursor-pointer">Batal</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{v.name} {v.plateNumber && <span className="text-slate-400 font-normal">· {v.plateNumber}</span>}</p>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${v.ownership === "BUSINESS" ? "bg-indigo-100 text-indigo-700" : "bg-amber-100 text-amber-700"}`}>{v.ownership === "BUSINESS" ? "Perniagaan" : "Peribadi"}</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button onClick={() => startEditVehicle(v)} className="text-slate-400 hover:text-indigo-600 cursor-pointer"><Edit3 className="w-4 h-4" /></button>
                            <button onClick={() => removeVehicle(v.id)} className="text-rose-400 hover:text-rose-600 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="grid grid-cols-2 gap-2">
                    <input value={newVehicle.name} onChange={e => setNewVehicle(v => ({ ...v, name: e.target.value }))} placeholder="Nama (contoh: Hilux)" className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                    <input value={newVehicle.plateNumber} onChange={e => setNewVehicle(v => ({ ...v, plateNumber: e.target.value }))} placeholder="No. plat" className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select value={newVehicle.ownership} onChange={e => setNewVehicle(v => ({ ...v, ownership: e.target.value as "PERSONAL" | "BUSINESS" }))} className="px-3 py-2 border border-slate-200 rounded-xl text-sm">
                      <option value="BUSINESS">Perniagaan</option>
                      <option value="PERSONAL">Peribadi</option>
                    </select>
                    <button onClick={submitNewVehicle} className="px-3 py-2 bg-slate-900 text-white rounded-xl text-sm font-semibold cursor-pointer">+ Tambah Kenderaan</button>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-800">Tanggungan</h3>
                  {dependents.map(d => (
                    <div key={d.id} className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 space-y-2">
                      {editingDependentId === d.id ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <input value={editDependentForm.name} onChange={e => setEditDependentForm(f => ({ ...f, name: e.target.value }))} placeholder="Nama" className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                            <input value={editDependentForm.relationship} onChange={e => setEditDependentForm(f => ({ ...f, relationship: e.target.value }))} placeholder="Hubungan (anak, ibu...)" className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                          </div>
                          <input type="date" value={editDependentForm.dateOfBirth} onChange={e => setEditDependentForm(f => ({ ...f, dateOfBirth: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                          <div className="flex space-x-2">
                            <button onClick={submitEditDependent} className="flex-1 px-3 py-2 bg-slate-900 text-white rounded-xl text-sm font-semibold cursor-pointer">Simpan</button>
                            <button onClick={() => setEditingDependentId(null)} className="flex-1 px-3 py-2 bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold cursor-pointer">Batal</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{d.name}</p>
                            <span className="text-xs text-slate-500">{d.relationship}</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button onClick={() => startEditDependent(d)} className="text-slate-400 hover:text-indigo-600 cursor-pointer"><Edit3 className="w-4 h-4" /></button>
                            <button onClick={() => removeDependent(d.id)} className="text-rose-400 hover:text-rose-600 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="grid grid-cols-2 gap-2">
                    <input value={newDependent.name} onChange={e => setNewDependent(d => ({ ...d, name: e.target.value }))} placeholder="Nama" className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                    <input value={newDependent.relationship} onChange={e => setNewDependent(d => ({ ...d, relationship: e.target.value }))} placeholder="Hubungan (anak, ibu...)" className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                  </div>
                  <button onClick={submitNewDependent} className="w-full px-3 py-2 bg-slate-900 text-white rounded-xl text-sm font-semibold cursor-pointer">+ Tambah Tanggungan</button>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-800">Belian Aset</h3>
                  <p className="text-xs text-slate-500">Direkodkan secara automatik bila anda sahkan cadangan AI untuk belian peralatan/mesin/kenderaan perniagaan.</p>
                  {assetPurchases.length === 0 && <p className="text-xs text-slate-400 text-center py-2">Tiada rekod belian aset lagi</p>}
                  {assetPurchases.map(a => (
                    <div key={a.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{a.assetName}</p>
                        <span className="text-xs text-slate-500">RM{a.purchaseAmountMyr.toFixed(2)} · {a.purchaseDate}{a.vendorName ? ` · ${a.vendorName}` : ""}</span>
                      </div>
                      <button onClick={() => removeAssetPurchase(a.id)} className="text-rose-400 hover:text-rose-600 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-800">Transaksi Pemilik (Modal/Drawing)</h3>
                  <p className="text-xs text-slate-500">Direkodkan secara automatik bila anda sahkan cadangan AI untuk modal masuk atau pengeluaran peribadi.</p>
                  {ownerTransactions.length === 0 && <p className="text-xs text-slate-400 text-center py-2">Tiada rekod transaksi pemilik lagi</p>}
                  {ownerTransactions.map(o => (
                    <div key={o.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{o.type === "CAPITAL_INJECTION" ? "Modal Masuk" : "Pengeluaran (Drawing)"}</p>
                        <span className="text-xs text-slate-500">RM{o.amountMyr.toFixed(2)} · {o.transactionDate}</span>
                      </div>
                      <button onClick={() => removeOwnerTransaction(o.id)} className="text-rose-400 hover:text-rose-600 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-slate-400 text-center">Maklumat pinjaman/loan diuruskan dalam modul Hutang & Liabiliti sedia ada.</p>
              </div>
            )}

            {morePage === "chatArchive" && (
              <div className="space-y-3">
                <h2 className="text-lg font-bold text-slate-900">Arkib Perbualan</h2>
                {(() => {
                  const merged = new Map<string, ChatMsg>();
                  chatHistoryAll.forEach(m => merged.set(m.id, m));
                  chatMessages.forEach(m => merged.set(m.id, m));
                  const allMessages = Array.from(merged.values());
                  if (allMessages.length === 0) {
                    return (
                      <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center shadow-sm">
                        <MessageCircle className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                        <p className="text-sm text-slate-400">Tiada perbualan lagi</p>
                      </div>
                    );
                  }
                  {
                    const byDate: Record<string, ChatMsg[]> = {};
                    allMessages.forEach(m => {
                      const d = (m.createdAt || new Date().toISOString()).slice(0, 10);
                      (byDate[d] = byDate[d] || []).push(m);
                    });
                    const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
                    return (
                      <>
                        <div className="grid grid-cols-3 gap-2">
                          {dates.map(d => (
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
                  }
                })()}
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

                {/* Reminder Settings â€" Feature 6 */}
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

                {/* Data Access Log (gap 7.2) */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
                  <button onClick={() => setShowDataAccessLog(v => !v)} className="w-full flex items-center justify-between cursor-pointer">
                    <div className="flex items-center space-x-2">
                      <Shield className="w-4 h-4 text-indigo-500" />
                      <p className="text-sm font-bold text-slate-900">Log Akses Data Peribadi</p>
                    </div>
                    <ChevronRight className={`w-3.5 h-3.5 text-slate-300 transition-transform ${showDataAccessLog ? "rotate-90" : ""}`} />
                  </button>
                  {showDataAccessLog && (
                    dataAccessLog.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-3">Tiada akses unmask direkodkan untuk data anda.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {dataAccessLog.map(entry => (
                          <div key={entry.id} className="flex items-center justify-between text-[11px] p-2 bg-slate-50 rounded-lg">
                            <div>
                              <p className="font-bold text-slate-700">{entry.staffEmail || "Staf HQ"}</p>
                              <p className="text-slate-400">{entry.action} • {new Date(entry.timestamp).toLocaleString("ms-MY")}</p>
                            </div>
                            {entry.currentlyActive && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Aktif</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            {/* â•â•â• SUPPORT CENTER â€" Feature 1 â•â•â• */}
            {/* Pusat Aktiviti */}
            {morePage === "activity" && (
              <div className="space-y-3">
                <h2 className="text-lg font-bold text-slate-900">Pusat Aktiviti</h2>
                {activityLoading && (
                  <div className="text-center text-slate-400 py-8">Memuatkan...</div>
                )}
                {!activityLoading && tenantActivity.length === 0 && (
                  <div className="text-center text-slate-400 py-8">
                    <Bell className="w-10 h-10 mx-auto mb-2 text-slate-200" />
                    <p className="text-sm">Tiada aktiviti direkodkan.</p>
                  </div>
                )}
                {tenantActivity.map(entry => (
                  <div key={entry.id} className="bg-white border border-slate-100 rounded-2xl px-4 py-3 shadow-sm">
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 leading-snug">{entry.description}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {entry.actorName || entry.actorEmail} &middot; {entry.actorRole} &middot; {entry.module}
                        </p>
                      </div>
                      <p className="text-[10px] text-slate-300 whitespace-nowrap shrink-0">
                        {new Date(entry.createdAt).toLocaleDateString('ms-MY', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* Account 360 View (H-04) */}
            {morePage === "account360" && (
              <div className="space-y-3">
                <h2 className="text-lg font-bold text-slate-900">Akaun Saya 360</h2>

                {/* Health Score */}
                {myHealthScore && (
                  <div className="bg-white border border-slate-200 rounded-2xl px-4 py-4 shadow-sm">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Skor Kesihatan Akaun</p>
                    <div className="flex items-center gap-4">
                      <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1, color: (myHealthScore.score || 0) >= 70 ? '#22c55e' : (myHealthScore.score || 0) >= 40 ? '#f59e0b' : '#ef4444' }}>
                        {myHealthScore.score ?? '--'}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          Tahap Risiko:{' '}
                          {myHealthScore.riskLevel === 'low' ? 'Rendah' : myHealthScore.riskLevel === 'medium' ? 'Sederhana' : 'Tinggi'}
                        </p>
                        {myHealthScore.reasons.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {myHealthScore.reasons.map((r, i) => (
                              <li key={i} className="text-[11px] text-slate-400">• {r}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {!myHealthScore && !isMockUser && (
                  <div className="bg-white border border-slate-200 rounded-2xl px-4 py-4 shadow-sm text-center text-slate-400 text-sm">
                    Skor kesihatan tidak tersedia buat masa ini.
                  </div>
                )}

                {/* Subscription Status */}
                <div className="bg-white border border-slate-200 rounded-2xl px-4 py-4 shadow-sm">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Status Langganan</p>
                  <p className="text-sm text-slate-600">
                    Maklumat plan, kredit AI & storan tersedia di bahagian <strong className="text-slate-800">Bil &amp; Langganan</strong>.
                  </p>
                  <button onClick={() => setMorePage('billing')}
                    className="mt-3 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition cursor-pointer">
                    Ke Bil &amp; Langganan →
                  </button>
                </div>

                {/* Quick links */}
                <div className="bg-white border border-slate-200 rounded-2xl px-4 py-4 shadow-sm">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Pautan Pantas</p>
                  <div className="space-y-2">
                    {[
                      { label: 'Profil Saya & Kewangan AI', page: 'myProfile' as MorePage },
                      { label: 'Sejarah Aktiviti', page: 'history' as MorePage },
                      { label: 'Pusat Sokongan', page: 'support' as MorePage },
                    ].map(({ label, page }) => (
                      <button key={page} onClick={() => setMorePage(page)}
                        className="w-full flex items-center justify-between px-0 py-1 text-sm text-slate-700 hover:text-indigo-600 transition cursor-pointer text-left">
                        <span>{label}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

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
                        Masalah tidak selesai? Buka tiket sokongan â†'
                      </button>
                    </div>
                  </div>
                )}

                {/* FAQ */}
                {supportView === "faq" && (
                  <div className="space-y-2">
                    {[
                      { q: "Bagaimana cara muat naik resit?", a: "Pergi ke tab Dokumen â†' klik 'Muat Naik Resit' â†' pilih gambar atau PDF resit anda." },
                      { q: "Bagaimana cara rekod perbelanjaan?", a: "Di Home, taip 'Saya bayar [nama] RM[jumlah]' atau klik '- Rekod Perbelanjaan' di bawah kotak chat." },
                      { q: "Bagaimana cara cari rekod lama?", a: "Pergi ke Dashboard â†' skrol ke bawah untuk lihat senarai transaksi terkini." },
                      { q: "Bagaimana cara jemput kakitangan?", a: "Pergi ke Lagi â†' Pasukan â†' klik 'Jemput Staf' â†' masukkan nama dan email." },
                      { q: "Bagaimana cara lihat laporan?", a: "Klik tab 'Laporan' di bawah navigasi untuk lihat P&L, Cashflow dan ringkasan kewangan." },
                      { q: "Boleh saya guna AI saya sendiri?", a: "Ya, jika HQ mengizinkan. Pergi ke Lagi â†' Tetapan Sumber untuk tukar ke AI anda sendiri." },
                      { q: "Apa itu kredit AI?", a: "Kredit AI digunakan apabila anda bertanya kepada MYKERANI. Semak baki di Lagi â†' Bil & Langganan." },
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
                            <label className="text-[11px] font-bold text-slate-400 uppercase">Jenis Isu</label>
                            <select value={ticketCategory} onChange={e => {
                              const key = e.target.value;
                              setTicketCategory(key);
                              const tmpl = SUPPORT_TICKET_TEMPLATES.find(t => t.key === key);
                              if (tmpl && tmpl.subject && !ticketSubject.trim()) setTicketSubject(tmpl.subject);
                            }}
                              className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 bg-white">
                              <option value="">Pilih jenis isu...</option>
                              {SUPPORT_TICKET_TEMPLATES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                            </select>
                          </div>
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
                          <div>
                            <label className="text-[11px] font-bold text-slate-400 uppercase">Lampiran (pilihan)</label>
                            <input type="file" accept="image/*,.pdf,.doc,.docx" onChange={e => setTicketAttachFile(e.target.files?.[0] || null)}
                              className="w-full mt-1 text-xs text-slate-500" />
                          </div>
                          <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
                            <p className="text-[11px] text-indigo-700 font-semibold">AI akan ringkaskan isu anda sebelum hantar ke pasukan HQ.</p>
                          </div>
                          {ticketError && (
                            <p className="text-xs font-bold text-red-600">{ticketError}</p>
                          )}
                        </div>
                        <button
                          onClick={async () => {
                            if (!ticketSubject.trim() || !ticketDesc.trim()) return;
                            setTicketSending(true);
                            setTicketError(null);
                            const ticketId = await createTenantSupportTicket(ticketSubject.trim(), ticketDesc.trim(), "medium", ticketCategory || undefined);
                            if (ticketId && ticketAttachFile && user?.tenantId) {
                              await uploadTicketAttachment(ticketId, user.tenantId, ticketAttachFile, user?.fullName || "Tenant");
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
                )}

                {/* Ticket Status */}
                {supportView === "ticket_status" && (
                  <div className="space-y-3">
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                      <div className="flex items-center space-x-2 mb-4">
                        <Ticket className="w-4 h-4 text-indigo-500" />
                        <h3 className="text-sm font-bold text-slate-900">Status Tiket Saya</h3>
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
                                    <p className={`text-[11px] mt-0.5 ${style.text}`}>Status: {TICKET_STATUS_LABEL_MS[t.status]}</p>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                      <span className="text-[10px] text-slate-400">Dihantar {new Date(t.createdAt).toLocaleDateString("ms-MY")}</span>
                                      {t.assigned && <span className="text-[10px] text-slate-400">• Staf HQ: {t.assigned}</span>}
                                      {sla === "breached" && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">SLA Lewat</span>}
                                      {sla === "near" && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">SLA Hampir Tamat</span>}
                                      {t.replies.length > 0 && <span className="text-[10px] text-slate-400">• {t.replies.length} balasan</span>}
                                      {t.attachments.length > 0 && <span className="text-[10px] text-slate-400">• {t.attachments.length} lampiran</span>}
                                    </div>
                                  </div>
                                  <ChevronRight className={`w-3.5 h-3.5 text-slate-300 shrink-0 mt-1 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                                </button>
                                {isOpen && (
                                  <div className="mt-3 pt-3 border-t border-slate-200/70 space-y-3">
                                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                                      <div><p className="text-slate-400">Keutamaan</p><p className="font-semibold text-slate-700 capitalize">{t.priority}</p></div>
                                      <div><p className="text-slate-400">Balasan Pertama</p><p className="font-semibold text-slate-700">{t.firstResponseAt ? new Date(t.firstResponseAt).toLocaleString("ms-MY") : "—"}</p></div>
                                    </div>
                                    {t.replies.length > 0 && (
                                      <div className="space-y-1.5">
                                        {t.replies.map(r => (
                                          <div key={r.id} className="text-[11px] text-slate-600 bg-white/60 rounded-lg px-2.5 py-1.5">
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
                                          className="w-full text-[11px] border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                        />
                                        <button
                                          disabled={!ticketReplyDraft.trim() || ticketReplySending}
                                          onClick={async () => {
                                            setTicketReplySending(true);
                                            const ok = await tenantReplySupportTicket(t.id, ticketReplyDraft.trim());
                                            setTicketReplySending(false);
                                            if (ok) { setTicketReplyDraft(""); refreshMyTickets(); }
                                          }}
                                          className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[11px] font-bold disabled:opacity-40 cursor-pointer"
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
                                          }} className="flex items-center gap-1.5 text-[11px] text-indigo-600 hover:underline cursor-pointer">
                                            <FileText className="w-3 h-3" />{a.fileName}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                    {t.resolutionNotes && (
                                      <div className="p-2 bg-emerald-50 border border-emerald-100 rounded-lg">
                                        <p className="text-[10px] font-bold text-emerald-700 uppercase">Nota Penyelesaian</p>
                                        <p className="text-[11px] text-emerald-700 mt-0.5">{t.resolutionNotes}</p>
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
              </div>
            )}

            {/* â•â•â• BILLING â€" Features 2, 3, 4 â•â•â• */}
            {morePage === "billing" && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-slate-900">Bil & Langganan</h2>

                {/* Current Plan */}
                <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-5 text-white shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-[11px] text-indigo-200">Plan Semasa</p>
                      <p className="text-2xl font-bold">{currentSub?.planName || "Tiada Plan"}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${currentSub?.status === "active" ? "bg-emerald-400 text-emerald-900" : "bg-amber-300 text-amber-900"}`}>
                      {currentSub?.status === "active" ? "Aktif" : currentSub?.status === "trialing" ? "Trial" : "Belum Aktif"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div><p className="text-indigo-300">Tarikh Pembaharuan</p><p className="font-semibold">{currentSub?.renewal || "—"}</p></div>
                    <div><p className="text-indigo-300">Harga Bulanan</p><p className="font-semibold">RM {(currentSub?.price ?? 0).toLocaleString()}/bulan</p></div>
                  </div>
                </div>

                {/* Plan actions */}
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => openPaymentModal(currentSub?.planId)} className="py-2.5 rounded-xl text-xs font-bold border transition cursor-pointer bg-emerald-50 border-emerald-100 text-emerald-700">Perbaharui</button>
                  <button onClick={() => openPaymentModal()} className="py-2.5 rounded-xl text-xs font-bold border transition cursor-pointer bg-indigo-50 border-indigo-100 text-indigo-700">Naik/Turun Taraf</button>
                </div>

                {/* Available plans — every tenant owner must choose from what HQ offers */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
                  <p className="text-sm font-bold text-slate-900">Plan Tersedia</p>
                  {trialError && <p className="text-xs text-red-600">{trialError}</p>}
                  <div className="grid sm:grid-cols-2 gap-3">
                    {availablePlans.map(p => (
                      <div key={p.id} className={`border rounded-2xl p-4 space-y-2 ${currentSub?.planId === p.id ? "border-indigo-300 bg-indigo-50/40" : "border-slate-200"}`}>
                        <p className="font-bold text-slate-900">{p.name}</p>
                        {p.isCustomPricing ? (
                          <p className="text-lg font-bold text-slate-900">Harga Tersuai</p>
                        ) : (
                          <p className="text-xl font-bold text-slate-900">RM {p.price.toLocaleString()}<span className="text-xs text-slate-400 font-normal">/bln</span></p>
                        )}
                        {p.features.length > 0 && (
                          <ul className="text-[10px] text-emerald-700 space-y-0.5">
                            {p.features.slice(0, 5).map((f, i) => <li key={i}>+ {f}</li>)}
                          </ul>
                        )}
                        {p.isTrial ? (
                          <button onClick={startTrial} disabled={trialSubmitting || !!currentSub}
                            className="w-full py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-indigo-700 transition disabled:opacity-40">
                            {trialSubmitting ? "Mengaktifkan..." : "Mulakan Percubaan Percuma"}
                          </button>
                        ) : p.isCustomPricing ? (
                          <a href="mailto:sales@mykerani.com" className="w-full block text-center py-2 bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-slate-800 transition">
                            Hubungi Jualan
                          </a>
                        ) : (
                          <button onClick={() => openPaymentModal(p.id)}
                            className="w-full py-2 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl text-xs font-bold cursor-pointer hover:bg-emerald-100 transition">
                            Pilih Plan
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Storage Bar */}
                <StorageBar quota={storageQuota} onBuyAddon={() => setShowAddonModal(true)} />

                {/* AI Credits â€" Feature 3 */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Zap className="w-4 h-4 text-amber-500" />
                      <p className="text-sm font-bold text-slate-900">Kredit AI</p>
                    </div>
                    <span className="text-xs text-slate-400">Paket {aiCredits.planName}</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Digunakan</span>
                      <span className="font-semibold text-slate-800">{aiCredits.used} / {aiCredits.total} kredit</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.min(100, (aiCredits.used / Math.max(1, aiCredits.total)) * 100)}%` }} />
                    </div>
                    <p className="text-[10px] text-slate-400">{Math.max(0, aiCredits.total - aiCredits.used)} kredit berbaki</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setShowCreditModal("AI")} className="py-2.5 bg-amber-50 border border-amber-100 text-amber-700 rounded-xl text-xs font-bold cursor-pointer hover:bg-amber-100 transition">Beli Kredit</button>
                    <button onClick={() => setMorePage("resources")} className="py-2.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold cursor-pointer hover:bg-slate-100 transition">Lihat Penggunaan</button>
                  </div>
                </div>

                {/* OCR Credits */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <ScanLine className="w-4 h-4 text-violet-500" />
                      <p className="text-sm font-bold text-slate-900">Kredit OCR</p>
                    </div>
                    <span className="text-xs text-slate-400">Paket {ocrCredits.planName}</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Digunakan</span>
                      <span className="font-semibold text-slate-800">{ocrCredits.used} / {ocrCredits.total} kredit</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-violet-400 rounded-full" style={{ width: `${Math.min(100, (ocrCredits.used / Math.max(1, ocrCredits.total)) * 100)}%` }} />
                    </div>
                    <p className="text-[10px] text-slate-400">{Math.max(0, ocrCredits.total - ocrCredits.used)} kredit berbaki</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setShowCreditModal("OCR")} className="py-2.5 bg-violet-50 border border-violet-100 text-violet-700 rounded-xl text-xs font-bold cursor-pointer hover:bg-violet-100 transition">Beli Kredit</button>
                    <button onClick={() => setMorePage("resources")} className="py-2.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold cursor-pointer hover:bg-slate-100 transition">Lihat Penggunaan</button>
                  </div>
                </div>

                {/* Storage â€" Feature 4 */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Database className="w-4 h-4 text-blue-500" />
                      <p className="text-sm font-bold text-slate-900">Storan</p>
                    </div>
                    <span className="text-xs text-slate-400">{storageQuota.quotaGB.toFixed(1)} GB termasuk</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Digunakan</span>
                      <span className="font-semibold text-slate-800">{storageQuota.usedGB.toFixed(2)} GB / {storageQuota.quotaGB.toFixed(1)} GB</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-400 rounded-full" style={{ width: `${Math.min(100, storageQuota.pctUsed * 100)}%` }} />
                    </div>
                    <p className="text-[10px] text-slate-400">{Math.max(0, storageQuota.quotaGB - storageQuota.usedGB).toFixed(2)} GB berbaki</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setShowAddonModal(true)} className="py-2.5 bg-blue-50 border border-blue-100 text-blue-700 rounded-xl text-xs font-bold cursor-pointer hover:bg-blue-100 transition">Beli Storan</button>
                    <button onClick={() => setMorePage("resources")} className="py-2.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold cursor-pointer hover:bg-slate-100 transition">Lihat Penggunaan</button>
                  </div>
                </div>

                {/* Promo Code Redemption */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
                  <div className="flex items-center space-x-2">
                    <Star className="w-4 h-4 text-emerald-500" />
                    <p className="text-sm font-bold text-slate-900">Kod Promosi</p>
                  </div>
                  <p className="text-[11px] text-slate-500">Ada kod promosi? Tebus untuk kredit dompet percuma atau lanjutan tempoh percubaan.</p>
                  <button onClick={() => { setShowPromoModal(true); setPromoResult(null); }} className="w-full py-2.5 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl text-xs font-bold cursor-pointer hover:bg-emerald-100 transition">Tebus Kod Promosi</button>
                  {/* Promo history */}
                  {promoHistory.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 space-y-1">
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Histori Promosi</div>
                      {promoHistory.slice(0, 3).map((r: any) => (
                        <div key={r.id} style={{ fontSize: 12, color: '#555', padding: '3px 0' }}>
                          {r.promotions?.code} — {r.promotions?.kind === 'wallet_credit' ? `+${r.promotions?.amount} kredit` : `+${r.promotions?.amount} hari trial`} ({new Date(r.redeemed_at).toLocaleDateString('ms-MY')})
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Invoices / payment history */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
                  <p className="text-sm font-bold text-slate-900">Invois & Sejarah Pembayaran</p>
                  {paymentTxs.length === 0 ? (
                    <div className="text-center py-4">
                      <Receipt className="w-7 h-7 text-slate-200 mx-auto mb-1" />
                      <p className="text-xs text-slate-400">Tiada invois lagi</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {paymentTxs.map(tx => (
                        <div key={tx.id} className="flex items-center justify-between p-2.5 border border-slate-100 rounded-xl">
                          <div>
                            <p className="text-xs font-semibold text-slate-800">{tx.kind === "addon" ? tx.addonLabel : tx.planName} — RM {tx.amountMyr.toLocaleString()}</p>
                            <p className="text-[10px] text-slate-400">{new Date(tx.createdAt).toLocaleDateString("ms-MY", { day: "numeric", month: "short", year: "numeric" })} · {tx.method === "manual" ? "Manual" : "Chip Asia"}</p>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            tx.status === "approved" || tx.status === "success" ? "bg-emerald-50 text-emerald-700" :
                            tx.status === "rejected" || tx.status === "failed" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"
                          }`}>
                            {tx.status === "pending" ? "Menunggu" : tx.status === "approved" || tx.status === "success" ? "Berjaya" : tx.status === "rejected" ? "Ditolak" : "Gagal"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Payment modal — manual slip upload or Chip Asia checkout */}
            {showPaymentModal && (
              <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" onClick={() => setShowPaymentModal(false)}>
                <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-4" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900">{addonPurchase ? "Bayar Tambahan" : "Bayar Langganan"}</h3>
                    <button onClick={() => { setShowPaymentModal(false); setAddonPurchase(null); }} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-4 h-4" /></button>
                  </div>

                  {addonPurchase ? (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <p className="text-sm font-bold text-slate-800">{addonPurchase.label}</p>
                      <p className="text-xs text-slate-500">RM {addonPurchase.amountMyr.toLocaleString()}</p>
                    </div>
                  ) : (
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">Pilih Plan</label>
                      <select value={paymentModalPlanId} onChange={e => setPaymentModalPlanId(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 bg-white">
                        {availablePlans.map(p => <option key={p.id} value={p.id}>{p.name} — RM {p.price.toLocaleString()}/bln</option>)}
                      </select>
                    </div>
                  )}

                  {(paymentMethods.chipAsiaEnabled || paymentMethods.manualPaymentEnabled) ? (
                    <div className="flex gap-2">
                      {paymentMethods.chipAsiaEnabled && (
                        <button onClick={() => setPaymentMethod("chip_asia")}
                          className={`flex-1 py-2 rounded-xl text-xs font-bold border cursor-pointer ${paymentMethod === "chip_asia" ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-200 text-slate-500"}`}>
                          Bayar Online (Chip Asia)
                        </button>
                      )}
                      {paymentMethods.manualPaymentEnabled && (
                        <button onClick={() => setPaymentMethod("manual")}
                          className={`flex-1 py-2 rounded-xl text-xs font-bold border cursor-pointer ${paymentMethod === "manual" ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-200 text-slate-500"}`}>
                          Muat Naik Slip
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-amber-600 bg-amber-50 p-2.5 rounded-xl">Tiada kaedah pembayaran diaktifkan oleh HQ.</p>
                  )}

                  {paymentMethod === "manual" && paymentMethods.manualPaymentEnabled && (
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">Slip Bank (gambar/PDF)</label>
                      <input type="file" accept="image/*,application/pdf" onChange={e => setSlipFile(e.target.files?.[0] || null)}
                        className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5" />
                      <p className="text-[10px] text-slate-400 mt-1">HQ owner atau staf akan menyemak dan meluluskan sebelum pakej diaktifkan.</p>
                    </div>
                  )}

                  {paymentError && <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-xl">{paymentError}</p>}

                  <button onClick={submitPayment} disabled={paymentSubmitting || (!paymentMethods.chipAsiaEnabled && !paymentMethods.manualPaymentEnabled)}
                    className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-indigo-700 transition disabled:opacity-40">
                    {paymentSubmitting ? "Menghantar..." : paymentMethod === "chip_asia" ? "Teruskan ke Chip Asia" : "Hantar Slip untuk Kelulusan"}
                  </button>
                </div>
              </div>
            )}

            {/* â•â•â• RESOURCE SETTINGS â€" Feature 5 â•â•â• */}
            {morePage === "resources" && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-slate-900">Tetapan Sumber</h2>

                {/* AI Source */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-indigo-500" />
                    <p className="text-sm font-bold text-slate-900">Sumber AI</p>
                  </div>
                  {([
                    { id: "mykerani" as const, label: "MYKERANI AI", desc: "AI rasmi MYKERANI — kredit AI daripada plan anda" },
                    { id: "own" as const,      label: "AI Sendiri",  desc: "Guna API key anda sendiri — tanpa had kredit" },
                  ] as const).map(({ id, label, desc }) => (
                    <button key={id} onClick={() => setResAI(id)}
                      className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition cursor-pointer ${resAI === id ? "border-indigo-500 bg-indigo-50" : "border-slate-100 hover:border-slate-200"}`}>
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${resAI === id ? "border-indigo-500 bg-indigo-500" : "border-slate-300"}`}>
                        {resAI === id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <div className="text-left">
                        <p className={`text-xs font-bold ${resAI === id ? "text-indigo-800" : "text-slate-700"}`}>{label}</p>
                        <p className="text-[10px] text-slate-400">{desc}</p>
                      </div>
                      {resAI === id && id === "mykerani" && (
                        <span className="ml-auto text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">Aktif</span>
                      )}
                    </button>
                  ))}
                  {resAI === "own" && (
                    <div className="space-y-2 pt-1">
                      <input type="password" value={resAIKey} onChange={e => setResAIKey(e.target.value)}
                        placeholder="Masukkan API Key (Gemini / OpenAI / Claude)"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xs outline-none focus:border-indigo-400 bg-white font-mono" />
                      <p className="text-[10px] text-slate-400">API Key disimpan dalam peranti anda sahaja dan tidak dihantar ke pelayan MYKERANI.</p>
                    </div>
                  )}
                </div>

                {/* AI Cost Summary (gap 3.1) */}
                {aiCostSummary.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-2">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-indigo-500" />
                      <p className="text-sm font-bold text-slate-900">Kos & Perbelanjaan AI</p>
                    </div>
                    {aiCostSummary.map(row => (
                      <div key={row.model} className="flex items-center justify-between text-[11px] p-2 bg-slate-50 rounded-lg">
                        <div>
                          <p className="font-bold text-slate-700">{row.model}</p>
                          <p className="text-slate-400">USD {row.costPerCallUsd.toFixed(4)}/panggilan • {row.callsThisMonth} panggilan bulan ini</p>
                        </div>
                        <p className="font-bold text-slate-700">USD {row.spendThisMonthUsd.toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* BYOS Storage */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-blue-500" />
                    <p className="text-sm font-bold text-slate-900">Storan Dokumen</p>
                  </div>

                  {/* Connected state */}
                  {storageConn ? (
                    <div className="space-y-3">
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <p className="text-xs font-bold text-emerald-800">
                              {storageConn.provider === "gdrive" ? "Google Drive" : storageConn.provider === "onedrive" ? "OneDrive" : "Dropbox"} Tersambung
                            </p>
                          </div>
                          <span className="text-[9px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">Aktif</span>
                        </div>
                        <div className="space-y-1 text-[11px] text-slate-600">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Akaun</span>
                            <span className="font-semibold">{storageConn.email}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Folder</span>
                            <span className="font-semibold">{storageConn.folder}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Digunakan</span>
                            <span className="font-semibold">{storageConn.usedGB.toFixed(2)} GB</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Sinkronisasi Terakhir</span>
                            <span className="font-semibold">{new Date(storageConn.lastSync).toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                        </div>
                      </div>

                      {/* Folder picker */}
                      {showFolderPicker ? (
                        <div className="space-y-2">
                          <p className="text-[11px] font-semibold text-slate-600">Nama folder dalam {storageConn.provider === "gdrive" ? "Google Drive" : storageConn.provider === "onedrive" ? "OneDrive" : "Dropbox"}:</p>
                          <div className="flex gap-2">
                            <input value={folderInput} onChange={e => setFolderInput(e.target.value)}
                              placeholder="MYKERANI Dokumen"
                              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-400" />
                            <button onClick={() => {
                                if (folderInput.trim()) setStorageConn(prev => prev ? { ...prev, folder: folderInput.trim(), lastSync: new Date().toISOString() } : prev);
                                setShowFolderPicker(false); setFolderInput("");
                              }}
                              className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold cursor-pointer hover:bg-indigo-700 transition">
                              Simpan
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button onClick={() => { setFolderInput(storageConn.folder); setShowFolderPicker(true); }}
                            className="flex-1 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 cursor-pointer hover:bg-slate-50 transition">
                            Tukar Folder
                          </button>
                          <button onClick={() => setStorageConn(prev => prev ? { ...prev, lastSync: new Date().toISOString() } : prev)}
                            className="flex-1 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 cursor-pointer hover:bg-slate-50 transition flex items-center justify-center gap-1.5">
                            <RefreshCw className="w-3 h-3" /> Sinkron
                          </button>
                        </div>
                      )}
                      <button onClick={disconnectStorage}
                        className="w-full py-2.5 border border-red-200 text-red-500 rounded-xl text-xs font-bold cursor-pointer hover:bg-red-50 transition">
                        Nyahsambung Storan
                      </button>
                    </div>
                  ) : (
                    /* Not connected — show provider options */
                    <div className="space-y-2">
                      <p className="text-[11px] text-slate-500 pb-1">Sambung storan cloud anda untuk simpan dokumen di luar MYKERANI:</p>
                      {([
                        { id: "mykerani" as const,  label: "Storan MYKERANI",  desc: "Storan selamat dalam platform",         color: "bg-emerald-50 border-emerald-200 text-emerald-700", badge: "Aktif" },
                        { id: "gdrive" as const,    label: "Google Drive",      desc: "Simpan terus ke Google Drive anda",     color: "bg-blue-50 border-blue-200 text-blue-700",           badge: null },
                        { id: "onedrive" as const,  label: "OneDrive",          desc: "Simpan ke Microsoft OneDrive anda",     color: "bg-sky-50 border-sky-200 text-sky-700",              badge: null },
                        { id: "dropbox" as const,   label: "Dropbox",           desc: "Simpan ke akaun Dropbox anda",         color: "bg-violet-50 border-violet-200 text-violet-700",     badge: null },
                      ] as const).map(({ id, label, desc, color, badge }) => (
                        <div key={id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50/50">
                          <div>
                            <p className="text-xs font-bold text-slate-700">{label}</p>
                            <p className="text-[10px] text-slate-400">{desc}</p>
                          </div>
                          {id === "mykerani" ? (
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${color}`}>{badge}</span>
                          ) : (
                            <button onClick={() => connectStorage(id)} disabled={connectingProv === id}
                              className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-[10px] font-bold cursor-pointer hover:bg-slate-700 transition disabled:opacity-50 shrink-0">
                              {connectingProv === id ? "Menyambung..." : "Sambung"}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Info box */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Pilihan storan luar bergantung kepada kebenaran yang ditetapkan HQ. Dokumen yang dimuat naik akan disimpan ke folder yang dipilih. MYKERANI tidak menyimpan salinan jika storan luar digunakan.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* â"€â"€ BOTTOM NAV â"€â"€ */}
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

      {/* Storage Frozen Banner */}
      {storageQuota.isFrozen && activeTab === "documents" && (
        <div className="fixed bottom-20 left-4 right-4 z-40 bg-red-600 text-white rounded-2xl p-4 shadow-xl flex items-center gap-3">
          <div className="shrink-0 w-8 h-8 rounded-xl bg-red-500 flex items-center justify-center">
            <HardDrive className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold">Storan Dibekukan</p>
            <p className="text-[10px] text-red-200">Upload disekat. Hubungi HQ atau beli tambahan storan.</p>
          </div>
          <button onClick={() => setShowAddonModal(true)}
            className="shrink-0 bg-white text-red-600 text-[10px] font-bold px-3 py-1.5 rounded-lg cursor-pointer">
            Beli
          </button>
        </div>
      )}

      {/* Add-On Storage Modal */}
      {showAddonModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-sm shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Tambah Storan</h3>
              <button onClick={() => setShowAddonModal(false)} className="p-1.5 rounded-xl hover:bg-slate-100 cursor-pointer">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <p className="text-[11px] text-slate-500">Pilih pakej tambahan storan. Bayaran akan disahkan oleh HQ.</p>
            <div className="space-y-2">
              {storagePackages.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-3">Tiada pakej tersedia.</p>
              ) : storagePackages.map((pkg) => (
                <button key={pkg.id}
                  onClick={() => {
                    setShowAddonModal(false);
                    openAddonPurchaseModal("STORAGE", pkg.amount, `Tambahan Storan ${pkg.label}`, pkg.priceMyr);
                  }}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition cursor-pointer ${pkg.isBestValue ? "border-emerald-500 bg-emerald-50" : "border-slate-100 hover:border-slate-200"}`}>
                  <div className="text-left">
                    <p className={`text-sm font-bold ${pkg.isBestValue ? "text-emerald-800" : "text-slate-800"}`}>{pkg.label}</p>
                    {pkg.isBestValue && <span className="text-[9px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full">TERBAIK</span>}
                  </div>
                  <p className={`text-sm font-bold ${pkg.isBestValue ? "text-emerald-700" : "text-slate-600"}`}>RM {pkg.priceMyr}/bln</p>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 text-center">Storan tambahan aktif selepas pembayaran disahkan (Chip Asia serta-merta, slip manual selepas semakan HQ).</p>
          </div>
        </div>
      )}

      {/* AI/OCR Credit Top-Up Modal */}
      {showCreditModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-sm shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Tambah Kredit {showCreditModal === "AI" ? "AI" : "OCR"}</h3>
              <button onClick={() => setShowCreditModal(null)} className="p-1.5 rounded-xl hover:bg-slate-100 cursor-pointer">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <p className="text-[11px] text-slate-500">Pilih pakej kredit tambahan. Kredit ditambah ke wallet selepas pembayaran disahkan.</p>
            <div className="space-y-2">
              {(showCreditModal === "AI" ? aiCreditPackages : ocrCreditPackages).length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-3">Tiada pakej tersedia.</p>
              ) : (showCreditModal === "AI" ? aiCreditPackages : ocrCreditPackages).map((pkg) => (
                <button key={pkg.id}
                  onClick={() => {
                    const creditType = showCreditModal;
                    setShowCreditModal(null);
                    openAddonPurchaseModal(creditType, pkg.amount, `Tambahan Kredit ${creditType === "AI" ? "AI" : "OCR"} ${pkg.label}`, pkg.priceMyr);
                  }}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition cursor-pointer ${pkg.isBestValue ? "border-emerald-500 bg-emerald-50" : "border-slate-100 hover:border-slate-200"}`}>
                  <div className="text-left">
                    <p className={`text-sm font-bold ${pkg.isBestValue ? "text-emerald-800" : "text-slate-800"}`}>{pkg.label}</p>
                    {pkg.isBestValue && <span className="text-[9px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full">TERBAIK</span>}
                  </div>
                  <p className={`text-sm font-bold ${pkg.isBestValue ? "text-emerald-700" : "text-slate-600"}`}>RM {pkg.priceMyr}</p>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 text-center">Kredit tambahan aktif selepas pembayaran disahkan (Chip Asia serta-merta, slip manual selepas semakan HQ).</p>
          </div>
        </div>
      )}

      {/* Promo Code Redemption Modal */}
      {showPromoModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-sm shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Tebus Kod Promosi</h3>
              <button onClick={() => setShowPromoModal(false)} className="p-1.5 rounded-xl hover:bg-slate-100 cursor-pointer">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <p className="text-[11px] text-slate-500">Masukkan kod promosi untuk menebus kredit dompet percuma atau lanjutan tempoh percubaan.</p>
            <input
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value)}
              placeholder="Kod promosi"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400"
            />
            {promoResult && (
              <div className={`rounded-xl p-3 text-xs font-semibold ${promoResult.startsWith("Berjaya") ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-red-50 text-red-700 border border-red-100"}`}>
                {promoResult}
              </div>
            )}
            <button
              disabled={promoBusy || !promoCode.trim()}
              onClick={submitPromoRedeem}
              className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold cursor-pointer hover:bg-emerald-700 transition disabled:opacity-50"
            >
              {promoBusy ? "Menebus..." : "Tebus Sekarang"}
            </button>
          </div>
        </div>
      )}

      {/* Quick Add Modals */}
      {quickAdd && <QuickAddModal type={quickAdd} onClose={() => setQuickAdd(null)} onSave={handleSaveRecord} />}

      {/* Phase 2D — Financial Health Command Center drill-downs. Same shared
          components rendered by FinancialRecordsConsole's HQ console — no
          Owner-only duplicate-review or import-recovery logic. */}
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

      {/* Onboarding Wizard */}
      {showOnboard && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
            {/* Progress bar */}
            <div className="h-1 bg-slate-100">
              <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${(onboardStep / 3) * 100}%` }} />
            </div>

            <div className="p-6 space-y-5">
              {/* Step indicator */}
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Langkah {onboardStep} / 3</p>
                <button onClick={finishOnboard} className="text-[10px] text-slate-300 cursor-pointer hover:text-slate-400">Langkau</button>
              </div>

              {/* Step 1: Welcome + Biz name */}
              {onboardStep === 1 && (
                <div className="space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center shadow">
                    <Brain className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900">Selamat datang ke MYKERANI</h2>
                    <p className="text-sm text-slate-500 mt-1">MYKERANI membantu anda mengurus kewangan tanpa memerlukan pengetahuan akaun.</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-600">Apa yang anda ingin uruskan?</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => pickObWorkspaceType("PERSONAL")}
                        className={`min-h-11 p-3 rounded-xl border-2 text-xs font-bold transition cursor-pointer ${obWorkspaceType === "PERSONAL" ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-100 text-slate-600 hover:border-slate-200"}`}>
                        Peribadi
                      </button>
                      <button type="button" onClick={() => pickObWorkspaceType("BUSINESS")}
                        className={`min-h-11 p-3 rounded-xl border-2 text-xs font-bold transition cursor-pointer ${obWorkspaceType === "BUSINESS" ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-100 text-slate-600 hover:border-slate-200"}`}>
                        Perniagaan
                      </button>
                    </div>
                  </div>

                  {obWorkspaceType && (
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-600">
                        {obWorkspaceType === "PERSONAL" ? "Nama Peribadi" : "Nama Perniagaan"}
                      </label>
                      <input value={obBizName} onChange={e => setObBizName(e.target.value)}
                        placeholder={obWorkspaceType === "PERSONAL" ? "Nama Peribadi" : "Contoh: Kedai Makan Mak Su"}
                        className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-400" />
                    </div>
                  )}

                  <button
                    onClick={async () => { if (obBizName.trim()) { await saveObBizName(); setOnboardStep(2); } }}
                    disabled={!obBizName.trim() || obSavingName}
                    className="w-full min-h-11 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl text-sm font-bold transition cursor-pointer disabled:opacity-40">
                    {obSavingName ? "Menyimpan..." : "Mula"}
                  </button>
                </div>
              )}

              {/* Step 2: Jenis bisnes */}
              {onboardStep === 2 && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-black text-slate-900">Jenis Perniagaan</h2>
                    <p className="text-sm text-slate-500 mt-1">Bantu MYKERANI faham perniagaan anda supaya AI dapat memberi cadangan yang lebih tepat.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: "makanan",      label: "Makanan & Minuman" },
                      { id: "runcit",       label: "Runcit / Kedai" },
                      { id: "perkhidmatan", label: "Perkhidmatan" },
                      { id: "pembinaan",    label: "Pembinaan / Kontraktor" },
                      { id: "pertanian",    label: "Pertanian" },
                      { id: "lain",         label: "Lain-lain" },
                    ].map(({ id, label }) => (
                      <button key={id} onClick={() => setObBizType(id)}
                        className={`p-3 rounded-xl border-2 text-xs font-semibold text-left transition cursor-pointer ${obBizType === id ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-100 text-slate-600 hover:border-slate-200"}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setOnboardStep(1)}
                      className="flex-1 py-3 border border-slate-200 rounded-2xl text-sm font-bold text-slate-600 cursor-pointer hover:bg-slate-50 transition">
                      Kembali
                    </button>
                    <button onClick={() => obBizType && setOnboardStep(3)} disabled={!obBizType}
                      className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl text-sm font-bold transition cursor-pointer disabled:opacity-40">
                      Seterusnya
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Done + first action */}
              {onboardStep === 3 && (
                <div className="space-y-4">
                  <div>
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center shadow mb-3">
                      <CheckCircle2 className="w-6 h-6 text-white" />
                    </div>
                    <h2 className="text-lg font-black text-slate-900">Semua Sedia!</h2>
                    <p className="text-sm text-slate-500 mt-1">
                      <strong className="text-slate-800">{obBizName}</strong> telah disediakan. Apa yang anda ingin buat dahulu?
                    </p>
                  </div>
                  <div className="space-y-2">
                    <button onClick={() => { finishOnboard(); setQuickAdd("INCOME"); }}
                      className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-emerald-200 bg-emerald-50 cursor-pointer hover:border-emerald-400 transition">
                      <TrendingUp className="w-5 h-5 text-emerald-500 shrink-0" />
                      <div className="text-left">
                        <p className="text-sm font-bold text-emerald-800">Rekod Pendapatan Pertama</p>
                        <p className="text-[11px] text-emerald-600">Catat jualan atau pendapatan hari ini</p>
                      </div>
                    </button>
                    <button onClick={() => { finishOnboard(); setQuickAdd("EXPENSE"); }}
                      className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-rose-100 bg-rose-50 cursor-pointer hover:border-rose-300 transition">
                      <TrendingDown className="w-5 h-5 text-rose-400 shrink-0" />
                      <div className="text-left">
                        <p className="text-sm font-bold text-rose-700">Rekod Perbelanjaan Pertama</p>
                        <p className="text-[11px] text-rose-500">Catat kos atau perbelanjaan perniagaan</p>
                      </div>
                    </button>
                    <button onClick={() => { finishOnboard(); sendChat("Helo MYKERANI! Saya baru mula. Boleh tolong terangkan apa yang awak boleh buat untuk perniagaan saya?"); }}
                      className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-slate-100 cursor-pointer hover:border-slate-200 transition">
                      <Brain className="w-5 h-5 text-indigo-400 shrink-0" />
                      <div className="text-left">
                        <p className="text-sm font-bold text-slate-700">Tanya AI Dahulu</p>
                        <p className="text-[11px] text-slate-400">Ketahui apa yang MYKERANI boleh bantu</p>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

