import React, { useState, useEffect, useRef } from "react";
import { useFinancials } from "../context/FinancialRecordsContext";
import { useAudit } from "../context/AuditContext";
import { useTenant } from "../context/TenantContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { useAuth } from "../context/AuthContext";
import { motion } from "../lib/motionCompat";
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
    vendorName: string;
    category: string;
    recordType: string;
    confidenceScore: number;
  };
}

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
}

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
    learnOcrPattern
  } = useFinancials();

  const { activeTenant } = useTenant();
  const { activeWorkspace } = useWorkspace();
  const { user } = useAuth();

  // Component state
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
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

      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      setChatHistory(prev => [...prev, { id: systemMessageId, sender: "assistant", text: cleanText }]);
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

  // Human-friendly suggested questions
  const SUGGESTED_QUESTIONS = [
    { title: "💵 Berapa baki tunai saya?", query: "Berapakah baki tunai keseluruhan syarikat sekarang?" },
    { title: "📈 Ketahanan baki tunai?", query: "Berapakah anggaran tempoh ketahanan aliran tunai atau baki tunai syarikat?" },
    { title: "📊 Aliran masuk & keluar?", query: "Senaraikan ringkasan aliran masuk pertambahan pendapatan melawan keluar perbelanjaan terbaharu." },
    { title: "📂 Cari lampiran fail resit", query: "Cari lampiran fail resit dan dokumen yang telah dimuat naik." }
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col h-[650px]" id="ai_conversation_deck">
      
      {/* 1. AI Conversation Area */}
      <h3 className="text-xs font-semibold text-indigo-900 tracking-wider uppercase mb-3 flex items-center shrink-0">
        <Sparkles className="w-4 h-4 mr-2 text-indigo-500" />
        RUANG PERBUALAN KERANI KEWANGAN AI
      </h3>

      <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4 scrollbar-thin flex flex-col pt-2 border-t border-slate-100">
        {chatHistory.map((item) => {
          const isUser = item.sender === "user";
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
