import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Landmark, Receipt, FileText, X, Scale } from "lucide-react";
import type { DebtRecord, FinancialCommitment, FinancialEvent, FinancialEvidencePackage, CashAccount, BankAccount } from "../types";
import { type AssetPurchase, type OwnerTransaction, loadAssetPurchases, loadOwnerTransactions } from "../lib/assetOwnerData";
import { buildReportBuckets, getBalanceSheetTieOut, type BucketedRecord } from "../lib/reportBucketAggregator";
import { buildEvidenceIndex, getDrilldownForRecords, type DrilldownEntry } from "../lib/evidenceDrilldown";

function fmtMyr(n: number): string {
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface BalanceSheetReportProps {
  financialEvents: FinancialEvent[];
  cashAccounts: CashAccount[];
  bankAccounts: BankAccount[];
  debtRecords: DebtRecord[];
  financialCommitments: FinancialCommitment[];
  financialEvidencePackages: FinancialEvidencePackage[];
  workspaceId?: string;
  isMockUser: boolean;
}

type BsLine = "ASSETS" | "LIABILITIES" | "EQUITY" | "RETAINED_EARNINGS";

const LABELS: Record<BsLine, { human: string; accounting: string }> = {
  ASSETS: { human: "Apa Yang Syarikat Ada", accounting: "Assets" },
  LIABILITIES: { human: "Apa Yang Syarikat Berhutang", accounting: "Liabilities" },
  EQUITY: { human: "Modal Pemilik", accounting: "Equity" },
  RETAINED_EARNINGS: { human: "Untung Terkumpul", accounting: "Retained Earnings" },
};

export const BalanceSheetReport: React.FC<BalanceSheetReportProps> = ({
  financialEvents,
  cashAccounts,
  bankAccounts,
  debtRecords,
  financialCommitments,
  financialEvidencePackages,
  workspaceId,
  isMockUser,
}) => {
  const [assetPurchases, setAssetPurchases] = useState<AssetPurchase[]>([]);
  const [ownerTransactions, setOwnerTransactions] = useState<OwnerTransaction[]>([]);
  const [layer, setLayer] = useState<"human" | "accounting">("human");
  const [selectedLine, setSelectedLine] = useState<BsLine | null>(null);

  useEffect(() => {
    if (workspaceId) loadAssetPurchases(workspaceId).then(setAssetPurchases);
    if (workspaceId) loadOwnerTransactions(workspaceId).then(setOwnerTransactions);
  }, [workspaceId, isMockUser]);

  // Balance Sheet is point-in-time (all-time), not period-filtered like P&L —
  // it answers "what does the business own/owe right now," not "this month."
  const buckets = useMemo(
    () => buildReportBuckets({ financialEvents, debtRecords, financialCommitments, assetPurchases, ownerTransactions, cashAccounts, bankAccounts }),
    [financialEvents, debtRecords, financialCommitments, assetPurchases, ownerTransactions, cashAccounts, bankAccounts]
  );

  // The ONLY source of Balance Sheet totals + the Retained Earnings tie-out —
  // never recomputed by hand here.
  const tieOut = useMemo(() => getBalanceSheetTieOut(buckets), [buckets]);

  const evidenceIndex = useMemo(
    () => buildEvidenceIndex(financialEvidencePackages),
    [financialEvidencePackages]
  );

  const drilldownRecords: BucketedRecord[] = useMemo(() => {
    if (selectedLine === "ASSETS") return buckets.ASSETS;
    if (selectedLine === "LIABILITIES") return buckets.LIABILITIES;
    if (selectedLine === "EQUITY") return buckets.EQUITY;
    if (selectedLine === "RETAINED_EARNINGS") return [...buckets.REVENUE, ...buckets.COST_OF_SALES, ...buckets.OPERATING_EXPENSES];
    return [];
  }, [selectedLine, buckets]);

  const drilldownEntries: DrilldownEntry[] = useMemo(
    () => getDrilldownForRecords(drilldownRecords, evidenceIndex),
    [drilldownRecords, evidenceIndex]
  );

  const lineLabel = (line: BsLine) => (layer === "human" ? LABELS[line].human : LABELS[line].accounting);

  const lineRow = (line: BsLine, amount: number, bold = false) => (
    <button
      type="button"
      id={`bs_line_${line.toLowerCase()}`}
      onClick={() => setSelectedLine(line)}
      className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/5 transition rounded-lg ${bold ? "font-bold" : ""}`}
    >
      <span className="text-sm text-white">{lineLabel(line)}</span>
      <span className="text-sm font-mono text-white">{fmtMyr(amount)}</span>
    </button>
  );

  return (
    <div className="space-y-6" id="balance_sheet_report_root">
      <div className="flex items-center space-x-2">
        <button
          id="bs_layer_human"
          onClick={() => setLayer("human")}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${layer === "human" ? "bg-slate-950 border-slate-950 text-white" : "bg-white border-slate-200 text-slate-600"}`}
        >
          Mudah Faham
        </button>
        <button
          id="bs_layer_accounting"
          onClick={() => setLayer("accounting")}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${layer === "accounting" ? "bg-slate-950 border-slate-950 text-white" : "bg-white border-slate-200 text-slate-600"}`}
        >
          Perakaunan
        </button>
      </div>

      <div className="bg-slate-950 rounded-2xl p-2" id="balance_sheet_statement">
        <div className="px-4 py-3 border-b border-white/10 flex items-center space-x-2">
          <Landmark className="w-4 h-4 text-emerald-400" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Kunci Kira-Kira (Balance Sheet)</span>
        </div>
        {lineRow("ASSETS", tieOut.assets, true)}
        {lineRow("LIABILITIES", tieOut.liabilities)}
        {lineRow("EQUITY", tieOut.equity)}
        {lineRow("RETAINED_EARNINGS", tieOut.retainedEarnings)}
        <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between">
          <span className="text-xs text-slate-400 flex items-center space-x-1.5">
            <Scale className="w-3.5 h-3.5" />
            <span>Liabilities + Equity + Retained Earnings</span>
          </span>
          <span className="text-sm font-mono text-white">{fmtMyr(tieOut.totalEquityAndLiabilities)}</span>
        </div>
      </div>

      <div
        id="balance_sheet_tie_out_status"
        className={`p-4 rounded-xl border text-xs leading-relaxed ${
          tieOut.isBalanced ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-800"
        }`}
      >
        {tieOut.isBalanced
          ? `Seimbang: Assets (${fmtMyr(tieOut.assets)}) = Liabilities + Equity + Retained Earnings (${fmtMyr(tieOut.totalEquityAndLiabilities)}).`
          : `Tidak seimbang: beza RM ${tieOut.difference.toFixed(2)} antara Assets dan (Liabilities + Equity + Retained Earnings). Ini boleh berlaku jika ada rekod Cash/Bank account balance yang belum dimasukkan sebagai input aggregator.`}
      </div>

      <AnimatePresence>
        {selectedLine && (
          <motion.div className="fixed inset-0 z-50 overflow-hidden flex justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div
              id="bs_drilldown_backdrop"
              className="absolute inset-0 bg-slate-950/60"
              onClick={() => setSelectedLine(null)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              id="bs_drilldown_panel"
              className="relative w-full max-w-md bg-white h-full overflow-y-auto p-6 space-y-4"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
            >
              <div className="flex items-center justify-between">
                <h4 className="font-display font-bold text-slate-950">{lineLabel(selectedLine)}</h4>
                <button id="bs_drilldown_close" onClick={() => setSelectedLine(null)}>
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              {drilldownEntries.length === 0 && <p className="text-xs text-slate-400">Tiada rekod dalam kategori ini.</p>}
              {drilldownEntries.map((entry) => (
                <div key={entry.record.recordId} className="border border-slate-200 rounded-xl p-3 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-slate-900">{entry.record.humanFriendlyName}</span>
                    <span className="font-mono">{fmtMyr(entry.record.amountMyr)}</span>
                  </div>
                  <p className="text-[10px] text-slate-400">{entry.record.date} · {entry.record.resolutionMethod}</p>
                  {entry.hasEvidence ? (
                    entry.evidence.map((ev) => (
                      <div key={ev.id} className="flex items-center space-x-2 text-[11px] text-slate-600">
                        {ev.documentType === "INVOICE" ? <FileText className="w-3.5 h-3.5" /> : <Receipt className="w-3.5 h-3.5" />}
                        <span>{ev.fileName}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-[11px] text-amber-600">Tiada pakej bukti dikaitkan.</p>
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
