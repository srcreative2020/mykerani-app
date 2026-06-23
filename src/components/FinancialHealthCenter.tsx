// MyKerani — Phase 2D Financial Health Command Center.
//
// Single shared component rendered identically inside OwnerDashboard.tsx and
// StaffHomeScreen.tsx (Section 6 of the Phase 2D spec: one health engine, no
// Owner-only/Staff-only variant). Every card and readiness score is
// clickable and calls back into the host screen's own navigation/filtering
// — this component never navigates on its own, since Owner and Staff have
// different tab shells.
//
// This is an actionable command center, not a reporting widget: nothing
// here is a dead end. Every number has a one-click path to the underlying
// records.

import React, { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { FinancialHealthResult, HealthBucketKey, HealthColor, ReadinessKey } from "../lib/financialHealthCenter";

const COLOR_CLASSES: Record<HealthColor, { bg: string; text: string; border: string; dot: string }> = {
  green: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
  blue: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", dot: "bg-blue-500" },
  yellow: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500" },
  orange: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", dot: "bg-orange-500" },
  red: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", dot: "bg-rose-500" },
  black: { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-300", dot: "bg-slate-700" },
};

const BAND_CLASSES: Record<"green" | "yellow" | "red", string> = {
  green: "text-emerald-600 bg-emerald-50 border-emerald-200",
  yellow: "text-amber-600 bg-amber-50 border-amber-200",
  red: "text-rose-600 bg-rose-50 border-rose-200",
};

export interface FinancialHealthCenterProps {
  health: FinancialHealthResult;
  onSelectBucket: (key: HealthBucketKey) => void;
  onOpenDuplicateQueue: () => void;
  onOpenImportRecovery: () => void;
}

export const FinancialHealthCenter: React.FC<FinancialHealthCenterProps> = ({
  health,
  onSelectBucket,
  onOpenDuplicateQueue,
  onOpenImportRecovery,
}) => {
  const [expandedReadiness, setExpandedReadiness] = useState<ReadinessKey | null>(null);

  const handleBucketClick = (key: HealthBucketKey) => {
    if (key === "possibleDuplicates") return onOpenDuplicateQueue();
    if (key === "importFailures") return onOpenImportRecovery();
    onSelectBucket(key);
  };

  return (
    <div className="space-y-4" id="financial_health_command_center">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900">Pusat Kesihatan Kewangan</h2>
        <span className="text-[10px] text-slate-400">{health.totalEvents} rekod</span>
      </div>

      {/* Section 1 + 2 — clickable health cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {health.buckets.map((bucket) => {
          const c = COLOR_CLASSES[bucket.color];
          return (
            <button
              key={bucket.key}
              onClick={() => handleBucketClick(bucket.key)}
              className={`text-left p-3 rounded-xl border ${c.border} ${c.bg} hover:shadow-md transition cursor-pointer group`}
              id={`health_card_${bucket.key}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-lg leading-none">{bucket.emoji}</span>
                <span className={`text-xl font-extrabold ${c.text}`}>{bucket.count}</span>
              </div>
              <p className={`text-[11px] font-bold ${c.text}`}>{bucket.label}</p>
              <p className="text-[10px] text-slate-500 mt-0.5 leading-snug line-clamp-2">{bucket.description}</p>
              <span className={`mt-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold ${c.text} group-hover:underline`}>
                {bucket.actionLabel} <ChevronRight className="w-3 h-3" />
              </span>
            </button>
          );
        })}
      </div>

      {/* Section 3 — readiness scores */}
      <div className="grid grid-cols-2 gap-2.5">
        {health.readiness.map((r) => (
          <div key={r.key} className={`rounded-xl border ${BAND_CLASSES[r.band]} overflow-hidden`}>
            <button
              onClick={() => setExpandedReadiness((prev) => (prev === r.key ? null : r.key))}
              className="w-full text-left p-3 cursor-pointer"
              id={`readiness_${r.key}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold">{r.label}</p>
                <span className="text-lg font-extrabold">{r.score}</span>
              </div>
              <p className="text-[10px] opacity-75 mt-0.5">
                {r.reasons.length === 0 ? "No issues found." : "Tap to see why"}
              </p>
            </button>
            {expandedReadiness === r.key && r.reasons.length > 0 && (
              <div className="px-3 pb-3 text-[10px] space-y-1 border-t border-current/10 pt-2">
                {r.reasons.map((reason, i) => (
                  <p key={i}>• {reason}</p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Section 5 — quick actions */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => onSelectBucket("pendingConfirmation")} className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700 cursor-pointer">
          Review Records
        </button>
        <button onClick={onOpenDuplicateQueue} className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-rose-600 text-white hover:bg-rose-700 cursor-pointer">
          Review Duplicates
        </button>
        <button onClick={() => onSelectBucket("missingEvidence")} className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-orange-500 text-white hover:bg-orange-600 cursor-pointer">
          Attach Evidence
        </button>
        <button onClick={onOpenImportRecovery} className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-800 text-white hover:bg-slate-900 cursor-pointer">
          Retry Imports
        </button>
      </div>
    </div>
  );
};
