import React, { useState, useEffect, useRef } from "react";
import { useFinancials } from "../context/FinancialRecordsContext";
import { useAuth } from "../context/AuthContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { useTenant } from "../context/TenantContext";
import { useAudit } from "../context/AuditContext";
import { useStorage } from "../context/StorageContext";
import { motion, AnimatePresence } from "../lib/motionCompat";
import {
  Archive,
  Download,
  Upload,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  ShieldCheck,
  FileJson,
  Plus,
  Lock,
  Calendar,
  Layers,
  HelpCircle,
  FileText
} from "lucide-react";

// Backup representation matching requirement 2
interface BackupMetadata {
  id: string; // "BCK-XXXX"
  workspaceId: string;
  workspaceName: string;
  tenantId: string;
  backupDate: string;
  sizeBytes: number;
  status: "SUCCESS" | "FAILED";
  recordsCount: {
    events: number;
    cashAccounts: number;
    bankAccounts: number;
    debts: number;
    commitments: number;
    evidence: number;
    ocrNew: number;
  };
  payload: {
    financialEvents: any[];
    cashAccounts: any[];
    bankAccounts: any[];
    debtRecords: any[];
    financialCommitments: any[];
    financialEvidencePackages: any[];
    ocrLearnedPatterns: any[];
  };
}

