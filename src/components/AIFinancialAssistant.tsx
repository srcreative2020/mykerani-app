import React, { useState, useEffect, useRef } from "react";
import { useFinancials } from "../context/FinancialRecordsContext";
import { useAudit } from "../context/AuditContext";
import { useTenant } from "../context/TenantContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { useAuth } from "../context/AuthContext";
import { motion } from "../lib/motionCompat";
import { loadBusinesses, type Business } from "../lib/profileData";
import { buildFinancialContext } from "../lib/buildFinancialContext";
import { enrichChatSuggestionPayload } from "../lib/chatSuggestionMapper";
import { confirmFinancialRecord, type ConfirmInput } from "../lib/financialRecordConfirmation";
import { logTenantActivity } from "../lib/hqService";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import {
  Brain,
  Send,
  RefreshCw,
  HelpCircle,
  FileText,
  Receipt,
  Building,
  User,
  Sparkles,
  Paperclip
} from "lucide-react";

interface AISuggestion {
  id: string;
  title: string;
  description: string;
  actionType: string;
  payload: {
    vendorName?: string;
    category?: string;
    recordType?: string;
    confidenceScore?: number;
    transactionType?: "INCOME" | "EXPENSE" | "DEBT" | "RECEIVABLE" | "COMMITMENT";
    amount?: number;
    date?: string;
    relatedParty?: string;
  };
  // Local-only frontend state added between "AI returns suggestion" and
  // "render confirmation card" — the LLM never picks the business, the user does.
  businessId?: string | null;
  businessName?: string;
  businessPicked?: boolean;
  evidenceStatus?: "NONE" | "ATTACHED" | "SKIPPED";
  evidenceFileName?: string;
}

const TRANSACTION_TYPE_LABEL_MS: Record<string, string> = {
  INCOME: "Pendapatan",
  EXPENSE: "Perbelanjaan",
  DEBT: "Hutang",
  RECEIVABLE: "Belum Terima",
  COMMITMENT: "Komitmen",
};

interface AIHighlights {
  healthStatus: string;
  estimatedRunwayDays: number;
  capitalEfficiencyScore: number;
  criticalActionRequired: string;
}

interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  suggestions?: AISuggestion[];
}

type SuggestionStatus = "pending" | "confirmed" | "rejected";

interface AIFinancialAssistantProps {
  onTriggerUpload?: (type: "RECEIPT" | "INVOICE" | "STATEMENT") => void;
}

