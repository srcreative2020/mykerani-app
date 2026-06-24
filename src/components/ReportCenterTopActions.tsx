// MyKerani — Phase 2D.3 Actionable Report Center: "Top 3 Actions Required".
//
// Presentation-only. Every action surfaced here is sourced from readiness
// checks/coverage figures FinancialReportsAnalytics.tsx already computes via
// the existing engines (computeLhdnReadiness, computeLoanReadiness, the
// evidence-coverage drilldown) — no new scoring engine, no new calculation.
//
// Ranking rule (intentionally simple, documented per CLAUDE.md/task spec):
// candidates are sorted by `affectedCount` descending (more affected records
// = bigger problem), and the top 3 are shown. This is a plain sort over
// already-computed counts, not a new weighted score.

import React from "react";
import { ChevronRight, AlertTriangle } from "lucide-react";

export interface TopActionItem {
  id: string;
  problem: string;
  affectedCount: number;
  recordIds: string[];
  band: "yellow" | "red";
}

export interface ReportCenterTopActionsProps {
  actions: TopActionItem[];
  onNavigate: (action: TopActionItem) => void;
  // UAT FIX #02 — a workspace with zero transactions/documents/evidence has
  // nothing to score yet; that is not the same as "no critical issues
  // found" (which implies checks ran and passed). When true, shows a
  // neutral "not enough data" message instead of the "all clear" one.
  insufficientData?: boolean;
}

const BAND_STYLE: Record<TopActionItem["band"], { border: string; bg: string; text: string; chip: string }> = {
  red: { border: "border-rose-200", bg: "bg-rose-50", text: "text-rose-700", chip: "bg-rose-600" },
  yellow: { border: "border-amber-200", bg: "bg-amber-50", text: "text-amber-700", chip: "bg-amber-600" },
};

export const ReportCenterTopActions: React.FC<ReportCenterTopActionsProps> = ({ actions, onNavigate, insufficientData }) => {
  if (insufficientData) {
    return (
      <div className="space-y-2" id="report_center_top_actions">
        <p className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider px-0.5">
          3 Tindakan Paling Penting
        </p>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-[11px] text-slate-500 font-semibold" id="report_center_top_actions_empty">
          Belum cukup data untuk analisis. Tambah rekod pertama untuk menjana analisis.
        </div>
      </div>
    );
  }

  if (actions.length === 0) {
    return (
      <div className="space-y-2" id="report_center_top_actions">
        <p className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider px-0.5">
          3 Tindakan Paling Penting
        </p>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-[11px] text-emerald-700 font-semibold">
          Tidak ada isu kritikal dikesan sekarang. Semua semakan utama lulus.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2" id="report_center_top_actions">
      <p className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider px-0.5">
        3 Tindakan Paling Penting
      </p>
      <div className="grid grid-cols-1 gap-2">
        {actions.map((action, idx) => {
          const meta = BAND_STYLE[action.band];
          return (
            <button
              key={action.id}
              onClick={() => onNavigate(action)}
              className={`w-full text-left rounded-2xl border ${meta.border} ${meta.bg} p-3.5 flex items-center justify-between gap-3 hover:shadow-sm transition cursor-pointer`}
              id={`top_action_${action.id}`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`shrink-0 w-5 h-5 rounded-full ${meta.chip} text-white text-[10px] font-bold flex items-center justify-center`}>
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-slate-800 leading-snug">{action.problem}</p>
                  <p className={`text-[10px] font-mono font-bold ${meta.text} mt-0.5 flex items-center gap-1`}>
                    <AlertTriangle className="w-3 h-3" />
                    {action.affectedCount} rekod terjejas
                  </p>
                </div>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
};
