import React, { useState, useEffect } from "react";
import { useFinancials } from "../context/FinancialRecordsContext";
import { useAudit } from "../context/AuditContext";
import { useTenant } from "../context/TenantContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { motion } from "motion/react";
import {
  Brain,
  Sparkles,
  Send,
  RefreshCw,
  Search,
  Check,
  FileText,
  AlertTriangle,
  Zap,
  Gauge,
  Clock,
  ArrowRight,
  ShieldCheck,
  Layers,
  HelpCircle,
  TrendingDown,
  TrendingUp,
  Paperclip
} from "lucide-react";

interface AISuggestion {
  id: string;
  title: string;
  description: string;
  actionType: "LEARN_PATTERN" | string;
  payload: {
    vendorName: string;
    category: string;
    recordType: string;
    confidenceScore: number;
  };
}

interface AIHighlights {
  healthStatus: "EXCELLENT" | "STABLE" | "WARNING" | "THREAT" | string;
  estimatedRunwayDays: number;
  capitalEfficiencyScore: number;
  criticalActionRequired: string;
}

interface AIResponse {
  text: string;
  suggestions: AISuggestion[];
  highlights: AIHighlights;
  linkedRecordIds: string[];
  linkedEvidenceIds: string[];
}

export const AIFinancialAssistant: React.FC = () => {
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

  const { writeAuditLog } = useAudit();
  const { activeTenant } = useTenant();
  const { activeWorkspace } = useWorkspace();

  // Component state
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<AIResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<{ query: string; responseText: string }[]>([]);
  const [isClassifySuccess, setIsClassifySuccess] = useState<string | null>(null);

  // Trigger default summary assistant check on load
  useEffect(() => {
    executeAgentQuery("Run corporate financial summary, forecast, health, and retrieve recent ledger details in Malaysia Ringgit (MYR).");
  }, [activeWorkspace?.id]);

  const executeAgentQuery = async (queryText: string) => {
    if (!queryText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      // Package workspace context to feed into secured backend
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
          financialContext
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP exception response state: ${res.status}`);
      }

      const data = await res.json();
      setResponse(data);
      if (queryText !== "Run corporate financial summary, forecast, health, and retrieve recent ledger details in Malaysia Ringgit (MYR).") {
        setChatHistory(prev => [...prev, { query: queryText, responseText: data.text }]);
      }
    } catch (err: any) {
      console.error(err);
      setError("Failed to coordinate response with corporate AI model service. Please check connections.");
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

  // AI Suggests -> User Confirms -> AI Learns
  const handleConfirmSuggestion = async (sug: AISuggestion) => {
    try {
      // 1. Learn the pattern in the core Context
      learnOcrPattern({
        vendorName: sug.payload.vendorName,
        categoryName: sug.payload.category,
        recordType: sug.payload.recordType as "INCOME" | "EXPENSE"
      });

      // 2. Audit-Log the confirmation sequence manually
      await writeAuditLog({
        workspaceId: activeWorkspace?.id,
        module: "Financial Records",
        action: "UPDATE",
        oldValue: { action: "PROPOSED_AI_CATEGORIZATION" },
        newValue: {
          vendorName: sug.payload.vendorName,
          confirmedCategory: sug.payload.category,
          confirmedType: sug.payload.recordType,
          confidenceScoreLearned: sug.payload.confidenceScore,
          learningMode: "CONFIRMED_BY_USER_ADVISORY"
        }
      });

      // 3. Inform user of success state
      setIsClassifySuccess(sug.payload.vendorName);
      setTimeout(() => setIsClassifySuccess(null), 4000);

      // 4. Remove suggestion from visual list dynamically
      if (response) {
        setResponse({
          ...response,
          suggestions: response.suggestions.filter(s => s.id !== sug.id)
        });
      }
    } catch (err: any) {
      console.error("Failed to commit learned action: ", err);
    }
  };

  const getHealthBadgeColor = (status?: string) => {
    switch (status) {
      case "EXCELLENT":
        return "bg-emerald-50 text-emerald-700 border-emerald-200/80";
      case "STABLE":
        return "bg-indigo-50 text-indigo-700 border-indigo-200/80";
      case "WARNING":
        return "bg-amber-50 text-amber-700 border-amber-200/80";
      case "THREAT":
        return "bg-rose-50 text-rose-700 border-rose-250/80";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  // Find linked entities from database to display visual references in the AI box
  const linkedEvents = response?.linkedRecordIds
    ? financialEvents.filter(e => response.linkedRecordIds.includes(e.id))
    : [];

  const linkedDocs = response?.linkedEvidenceIds
    ? financialEvidencePackages.filter(d => response.linkedEvidenceIds.includes(d.id))
    : [];

  return (
    <div className="space-y-6" id="ai_assistant_desk">
      {/* Top Banner Overview */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-900 text-white p-6 rounded-2xl shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none"></div>
        <div className="flex items-center space-x-3.5 z-10">
          <div className="p-3 bg-indigo-600 text-white rounded-xl shadow-md">
            <Brain className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-xl font-display font-semibold tracking-tight">AI Corporate Co-Pilot Desk</h2>
            <p className="text-xs text-slate-300 font-sans mt-0.5 max-w-lg leading-relaxed">
              Prudent financial analysis and evidence linkage. AI proposes cognitive suggestions, you review, audit trail captures confirmations, and MYKERANI learns.
            </p>
          </div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-right shrink-0 z-10">
          <span className="text-[10px] text-slate-400 block font-mono">ADVISORY MODE STATUS</span>
          <span className="inline-flex items-center text-emerald-400 text-xs font-mono font-bold mt-0.5">
            <ShieldCheck className="w-3.5 h-3.5 mr-1" /> ACTIVE HANDSHAKE
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive Chat and Cognitive Matches */}
        <div className="lg:col-span-8 space-y-6">
          {/* Main Interaction Screen */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-xs flex flex-col h-[520px] justify-between">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-xs font-mono text-indigo-600 font-semibold flex items-center">
                <Sparkles className="w-3.5 h-3.5 mr-1.5" /> COGNITIVE COMPILER WORKSPACE
              </span>
              <button
                onClick={() => executeAgentQuery("Run corporate financial summary, forecast, health, and retrieve recent ledger details in Malaysia Ringgit (MYR).")}
                className="p-1 px-2 hover:bg-slate-50 border border-slate-100 rounded-lg transition text-[10px] font-mono font-bold text-slate-500 cursor-pointer flex items-center"
                title="Reload AI health diagnostic summary"
              >
                <RefreshCw className="w-3 h-3 mr-1" /> Reset view
              </button>
            </div>

            {/* Answer body scrolling */}
            <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1 font-sans text-sm text-slate-700 leading-relaxed scrollbar-thin">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-3.5">
                  <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
                  <p className="text-xs text-slate-400 font-mono">Gathering raw ledger coordinates... Invoking Gemini 3.5 Flash</p>
                </div>
              ) : response ? (
                <div className="space-y-6">
                  {/* Natural Language Markdown Block */}
                  <div className="markdown-body p-4 bg-slate-50 rounded-xl border border-slate-250/30 whitespace-pre-wrap leading-relaxed text-slate-800">
                    {response.text}
                  </div>

                  {/* Highlights Visual Meter Dashboard inside context response */}
                  {response.highlights && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-slate-100 pt-4">
                      <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-25/50">
                        <span className="text-[10px] font-mono text-slate-400 block uppercase">Workspace Health</span>
                        <div className="flex items-center space-x-2 mt-1">
                          <span className={`px-2 py-0.5 border text-[10px] font-mono font-bold rounded-full ${getHealthBadgeColor(response.highlights.healthStatus)}`}>
                            {response.highlights.healthStatus}
                          </span>
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-25/50">
                        <span className="text-[10px] font-mono text-slate-400 block uppercase">Est. Buffer Runway</span>
                        <span className="font-display font-semibold text-slate-900 text-lg block mt-0.5">
                          {response.highlights.estimatedRunwayDays} days
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-25/50">
                        <span className="text-[10px] font-mono text-slate-400 block uppercase">Efficiency Score</span>
                        <span className="font-display font-semibold text-slate-900 text-lg block mt-0.5">
                          {response.highlights.capitalEfficiencyScore}%
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Critical Warning Alert banner */}
                  {response.highlights?.criticalActionRequired && response.highlights.criticalActionRequired !== "None" && response.highlights.criticalActionRequired !== "Maintain standard workspace auditing loops." && (
                    <div className="p-3 bg-rose-50 border border-rose-100 text-xs text-rose-700 rounded-xl flex items-start space-x-2.5">
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-bold">Strategic advisory alert:</span> {response.highlights.criticalActionRequired}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-24 text-slate-400">
                  <HelpCircle className="w-12 h-12 mx-auto text-slate-200 mb-2" />
                  <p className="text-sm">Initiate assistant check above or search sandbox metrics.</p>
                </div>
              )}
            </div>

            {/* Input Bar and prompt helpers */}
            <div className="border-t border-slate-100 pt-3">
              {/* Quick suggestion prompt chips */}
              <div className="flex flex-wrap gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => executeAgentQuery("Explain cashflow forecast buffer runway and average operational monthly burn rates.")}
                  className="bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg p-1.5 px-2.5 text-[10px] font-mono transition cursor-pointer"
                  disabled={loading}
                >
                  📈 Runway explanation
                </button>
                <button
                  type="button"
                  onClick={() => executeAgentQuery("Retrieve maybank statements evidence attachments.")}
                  className="bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg p-1.5 px-2.5 text-[10px] font-mono transition cursor-pointer"
                  disabled={loading}
                >
                  📂 Retrieve Maybank evidence
                </button>
                <button
                  type="button"
                  onClick={() => executeAgentQuery("Run workspace ledger health and diagnostics check.")}
                  className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg p-1.5 px-2.5 text-[10px] font-mono transition font-bold cursor-pointer"
                  disabled={loading}
                >
                  🩺 Financial health diagnostic
                </button>
              </div>

              {/* Chat Form */}
              <form onSubmit={handleFormSubmit} className="flex gap-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ask financial question, retrieve support files, or search sandbox ledger..."
                  className="flex-1 px-4 py-2.5 text-xs bg-slate-50 hover:bg-white border border-slate-200 outline-none focus:bg-white focus:border-indigo-600 rounded-xl transition"
                  disabled={loading}
                  required
                />
                <button
                  type="submit"
                  disabled={loading || !query.trim()}
                  className="bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-xl p-2 px-4 transition flex items-center justify-center text-xs font-semibold shrink-0 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5 mr-1" /> Send query
                </button>
              </form>
            </div>
          </div>

          {/* Linked Records & Evidence packages found under query */}
          {(linkedEvents.length > 0 || linkedDocs.length > 0) && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-xs space-y-4">
              <h3 className="font-display font-semibold text-slate-900 text-sm flex items-center">
                <Layers className="w-4 h-4 mr-1.5 text-indigo-500" /> Matches Found ({linkedEvents.length + linkedDocs.length} items linked)
              </h3>

              {/* Verified linked ledger records */}
              {linkedEvents.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[10px] font-mono text-slate-400 block uppercase">LEDGER MATCHES:</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {linkedEvents.map(ev => (
                      <div key={ev.id} className="p-3 rounded-xl border border-indigo-100 bg-indigo-50/20 text-xs text-slate-700 flex justify-between items-center">
                        <div className="truncate pr-4">
                          <p className="font-semibold text-slate-900 truncate">{ev.partyName}</p>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">{ev.categoryName} • {ev.date}</p>
                        </div>
                        <span className={`font-mono font-bold shrink-0 ${ev.type === "INCOME" || ev.type === "RECEIVABLE" ? "text-emerald-600" : "text-rose-600"}`}>
                          {ev.type === "INCOME" || ev.type === "RECEIVABLE" ? "+" : "-"} RM {ev.amountMyr.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Verified linked evidence documents */}
              {linkedDocs.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <span className="text-[10px] font-mono text-slate-400 block uppercase">SUPPORT EVIDENCE PACKAGES:</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {linkedDocs.map(doc => (
                      <div key={doc.id} className="p-3 rounded-xl border border-rose-100 bg-rose-50/20 text-xs text-slate-700 flex justify-between items-center">
                        <div className="truncate pr-3 flex items-center space-x-2">
                          <Paperclip className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <div className="truncate">
                            <p className="font-mono font-bold text-slate-800 truncate">{doc.fileName}</p>
                            <p className="text-[9px] text-slate-400 font-mono uppercase mt-0.5">{doc.documentType}</p>
                          </div>
                        </div>
                        <span className="text-[9px] font-mono font-semibold bg-white border border-rose-250/20 px-1.5 py-0.5 rounded text-rose-700 truncate">
                          ID: {doc.id.substring(0,8)}...
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: AI Suggestions Panel */}
        <div className="lg:col-span-4 space-y-6">
          {/* Proactive Cognitive suggestions card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-5">
            <div>
              <div className="inline-flex items-center space-x-1 p-1 px-2.5 rounded-full bg-indigo-50 border border-indigo-100 text-[10px] text-indigo-700 font-mono font-bold uppercase mb-2">
                <Zap className="w-3 h-3 animate-pulse" />
                <span>AI Suggestion Engine</span>
              </div>
              <h3 className="font-display font-semibold text-slate-900 text-base">Advisory Sandbox Actions</h3>
              <p className="text-xs text-slate-500 leading-relaxed font-sans mt-0.5">
                The co-pilot parses records dynamically to highlight classification and categorization workflows for your confirmation.
              </p>
            </div>

            {/* Success toast inside suggestions box */}
            {isClassifySuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-800 flex items-center space-x-2 font-medium">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>Confirmed structure! Mapping learned for "{isClassifySuccess}"!</span>
              </div>
            )}

            {/* Suggestions list mapping */}
            <div className="space-y-3.5">
              {response?.suggestions && response.suggestions.length > 0 ? (
                response.suggestions.map((sug) => (
                  <div key={sug.id} className="p-4 rounded-xl border border-slate-200 bg-slate-25/50 hover:bg-white space-y-3 transition group">
                    <div>
                      <h4 className="font-sans font-semibold text-slate-900 text-xs">
                        {sug.title}
                      </h4>
                      <p className="text-[11px] text-slate-500 font-sans leading-relaxed mt-1">
                        {sug.description}
                      </p>
                    </div>

                    {/* Metadata tags */}
                    <div className="bg-slate-50 border border-slate-100 p-2 rounded-lg text-[10px] font-mono text-slate-600 space-y-0.5">
                      <p>Vendor: <span className="font-bold text-slate-800">{sug.payload.vendorName}</span></p>
                      <p>Mapped Category: <span className="font-bold text-slate-800">{sug.payload.category}</span></p>
                      <p>Type: <span className="font-bold text-slate-800">{sug.payload.recordType}</span></p>
                      <p>Confidence: <span className="font-bold text-emerald-600">{Math.round(sug.payload.confidenceScore * 100)}%</span></p>
                    </div>

                    <button
                      onClick={() => handleConfirmSuggestion(sug)}
                      type="button"
                      className="w-full py-2 bg-indigo-600 hover:bg-slate-900 text-white rounded-lg text-[11px] font-semibold transition cursor-pointer flex items-center justify-center space-x-1"
                    >
                      <span>Confirm Classification Pattern</span>
                      <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-0.5 transition" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 bg-slate-25/40 border border-dashed border-slate-200 rounded-xl text-slate-400 p-4">
                  <ShieldCheck className="w-8 h-8 text-slate-200 mx-auto mb-1.5" />
                  <p className="text-[11px] font-mono leading-relaxed">No outstanding vendor categorization patterns to classify in this active workspace.</p>
                </div>
              )}
            </div>
          </div>

          {/* Quick reference guide info card */}
          <div className="bg-slate-5 border border-slate-200 rounded-2xl p-5 text-xs text-slate-600 space-y-3.5">
            <h4 className="font-mono font-bold text-slate-900 uppercase">AI Safety & Integrity Guard</h4>
            <div className="space-y-2.5 font-sans leading-relaxed">
              <p>
                🔒 **Secured Full-Stack Proxy:** All Gemini API request operations run server-side over local environment secrets. Credentials are never leaked to browsers.
              </p>
              <p>
                🛡️ **RLS Verification Handshake:** Every request payload matches only records verified for your active isolation workspace. Cross-workspace leakages are impossible.
              </p>
              <p>
                🧠 **User Confirms, AI Learns:** System behaves purely advisorially. AI cannot manipulate ledger balances without your hand-reviewed audit confirmation logic.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
