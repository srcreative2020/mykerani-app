// MyKerani — Phase 2C Cross-Source Duplicate Detection Review Queue.
//
// Single shared component rendered identically for Tenant Owner and Tenant
// Staff (via FinancialRecordsConsole.tsx's "duplicates" module) -- no
// Owner-only or Staff-only variant, per the Owner/Staff Parity Rule
// (Duplicate Detection is a listed shared financial engine).
//
// This screen only ever calls reviewDuplicateFlag() (explicit user action)
// or scanForDuplicates() (re-run the read-only detection engine). It NEVER
// deletes, merges, or hides any financial record -- "Mark Duplicate" and
// "Not a Duplicate" only update the duplicate_flags row's classification.

import React, { useState } from "react";
import { AlertTriangle, Check, RefreshCw, X } from "lucide-react";
import { useFinancials } from "../context/FinancialRecordsContext";
import type { DuplicateFlag, FinancialEvent } from "../types";

function findRecord(events: FinancialEvent[], id: string): FinancialEvent | undefined {
  return events.find((e) => e.id === id);
}

function RecordSummary({ record }: { record?: FinancialEvent }) {
  if (!record) {
    return <span className="text-xs text-slate-400 italic">Record not found (may have been edited or removed)</span>;
  }
  return (
    <div className="text-xs text-slate-700">
      <div className="font-semibold">{record.partyName || "(no party name)"}</div>
      <div>RM {record.amountMyr.toLocaleString("en-MY", { minimumFractionDigits: 2 })} &middot; {record.date}</div>
      <div className="text-slate-500">{record.description}</div>
      <div className="text-slate-400 mt-0.5">
        Source: {record.sourceSystem || "MANUAL"} &middot; Ref: {record.referenceNumber || "-"}
      </div>
    </div>
  );
}

const CLASSIFICATION_BADGE: Record<string, string> = {
  POSSIBLE_DUPLICATE: "bg-amber-100 text-amber-800 border-amber-300",
  LIKELY_DUPLICATE: "bg-orange-100 text-orange-800 border-orange-300",
  CONFIRMED_DUPLICATE: "bg-rose-100 text-rose-800 border-rose-300",
};

export const DuplicateReviewQueue: React.FC = () => {
  const { financialEvents, duplicateFlags, scanForDuplicates, reviewDuplicateFlag } = useFinancials();
  const [scanning, setScanning] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  const pendingFlags: DuplicateFlag[] = duplicateFlags
    .filter((f) => f.classification !== "UNIQUE" && f.classification !== "REVIEWED_NOT_DUPLICATE")
    .sort((a, b) => b.score - a.score);

  const handleScan = async () => {
    setScanning(true);
    setScanMessage(null);
    try {
      const result = await scanForDuplicates();
      const newCount = result.filter((f) => f.classification !== "UNIQUE" && f.classification !== "REVIEWED_NOT_DUPLICATE").length;
      setScanMessage(`Scan complete. ${newCount} pair(s) awaiting review.`);
    } catch (err: any) {
      setScanMessage(`Scan failed: ${err?.message || String(err)}`);
    } finally {
      setScanning(false);
    }
  };

  const handleReview = async (id: string, decision: "CONFIRMED_DUPLICATE" | "REVIEWED_NOT_DUPLICATE") => {
    setReviewingId(id);
    try {
      await reviewDuplicateFlag(id, decision);
    } catch (err: any) {
      setScanMessage(`Review failed: ${err?.message || String(err)}`);
    } finally {
      setReviewingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Cross-Source Duplicate Review Queue
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            System-suggested possible duplicates only. Nothing here is ever deleted, merged, or hidden
            automatically — you decide. Only same real-world transactions entered through two different
            sources (e.g. OCR receipt + bank statement import) are surfaced.
          </p>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${scanning ? "animate-spin" : ""}`} />
          {scanning ? "Scanning..." : "Scan for Duplicates"}
        </button>
      </div>

      {scanMessage && (
        <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{scanMessage}</div>
      )}

      {pendingFlags.length === 0 ? (
        <div className="text-center text-sm text-slate-400 py-12 border border-dashed border-slate-200 rounded-xl">
          No pending duplicate pairs. Run a scan to check for cross-source duplicates.
        </div>
      ) : (
        <div className="space-y-3">
          {pendingFlags.map((flag) => {
            const recordA = findRecord(financialEvents, flag.recordAId);
            const recordB = findRecord(financialEvents, flag.recordBId);
            const badgeClass = CLASSIFICATION_BADGE[flag.classification] || "bg-slate-100 text-slate-700 border-slate-300";
            const isBusy = reviewingId === flag.id;
            return (
              <div key={flag.id} className="border border-slate-200 rounded-xl p-4 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${badgeClass}`}>
                    {flag.classification.replace(/_/g, " ")}
                  </span>
                  <span className="text-[11px] text-slate-400">Score: {(flag.score * 100).toFixed(0)}%</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <RecordSummary record={recordA} />
                  <RecordSummary record={recordB} />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleReview(flag.id, "CONFIRMED_DUPLICATE")}
                    disabled={isBusy}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" /> Mark Duplicate
                  </button>
                  <button
                    onClick={() => handleReview(flag.id, "REVIEWED_NOT_DUPLICATE")}
                    disabled={isBusy}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" /> Not a Duplicate
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
