// MyKerani — Phase 2D.2 Financial Report Center Redesign.
//
// Section 1 (Financial Snapshot) + Section 2 (Popular Reports grid) of the
// new Report Center layout. Presentation-only: every figure passed in is
// already computed by FinancialReportsAnalytics.tsx from the existing
// engines (report bucket aggregator, cash/bank balances). This component
// computes nothing itself.

import React from "react";
import { ArrowDownLeft, ArrowUpRight, Wallet, ChevronRight } from "lucide-react";

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

// Phase 2D.3A — Problem 2: each Popular Report tile now shows its live
// computed summary value (sourced from the exact same totals
// FinancialReportsAnalytics.tsx already computes for the full detail report
// — no new aggregation logic here). Undefined entries fall back to no value
// line (tile still works, just without a number).
export interface PopularReportValues {
  profit_loss?: number;
  income_analysis?: number;
  expense_analysis?: number;
  cash_flow_v1?: number;
}

export interface ReportCenterSnapshotProps {
  netProfit: number;
  currentCash: number;
  onSelectPopularReport: (key: string) => void;
  // Phase 2D.3 — Actionable Report Center: optional slot rendered between
  // Section 1 (Financial Snapshot cards immediately above) and Section 2
  // (Popular Reports grid immediately below), so the new "Top 3 Actions
  // Required" section can sit exactly where the spec requires without
  // duplicating this component's layout/markup.
  topActionsSlot?: React.ReactNode;
  // Phase 2D.3A — Problem 1: Financial Snapshot cards are now tappable.
  onOpenNetProfit?: () => void;
  onOpenCurrentCash?: () => void;
  // Phase 2D.3A — Problem 1: "Tiada Akaun Bank Direkodkan" state when no
  // cash/bank account is on record at all (vs. a real RM0.00 balance).
  hasAnyAccount: boolean;
  onAddBankAccount?: () => void;
  // Phase 2D.3A — Problem 2 popular-report live values.
  popularValues?: PopularReportValues;
}

export const ReportCenterSnapshot: React.FC<ReportCenterSnapshotProps> = ({
  netProfit,
  currentCash,
  onSelectPopularReport,
  topActionsSlot,
  onOpenNetProfit,
  onOpenCurrentCash,
  hasAnyAccount,
  onAddBankAccount,
  popularValues,
}) => {
  const profitPositive = netProfit >= 0;

  const formatRm = (value: number | undefined) =>
    value === undefined ? null : `RM ${Math.abs(value).toLocaleString("en-MY", { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4" id="report_center_snapshot">
      {/* Section 1 — Financial Snapshot */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={onOpenNetProfit}
          className={`rounded-2xl border p-3.5 text-left transition cursor-pointer hover:shadow-sm ${profitPositive ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"}`}
          id="snapshot_net_profit"
        >
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
        </button>

        {hasAnyAccount ? (
          <button
            type="button"
            onClick={onOpenCurrentCash}
            className="rounded-2xl border border-blue-200 bg-blue-50 p-3.5 text-left transition cursor-pointer hover:shadow-sm"
            id="snapshot_current_cash"
          >
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
          </button>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 flex flex-col gap-1.5" id="snapshot_current_cash">
            <div className="flex items-center gap-1.5">
              <span className="text-base leading-none">🏦</span>
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">Tunai Semasa</span>
            </div>
            <p className="text-[11px] font-semibold text-slate-500 mt-0.5">Tiada Akaun Bank Direkodkan</p>
            <button
              type="button"
              onClick={onAddBankAccount}
              className="self-start mt-0.5 px-2 py-1 text-[10px] font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
              id="snapshot_add_bank_account_btn"
            >
              + Tambah Akaun Bank
            </button>
          </div>
        )}
      </div>

      {topActionsSlot}

      {/* Section 2 — Popular Reports */}
      <div className="space-y-2" id="report_center_popular">
        <p className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider px-0.5">
          Laporan Popular
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          {POPULAR_REPORTS.map((item) => {
            const value = popularValues?.[item.key as keyof PopularReportValues];
            const formatted = formatRm(value);
            const negative = typeof value === "number" && value < 0;
            return (
              <button
                key={item.key}
                onClick={() => onSelectPopularReport(item.key)}
                className="rounded-2xl border border-slate-200 bg-white p-3.5 flex flex-col items-start gap-1 hover:border-slate-300 hover:shadow-sm transition cursor-pointer text-left"
                id={`popular_report_${item.key}`}
              >
                <div className="w-full flex items-center justify-between">
                  <span className="text-xl leading-none">{item.emoji}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                </div>
                <span className="text-[11px] font-semibold text-slate-800 leading-tight">{item.label}</span>
                {formatted && (
                  <span className={`text-xs font-mono font-bold ${negative ? "text-rose-600" : "text-slate-900"}`}>
                    {negative ? "-" : ""}{formatted}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
