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
import { StorageBar } from "../components/StorageBar";
import { useStorageQuota, PLAN_QUOTAS, GB } from "../lib/storageQuota";
import { useAiCredits } from "../lib/aiCredits";
import { useNotifications, buildTenantNotifs, fmtNotifTime } from "../lib/notifications";
import {
  uploadDocument, listDocuments, deleteDocument, getDocumentUrl,
  isAllowedFileType, MAX_FILE_SIZE, fmtBytes as fmtDocBytes,
  type UploadedDoc, type DocType,
} from "../lib/documentStorage";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import {
  submitManualPayment, initiateChipAsiaPayment, getTenantPaymentTransactions, startTrialSubscription,
  type TenantPaymentTransaction,
} from "../lib/paymentService";

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

// â"€â"€ Quick Add Record Modal â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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

// â"€â"€â"€ Main Component â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
export function OwnerDashboard() {
  const { user, signOut } = useAuth();
  const { activeWorkspace, workspaces, selectWorkspace } = useWorkspace();
  const { activeTenant } = useTenant();
  const { financialEvents, addFinancialEvent } = useFinancials();

  const [activeTab, setActiveTab] = useState<MainTab>("home");
  const [morePage, setMorePage] = useState<MorePage>("menu");
  const [quickAdd, setQuickAdd] = useState<"INCOME" | "EXPENSE" | null>(null);

  // â"€â"€ Onboarding Wizard â"€â"€
  const onboardKey = `mykerani_onboarded_${user?.id ?? "guest"}`;
  const [onboardDone, setOnboardDone] = useState(() => !!localStorage.getItem(onboardKey));
  const [onboardStep, setOnboardStep] = useState(1);
  const [obBizName, setObBizName] = useState(user?.fullName ? `${user.fullName} - Perniagaan` : "");
  const [obBizType, setObBizType] = useState("");

  const finishOnboard = () => {
    localStorage.setItem(onboardKey, "1");
    setOnboardDone(true);
  };

  // â"€â"€ AI Chat State â"€â"€
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // â"€â"€ Invite staff â"€â"€
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ success: boolean; message: string; tempPassword?: string } | null>(null);

  // â"€â"€ Support Center â"€â"€
  const [supportMessages, setSupportMessages] = useState<{ id: string; sender: "user" | "ai"; text: string }[]>([]);
  const [supportInput, setSupportInput] = useState("");
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportView, setSupportView] = useState<"chat" | "faq" | "ticket" | "ticket_status">("chat");
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketDesc, setTicketDesc] = useState("");
  const [ticketSent, setTicketSent] = useState(false);
  const supportEndRef = useRef<HTMLDivElement>(null);

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
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const firstName = user?.fullName?.split(" ")[0] || "Anda";
  const greeting = getGreeting();

  const myEvents = useMemo(() => financialEvents.filter(e => e.workspaceId === wsId), [financialEvents, wsId]);
  const incomeThisMonth = useMemo(() => myEvents.filter(e => e.type === "INCOME" && e.date.startsWith(thisMonth)).reduce((s, e) => s + e.amountMyr, 0), [myEvents, thisMonth]);
  const expenseThisMonth = useMemo(() => myEvents.filter(e => e.type === "EXPENSE" && e.date.startsWith(thisMonth)).reduce((s, e) => s + e.amountMyr, 0), [myEvents, thisMonth]);
  const totalReceivable = useMemo(() => myEvents.filter(e => e.type === "RECEIVABLE" && !e.isCompleted).reduce((s, e) => s + e.amountMyr, 0), [myEvents]);
  const totalPayable = useMemo(() => myEvents.filter(e => e.type === "PAYABLE" && !e.isCompleted).reduce((s, e) => s + e.amountMyr, 0), [myEvents]);
  const showOnboard = !onboardDone && !user?.email?.endsWith(".demo") && user?.role === "TENANT_OWNER";

  // â"€â"€ Storage Quota â"€â"€
  const tenantId = activeTenant?.id || user?.id || "guest";
  const storageQuota = useStorageQuota(tenantId, wsId || undefined);
  const aiCredits = useAiCredits(tenantId);
  const [showAddonModal, setShowAddonModal] = useState(false);

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

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase || !activeTenant?.id) return;
    supabase.from("subscription_plans").select("id,name,monthly_price_myr,features").order("monthly_price_myr", { ascending: true })
      .then(({ data }) => setAvailablePlans((data || []).map((p: any) => ({
        id: p.id, name: p.name, price: Number(p.monthly_price_myr) || 0,
        features: p.features?.featureList ?? [], limitations: p.features?.limitations ?? [],
        isTrial: p.features?.isTrial ?? false, isCustomPricing: p.features?.isCustomPricing ?? false,
      }))));
    supabase.from("payment_gateway_settings").select("chip_asia_enabled,manual_payment_enabled").eq("id", "global").maybeSingle()
      .then(({ data }) => { if (data) setPaymentMethods({ chipAsiaEnabled: Boolean(data.chip_asia_enabled), manualPaymentEnabled: Boolean(data.manual_payment_enabled) }); });
    supabase.from("tenant_subscriptions").select("plan_id,status,current_period_end,subscription_plans(name,monthly_price_myr)").eq("tenant_id", activeTenant.id).maybeSingle()
      .then(({ data }: any) => {
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
    getTenantPaymentTransactions(activeTenant.id).then(setPaymentTxs);
  }, [activeTenant?.id, paymentTxRefresh]);

  const openPaymentModal = (planId?: string) => {
    setPaymentModalPlanId(planId || currentSub?.planId || availablePlans[0]?.id || "");
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
    if (!activeTenant?.id || !paymentModalPlanId) return;
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
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState<DocType | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingDocType, setPendingDocType] = useState<DocType>("SUPPORTING_DOC");

  // Load documents when workspace ready
  useEffect(() => {
    if (!wsId) return;
    setDocsLoading(true);
    listDocuments(wsId).then(d => { setDocs(d); setDocsLoading(false); });
  }, [wsId]);

  const triggerUpload = (docType: DocType) => {
    if (user?.email?.endsWith(".demo") || (user as any)?.isMockUser) {
      setUploadError("Akaun demo tidak boleh muat naik dokumen. Log masuk dengan akaun sebenar.");
      return;
    }
    if (storageQuota.isFrozen) { setUploadError("Storan dibekukan. Hubungi HQ."); return; }
    if (!storageQuota.canUpload) { setUploadError("Storan penuh. Beli tambahan storan."); return; }
    setPendingDocType(docType);
    setUploadError(null);
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (!isAllowedFileType(file)) { setUploadError("Jenis fail tidak disokong. Guna PDF, gambar, atau CSV."); return; }
    if (file.size > MAX_FILE_SIZE) { setUploadError("Saiz fail melebihi 10MB."); return; }
    if (!wsId || !user?.id) { setUploadError("Sesi tidak sah. Cuba log masuk semula."); return; }
    setUploadingDoc(pendingDocType);
    setUploadError(null);
    const { doc, error } = await uploadDocument(file, wsId, user.id, pendingDocType);
    setUploadingDoc(null);
    if (error) { setUploadError(error); return; }
    if (doc) { setDocs(prev => [doc, ...prev]); storageQuota.refresh(); }
  };

  const handleDeleteDoc = async (doc: UploadedDoc) => {
    const err = await deleteDocument(doc);
    if (err) { setUploadError(err); return; }
    setDocs(prev => prev.filter(d => d.id !== doc.id));
    storageQuota.refresh();
  };

  const handlePreviewDoc = async (doc: UploadedDoc) => {
    const url = await getDocumentUrl(doc.file_path_supabase);
    if (url) window.open(url, "_blank");
  };

  // Update activity timestamp on financial events change
  useEffect(() => { if (myEvents.length > 0) storageQuota.touchActive(); }, [myEvents.length]);

  // â"€â"€ Notifications â"€â"€
  const notif = useNotifications(user?.id || "guest");
  const [showNotifPanel, setShowNotifPanel] = useState(false);

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
                      <p className="text-xs text-slate-400">{now.toLocaleDateString("ms-MY", { weekday:"long", day:"numeric", month:"long" })}</p>
                    </div>
                  </div>

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
                                <p className="text-[11px] text-slate-600 truncate">{ev.partyName||ev.categoryName}</p>
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

                  <p className="text-xs text-slate-400 text-center">Tanya saya apa sahaja tentang kewangan anda</p>
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
            <div>
              <h2 className="text-lg font-bold text-slate-900">Dashboard</h2>
              <p className="text-xs text-slate-400">{now.toLocaleDateString("ms-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-4 text-white shadow">
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

        {/* â•â•â•â• DOCUMENTS â•â•â•â• */}
        {activeTab === "documents" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-2xl mx-auto w-full pb-20" id="owner_docs_pane">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Dokumen</h2>
              <span className="text-[11px] text-slate-400">{docs.length} fail</span>
            </div>

            {/* Hidden file input */}
            <input ref={fileInputRef} type="file" className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.csv"
              onChange={handleFileSelected} />

            {/* Storage bar compact */}
            <StorageBar quota={storageQuota} compact onBuyAddon={() => setShowAddonModal(true)} />

            {/* Upload error */}
            {uploadError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between">
                <p className="text-xs text-red-600 font-semibold">{uploadError}</p>
                <button onClick={() => setUploadError(null)} className="text-red-400 hover:text-red-600 cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Upload buttons */}
            <div className="grid grid-cols-3 gap-3">
              {([
                { label: "Muat Naik Resit",  docType: "RECEIPT" as DocType,        icon: Receipt,         bg: "bg-amber-50 border-amber-100 text-amber-500" },
                { label: "Muat Naik Invois", docType: "INVOICE" as DocType,        icon: FileSpreadsheet, bg: "bg-blue-50 border-blue-100 text-blue-500" },
                { label: "Penyata Bank",     docType: "BANK_STATEMENT" as DocType, icon: Landmark,        bg: "bg-violet-50 border-violet-100 text-violet-500" },
              ]).map(({ label, docType, icon: Icon, bg }) => (
                <button key={docType} onClick={() => triggerUpload(docType)} disabled={!!uploadingDoc || storageQuota.isFrozen}
                  className={`flex flex-col items-center space-y-2 p-4 bg-white border rounded-2xl shadow-sm hover:shadow-md transition cursor-pointer disabled:opacity-50 ${bg}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bg}`}>
                    {uploadingDoc === docType
                      ? <RefreshCw className="w-5 h-5 animate-spin" />
                      : <Icon className="w-5 h-5" />}
                  </div>
                  <span className="text-[11px] font-semibold text-slate-700 text-center leading-tight">{label}</span>
                </button>
              ))}
            </div>

            {/* Lain-lain */}
            <button onClick={() => triggerUpload("SUPPORTING_DOC")} disabled={!!uploadingDoc || storageQuota.isFrozen}
              className="w-full flex items-center gap-3 px-4 py-3 bg-white border border-dashed border-slate-300 rounded-2xl hover:border-emerald-400 hover:bg-emerald-50 transition cursor-pointer disabled:opacity-50">
              <Upload className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-500 font-semibold">Muat naik dokumen lain (Kontrak, dsb.)</span>
            </button>

            {/* Document list */}
            {docsLoading ? (
              <div className="py-8 text-center">
                <RefreshCw className="w-5 h-5 text-slate-300 animate-spin mx-auto mb-2" />
                <p className="text-xs text-slate-400">Memuatkan dokumen...</p>
              </div>
            ) : docs.length === 0 ? (
              <div className="py-10 text-center bg-white border border-slate-100 rounded-2xl">
                <FileText className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-400">Belum ada dokumen</p>
                <p className="text-[11px] text-slate-300 mt-0.5">Muat naik resit, invois atau penyata bank</p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="divide-y divide-slate-50">
                  {docs.map(doc => {
                    const typeLabel: Record<string, string> = {
                      RECEIPT: "Resit", INVOICE: "Invois", BANK_STATEMENT: "Penyata Bank",
                      CONTRACT: "Kontrak", SUPPORTING_DOC: "Dokumen Lain",
                    };
                    return (
                      <div key={doc.id} className="px-4 py-3.5 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4 text-slate-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">{doc.file_name}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {typeLabel[doc.document_type] || doc.document_type} &middot; {fmtDocBytes(doc.file_size_bytes)} &middot; {new Date(doc.created_at).toLocaleDateString("ms-MY")}
                          </p>
                        </div>
                        <button onClick={() => handlePreviewDoc(doc)} title="Buka"
                          className="text-slate-300 hover:text-emerald-600 cursor-pointer p-1 shrink-0">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDeleteDoc(doc)} title="Padam"
                          className="text-slate-300 hover:text-red-500 cursor-pointer p-1 shrink-0">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* â•â•â•â• REPORTS â•â•â•â• */}
        {activeTab === "reports" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-2xl mx-auto w-full pb-20" id="owner_reports_pane">
            <h2 className="text-lg font-bold text-slate-900">Laporan</h2>
            <FinancialReportsAnalytics />
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

            {/* â•â•â• SUPPORT CENTER â€" Feature 1 â•â•â• */}
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
                    <button className="py-2.5 bg-amber-50 border border-amber-100 text-amber-700 rounded-xl text-xs font-bold cursor-pointer hover:bg-amber-100 transition">Beli Kredit</button>
                    <button className="py-2.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold cursor-pointer hover:bg-slate-100 transition">Lihat Penggunaan</button>
                  </div>
                </div>

                {/* Storage â€" Feature 4 */}
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
                            <p className="text-xs font-semibold text-slate-800">{tx.planName} — RM {tx.amountMyr.toLocaleString()}</p>
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
                    <h3 className="text-sm font-bold text-slate-900">Bayar Langganan</h3>
                    <button onClick={() => setShowPaymentModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-4 h-4" /></button>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Pilih Plan</label>
                    <select value={paymentModalPlanId} onChange={e => setPaymentModalPlanId(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 bg-white">
                      {availablePlans.map(p => <option key={p.id} value={p.id}>{p.name} — RM {p.price.toLocaleString()}/bln</option>)}
                    </select>
                  </div>

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
              {[
                { gb: 5,  label: "+5 GB",  price: "RM 15/bln", best: false },
                { gb: 20, label: "+20 GB", price: "RM 45/bln", best: true  },
                { gb: 50, label: "+50 GB", price: "RM 99/bln", best: false },
              ].map(({ gb, label, price, best }) => (
                <button key={gb}
                  onClick={() => {
                    storageQuota.applyAddon(gb * GB);
                    setShowAddonModal(false);
                  }}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition cursor-pointer ${best ? "border-emerald-500 bg-emerald-50" : "border-slate-100 hover:border-slate-200"}`}>
                  <div className="text-left">
                    <p className={`text-sm font-bold ${best ? "text-emerald-800" : "text-slate-800"}`}>{label}</p>
                    {best && <span className="text-[9px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full">TERBAIK</span>}
                  </div>
                  <p className={`text-sm font-bold ${best ? "text-emerald-700" : "text-slate-600"}`}>{price}</p>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 text-center">Storan tambahan aktif serta-merta selepas HQ mengesahkan pembayaran.</p>
          </div>
        </div>
      )}

      {/* Quick Add Modals */}
      {quickAdd && <QuickAddModal type={quickAdd} onClose={() => setQuickAdd(null)} onSave={handleSaveRecord} />}

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
                    <p className="text-sm text-slate-500 mt-1">Juru Kira AI untuk perniagaan anda. Mari sediakan akaun anda dalam 3 langkah mudah.</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-600">Nama Perniagaan Anda</label>
                    <input value={obBizName} onChange={e => setObBizName(e.target.value)}
                      placeholder="Contoh: Kedai Makan Mak Su"
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-400" />
                  </div>
                  <button onClick={() => obBizName.trim() && setOnboardStep(2)} disabled={!obBizName.trim()}
                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl text-sm font-bold transition cursor-pointer disabled:opacity-40">
                    Seterusnya
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

