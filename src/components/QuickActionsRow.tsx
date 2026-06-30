// MyKerani — Phase 2D.1 Mobile Dashboard UX Redesign.
//
// Compact 4-button quick actions row, replacing the always-visible button
// row that used to live inside the large FinancialHealthCenter. Wired by
// the host screen to its existing handlers (handleHealthBucketSelect,
// setShowDuplicateQueue, setShowImportRecovery) — this component holds no
// state and calls no engine itself.

import React from "react";
import { ClipboardCheck, Copy, Paperclip, RotateCcw } from "lucide-react";

export interface QuickActionsRowProps {
  onReview: () => void;
  onDuplicate: () => void;
  onEvidence: () => void;
  onImport: () => void;
}

export const QuickActionsRow: React.FC<QuickActionsRowProps> = ({ onReview, onDuplicate, onEvidence, onImport }) => {
  const actions = [
    { label: "Semak", icon: ClipboardCheck, onClick: onReview, cls: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" },
    { label: "Pendua", icon: Copy, onClick: onDuplicate, cls: "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100" },
    { label: "Bukti", icon: Paperclip, onClick: onEvidence, cls: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" },
    { label: "Import", icon: RotateCcw, onClick: onImport, cls: "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200" },
  ] as const;

  return (
    <div className="grid grid-cols-4 gap-2" id="quick_actions_row">
      {actions.map(({ label, icon: Icon, onClick, cls }) => (
        <button
          key={label}
          onClick={onClick}
          className={`flex flex-col items-center justify-center gap-1 rounded-xl border py-2 px-1 cursor-pointer transition active:scale-[0.98] ${cls}`}
        >
          <Icon className="w-4 h-4" />
          <span className="text-2xs font-semibold">{label}</span>
        </button>
      ))}
    </div>
  );
};
