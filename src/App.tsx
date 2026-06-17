import React, { useState, useEffect, lazy, Suspense } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { TenantProvider, useTenant } from "./context/TenantContext";
import { WorkspaceProvider, useWorkspace } from "./context/WorkspaceContext";
import { PermissionProvider } from "./context/PermissionContext";
import { AuditProvider, useAudit } from "./context/AuditContext";
import { StorageProvider } from "./context/StorageContext";
import { NotificationProvider } from "./context/NotificationContext";
import { Guard } from "./components/Guard";
import { Loader2 } from "lucide-react";

// Lazy-load screens to isolate their module initialization into separate chunks,
// preventing TDZ errors from complex packages (motion, supabase realtime, etc.)
const HQConsoleShell = lazy(() => import("./components/HQConsoleShell").then(m => ({ default: m.HQConsoleShell })));
const MyKeraniAppTabs = lazy(() => import("./components/MyKeraniAppTabs").then(m => ({ default: m.MyKeraniAppTabs })));
const StaffHomeScreen = lazy(() => import("./screens/StaffHomeScreen").then(m => ({ default: m.StaffHomeScreen })));
const OwnerDashboard = lazy(() => import("./screens/OwnerDashboard").then(m => ({ default: m.OwnerDashboard })));

function LazyFallback() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
    </div>
  );
}
import { FinancialRecordsProvider, useFinancials } from "./context/FinancialRecordsContext";
import { testSupabaseConnection, type SupabaseDiagnostics } from "./lib/supabase";
import { getDashboardSummary, type DashboardSummary } from "./lib/financialService";
import { type TenantCategory } from "./types";
import {
  isDemoWorkspace,
  getDemoWorkspaceData,
  resetDemoWorkspaceData,
  createDemoRecord,
  PERMANENT_DEMO_TENANT_ID,
  type DemoFinancialRecord,
} from "./lib/seeder";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Terminal,
  Database,
  User,
  LogOut,
  ShieldAlert,
  Server,
  Zap,
  Building,
  Plus,
  Compass,
  Check,
  Cpu,
  Activity,
  Layers,
  LayoutGrid,
  FileCode,
  FolderLock,
  ChevronRight,
  Globe,
  KeyRound,
  TrendingUp,
  Receipt,
  FileSpreadsheet,
  ShieldCheck,
  Home,
  Lightbulb,
  Folder,
  Settings,
} from "lucide-react";

