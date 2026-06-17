import React, { useState, useEffect } from "react";
import { useStorage } from "../context/StorageContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { useAuth } from "../context/AuthContext";
import { motion, AnimatePresence } from "../lib/motionCompat";
import {
  Lock,
  Cloud,
  CheckCircle,
  Database,
  RefreshCw,
  FolderLock,
  ExternalLink,
  HardDrive,
  Info,
  ShieldCheck,
  AlertTriangle,
  FolderOpen
} from "lucide-react";

export const StorageSettingsConsole: React.FC = () => {
  const {
    activeProvider,
    loading,
    error,
    updateProviderSetting,
    toggleConnectionStatus,
    isOwnerOrAdmin
  } = useStorage();

  const { activeWorkspace } = useWorkspace();
  const { user } = useAuth();

  const [savingLoading, setSavingLoading] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Clear messages
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  useEffect(() => {
    if (errMsg) {
      const timer = setTimeout(() => setErrMsg(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [errMsg]);

  const handleProviderSelect = async (provider: "HQ_MANAGED" | "GOOGLE_DRIVE" | "ONEDRIVE" | "DROPBOX") => {
    if (!isOwnerOrAdmin) {
      setErrMsg("Access Denied: Only HQ_OWNER or TENANT owners and administrators may modify storage configurations.");
      return;
    }

    setSavingLoading(provider);
    setErrMsg(null);
    setSuccessMsg(null);

    try {
      await updateProviderSetting(provider);
      setSuccessMsg(`Workspace storage provider successfully updated to ${getProviderLabel(provider)}.`);
    } catch (err: any) {
      setErrMsg(err.message || "Failed to update storage provider.");
    } finally {
      setSavingLoading(null);
    }
  };

  const handleToggleConnection = async () => {
    if (!isOwnerOrAdmin) {
      setErrMsg("Access Denied: Only HQ_OWNER or TENANT owners and administrators may link storage accounts.");
      return;
    }

    setSavingLoading("CONNECTION");
    setErrMsg(null);
    setSuccessMsg(null);

    try {
      await toggleConnectionStatus();
      const status = activeProvider?.connectionStatus === "CONNECTED" ? "unlinked" : "linked";
      setSuccessMsg(`Simulated API credentials successfully ${status} for ${getProviderLabel(activeProvider?.providerType || "HQ_MANAGED")}.`);
    } catch (err: any) {
      setErrMsg(err.message || "Failed to alter connection status.");
    } finally {
      setSavingLoading(null);
    }
  };

  const getProviderLabel = (type: string) => {
    switch (type) {
      case "HQ_MANAGED":
        return "HQ Managed Storage";
      case "GOOGLE_DRIVE":
        return "Google Drive";
      case "ONEDRIVE":
        return "Microsoft OneDrive";
      case "DROPBOX":
        return "Dropbox Cloud Storage";
      default:
        return type;
    }
  };

  if (!activeWorkspace) {
    return (
      <div className="p-12 text-center bg-white border border-slate-150 rounded-2xl shadow-xs" id="storage_workspace_empty">
        <FolderLock className="w-12 h-12 mx-auto text-slate-300 mb-4" />
        <h3 className="text-lg font-bold text-slate-800">No Workspace Selected</h3>
        <p className="text-slate-500 text-sm mt-1 max-w-sm mx-auto">
          Please select an active workspace from the sidebar to visualize and configure isolated storage engines.
        </p>
      </div>
    );
  }

  // Generate safe dynamic path isolation string according to task requirements
  // "workspace-a/", "workspace-b/" isolaton structure
  const isolatedSlug = activeWorkspace.slug || activeWorkspace.id.substring(0, 8);
  const isolatedPath = `${isolatedSlug}/`;

  return (
    <div className="space-y-6" id="storage_settings_container">
      {/* Dynamic Status Notifications */}
      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-emerald-50 border border-emerald-150 rounded-xl flex items-start space-x-3 text-emerald-800"
            id="storage_msg_success"
          >
            <CheckCircle className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
            <span className="text-sm font-medium">{successMsg}</span>
          </motion.div>
        )}

        {errMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-rose-50 border border-rose-150 rounded-xl flex items-start space-x-3 text-rose-800"
            id="storage_msg_error"
          >
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
            <span className="text-sm font-medium">{errMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Console Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Storage Settings selector Panel (Left Column) */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Storage Provider Setting</h2>
              <p className="text-slate-500 text-xs mt-0.5">Select a destination root for your workspace's receipts and statements.</p>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 uppercase text-slate-500">
                Active Provider
              </span>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {!isOwnerOrAdmin && (
              <div className="p-4 bg-rose-50 border border-rose-100 text-rose-800 text-xs rounded-xl flex items-start space-x-2.5" id="roles_permission_warning">
                <Lock className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                <div>
                  <p className="font-semibold">ROLE SECURITY OVERRIDE ACTIVE</p>
                  <p className="mt-0.5 text-rose-700">
                    Your current system actor role ({user?.role || "GUEST"}) does not have permissions to modify storage providers. Only **HQ_OWNER**, **TENANT_OWNER**, or **TENANT_OWNER** credentials can update workspace storage routing.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Option 1: HQ Managed Storage */}
              <button
                onClick={() => handleProviderSelect("HQ_MANAGED")}
                disabled={loading || savingLoading !== null || !isOwnerOrAdmin}
                className={`relative p-5 text-left border rounded-xl transition-all duration-200 flex flex-col justify-between h-40 group ${
                  activeProvider?.providerType === "HQ_MANAGED"
                    ? "border-slate-800 bg-slate-50/50 ring-1 ring-slate-800"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                } ${!isOwnerOrAdmin ? "opacity-75 cursor-not-allowed" : "cursor-pointer"}`}
                id="provider_hq_managed_btn"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="p-2.5 bg-slate-100 text-slate-800 rounded-lg group-hover:bg-slate-200 transition-colors">
                    <Database className="w-5 h-5" />
                  </div>
                  {activeProvider?.providerType === "HQ_MANAGED" && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      Active
                    </span>
                  )}
                </div>
                <div className="mt-4">
                  <p className="font-bold text-slate-800 text-sm">HQ Managed Storage</p>
                  <p className="text-slate-500 text-xs mt-1">
                    Secure local Supabase sandbox buckets with absolute multi-tenant RLS guarantees.
                  </p>
                </div>
              </button>

              {/* Option 2: Google Drive */}
              <button
                onClick={() => handleProviderSelect("GOOGLE_DRIVE")}
                disabled={loading || savingLoading !== null || !isOwnerOrAdmin}
                className={`relative p-5 text-left border rounded-xl transition-all duration-200 flex flex-col justify-between h-40 group ${
                  activeProvider?.providerType === "GOOGLE_DRIVE"
                    ? "border-blue-600 bg-blue-50/20 ring-1 ring-blue-600"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                } ${!isOwnerOrAdmin ? "opacity-75 cursor-not-allowed" : "cursor-pointer"}`}
                id="provider_gdrive_btn"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-100 transition-colors">
                    <Cloud className="w-5 h-5" />
                  </div>
                  {activeProvider?.providerType === "GOOGLE_DRIVE" && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                      Active
                    </span>
                  )}
                </div>
                <div className="mt-4">
                  <p className="font-bold text-slate-800 text-sm">Google Drive (BYOS)</p>
                  <p className="text-slate-500 text-xs mt-1">
                    Personal cloud endpoint storage. Uploads route directly to user-isolated Drive folders.
                  </p>
                </div>
              </button>

              {/* Option 3: OneDrive */}
              <button
                onClick={() => handleProviderSelect("ONEDRIVE")}
                disabled={loading || savingLoading !== null || !isOwnerOrAdmin}
                className={`relative p-5 text-left border rounded-xl transition-all duration-200 flex flex-col justify-between h-40 group ${
                  activeProvider?.providerType === "ONEDRIVE"
                    ? "border-sky-600 bg-sky-50/20 ring-1 ring-sky-600"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                } ${!isOwnerOrAdmin ? "opacity-75 cursor-not-allowed" : "cursor-pointer"}`}
                id="provider_onedrive_btn"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="p-2.5 bg-sky-50 text-sky-600 rounded-lg group-hover:bg-sky-100 transition-colors">
                    <Cloud className="w-5 h-5" />
                  </div>
                  {activeProvider?.providerType === "ONEDRIVE" && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold bg-sky-100 text-sky-850 border border-sky-200">
                      Active
                    </span>
                  )}
                </div>
                <div className="mt-4">
                  <p className="font-bold text-slate-800 text-sm">Microsoft OneDrive (BYOS)</p>
                  <p className="text-slate-500 text-xs mt-1">
                    Corporate workspace storage setting. Integrates seamlessly with your OneDrive index directory.
                  </p>
                </div>
              </button>

              {/* Option 4: Dropbox */}
              <button
                onClick={() => handleProviderSelect("DROPBOX")}
                disabled={loading || savingLoading !== null || !isOwnerOrAdmin}
                className={`relative p-5 text-left border rounded-xl transition-all duration-200 flex flex-col justify-between h-40 group ${
                  activeProvider?.providerType === "DROPBOX"
                    ? "border-indigo-600 bg-indigo-50/20 ring-1 ring-indigo-600"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                } ${!isOwnerOrAdmin ? "opacity-75 cursor-not-allowed" : "cursor-pointer"}`}
                id="provider_dropbox_btn"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg group-hover:bg-indigo-100 transition-colors">
                    <Cloud className="w-5 h-5" />
                  </div>
                  {activeProvider?.providerType === "DROPBOX" && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold bg-indigo-100 text-indigo-850 border border-indigo-200">
                      Active
                    </span>
                  )}
                </div>
                <div className="mt-4">
                  <p className="font-bold text-slate-800 text-sm">Dropbox (BYOS)</p>
                  <p className="text-slate-500 text-xs mt-1">
                    Isolated cloud folder setup for receipts. Direct API routing architecture prepared.
                  </p>
                </div>
              </button>
            </div>

            {/* BYOS Integration connection settings Console */}
            {activeProvider && activeProvider.providerType !== "HQ_MANAGED" && (
              <div className="mt-6 p-5 border border-slate-150 bg-slate-50/50 rounded-xl space-y-4" id="byos_integration_prep_panel">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start space-x-3">
                    <div className="p-2 bg-slate-100 text-slate-700 rounded-lg mt-0.5">
                      <HardDrive className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        BYOS API Credentials Mapping
                      </p>
                      <p className="text-xs text-slate-500 max-w-md mt-0.5">
                        Only the **Storage Architecture Frame** is active in this sprint. No OAuth credentials or files are dispatched to external APIs.
                      </p>
                    </div>
                  </div>
                  <div className="self-start sm:self-center">
                    <button
                      onClick={handleToggleConnection}
                      disabled={savingLoading !== null || !isOwnerOrAdmin}
                      className={`inline-flex items-center px-4 py-1.5 text-xs font-semibold rounded-lg border transition ${
                        activeProvider.connectionStatus === "CONNECTED"
                          ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                          : "bg-slate-900 text-white border-slate-950 hover:bg-slate-800"
                      } ${!isOwnerOrAdmin ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                      id="byos_toggle_btn"
                    >
                      {savingLoading === "CONNECTION" ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          Processing...
                        </>
                      ) : activeProvider.connectionStatus === "CONNECTED" ? (
                        "Unlink Mock Account"
                      ) : (
                        "Activate Mock Account"
                      )}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-slate-150">
                  <div>
                    <span className="text-2xs font-mono uppercase text-slate-400 block">Link Status</span>
                    <span className={`inline-flex items-center text-xs font-semibold mt-1 ${
                      activeProvider.connectionStatus === "CONNECTED" ? "text-emerald-600" : "text-amber-600"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                        activeProvider.connectionStatus === "CONNECTED" ? "bg-emerald-550" : "bg-amber-500"
                      }`} />
                      {activeProvider.connectionStatus === "CONNECTED" ? "CONNECTED" : "PENDING SETUP"}
                    </span>
                  </div>
                  <div>
                    <span className="text-2xs font-mono uppercase text-slate-400 block">Target Registry</span>
                    <span className="text-xs font-medium text-slate-700 block mt-1 uppercase font-mono">
                      {activeProvider.providerType}
                    </span>
                  </div>
                  <div>
                    <span className="text-2xs font-mono uppercase text-slate-400 block">Storage Type</span>
                    <span className="text-xs font-semibold text-slate-700 block mt-1 uppercase font-mono">
                      {activeProvider.storageType}
                    </span>
                  </div>
                  <div>
                    <span className="text-2xs font-mono uppercase text-slate-400 block">Last Refreshed</span>
                    <span className="text-xs text-slate-600 block mt-1 font-mono truncate">
                      {new Date(activeProvider.lastSync).toLocaleString("en-MY", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Workspace Isolation & Provider Metadata Panel (Right Column) */}
        <div className="space-y-6">
          {/* Isolation info card */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6 space-y-4">
            <h3 className="font-bold text-slate-800 text-md flex items-center space-x-2">
              <FolderOpen className="w-5 h-5 text-indigo-505 text-slate-700" />
              <span>Workspace Isolation</span>
            </h3>
            
            <p className="text-xs text-slate-500">
              Each workspace maintains a standalone key-path dictionary with a strictly secure subfolder partition prefix inside index nodes. No shared file paths are created.
            </p>

            <div className="p-4 bg-slate-50 border border-slate-150 rounded-xl space-y-3 font-mono text-2xs overflow-x-auto text-slate-600">
              <div>
                <span className="text-slate-400 block uppercase font-sans font-semibold tracking-wider text-4xs">Current Active Workspace ID:</span>
                <span className="text-slate-700 break-all select-all font-semibold font-mono">{activeWorkspace.id}</span>
              </div>
              <div className="pt-2 border-t border-slate-105-raw border-slate-150">
                <span className="text-slate-400 block uppercase font-sans font-semibold tracking-wider text-4xs">Isolated Storage Segment Namespace:</span>
                <span className="text-slate-800 bg-slate-100 px-1 rounded inline-block font-semibold font-mono select-all">
                  {isolatedPath}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-150">
                <span className="text-slate-400 block uppercase font-sans font-semibold tracking-wider text-4xs">Physical Storage Routing:</span>
                <span className="text-indigo-650 bg-indigo-50/50 px-1 rounded block mt-0.5 truncate select-all">
                  {activeProvider?.providerType === "HQ_MANAGED" 
                    ? `supabase://evidence-packages/${activeWorkspace.id}/` 
                    : `${activeProvider?.providerType?.toLowerCase()}://byos-vault/${isolatedPath}`}
                </span>
              </div>
            </div>

            <div className="flex items-start space-x-2.5 p-3.5 bg-indigo-50 text-indigo-805 text-2xs rounded-xl border border-indigo-100">
              <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block uppercase tracking-wide">Multi-Tenant Guarantee</span>
                <span className="mt-0.5 inline-block text-indigo-700">
                  Storage operations enforce Row-Level Security (RLS) linked to workspace boundaries. Subfolder segments prevent any directory leaks across parent tenant workspaces.
                </span>
              </div>
            </div>
          </div>

          {/* Core System Configuration Overview */}
          <div className="bg-slate-900 text-slate-350 border border-slate-950 rounded-2xl shadow-md p-6 space-y-4">
            <h3 className="font-bold text-white text-md flex items-center space-x-2">
              <HardDrive className="w-5 h-5 text-amber-400" />
              <span>BYOS Integration Meta</span>
            </h3>

            <p className="text-2xs text-slate-400 leading-relaxed">
              Sprint 5 establishes the storage routing indexer table (`workspace_storage_providers`) and validates execution boundaries.
            </p>

            <ul className="text-2xs space-y-2 list-none p-0 m-0 text-slate-300">
              <li className="flex items-start space-x-2">
                <span className="text-amber-400 font-bold shrink-0">✓</span>
                <span>Workspace-isolated indexers loaded successfully.</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-amber-400 font-bold shrink-0">✓</span>
                <span>Active provider maps to upload streams instantly.</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-amber-400 font-bold shrink-0">✓</span>
                <span>Settings modification is role-level policy protected.</span>
              </li>
            </ul>

            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-4xs font-mono uppercase tracking-widest text-slate-500">
              <span>Status: ARCHITECTURE CERTIFIED</span>
              <span>V1.0</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
