import React, { useState } from "react";
import { useFinancials } from "../context/FinancialRecordsContext";
import { useAudit } from "../context/AuditContext";
import { type DashboardSummary } from "../lib/financialService";
import { type UserSessionProfile, type Tenant, type Workspace, type TenantCategory } from "../types";
import {
  Home,
  Lightbulb,
  Folder,
  Settings,
  Check,
  LayoutGrid,
  Database,
  Terminal,
  ShieldAlert,
  Server,
  RefreshCw,
  FolderLock,
  FileSpreadsheet,
  AlertTriangle,
  X,
  Plus,
  Play,
  ArrowRight,
  ShieldCheck,
  Cpu,
  KeyRound,
  FileCode
} from "lucide-react";

import { AIFinancialAssistant } from "./AIFinancialAssistant";
import { FinancialReportsAnalytics } from "./FinancialReportsAnalytics";
import { FinancialEvidencePackageManager } from "./FinancialEvidencePackage";
import { FinancialRecordsConsole } from "./FinancialRecordsConsole";

interface MyKeraniAppTabsProps {
  user: UserSessionProfile | null;
  activeTenant: Tenant | null;
  activeWorkspace: Workspace | null;
  tenants: Tenant[];
  workspaces: Workspace[];
  selectWorkspace: (id: string) => void;
  diagnostics: any;
  runDiagnosticCheck: () => void;
  testing: boolean;
  dbPassword: string;
  setDbPassword: (val: string) => void;
  serverStatus: any;
  fetchDbStatus: (pass?: string) => void;
  statusLoading: boolean;
  initializedLogs: string[];
  initializing: boolean;
  handleInitializeDb: () => void;
  verificationResult: any;
  handleVerifyDb: (pass?: string) => void;
  verifyLoading: boolean;
  isMockUser: boolean;
  toggleBypassAuth: (val: boolean) => void;
  getCategoryBadgeColor: (category?: TenantCategory) => string;
  dashboardSummary: DashboardSummary | null;
  summaryLoading: boolean;
}