function MainDashboardContent() {
  const { user, signOut, isMockUser, toggleBypassAuth } = useAuth();
  const [activeNavTab, setActiveNavTab] = useState<"mykerani" | "insights" | "documents" | "more">("mykerani");
  const { tenants, activeTenant, selectTenant, createTenant, error: tenantError } = useTenant();
  const {
    workspaces,
    activeWorkspace,
    selectWorkspace,
    createWorkspace,
    error: workspaceError,
    getWorkspaceHeaders,
  } = useWorkspace();

  const [diagnostics, setDiagnostics] = useState<SupabaseDiagnostics | null>(null);
  const [testing, setTesting] = useState(false);

  // DB Setup & Migration states
  const [dbPassword, setDbPassword] = useState("");
  const [serverStatus, setServerStatus] = useState<any>(null);
  const [initializedLogs, setInitializedLogs] = useState<string[]>([]);
  const [initializing, setInitializing] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);

  const handleVerifyDb = async (pass = dbPassword) => {
    setVerifyLoading(true);
    try {
      const res = await fetch("/api/admin/db/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dbPassword: pass }),
      });
      const data = await res.json();
      setVerificationResult(data);
    } catch (err) {
      console.error("Verification sequence failed: ", err);
    } finally {
      setVerifyLoading(false);
    }
  };

  const fetchDbStatus = async (pass = dbPassword) => {
    setStatusLoading(true);
    try {
      const res = await fetch("/api/admin/db/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dbPassword: pass }),
      });
      const data = await res.json();
      setServerStatus(data);
      if (data.connectionSuccess) {
        await handleVerifyDb(pass);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setStatusLoading(false);
    }
  };

  const handleInitializeDb = async () => {
    setInitializing(true);
    setInitializedLogs([]);
    try {
      const res = await fetch("/api/admin/db/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dbPassword }),
      });
      const data = await res.json();
      if (data.logs) {
        setInitializedLogs(data.logs);
      }
      await fetchDbStatus();
    } catch (err) {
      console.error(err);
      setInitializedLogs(prev => [...prev, `❌ Connection error occurred: ${String(err)}`]);
    } finally {
      setInitializing(false);
    }
  };

  // Form states to create custom organizational tenants
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTenantName, setNewTenantName] = useState("");
  const [newTenantCategory, setNewTenantCategory] = useState<TenantCategory>("USER");
  const [createLoading, setCreateLoading] = useState(false);
  const [createSuccessMsg, setCreateSuccessMsg] = useState("");

  // Form states to create custom workspaces
  const [showCreateWSForm, setShowCreateWSForm] = useState(false);
  const [newWSName, setNewWSName] = useState("");
  const [createWSLoading, setCreateWSLoading] = useState(false);
  const [createWSSuccessMsg, setCreateWSSuccessMsg] = useState("");

  // --- Task 6 Demo Seeding & Resetting State ---
  const [demoRecords, setDemoRecords] = useState<DemoFinancialRecord[]>([]);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [showAddDemoRecordForm, setShowAddDemoRecordForm] = useState(false);
  const [demoResetMsg, setDemoResetMsg] = useState("");

  // Custom Demo Record Form State
  const [demoType, setDemoType] = useState<"INCOME" | "EXPENSE" | "RECEIVABLE" | "PAYABLE">("INCOME");
  const [demoCategoryName, setDemoCategoryName] = useState("");
  const [demoCategoryCode, setDemoCategoryCode] = useState("");
  const [demoAmount, setDemoAmount] = useState("");
  const [demoPartyName, setDemoPartyName] = useState("");
  const [demoDescription, setDemoDescription] = useState("");

  useEffect(() => {
    if (activeWorkspace) {
      const records = getDemoWorkspaceData(activeWorkspace.id);
      setDemoRecords(records);
      setDemoResetMsg("");

      if (isDemoWorkspace(activeWorkspace.id)) {
        // Demo workspace IDs are not real UUIDs — skip the Supabase query entirely.
        setDashboardSummary(null);
        setSummaryLoading(false);
      } else {
        setSummaryLoading(true);
        getDashboardSummary(activeWorkspace.id).then(result => {
          if (result.data) setDashboardSummary(result.data);
          setSummaryLoading(false);
        });
      }
    } else {
      setDemoRecords([]);
      setDashboardSummary(null);
    }
  }, [activeWorkspace]);

  const handleResetDemoFinancialHistory = () => {
    if (!activeWorkspace) return;
    try {
      const pristine = resetDemoWorkspaceData(activeWorkspace.id);
      setDemoRecords(pristine);
      setDemoResetMsg(`Successfully reset "${activeWorkspace.name}" simulation data to pristine sales presentation benchmarks!`);
      setTimeout(() => setDemoResetMsg(""), 5000);
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleAddDemoRecordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace) return;
    if (!demoCategoryName || !demoAmount || !demoPartyName) return;

    try {
      const newRec = createDemoRecord({
        workspaceId: activeWorkspace.id,
        type: demoType,
        categoryName: demoCategoryName,
        categoryCode: demoCategoryCode || "9999",
        amountMyr: parseFloat(demoAmount),
        partyName: demoPartyName,
        date: new Date().toISOString().split("T")[0],
        referenceNumber: `TXN-DEMO-${Math.floor(Math.random() * 100000)}`,
        description: demoDescription || "Custom manual entry during sales interactive presentation."
      });

      setDemoRecords(prev => [...prev, newRec]);
      setDemoCategoryName("");
      setDemoCategoryCode("");
      setDemoAmount("");
      setDemoPartyName("");
      setDemoDescription("");
      setShowAddDemoRecordForm(false);
    } catch (err: any) {
      console.error(err);
    }
  };

  const runDiagnosticCheck = async () => {
    setTesting(true);
    const results = await testSupabaseConnection();
    setDiagnostics(results);
    await fetchDbStatus();
    setTesting(false);
  };

  useEffect(() => {
    runDiagnosticCheck();
  }, []);

  const handleCreateTenantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTenantName.trim()) return;

    setCreateLoading(true);
    setCreateSuccessMsg("");
    try {
      const created = await createTenant(newTenantName, newTenantCategory);
      setNewTenantName("");
      setShowCreateForm(false);
      setCreateSuccessMsg(`Successfully registered organizational entity "${created.name}"!`);
      selectTenant(created.id);
    } catch (err: any) {
      console.error("Failed to generate tenant organization: ", err);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleCreateWSSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWSName.trim()) return;

    setCreateWSLoading(true);
    setCreateWSSuccessMsg("");
    try {
      const created = await createWorkspace(newWSName);
      setNewWSName("");
      setShowCreateWSForm(false);
      setCreateWSSuccessMsg(`Successfully generated Workspace "${created.name}" under ${activeTenant?.name}!`);
      selectWorkspace(created.id);
    } catch (err: any) {
      console.error("Failed to register workspace: ", err);
    } finally {
      setCreateWSLoading(false);
    }
  };

  // Determine current active theme or accents based on active tenant category
  const getCategoryBadgeColor = (category?: TenantCategory) => {
    switch (category) {
      case "HQ":
        return "bg-rose-50 text-rose-700 border-rose-200/60";
      case "DEMO":
        return "bg-amber-50 text-amber-700 border-amber-200/60";
      default:
        return "bg-indigo-50 text-indigo-700 border-indigo-200/60";
    }
  };

  const preparedHeaders = getWorkspaceHeaders();

  // --- MYKERANI V1.0 - OCR & File Upload Interactive Simulation ---
  const [showSimulateUploadModal, setShowSimulateUploadModal] = useState(false);
  const [simulateDocType, setSimulateDocType] = useState<"RECEIPT" | "INVOICE" | "STATEMENT" | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [simulationSuccess, setSimulationSuccess] = useState<string | null>(null);

  const mockUploadOptions = {
    RECEIPT: [
      { name: "Resit Minyak Petronas (Petrol Fuel)", vendor: "Petronas Dagangan Bhd", amount: 150.0, category: "Transport & Travel", type: "EXPENSE" },
      { name: "GrabFood Team Lunch Receipt", vendor: "GrabCar Sdn Bhd", amount: 42.50, category: "Meals & Entertainment", type: "EXPENSE" },
    ],
    INVOICE: [
      { name: "Invois Bulanan Maxis Broadband (Fibre)", vendor: "Maxis Broadband Sdn Bhd", amount: 199.0, category: "Utilities & Communications", type: "EXPENSE" },
      { name: "Bil Elektrik Tenaga Nasional Berhad", vendor: "Tenaga Nasional Berhad", amount: 430.0, category: "Utilities & Communications", type: "EXPENSE" },
    ],
    STATEMENT: [
      { name: "Maybank SME Current Account Statement (April 2026)", vendor: "Malayan Banking Berhad", amount: 84500.0, category: "Asset Bank Reconcile", type: "STATEMENT" },
      { name: "CIMB SME Current Account Statement (April 2026)", vendor: "CIMB Bank Berhad", amount: 32100.0, category: "Asset Bank Reconcile", type: "STATEMENT" },
    ],
  };

  const { addFinancialEvidencePackage, addFinancialEvent } = useFinancials();
  const { writeAuditLog } = useAudit();

  const handleRunSimulation = async (docType: "RECEIPT" | "INVOICE" | "STATEMENT", name: string, amount: number, vendor: string, cat: string, recType: string) => {
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
        fileName: `${name.replace(/\s+/g, '_').toLowerCase()}.pdf`,
        fileUrl: mockUrl,
        relatedRecordType: recType === "STATEMENT" ? undefined : recType,
        notes: `Simulated OCR processing on ${vendor} document. Mapped category: ${cat}.`
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
          description: `Auto-recorded via MyKerani OCR flow. Supporting file: ${freshPkg.fileName}`
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col justify-between" id="dashboard_root">
      
      {/* App Header */}
      <header className="border-b border-slate-200 bg-white px-5 py-3.5 flex items-center justify-between gap-4" id="app_header">
        {/* Logo + Company Name */}
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center text-white font-display font-bold text-base shadow-sm shrink-0">
            MK
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-1.5">
              <h1 className="font-display font-bold text-slate-900 text-base tracking-tight">MYKERANI</h1>
              <span className="text-[9px] font-mono bg-slate-900 text-white px-1.5 py-0.5 rounded-full font-semibold shrink-0">V1.0</span>
            </div>
            {activeWorkspace && (
              <p className="text-[11px] text-slate-500 truncate max-w-[200px]">
                {activeWorkspace.name}
              </p>
            )}
          </div>
        </div>

        {/* Right: Company switcher (owner only) + User + Logout */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Company switcher — hanya untuk owner yang ada lebih 1 syarikat */}
          {!["STAFF", "VIEWER"].includes(user?.role || "") && workspaces.length > 1 && (
            <select
              value={activeWorkspace?.id || ""}
              onChange={(e) => selectWorkspace(e.target.value)}
              className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 outline-none focus:border-slate-900 cursor-pointer text-slate-700 max-w-[150px] hidden sm:block"
              id="company_select_header"
            >
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>{ws.name}</option>
              ))}
            </select>
          )}

          {/* User badge */}
          <div className="bg-slate-100 border border-slate-200 rounded-xl px-3 py-1.5 flex items-center space-x-2">
            <div className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
              {user?.fullName?.charAt(0).toUpperCase() || "?"}
            </div>
            <div className="hidden sm:block">
              <p className="text-[11px] font-semibold text-slate-900 leading-tight">{user?.fullName || "Pengguna"}</p>
              <p className="text-[9px] text-slate-400 leading-none">{
                user?.role === "HQ_OWNER" ? "Pemilik HQ" :
                user?.role === "HQ_STAFF" ? "Kakitangan HQ" :
                user?.role === "TENANT_OWNER" ? "Pemilik Syarikat" :
                user?.role === "TENANT_STAFF" ? "Kakitangan" : "Pengguna"
              }</p>
            </div>
          </div>

          {/* Log keluar */}
          <button
            onClick={() => signOut()}
            className="p-2 bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 rounded-xl transition cursor-pointer"
            title="Log Keluar"
            id="signout_button"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-4xl w-full mx-auto p-6 md:p-8 space-y-6 flex-grow flex flex-col justify-start" id="app_main_content">
        
        {/* Tiada banner teknikal — UI bersih */}

        {/* Tenant/Workspace Error Alerts Handler */}
        {(tenantError || workspaceError) && (
          <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl flex items-start space-x-3 text-xs text-amber-800" id="tenant_error_alert">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{tenantError || workspaceError}</span>
          </div>
        )}

        {/* Daftar Syarikat Baru */}
        {showCreateForm && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-md" id="create_tenant_form_panel">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-medium text-lg text-slate-950 flex items-center">
                <Building className="w-5 h-5 mr-2 text-slate-400" />
                Daftar Syarikat Baru
              </h3>
              <button
                onClick={() => setShowCreateForm(false)}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                Tutup
              </button>
            </div>
            
            <form onSubmit={handleCreateTenantSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-500 uppercase">Nama Syarikat</label>
                  <input
                    type="text"
                    value={newTenantName}
                    onChange={(e) => setNewTenantName(e.target.value)}
                    placeholder="e.g. Apex Engineering Co Ltd"
                    className="w-full px-4 py-2 text-sm bg-slate-50 border border-slate-200 outline-none focus:bg-white focus:border-slate-900 rounded-xl transition"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-500 uppercase">Jenis Akaun</label>
                  <select
                    value={newTenantCategory}
                    onChange={(e) => setNewTenantCategory(e.target.value as TenantCategory)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 outline-none focus:bg-white focus:border-slate-900 rounded-xl cursor-pointer"
                    id="new_tenant_category"
                  >
                    <option value="USER">Syarikat (Akaun Perniagaan)</option>
                    <option value="DEMO">Demo (Akaun Latihan)</option>
                    {user?.role === "HQ_OWNER" && (
                      <option value="HQ">Pentadbiran Sistem (HQ)</option>
                    )}
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 border border-transparent hover:border-slate-200 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition shadow-sm disabled:opacity-50 cursor-pointer"
                  id="submit_create_tenant_btn"
                >
                  {createLoading ? "Mendaftar..." : "Daftar Syarikat"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tambah Akaun Syarikat Baru */}
        {showCreateWSForm && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-md" id="create_workspace_form_panel">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-medium text-lg text-slate-950 flex items-center">
                <Plus className="w-5 h-5 mr-2 text-indigo-500" />
                Tambah Akaun Syarikat
              </h3>
              <button onClick={() => setShowCreateWSForm(false)} className="text-xs text-slate-400 hover:text-slate-600">Tutup</button>
            </div>
            <form onSubmit={handleCreateWSSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase">Nama Syarikat</label>
                <input
                  type="text"
                  value={newWSName}
                  onChange={(e) => setNewWSName(e.target.value)}
                  placeholder="cth: LemonTree Bakery Sdn Bhd"
                  className="w-full px-4 py-2 text-sm bg-slate-50 border border-slate-200 outline-none focus:bg-white focus:border-indigo-600 rounded-xl transition"
                  required
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setShowCreateWSForm(false)} className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 rounded-xl transition cursor-pointer">Batal</button>
                <button type="submit" disabled={createWSLoading} className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow-sm disabled:opacity-50 cursor-pointer" id="submit_create_ws_btn">
                  {createWSLoading ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Success Confirmation alerts */}
        {(createSuccessMsg || createWSSuccessMsg) && (
          <div className="p-4 bg-emerald-50/70 border border-emerald-100 rounded-xl text-xs text-emerald-800 flex items-center space-x-2 font-medium" id="creation_success">
            <Check className="w-4 h-4" />
            <span>{createSuccessMsg || createWSSuccessMsg}</span>
          </div>
        )}
        {(user?.role === "HQ_OWNER" || user?.role === "HQ_STAFF" || activeTenant?.category === "HQ") ? (
          <HQConsoleShell
            tenants={tenants}
            workspaces={workspaces}
            user={user}
            activeWorkspace={activeWorkspace}
          />
        ) : (
          <MyKeraniAppTabs
            user={user}
            activeTenant={activeTenant}
            activeWorkspace={activeWorkspace}
            tenants={tenants}
            workspaces={workspaces}
            selectWorkspace={selectWorkspace}
            diagnostics={diagnostics}
            runDiagnosticCheck={runDiagnosticCheck}
            testing={testing}
            dbPassword={dbPassword}
            setDbPassword={setDbPassword}
            serverStatus={serverStatus}
            fetchDbStatus={fetchDbStatus}
            statusLoading={statusLoading}
            initializedLogs={initializedLogs}
            initializing={initializing}
            handleInitializeDb={handleInitializeDb}
            verificationResult={verificationResult}
            handleVerifyDb={handleVerifyDb}
            verifyLoading={verifyLoading}
            isMockUser={isMockUser}
            toggleBypassAuth={toggleBypassAuth}
            getCategoryBadgeColor={getCategoryBadgeColor}
            dashboardSummary={dashboardSummary}
            summaryLoading={summaryLoading}
          />
        )}

        {/* Developer Diagnostics Hidden */}
        <div className="hidden" id="diagnostic_card">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <div className="flex items-center space-x-2 text-indigo-600 font-mono text-[10px] uppercase font-bold tracking-wider mb-1">
                <Database className="w-3.5 h-3.5" />
                <span>Production Database & Security Handshake</span>
              </div>
              <h3 className="font-display font-semibold text-2xl tracking-tight text-slate-950">
                Supabase Connection & Migrations Center
              </h3>
              <p className="text-xs text-slate-500 font-sans mt-0.5">
                Inspect physical database state, Row Level Security policies, storage buckets, and execute chronological migrations.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchDbStatus()}
                disabled={statusLoading}
                className="inline-flex items-center justify-center px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition cursor-pointer"
              >
                {statusLoading ? (
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                )}
                Query Live Schema Status
              </button>
              <button
                onClick={runDiagnosticCheck}
                disabled={testing}
                className="inline-flex items-center justify-center px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition shadow-sm cursor-pointer"
                id="retry_diagnostics_button"
              >
                {testing ? (
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                )}
                Run Diagnostic Pass
              </button>
            </div>
          </div>

          {/* Core Handshake Metrics Grids */}
          {diagnostics && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-50 border border-slate-200/50 rounded-xl p-4 flex flex-col justify-between">
                <span className="text-[10px] font-mono text-slate-400 block uppercase font-bold">SUPABASE URL</span>
                <p className="text-xs font-mono font-bold text-slate-800 truncate mt-1">
                  {process.env.VITE_SUPABASE_URL || "MISSING"}
                </p>
                <div className="mt-2 text-sm">
                  {diagnostics.isConfigured ? (
                    <span className="inline-flex items-center text-[10px] uppercase font-bold text-emerald-600 font-mono">
                      <Check className="w-3 h-3 mr-1" /> Bound
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-[10px] uppercase font-bold text-amber-600 font-mono">
                      <AlertTriangle className="w-3 h-3 mr-1" /> Unconfigured
                    </span>
                  )}
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200/50 rounded-xl p-4 flex flex-col justify-between">
                <span className="text-[10px] font-mono text-slate-400 block uppercase font-bold">REST HANDSHAKE</span>
                <p className="text-xs font-mono font-bold text-slate-800 mt-1">
                  Anon API Ping
                </p>
                <div className="mt-2 text-sm">
                  {diagnostics.connectionSuccess === true ? (
                    <span className="inline-flex items-center text-[10px] uppercase font-bold text-emerald-600 font-mono">
                      <Check className="w-3 h-3 mr-1" /> Reachable
                    </span>
                  ) : diagnostics.connectionSuccess === false ? (
                    <span className="inline-flex items-center text-[10px] uppercase font-bold text-rose-600 font-mono">
                      <XCircle className="w-3 h-3 mr-1" /> Failed
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-[10px] uppercase font-bold text-slate-400 font-mono animate-pulse">
                      Pending Test
                    </span>
                  )}
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200/50 rounded-xl p-4 flex flex-col justify-between">
                <span className="text-[10px] font-mono text-slate-400 block uppercase font-bold">POSTGRES CLUSTER</span>
                <p className="text-xs font-mono font-bold text-slate-800 mt-1">
                  Direct TCP 5432
                </p>
                <div className="mt-2 text-sm">
                  {serverStatus?.connectionSuccess ? (
                    <span className="inline-flex items-center text-[10px] uppercase font-bold text-emerald-600 font-mono">
                      <Check className="w-3 h-3 mr-1" /> Connected
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-[10px] uppercase font-bold text-slate-500 font-mono">
                      🔑 Credentials Required
                    </span>
                  )}
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200/50 rounded-xl p-4 flex flex-col justify-between">
                <span className="text-[10px] font-mono text-slate-400 block uppercase font-bold">MIGRATION SUCCESS</span>
                <p className="text-xs font-mono font-bold text-slate-800 mt-1">
                  Schema Setup Status
                </p>
                <div className="mt-2 text-sm">
                  {serverStatus?.connectionSuccess ? (
                    serverStatus.migrations.every((m: any) => m.isApplied) && serverStatus.tables.length > 0 ? (
                      <span className="inline-flex items-center text-[10px] uppercase font-bold text-emerald-600 font-mono">
                        <Check className="w-3 h-3 mr-1" /> Initialized
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-[10px] uppercase font-bold text-rose-500 font-mono">
                        ⚠️ Pending Setup ({serverStatus.migrations.filter((m: any) => !m.isApplied).length} files)
                      </span>
                    )
                  ) : (
                    <span className="inline-flex items-center text-[10px] uppercase font-bold text-slate-400 font-mono">
                      Status Unknown
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Postgres Connection Setup Form */}
          {(!serverStatus || !serverStatus.connectionSuccess) && (
            <div className="bg-slate-50/50 border border-slate-200/80 rounded-xl p-5 space-y-3.5">
              <div className="flex items-start space-x-3">
                <KeyRound className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wide text-slate-900 font-mono">
                    Authenticate Direct Postgres SQL Channel
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    To perform live SQL script validations, verify RLS settings, and initialize database tables chronologically in production, enter your Supabase Database Password below.
                  </p>
                </div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  fetchDbStatus();
                }}
                className="flex flex-col sm:flex-row items-stretch gap-2 pt-1"
              >
                <div className="flex-grow">
                  <input
                    type="password"
                    value={dbPassword}
                    onChange={(e) => setDbPassword(e.target.value)}
                    placeholder="Enter Supabase Database Password (stored safely in local memory)"
                    className="w-full px-3.5 py-1.5 text-xs bg-white border border-slate-200 outline-none focus:border-slate-800 rounded-lg transition"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={statusLoading}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 border border-slate-900 hover:border-slate-800 rounded-lg transition cursor-pointer shrink-0 disabled:opacity-50"
                >
                  {statusLoading ? "Connecting..." : "Verify Postgres Handshake"}
                </button>
              </form>

              {serverStatus?.errorMessage && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-rose-700 font-mono text-[10.5px] leading-relaxed">
                  <p className="font-bold">CONNECTION HANDSHAKE ERROR:</p>
                  <pre className="whitespace-pre-wrap mt-1">{serverStatus.errorMessage}</pre>
                </div>
              )}
            </div>
          )}

          {/* Live Migrations & Tables status diagnostics */}
          {serverStatus?.connectionSuccess && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              
              {/* Chronological Migration Scripts Flow */}
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <span className="text-xs font-bold uppercase font-mono text-slate-700 flex items-center">
                    <Server className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                    Chronological SQL Migrations Ledger
                  </span>
                  <span className="text-[9px] font-mono bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 rounded">
                    Order Confirmed
                  </span>
                </div>

                <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                  {serverStatus.migrations.map((m: any, i: number) => (
                    <div key={m.name} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200/60 rounded-xl text-xs font-mono">
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-bold shrink-0">
                          {i + 1}
                        </span>
                        <p className="font-semibold text-slate-800 truncate" title={m.name}>
                          {m.name}
                        </p>
                      </div>
                      <div className="shrink-0 pl-2">
                        {m.isApplied ? (
                          <span className="inline-flex items-center text-[10px] uppercase font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">
                            Verified Applied
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-[10px] uppercase font-bold text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded">
                            Pending Execute
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Database Initialization controller */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-900">Execute Scheme Initialization</p>
                    <span className="text-[9px] font-mono text-amber-600 uppercase font-bold">Auto base schemas</span>
                  </div>
                  <p className="text-[10.5px] text-slate-500 leading-relaxed">
                    This triggers programmatic extraction of all structure layout definitions from <code className="bg-slate-150 px-1 rounded text-slate-800">DATABASE_ARCHITECTURE_V1_2.md</code> followed by execution of all chronological sql scripts listed above.
                  </p>
                  <button
                    onClick={handleInitializeDb}
                    disabled={initializing}
                    className="w-full inline-flex items-center justify-center px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 hover:border-indigo-700 rounded-lg transition duration-150 shadow-sm disabled:opacity-50 cursor-pointer text-center"
                  >
                    {initializing ? (
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Zap className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    {initializing ? "Initializing Database & Building Structures..." : "Execute Full DB Migration Run"}
                  </button>
                </div>
              </div>

              {/* Physical Schema Tables & RLS Status */}
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <span className="text-xs font-bold uppercase font-mono text-slate-700 flex items-center">
                    <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                    Detected RLS Schema Matrices
                  </span>
                  <span className="text-[9px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 rounded">
                    {serverStatus.tables.length} Tables Connected
                  </span>
                </div>

                {serverStatus.tables.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center space-y-2">
                    <AlertTriangle className="w-8 h-8 text-amber-500 animate-pulse" />
                    <p className="text-xs font-bold text-slate-900 font-mono">0 Database Tables Detected</p>
                    <p className="text-[10.5px] text-slate-500 max-w-sm">
                      The database connected successfully, but has not been populated. Run the migrations to install core architecture tables.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                    {serverStatus.tables.map((tbl: string) => (
                      <div key={tbl} className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200/50 rounded-lg text-xs font-mono">
                        <span className="font-semibold text-slate-800">{tbl}</span>
                        <div className="flex items-center space-x-2">
                          <span className={`inline-flex items-center text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                            serverStatus.rlsStatus[tbl] 
                              ? "text-emerald-700 bg-emerald-50 border border-emerald-100"
                              : "text-amber-700 bg-amber-50 border border-amber-100"
                          }`}>
                            RLS: {serverStatus.rlsStatus[tbl] ? "ACTIVE" : "DISABLED"}
                          </span>
                        </div>
                      </div>
                    ))}
                    
                    {/* Storage Bucket info */}
                    <div className="border-t border-slate-200/60 pt-3 mt-3">
                      <p className="text-[11px] uppercase font-mono font-bold text-slate-500 mb-2">Storage Buckets Verified:</p>
                      {serverStatus.buckets.length === 0 ? (
                        <div className="p-3 bg-amber-50 border border-amber-100/50 rounded-lg text-xs text-amber-800 font-mono flex items-center space-x-2">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>No cloud buckets connected. Storage security execution required.</span>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {serverStatus.buckets.map((b: string) => (
                            <span key={b} className="bg-slate-950 text-white font-mono text-[9px] font-bold px-2 py-0.5 rounded-full uppercase">
                              🪣 {b} (Audit Ready)
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TASK 5 & TASK 6: Live Production Database Governance & Remediation Audit */}
          {serverStatus?.connectionSuccess && verificationResult && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm" id="governance_audit_report">
              <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wide text-slate-900 font-mono">
                      Production Database Governance & Remediation Audit
                    </h4>
                    <p className="text-[11px] text-slate-500 font-sans">
                      Constitution V1.0 & Protocol V1.1 Authorized Diagnostics Summary Check
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-mono text-slate-400 block uppercase font-bold">Readiness Score</span>
                  <div className="flex items-baseline space-x-1.5 justify-end">
                    <span className="text-2xl font-display font-semibold text-slate-900">
                      {verificationResult.readinessPct}%
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono font-bold">/ 100%</span>
                  </div>
                </div>
              </div>

              {/* Progress Indicator */}
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full transition-all duration-500 ${
                    verificationResult.readinessPct >= 95 ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                  style={{ width: `${verificationResult.readinessPct}%` }}
                />
              </div>

              {/* Live Status Indicators Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-1">
                {/* Tables compliance */}
                <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-xl space-y-1">
                  <span className="text-[9px] font-mono font-bold text-slate-400 uppercase">Tables Audited</span>
                  <p className="text-xs font-bold text-slate-800">
                    {verificationResult.tablesCreated.length} / {verificationResult.tablesCreated.length + verificationResult.missingTables.length} Active
                  </p>
                  {verificationResult.missingTables.length > 0 ? (
                    <span className="text-[9px] font-mono text-rose-600 font-bold">
                      ⚠️ {verificationResult.missingTables.length} Missing Table(s)
                    </span>
                  ) : (
                    <span className="text-[9px] font-mono text-emerald-600 font-bold flex items-center">
                      <Check className="w-3 h-3 mr-0.5" /> Approved Tables 100% OK
                    </span>
                  )}
                </div>

                {/* RLS Status */}
                <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-xl space-y-1">
                  <span className="text-[9px] font-mono font-bold text-slate-400 uppercase">RLS Status</span>
                  <p className="text-xs font-bold text-slate-800">
                    {Object.values(verificationResult.rlsStatus).filter(v => v === true).length} / {Object.keys(verificationResult.rlsStatus).length} Enabled
                  </p>
                  {Object.values(verificationResult.rlsStatus).some(v => v === false) ? (
                    <span className="text-[9px] font-mono text-amber-600 font-bold">
                      ⚠️ RLS Disabled on some tables
                    </span>
                  ) : (
                    <span className="text-[9px] font-mono text-emerald-600 font-bold flex items-center">
                      <Check className="w-3 h-3 mr-0.5" /> RLS Verified on all
                    </span>
                  )}
                </div>

                {/* Core Write/Rollback Test */}
                <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-xl space-y-1">
                  <span className="text-[9px] font-mono font-bold text-slate-400 uppercase">Data Access Tests</span>
                  <p className="text-xs font-bold text-slate-800">
                    {verificationResult.writeTest === "PASSED (Write OK)" ? "Write: OK" : "Write: FAILED"}
                  </p>
                  <p className="text-[9px] font-mono text-slate-500 truncate">
                    Rollback: {verificationResult.rollbackTest}
                  </p>
                </div>

                {/* Audit & Storage Tests */}
                <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-xl space-y-1">
                  <span className="text-[9px] font-mono font-bold text-slate-400 uppercase">Foundations Tests</span>
                  <p className="text-xs font-bold text-slate-800">
                    Audit: {verificationResult.auditTest.includes("PASSED") ? "PASSED" : "FAILED"}
                  </p>
                  <p className="text-[9px] font-mono text-slate-500 truncate" title={verificationResult.bucketStatus}>
                    Bucket: {verificationResult.bucketStatus}
                  </p>
                </div>
              </div>

              {/* Dynamic Verdict banner */}
              <div className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                verificationResult.readinessPct >= 95 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}>
                <div className="space-y-0.5 font-sans">
                  <p className="text-xs font-bold font-mono tracking-wide">
                    FINAL AUDIT VERDICT: {verificationResult.verdict}
                  </p>
                  <p className="text-[10.5px] opacity-90 leading-relaxed">
                    {verificationResult.readinessPct >= 95 
                      ? "The database governance audit matches and satisfies all requirements set by MYKERANI Constitution V1.0. All core structures, private storage buckets, and row level security configurations are successfully initialized."
                      : "The database governance audit has detected partial compliance (below the target threshold of 95%). Execute Scheme Initialization above to install, migrate, and configure all approved modules."
                    }
                  </p>
                </div>
                <button
                  onClick={() => handleVerifyDb()}
                  disabled={verifyLoading}
                  className="px-4 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition cursor-pointer shrink-0 disabled:opacity-50"
                >
                  {verifyLoading ? "Executing Suite..." : "Re-Run Verifications"}
                </button>
              </div>
            </div>
          )}

          {/* Database Setup terminal console output logs */}
          {initializedLogs.length > 0 && (
            <div className="p-4 bg-slate-900 text-slate-100 rounded-xl font-mono text-xs overflow-x-auto flex flex-col space-y-1.5 border border-slate-800 max-h-[250px] overflow-y-auto" id="sql_log_terminal">
              <div className="flex items-center space-x-2 text-slate-400 font-bold border-b border-slate-800 pb-1.5 mb-1 shrink-0">
                <Terminal className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                <span>MIGRATION ENGINE TERMINAL PIPELINE</span>
              </div>
              {initializedLogs.map((logStr, index) => (
                <div key={index} className="leading-relaxed">
                  {logStr}
                </div>
              ))}
            </div>
          )}

          {/* Diagnostics state errors falling back */}
          {diagnostics?.errorMessage && (
            <div className="mt-6 p-4 bg-slate-900 text-slate-100 rounded-xl font-mono text-xs overflow-x-auto flex items-start space-x-3" id="error_code_block">
              <Terminal className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-400" />
              <div className="flex-1">
                <p className="text-slate-400 font-bold mb-1">CONSOLE DIAGNOSTIC LOG:</p>
                <pre className="whitespace-pre-wrap">{diagnostics.errorMessage}</pre>
              </div>
            </div>
          )}

          {/* Sandbox Toggle Mode Settings Panel */}
          {isMockUser && (
            <div className="mt-8 pt-6 border-t border-slate-150 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-amber-50 text-amber-700 rounded-xl shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Sandbox Simulation Active</p>
                  <p className="text-xs text-slate-500">You can trigger real credentials verification mode once keys are loaded.</p>
                </div>
              </div>
              <div className="shrink-0">
                <button
                  onClick={() => toggleBypassAuth(false)}
                  className="w-full md:w-auto inline-flex items-center justify-center px-4.5 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg cursor-pointer transition font-mono uppercase"
                  id="disable_bypass_btn"
                >
                  <Server className="w-4 h-4 mr-1.5" /> Enforce Real Auth
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modern High-Density Footer */}
      <footer className="border-t border-slate-200 px-6 py-4 flex items-center justify-between bg-white text-slate-500 text-xs font-sans" id="app_footer_nav">
        <div>
          © {new Date().getFullYear()} MyKerani™ • Pembantu Kewangan Pintar
        </div>
        <div>
          Mata Wang Syarikat: Ringgit Malaysia (MYR)
        </div>
      </footer>
    </div>
  );
}

function RoleRouter() {
  const { user } = useAuth();
  const { activeTenant } = useTenant();

  // V1.0 Role Authority routing
  if (user?.role === "TENANT_STAFF") {
    return <Suspense fallback={<LazyFallback />}><StaffHomeScreen /></Suspense>;
  }

  if (user?.role === "HQ_OWNER" || user?.role === "HQ_STAFF" || activeTenant?.category === "HQ") {
    return <Suspense fallback={<LazyFallback />}><MainDashboardContent /></Suspense>;
  }

  // TENANT_OWNER → Owner Business Dashboard
  return <Suspense fallback={<LazyFallback />}><OwnerDashboard /></Suspense>;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }
  static getDerivedStateFromError(err: Error) {
    return { hasError: true, message: err?.message || "Ralat tidak diketahui." };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-8 gap-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-100 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-rose-600" />
          </div>
          <div className="text-center max-w-md">
            <h2 className="text-lg font-display font-bold text-slate-900 mb-1">Ralat Aplikasi</h2>
            <p className="text-sm text-slate-500 mb-4">{this.state.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 transition cursor-pointer"
            >
              Cuba Semula
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <Guard>
          <TenantProvider>
            <WorkspaceProvider>
              <PermissionProvider>
                <AuditProvider>
                  <StorageProvider>
                    <FinancialRecordsProvider>
                      <NotificationProvider>
                        <RoleRouter />
                      </NotificationProvider>
                    </FinancialRecordsProvider>
                  </StorageProvider>
                </AuditProvider>
              </PermissionProvider>
            </WorkspaceProvider>
          </TenantProvider>
        </Guard>
      </AuthProvider>
    </AppErrorBoundary>
  );
}
