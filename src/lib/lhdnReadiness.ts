// MyKerani — LHDN Tax Readiness V1 (Report Completion Sprint V1)
//
// Extracted, byte-for-byte, from the taxReadiness useMemo previously inline
// in FinancialReportsAnalytics.tsx — same checks, same thresholds, same Malay
// copy, same scoring. Moving it here makes it a pure, testable function the
// UAT validation script can call directly, with zero UI/behavior change.
//
// Known gap (honestly surfaced, not silently invented): BusinessProfile has
// no dedicated TIN field today — `registrationNo` is the closest available
// proxy (SSM registration number) and is reused for both the "SSM Status"
// and "registration" checks below. A true TIN Status check needs a schema
// field that does not exist yet; adding one is a schema change, out of scope
// for this validation-and-completion sprint.

import type { FinancialEvent, FinancialEvidencePackage } from "../types";
import type { BusinessProfile } from "./profileData";

export interface LhdnReadinessCheck {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
  // Phase 2D.3 — Actionable Report Center: additive only. Lists the specific
  // FinancialEvent ids behind a failing check's count, so the UI can jump
  // straight to the affected records instead of just showing a percentage.
  // Empty for checks with no record-level target (e.g. profile fields).
  affectedRecordIds: string[];
  affectedCount: number;
}

export interface LhdnReadinessResult {
  checks: LhdnReadinessCheck[];
  passedCount: number;
  totalChecks: number;
  scorePct: number;
  scoreGrade: string;
  scoreColor: string;
  incomeEvidencePct: number;
  expenseEvidencePct: number;
  categorizedPct: number;
  coveragePct: number;
}

export function computeLhdnReadiness(
  financialEvents: FinancialEvent[],
  financialEvidencePackages: FinancialEvidencePackage[],
  businessProfile: BusinessProfile,
  baseDate: Date
): LhdnReadinessResult {
  const incomeRecords = financialEvents.filter((e) => e.type === "INCOME");
  const expenseRecords = financialEvents.filter((e) => e.type === "EXPENSE");

  const hasEvidence = (e: FinancialEvent) =>
    financialEvidencePackages.some((p) => p.relatedRecordId === e.id && p.relatedRecordType === e.type);

  const incomeMissingEvidence = incomeRecords.filter((e) => !hasEvidence(e));
  const expenseMissingEvidence = expenseRecords.filter((e) => !hasEvidence(e));
  const incomeWithEvidence = incomeRecords.length - incomeMissingEvidence.length;
  const expenseWithEvidence = expenseRecords.length - expenseMissingEvidence.length;
  const incomeEvidencePct = incomeRecords.length === 0 ? 0 : (incomeWithEvidence / incomeRecords.length) * 100;
  const expenseEvidencePct = expenseRecords.length === 0 ? 0 : (expenseWithEvidence / expenseRecords.length) * 100;

  const uncategorizedRecords = financialEvents.filter((e) => !e.categoryName || e.categoryName.trim() === "" || e.categoryName === "Lain-lain");
  const uncategorized = uncategorizedRecords.length;
  const categorizedPct = financialEvents.length === 0 ? 0 : ((financialEvents.length - uncategorized) / financialEvents.length) * 100;

  const monthsWithRecords = new Set([...incomeRecords, ...expenseRecords].map((e) => e.date?.slice(0, 7)).filter(Boolean));
  const monthKeys: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1);
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const monthsCovered = monthKeys.filter((m) => monthsWithRecords.has(m)).length;
  const coveragePct = (monthsCovered / monthKeys.length) * 100;

  const checks: LhdnReadinessCheck[] = [
    {
      id: "registration",
      label: "No. Pendaftaran Perniagaan Direkodkan (SSM)",
      pass: Boolean(businessProfile.registrationNo && businessProfile.registrationNo.trim()),
      detail: businessProfile.registrationNo
        ? `No. pendaftaran: ${businessProfile.registrationNo}`
        : "Sila lengkapkan No. Pendaftaran Perniagaan dalam Profil Kewangan AI — diperlukan untuk pengisian cukai LHDN.",
      affectedRecordIds: [],
      affectedCount: 0,
    },
    {
      id: "income_evidence",
      label: "Resit/Invois Pendapatan Disokong Bukti",
      pass: incomeEvidencePct >= 70,
      detail: `${incomeWithEvidence}/${incomeRecords.length} rekod pendapatan (${incomeEvidencePct.toFixed(0)}%) mempunyai dokumen sokongan dimuat naik.`,
      affectedRecordIds: incomeMissingEvidence.map((e) => e.id),
      affectedCount: incomeMissingEvidence.length,
    },
    {
      id: "expense_evidence",
      label: "Resit Perbelanjaan Disokong Bukti",
      pass: expenseEvidencePct >= 70,
      detail: `${expenseWithEvidence}/${expenseRecords.length} rekod perbelanjaan (${expenseEvidencePct.toFixed(0)}%) mempunyai dokumen sokongan dimuat naik.`,
      affectedRecordIds: expenseMissingEvidence.map((e) => e.id),
      affectedCount: expenseMissingEvidence.length,
    },
    {
      id: "categorized",
      label: "Rekod Kewangan Dikategorikan dengan Betul",
      pass: categorizedPct >= 90,
      detail: `${categorizedPct.toFixed(0)}% rekod mempunyai kategori spesifik (bukan "Lain-lain" atau kosong).`,
      affectedRecordIds: uncategorizedRecords.map((e) => e.id),
      affectedCount: uncategorizedRecords.length,
    },
    {
      id: "coverage",
      label: "Tiada Jurang Rekod Bulanan (12 Bulan Lepas)",
      pass: coveragePct >= 80,
      detail: `${monthsCovered}/${monthKeys.length} bulan dalam tempoh 12 bulan lepas mempunyai sekurang-kurangnya satu rekod pendapatan/perbelanjaan.`,
      affectedRecordIds: [],
      affectedCount: monthKeys.length - monthsCovered,
    },
    {
      id: "industry",
      label: "Industri/Jenis Perniagaan Ditetapkan",
      pass: Boolean(businessProfile.industry && businessProfile.industry.trim()),
      detail: businessProfile.industry
        ? `Industri: ${businessProfile.industry}`
        : "Sila lengkapkan Industri dalam Profil Kewangan AI — membantu pengkategorian cukai yang betul.",
      affectedRecordIds: [],
      affectedCount: 0,
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

  return { checks, passedCount, totalChecks: checks.length, scorePct, scoreGrade, scoreColor, incomeEvidencePct, expenseEvidencePct, categorizedPct, coveragePct };
}
