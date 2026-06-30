// MyKerani — Profit & Loss V1 (built on Report Foundation Sprint V1)
//
// Single source of truth for all P&L math: reportBucketAggregator.ts's
// buildReportBuckets() + getProfitAndLossSubtotals(). This component never
// recomputes Revenue/Cost of Sales/Gross Profit/Operating Expenses/Operating
// Profit itself — it only filters by date range, then reads the numbers.
//
// Mounted as a 9th report tab inside FinancialReportsAnalytics.tsx. Does not
// redesign the dashboard, does not build Balance Sheet or Cash Flow.

import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { TrendingUp, TrendingDown, X, FileText, Receipt, Layers, Sparkles } from "lucide-react";
import type { FinancialEvent, FinancialEvidencePackage } from "../types";
import { buildReportBuckets, getProfitAndLossSubtotals, type BucketedRecord, type ReportBuckets } from "../lib/reportBucketAggregator";
import { buildEvidenceIndex, getDrilldownForRecords, type EvidenceIndex } from "../lib/evidenceDrilldown";

type PeriodMode = "current_month" | "last_month" | "custom";

type PnlLine = "REVENUE" | "COST_OF_SALES" | "GROSS_PROFIT" | "OPERATING_EXPENSES" | "OPERATING_PROFIT";

interface PnlNumbers {
  revenue: number;
  costOfSales: number;
  grossProfit: number;
  operatingExpenses: number;
  operatingProfit: number;
}

