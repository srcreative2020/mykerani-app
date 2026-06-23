// MyKerani — Phase 2D.2 Financial Report Center Redesign.
//
// Section 5 (Export Center) of the new Report Center layout: a single
// "Export Report" button opening a bottom-sheet menu with PDF / Excel / CSV.
// JSON export remains available in src/lib/exportUtils.ts and is still used
// internally (e.g. full workspace backup in MyKeraniBackupRecovery.tsx) but
// is intentionally not exposed in this user-facing menu per spec.
//
// This component wraps existing export handlers — it contains no export
// logic of its own.

import React, { useState } from "react";
import { Download, FileText, FileSpreadsheet, FileJson, X, Printer } from "lucide-react";

export interface ReportExportMenuProps {
  onExport: (format: "csv" | "excel" | "pdf") => void;
  onPrint: () => void;
}

export const ReportExportMenu: React.FC<ReportExportMenuProps> = ({ onExport, onPrint }) => {
  const [open, setOpen] = useState(false);

  const choose = (format: "csv" | "excel" | "pdf") => {
    onExport(format);
    setOpen(false);
  };

  return (
    <div id="report_export_center">
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 px-4 py-2.5 text-xs font-semibold hover:bg-blue-100 transition cursor-pointer"
        id="btn_open_export_menu"
      >
        <Download className="w-3.5 h-3.5" />
        Export Report
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40"
          onClick={() => setOpen(false)}
          id="export_menu_backdrop"
        >
          <div
            className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-5 space-y-3 max-w-lg mx-auto"
            onClick={(e) => e.stopPropagation()}
            id="export_menu_sheet"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-display font-bold text-slate-900">Export Report</h4>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer" id="btn_close_export_menu">
                <X className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={() => choose("pdf")}
              className="w-full flex items-center gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50 transition cursor-pointer"
              id="btn_export_pdf"
            >
              <FileText className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-semibold text-slate-800">PDF</span>
            </button>
            <button
              onClick={() => choose("excel")}
              className="w-full flex items-center gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50 transition cursor-pointer"
              id="btn_export_excel"
            >
              <FileSpreadsheet className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-semibold text-slate-800">Excel</span>
            </button>
            <button
              onClick={() => choose("csv")}
              className="w-full flex items-center gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50 transition cursor-pointer"
              id="btn_export_csv"
            >
              <FileJson className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-semibold text-slate-800">CSV</span>
            </button>
            <button
              onClick={() => { onPrint(); setOpen(false); }}
              className="w-full flex items-center gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50 transition cursor-pointer"
              id="btn_print_report"
            >
              <Printer className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-semibold text-slate-800">Cetak / Print</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
