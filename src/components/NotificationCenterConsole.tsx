import React, { useState } from "react";
import { useNotifications, WorkspaceNotification } from "../context/NotificationContext";
import { useAuth } from "../context/AuthContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { 
  Bell, 
  BellOff, 
  Mail, 
  Smartphone, 
  Check, 
  CheckSquare, 
  Trash2, 
  Settings, 
  ShieldAlert, 
  Calendar, 
  Database, 
  Archive, 
  AlertTriangle, 
  Activity, 
  Terminal, 
  FileText,
  Clock,
  Sparkles,
  Info
} from "lucide-react";

export const NotificationCenterConsole: React.FC = () => {
  const { 
    notifications, 
    preferences, 
    loading, 
    error, 
    markAsRead, 
    markAsArchived, 
    markAllAsRead, 
    updatePreferencesSetting,
    isOwnerOrAdmin,
    generateDynamicAdvisoryAlerts
  } = useNotifications();

  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [activeTab, setActiveTab] = useState<"UNREAD" | "READ" | "ARCHIVED" | "PREFS">("UNREAD");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [actioning, setActioning] = useState<string | null>(null);
  const [prefSaving, setPrefSaving] = useState(false);
  const [prefError, setPrefError] = useState<string | null>(null);
  const [prefSuccess, setPrefSuccess] = useState(false);
  const [triggeringNotifs, setTriggeringNotifs] = useState(false);

  // Filter Logic
  const filteredNotifications = notifications.filter(n => {
    // Status Filter
    if (n.status !== activeTab && activeTab !== "PREFS") return false;
    // Category Filter
    if (categoryFilter !== "ALL" && n.category !== categoryFilter) return false;
    return true;
  });

  const getCategoryTheme = (category: string) => {
    switch (category) {
      case "FINANCIAL_RECORD":
        return { bg: "bg-emerald-50 text-emerald-700 border-emerald-100", label: "Financial Record" };
      case "RECEIVABLE":
        return { bg: "bg-blue-50 text-blue-700 border-blue-100", label: "Receivable Alert" };
      case "PAYABLE":
        return { bg: "bg-amber-50 text-amber-700 border-amber-100", label: "Payable Alert" };
      case "COMMITMENT":
        return { bg: "bg-purple-50 text-purple-700 border-purple-100", label: "Commitment Alert" };
      case "BACKUP":
        return { bg: "bg-orange-50 text-orange-700 border-orange-100", label: "Backup Integrity" };
      case "STORAGE":
        return { bg: "bg-teal-50 text-teal-700 border-teal-100", label: "BYOS Cloud Storage" };
      case "SECURITY":
        return { bg: "bg-rose-50 text-rose-700 border-rose-100", label: "Security Enforce" };
      case "SYSTEM":
        return { bg: "bg-slate-50 text-slate-700 border-slate-100", label: "Core system" };
      default:
        return { bg: "bg-slate-50 text-slate-700 border-slate-100", label: category };
    }
  };

  const handleMarkAsRead = async (id: string) => {
    setActioning(id);
    await markAsRead(id);
    setActioning(null);
  };

  const handleMarkAsArchived = async (id: string) => {
    setActioning(id);
    await markAsArchived(id);
    setActioning(null);
  };

  const handleMarkAllRead = async () => {
    setActioning("ALL");
    await markAllAsRead();
    setActioning(null);
  };

  const handleSavePreferences = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isOwnerOrAdmin || !preferences) return;

    setPrefSaving(true);
    setPrefError(null);
    setPrefSuccess(false);

    const formData = new FormData(e.currentTarget);
    const inApp = formData.get("enableInApp") === "true";
    const email = formData.get("enableEmail") === "true";
    const push = formData.get("enablePush") === "true";

    try {
      await updatePreferencesSetting(inApp, email, push);
      setPrefSuccess(true);
      setTimeout(() => setPrefSuccess(false), 3000);
    } catch (err: any) {
      setPrefError(err.message);
    } finally {
      setPrefSaving(false);
    }
  };

  const handleScanNow = async () => {
    setTriggeringNotifs(true);
    try {
      await generateDynamicAdvisoryAlerts();
    } finally {
      setTriggeringNotifs(false);
    }
  };

  const unreadCount = notifications.filter(n => n.status === "UNREAD").length;
  const readCount = notifications.filter(n => n.status === "READ").length;
  const archivedCount = notifications.filter(n => n.status === "ARCHIVED").length;

  return (
    <div className="space-y-6">
      {/* Overview Card */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 relative overflow-hidden border border-slate-950 shadow-sm">
        <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none transform translate-x-12 translate-y-12">
          <Bell className="w-64 h-64" />
        </div>
        <div className="relative z-10 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-mono tracking-widest text-blue-300 font-bold uppercase block mb-1">
                SECURE ROUTING INTEGRATION
              </span>
              <h2 className="text-xl md:text-2xl font-display font-semibold tracking-tight text-white">
                Advisory Notification Router Desk
              </h2>
              <p className="text-xs text-slate-300/85 max-w-2xl mt-1 leading-relaxed">
                Receive proactive ledger intelligence: Due dates, overdue balances, operational commitments, database backups compliance status, and BYOS cloud connectivity checks.
              </p>
            </div>
            <button
              onClick={handleScanNow}
              disabled={triggeringNotifs}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center transition shrink-0 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className={`w-3.5 h-3.5 mr-1.5 ${triggeringNotifs ? "animate-spin" : ""}`} />
              {triggeringNotifs ? "Analyzing Registers..." : "Trigger Advisory Scan"}
            </button>
          </div>

          <div className="flex flex-wrap gap-2.5 pt-1">
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-2xs font-mono font-bold bg-white/10 text-slate-200 border border-white/5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mr-1.5 animate-pulse" />
              STATUS: SECURE ROUTER ACTIVE
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-2xs font-mono font-bold bg-white/10 text-slate-200 border border-white/5">
              ACTIVE PROVIDERS: In-App Core
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-2xs font-mono font-bold bg-white/10 text-slate-200 border border-white/5">
              BASIS: MYKERANI Constitution V1.0 compliant
            </span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-slate-50 border border-slate-200 rounded-2xl">
          <Activity className="w-8 h-8 text-slate-400 animate-spin" />
          <p className="text-xs text-slate-500 font-mono mt-3">Interrogating Notification Registry...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Navigation Sidebar panel */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
              <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest px-2 block mb-2">
                FILTER BY FOLDERS
              </span>

              <button
                onClick={() => { setActiveTab("UNREAD"); setCategoryFilter("ALL"); }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition cursor-pointer ${
                  activeTab === "UNREAD" 
                    ? "bg-slate-900 text-white shadow-xs" 
                    : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-900"
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Bell className="w-4 h-4" />
                  <span>Unread Inbox</span>
                </div>
                {unreadCount > 0 && (
                  <span className={`px-2 py-0.5 rounded-full text-2xs font-mono font-bold ${activeTab === "UNREAD" ? "bg-blue-500 text-white" : "bg-slate-200 text-slate-800"}`}>
                    {unreadCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => { setActiveTab("READ"); setCategoryFilter("ALL"); }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition cursor-pointer ${
                  activeTab === "READ" 
                    ? "bg-slate-900 text-white shadow-xs" 
                    : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-900"
                }`}
              >
                <div className="flex items-center space-x-2">
                  <CheckSquare className="w-4 h-4" />
                  <span>Read Alert Archive</span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-2xs font-mono font-bold bg-slate-100 text-slate-500">
                  {readCount}
                </span>
              </button>

              <button
                onClick={() => { setActiveTab("ARCHIVED"); setCategoryFilter("ALL"); }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition cursor-pointer ${
                  activeTab === "ARCHIVED" 
                    ? "bg-slate-900 text-white shadow-xs" 
                    : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-900"
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Archive className="w-4 h-4" />
                  <span>Historical Vault</span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-2xs font-mono font-bold bg-slate-100 text-slate-500">
                  {archivedCount}
                </span>
              </button>

              <div className="border-t border-slate-200 my-2 pt-2" />

              <button
                onClick={() => setActiveTab("PREFS")}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition cursor-pointer ${
                  activeTab === "PREFS" 
                    ? "bg-slate-900 text-white shadow-xs" 
                    : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-900"
                }`}
              >
                <div className="flex items-center space-x-2 text-slate-700 font-bold">
                  <Settings className="w-4 h-4 text-blue-500" />
                  <span>Workspace Preferences</span>
                </div>
                <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100">
                  {preferences ? "Active" : "None"}
                </span>
              </button>
            </div>

            {/* Categories sidebar filter */}
            {activeTab !== "PREFS" && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1.5">
                <span className="text-[10px] font-mono font-bold text-slate-400 tracking-widest px-2 block mb-2">
                  BY LEDGER CATEGORY
                </span>
                {[
                  { id: "ALL", label: "All Categories" },
                  { id: "FINANCIAL_RECORD", label: "Ledger Updates" },
                  { id: "COMMITMENT", label: "Commitment Deadlines" },
                  { id: "RECEIVABLE", label: "Receivables Invoices" },
                  { id: "PAYABLE", label: "Supplier Bills" },
                  { id: "BACKUP", label: "System Backups" },
                  { id: "STORAGE", label: "BYOS Connectivity" },
                  { id: "SECURITY", label: "Security & Policy" },
                  { id: "SYSTEM", label: "Core Logs" },
                ].map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setCategoryFilter(cat.id)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-2xs font-medium transition cursor-pointer flex items-center justify-between ${
                      categoryFilter === cat.id 
                        ? "bg-slate-100 text-slate-900 font-bold border-l-2 border-slate-800" 
                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                    }`}
                  >
                    <span>{cat.label}</span>
                    {categoryFilter === cat.id && <span className="w-1 h-1 rounded-full bg-slate-900" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Active Work Panel */}
          <div className="lg:col-span-3 space-y-4">
            {activeTab === "PREFS" ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 flex items-center">
                    <Settings className="w-4 h-4 mr-2 text-slate-500" />
                    Secure Routing Channels Preference
                  </h3>
                  <p className="text-2xs text-slate-500 mt-0.5 leading-relaxed">
                    Under corporate isolation policy constraints, configure advisory broadcasting preferences for workspace admins. Only authorized executives are permitted revisions.
                  </p>
                </div>

                {/* Authority Badge */}
                <div className={`p-3.5 border rounded-xl flex items-start gap-3 ${isOwnerOrAdmin ? "bg-emerald-50 text-emerald-800 border-emerald-100" : "bg-rose-50 text-rose-800 border-rose-100"}`}>
                  <ShieldAlert className={`w-4 h-4 mt-0.5 ${isOwnerOrAdmin ? "text-emerald-600" : "text-rose-600"}`} />
                  <div className="space-y-0.5">
                    <span className="text-2xs font-bold uppercase font-mono block">
                      {isOwnerOrAdmin ? "✓ Authority Granted" : "⚠ READ-ONLY ENFORCED"}
                    </span>
                    <span className="text-2xs block text-slate-600">
                      Active User Session: <strong className="font-mono">{user?.role}</strong> role. 
                      {isOwnerOrAdmin 
                        ? " You are cleared to save routing configuration changes." 
                        : " Revision of notification filters is restricted to HQ_ADMIN, TENANT_OWNER, and TENANT_ADMIN roles."}
                    </span>
                  </div>
                </div>

                {preferences ? (
                  <form onSubmit={handleSavePreferences} className="space-y-4 pt-1">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* In-App Option */}
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <Bell className="w-5 h-5 text-slate-600" />
                          <input 
                            type="checkbox" 
                            name="enableInApp" 
                            defaultChecked={preferences.enableInApp}
                            value="true"
                            disabled={!isOwnerOrAdmin}
                            className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed"
                            id="pref_checkbox_inapp"
                          />
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold text-slate-800">In-App Alerts Center</h4>
                          <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                            Render diagnostic alarms directly inside the global workspace bell registry viewport.
                          </p>
                        </div>
                      </div>

                      {/* Email Option */}
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 relative overflow-hidden">
                        <div className="flex items-center justify-between">
                          <Mail className="w-5 h-5 text-slate-600" />
                          <input 
                            type="checkbox" 
                            name="enableEmail" 
                            defaultChecked={preferences.enableEmail}
                            value="true"
                            disabled={!isOwnerOrAdmin}
                            className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed"
                            id="pref_checkbox_email"
                          />
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold text-slate-800 flex items-center justify-between">
                            <span>Email Broadcasts</span>
                            <span className="text-[9px] font-mono bg-amber-100 text-amber-700 px-1 py-0.2 rounded">ADVISORY</span>
                          </h4>
                          <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                            Sends daily digests. *Note: Mock email queuing layer is active, real sending is disabled.*
                          </p>
                        </div>
                      </div>

                      {/* Push Option */}
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 relative overflow-hidden">
                        <div className="flex items-center justify-between">
                          <Smartphone className="w-5 h-5 text-slate-600" />
                          <input 
                            type="checkbox" 
                            name="enablePush" 
                            defaultChecked={preferences.enablePush}
                            value="true"
                            disabled={!isOwnerOrAdmin}
                            className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed"
                            id="pref_checkbox_push"
                          />
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold text-slate-800 flex items-center justify-between">
                            <span>Push Alerts</span>
                            <span className="text-[9px] font-mono bg-amber-100 text-amber-700 px-1 py-0.2 rounded">ADVISORY</span>
                          </h4>
                          <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                            Queues system triggers to administrative browser devices. *No external servers active.*
                          </p>
                        </div>
                      </div>
                    </div>

                    {isOwnerOrAdmin && (
                      <div className="flex items-center justify-end border-t border-slate-100 pt-3">
                        <button
                          type="submit"
                          disabled={prefSaving}
                          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                        >
                          {prefSaving ? "Updating Preferences..." : "Commit Preferences Config"}
                        </button>
                      </div>
                    )}

                    {prefSuccess && (
                      <div className="p-3 bg-emerald-50 border border-emerald-150 text-emerald-800 text-2xs rounded-lg font-mono font-bold">
                        ✓ Preference modifications completed. secure audit payload transmitted.
                      </div>
                    )}

                    {prefError && (
                      <div className="p-3 bg-rose-50 border border-rose-150 text-rose-800 text-2xs rounded-lg font-mono font-bold">
                        ❌ Failed committing: {prefError}
                      </div>
                    )}
                  </form>
                ) : (
                  <p className="text-slate-500 font-mono text-xs">Error: Preferences registry block lost.</p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {/* List Actions */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center space-x-2 font-mono text-2xs font-bold text-slate-500">
                    <span>Active Folder: {activeTab}</span>
                    <span>•</span>
                    <span>Filtered Count: {filteredNotifications.length}</span>
                  </div>

                  {activeTab === "UNREAD" && filteredNotifications.length > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      disabled={actioning === "ALL"}
                      className="text-slate-600 hover:text-slate-900 text-2xs font-bold font-mono transition flex items-center cursor-pointer"
                    >
                      <CheckSquare className="w-3.5 h-3.5 mr-1" />
                      Mark Folder As Read
                    </button>
                  )}
                </div>

                {/* Notifications Stack */}
                {filteredNotifications.length === 0 ? (
                  <div className="bg-slate-50 border border-slate-200/60 rounded-2xl py-16 px-4 text-center space-y-2">
                    <div className="mx-auto w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                      <BellOff className="w-5 h-5" />
                    </div>
                    <h4 className="text-xs font-semibold text-slate-800">
                      Folder is empty
                    </h4>
                    <p className="text-2xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                      No advisory alerts with the category filter matching "<strong>{categoryFilter}</strong>" were found in the "{activeTab}" folder.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3" id="notifications_alerts_stack">
                    {filteredNotifications.map((n: WorkspaceNotification) => {
                      const theme = getCategoryTheme(n.category);
                      const isActionsDisabled = actioning === n.id;

                      return (
                        <div 
                          key={n.id}
                          className="p-5 bg-white border border-slate-200 rounded-2xl shadow-2xs hover:border-slate-300 transition-all flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                        >
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider border ${theme.bg}`}>
                                {theme.label}
                              </span>
                              <span className="text-[10px] font-mono text-slate-400 font-medium inline-flex items-center">
                                <Clock className="w-3 h-3 mr-1" />
                                {new Date(n.createdAt).toLocaleDateString()} {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>

                            <div className="space-y-1">
                              <h4 className="text-xs font-semibold text-slate-900 leading-snug">
                                {n.title}
                              </h4>
                              <p className="text-xs text-slate-600 leading-relaxed font-sans font-medium">
                                {n.message}
                              </p>
                            </div>

                            {n.metadata?.commitment_id && (
                              <div className="inline-flex items-center text-[10px] font-mono bg-purple-50 text-purple-700 px-2 py-0.5 rounded mt-1 border border-purple-100">
                                <span className="w-1 h-1 rounded-full bg-purple-400 mr-1 animate-ping" />
                                Interactive Commitment: Action Recommended
                              </div>
                            )}
                          </div>

                          <div className="flex sm:flex-col items-center justify-end gap-2 shrink-0 border-t sm:border-t-0 border-slate-100 pt-3 sm:pt-0">
                            {n.status === "UNREAD" && (
                              <button
                                onClick={() => handleMarkAsRead(n.id)}
                                disabled={isActionsDisabled}
                                className="w-full sm:w-auto px-2.5 py-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-150 inline-flex items-center justify-center text-2xs text-slate-700 font-bold font-mono rounded-lg transition cursor-pointer disabled:opacity-50"
                              >
                                <Check className="w-3.5 h-3.5 mr-1 text-emerald-500" />
                                Mark Read
                              </button>
                            )}

                            {n.status === "READ" && (
                              <button
                                onClick={() => handleMarkAsArchived(n.id)}
                                disabled={isActionsDisabled}
                                className="w-full sm:w-auto px-2.5 py-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-150 inline-flex items-center justify-center text-2xs text-slate-600 font-bold font-mono rounded-lg transition cursor-pointer disabled:opacity-50"
                              >
                                <Archive className="w-3.5 h-3.5 mr-1 text-amber-500" />
                                Archive
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
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