export const AIFinancialAssistant: React.FC<AIFinancialAssistantProps> = ({ onTriggerUpload }) => {
  const {
    financialEvents,
    cashAccounts,
    bankAccounts,
    debtRecords,
    financialCommitments,
    financialEvidencePackages,
    ocrLearnedPatterns,
    learnOcrPattern,
    addFinancialEventAwaited,
    addDebtRecord,
    addFinancialCommitment,
    addFinancialEvidencePackage
  } = useFinancials();

  const { activeTenant } = useTenant();
  const { activeWorkspace } = useWorkspace();
  const { user, isMockUser } = useAuth();

  // Component state
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestionStatus, setSuggestionStatus] = useState<Record<string, SuggestionStatus>>({});
  const [editingSuggestionId, setEditingSuggestionId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ amount: string; category: string; relatedParty: string; date: string }>({
    amount: "", category: "", relatedParty: "", date: ""
  });
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const evidenceFileInputRef = useRef<HTMLInputElement>(null);
  const [evidenceTargetSuggestionId, setEvidenceTargetSuggestionId] = useState<string | null>(null);
  const [uploadingEvidenceFor, setUploadingEvidenceFor] = useState<string | null>(null);
  // Holds uploaded-but-not-yet-linked evidence metadata per suggestion id, until
  // Sahkan creates the underlying financial record and we know its id to link to.
  const pendingEvidenceBySuggestionRef = useRef<Record<string, { documentType: "RECEIPT"; fileName: string; fileUrl: string }>>({});

  useEffect(() => {
    let isCurrent = true;
    (async () => {
      if (!activeWorkspace?.id) {
        setBusinesses([]);
        return;
      }
      const list = await loadBusinesses(activeWorkspace.id, !!isMockUser);
      if (isCurrent) setBusinesses(list.filter(b => b.isActive));
    })();
    return () => { isCurrent = false; };
  }, [activeWorkspace?.id, isMockUser]);

  const activeBusinesses = businesses;

  // Start with the specific requested welcome message
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      id: "welcome-msg",
      sender: "assistant",
      text: "Saya Kerani Kewangan Anda. Apa yang berlaku hari ini?"
    }
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, loading]);

  const executeAgentQuery = async (queryText: string) => {
    if (!queryText.trim() || loading) return;

    // Add user question to history
    const userMessageId = `user-${Date.now()}`;
    setChatHistory(prev => [...prev, { id: userMessageId, sender: "user", text: queryText }]);
    
    setLoading(true);
    setError(null);
    try {
      const financialContext = {
        activeTenant,
        activeWorkspace,
        financialEvents,
        cashAccounts,
        bankAccounts,
        debtRecords,
        financialCommitments,
        financialEvidencePackages,
        ocrLearnedPatterns
      };

      const { getAuthHeader } = await import("../lib/supabase");
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
        body: JSON.stringify({
          query: queryText,
          financialContext,
          userId: user?.id
        })
      });

      if (res.status === 403) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Akaun anda telah disekat oleh pentadbir HQ.");
      }
      if (res.status === 402) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Kredit AI syarikat anda telah digunakan sepenuhnya. Sila naik taraf pelan.");
      }
      if (!res.ok) {
        throw new Error(`HTTP state: ${res.status}`);
      }

      const data = await res.json();
      console.log("[AI_ASSISTANT_DEBUG] raw API response:", data);
      console.log("[AI_ASSISTANT_DEBUG] data.suggestions:", data.suggestions);

      // Clean data text of forbidden terms if any leak in
      let cleanText = data.text || "Saya telah menyemak maklumat tersebut.";
      cleanText = cleanText
        .replace(/co-pilot/gi, "Kerani AI")
        .replace(/pilot/gi, "Kerani AI")
        .replace(/compiler/gi, "sistem")
        .replace(/simulation/gi, "ujian")
        .replace(/sandbox/gi, "ujian")
        .replace(/diagnostic/gi, "semakan")
        .replace(/advisory engine/gi, "syor kerani")
        .replace(/workspace health/gi, "keadaan aliran kewangan")
        .replace(/classification pattern/gi, "kategori belanja")
        .replace(/tenant/gi, "syarikat");

      const systemMessageId = `assist-${Date.now()}`;
      // The LLM's own "id" field has no uniqueness guarantee across turns (it has
      // no memory of prior ids), so suggestionStatus[s.id] from an earlier message
      // could otherwise leak onto a same-id suggestion in a later message. Always
      // assign a fresh client-side id instead of trusting the model's.
      const transactionSuggestions: AISuggestion[] = Array.isArray(data.suggestions)
        ? data.suggestions
            .filter((s: AISuggestion) => s.actionType === "CONFIRM_TRANSACTION")
            .map((s: AISuggestion, idx: number) => ({
              ...enrichChatSuggestionPayload(s, { cashAccounts, bankAccounts, businesses }),
              id: `${systemMessageId}-sugg-${idx}`,
              // No active businesses configured: silently default to Personal, skip the picker.
              businessId: activeBusinesses.length > 0 ? undefined : null,
              businessName: activeBusinesses.length > 0 ? undefined : "Personal",
              businessPicked: activeBusinesses.length === 0,
              evidenceStatus: "NONE" as const,
            }))
        : [];
      console.log("[AI_ASSISTANT_DEBUG] confirmSuggestions (filtered+remapped):", transactionSuggestions, "length:", transactionSuggestions.length);
      setChatHistory(prev => [...prev, { id: systemMessageId, sender: "assistant", text: cleanText, suggestions: transactionSuggestions }]);
    } catch (err: any) {
      console.error(err);
      const isKnownAdvisory = /disekat oleh pentadbir HQ|Kredit AI syarikat anda/.test(err?.message || "");
      setChatHistory(prev => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: "assistant",
          text: isKnownAdvisory
            ? err.message
            : "Minta maaf, talian pembantu pintar terputus sebentar. Sila cuba lagi."
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    executeAgentQuery(query);
    setQuery("");
  };

  // Mutates one suggestion's local-only fields (business pick / evidence status)
  // in place wherever it lives inside chatHistory.
  const updateSuggestion = (id: string, patch: Partial<AISuggestion>) => {
    setChatHistory(prev => prev.map(item => {
      if (!item.suggestions || item.suggestions.length === 0) return item;
      const hasMatch = item.suggestions.some(s => s.id === id);
      if (!hasMatch) return item;
      return {
        ...item,
        suggestions: item.suggestions.map(s => (s.id === id ? { ...s, ...patch } : s))
      };
    }));
  };

  const handlePickBusiness = (suggestionId: string, business: Business | null) => {
    updateSuggestion(suggestionId, {
      businessId: business ? business.id : null,
      businessName: business ? business.businessName : "Personal",
      businessPicked: true
    });
  };

  const handleSkipEvidence = (suggestionId: string) => {
    updateSuggestion(suggestionId, { evidenceStatus: "SKIPPED" });
  };

  const handleRequestAttachEvidence = (suggestionId: string) => {
    setEvidenceTargetSuggestionId(suggestionId);
    evidenceFileInputRef.current?.click();
  };

  const handleEvidenceFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const suggestionId = evidenceTargetSuggestionId;
    e.target.value = "";
    if (!file || !suggestionId || !activeWorkspace) return;

    setUploadingEvidenceFor(suggestionId);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      let finalUrl = dataUrl;
      if (isSupabaseConfigured() && !isMockUser && supabase) {
        try {
          const fileExt = file.name.split(".").pop();
          const cleanName = file.name.replace(/[^a-zA-Z0-9]/g, "_");
          const filePath = `${activeWorkspace.id}/${Date.now()}_${cleanName}.${fileExt}`;
          const { data, error: storageError } = await supabase.storage
            .from("evidence-packages")
            .upload(filePath, file, { cacheControl: "3600", upsert: true });
          if (!storageError && data) {
            const { data: { publicUrl } } = supabase.storage.from("evidence-packages").getPublicUrl(filePath);
            if (publicUrl) finalUrl = publicUrl;
          }
        } catch (stEx: any) {
          console.warn("Evidence storage upload exception, using fallback:", stEx?.message);
        }
      }

      // The financial record doesn't exist yet at this point in the chat flow — the
      // evidence package gets linked to it (relatedRecordId) once Sahkan creates the
      // record, via the pending evidence info kept on the suggestion itself.
      updateSuggestion(suggestionId, {
        evidenceStatus: "ATTACHED",
        evidenceFileName: file.name
      });
      (pendingEvidenceBySuggestionRef.current)[suggestionId] = {
        documentType: "RECEIPT",
        fileName: file.name,
        fileUrl: finalUrl
      };
    } catch (err) {
      console.error("Failed to attach evidence:", err);
    } finally {
      setUploadingEvidenceFor(null);
      setEvidenceTargetSuggestionId(null);
    }
  };

  // Module 3 (Confirmation Engine) + Module 4 (Auto Recording) + Module 5 (Learning):
  // a CONFIRM_TRANSACTION suggestion never writes a record by itself — it is only
  // finalized once the user explicitly presses Confirm here (optionally after Edit).
  const handleRejectSuggestion = (id: string) => {
    setSuggestionStatus(prev => ({ ...prev, [id]: "rejected" }));
  };

  const handleStartEdit = (s: AISuggestion) => {
    setEditingSuggestionId(s.id);
    setEditDraft({
      amount: String(s.payload?.amount ?? ""),
      category: s.payload?.category || "",
      relatedParty: s.payload?.relatedParty || "",
      date: s.payload?.date || new Date().toISOString().split("T")[0]
    });
  };

  const handleConfirmSuggestion = async (s: AISuggestion, edited?: typeof editDraft) => {
    if (!activeWorkspace || suggestionStatus[s.id] === "confirmed") return;
    setConfirmingId(s.id);
    const transactionType = s.payload?.transactionType;
    const amount = Number(edited ? edited.amount : s.payload?.amount) || 0;
    const category = (edited ? edited.category : s.payload?.category) || "Lain-lain";
    const relatedParty = (edited ? edited.relatedParty : s.payload?.relatedParty) || "Tidak Dinyatakan";
    const date = (edited ? edited.date : s.payload?.date) || new Date().toISOString().split("T")[0];
    const confidenceScore = s.payload?.confidenceScore ?? 0.7;
    const businessId = s.businessId || undefined;

    try {
      const pendingEvidence = pendingEvidenceBySuggestionRef.current[s.id];

      const input: ConfirmInput = {
        workspaceId: activeWorkspace.id,
        tenantId: activeTenant?.id || activeWorkspace.tenantId,
        userId: user?.id,
        userEmail: user?.email,
        userRole: user?.role,
        businessId,
        transactionType: (transactionType as ConfirmInput["transactionType"]) || "EXPENSE",
        amount,
        category,
        relatedParty,
        date,
        confidenceScore,
        referenceNumber: `AI-${s.id}`,
        description: `Direkodkan melalui pengesahan cadangan Kerani AI: ${s.title}`,
        pendingEvidence: pendingEvidence
          ? { documentType: pendingEvidence.documentType, fileName: pendingEvidence.fileName, fileUrl: pendingEvidence.fileUrl }
          : null,
        evidenceAttached: s.evidenceStatus === "ATTACHED",
        source: "AI_CHAT",
        sourceTitle: `AI chat suggestion: ${s.title}`,
        auditDestination: activeTenant?.id && user?.id ? "EVENT_LOG" : "NONE",
      };

      const result = await confirmFinancialRecord(input, {
        addFinancialEventAwaited,
        addFinancialEvent: addFinancialEventAwaited as any,
        addDebtRecordAwaited: addDebtRecord as any,
        addDebtRecord,
        addFinancialCommitmentAwaited: addFinancialCommitment as any,
        addFinancialCommitment,
        addAssetPurchase: async () => undefined,
        addOwnerTransaction: async () => undefined,
        linkEvidenceToRecord: (link: any) => addFinancialEvidencePackage({
          workspaceId: link.workspaceId,
          documentType: link.documentType,
          uploadDate: new Date().toISOString().split("T")[0],
          fileName: link.fileName,
          fileUrl: link.fileUrl,
          relatedRecordType: link.relatedRecordType,
          relatedRecordId: link.relatedRecordId,
        }),
        learnOcrPattern,
        scanForDuplicates: async () => [],
        logEvent: (e: any) => { void import("../lib/eventLog").then(m => m.logEvent(e)); },
        logTenantActivity,
      });

      if (!result.ok) {
        console.error("Failed to confirm AI suggestion:", result.error);
        setError(result.error || "Gagal menyimpan rekod.");
        return;
      }

      if (pendingEvidence && result.ok) {
        delete pendingEvidenceBySuggestionRef.current[s.id];
      }

      setSuggestionStatus(prev => ({ ...prev, [s.id]: "confirmed" }));
      setEditingSuggestionId(null);
    } catch (err: any) {
      console.error("Failed to confirm AI suggestion:", err);
      setError(`Gagal menyimpan rekod ke pangkalan data: ${err?.message || "ralat tidak diketahui"}. Cadangan TIDAK disahkan, sila cuba lagi.`);
    } finally {
      setConfirmingId(null);
    }
  };

  // Human-friendly suggested questions
  const SUGGESTED_QUESTIONS = [
    { title: "💵 Berapa baki tunai saya?", query: "Berapakah baki tunai keseluruhan syarikat sekarang?" },
    { title: "📈 Ketahanan baki tunai?", query: "Berapakah anggaran tempoh ketahanan aliran tunai atau baki tunai syarikat?" },
    { title: "📊 Aliran masuk & keluar?", query: "Senaraikan ringkasan aliran masuk pertambahan pendapatan melawan keluar perbelanjaan terbaharu." },
    { title: "📂 Cari lampiran fail resit", query: "Cari lampiran fail resit dan dokumen yang telah dimuat naik." }
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col h-[650px]" id="ai_conversation_deck">
      <input
        ref={evidenceFileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={handleEvidenceFileSelected}
      />

      {/* 1. AI Conversation Area */}
      <h3 className="text-xs font-semibold text-indigo-900 tracking-wider uppercase mb-3 flex items-center shrink-0">
        <Sparkles className="w-4 h-4 mr-2 text-indigo-500" />
        RUANG PERBUALAN KERANI KEWANGAN AI
      </h3>

      <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4 scrollbar-thin flex flex-col pt-2 border-t border-slate-100">
        {chatHistory.map((item) => {
          const isUser = item.sender === "user";
          const hasTxnSuggestion = (item.suggestions || []).some(s => s.actionType === "CONFIRM_TRANSACTION");
          if (hasTxnSuggestion && !isUser) return null;
          return (
            <div
              key={item.id}
              className={`flex items-start gap-3.5 max-w-[85%] ${
                isUser ? "self-end flex-row-reverse" : "self-start"
              }`}
            >
              {/* Avatar Icon */}
              <div
                className={`p-2 rounded-xl shrink-0 ${
                  isUser
                    ? "bg-indigo-100 text-indigo-800"
                    : "bg-slate-900 text-white"
                }`}
              >
                {isUser ? <User className="w-4 h-4" /> : <Brain className="w-4 h-4" />}
              </div>

              {/* Message Bubble */}
              <div
                className={`p-4 rounded-3xl text-sm leading-relaxed ${
                  isUser
                    ? "bg-indigo-650 text-white rounded-tr-none"
                    : "bg-slate-50 text-slate-800 border border-slate-100 rounded-tl-none whitespace-pre-wrap"
                }`}
              >
                {item.text}
              </div>
            </div>
          );
        })}

        {chatHistory.map((item) => {
          if (item.suggestions && item.suggestions.length > 0) {
            console.log("[AI_ASSISTANT_DEBUG] render pass — item.suggestions:", item.suggestions, "length:", item.suggestions.length, "suggestionStatus:", suggestionStatus);
          }
          return (item.suggestions || []).map((s) => {
          const status = suggestionStatus[s.id] || "pending";
          console.log(`[AI_ASSISTANT_DEBUG] suggestion ${s.id} resolved status:`, status);
          if (status === "rejected") return null;
          const needsBusinessPick = status === "pending" && !s.businessPicked;
          const confidencePct = Math.round((s.payload?.confidenceScore ?? 0) * 100);
          const confidenceColorClass = confidencePct >= 90
            ? "text-emerald-700"
            : confidencePct >= 75
              ? "text-amber-700"
              : "text-rose-700";
          return (
            <div key={s.id} className="self-start max-w-[85%] ml-11 p-3.5 bg-white border border-slate-200 rounded-2xl text-sm space-y-2 shadow-sm">
              {needsBusinessPick ? (
                <div className="space-y-2">
                  <div className="font-semibold text-slate-700">Transaksi ini untuk:</div>
                  <div className="flex flex-wrap gap-2">
                    {activeBusinesses.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => handlePickBusiness(s.id, b)}
                        className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-150 text-indigo-700 font-semibold text-xs"
                      >
                        {b.businessName}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => handlePickBusiness(s.id, null)}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-semibold text-xs"
                    >
                      Personal
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="font-mono text-slate-800 space-y-0.5">
                    <div>Jenis: {TRANSACTION_TYPE_LABEL_MS[s.payload?.transactionType || ""] || s.payload?.transactionType || "-"}</div>
                    <div>Kategori: {s.payload?.category || "-"}</div>
                    <div>Jumlah: RM{Number(s.payload?.amount || 0).toFixed(2)}</div>
                    <div>Untuk: {s.businessName || "Personal"}</div>
                    <div>Confidence: <span className={`font-bold ${confidenceColorClass}`}>{confidencePct}%</span></div>
                    <div className="flex items-center gap-2">
                      <span>Evidence:</span>
                      {s.evidenceStatus === "ATTACHED" && (
                        <span className="text-emerald-700 font-bold">Resit/invois dilampirkan{s.evidenceFileName ? ` (${s.evidenceFileName})` : ""}</span>
                      )}
                      {s.evidenceStatus === "SKIPPED" && (
                        <span className="text-slate-500">Tiada resit</span>
                      )}
                      {(s.evidenceStatus === "NONE" || !s.evidenceStatus) && status === "pending" && (
                        <span className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleRequestAttachEvidence(s.id)}
                            disabled={uploadingEvidenceFor === s.id}
                            className="px-2 py-1 rounded-md bg-indigo-50 hover:bg-indigo-100 border border-indigo-150 text-indigo-700 font-semibold text-[11px] disabled:opacity-50"
                          >
                            {uploadingEvidenceFor === s.id ? "Memuat naik..." : "Lampir Resit"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSkipEvidence(s.id)}
                            className="px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-semibold text-[11px]"
                          >
                            Tiada Resit
                          </button>
                        </span>
                      )}
                    </div>
                  </div>

                  {status === "confirmed" && (
                    <div className="text-emerald-700 font-bold">✅ Disahkan & direkodkan.</div>
                  )}

                  {status === "pending" && editingSuggestionId !== s.id && (
                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={() => handleConfirmSuggestion(s)} disabled={confirmingId === s.id} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed">Sahkan</button>
                      <button type="button" onClick={() => handleStartEdit(s)} className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold">Edit</button>
                      <button type="button" onClick={() => handleRejectSuggestion(s.id)} className="px-3 py-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 font-semibold">Tolak</button>
                    </div>
                  )}

                  {status === "pending" && editingSuggestionId === s.id && (
                    <div className="space-y-1.5 pt-1">
                      <input value={editDraft.amount} onChange={e => setEditDraft(d => ({ ...d, amount: e.target.value }))} placeholder="Amount (RM)" className="w-full px-2 py-1 rounded border border-amber-300 text-xs" />
                      <input value={editDraft.category} onChange={e => setEditDraft(d => ({ ...d, category: e.target.value }))} placeholder="Category" className="w-full px-2 py-1 rounded border border-amber-300 text-xs" />
                      <input value={editDraft.relatedParty} onChange={e => setEditDraft(d => ({ ...d, relatedParty: e.target.value }))} placeholder="Related Party" className="w-full px-2 py-1 rounded border border-amber-300 text-xs" />
                      <input value={editDraft.date} onChange={e => setEditDraft(d => ({ ...d, date: e.target.value }))} type="date" className="w-full px-2 py-1 rounded border border-amber-300 text-xs" />
                      <div className="flex gap-2 pt-1">
                        <button type="button" onClick={() => handleConfirmSuggestion(s, editDraft)} disabled={confirmingId === s.id} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed">Sahkan Perubahan</button>
                        <button type="button" onClick={() => setEditingSuggestionId(null)} className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold">Batal</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          );
          });
        })}

        {error && (
          <div className="flex items-start justify-between gap-2 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-xs text-rose-700 self-start max-w-[85%]">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600 cursor-pointer shrink-0">✕</button>
          </div>
        )}

        {/* Loading Indicator */}
        {loading && (
          <div className="flex items-start gap-4 max-w-[85%] self-start animate-pulse">
            <div className="p-2 rounded-xl bg-slate-900 text-white shrink-0">
              <RefreshCw className="w-4 h-4 animate-spin" />
            </div>
            <div className="p-4 bg-slate-50 text-slate-500 border border-slate-100 rounded-3xl rounded-tl-none text-xs font-sans">
              Kerani AI sedang menyemak data perniagaan anda...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 2, 3, 4. Actions: Quick Simulators/Uploaders */}
      {onTriggerUpload && (
        <div className="grid grid-cols-3 gap-2.5 mb-4 shrink-0 pt-2 border-t border-slate-100" id="quick_upload_actions">
          <button
            onClick={() => onTriggerUpload("RECEIPT")}
            type="button"
            className="flex items-center justify-center space-x-2 p-3 bg-slate-50 hover:bg-slate-100/90 active:bg-slate-200 border border-slate-200 hover:border-slate-350 text-slate-800 rounded-2xl transition cursor-pointer text-xs font-bold shadow-3xs"
          >
            <Receipt className="w-4 h-4 text-emerald-600" />
            <span>Muat Naik Resit</span>
          </button>
          
          <button
            onClick={() => onTriggerUpload("INVOICE")}
            type="button"
            className="flex items-center justify-center space-x-2 p-3 bg-slate-50 hover:bg-slate-100/90 active:bg-slate-200 border border-slate-200 hover:border-slate-350 text-slate-800 rounded-2xl transition cursor-pointer text-xs font-bold shadow-3xs"
          >
            <FileText className="w-4 h-4 text-rose-600" />
            <span>Muat Naik PDF</span>
          </button>

          <button
            onClick={() => onTriggerUpload("STATEMENT")}
            type="button"
            className="flex items-center justify-center space-x-2 p-3 bg-slate-50 hover:bg-slate-100/90 active:bg-slate-200 border border-slate-200 hover:border-slate-350 text-slate-800 rounded-2xl transition cursor-pointer text-xs font-bold shadow-3xs"
          >
            <Building className="w-4 h-4 text-blue-600" />
            <span>Muat Naik Penyata Bank</span>
          </button>
        </div>
      )}

      {/* 5. Suggested Questions */}
      <div className="space-y-1.5 mb-4 shrink-0">
        <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400 block px-0.5">Cadangan Soalan Kewangan:</span>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_QUESTIONS.map((item, idx) => (
            <button
              key={idx}
              onClick={() => executeAgentQuery(item.query)}
              type="button"
              disabled={loading}
              className="bg-indigo-50 hover:bg-indigo-150/70 border border-indigo-100 rounded-full py-1.5 px-3.5 text-xs text-indigo-700 transition cursor-pointer disabled:opacity-40 font-medium"
            >
              {item.title}
            </button>
          ))}
        </div>
      </div>

      {/* Input query field */}
      <div className="pt-2 border-t border-slate-100 shrink-0">
        <form onSubmit={handleFormSubmit} className="flex gap-2.5">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tulis soalan mengenai baki akaun atau belanja syarikat di sini..."
            className="flex-1 px-4 py-3 text-sm bg-slate-50 border border-slate-250 outline-none focus:bg-white focus:border-indigo-600 rounded-2xl transition shadow-3xs"
            disabled={loading}
            required
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="bg-indigo-950 hover:bg-slate-900 disabled:opacity-40 text-white rounded-2xl p-3 px-5 transition flex items-center justify-center text-sm font-semibold shrink-0 cursor-pointer shadow-3xs"
          >
            <Send className="w-4 h-4 mr-1.5" /> Tanya
          </button>
        </form>
      </div>

    </div>
  );
};
