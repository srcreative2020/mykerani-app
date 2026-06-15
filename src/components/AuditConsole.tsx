import React, { useState, useMemo } from "react";
import { useAudit } from "../context/AuditContext";
import { usePermission } from "../context/PermissionContext";
import { useAuth } from "../context/AuthContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { 
  Search, 
  Filter, 
  Clock, 
  Database, 
  ShieldCheck, 
  HelpCircle, 
  Calendar,
  AlertCircle,
  FileText,
  User,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Tag,
  Building,
  RefreshCw,
  Info
} from "lucide-react";
import { type AuditLogEntry } from "../types";

export const AuditConsole: React.FC = () => {
  const { auditLogs, loading, error, fetchAuditLogs } = useAudit();
  const { hasPermission } = usePermission();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedModule, setSelectedModule] = useState<string>("ALL");
  const [selectedAction, setSelectedAction] = useState<string>("ALL");
  const [timePeriod, setTimePeriod] = useState<"ALL" | "TODAY" | "WEEK" | "MONTH">("ALL");
  
  // Expanded audit entries mapping (id -> boolean) to view JSON payload compare
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedLogs(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleRefresh = async () => {
    await fetchAuditLogs();
  };

  // 1. FILTER BY MODULE-LEVEL AUTHORIZATION 
  // Safety rule: Users can only see audit records for components they have permission to read!
  const authorizedLogs = useMemo(() => {
    return auditLogs.filter(log => {
      // HQ Permissions Suite itself requires no direct restriction other than standard read checks
      return hasPermission(log.module, "read");
    });
  }, [auditLogs, hasPermission]);

  // 2. APPLY SEARCH & META FILTERS
  const filteredLogs = useMemo(() => {
    return authorizedLogs.filter(log => {
      // Search matches email, user role, action, or JSON contents
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = 
        log.userEmail.toLowerCase().includes(searchLower) ||
        log.userRole.toLowerCase().includes(searchLower) ||
        log.action.toLowerCase().includes(searchLower) ||
        (log.oldValue && JSON.stringify(log.oldValue).toLowerCase().includes(searchLower)) ||
        (log.newValue && JSON.stringify(log.newValue).toLowerCase().includes(searchLower));

      // Module match
      const matchesModule = selectedModule === "ALL" || log.module === selectedModule;

      // Action match
      const matchesAction = selectedAction === "ALL" || log.action === selectedAction;

      // Time match
      let matchesTime = true;
      if (timePeriod !== "ALL") {
        const logDate = new Date(log.timestamp);
        const now = new Date();
        if (timePeriod === "TODAY") {
          matchesTime = logDate.toDateString() === now.toDateString();
        } else if (timePeriod === "WEEK") {
          const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          matchesTime = logDate >= sevenDaysAgo;
        } else if (timePeriod === "MONTH") {
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          matchesTime = logDate >= thirtyDaysAgo;
        }
      }

      return matchesSearch && matchesModule && matchesAction && matchesTime;
    });
  }, [authorizedLogs, searchQuery, selectedModule, selectedAction, timePeriod]);

  // Statistics calculation
  const stats = useMemo(() => {
    const total = filteredLogs.length;
    const creates = filteredLogs.filter(l => l.action === "CREATE").length;
    const updates = filteredLogs.filter(l => l.action === "UPDATE").length;
    const deletes = filteredLogs.filter(l => l.action === "DELETE").length;

    return { total, creates, updates, deletes };
  }, [filteredLogs]);

  // Render change highlights cleanly
  const renderComparisonValue = (oldVal: any, newVal: any) => {
    if (!oldVal && !newVal) return <span className="text-slate-400 font-sans italic">No payload metadata</span>;
    
    // If it's a creation event, just list key values
    if (!oldVal && newVal) {
      return (
        <div className="bg-emerald-50/50 p-3 rounded-lg border border-emerald-100 text-xs font-mono space-y-1">
          <p className="text-emerald-800 font-semibold mb-1">Created Record State:</p>
          {Object.entries(newVal).map(([k, v]) => {
            if (typeof v === "object" || v === null) return null;
            return (
              <div key={k} className="flex justify-between py-0.5 border-b border-emerald-200/30">
                <span className="text-slate-500 font-semibold">{k}:</span>
                <span className="text-emerald-700 font-bold">{String(v)}</span>
              </div>
            );
          })}
        </div>
      );
    }

    // If it's a deletion event
    if (oldVal && !newVal) {
      return (
        <div className="bg-rose-50/50 p-3 rounded-lg border border-rose-100/60 text-xs font-mono space-y-1">
          <p className="text-rose-800 font-semibold mb-1">Deleted Record Archive:</p>
          {Object.entries(oldVal).map(([k, v]) => {
            if (typeof v === "object" || v === null) return null;
            return (
              <div key={k} className="flex justify-between py-0.5 border-b border-rose-200/30">
                <span className="text-slate-500 font-semibold">{k}:</span>
                <span className="text-rose-700 font-bold line-through">{String(v)}</span>
              </div>
            );
          })}
        </div>
      );
    }

    // Otherwise, generate delta difference highlights
    const deltaKeys = new Set([...Object.keys(oldVal), ...Object.keys(newVal)]);
    const changes: React.ReactNode[] = [];

    deltaKeys.forEach(k => {
      // Skip internal complex sub-objects
      if (typeof oldVal[k] === "object" || typeof newVal[k] === "object") return;
      if (oldVal[k] !== newVal[k]) {
        changes.push(
          <div key={k} className="grid grid-cols-12 gap-2 py-1.5 border-b border-slate-100 items-center">
            <span className="col-span-3 text-slate-500 font-semibold truncate capitalize">{k}</span>
            <div className="col-span-4 bg-rose-50 text-rose-700 p-1 px-1.5 rounded text-right line-through truncate font-bold">
              {oldVal[k] !== undefined ? String(oldVal[k]) : "Ø"}
            </div>
            <div className="col-span-1 text-center text-slate-400">
              <ArrowRight className="w-3.5 h-3.5 mx-auto" />
            </div>
            <div className="col-span-4 bg-emerald-50 text-emerald-800 p-1 px-1.5 rounded text-left truncate font-bold">
              {newVal[k] !== undefined ? String(newVal[k]) : "Ø"}
            </div>
          </div>
        );
      }
    });

    if (changes.length === 0) {
      return <div className="text-xs text-slate-400 italic">No direct property values were modified in this session turn.</div>;
    }

    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-600">Trace Log Attribute Delta Comparison:</p>
        <div className="border border-slate-150 rounded-xl p-3 bg-slate-50/50 space-y-1 text-xs font-mono">
          {changes}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6" id="audit_console_stage">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <h2 className="font-display font-bold text-slate-900 text-xl flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
            Immutable Audit Trail Engine
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            Financial operations traceability ledger. Records are digitally isolated per active enterprise tenant and cryptographically protected from tampering or deletion.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-emerald-700 bg-emerald-50 hover:bg-emerald-100/85 border border-emerald-200/50 rounded-lg font-semibold transition cursor-pointer"
            id="audit_reload_trigger"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Sync Ledger State
          </button>
          
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider font-mono text-slate-600 bg-slate-100 rounded-md border border-slate-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Compliance Enforced
          </div>
        </div>
      </div>

      {/* STATS TILES */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" id="audit_analytics_dashboard">
        <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 text-left">
          <p className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider">Indexed Actions</p>
          <p className="text-2xl font-semibold text-slate-800 mt-0.5">{stats.total}</p>
          <div className="mt-1.5 text-[10px] text-slate-500 font-sans">Filtered record transactions</div>
        </div>

        <div className="bg-emerald-50/20 border border-emerald-150 rounded-xl p-4 text-left">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-mono text-emerald-600 uppercase font-bold tracking-wider">Creations</p>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">C</span>
          </div>
          <p className="text-2xl font-semibold text-emerald-800 mt-0.5">{stats.creates}</p>
          <div className="mt-1.5 text-[10px] text-emerald-600/70 font-sans">Record expansions added</div>
        </div>

        <div className="bg-indigo-50/20 border border-indigo-150 rounded-xl p-4 text-left">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-mono text-indigo-600 uppercase font-bold tracking-wider">Modifications</p>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800">U</span>
          </div>
          <p className="text-2xl font-semibold text-indigo-800 mt-0.5">{stats.updates}</p>
          <div className="mt-1.5 text-[10px] text-indigo-600/70 font-sans">Controlled item adjustments</div>
        </div>

        <div className="bg-rose-50/20 border border-rose-150 rounded-xl p-4 text-left">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-mono text-rose-500 uppercase font-bold tracking-wider">Deletions</p>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800">D</span>
          </div>
          <p className="text-2xl font-semibold text-rose-800 mt-0.5">{stats.deletes}</p>
          <div className="mt-1.5 text-[10px] text-rose-600/70 font-sans">Archived records deleted</div>
        </div>
      </div>

      {/* SEARCH AND FILTERS TOOLBAR */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-4 text-left shadow-2xs" id="audit_filtering_panel">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Search Box */}
          <div className="md:col-span-5 relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="Search by trace email, system values..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-slate-50/50"
              id="audit_search_input"
            />
          </div>

          {/* Module Selector */}
          <div className="md:col-span-3">
            <select
              value={selectedModule}
              onChange={(e) => setSelectedModule(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-slate-50/50"
              id="audit_module_filter"
            >
              <option value="ALL">All Financial Modules</option>
              <option value="Financial Records">Financial Records</option>
              <option value="Financial Commitments">Financial Commitments</option>
              <option value="Financial Evidence Package">Financial Evidence Package</option>
            </select>
          </div>

          {/* Action Selector */}
          <div className="md:col-span-2">
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-slate-50/50"
              id="audit_action_filter"
            >
              <option value="ALL">All Actions</option>
              <option value="CREATE">CREATE</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>

          {/* Timeframe Selector */}
          <div className="md:col-span-2">
            <select
              value={timePeriod}
              onChange={(e) => setTimePeriod(e.target.value as any)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-slate-50/50"
              id="audit_time_filter"
            >
              <option value="ALL">Lifetime</option>
              <option value="TODAY">Today</option>
              <option value="WEEK">Past 7 Days</option>
              <option value="MONTH">Past 30 Days</option>
            </select>
          </div>
        </div>
      </div>

      {/* CORE AUDIT TRAILS CHRONOLOGICAL TIMELINE */}
      <div className="space-y-4" id="audit_logs_timeline_view">
        {loading ? (
          <div className="py-16 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
            <p className="text-xs text-slate-400 font-sans">Retrieving secure ledgers, verifying keys...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-16 text-center border-2 border-dashed border-slate-150 rounded-2xl bg-slate-50/50 space-y-3">
            <div className="p-3 bg-slate-100 text-slate-400 rounded-full w-fit mx-auto">
              <Database className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <p className="font-display font-semibold text-slate-800 text-sm">No Trace Entries Logged</p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto font-sans">
                Could not find any audit records matching your configured filters. Ensure you have authorized clearance to read these items.
              </p>
            </div>
          </div>
        ) : (
          <div className="relative border-l border-slate-200 pl-6 ml-3 space-y-6 text-left">
            {filteredLogs.map((log) => {
              const isOpen = !!expandedLogs[log.id];
              const logTime = new Date(log.timestamp);
              
              // Resolve visual accent badges for operations
              let actionBadgeColor = "text-emerald-700 bg-emerald-50 border-emerald-100";
              if (log.action === "UPDATE") actionBadgeColor = "text-indigo-700 bg-indigo-50 border-indigo-100";
              if (log.action === "DELETE") actionBadgeColor = "text-rose-700 bg-rose-50 border-rose-100";

              return (
                <div key={log.id} className="relative group transition" id={`audit_line_${log.id}`}>
                  {/* Outer pointer circle */}
                  <span className={`absolute -left-[31px] top-1.5 w-2.5 h-2.5 rounded-full border-2 bg-white transition ${
                    log.action === "CREATE" ? "border-emerald-500 scale-110" :
                    log.action === "UPDATE" ? "border-indigo-500" : "border-rose-500"
                  }`}></span>

                  <div className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-4 shadow-3xs hover:shadow-2xs transition">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      
                      {/* Left: General Transaction Context */}
                      <div className="space-y-1 z-10">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center text-[10px] font-mono font-bold tracking-wide px-2 py-0.5 rounded border ${actionBadgeColor}`}>
                            {log.action}
                          </span>
                          <span className="text-xs font-semibold text-slate-800">
                            {log.module}
                          </span>
                          <span className="text-[10px] text-slate-400 font-sans">• ID: {log.id.substring(0, 10)}...</span>
                        </div>

                        {/* Account or Entity Name indicator */}
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className="text-xs text-slate-500 flex items-center gap-1 font-sans">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            <strong>{log.userEmail}</strong>
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.2 select-none uppercase font-mono text-slate-500 bg-slate-100 rounded border border-slate-200">
                            {log.userRole}
                          </span>
                        </div>
                      </div>

                      {/* Right: Timestamp & Interactive details toggle */}
                      <div className="sm:text-right flex sm:flex-col justify-between sm:justify-start items-center sm:items-end gap-2 shrink-0">
                        <span className="text-[11px] text-slate-400 flex items-center gap-1.5 font-mono">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          {logTime.toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour12: false })} MYT
                        </span>
                        
                        <button
                          onClick={() => toggleExpand(log.id)}
                          className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold inline-flex items-center gap-0.5 cursor-pointer select-none bg-emerald-50/50 hover:bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100"
                          id={`toggle_details_${log.id}`}
                        >
                          {isOpen ? (
                            <>
                              Hide Ledger Trace
                              <ChevronUp className="w-3.5 h-3.5" />
                            </>
                          ) : (
                            <>
                              Analyze Payload Delta
                              <ChevronDown className="w-3.5 h-3.5" />
                            </>
                          )}
                        </button>
                      </div>

                    </div>

                    {/* EXPANDABLE DELTA ATTRIBUTES PANEL */}
                    {isOpen && (
                      <div className="mt-4 pt-4 border-t border-slate-100 animate-slide-down space-y-3">
                        {renderComparisonValue(log.oldValue, log.newValue)}
                        
                        {/* Audit Log Properties Footer */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[10px] font-mono text-slate-400 bg-slate-50 p-2.5 rounded-lg border border-slate-200/60 leading-relaxed">
                          <p>{"-\u003e SECURITY TENANT KEY: "}{log.tenantId}</p>
                          <p>{"-\u003e REFERENCE WORKSPACE: "}{log.workspaceId || "TENANT GLOBAL_BOUND"}</p>
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};