function monthRange(year: number, monthIndex0: number): { from: Date; to: Date } {
  const from = new Date(year, monthIndex0, 1);
  const to = new Date(year, monthIndex0 + 1, 0);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

function getPeriodRange(mode: PeriodMode, customFrom: string, customTo: string, today: Date): { from: Date; to: Date } {
  if (mode === "current_month") return monthRange(today.getFullYear(), today.getMonth());
  if (mode === "last_month") return monthRange(today.getFullYear(), today.getMonth() - 1);
  // custom
  const from = customFrom ? new Date(customFrom + "T00:00:00") : monthRange(today.getFullYear(), today.getMonth()).from;
  const to = customTo ? new Date(customTo + "T23:59:59") : monthRange(today.getFullYear(), today.getMonth()).to;
  return { from, to };
}

/** The period immediately preceding `range`, of the same length — used only for the explanation narrative, never for the headline numbers. */
function getPrecedingPeriod(range: { from: Date; to: Date }): { from: Date; to: Date } {
  const lengthMs = range.to.getTime() - range.from.getTime();
  const to = new Date(range.from.getTime() - 1);
  const from = new Date(to.getTime() - lengthMs);
  return { from, to };
}

function inRange(dateStr: string, range: { from: Date; to: Date }): boolean {
  const d = new Date(dateStr + "T00:00:00");
  return d.getTime() >= range.from.getTime() && d.getTime() <= range.to.getTime();
}

function fmtMyr(n: number): string {
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("ms-MY", { day: "2-digit", month: "short", year: "numeric" });
}

const LAYER_A_LABELS: Record<PnlLine, string> = {
  REVENUE: "Jualan",
  COST_OF_SALES: "Kos Barang Jualan",
  GROSS_PROFIT: "Untung Kasar",
  OPERATING_EXPENSES: "Kos Operasi",
  OPERATING_PROFIT: "Untung Bersih",
};

const LAYER_B_LABELS: Record<PnlLine, string> = {
  REVENUE: "Revenue",
  COST_OF_SALES: "Cost of Sales",
  GROSS_PROFIT: "Gross Profit",
  OPERATING_EXPENSES: "Operating Expenses",
  OPERATING_PROFIT: "Operating Profit",
};

interface ProfitLossReportProps {
  financialEvents: FinancialEvent[];
  financialEvidencePackages: FinancialEvidencePackage[];
}

export const ProfitLossReport: React.FC<ProfitLossReportProps> = ({ financialEvents, financialEvidencePackages }) => {
  const [periodMode, setPeriodMode] = useState<PeriodMode>("current_month");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [layer, setLayer] = useState<"human" | "accounting">("human");
  const [selectedLine, setSelectedLine] = useState<PnlLine | null>(null);

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const currentRange = useMemo(() => getPeriodRange(periodMode, customFrom, customTo, today), [periodMode, customFrom, customTo, today]);
  const previousRange = useMemo(() => getPrecedingPeriod(currentRange), [currentRange]);

  // Filtering happens here, by date, on the raw FinancialEvent list only —
  // P&L lines (Revenue/Cost of Sales/Operating Expenses) are only ever
  // populated from FinancialEvent records in the aggregator; DebtRecord,
  // FinancialCommitment, AssetPurchase and OwnerTransaction all resolve to
  // Liabilities/Assets/Equity, so they are intentionally omitted here — this
  // is a Balance Sheet input set, not a P&L one.
  const eventsInCurrentRange = useMemo(
    () => financialEvents.filter((e) => inRange(e.date, currentRange)),
    [financialEvents, currentRange]
  );
  const eventsInPreviousRange = useMemo(
    () => financialEvents.filter((e) => inRange(e.date, previousRange)),
    [financialEvents, previousRange]
  );

  const currentBuckets: ReportBuckets = useMemo(
    () => buildReportBuckets({ financialEvents: eventsInCurrentRange, debtRecords: [], financialCommitments: [], assetPurchases: [], ownerTransactions: [] }),
    [eventsInCurrentRange]
  );
  const previousBuckets: ReportBuckets = useMemo(
    () => buildReportBuckets({ financialEvents: eventsInPreviousRange, debtRecords: [], financialCommitments: [], assetPurchases: [], ownerTransactions: [] }),
    [eventsInPreviousRange]
  );

  // The ONLY source of P&L numbers — never recomputed by hand here.
  const current: PnlNumbers = useMemo(() => getProfitAndLossSubtotals(currentBuckets), [currentBuckets]);
  const previous: PnlNumbers = useMemo(() => getProfitAndLossSubtotals(previousBuckets), [previousBuckets]);

  const evidenceIndex: EvidenceIndex = useMemo(() => buildEvidenceIndex(financialEvidencePackages), [financialEvidencePackages]);

  const linesForDrilldown: Record<Exclude<PnlLine, "GROSS_PROFIT" | "OPERATING_PROFIT">, BucketedRecord[]> = {
    REVENUE: currentBuckets.REVENUE,
    COST_OF_SALES: currentBuckets.COST_OF_SALES,
    OPERATING_EXPENSES: currentBuckets.OPERATING_EXPENSES,
  };

  const drilldownRecords: BucketedRecord[] = useMemo(() => {
    if (!selectedLine) return [];
    if (selectedLine === "GROSS_PROFIT") return [...currentBuckets.REVENUE, ...currentBuckets.COST_OF_SALES];
    if (selectedLine === "OPERATING_PROFIT") return [...currentBuckets.REVENUE, ...currentBuckets.COST_OF_SALES, ...currentBuckets.OPERATING_EXPENSES];
    return linesForDrilldown[selectedLine] || [];
  }, [selectedLine, currentBuckets]);

  const drilldownEntries = useMemo(() => getDrilldownForRecords(drilldownRecords, evidenceIndex), [drilldownRecords, evidenceIndex]);

  // Summary explanation — plain-language narrative comparing current vs.
  // immediately preceding period of equal length. Reads only the already-
  // computed PnlNumbers above; no separate calculation path.
  const explanation = useMemo(() => {
    const reasons: string[] = [];
    const profitDelta = current.operatingProfit - previous.operatingProfit;
    const revenueDelta = current.revenue - previous.revenue;
    const cogsDelta = current.costOfSales - previous.costOfSales;
    const opexDelta = current.operatingExpenses - previous.operatingExpenses;

    if (revenueDelta > 0) reasons.push("Jualan naik berbanding tempoh sebelumnya");
    else if (revenueDelta < 0) reasons.push("Jualan turun berbanding tempoh sebelumnya");

    if (cogsDelta > 0) reasons.push("Kos barang jualan meningkat");
    else if (cogsDelta < 0) reasons.push("Kos barang jualan menurun");

    if (opexDelta > 0) reasons.push("Kos operasi naik");
    else if (opexDelta < 0) reasons.push("Kos operasi turun");

    if (reasons.length === 0) {
      return { headline: "Tidak ada perubahan ketara berbanding tempoh sebelumnya.", reasons: [], profitDelta };
    }
    const headline = profitDelta >= 0
      ? "Untung meningkat kerana:"
      : "Untung menurun kerana:";
    return { headline, reasons, profitDelta };
  }, [current, previous]);

  const lineRow = (line: PnlLine, amount: number, opts: { indent?: boolean; bold?: boolean; tone?: "default" | "positive" | "negative" } = {}) => {
    const label = layer === "human" ? LAYER_A_LABELS[line] : LAYER_B_LABELS[line];
    const tone = opts.tone === "positive" ? "text-emerald-700" : opts.tone === "negative" ? "text-rose-700" : "text-slate-900";
    return (
      <button
        key={line}
        onClick={() => setSelectedLine(line)}
        id={`pnl_line_${line.toLowerCase()}`}
        className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border text-left transition hover:bg-slate-50 ${
          opts.bold ? "border-slate-300 bg-slate-50" : "border-slate-100"
        } ${opts.indent ? "ml-4" : ""}`}
      >
        <span className={`text-sm ${opts.bold ? "font-bold text-slate-950" : "font-medium text-slate-700"}`}>{label}</span>
        <span className={`text-sm font-mono ${opts.bold ? `font-bold ${tone}` : tone}`}>{fmtMyr(amount)}</span>
      </button>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in" id="report_profit_loss_view">
      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-2">
        {([
          { id: "current_month", label: "Bulan Ini" },
          { id: "last_month", label: "Bulan Lepas" },
          { id: "custom", label: "Tempoh Tersuai" },
        ] as { id: PeriodMode; label: string }[]).map((opt) => (
          <button
            key={opt.id}
            onClick={() => setPeriodMode(opt.id)}
            id={`pnl_period_${opt.id}`}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
              periodMode === opt.id ? "bg-slate-950 border-slate-950 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {opt.label}
          </button>
        ))}
        {periodMode === "custom" && (
          <div className="flex items-center gap-2 ml-2">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5" id="pnl_custom_from" />
            <span className="text-xs text-slate-400">hingga</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5" id="pnl_custom_to" />
          </div>
        )}
        <span className="text-xs text-slate-400 ml-auto font-mono">{fmtDate(currentRange.from)} — {fmtDate(currentRange.to)}</span>
      </div>

      {/* Layer toggle */}
      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-1 w-fit">
        <button
          onClick={() => setLayer("human")}
          id="pnl_layer_human"
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${layer === "human" ? "bg-white shadow-xs text-slate-950" : "text-slate-500"}`}
        >
          Bahasa Mudah
        </button>
        <button
          onClick={() => setLayer("accounting")}
          id="pnl_layer_accounting"
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${layer === "accounting" ? "bg-white shadow-xs text-slate-950" : "text-slate-500"}`}
        >
          Penyata Perakaunan Penuh
        </button>
      </div>

      {/* The statement itself */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="bg-slate-950 text-white px-4 py-3 flex items-center space-x-2">
          <Layers className="w-4 h-4" />
          <span className="text-sm font-bold">
            {layer === "human" ? "Penyata Untung Rugi (Bahasa Mudah)" : "Profit & Loss Statement"}
          </span>
        </div>
        <div className="p-3 space-y-1.5 bg-white">
          {lineRow("REVENUE", current.revenue, { tone: "positive" })}
          {lineRow("COST_OF_SALES", current.costOfSales, { tone: "negative" })}
          {lineRow("GROSS_PROFIT", current.grossProfit, { bold: true })}
          {lineRow("OPERATING_EXPENSES", current.operatingExpenses, { tone: "negative" })}
          {lineRow("OPERATING_PROFIT", current.operatingProfit, { bold: true, tone: current.operatingProfit >= 0 ? "positive" : "negative" })}
        </div>
      </div>

      {/* Summary explanation */}
      <div className={`p-4 rounded-xl border space-y-2 ${explanation.profitDelta >= 0 ? "bg-emerald-50 border-emerald-100" : "bg-rose-50 border-rose-100"}`}>
        <div className="flex items-center space-x-2">
          {explanation.profitDelta >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-600" /> : <TrendingDown className="w-4 h-4 text-rose-600" />}
          <span className="text-sm font-bold text-slate-900">{explanation.headline}</span>
        </div>
        {explanation.reasons.length > 0 && (
          <ul className="list-disc list-inside text-xs text-slate-700 space-y-1 ml-1">
            {explanation.reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        )}
        <p className="text-xs text-slate-500 font-mono">
          Berbanding {fmtDate(previousRange.from)} — {fmtDate(previousRange.to)} (perubahan untung: {fmtMyr(explanation.profitDelta)})
        </p>
      </div>

      <p className="text-xs text-slate-400 flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5" /> Klik mana-mana baris penyata di atas untuk melihat transaksi, resit, invois dan pakej bukti yang menyumbang kepada nilai tersebut.
      </p>

      {/* Drill-down drawer */}
      <AnimatePresence>
        {selectedLine && (
          <div className="fixed inset-0 z-50 overflow-hidden flex justify-end" id="pnl_drilldown_backdrop">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/40"
              onClick={() => setSelectedLine(null)}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", duration: 0.25 }}
              className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col"
              id="pnl_drilldown_panel"
            >
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-2xs font-mono uppercase text-slate-400 font-bold">Lihat Punca Nilai</p>
                  <h4 className="text-base font-bold text-slate-950">
                    {layer === "human" ? LAYER_A_LABELS[selectedLine] : LAYER_B_LABELS[selectedLine]}
                  </h4>
                </div>
                <button onClick={() => setSelectedLine(null)} id="pnl_drilldown_close" className="p-1.5 hover:bg-slate-100 rounded-lg">
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {drilldownEntries.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-10">Tiada transaksi dalam tempoh ini.</p>
                )}
                {drilldownEntries.map((entry) => (
                  <div key={entry.record.recordId} className="border border-slate-200 rounded-lg p-3 space-y-2" id={`pnl_drilldown_record_${entry.record.recordId}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-800">{entry.record.accountingName}</span>
                      <span className="text-xs font-mono font-bold text-slate-900">{fmtMyr(entry.record.amountMyr)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>{entry.record.date}</span>
                      <span className="font-mono">{entry.record.resolutionMethod}</span>
                    </div>
                    {entry.hasEvidence ? (
                      <div className="space-y-1 pt-1 border-t border-slate-100">
                        {entry.evidence.map((ev) => (
                          <div key={ev.id} className="flex items-center space-x-1.5 text-xs text-slate-600">
                            {ev.documentType === "INVOICE" ? <FileText className="w-3 h-3 text-blue-500" /> : <Receipt className="w-3 h-3 text-emerald-500" />}
                            <span>{ev.documentType} — {ev.fileName}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-amber-600 pt-1 border-t border-slate-100">Tiada pakej bukti dikaitkan</p>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
