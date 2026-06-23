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

// Phase 2D.3 — one weak sub-grade surfaced on the Health card, in plain
// language. Sourced from healthScoring's existing solvency/quick/runway
// grades + raw ratios (computeFinancialHealthScoring in financialHealth.ts)
// — no new calculation, just a plain-language rendering of an already-weak
// grade so the user knows *why* the % isn't 100 without expanding anything.
export interface WeakHealthSubGrade {
  id: "solvency" | "quick" | "runway";
  label: string;
  reason: string;
}

export interface ReportCenterHealthCardProps {
  pct: number;
  onExpand: () => void;
  weakGrades?: WeakHealthSubGrade[];
}

export const ReportCenterHealthCard: React.FC<ReportCenterHealthCardProps> = ({ pct, onExpand, weakGrades = [] }) => {
  const band = bandFromPct(pct);
  const meta = BAND_META[band];
  const topWeak = weakGrades[0];

  return (
    <div className="space-y-2" id="report_center_health">
      <p className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider px-0.5">
        Kesihatan Kewangan
      </p>
      <button
        onClick={onExpand}
        className={`w-full text-left rounded-2xl border ${meta.border} ${meta.bg} p-3.5 flex flex-col gap-2 hover:shadow-sm transition cursor-pointer`}
        id="report_center_health_card"
      >
        <div className="flex items-center justify-between gap-3">
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
        </div>
        {topWeak && (
          <div className={`text-[10px] ${meta.text} bg-white/60 rounded-xl px-2.5 py-1.5 leading-snug`} id="report_center_health_weak_reason">
            <span className="font-bold">{topWeak.label}:</span> {topWeak.reason}
            {weakGrades.length > 1 && <span className="opacity-70"> (+{weakGrades.length - 1} lagi isu)</span>}
          </div>
        )}
      </button>
    </div>
  );
};

export interface ReadinessCardItem {
  key: string;
  emoji: string;
  label: string;
  pct: number;
  // Phase 2D.3 — top failing check for this readiness, already computed by
  // computeLhdnReadiness()/computeLoanReadiness() (checks[].detail + the
  // additive affectedRecordIds/affectedCount fields), or the evidence-gap
  // proxy for Audit Readiness. Undefined when every check passes.
  topIssue?: { detail: string; affectedCount: number; recordIds: string[] };
  moreIssueCount?: number;
}

export interface ReportCenterReadinessGridProps {
  items: ReadinessCardItem[];
  onSelect: (key: string) => void;
  // Phase 2D.3 — tapping the top-issue line navigates straight to the
  // affected records (via the host's existing health-filter mechanism)
  // instead of just opening the readiness report. Falls back to onSelect
  // (report navigation) when there is nothing record-level to jump to, or
  // when the host hasn't wired record navigation.
  onNavigateToIssue?: (recordIds: string[], label: string) => void;
}

export const ReportCenterReadinessGrid: React.FC<ReportCenterReadinessGridProps> = ({ items, onSelect, onNavigateToIssue }) => {
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
            <div
              key={item.key}
              className={`w-full rounded-2xl border ${meta.border} ${meta.bg} p-3.5 space-y-2`}
              id={`readiness_card_${item.key}`}
            >
              <button
                onClick={() => onSelect(item.key)}
                className="w-full text-left flex items-center justify-between gap-3 hover:opacity-80 transition cursor-pointer"
                id={`readiness_card_${item.key}_open`}
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
              {item.topIssue && (
                <button
                  onClick={() =>
                    item.topIssue && item.topIssue.recordIds.length > 0 && onNavigateToIssue
                      ? onNavigateToIssue(item.topIssue.recordIds, `${item.label}: ${item.topIssue.detail}`)
                      : onSelect(item.key)
                  }
                  className="w-full text-left bg-white/70 hover:bg-white rounded-xl px-2.5 py-1.5 text-[10px] text-slate-600 leading-snug transition cursor-pointer flex items-center justify-between gap-2"
                  id={`readiness_card_${item.key}_issue`}
                >
                  <span className="min-w-0">
                    {item.topIssue.detail}
                    {(item.moreIssueCount ?? 0) > 0 && (
                      <span className="opacity-60"> (+{item.moreIssueCount} isu lain)</span>
                    )}
                  </span>
                  {item.topIssue.affectedCount > 0 && (
                    <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