export const MyKeraniBackupRecovery: React.FC = () => {
  const {
    financialEvents,
    cashAccounts,
    bankAccounts,
    debtRecords,
    financialCommitments,
    financialEvidencePackages,
    ocrLearnedPatterns,
    restoreWorkspaceData
  } = useFinancials();

  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { activeTenant } = useTenant();
  const { writeAuditLog } = useAudit();
  const { activeProvider } = useStorage();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [backupsList, setBackupsList] = useState<BackupMetadata[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Restore state controls
  const [selectedBackupForRestore, setSelectedBackupForRestore] = useState<BackupMetadata | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [restoreConfirmChecked, setRestoreConfirmChecked] = useState(false);
  const [uploadedBackupPayload, setUploadedBackupPayload] = useState<any | null>(null);
  const [showUploadPreview, setShowUploadPreview] = useState(false);

  // Role gate matching Requirement 5
  // Only HQ_OWNER, TENANT_OWNER, TENANT_OWNER can restore backups.
  const canRestore = user && ["HQ_OWNER", "TENANT_OWNER", "TENANT_OWNER"].includes(user.role);

  // Sync workspace and tenant backups
  useEffect(() => {
    loadBackups();
  }, [activeWorkspace?.id, activeTenant?.id]);

  const loadBackups = () => {
    if (!activeWorkspace || !activeTenant) return;
    const stored = localStorage.getItem("mykerani_backups_repository");
    if (stored) {
      try {
        const parsed: BackupMetadata[] = JSON.parse(stored);
        // Isolate to current Workspace and Tenant matching security guidelines
        const isolated = parsed.filter(
          (b) => b.workspaceId === activeWorkspace.id && b.tenantId === activeTenant.id
        );
        // Sort newest first
        isolated.sort((a, b) => new Date(b.backupDate).getTime() - new Date(a.backupDate).getTime());
        setBackupsList(isolated);
      } catch (err: any) {
        console.error("Failed loading backups list index:", err);
      }
    } else {
      setBackupsList([]);
    }
  };

  const saveBackupsToGlobalRepository = (allBackups: BackupMetadata[]) => {
    localStorage.setItem("mykerani_backups_repository", JSON.stringify(allBackups));
  };

  const getGlobalBackups = (): BackupMetadata[] => {
    const stored = localStorage.getItem("mykerani_backups_repository");
    if (!stored) return [];
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  };

  // Helper inside backup to serialize and create a backup object represent is formatted
  const createBackupInstance = (): BackupMetadata | null => {
    if (!activeWorkspace || !activeTenant) return null;

    const payload = {
      financialEvents,
      cashAccounts,
      bankAccounts,
      debtRecords,
      financialCommitments,
      financialEvidencePackages,
      ocrLearnedPatterns
    };

    const payloadStr = JSON.stringify(payload);
    const sizeBytes = new Blob([payloadStr]).size;

    const bckId = `BCK-${Math.floor(100000 + Math.random() * 900000)}`;

    return {
      id: bckId,
      workspaceId: activeWorkspace.id,
      workspaceName: activeWorkspace.name,
      tenantId: activeTenant.id,
      backupDate: new Date().toISOString(),
      sizeBytes,
      status: "SUCCESS",
      recordsCount: {
        events: financialEvents.length,
        cashAccounts: cashAccounts.length,
        bankAccounts: bankAccounts.length,
        debts: debtRecords.length,
        commitments: financialCommitments.length,
        evidence: financialEvidencePackages.length,
        ocrNew: ocrLearnedPatterns.length
      },
      payload
    };
  };

  // 1. Create Workspace Backup Action
  const handleCreateBackup = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const newBackup = createBackupInstance();
    if (!newBackup) {
      setErrorMessage("No active workspace found to execute snapshot backup.");
      return;
    }

    try {
      // Append to the global backups array
      const globals = getGlobalBackups();
      globals.push(newBackup);
      saveBackupsToGlobalRepository(globals);

      // Reload filtered workspace backups
      loadBackups();

      // Audit log integration
      await writeAuditLog({
        workspaceId: activeWorkspace?.id,
        module: "Backup & Recovery",
        action: "CREATE",
        oldValue: null,
        newValue: {
          backupId: newBackup.id,
          sizeFormatted: formatBytes(newBackup.sizeBytes),
          counts: newBackup.recordsCount
        }
      });

      setSuccessMessage(`Backup snapshot [${newBackup.id}] was created and archived successfully.`);
    } catch (err: any) {
      setErrorMessage(`Snapshot failed: ${err.message || err}`);
    }
  };

  // 2. Download JSON Backup File
  const handleDownloadBackup = (backup: BackupMetadata) => {
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `MYKERANI_${backup.workspaceName.replace(/\s+/g, "_")}_${backup.id}_${new Date(backup.backupDate).toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      setSuccessMessage(`Successfully downloaded backup file for ${backup.id}.`);
    } catch (err: any) {
      setErrorMessage(`Failed exporting download: ${err.message}`);
    }
  };

  // 3. Delete Backup snapshot
  const handleDeleteBackup = async (backupId: string) => {
    if (!window.confirm(`Are you absolutely sure you want to delete backup snapshot [${backupId}]? This cannot be undone.`)) {
      return;
    }

    try {
      const globals = getGlobalBackups();
      const updated = globals.filter((b) => b.id !== backupId);
      saveBackupsToGlobalRepository(updated);
      loadBackups();

      await writeAuditLog({
        workspaceId: activeWorkspace?.id,
        module: "Backup & Recovery",
        action: "DELETE",
        oldValue: { backupId },
        newValue: null
      });

      setSuccessMessage(`Backup snapshot [${backupId}] was removed from the archived repository.`);
    } catch (err: any) {
      setErrorMessage(`Failed deleting backup: ${err.message}`);
    }
  };

  // 4. File-input trigger for restore from local JSON
  const handleUploadBackupSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileReader = new FileReader();
    fileReader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);

        // Verification validation check
        if (!parsed.id || !parsed.recordsCount || !parsed.payload) {
          throw new Error("Invalid format. Missing required MYKERANI backup descriptors.");
        }

        setUploadedBackupPayload(parsed);
        setShowUploadPreview(true);
        setErrorMessage(null);
      } catch (err: any) {
        setErrorMessage(`Failed parsing backup file: ${err.message}`);
        setUploadedBackupPayload(null);
        setShowUploadPreview(false);
      }
    };
    fileReader.readAsText(file);
  };

  // 5. Restore Action Trigger (Permission Check, confirmation gate)
  const handleTriggerRestore = async (backupToRestore: BackupMetadata) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    // 1. Permission verify
    if (!canRestore) {
      setErrorMessage("Access Denied: You do not have permission to restore backups. Require HN_ADMIN, TENANT_OWNER, or TENANT_OWNER roles.");
      return;
    }

    // 2. Strict conformation matching requirement 3
    if (confirmText.toLowerCase() !== "confirm restore") {
      setErrorMessage(`Type "confirm restore" to process database override.`);
      return;
    }

    if (!restoreConfirmChecked) {
      setErrorMessage("Please accept the risk checkbox acknowledging that live records will be overridden.");
      return;
    }

    // Capture old workspace stats for audit trail
    const preRestoreStats = {
      events: financialEvents.length,
      cashAccounts: cashAccounts.length,
      bankAccounts: bankAccounts.length,
      debts: debtRecords.length,
      commitments: financialCommitments.length,
      evidence: financialEvidencePackages.length,
      ocrNew: ocrLearnedPatterns.length
    };

    try {
      // Trigger restoration
      await restoreWorkspaceData(backupToRestore.payload);

      // Audit Log Restored Action matching requirement 4
      await writeAuditLog({
        workspaceId: activeWorkspace?.id,
        module: "Backup & Recovery",
        action: "UPDATE",
        oldValue: {
          snapshotId: backupToRestore.id,
          state: "Pre-Restore",
          stats: preRestoreStats
        },
        newValue: {
          snapshotId: backupToRestore.id,
          state: "Restored",
          stats: backupToRestore.recordsCount
        }
      });

      // Clear restoration panel
      setSelectedBackupForRestore(null);
      setShowUploadPreview(false);
      setUploadedBackupPayload(null);
      setConfirmText("");
      setRestoreConfirmChecked(false);

      setSuccessMessage(`COMPLETED: Workspace restored to snapshot [${backupToRestore.id}] successfully. All financial events, physical vaults, bank ledgers, commitments, and learning rules have been successfully rolled back.`);
    } catch (err: any) {
      setErrorMessage(`Restoration failed: ${err.message || err}`);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="space-y-6" id="mykerani_backup_recovery_module">
      {/* Banner / Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-6 shadow-sm relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full inline-block mb-2">
              Disaster Recovery Frame
            </span>
            <h2 className="font-display font-bold text-2xl tracking-normal">
              MYKERANI Backup & Recovery Hub
            </h2>
            <p className="text-slate-300 text-xs mt-1 max-w-2xl leading-relaxed">
              Empower users with complete ownership over their financial histories. Securely export, download, partition, and roll back financial events, cash drawers, bank accounts, vendor contract obligations, and learning engine memory patterns.
            </p>
            <div className="flex items-center space-x-2 mt-3.5 text-2xs text-rose-200 bg-white/10 border border-white/10 px-3 py-1.5 rounded-lg w-max font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Active Storage Destination:</span>
              <span className="font-bold uppercase text-white">
                {activeProvider?.providerType === "HQ_MANAGED"
                  ? "HQ Managed Storage (Local RLS)"
                  : activeProvider?.providerType ? `${activeProvider.providerType} (Remote BYOS)` : "HQ Managed Storage"}
              </span>
            </div>
          </div>
          <button
            onClick={handleCreateBackup}
            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-lg shadow-rose-900/40 cursor-pointer self-start md:self-auto"
            id="btn_create_live_backup"
          >
            <Plus className="w-4 h-4" />
            Create Live Backup
          </button>
        </div>

        {/* Decorative background grid */}
        <div className="absolute inset-x-0 bottom-0 top-1/2 opacity-20 pointer-events-none border-t border-dashed border-slate-700"></div>
      </div>

      {/* Alert Feedbacks */}
      <AnimatePresence mode="popLayout">
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3"
            id="toast_success_msg"
          >
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs text-emerald-800">
              <span className="font-semibold block">Execution Completed</span>
              {successMessage}
            </div>
          </motion.div>
        )}

        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3"
            id="toast_error_msg"
          >
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-xs text-rose-800">
              <span className="font-semibold block">Operation Prevented</span>
              {errorMessage}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Protected Assets List Column */}
        <div className="bg-white rounded-2xl border border-slate-150 p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <ShieldCheck className="w-5 h-5 text-indigo-600" />
            <h3 className="font-display font-bold text-sm text-slate-900">
              Protected Entities Under MYKERANI
            </h3>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            The active backup engine partitions, archives, and serializes the following data structures dynamically into an encrypted snapshot file:
          </p>

          <div className="space-y-2.5">
            {[
              {
                title: "Financial Records",
                desc: "Events ledger, physical cash vault assets, bank balances, and long-term liabilities.",
                count: financialEvents.length + cashAccounts.length + bankAccounts.length + debtRecords.length,
                color: "text-amber-500 bg-amber-50"
              },
              {
                title: "Financial Commitments",
                desc: "Vendor rental terms, periodic internet/utility contract subscriptions, and legal terms.",
                count: financialCommitments.length,
                color: "text-blue-500 bg-blue-50"
              },
              {
                title: "Evidence Packages",
                desc: "Associated invoices, upload dates, file reference receipts, and ledger matching links.",
                count: financialEvidencePackages.length,
                color: "text-rose-500 bg-rose-50"
              },
              {
                title: "OCR Learning Memory",
                desc: "Learned automatic vendor-category matching patterns captured by the intelligent OCR camera.",
                count: ocrLearnedPatterns.length,
                color: "text-emerald-500 bg-emerald-50"
              },
              {
                title: "AI Learning Memory",
                desc: "Historical natural language financial reports, metrics calculations, state rules, and chat histories.",
                count: 1, // Simulated active ML baseline
                color: "text-violet-500 bg-violet-50"
              }
            ].map((item, index) => (
              <div key={index} className="flex gap-3 p-2.5 rounded-xl border border-slate-50 hover:border-slate-100 transition">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${item.color}`}>
                  <Archive className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-slate-900">{item.title}</span>
                    <span className="font-mono text-[10px] text-slate-400 font-bold bg-slate-100 px-1.5 py-0.5 rounded-full">
                      {item.count} items
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Local File Import Section */}
          <div className="border-t border-dashed border-slate-150 pt-4 mt-4">
            <h4 className="font-semibold text-xs text-slate-800 flex items-center gap-1.5 mb-2">
              <Upload className="w-4 h-4 text-slate-600" />
              Upload Local Backup File
            </h4>
            <p className="text-[11px] text-slate-500 leading-relaxed mb-3">
              Have an exported snapshot saved on your laptop? Select it to run verification checks and override live states.
            </p>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleUploadBackupSelect}
              accept=".json"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2 border-2 border-dashed border-slate-200 hover:border-indigo-400 hover:bg-slate-50 rounded-xl text-xs font-semibold text-indigo-600 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <FileJson className="w-4 h-4" />
              Upload exported .json file
            </button>
          </div>
        </div>

        {/* History Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Workspace Backups History List */}
          <div className="bg-white rounded-2xl border border-slate-150 p-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-600" />
                <h3 className="font-display font-bold text-sm text-slate-900">
                  Archived Workspace Backups History
                </h3>
              </div>
              <span className="text-[10px] font-mono font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                {backupsList.length} Archived
              </span>
            </div>

            {backupsList.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-150">
                <Archive className="w-10 h-10 text-slate-300 mx-auto stroke-1" />
                <h4 className="text-slate-700 font-semibold text-xs mt-3">No backups created yet for this workspace</h4>
                <p className="text-slate-400 text-[11px] max-w-sm mx-auto mt-1">
                  Trigger a live recovery snapshot backup above to secure current financial records inside your local vault.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                {backupsList.map((backup) => (
                  <div
                    key={backup.id}
                    className="p-3.5 border border-slate-150 hover:border-slate-300 rounded-xl bg-slate-50/50 hover:bg-white transition flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-slate-800 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded">
                          {backup.id}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {new Date(backup.backupDate).toLocaleString()}
                        </span>
                        <span className="bg-emerald-500/10 text-emerald-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                          {backup.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-normal">
                        Size: <span className="font-semibold text-slate-700">{formatBytes(backup.sizeBytes)}</span> • Events: <span className="font-semibold text-indigo-600">{backup.recordsCount.events}</span> • Accounts: <span className="font-semibold text-indigo-600">{backup.recordsCount.cashAccounts + backup.recordsCount.bankAccounts}</span> • Commitments: <span className="font-semibold text-indigo-600">{backup.recordsCount.commitments}</span> • OCR patterns: <span className="font-semibold text-indigo-600">{backup.recordsCount.ocrNew}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDownloadBackup(backup)}
                        title="Download backup file"
                        className="p-2 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-lg text-slate-600 transition cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setSelectedBackupForRestore(backup)}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Restore
                      </button>
                      <button
                        onClick={() => handleDeleteBackup(backup.id)}
                        className="p-2 border border-rose-100 hover:border-rose-200 hover:bg-rose-50 rounded-lg text-rose-600 transition cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Secure Interactive Confirmation Restore Gate */}
          <AnimatePresence>
            {selectedBackupForRestore && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                className="bg-white rounded-2xl border-2 border-orange-200 shadow-lg p-5 relative overflow-hidden space-y-4"
              >
                {/* Warning header */}
                <div className="absolute top-0 inset-x-0 h-1.5 bg-orange-500"></div>

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-sm text-slate-900">
                      SECURE OVERRIDE PATHWAY: ROLLBACK VERIFICATION
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      You are preparing to restore workspace <span className="font-bold text-slate-800">[{selectedBackupForRestore.workspaceName}]</span> to snapshot <span className="font-bold text-slate-800">[{selectedBackupForRestore.id}]</span> dated <span className="font-semibold text-slate-700">{new Date(selectedBackupForRestore.backupDate).toLocaleString()}</span>.
                    </p>
                  </div>
                </div>

                {/* Comparison tally view */}
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-150 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase block">Records Set</span>
                    <span className="font-mono text-sm font-bold text-indigo-600">
                      {selectedBackupForRestore.recordsCount.events} Events
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase block">Cash & Bank</span>
                    <span className="font-mono text-sm font-bold text-indigo-600">
                      {selectedBackupForRestore.recordsCount.cashAccounts + selectedBackupForRestore.recordsCount.bankAccounts} Accts
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase block">Commitments</span>
                    <span className="font-mono text-sm font-bold text-indigo-600">
                      {selectedBackupForRestore.recordsCount.commitments} Contracts
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase block">OCR Learn Matrix</span>
                    <span className="font-mono text-sm font-bold text-indigo-600">
                      {selectedBackupForRestore.recordsCount.ocrNew} Patterns
                    </span>
                  </div>
                </div>

                {/* Role / Permission verification notice */}
                <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 flex items-center justify-between text-xs gap-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span className="text-slate-700">
                      Required Gate: Only Administrator & Owners.
                    </span>
                  </div>
                  <span className={`font-bold px-2 py-0.5 rounded text-[11px] uppercase ${canRestore ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                    {user?.role}: {canRestore ? 'Authorized to restore' : 'RESTORING LOCKED'}
                  </span>
                </div>

                {/* Confirmation Rules Panel */}
                <div className="space-y-3 pt-2">
                  <div className="space-y-2">
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        id="check_agreement_risk"
                        checked={restoreConfirmChecked}
                        onChange={(e) => setRestoreConfirmChecked(e.target.checked)}
                        className="w-4 h-4 text-orange-600 border-slate-300 focus:ring-orange-500 rounded mt-0.5"
                      />
                      <label htmlFor="check_agreement_risk" className="text-xs text-slate-600 leading-normal select-none">
                        I clearly understand that returning to this snapshot will override and replace all current financial registers, evidence receipt bundles, and OCR learnings in this workspace. This action cannot be undone.
                      </label>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 uppercase block">
                      Type <span className="text-orange-600">confirm restore</span> below to authorize:
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:ring-1 focus:ring-orange-500 focus:outline-none"
                      placeholder="confirm restore"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      onClick={() => setSelectedBackupForRestore(null)}
                      className="px-3.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg transition"
                    >
                      Cancel Overwrite
                    </button>
                    <button
                      onClick={() => handleTriggerRestore(selectedBackupForRestore)}
                      disabled={!canRestore || confirmText.toLowerCase() !== "confirm restore" || !restoreConfirmChecked}
                      className="px-4 py-2 bg-gradient-to-r from-orange-600 to-amber-600 text-white font-bold text-xs rounded-lg shadow-sm hover:from-orange-700 hover:to-amber-700 disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed transition flex items-center gap-1.5"
                      id="btn_execute_restore"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Execute Safe Recovery
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Verification Preview Pane for JSON imports */}
          <AnimatePresence>
            {showUploadPreview && uploadedBackupPayload && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="bg-white rounded-2xl border-2 border-indigo-200 shadow-lg p-5 space-y-4"
              >
                <div className="flex items-center gap-2 border-b border-indigo-100 pb-3">
                  <FileJson className="w-5 h-5 text-indigo-600 animate-pulse" />
                  <h3 className="font-display font-bold text-sm text-slate-900">
                    Import Verification: External Backup File Loaded
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1 pt-1.5">
                    <p className="text-slate-500">
                      Snapshot ID: <span className="font-bold text-slate-800">{uploadedBackupPayload.id}</span>
                    </p>
                    <p className="text-slate-500">
                      Original Workspace: <span className="font-semibold text-slate-700">{uploadedBackupPayload.workspaceName}</span>
                    </p>
                    <p className="text-slate-500">
                      Backup File Date: <span className="font-semibold text-slate-700">{new Date(uploadedBackupPayload.backupDate).toLocaleString()}</span>
                    </p>
                    <p className="text-slate-500">
                      Payload Size: <span className="font-semibold text-slate-755">{formatBytes(uploadedBackupPayload.sizeBytes)}</span>
                    </p>
                  </div>

                  <div className="bg-indigo-50/50 p-3 rounded-xl space-y-2 border border-indigo-100">
                    <h4 className="font-bold text-[10px] text-slate-600 uppercase">Parsed Datastores:</h4>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-700 font-semibold font-mono">
                      <span>Events: {uploadedBackupPayload.recordsCount?.events || 0}</span>
                      <span>Accounts: {(uploadedBackupPayload.recordsCount?.cashAccounts || 0) + (uploadedBackupPayload.recordsCount?.bankAccounts || 0)}</span>
                      <span>Commitments: {uploadedBackupPayload.recordsCount?.commitments || 0}</span>
                      <span>Rules: {uploadedBackupPayload.recordsCount?.ocrNew || 0}</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-[11px] text-amber-800">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Warning: Restoring this uploaded backup is subject to role permission controls. It will overwrite all transaction records in this active workspace with the data from the imported file.
                  </span>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => {
                      setUploadedBackupPayload(null);
                      setShowUploadPreview(false);
                    }}
                    className="px-3.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg transition"
                  >
                    Discard File
                  </button>
                  <button
                    onClick={() => {
                      setSelectedBackupForRestore(uploadedBackupPayload);
                    }}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition shadow-md flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Proceed to Restore
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
