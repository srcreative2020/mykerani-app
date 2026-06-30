import React from "react";
import { HardDrive, Lock, AlertTriangle, AlertCircle } from "lucide-react";
import { fmtBytes, type StorageQuotaHook } from "../lib/storageQuota";

interface StorageBarProps {
  quota: StorageQuotaHook;
  compact?: boolean;           // mini strip for home tab
  onBuyAddon?: () => void;
}

export const StorageBar: React.FC<StorageBarProps> = ({ quota, compact = false, onBuyAddon }) => {
  const pct = Math.min(quota.pctUsed * 100, 100);

  const barColor =
    quota.warnLevel === "frozen" || quota.warnLevel === "red" ? "bg-red-500"
    : quota.warnLevel === "orange" ? "bg-amber-500"
    : quota.warnLevel === "yellow" ? "bg-yellow-400"
    : "bg-emerald-500";

  const bgColor =
    quota.warnLevel === "frozen" ? "bg-red-50 border-red-200"
    : quota.warnLevel === "red"    ? "bg-red-50 border-red-200"
    : quota.warnLevel === "orange" ? "bg-amber-50 border-amber-200"
    : quota.warnLevel === "yellow" ? "bg-yellow-50 border-yellow-200"
    : "bg-white border-slate-200";

  if (compact) {
    return (
      <div className={`rounded-xl border p-3 space-y-1.5 ${bgColor}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {quota.warnLevel === "frozen" ? (
              <Lock className="w-3.5 h-3.5 text-red-500" />
            ) : (
              <HardDrive className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span className="text-xs font-bold text-slate-600">Storan</span>
          </div>
          <span className={`text-2xs font-bold ${
            quota.warnLevel === "frozen" || quota.warnLevel === "red" ? "text-red-600"
            : quota.warnLevel === "orange" ? "text-amber-600"
            : quota.warnLevel === "yellow" ? "text-yellow-600"
            : "text-slate-500"
          }`}>
            {fmtBytes(quota.usedBytes)} / {fmtBytes(quota.quotaBytes)}
          </span>
        </div>
        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
        {quota.warnLevel === "frozen" && (
          <p className="text-2xs text-red-600 font-semibold">Storan dibekukan - hubungi HQ</p>
        )}
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border p-5 space-y-4 ${bgColor}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {quota.warnLevel === "frozen" ? (
            <Lock className="w-4 h-4 text-red-500" />
          ) : quota.warnLevel === "red" || quota.warnLevel === "orange" ? (
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          ) : (
            <HardDrive className="w-4 h-4 text-slate-500" />
          )}
          <p className="text-sm font-bold text-slate-900">Storan Dokumen</p>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
          quota.warnLevel === "frozen" ? "text-red-700 bg-red-100 border-red-200"
          : quota.warnLevel === "red" ? "text-red-600 bg-red-50 border-red-200"
          : quota.warnLevel === "orange" ? "text-amber-700 bg-amber-50 border-amber-200"
          : quota.warnLevel === "yellow" ? "text-yellow-700 bg-yellow-50 border-yellow-200"
          : "text-emerald-700 bg-emerald-50 border-emerald-200"
        }`}>
          {quota.warnLevel === "frozen" ? "DIBEKUKAN" : `${pct.toFixed(0)}%`}
        </span>
      </div>

      {/* Bar */}
      <div className="space-y-1.5">
        <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between text-xs text-slate-500">
          <span>Digunakan: <strong className="text-slate-700">{fmtBytes(quota.usedBytes)}</strong></span>
          <span>Had: <strong className="text-slate-700">{fmtBytes(quota.quotaBytes)}</strong></span>
        </div>
      </div>

      {/* Add-ons summary */}
      {quota.addOns.length > 0 && (
        <p className="text-2xs text-slate-400">
          + {fmtBytes(quota.addOns.reduce((s, a) => s + a.bytes, 0))} tambahan dibeli
        </p>
      )}

      {/* Status messages */}
      {quota.warnLevel === "frozen" && (
        <div className="bg-red-100 border border-red-200 rounded-xl p-3 space-y-1">
          <p className="text-xs font-bold text-red-700">Storan Dibekukan oleh Sistem</p>
          <p className="text-xs text-red-600">
            {quota.frozenReason === "quota_exceeded" && "Storan melebihi 95%. Upload disekat. Hubungi HQ atau beli tambahan."}
            {quota.frozenReason === "hq_manual" && "HQ telah membekukan storan anda. Hubungi HQ untuk maklumat lanjut."}
            {quota.frozenReason === "inactive" && "Akaun tidak aktif. Hubungi HQ untuk aktifkan semula."}
          </p>
          {onBuyAddon && quota.frozenReason === "quota_exceeded" && (
            <button onClick={onBuyAddon}
              className="mt-2 w-full py-2 bg-red-500 text-white rounded-lg text-xs font-bold cursor-pointer hover:bg-red-600 transition active:scale-[0.98]">
              Beli Tambahan Storan
            </button>
          )}
        </div>
      )}
      {quota.warnLevel === "red" && !quota.isFrozen && (
        <div className="flex items-start gap-2 bg-red-50 rounded-xl p-3">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-red-700">Storan Kritikal ({pct.toFixed(0)}%)</p>
            <p className="text-xs text-red-600">Upload akan disekat bila sampai 95%. Tambah storan sekarang.</p>
          </div>
        </div>
      )}
      {quota.warnLevel === "orange" && (
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">Storan hampir penuh. Pertimbangkan tambahan storan.</p>
        </div>
      )}
      {quota.warnLevel === "yellow" && (
        <p className="text-xs text-yellow-700">Storan telah mencapai 70%. Pantau penggunaan anda.</p>
      )}

      {/* Add-on button */}
      {onBuyAddon && quota.warnLevel !== "frozen" && quota.warnLevel !== "none" && (
        <button onClick={onBuyAddon}
          className="w-full py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer hover:bg-slate-50 transition active:scale-[0.98]">
          Tambah Storan
        </button>
      )}
    </div>
  );
};
