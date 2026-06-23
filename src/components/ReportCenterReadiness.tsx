// MyKerani — Phase 2D.2 Financial Report Center Redesign.
//
// Section 3 (Financial Health summary card) + Section 4 (Business
// Readiness: Tax / Financing / Audit) of the new Report Center layout.
//
// Presentation-only — every percentage/grade here is read from figures
// FinancialReportsAnalytics.tsx already computes via the existing engines
// (src/lib/financialHealth.ts, src/lib/lhdnReadiness.ts,
// src/lib/loanReadiness.ts). No new scoring logic is introduced.
//
// Mapping notes (deviation from spec naming, documented per CLAUDE.md):
// - "Financial Health %" = share of the 3 existing health grades
//   (solvency/quick/runway from computeFinancialHealthScoring) that are in
//   their best band — a presentation-only rollup of already-computed grades.
// - "Tax Readiness" = computeLhdnReadiness().scorePct/scoreGrade (exact
//   existing calculation, already named "Tax Readiness" in the old UI).
// - "Financing Readiness" = computeLoanReadiness().scorePct/scoreGrade
//   (existing calculation, previously labelled "Bank/Financing Readiness").
// - "Audit Readiness" — financialHealthCenter.ts's auditReadiness key is
//   for a different report surface (FinancialHealthSummary's duplicate /
//   import-failure buckets), not wired into this component's data today.
//   The closest existing computed figure here is healthV1.evidenceCoveragePct
//   (% of records with evidence/document packages linked) from
//   computeFinancialHealthV1 — this is reused as the Audit Readiness proxy.

import React from "react";
import { ChevronRight } from "lucide-react";

export type ReadinessBand = "green" | "yellow" | "red";

const BAND_META: Record<ReadinessBand, { label: string; bg: string; text: string; border: string }> = {
  green: { label: "Baik", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  yellow: { label: "Perlu Perhatian", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  red: { label: "Kritikal", bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
};

export function bandFromPct(pct: number): ReadinessBand {
  if (pct >= 80) return "green";
  if (pct >= 50) return "yellow";
  return "red";
}

export interface ReportCenterHealthCardProps {
  pct: number;
  onExpand: () => void;
}

export const ReportCenterHealthCard: React.FC<ReportCenterHealthCardProps> = ({ pct, onExpand }) => {
  const band = bandFromPct(pct);
  const meta = BAND_META[band];

  return (
    <div className="space-y-2" id="report_center_health">
      <p className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider px-0.5">
        Kesihatan Kewangan
      </p>
      <button
        onClick={onExpand}
        className={`w-full text-left rounded-2xl border ${meta.border} ${meta.bg} p-3.5 flex items-center justify-between gap-3 hover:shadow-sm transition cursor-pointer`}
        id="report_center_health_card"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl leading-none shrink-0">❤️</span>
          <div className="min-w-0">
            <p className={`text-sm font-mono font-bold ${meta.text}`}>{pct.toFixed(0)}%</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Status: {meta.label}</p>
          </div>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold ${meta.text}`}>
          Lihat Analisis <ChevronRight className="w-3 h-3" />
        </span>
      </button>
    </div>
  );
};

export interface ReadinessCardItem {
  key: string;
  emoji: string;
  label: string;
  pct: number;
}

export interface ReportCenterReadinessGridProps {
  items: ReadinessCardItem[];
  onSelect: (key: string) => void;
}

export const ReportCenterReadinessGrid: React.FC<ReportCenterReadinessGridProps> = ({ items, onSelect }) => {
  return (
    <div className="space-y-2" id="report_center_readiness">
      <p className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider px-0.5">
        Kesediaan Perniagaan
      </p>
      <div className="grid grid-cols-1 gap-2">
        {items.map((item) => {
          const band = bandFromPct(item.pct);
          const meta = BAND_META[band];
          return (
            <button
              key={item.key}
              onClick={() => onSelect(item.key)}
              className={`w-full text-left rounded-2xl border ${meta.border} ${meta.bg} p-3.5 flex items-center justify-between gap-3 hover:shadow-sm transition cursor-pointer`}
              id={`readiness_card_${item.key}`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-lg leading-none shrink-0">{item.emoji}</span>
                <span className="text-[11px] font-semibold text-slate-800">{item.label}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`text-sm font-mono font-bold ${meta.text}`}>{item.pct.toFixed(0)}%</span>
                <span className={`text-[9px] font-bold uppercase ${meta.text}`}>{meta.label}</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
