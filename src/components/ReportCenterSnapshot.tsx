// MyKerani — Phase 2D.2 Financial Report Center Redesign.
//
// Section 1 (Financial Snapshot) + Section 2 (Popular Reports grid) of the
// new Report Center layout. Presentation-only: every figure passed in is
// already computed by FinancialReportsAnalytics.tsx from the existing
// engines (report bucket aggregator, cash/bank balances). This component
// computes nothing itself.

import React from "react";
import { TrendingUp, ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";

export interface PopularReportItem {
  key: string;
  emoji: string;
  label: string;
}

export const POPULAR_REPORTS: PopularReportItem[] = [
  { key: "profit_loss", emoji: "💰", label: "Untung & Rugi" },
  { key: "income_analysis", emoji: "📈", label: "Analisis Pendapatan" },
  { key: "expense_analysis", emoji: "💸", label: "Analisis Perbelanjaan" },
  { key: "cash_flow_v1", emoji: "🏦", label: "Aliran Tunai" },
];

export interface ReportCenterSnapshotProps {
  netProfit: number;
  currentCash: number;
  onSelectPopularReport: (key: string) => void;
}

export const ReportCenterSnapshot: React.FC<ReportCenterSnapshotProps> = ({
  netProfit,
  currentCash,
  onSelectPopularReport,
}) => {
  const profitPositive = netProfit >= 0;

  return (
    <div className="space-y-4" id="report_center_snapshot">
      {/* Section 1 — Financial Snapshot */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className={`rounded-2xl border p-3.5 ${profitPositive ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"}`} id="snapshot_net_profit">
          <div className="flex items-center gap-1.5">
            <span className="text-base leading-none">💰</span>
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">Untung Bersih</span>
          </div>
          <p className={`text-lg font-mono font-bold mt-1.5 ${profitPositive ? "text-emerald-700" : "text-rose-700"}`}>
            RM {Math.abs(netProfit).toLocaleString("en-MY", { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[9px] text-slate-500 mt-0.5 flex items-center gap-0.5">
            {profitPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
            {profitPositive ? "Untung" : "Rugi"}
          </span>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3.5" id="snapshot_current_cash">
          <div className="flex items-center gap-1.5">
            <span className="text-base leading-none">🏦</span>
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">Tunai Semasa</span>
          </div>
          <p className="text-lg font-mono font-bold text-blue-700 mt-1.5">
            RM {currentCash.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[9px] text-slate-500 mt-0.5 flex items-center gap-0.5">
            <Wallet className="w-3 h-3" />
            Tunai + Bank
          </span>
        </div>
      </div>

      {/* Section 2 — Popular Reports */}
      <div className="space-y-2" id="report_center_popular">
        <p className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider px-0.5">
          Laporan Popular
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          {POPULAR_REPORTS.map((item) => (
            <button
              key={item.key}
              onClick={() => onSelectPopularReport(item.key)}
              className="rounded-2xl border border-slate-200 bg-white p-3.5 flex flex-col items-start gap-1 hover:border-slate-300 hover:shadow-sm transition cursor-pointer text-left"
              id={`popular_report_${item.key}`}
            >
              <span className="text-xl leading-none">{item.emoji}</span>
              <span className="text-[11px] font-semibold text-slate-800 leading-tight">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