export const MyKeraniAppTabs: React.FC<MyKeraniAppTabsProps> = ({
  user,
  activeTenant,
  activeWorkspace,
  tenants,
  workspaces,
  selectWorkspace,
  diagnostics,
  runDiagnosticCheck,
  testing,
  dbPassword,
  setDbPassword,
  serverStatus,
  fetchDbStatus,
  statusLoading,
  initializedLogs,
  initializing,
  handleInitializeDb,
  verificationResult,
  handleVerifyDb,
  verifyLoading,
  isMockUser,
  toggleBypassAuth,
  getCategoryBadgeColor,
  dashboardSummary,
  summaryLoading,
}) => {
  const [activeNavTab, setActiveNavTab] = useState<"mykerani" | "insights" | "documents" | "more">("mykerani");

  // Simulation upload states
  const [showSimulateUploadModal, setShowSimulateUploadModal] = useState(false);
  const [simulateDocType, setSimulateDocType] = useState<"RECEIPT" | "INVOICE" | "STATEMENT" | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [simulationSuccess, setSimulationSuccess] = useState<string | null>(null);

  const mockUploadOptions = {
    RECEIPT: [
      { name: "Resit Minyak Petronas (Petrol fuel)", vendor: "Petronas Dagangan Bhd", amount: 150.0, category: "Transport & Travel", type: "EXPENSE" },
      { name: "Resit GrabFood Makan Tengah Hari (Staff Lunch)", vendor: "GrabCar Sdn Bhd", amount: 42.50, category: "Meals & Entertainment", type: "EXPENSE" },
    ],
    INVOICE: [
      { name: "Invois Telekomunikasi Maxis Fibre (Monthly)", vendor: "Maxis Broadband Sdn Bhd", amount: 199.0, category: "Utilities & Communications", type: "EXPENSE" },
      { name: "Bil Elektrik Tenaga Nasional Berhad", vendor: "Tenaga Nasional Berhad", amount: 430.0, category: "Utilities & Communications", type: "EXPENSE" },
    ],
    STATEMENT: [
      { name: "Maybank SME Current Account (April 2026 Feed)", vendor: "Malayan Banking Berhad", amount: 84500.0, category: "Asset Bank Reconcile", type: "DEBT" }, // Mapped to general banking
      { name: "CIMB BizSME Account Statement (April 2026 Feed)", vendor: "CIMB Bank Berhad", amount: 32100.0, category: "Asset Bank Reconcile", type: "DEBT" },
    ],
  };

  const { addFinancialEvidencePackage, addFinancialEvent } = useFinancials();
  const { writeAuditLog } = useAudit();

  const handleRunSimulation = async (
    docType: "RECEIPT" | "INVOICE" | "STATEMENT",
    name: string,
    amount: number,
    vendor: string,
    cat: string,
    recType: string
  ) => {
    if (!activeWorkspace) return;
    setSimulating(true);
    setSimulationSuccess(null);

    try {
      // 1. Add to Evidence Package list
      const mockUrl = `/sample-storage/evidence-${Math.floor(Math.random() * 90000 + 10000)}.pdf`;
      const freshPkg = addFinancialEvidencePackage({
        workspaceId: activeWorkspace.id,
        documentType: docType === "RECEIPT" ? "RECEIPT" : docType === "INVOICE" ? "INVOICE" : "STATEMENT",
        uploadDate: new Date().toISOString().split("T")[0],
        fileName: `${name.replace(/\s+/g, "_").toLowerCase()}.pdf`,
        fileUrl: mockUrl,
        relatedRecordType: docType === "STATEMENT" ? undefined : (recType as any),
        notes: `Diproses melalui demo OCR. Kategori: ${cat}.`
      });

      // 2. Also automatically add to standard Financial Ledger Event if it's a receipt or invoice!
      let relatedEvId = "";
      if (docType !== "STATEMENT") {
        const freshEv = addFinancialEvent({
          workspaceId: activeWorkspace.id,
          type: recType as any,
          categoryName: cat,
          categoryCode: "6000",
          amountMyr: amount,
          partyName: vendor,
          date: new Date().toISOString().split("T")[0],
          referenceNumber: `TXN-OCR-${Math.floor(Math.random() * 90000 + 10000)}`,
          description: `Auto-recorded via MyKerani OCR flow. Supporting attachment file: ${freshPkg.fileName}`
        });
        relatedEvId = freshEv.id;
        freshPkg.relatedRecordId = relatedEvId;
      }

      // 3. Write real audit logs
      await writeAuditLog({
        workspaceId: activeWorkspace?.id,
        module: "Financial Evidence Package",
        action: "CREATE",
        oldValue: null,
        newValue: {
          fileName: freshPkg.fileName,
          extractedVendor: vendor,
          extractedAmount: amount,
          extractedCategory: cat,
          ocrConfidence: 0.98,
          simulationResult: "SUCCESS_VERIFIED"
        }
      });

      setSimulationSuccess(`Berjaya memuat naik "${freshPkg.fileName}"! Parameter RM ${amount.toFixed(2)} dimasukkan.`);
    } catch (e) {
      console.error("Simulation failed:", e);
    } finally {
      setSimulating(false);
      setTimeout(() => {
        setShowSimulateUploadModal(false);
        setSimulationSuccess(null);
      }, 2000);
    }
  };

  const triggerUploadSimulator = (type: "RECEIPT" | "INVOICE" | "STATEMENT") => {
    setSimulateDocType(type);
    setShowSimulateUploadModal(true);
  };

  return (
    <div className="space-y-6" id="mykerani_dashboard_routing_shell">
      {/* 💳 MYKERANI TABS BAR DECK (DESKTOP & RESPONSIVE CONTEXT BAR) */}
      <div className="flex flex-col sm:flex-row border border-slate-200 bg-white rounded-2xl p-2 shadow-[0_4px_20px_rgb(0,0,0,0.015)] items-stretch sm:items-center justify-between gap-3" id="consumer_tabs_deck">
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setActiveNavTab("mykerani")}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold rounded-xl transition cursor-pointer select-none ${
              activeNavTab === "mykerani"
                ? "bg-indigo-950 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50"
            }`}
            id="tab_trigger_home"
          >
            <Home className="w-4 h-4" />
            <span>🏠 MyKerani</span>
          </button>
          <button
            onClick={() => setActiveNavTab("insights")}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold rounded-xl transition cursor-pointer select-none ${
              activeNavTab === "insights"
                ? "bg-indigo-950 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50"
            }`}
            id="tab_trigger_insights"
          >
            <Lightbulb className="w-4 h-4" />
            <span>💡 Insights</span>
          </button>
          <button
            onClick={() => setActiveNavTab("documents")}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold rounded-xl transition cursor-pointer select-none ${
              activeNavTab === "documents"
                ? "bg-indigo-950 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50"
            }`}
            id="tab_trigger_documents"
          >
            <Folder className="w-4 h-4" />
            <span>📂 Documents</span>
          </button>
          <button
            onClick={() => setActiveNavTab("more")}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold rounded-xl transition cursor-pointer select-none ${
              activeNavTab === "more"
                ? "bg-indigo-950 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50"
            }`}
            id="tab_trigger_more"
          >
            <Settings className="w-4 h-4" />
            <span>⚙️ More</span>
          </button>
        </div>

        <div className="text-right px-2 hidden md:block">
          <span className="text-xs font-sans font-bold text-slate-500">
            Syarikat: <span className="text-indigo-900 font-extrabold">{activeWorkspace?.name || "Belum dipilih"}</span>
          </span>
        </div>
      </div>

      {/* 🚀 ACTIVE TAB CONTENT AREA */}
      <div className="min-h-[400px]" id="current_tab_render_area">
        {/* TAB 1: 🏠 MYKERANI (PRIMARY CONV) */}
        {activeNavTab === "mykerani" && (
          <div className="space-y-6" id="mykerani_home_tab_pane">
            {/* Conversation Interface */}
            {activeWorkspace ? (
              <AIFinancialAssistant onTriggerUpload={triggerUploadSimulator} />
            ) : (
              <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-4 shadow-sm" id="tab_active_ws_lock">
                <FolderLock className="w-12 h-12 text-amber-500 mx-auto animate-pulse" />
                <h3 className="font-display font-semibold text-slate-900 text-lg">Pilih Syarikat Anda</h3>
                <p className="text-sm text-slate-500 max-w-sm mx-auto">
                  Sila pilih syarikat dalam tab <strong>More</strong> untuk mula berbual dengan Kerani AI anda.
                </p>
                <button
                  onClick={() => setActiveNavTab("more")}
                  className="px-5 py-2.5 bg-indigo-950 text-white rounded-xl text-xs font-semibold hover:bg-slate-900 transition cursor-pointer shadow-md"
                >
                  Pilih Syarikat →
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: 💡 INSIGHTS (CHARTS AND INTERACTIVE INTUITIVE SUMMARIES) */}
        {activeNavTab === "insights" && (
          <div className="space-y-6 animate-fade-in" id="insights_tab_pane">
            {activeWorkspace ? (
              <FinancialReportsAnalytics />
            ) : (
              <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-4 shadow-sm">
                <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto animate-pulse" />
                <h3 className="font-display font-semibold text-slate-900 text-lg">Laporan Belum Tersedia</h3>
                <p className="text-sm text-slate-500 max-w-sm mx-auto">
                  Pilih syarikat dalam tab <strong>More</strong> dahulu untuk melihat laporan kewangan anda.
                </p>
                <button
                  onClick={() => setActiveNavTab("more")}
                  className="px-5 py-2.5 bg-indigo-950 text-white rounded-xl text-xs font-semibold hover:bg-slate-900 transition cursor-pointer shadow-md"
                >
                  Pilih Syarikat →
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: 📂 DOCUMENTS (EVIDENCE FILES STORAGE AND OCR ATTACHMENTS MANAGER) */}
        {activeNavTab === "documents" && (
          <div className="space-y-6 animate-fade-in" id="documents_tab_pane">
            {activeWorkspace ? (
              <FinancialEvidencePackageManager />
            ) : (
              <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-4 shadow-sm">
                <Folder className="w-12 h-12 text-amber-500 mx-auto animate-pulse" />
                <h3 className="font-display font-semibold text-slate-900 text-lg">Dokumen Belum Dipilih</h3>
                <p className="text-sm text-slate-500 max-w-sm mx-auto">
                  Pilih syarikat dalam tab <strong>More</strong> untuk melihat resit, invois, dan penyata bank anda.
                </p>
                <button
                  onClick={() => setActiveNavTab("more")}
                  className="px-5 py-2.5 bg-indigo-950 text-white rounded-xl text-xs font-semibold hover:bg-slate-900 transition cursor-pointer shadow-md"
                >
                  Pilih Syarikat →
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: ⚙️ MORE */}
        {activeNavTab === "more" && (
          <div className="space-y-8 animate-fade-in" id="more_tab_pane">

            {/* REKOD TRANSAKSI */}
            {activeWorkspace && (
              <div className="space-y-4" id="modular_records_console">
                <div className="pb-2 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <FileSpreadsheet className="w-4 h-4 text-slate-400" />
                    <span className="text-xs font-bold uppercase text-slate-700">Rekod Transaksi</span>
                  </div>
                </div>
                <FinancialRecordsConsole supabaseSummary={dashboardSummary} summaryLoading={summaryLoading} />
              </div>
            )}


          </div>
        )}
      </div>

      {/* 🔮 INTERACTIVE MODAL CHOOSE/EXTRACT SIMULATION DRAWERS */}
      {showSimulateUploadModal && simulateDocType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs select-none" id="ocr_sim_overlay">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl space-y-5 animate-fade-in" id="ocr_sim_card">
            
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <span className="text-xl">
                  {simulateDocType === "RECEIPT" ? "🧾" : simulateDocType === "INVOICE" ? "📄" : "🏦"}
                </span>
                <h3 className="font-display font-bold text-slate-900 text-sm">
                  Muat Naik Contoh {simulateDocType === "RECEIPT" ? "Resit Belanja" : simulateDocType === "INVOICE" ? "Invois PDF" : "Penyata Bank"}
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowSimulateUploadModal(false);
                  setSimulationSuccess(null);
                }}
                className="text-slate-400 hover:text-slate-650 p-1 rounded-full hover:bg-slate-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {simulationSuccess ? (
              <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-center space-y-3 py-6" id="sim_sucess_view">
                <Check className="w-10 h-10 text-emerald-600 mx-auto bg-white p-2 border border-emerald-250 rounded-full animate-bounce" />
                <h4 className="font-sans font-bold text-xs text-emerald-800">Pemprosesan OCR Selesai!</h4>
                <p className="text-xs text-slate-600 leading-relaxed max-w-xs mx-auto">
                  {simulationSuccess} Maklumat lejar dicatat secara automatik, dan baki serta rundingan aliran tunai telah dikemaskinikan mengikut standard MYR.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-slate-500 leading-relaxed font-sans">
                  Sila pilih contoh fail perniagaan Malaysia di bawah untuk mencerapi ujian memuat naik dokumen serta pencerapan OCR Kerani AI:
                </p>

                <div className="space-y-2.5">
                  {mockUploadOptions[simulateDocType].map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() =>
                        handleRunSimulation(
                          simulateDocType,
                          item.name,
                          item.amount,
                          item.vendor,
                          item.category,
                          item.type
                        )
                      }
                      disabled={simulating}
                      className="w-full text-left p-4 bg-slate-50 border border-slate-200/80 hover:border-indigo-600 hover:bg-indigo-50/10 rounded-2xl transition cursor-pointer select-none group flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div>
                        <h4 className="font-sans font-bold text-xs text-indigo-950 group-hover:text-indigo-600">
                          {item.name}
                        </h4>
                        <p className="text-2xs text-slate-450 font-mono mt-0.5 uppercase tracking-wide">
                          Vendor: {item.vendor} • Cat: {item.category}
                        </p>
                      </div>
                      <span className="font-mono font-bold text-xs text-slate-800 bg-white border border-slate-200 px-2 py-1 rounded-lg">
                        {simulateDocType === "STATEMENT" ? "Bal Feed" : `RM ${item.amount.toFixed(2)}`}
                      </span>
                    </button>
                  ))}
                </div>

                {simulating && (
                  <div className="flex flex-col items-center justify-center space-y-2 py-4" id="sim_loading_state">
                    <RefreshCw className="w-5 h-5 text-indigo-600 animate-spin" />
                    <p className="text-2xs text-slate-450 font-mono tracking-wide uppercase">Membaca format PDF, mencerapi zon imej lejar...</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};