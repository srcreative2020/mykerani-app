import React, { useState, useEffect, useCallback } from "react";
import { getTenantResourceLedger, getConfigValue, getWorkspaceWallet, WorkspaceWallet } from "../lib/hqService";
import { Zap, ScanLine, HardDrive, FileText, LayoutList } from "lucide-react";

type LedgerRow = {
  txnId: string;
  creditType: string;
  activityType: string;
  amount: number;
  description: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  runningBalance: number;
  jobRef: string | null;
};

type Tab = "ALL" | "AI" | "OCR" | "STORAGE" | "BILLING";

const TAB_CONFIG: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }>; color: string }[] = [
  { id: "ALL",     label: "Semua",   icon: LayoutList, color: "text-slate-600" },
  { id: "AI",      label: "AI",      icon: Zap,        color: "text-amber-600" },
  { id: "OCR",     label: "OCR",     icon: ScanLine,   color: "text-violet-600" },
  { id: "STORAGE", label: "Storan",  icon: HardDrive,  color: "text-blue-600" },
  { id: "BILLING", label: "Bil",     icon: FileText,   color: "text-emerald-600" },
];

const ACTIVITY_LABEL: Record<string, string> = {
  ALLOCATION: "Tambah",
  USAGE:      "Guna",
  ADJUSTMENT: "Laras",
  REFUND:     "Pulang",
};

const CREDIT_COLOR: Record<string, string> = {
  AI:      "bg-amber-50 text-amber-700 border-amber-100",
  OCR:     "bg-violet-50 text-violet-700 border-violet-100",
  STORAGE: "bg-blue-50 text-blue-700 border-blue-100",
};

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

const DEFAULT_BILLING_RATES = {
  usdMyr: 4.45,
  markupAiPct: 300,
  markupOcrPct: 500,
  avgAiCostUsd: 0.002,
  avgOcrCostUsd: 0.001,
};

function estimateMyr(creditType: string, amount: number, rates: typeof DEFAULT_BILLING_RATES): string {
  if (creditType === "STORAGE" || amount >= 0) return "";
  const credits = Math.abs(amount);
  const costUsd = creditType === "AI"
    ? credits * rates.avgAiCostUsd * (1 + rates.markupAiPct / 100)
    : credits * rates.avgOcrCostUsd * (1 + rates.markupOcrPct / 100);
  const myr = costUsd * rates.usdMyr;
  return myr < 0.001 ? "<RM0.001" : `≈RM${myr.toFixed(4)}`;
}

