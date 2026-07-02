import React, { useState, useEffect, useCallback } from "react";
import { getTenantResourceLedger } from "../lib/hqService";
import { Zap, ScanLine, HardDrive, FileText, LayoutList } from "lucide-react";

// Business-language mappings — tenant never sees internal enum values
const FEATURE_LABEL: Record<string, string> = {
  AI:      "AI Financial Assistant",
  OCR:     "Muka Surat Penyata Bank",
  STORAGE: "Penggunaan Storan",
};

const FEATURE_COLOR: Record<string, string> = {
  AI:      "bg-amber-50 text-amber-700 border-amber-100",
  OCR:     "bg-violet-50 text-violet-700 border-violet-100",
  STORAGE: "bg-blue-50 text-blue-700 border-blue-100",
};

const ACTIVITY_LABEL: Record<string, string> = {
  ALLOCATION: "Ditambah",
  USAGE:      "Digunakan",
  ADJUSTMENT: "Diselaraskan",
  REFUND:     "Dipulangkan",
};

type UsageRow = {
  txnId: string;
  creditType: string;
  activityType: string;
  amount: number;
  description: string;
  createdAt: string;
  runningBalance: number;
};

type Tab = "ALL" | "AI" | "OCR" | "STORAGE" | "BILLING";

const TAB_CONFIG: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }>; color: string }[] = [
  { id: "ALL",     label: "Semua",                    icon: LayoutList, color: "text-slate-600" },
  { id: "AI",      label: "AI Financial Assistant",   icon: Zap,        color: "text-amber-600" },
  { id: "OCR",     label: "Penyata Bank",             icon: ScanLine,   color: "text-violet-600" },
  { id: "STORAGE", label: "Storan",                   icon: HardDrive,  color: "text-blue-600" },
  { id: "BILLING", label: "Bil",                      icon: FileText,   color: "text-emerald-600" },
];

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("ms-MY", { day: "2-digit", month: "short", year: "numeric" }) +
    " " + d.toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit" });
}

function formatBytes(bytes: number): string {
  const abs = Math.abs(bytes);
  if (abs >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
  if (abs >= 1048576)    return `${(bytes / 1048576).toFixed(2)} MB`;
  if (abs >= 1024)       return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatAmount(row: UsageRow): string {
  if (row.creditType === "STORAGE") {
    return (row.amount >= 0 ? "+" : "") + formatBytes(row.amount);
  }
  // AI/OCR: show units in business language
  const prefix = row.amount < 0 ? "" : "+";
  const abs = Math.abs(row.amount);
  const unit = row.creditType === "AI" ? "penggunaan" : "muka surat";
  return `${prefix}${row.amount < 0 ? "-" : ""}${abs} ${unit}`;
}

function formatRunningBalance(row: UsageRow): string {
  if (row.creditType === "STORAGE") return formatBytes(row.runningBalance);
  const unit = row.creditType === "AI" ? "penggunaan" : "muka surat";
  return `Baki: ${Math.round(row.runningBalance)} ${unit}`;
}

export function UsageHistory({ workspaceId }: { workspaceId: string }) {
  const [activeTab, setActiveTab] = useState<Tab>("ALL");
  const [allRows, setAllRows] = useState<UsageRow[]>([]);
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (tab: Tab) => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const all = await getTenantResourceLedger(workspaceId, undefined, 200, 0);
      setAllRows(all);
      const filtered = (tab === "ALL" || tab === "BILLING")
        ? all
        : all.filter(r => r.creditType === tab);
      setRows(tab === "BILLING" ? all.filter(r => r.activityType === "USAGE") : filtered);
    } catch {
      setError("Gagal memuatkan sejarah penggunaan.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { load(activeTab); }, [activeTab, load]);

  const counts: Record<Tab, number> = {
    ALL:     allRows.length,
    AI:      allRows.filter(r => r.creditType === "AI").length,
    OCR:     allRows.filter(r => r.creditType === "OCR").length,
    STORAGE: allRows.filter(r => r.creditType === "STORAGE").length,
    BILLING: allRows.filter(r => r.activityType === "USAGE").length,
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-0">
        <p className="text-sm font-bold text-slate-900 mb-3">Sejarah Penggunaan</p>

        <div className="flex gap-1 overflow-x-auto scrollbar-none pb-3">
          {TAB_CONFIG.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            const count = counts[tab.id];
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-2xs font-semibold whitespace-nowrap transition cursor-pointer border ${
                  active
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <Icon className={`w-3 h-3 ${active ? "text-white" : tab.color}`} />
                {tab.label}
                {count > 0 && (
                  <span className={`text-2xs px-1 rounded-full font-bold ${
                    active ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 pb-4">
        {loading && (
          <div className="py-8 text-center text-xs text-slate-400">Memuatkan...</div>
        )}
        {error && (
          <div className="py-4 text-center text-xs text-red-500">{error}</div>
        )}
        {!loading && !error && rows.length === 0 && (
          <div className="py-8 text-center text-xs text-slate-400">
            Tiada rekod penggunaan untuk tempoh ini.
          </div>
        )}
        {!loading && !error && rows.length > 0 && (
          <div className="space-y-2 mt-1">
            {rows.map(row => (
              <div
                key={row.txnId}
                className="flex items-start justify-between p-3 rounded-xl border border-slate-100 bg-slate-50/50 gap-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    <span className={`text-2xs font-bold px-1.5 py-0.5 rounded border ${FEATURE_COLOR[row.creditType] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
                      {FEATURE_LABEL[row.creditType] ?? row.creditType}
                    </span>
                    <span className="text-2xs text-slate-400">
                      {ACTIVITY_LABEL[row.activityType] ?? "Aktiviti"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 leading-tight truncate">{row.description}</p>
                  <p className="text-2xs text-slate-400 mt-0.5">{formatDate(row.createdAt)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-bold ${row.amount < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    {formatAmount(row)}
                  </p>
                  <p className="text-2xs text-slate-400">
                    {formatRunningBalance(row)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
