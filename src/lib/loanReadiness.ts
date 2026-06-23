// MyKerani — Loan/Financing Readiness V1 (Report Completion Sprint V1)
//
// Extracted, byte-for-byte, from the bankReadiness useMemo previously inline
// in FinancialReportsAnalytics.tsx — same checks, same thresholds, same Malay
// copy, same scoring. Moving it here makes it a pure, testable function the
// UAT validation script can call directly, with zero UI/behavior change.
//
// A generic, bank-agnostic creditworthiness checklist computed from existing
// solvency, liquidity, collections and debt-repayment data. Real banks vary
// in exact criteria, so this surfaces the underlying signals lenders commonly
// check rather than a single institution's rule set.

import type { DebtRecord, FinancialEvent } from "../types";
import type { FinancialHealthScoring } from "./financialHealth";
import type { BusinessProfile } from "./profileData";

export interface LoanReadinessCheck {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
  // Phase 2D.3 — Actionable Report Center: additive only. Record ids behind
  // a failing check's count (debt/receivable records), for direct
  // navigation. Empty for checks with no record-level target.
  affectedRecordIds: string[];
  affectedCount: number;
}

export interface LoanReadinessResult {
  checks: LoanReadinessCheck[];
  passedCount: number;
  totalChecks: number;
  scorePct: number;
  scoreGrade: string;
  scoreColor: string;
}

export function computeLoanReadiness(
  financialEvents: FinancialEvent[],
  debtRecords: DebtRecord[],
  businessProfile: BusinessProfile,
  healthScoring: FinancialHealthScoring,
  receivablesOver60DaysMyr: number,
  baseDate: Date,
  // Phase 2D.3 — Actionable Report Center: additive, optional. The caller
  // already computes this exact bucket (receivablesAgingData.b61_plusList in
  // FinancialReportsAnalytics.tsx) to derive receivablesOver60DaysMyr; passing
  // the ids alongside lets the "receivables_quality" check expose which
  // records to navigate to, without recomputing the aging bucket here.
  receivablesOver60DaysRecordIds: string[] = []
): LoanReadinessResult {
  const incomeRecords = financialEvents.filter((e) => e.type === "INCOME");
  const monthsWithIncome = new Set(incomeRecords.map((e) => e.date?.slice(0, 7)).filter(Boolean));
  const monthKeys: string[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1);
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const incomeMonthsCovered = monthKeys.filter((m) => monthsWithIncome.has(m)).length;
  const incomeConsistencyPct = (incomeMonthsCovered / monthKeys.length) * 100;

  const overdueDebts = debtRecords.filter(
    (d) =>
      d.status === "ACTIVE" &&
      d.repaymentDueDate &&
      new Date(d.repaymentDueDate).getTime() < baseDate.getTime() &&
      d.repaidAmountMyr < d.totalAmountMyr
  );

  const checks: LoanReadinessCheck[] = [
    {
      id: "registration",
      label: "No. Pendaftaran Perniagaan Direkodkan",
      pass: Boolean(businessProfile.registrationNo && businessProfile.registrationNo.trim()),
      detail: businessProfile.registrationNo
        ? `No. pendaftaran: ${businessProfile.registrationNo}`
        : "Sila lengkapkan No. Pendaftaran Perniagaan dalam Profil Kewangan AI — biasanya diperlukan dalam permohonan pembiayaan.",
      affectedRecordIds: [],
      affectedCount: 0,
    },
    {
      id: "solvency",
      label: "Nisbah Aset/Liabiliti Sihat",
      pass: healthScoring.solvencyRatio >= 1.5,
      detail: `Nisbah solvensi semasa: ${healthScoring.solvencyRatio.toFixed(2)}x (gred: ${healthScoring.solvencyGrade}). Kebanyakan pemberi pinjaman mahukan sekurang-kurangnya 1.5x.`,
      affectedRecordIds: [],
      affectedCount: 0,
    },
    {
      id: "runway",
      label: "Penampan Mudah Tunai Mencukupi",
      pass: healthScoring.runwayMonths >= 3,
      detail:
        healthScoring.runwayMonths === 999
          ? "Tiada komitmen bulanan aktif direkodkan — tidak boleh dinilai sepenuhnya."
          : `Penampan kelangsungan semasa: ${healthScoring.runwayMonths.toFixed(1)} bulan. Disasarkan sekurang-kurangnya 3 bulan.`,
      affectedRecordIds: [],
      affectedCount: 0,
    },
    {
      id: "debt_repayment",
      label: "Tiada Hutang Tertunggak Lewat Bayar",
      pass: overdueDebts.length === 0,
      detail:
        overdueDebts.length === 0
          ? "Tiada rekod hutang yang melepasi tarikh matang tanpa dibayar penuh."
          : `${overdueDebts.length} rekod hutang telah melepasi tarikh matang tanpa dibayar penuh — ini menjejaskan rekod pembayaran kredit anda.`,
      affectedRecordIds: overdueDebts.map((d) => d.id),
      affectedCount: overdueDebts.length,
    },
    {
      id: "receivables_quality",
      label: "Kutipan Piutang Lancar (Tiada Lapuk >60 Hari)",
      pass: receivablesOver60DaysMyr === 0,
      detail:
        receivablesOver60DaysMyr === 0
          ? "Tiada baki piutang lapuk melebihi 60 hari."
          : `RM ${receivablesOver60DaysMyr.toLocaleString()} piutang telah lapuk melebihi 60 hari — pemberi pinjaman melihat ini sebagai risiko aliran tunai.`,
      affectedRecordIds: receivablesOver60DaysRecordIds,
      affectedCount: receivablesOver60DaysRecordIds.length,
    },
    {
      id: "income_consistency",
      label: "Pendapatan Konsisten (6 Bulan Lepas)",
      pass: incomeConsistencyPct >= 80,
      detail: `${incomeMonthsCovered}/${monthKeys.length} bulan dalam tempoh 6 bulan lepas mempunyai sekurang-kurangnya satu rekod pendapatan.`,
      affectedRecordIds: [],
      affectedCount: monthKeys.length - incomeMonthsCovered,
    },
  ];

  const passedCount = checks.filter((c) => c.pass).length;
  const scorePct = (passedCount / checks.length) * 100;

  let scoreGrade = "Sedia";
  let scoreColor = "text-emerald-600 bg-emerald-50 border-emerald-150";
  if (scorePct < 50) {
    scoreGrade = "Belum Sedia";
    scoreColor = "text-rose-600 bg-rose-50 border-rose-150";
  } else if (scorePct < 85) {
    scoreGrade = "Sebahagian Sedia";
    scoreColor = "text-amber-600 bg-amber-50 border-amber-100";
  }

  return { checks, passedCount, totalChecks: checks.length, scorePct, scoreGrade, scoreColor };
}