export function TenantResourceLedger({ workspaceId }: { workspaceId: string }) {
  const [activeTab, setActiveTab] = useState<Tab>("ALL");
  const [allRows, setAllRows] = useState<LedgerRow[]>([]);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [billingRates, setBillingRates] = useState(DEFAULT_BILLING_RATES);
  const [wallet, setWallet] = useState<WorkspaceWallet | null>(null);

  // 5.1 — Load all rates from commercial_config_items (Single Source of Truth)
  useEffect(() => {
    Promise.all([
      getConfigValue("billing_usd_myr_rate"),
      getConfigValue("markup_ai_pct"),
      getConfigValue("markup_ocr_pct"),
      getConfigValue("avg_ai_cost_usd"),
      getConfigValue("avg_ocr_cost_usd"),
    ]).then(([usdMyrVal, aiPctVal, ocrPctVal, avgAiVal, avgOcrVal]) => {
      setBillingRates(prev => ({
        ...prev,
        usdMyr: (usdMyrVal as any)?.rate ?? prev.usdMyr,
        markupAiPct: (aiPctVal as any)?.pct ?? prev.markupAiPct,
        markupOcrPct: (ocrPctVal as any)?.pct ?? prev.markupOcrPct,
        avgAiCostUsd: (avgAiVal as any)?.cost ?? prev.avgAiCostUsd,
        avgOcrCostUsd: (avgOcrVal as any)?.cost ?? prev.avgOcrCostUsd,
      }));
    }).catch(() => {});
  }, []);

  // 5.5 — Load wallet baki from resource_wallets (not recalculated from ledger)
  useEffect(() => {
    if (!workspaceId) return;
    getWorkspaceWallet(workspaceId).then(setWallet).catch(() => {});
  }, [workspaceId]);

  const load = useCallback(async (tab: Tab) => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      // Always load ALL rows first to compute per-type badge counts (5.4)
      const all = await getTenantResourceLedger(workspaceId, undefined, 200, 0);
      setAllRows(all);
      const creditType = tab === "ALL" || tab === "BILLING" ? undefined : tab;
      const filtered = creditType ? all.filter(r => r.creditType === creditType) : all;
      setRows(tab === "BILLING" ? all.filter(r => r.activityType === "USAGE") : filtered);
    } catch {
      setError("Gagal memuatkan data ledger.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { load(activeTab); }, [activeTab, load]);

  // 5.4 — Badge counts per tab from allRows
  const counts: Record<Tab, number> = {
    ALL:     allRows.length,
    AI:      allRows.filter(r => r.creditType === "AI").length,
    OCR:     allRows.filter(r => r.creditType === "OCR").length,
    STORAGE: allRows.filter(r => r.creditType === "STORAGE").length,
    BILLING: allRows.filter(r => r.activityType === "USAGE").length,
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">

      {/* 5.5 — Summary Bar: baki dari resource_wallets */}
      {wallet && (
        <div className="px-4 pt-4 pb-3 border-b border-slate-100 grid grid-cols-3 gap-3">
          <div className="bg-amber-50 rounded-xl p-3 text-center">
            <Zap className="w-4 h-4 text-amber-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-amber-700 leading-tight">{wallet.aiCreditsBalance.toLocaleString()}</p>
            <p className="text-2xs text-amber-500 font-medium">Kredit AI</p>
          </div>
          <div className="bg-violet-50 rounded-xl p-3 text-center">
            <ScanLine className="w-4 h-4 text-violet-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-violet-700 leading-tight">{wallet.ocrCreditsBalance.toLocaleString()}</p>
            <p className="text-2xs text-violet-500 font-medium">Kredit OCR</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-3 text-center">
            <HardDrive className="w-4 h-4 text-blue-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-blue-700 leading-tight">{(wallet.storageUsedBytes / 1048576).toFixed(2)}</p>
            <p className="text-2xs text-blue-500 font-medium">MB Digunakan</p>
          </div>
        </div>
      )}

      <div className="px-4 pt-4 pb-0">
        <p className="text-sm font-bold text-slate-900 mb-3">Ledger Penggunaan Sumber</p>

        {/* 5.4 — Tab Navigation with badge counts */}
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
            Tiada rekod ledger untuk tempoh ini.
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
                    <span className={`text-2xs font-bold px-1.5 py-0.5 rounded border ${CREDIT_COLOR[row.creditType] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
                      {row.creditType}
                    </span>
                    <span className="text-2xs text-slate-400">
                      {ACTIVITY_LABEL[row.activityType] ?? row.activityType}
                    </span>
                    {row.jobRef && (
                      <span className="text-2xs text-slate-400 font-mono truncate max-w-[80px]">{row.jobRef}</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-700 leading-tight truncate">{row.description}</p>
                  <p className="text-2xs text-slate-400 mt-0.5">{formatDate(row.createdAt)}</p>
                </div>
                <div className="text-right shrink-0">
                  {/* 5.3 — STORAGE: formatBytes; 5.2 — AI/OCR USAGE: show MYR estimate */}
                  <p className={`text-sm font-bold ${row.amount < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    {row.creditType === "STORAGE"
                      ? (row.amount >= 0 ? "+" : "") + formatBytes(row.amount)
                      : (row.amount < 0 ? "" : "+") + row.amount}
                  </p>
                  {row.creditType !== "STORAGE" && (
                    <p className="text-2xs text-amber-600 font-medium">{estimateMyr(row.creditType, row.amount, billingRates)}</p>
                  )}
                  <p className="text-2xs text-slate-400">
                    {row.creditType === "STORAGE" ? formatBytes(row.runningBalance) : `Baki: ${row.runningBalance.toFixed(0)}`}
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
