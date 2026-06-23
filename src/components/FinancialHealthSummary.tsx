// MyKerani — Phase 2D.1 Mobile Dashboard UX Redesign.
//
// Compact single-card summary of Financial Health, shown by default in
// place of the full 6-bucket / 4-readiness-score command center. Tapping
// "Lihat Semua" reveals the full <FinancialHealthCenter/> detail (Section 5
// of the Phase 2D.1 spec) — this component never duplicates that engine's
// math, it only derives a presentation-only overall band from the same
// bucket counts already computed by computeFinancialHealth().
//
// Color governance: only green/yellow/red/blue Tailwind classes are used
// here (the underlying HealthColor type/engine keeps its 6 values — this is
// a presentation-layer collapse only, per Phase 2D.1 Section 4).

import React from "react";
import { ChevronRight } from "lucide-react";
import type { FinancialHealthResult } from "../lib/financialHealthCenter";

export type OverallHealthBand = "green" | "yellow" | "red";

const BAND_META: Record<OverallHealthBand, { emoji: string; label: string; bg: string; text: string; border: string }> = {
  green: { emoji: "🟢", label: "Baik", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  yellow: { emoji: "🟡", label: "Perlu Disemak", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  red: { emoji: "🔴", label: "Kritikal", bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
};

export function deriveOverallHealthBand(health: FinancialHealthResult): OverallHealthBand {
  const byKey = Object.fromEntries(health.buckets.map((b) => [b.key, b.count]));
  if ((byKey.possibleDuplicates ?? 0) > 0 || (byKey.importFailures ?? 0) > 0) return "red";
  if ((byKey.reviewRecommended ?? 0) > 0 || (byKey.missingEvidence ?? 0) > 0 || (byKey.pendingConfirmation ?? 0) > 0) return "yellow";
  return "green";
}

export function countHealthIssues(health: FinancialHealthResult): number {
  return health.buckets.filter((b) => b.key !== "complete").reduce((sum, b) => sum + b.count, 0);
}

export interface FinancialHealthSummaryProps {
  health: FinancialHealthResult;
  onExpand: () => void;
}

export const FinancialHealthSummary: React.FC<FinancialHealthSummaryProps> = ({ health, onExpand }) => {
  const band = deriveOverallHealthBand(health);
  const meta = BAND_META[band];
  const issueCount = countHealthIssues(health);

  return (
    <button
      onClick={onExpand}
      id="financial_health_summary_card"
      className={`w-full text-left rounded-2xl border ${meta.border} ${meta.bg} p-3.5 flex items-center justify-between gap-3 hover:shadow-md transition cursor-pointer`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-2xl leading-none shrink-0">{meta.emoji}</span>
        <div className="min-w-0">
          <p className={`text-[11px] font-bold ${meta.text}`}>Kesihatan Kewangan: {meta.label}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {health.totalEvents} rekod · {issueCount} isu perlu perhatian
          </p>
        </div>
      </div>
      <span className={`shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold ${meta.text}`}>
        Lihat Semua <ChevronRight className="w-3 h-3" />
      </span>
    </button>
  );
};
