import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Activity, Receipt, FileText, X, TrendingUp, TrendingDown } from "lucide-react";
import type { DebtRecord, FinancialCommitment, FinancialEvent, FinancialEvidencePackage } from "../types";
import { type AssetPurchase, type OwnerTransaction, loadAssetPurchases, loadOwnerTransactions } from "../lib/assetOwnerData";
import { buildReportBuckets, flattenBuckets, type BucketedRecord } from "../lib/reportBucketAggregator";
import { buildEvidenceIndex, getDrilldownForRecords, type DrilldownEntry } from "../lib/evidenceDrilldown";
import { getCashFlowActivityTotals, groupRecordsByActivity, type CashFlowActivity } from "../lib/cashFlowClassifier";

function fmtMyr(n: number): string {
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type PeriodMode = "current_month" | "last_month" | "custom";

function monthRange(year: number, monthIndex0: number) {
  const from = new Date(year, monthIndex0, 1);
  const to = new Date(year, monthIndex0 + 1, 0);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function getPeriodRange(mode: PeriodMode, customFrom: string, customTo: string, today: Date) {
  if (mode === "last_month") return monthRange(today.getFullYear(), today.getMonth() - 1);
  if (mode === "custom") return { from: customFrom, to: customTo };
  return monthRange(today.getFullYear(), today.getMonth());
}

function inRange(dateStr: string, range: { from: string; to: string }): boolean {
  if (!range.from || !range.to) return true;
  return dateStr >= range.from && dateStr <= range.to;
}

const ACTIVITY_LABELS: Record<CashFlowActivity, { human: string; accounting: string }> = {
  OPERATING: { human: "Wang Dari Operasi Harian", accounting: "Operating Activities" },
  INVESTING: { human: "Wang Untuk Beli Aset", accounting: "Investing Activities" },
  FINANCING: { human: "Wang Pinjaman & Modal Pemilik", accounting: "Financing Activities" },
};

interface CashFlowReportProps {
  financialEvents: FinancialEvent[];
  debtRecords: DebtRecord[];
  financialCommitments: FinancialCommitment[];
  financialEvidencePackages: FinancialEvidencePackage[];
  workspaceId?: string;
  isMockUser: boolean;
}

export const CashFlowReport: React.FC<CashFlowReportProps> = ({
  financialEvents,
  debtRecords,
  financialCommitments,
  financialEvidencePackages,
  workspaceId,
  isMockUser,
}) => {
  const [assetPurchases, setAssetPurchases] = useState<AssetPurchase[]>([]);
  const [ownerTransactions, setOwnerTransactions] = useState<OwnerTransaction[]>([]);
  const [periodMode, setPeriodMode] = useState<PeriodMode>("current_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [layer, setLayer] = useState<"human" | "accounting">("human");
  const [selectedActivity, setSelectedActivity] = useState<CashFlowActivity | null>(null);

  useEffect(() => {
    if (workspaceId) loadAssetPurchases(workspaceId).then(setAssetPurchases);
    if (workspaceId) loadOwnerTransactions(workspaceId).then(setOwnerTransactions);
  }, [workspaceId, isMockUser]);

  const today = useMemo(() => new Date(), []);
  const range = useMemo(() => getPeriodRange(periodMode, customFrom, customTo, today), [periodMode, customFrom, customTo, today]);

  const eventsInRange = useMemo(() => financialEvents.filter((e) => inRange(e.date, range)), [financialEvents, range]);
  const debtsInRange = useMemo(() => debtRecords.filter((d) => inRange(d.borrowedDate, range)), [debtRecords, range]);
  const commitmentsInRange = useMemo(() => financialCommitments.filter((c) => inRange(c.startDate, range)), [financialCommitments, range]);
  const assetsInRange = useMemo(() => assetPurchases.filter((a) => inRange(a.purchaseDate, range)), [assetPurchases, range]);
  const ownerTxnInRange = useMemo(() => ownerTransactions.filter((o) => inRange(o.transactionDate, range)), [ownerTransactions, range]);

  // The ONLY source of bucketed records this screen reads from — every
  // record kind is included since Cash Flow (unlike P&L) covers all 6
  // Level 1 groups, classified by activity via classifyCashFlowActivity().
  const buckets = useMemo(
    () => buildReportBuckets({ financialEvents: eventsInRange, debtRecords: debtsInRange, financialCommitments: commitmentsInRange, assetPurchases: assetsInRange, ownerTransactions: ownerTxnInRange }),
    [eventsInRange, debtsInRange, commitmentsInRange, assetsInRange, ownerTxnInRange]
  );
  const allRecords = useMemo(() => flattenBuckets(buckets), [buckets]);
  const totals = useMemo(() => getCashFlowActivityTotals(allRecords), [allRecords]);
  const groups = useMemo(() => groupRecordsByActivity(allRecords), [allRecords]);

  const evidenceIndex = useMemo(() => buildEvidenceIndex(financialEvidencePackages), [financialEvidencePackages]);
  const drilldownEntries: DrilldownEntry[] = useMemo(
    () => getDrilldownForRecords(selectedActivity ? groups[selectedActivity] : [], evidenceIndex),
    [selectedActivity, groups, evidenceIndex]
  );

  const activityLabel = (a: CashFlowActivity) => (layer === "human" ? ACTIVITY_LABELS[a].human : ACTIVITY_LABELS[a].accounting);

  const activityRow = (activity: CashFlowActivity, amount: number) => (
    <button
      type="button"
      id={`cf_activity_${activity.toLowerCase()}`}
      onClick={() => setSelectedActivity(activity)}
      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/5 transition rounded-lg active:scale-[0.98]"
    >
      <span className="text-sm text-white">{activityLabel(activity)}</span>
      <span className={`text-sm font-mono flex items-center space-x-1 ${amount >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
        {amount >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
        <span>{fmtMyr(amount)}</span>
      </span>
    </button>
  );

  return (
    <div className="space-y-6" id="cash_flow_report_root">
      <div className="flex flex-wrap items-center gap-2">
        <button id="cf_period_current_month" onClick={() => setPeriodMode("current_month")} className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition active:scale-[0.98] ${periodMode === "current_month" ? "bg-slate-950 border-slate-950 text-white" : "bg-white border-slate-200 text-slate-600"}`}>Bulan Ini</button>
        <button id="cf_period_last_month" onClick={() => setPeriodMode("last_month")} className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition active:scale-[0.98] ${periodMode === "last_month" ? "bg-slate-950 border-slate-950 text-white" : "bg-white border-slate-200 text-slate-600"}`}>Bulan Lepas</button>
        <button id="cf_period_custom" onClick={() => setPeriodMode("custom")} className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition active:scale-[0.98] ${periodMode === "custom" ? "bg-slate-950 border-slate-950 text-white" : "bg-white border-slate-200 text-slate-600"}`}>Tempoh Tersuai</button>
        {periodMode === "custom" && (
          <>
            <input id="cf_custom_from" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5" />
            <input id="cf_custom_to" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5" />
          </>
        )}
        <div className="flex-1" />
        <button id="cf_layer_human" onClick={() => setLayer("human")} className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition active:scale-[0.98] ${layer === "human" ? "bg-slate-950 border-slate-950 text-white" : "bg-white border-slate-200 text-slate-600"}`}>Mudah Faham</button>
        <button id="cf_layer_accounting" onClick={() => setLayer("accounting")} className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition active:scale-[0.98] ${layer === "accounting" ? "bg-slate-950 border-slate-950 text-white" : "bg-white border-slate-200 text-slate-600"}`}>Perakaunan</button>
      </div>

      <div className="bg-slate-950 rounded-2xl p-2" id="cash_flow_statement">
        <div className="px-4 py-3 border-b border-white/10 flex items-center space-x-2">
          <Activity className="w-4 h-4 text-indigo-400" />
          <span className="text-2xs font-mono uppercase tracking-wider text-slate-400">Penyata Aliran Tunai (Cash Flow)</span>
        </div>
        {activityRow("OPERATING", totals.operating)}
        {activityRow("INVESTING", totals.investing)}
        {activityRow("FINANCING", totals.financing)}
        <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between font-bold">
          <span className="text-sm text-white">{layer === "human" ? "Jumlah Aliran Tunai Bersih" : "Net Cash Flow"}</span>
          <span className={`text-sm font-mono ${totals.netCashFlow >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{fmtMyr(totals.netCashFlow)}</span>
        </div>
      </div>

      <AnimatePresence>
        {selectedActivity && (
          <motion.div className="fixed inset-0 z-50 overflow-hidden flex justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div id="cf_drilldown_backdrop" className="absolute inset-0 bg-slate-950/60" onClick={() => setSelectedActivity(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div id="cf_drilldown_panel" className="relative w-full max-w-md bg-white h-full overflow-y-auto p-6 space-y-4" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}>
              <div className="flex items-center justify-between">
                <h4 className="font-display font-bold text-slate-950">{activityLabel(selectedActivity)}</h4>
                <button id="cf_drilldown_close" onClick={() => setSelectedActivity(null)} className="p-1 hover:bg-slate-100 rounded-lg transition active:scale-95 cursor-pointer">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              {drilldownEntries.length === 0 && <p className="text-xs text-slate-400">Tiada rekod dalam tempoh ini.</p>}
              {drilldownEntries.map((entry: { record: BucketedRecord; evidence: FinancialEvidencePackage[]; hasEvidence: boolean }) => (
                <div key={entry.record.recordId} className="border border-slate-200 rounded-xl p-3 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-slate-900">{entry.record.humanFriendlyName}</span>
                    <span className="font-mono">{fmtMyr(entry.record.amountMyr)}</span>
                  </div>
                  <p className="text-2xs text-slate-400">{entry.record.date} · {entry.record.resolutionMethod}</p>
                  {entry.hasEvidence ? (
                    entry.evidence.map((ev) => (
                      <div key={ev.id} className="flex items-center space-x-2 text-xs text-slate-600">
                        {ev.documentType === "INVOICE" ? <FileText className="w-3.5 h-3.5" /> : <Receipt className="w-3.5 h-3.5" />}
                        <span>{ev.fileName}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-amber-600">Tiada pakej bukti dikaitkan.</p>
                  )}
                </div>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
