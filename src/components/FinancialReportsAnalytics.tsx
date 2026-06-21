import React, { useState, useMemo, useEffect } from "react";
import { useFinancials } from "../context/FinancialRecordsContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { useAuth } from "../context/AuthContext";
import { useTenant } from "../context/TenantContext";
import { logEvent } from "../lib/eventLog";
import { loadBusinessProfile, EMPTY_BUSINESS_PROFILE, type BusinessProfile } from "../lib/profileData";
import {
  TrendingUp, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Clock, 
  AlertCircle, 
  Scale, 
  Calendar, 
  Search, 
  Building2, 
  Wallet, 
  Printer, 
  Download, 
  Info, 
  ShieldCheck, 
  FileText,
  PieChart,
  BarChart4,
  Activity
} from "lucide-react";
import { type FinancialEvent, type FinancialCommitment } from "../types";
import { exportToCSV, exportToExcel, exportToJSON, exportToPDF, type ExportColumn } from "../lib/exportUtils";
import { computeFinancialHealthScoring } from "../lib/financialHealth";
import { ProfitLossReport } from "./ProfitLossReport";

export const FinancialReportsAnalytics: React.FC = () => {
  const { activeWorkspace } = useWorkspace();
  const { user, isMockUser } = useAuth();
  const { activeTenant } = useTenant();
  const {
    financialEvents,
    cashAccounts,
    bankAccounts,
    debtRecords,
    financialCommitments,
    financialEvidencePackages,
  } = useFinancials();

  // Active Report Selection state: 9 reports
  const [selectedReport, setSelectedReport] = useState<
    "summary" | "cashflow" | "receivables_aging" | "payables_aging" | "commitments" | "health" | "tax_readiness" | "bank_readiness" | "profit_loss"
  >("summary");

  const [businessProfile, setBusinessProfile] = useState<BusinessProfile>(EMPTY_BUSINESS_PROFILE);
  useEffect(() => {
    if (activeWorkspace?.id) loadBusinessProfile(activeWorkspace.id, isMockUser).then(setBusinessProfile);
  }, [activeWorkspace?.id, isMockUser]);

  // Search filter inside specific reports
  const [searchTerm, setSearchTerm] = useState("");

  const baseDate = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }, []);

  // Helpers to calculate calculations
  const totalCash = useMemo(() => {
    return cashAccounts.reduce((sum, c) => sum + c.currentBalanceMyr, 0);
  }, [cashAccounts]);

  const totalBank = useMemo(() => {
    return bankAccounts.reduce((sum, b) => sum + b.currentBalanceMyr, 0);
  }, [bankAccounts]);

  const totalLiquidAssets = totalCash + totalBank;

  const totalReceivables = useMemo(() => {
    return financialEvents
      .filter(e => e.type === "RECEIVABLE" && !e.isCompleted)
      .reduce((sum, e) => sum + e.amountMyr, 0);
  }, [financialEvents]);

  const totalPayables = useMemo(() => {
    return financialEvents
      .filter(e => e.type === "PAYABLE" && !e.isCompleted)
      .reduce((sum, e) => sum + e.amountMyr, 0);
  }, [financialEvents]);

  const totalDebts = useMemo(() => {
    return debtRecords
      .filter(d => d.status === "ACTIVE")
      .reduce((sum, d) => sum + (d.totalAmountMyr - d.repaidAmountMyr), 0);
  }, [debtRecords]);

  // Aggregate Assets and Liabilities
  const aggregateAssets = totalLiquidAssets + totalReceivables;
  const aggregateLiabilities = totalPayables + totalDebts;
  const netCapitalMargin = aggregateAssets - aggregateLiabilities;

  // Completed Inflows & Outflows for Cashflow report
  const completedInflows = useMemo(() => {
    return financialEvents.filter(e => e.type === "INCOME" && e.isCompleted);
  }, [financialEvents]);

  const completedOutflows = useMemo(() => {
    return financialEvents.filter(e => (e.type === "EXPENSE" || e.type === "DEBT") && e.isCompleted);
  }, [financialEvents]);

  const sumCompletedInflow = useMemo(() => {
    return completedInflows.reduce((sum, e) => sum + e.amountMyr, 0);
  }, [completedInflows]);

  const sumCompletedOutflow = useMemo(() => {
    return completedOutflows.reduce((sum, e) => sum + e.amountMyr, 0);
  }, [completedOutflows]);

  const netCashflowChange = sumCompletedInflow - sumCompletedOutflow;

  // Receivables Aging calculations
  const receivablesAgingData = useMemo(() => {
    const outstanding = financialEvents.filter(e => e.type === "RECEIVABLE" && !e.isCompleted);
    
    let current = 0;
    let b1_30 = 0;
    let b31_60 = 0;
    let b61_plus = 0;

    const currentList: FinancialEvent[] = [];
    const b1_30List: FinancialEvent[] = [];
    const b31_60List: FinancialEvent[] = [];
    const b61_plusList: FinancialEvent[] = [];

    outstanding.forEach(e => {
      const eventDate = new Date(e.date);
      const diffMs = baseDate.getTime() - eventDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) {
        current += e.amountMyr;
        currentList.push(e);
      } else if (diffDays <= 30) {
        b1_30 += e.amountMyr;
        b1_30List.push(e);
      } else if (diffDays <= 60) {
        b31_60 += e.amountMyr;
        b31_60List.push(e);
      } else {
        b61_plus += e.amountMyr;
        b61_plusList.push(e);
      }
    });

    return {
      current,
      b1_30,
      b31_60,
      b61_plus,
      currentList,
      b1_30List,
      b31_60List,
      b61_plusList,
      total: outstanding.reduce((sum, e) => sum + e.amountMyr, 0)
    };
  }, [financialEvents, baseDate]);

  // Payables Aging calculations
  const payablesAgingData = useMemo(() => {
    const outstanding = financialEvents.filter(e => e.type === "PAYABLE" && !e.isCompleted);

    let current = 0;
    let b1_30 = 0;
    let b31_60 = 0;
    let b61_plus = 0;

    const currentList: FinancialEvent[] = [];
    const b1_30List: FinancialEvent[] = [];
    const b31_60List: FinancialEvent[] = [];
    const b61_plusList: FinancialEvent[] = [];

    outstanding.forEach(e => {
      const eventDate = new Date(e.date);
      const diffMs = baseDate.getTime() - eventDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) {
        current += e.amountMyr;
        currentList.push(e);
      } else if (diffDays <= 30) {
        b1_30 += e.amountMyr;
        b1_30List.push(e);
      } else if (diffDays <= 60) {
        b31_60 += e.amountMyr;
        b31_60List.push(e);
      } else {
        b61_plus += e.amountMyr;
        b61_plusList.push(e);
      }
    });

    return {
      current,
      b1_30,
      b31_60,
      b61_plus,
      currentList,
      b1_30List,
      b31_60List,
      b61_plusList,
      total: outstanding.reduce((sum, e) => sum + e.amountMyr, 0)
    };
  }, [financialEvents, baseDate]);

  // Commitments monthly burn contribution
  const commitmentBurnData = useMemo(() => {
    const active = financialCommitments.filter(c => c.isActive && c.status === "ACTIVE");
    
    let monthlyBurn = 0;
    const items = active.map(c => {
      let monthlyContribution = 0;
      switch (c.recurrence) {
        case "DAILY":
          monthlyContribution = c.amountPerIntervalMyr * 30;
          break;
        case "WEEKLY":
          monthlyContribution = c.amountPerIntervalMyr * 4.33;
          break;
        case "MONTHLY":
          monthlyContribution = c.amountPerIntervalMyr;
          break;
        case "QUARTERLY":
          monthlyContribution = c.amountPerIntervalMyr / 3;
          break;
        case "YEARLY":
          monthlyContribution = c.amountPerIntervalMyr / 12;
          break;
        case "ONE-TIME":
          // If it is starting in the future or within this month, count monthly contribution
          const start = new Date(c.startDate);
          if (start.getMonth() === baseDate.getMonth() && start.getFullYear() === baseDate.getFullYear()) {
            monthlyContribution = c.amountPerIntervalMyr;
          }
          break;
      }
      monthlyBurn += monthlyContribution;
      return {
        ...c,
        monthlyContribution
      };
    });

    return {
      items,
      monthlyBurn,
      annualBurn: monthlyBurn * 12,
      count: active.length
    };
  }, [financialCommitments, baseDate]);

  // Financial Health scoring model (shared with proactive advisory alerts — see src/lib/financialHealth.ts)
  const healthScoring = useMemo(() => {
    const scoring = computeFinancialHealthScoring(cashAccounts, bankAccounts, financialEvents, debtRecords, financialCommitments, baseDate);

    const solvencyColor = scoring.solvencyGrade === "Critical Risk"
      ? "text-rose-600 bg-rose-50 border-rose-150"
      : scoring.solvencyGrade === "Moderate"
        ? "text-amber-600 bg-amber-50 border-amber-100"
        : "text-emerald-600 bg-emerald-50 border-emerald-150";

    const quickColor = scoring.quickGrade === "Strained"
      ? "text-rose-600 bg-rose-50 border-rose-154"
      : scoring.quickGrade === "Adequate"
        ? "text-amber-650 bg-amber-50 border-amber-150"
        : "text-emerald-600 bg-emerald-50 border-emerald-155";

    const runwayColor = scoring.runwayGrade === "Immediate Action Required (< 2 Months)"
      ? "text-rose-600 bg-rose-50 border-rose-150"
      : scoring.runwayGrade === "Moderate Buffer (2-5 Months)"
        ? "text-amber-600 bg-amber-50 border-amber-100"
        : "text-emerald-600 bg-emerald-50 border-emerald-150";

    return { ...scoring, solvencyColor, quickColor, runwayColor };
  }, [cashAccounts, bankAccounts, financialEvents, debtRecords, financialCommitments, baseDate]);

  // LHDN Tax Readiness checklist — computed purely from existing income/expense
  // records, evidence linkage, and business profile completeness. No mock data.
  const taxReadiness = useMemo(() => {
    const incomeRecords = financialEvents.filter(e => e.type === "INCOME");
    const expenseRecords = financialEvents.filter(e => e.type === "EXPENSE");

    const hasEvidence = (e: FinancialEvent) =>
      financialEvidencePackages.some(p => p.relatedRecordId === e.id && p.relatedRecordType === e.type);

    const incomeWithEvidence = incomeRecords.filter(hasEvidence).length;
    const expenseWithEvidence = expenseRecords.filter(hasEvidence).length;
    const incomeEvidencePct = incomeRecords.length === 0 ? 0 : (incomeWithEvidence / incomeRecords.length) * 100;
    const expenseEvidencePct = expenseRecords.length === 0 ? 0 : (expenseWithEvidence / expenseRecords.length) * 100;

    const uncategorized = financialEvents.filter(e => !e.categoryName || e.categoryName.trim() === "" || e.categoryName === "Lain-lain").length;
    const categorizedPct = financialEvents.length === 0 ? 0 : ((financialEvents.length - uncategorized) / financialEvents.length) * 100;

    // Bookkeeping coverage: % of the last 12 calendar months (up to current month)
    // with at least one income or expense record — flags gaps in record-keeping.
    const monthsWithRecords = new Set(
      [...incomeRecords, ...expenseRecords].map(e => e.date?.slice(0, 7)).filter(Boolean)
    );
    const monthKeys: string[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1);
      monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    const monthsCovered = monthKeys.filter(m => monthsWithRecords.has(m)).length;
    const coveragePct = (monthsCovered / monthKeys.length) * 100;

    const checks = [
      {
        id: "registration",
        label: "No. Pendaftaran Perniagaan Direkodkan",
        pass: Boolean(businessProfile.registrationNo && businessProfile.registrationNo.trim()),
        detail: businessProfile.registrationNo
          ? `No. pendaftaran: ${businessProfile.registrationNo}`
          : "Sila lengkapkan No. Pendaftaran Perniagaan dalam Profil Kewangan AI — diperlukan untuk pengisian cukai LHDN.",
      },
      {
        id: "income_evidence",
        label: "Resit/Invois Pendapatan Disokong Bukti",
        pass: incomeEvidencePct >= 70,
        detail: `${incomeWithEvidence}/${incomeRecords.length} rekod pendapatan (${incomeEvidencePct.toFixed(0)}%) mempunyai dokumen sokongan dimuat naik.`,
      },
      {
        id: "expense_evidence",
        label: "Resit Perbelanjaan Disokong Bukti",
        pass: expenseEvidencePct >= 70,
        detail: `${expenseWithEvidence}/${expenseRecords.length} rekod perbelanjaan (${expenseEvidencePct.toFixed(0)}%) mempunyai dokumen sokongan dimuat naik.`,
      },
      {
        id: "categorized",
        label: "Rekod Kewangan Dikategorikan dengan Betul",
        pass: categorizedPct >= 90,
        detail: `${categorizedPct.toFixed(0)}% rekod mempunyai kategori spesifik (bukan "Lain-lain" atau kosong).`,
      },
      {
        id: "coverage",
        label: "Tiada Jurang Rekod Bulanan (12 Bulan Lepas)",
        pass: coveragePct >= 80,
        detail: `${monthsCovered}/${monthKeys.length} bulan dalam tempoh 12 bulan lepas mempunyai sekurang-kurangnya satu rekod pendapatan/perbelanjaan.`,
      },
      {
        id: "industry",
        label: "Industri/Jenis Perniagaan Ditetapkan",
        pass: Boolean(businessProfile.industry && businessProfile.industry.trim()),
        detail: businessProfile.industry
          ? `Industri: ${businessProfile.industry}`
          : "Sila lengkapkan Industri dalam Profil Kewangan AI — membantu pengkategorian cukai yang betul.",
      },
    ];

    const passedCount = checks.filter(c => c.pass).length;
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
  }, [financialEvents, financialEvidencePackages, businessProfile, baseDate]);

  // Bank/Financing Readiness checklist — a generic, bank-agnostic
  // creditworthiness checklist computed from existing solvency, liquidity,
  // collections and debt-repayment data. Real banks vary in exact criteria,
  // so this surfaces the underlying signals lenders commonly check rather
  // than a single institution's rule set.
  const bankReadiness = useMemo(() => {
    const incomeRecords = financialEvents.filter(e => e.type === "INCOME");
    const monthsWithIncome = new Set(incomeRecords.map(e => e.date?.slice(0, 7)).filter(Boolean));
    const monthKeys: string[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1);
      monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    const incomeMonthsCovered = monthKeys.filter(m => monthsWithIncome.has(m)).length;
    const incomeConsistencyPct = (incomeMonthsCovered / monthKeys.length) * 100;

    const overdueDebts = debtRecords.filter(d =>
      d.status === "ACTIVE" &&
      d.repaymentDueDate &&
      new Date(d.repaymentDueDate).getTime() < baseDate.getTime() &&
      d.repaidAmountMyr < d.totalAmountMyr
    );

    const checks = [
      {
        id: "registration",
        label: "No. Pendaftaran Perniagaan Direkodkan",
        pass: Boolean(businessProfile.registrationNo && businessProfile.registrationNo.trim()),
        detail: businessProfile.registrationNo
          ? `No. pendaftaran: ${businessProfile.registrationNo}`
          : "Sila lengkapkan No. Pendaftaran Perniagaan dalam Profil Kewangan AI — biasanya diperlukan dalam permohonan pembiayaan.",
      },
      {
        id: "solvency",
        label: "Nisbah Aset/Liabiliti Sihat",
        pass: healthScoring.solvencyRatio >= 1.5,
        detail: `Nisbah solvensi semasa: ${healthScoring.solvencyRatio.toFixed(2)}x (gred: ${healthScoring.solvencyGrade}). Kebanyakan pemberi pinjaman mahukan sekurang-kurangnya 1.5x.`,
      },
      {
        id: "runway",
        label: "Penampan Mudah Tunai Mencukupi",
        pass: healthScoring.runwayMonths >= 3,
        detail: healthScoring.runwayMonths === 999
          ? "Tiada komitmen bulanan aktif direkodkan — tidak boleh dinilai sepenuhnya."
          : `Penampan kelangsungan semasa: ${healthScoring.runwayMonths.toFixed(1)} bulan. Disasarkan sekurang-kurangnya 3 bulan.`,
      },
      {
        id: "debt_repayment",
        label: "Tiada Hutang Tertunggak Lewat Bayar",
        pass: overdueDebts.length === 0,
        detail: overdueDebts.length === 0
          ? "Tiada rekod hutang yang melepasi tarikh matang tanpa dibayar penuh."
          : `${overdueDebts.length} rekod hutang telah melepasi tarikh matang tanpa dibayar penuh — ini menjejaskan rekod pembayaran kredit anda.`,
      },
      {
        id: "receivables_quality",
        label: "Kutipan Piutang Lancar (Tiada Lapuk >60 Hari)",
        pass: receivablesAgingData.b61_plus === 0,
        detail: receivablesAgingData.b61_plus === 0
          ? "Tiada baki piutang lapuk melebihi 60 hari."
          : `RM ${receivablesAgingData.b61_plus.toLocaleString()} piutang telah lapuk melebihi 60 hari — pemberi pinjaman melihat ini sebagai risiko aliran tunai.`,
      },
      {
        id: "income_consistency",
        label: "Pendapatan Konsisten (6 Bulan Lepas)",
        pass: incomeConsistencyPct >= 80,
        detail: `${incomeMonthsCovered}/${monthKeys.length} bulan dalam tempoh 6 bulan lepas mempunyai sekurang-kurangnya satu rekod pendapatan.`,
      },
    ];

    const passedCount = checks.filter(c => c.pass).length;
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
  }, [financialEvents, debtRecords, receivablesAgingData, healthScoring, businessProfile, baseDate]);

  // Build the export dataset for the currently selected report
  const exportDataset = useMemo((): { columns: ExportColumn[]; rows: Record<string, unknown>[]; title: string } => {
    const eventColumns: ExportColumn[] = [
      { key: "date", label: "Tarikh" },
      { key: "partyName", label: "Pihak" },
      { key: "categoryName", label: "Kategori" },
      { key: "amountMyr", label: "Jumlah (RM)" },
      { key: "referenceNumber", label: "No. Rujukan" },
      { key: "description", label: "Catatan" },
      { key: "isCompleted", label: "Status" },
    ];
    const eventRows = (events: FinancialEvent[]) =>
      events.map(e => ({ ...e, isCompleted: e.isCompleted ? "Selesai" : "Belum Selesai" }));

    switch (selectedReport) {
      case "receivables_aging": {
        const all = [
          ...receivablesAgingData.currentList,
          ...receivablesAgingData.b1_30List,
          ...receivablesAgingData.b31_60List,
          ...receivablesAgingData.b61_plusList,
        ];
        return { columns: eventColumns, rows: eventRows(all), title: "Laporan Umur Belum Terima" };
      }
      case "payables_aging": {
        const all = [
          ...payablesAgingData.currentList,
          ...payablesAgingData.b1_30List,
          ...payablesAgingData.b31_60List,
          ...payablesAgingData.b61_plusList,
        ];
        return { columns: eventColumns, rows: eventRows(all), title: "Laporan Umur Belum Bayar" };
      }
      case "commitments": {
        const columns: ExportColumn[] = [
          { key: "description", label: "Penerangan" },
          { key: "obligeeName", label: "Pihak" },
          { key: "amountPerIntervalMyr", label: "Jumlah/Selang (RM)" },
          { key: "recurrence", label: "Kekerapan" },
          { key: "monthlyContribution", label: "Sumbangan Bulanan (RM)" },
          { key: "startDate", label: "Tarikh Mula" },
          { key: "status", label: "Status" },
        ];
        return { columns, rows: commitmentBurnData.items as unknown as Record<string, unknown>[], title: "Laporan Komitmen Kewangan" };
      }
      case "cashflow":
        return { columns: eventColumns, rows: eventRows(financialEvents), title: "Laporan Aliran Tunai" };
      case "health": {
        const columns: ExportColumn[] = [{ key: "metric", label: "Metrik" }, { key: "value", label: "Nilai" }, { key: "grade", label: "Gred" }];
        const rows = [
          { metric: "Nisbah Solvensi", value: healthScoring.solvencyRatio.toFixed(2), grade: healthScoring.solvencyGrade },
          { metric: "Nisbah Cepat", value: healthScoring.quickRatio.toFixed(2), grade: healthScoring.quickGrade },
          { metric: "Tempoh Survival (Bulan)", value: healthScoring.runwayMonths.toFixed(1), grade: healthScoring.runwayGrade },
        ];
        return { columns, rows, title: "Laporan Kesihatan Kewangan" };
      }
      case "tax_readiness": {
        const columns: ExportColumn[] = [{ key: "label", label: "Pemeriksaan" }, { key: "status", label: "Status" }, { key: "detail", label: "Butiran" }];
        const rows = taxReadiness.checks.map(c => ({ label: c.label, status: c.pass ? "Lulus" : "Belum Lulus", detail: c.detail }));
        return { columns, rows, title: "Laporan Kesediaan Cukai LHDN" };
      }
      case "bank_readiness": {
        const columns: ExportColumn[] = [{ key: "label", label: "Pemeriksaan" }, { key: "status", label: "Status" }, { key: "detail", label: "Butiran" }];
        const rows = bankReadiness.checks.map(c => ({ label: c.label, status: c.pass ? "Lulus" : "Belum Lulus", detail: c.detail }));
        return { columns, rows, title: "Laporan Kesediaan Pembiayaan/Pinjaman" };
      }
      default: {
        const columns: ExportColumn[] = [{ key: "metric", label: "Metrik" }, { key: "value", label: "Nilai (RM)" }];
        const rows = [
          { metric: "Jumlah Aset Cair", value: totalLiquidAssets },
          { metric: "Jumlah Belum Terima", value: totalReceivables },
          { metric: "Jumlah Belum Bayar", value: totalPayables },
          { metric: "Jumlah Hutang", value: totalDebts },
          { metric: "Jumlah Aset", value: aggregateAssets },
          { metric: "Jumlah Liabiliti", value: aggregateLiabilities },
        ];
        return { columns, rows, title: "Ringkasan Kewangan" };
      }
    }
  }, [
    selectedReport, financialEvents, receivablesAgingData, payablesAgingData, commitmentBurnData,
    healthScoring, totalLiquidAssets, totalReceivables, totalPayables, totalDebts, aggregateAssets, aggregateLiabilities,
    taxReadiness, bankReadiness,
  ]);

  const exportFilenameBase = `MyKerani_${activeWorkspace.name}_${selectedReport}_${new Date().toISOString().slice(0, 10)}`.replace(/\s+/g, "_");

  const handleExport = (format: "csv" | "excel" | "pdf" | "json") => {
    const { columns, rows, title } = exportDataset;
    if (format === "csv") exportToCSV(rows, columns, `${exportFilenameBase}.csv`);
    if (format === "excel") exportToExcel(rows, columns, `${exportFilenameBase}.xls`);
    if (format === "pdf") exportToPDF(rows, columns, `${exportFilenameBase}.pdf`, title);
    if (format === "json") exportToJSON(rows, `${exportFilenameBase}.json`, { workspace: activeWorkspace.name, report: selectedReport, generatedAt: new Date().toISOString() });

    if (user && activeTenant) {
      logEvent({
        tenantId: activeTenant.id, workspaceId: activeWorkspace.id, userId: user.id,
        userEmail: user.email, userRole: user.role, eventType: "EXPORT",
        description: `Exported ${title} as ${format.toUpperCase()}`,
        metadata: { report: selectedReport, format, rowCount: rows.length },
      });
    }
  };

  const handlePrint = () => {
    window.print();
    if (user && activeTenant) {
      logEvent({
        tenantId: activeTenant.id, workspaceId: activeWorkspace.id, userId: user.id,
        userEmail: user.email, userRole: user.role, eventType: "REPORT_GENERATION",
        description: `Generated/printed ${exportDataset.title}`,
        metadata: { report: selectedReport },
      });
    }
  };

  return (
    <div className="space-y-6" id="reports_foundation_root">
      
      {/* Upper Report Deck Description Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 p-4 border border-slate-200 rounded-xl">
        <div className="space-y-1">
          <span className="text-[10px] font-mono uppercase bg-slate-900 text-slate-100 px-2.5 py-0.5 rounded-md font-bold">
            Read-Only Analytics Panel
          </span>
          <p className="text-xs text-slate-500 font-sans">
            Laporan berkanun ini dikompilasi secara automatik berasaskan rekod-rekod dwi-lejar berasingan yang sah dalam workspace <strong>{activeWorkspace.name}</strong>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="px-3 py-1.5 border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium flex items-center transition cursor-pointer"
            id="btn_print_report"
          >
            <Printer className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
            Cetak Laporan
          </button>
          <button
            onClick={() => handleExport("csv")}
            className="px-3 py-1.5 border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium flex items-center transition cursor-pointer"
            id="btn_export_csv"
          >
            <Download className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
            CSV
          </button>
          <button
            onClick={() => handleExport("excel")}
            className="px-3 py-1.5 border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium flex items-center transition cursor-pointer"
            id="btn_export_excel"
          >
            <Download className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
            Excel
          </button>
          <button
            onClick={() => handleExport("pdf")}
            className="px-3 py-1.5 border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium flex items-center transition cursor-pointer"
            id="btn_export_pdf"
          >
            <Download className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
            PDF
          </button>
          <button
            onClick={() => handleExport("json")}
            className="px-3 py-1.5 border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium flex items-center transition cursor-pointer"
            id="btn_export_json"
          >
            <Download className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
            JSON
          </button>
        </div>
      </div>

      {/* Main Structural Boundary Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Navigation Sidebar Selector (Col span 3) */}
        <div className="lg:col-span-3 flex flex-col space-y-2">
          <p className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider mb-1 px-2">
            Senarai Laporan Berkanun
          </p>
          <button
            onClick={() => { setSelectedReport("summary"); setSearchTerm(""); }}
            className={`w-full text-left px-3.5 py-3 rounded-xl text-xs font-semibold flex items-center justify-between transition border ${
              selectedReport === "summary"
                ? "bg-slate-950 border-slate-950 text-white shadow-xs"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-950"
            }`}
            id="nav_report_summary"
          >
            <div className="flex items-center space-x-2">
              <PieChart className="w-4 h-4 text-emerald-500" />
              <span>1. Ringkasan Kedudukan Kewangan</span>
            </div>
          </button>

          <button
            onClick={() => { setSelectedReport("cashflow"); setSearchTerm(""); }}
            className={`w-full text-left px-3.5 py-3 rounded-xl text-xs font-semibold flex items-center justify-between transition border ${
              selectedReport === "cashflow"
                ? "bg-slate-950 border-slate-950 text-white shadow-xs"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-950"
            }`}
            id="nav_report_cashflow"
          >
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-indigo-505" />
              <span>2. Ringkasan Aliran Tunai</span>
            </div>
          </button>

          <button
            onClick={() => { setSelectedReport("receivables_aging"); setSearchTerm(""); }}
            className={`w-full text-left px-3.5 py-3 rounded-xl text-xs font-semibold flex items-center justify-between transition border ${
              selectedReport === "receivables_aging"
                ? "bg-slate-950 border-slate-950 text-white shadow-xs"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-950"
            }`}
            id="nav_report_receivables_aging"
          >
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-blue-500" />
              <span>3. Penuaan Tuntutan (Receivable Aging)</span>
            </div>
          </button>

          <button
            onClick={() => { setSelectedReport("payables_aging"); setSearchTerm(""); }}
            className={`w-full text-left px-3.5 py-3 rounded-xl text-xs font-semibold flex items-center justify-between transition border ${
              selectedReport === "payables_aging"
                ? "bg-slate-950 border-slate-950 text-white shadow-xs"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-950"
            }`}
            id="nav_report_payables_aging"
          >
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              <span>4. Penuaan Hutang Pembekal (Payables)</span>
            </div>
          </button>

          <button
            onClick={() => { setSelectedReport("commitments"); setSearchTerm(""); }}
            className={`w-full text-left px-3.5 py-3 rounded-xl text-xs font-semibold flex items-center justify-between transition border ${
              selectedReport === "commitments"
                ? "bg-slate-950 border-slate-950 text-white shadow-xs"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-950"
            }`}
            id="nav_report_commitments"
          >
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-rose-500" />
              <span>5. Laporan Sektor Komitmen Kontrak</span>
            </div>
          </button>

          <button
            onClick={() => { setSelectedReport("health"); setSearchTerm(""); }}
            className={`w-full text-left px-3.5 py-3 rounded-xl text-xs font-semibold flex items-center justify-between transition border ${
              selectedReport === "health"
                ? "bg-slate-950 border-slate-950 text-white shadow-xs"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-950"
            }`}
            id="nav_report_health"
          >
            <div className="flex items-center space-x-2">
              <BarChart4 className="w-4 h-4 text-purple-500" />
              <span>6. Penilaian Kesihatan & Kelangsungan</span>
            </div>
          </button>

          <button
            onClick={() => { setSelectedReport("tax_readiness"); setSearchTerm(""); }}
            className={`w-full text-left px-3.5 py-3 rounded-xl text-xs font-semibold flex items-center justify-between transition border ${
              selectedReport === "tax_readiness"
                ? "bg-slate-950 border-slate-950 text-white shadow-xs"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-950"
            }`}
            id="nav_report_tax_readiness"
          >
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-teal-500" />
              <span>7. Kesediaan Cukai LHDN</span>
            </div>
          </button>

          <button
            onClick={() => { setSelectedReport("bank_readiness"); setSearchTerm(""); }}
            className={`w-full text-left px-3.5 py-3 rounded-xl text-xs font-semibold flex items-center justify-between transition border ${
              selectedReport === "bank_readiness"
                ? "bg-slate-950 border-slate-950 text-white shadow-xs"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-950"
            }`}
            id="nav_report_bank_readiness"
          >
            <div className="flex items-center space-x-2">
              <Building2 className="w-4 h-4 text-cyan-600" />
              <span>8. Kesediaan Pembiayaan/Pinjaman</span>
            </div>
          </button>

          <button
            onClick={() => { setSelectedReport("profit_loss"); setSearchTerm(""); }}
            className={`w-full text-left px-3.5 py-3 rounded-xl text-xs font-semibold flex items-center justify-between transition border ${
              selectedReport === "profit_loss"
                ? "bg-slate-950 border-slate-950 text-white shadow-xs"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-950"
            }`}
            id="nav_report_profit_loss"
          >
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <span>9. Untung Rugi (Profit & Loss)</span>
            </div>
          </button>

          <div className="p-4 bg-indigo-50 rounded-xl space-y-2.5 mt-4 border border-indigo-100">
            <span className="text-[10px] font-mono uppercase bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded font-bold">
              Nota Kedaulatan Data
            </span>
            <p className="text-[11px] text-indigo-900 leading-relaxed font-sans">
              Semua paparan bersifat automatik dan dilarang untuk diubah dari skrin ini. Bagi mengubah rekod asas, sila guna skrin transaksi masing-masing.
            </p>
          </div>
        </div>

        {/* Selected Canvas Frame (Col span 9) */}
        <div className="lg:col-span-9 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
          
          {/* Active Canvas Header */}
          <div className="border-b border-slate-100 pb-4">
            <div className="flex items-center space-x-2 text-rose-500 font-mono text-[10px] uppercase font-bold tracking-wider">
              <span>Sistem Penyediaan Automatik Terkawal</span>
            </div>
            <h3 className="font-display font-bold text-lg text-slate-950 mt-1">
              {selectedReport === "summary" && "1. Laporan Kedudukan Kewangan Bersih (Financial Position)"}
              {selectedReport === "cashflow" && "2. Laporan Kedudukan Aliran Tunai Selesa (Cashflow Matrix)"}
              {selectedReport === "receivables_aging" && "3. Laporan Penuaan Tuntutan Jualan Terkumpul"}
              {selectedReport === "payables_aging" && "4. Laporan Penuaan Hutang Pembekal & Bil Belum Bayar"}
              {selectedReport === "commitments" && "5. Laporan Inventori Komitmen Operasional & Kontrak"}
              {selectedReport === "health" && "6. Skor Kesihatan Syarikat & Ramalan Jangka Kelangsungan"}
              {selectedReport === "tax_readiness" && "7. Senarai Semak Kesediaan Cukai LHDN"}
              {selectedReport === "bank_readiness" && "8. Senarai Semak Kesediaan Pembiayaan/Pinjaman"}
              {selectedReport === "profit_loss" && "9. Penyata Untung Rugi (Profit & Loss Statement)"}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 font-sans">
              Sektor perakaunan pintar bertauliah dari platform MYKERANI.
            </p>
          </div>

          {/* Report 1: Summary Report */}
          {selectedReport === "summary" && (
            <div className="space-y-6 animate-fade-in" id="report_summary_view">
              
              {/* Top Highlighting Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-50 p-4 border border-slate-200 rounded-xl">
                  <span className="text-[10px] font-mono uppercase text-slate-400 font-bold block">
                    JUMLAH ASET
                  </span>
                  <p className="text-lg font-mono font-bold text-slate-900 mt-1">
                    RM {aggregateAssets.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                  </p>
                  <span className="text-[9px] text-slate-405 font-sans mt-1 block">
                    Mudah tunai + tuntutan pelanggan
                  </span>
                </div>

                <div className="bg-slate-50 p-4 border border-slate-200 rounded-xl">
                  <span className="text-[10px] font-mono uppercase text-slate-400 font-bold block">
                    JUMLAH LIABILITI
                  </span>
                  <p className="text-lg font-mono font-bold text-rose-600 mt-1">
                    RM {aggregateLiabilities.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                  </p>
                  <span className="text-[9px] text-slate-405 font-sans mt-1 block">
                    Hutang pembekal + pinjaman aktif
                  </span>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl text-white">
                  <span className="text-[10px] font-mono uppercase text-indigo-200 font-bold block">
                    EKUITI BERSIH (MARGINAL)
                  </span>
                  <p className={`text-lg font-mono font-bold mt-1 ${netCapitalMargin >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    RM {netCapitalMargin.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                  </p>
                  <span className="text-[9px] text-indigo-200 font-sans mt-1 block">
                    Jumlah aset bersih sedia ada
                  </span>
                </div>
              </div>

              {/* Detailed Ledger Section */}
              <div className="space-y-4">
                <h4 className="font-display font-semibold text-xs text-slate-900 uppercase tracking-wide">
                  Butiran Aliran Lejar Kunci
                </h4>

                <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                  <div className="grid grid-cols-12 bg-slate-50 p-3 font-semibold text-slate-500 border-b border-slate-200">
                    <span className="col-span-6 font-mono uppercase tracking-wider text-[10px]">Aset Semasa (Current Assets)</span>
                    <span className="col-span-3 text-right font-mono uppercase tracking-wider text-[10px]">Kadar</span>
                    <span className="col-span-3 text-right font-mono uppercase tracking-wider text-[10px]">Nilai Kuasa (MYR)</span>
                  </div>

                  <div className="divide-y divide-slate-150">
                    <div className="grid grid-cols-12 p-3 items-center">
                      <div className="col-span-6">
                        <span className="font-semibold text-slate-800 font-sans block">Baki Laci Tunai</span>
                        <span className="text-[10px] text-slate-400">Physical safe balances across physical terminals</span>
                      </div>
                      <span className="col-span-3 text-right text-slate-500">Liquid Cash</span>
                      <span className="col-span-3 text-right font-mono text-slate-900 font-semibold">RM {totalCash.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</span>
                    </div>

                    <div className="grid grid-cols-12 p-3 items-center">
                      <div className="col-span-6">
                        <span className="font-semibold text-slate-800 font-sans block">Baki Vault Simpanan Bank</span>
                        <span className="text-[10px] text-slate-400">Secured clearing business bank deposits</span>
                      </div>
                      <span className="col-span-3 text-right text-slate-500">Liquid Savings</span>
                      <span className="col-span-3 text-right font-mono text-slate-900 font-semibold">RM {totalBank.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</span>
                    </div>

                    <div className="grid grid-cols-12 p-3 items-center">
                      <div className="col-span-6">
                        <span className="font-semibold text-indigo-750 font-sans block">Jumlah Piutang (Receivables)</span>
                        <span className="text-[10px] text-slate-400">Outstanding invoices issued to business clients</span>
                      </div>
                      <span className="col-span-3 text-right text-slate-500">Outstanding Invoices</span>
                      <span className="col-span-3 text-right font-mono text-indigo-600 font-semibold">RM {totalReceivables.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                  <div className="grid grid-cols-12 bg-slate-50 p-3 font-semibold text-slate-500 border-b border-slate-200">
                    <span className="col-span-6 font-mono uppercase tracking-wider text-[10px]">Kewajipan Semasa (Current Liabilities)</span>
                    <span className="col-span-3 text-right font-mono uppercase tracking-wider text-[10px]">Pihak</span>
                    <span className="col-span-3 text-right font-mono uppercase tracking-wider text-[10px]">Nilai Hutang (MYR)</span>
                  </div>

                  <div className="divide-y divide-slate-150">
                    <div className="grid grid-cols-12 p-3 items-center">
                      <div className="col-span-6">
                        <span className="font-semibold text-slate-800 font-sans block">Hutang Tempoh Pembekal (Payables)</span>
                        <span className="text-[10px] text-slate-400">Direct trade payables from received supply lines</span>
                      </div>
                      <span className="col-span-3 text-right text-slate-500">Vendor Bills</span>
                      <span className="col-span-3 text-right font-mono text-rose-600 font-semibold">RM {totalPayables.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</span>
                    </div>

                    <div className="grid grid-cols-12 p-3 items-center">
                      <div className="col-span-6">
                        <span className="font-semibold text-slate-800 font-sans block">Kredit Bertulis & Pembiayaan Pajakan (Debt)</span>
                        <span className="text-[10px] text-slate-400">Total remaining principal of collateralized bank loans</span>
                      </div>
                      <span className="col-span-3 text-right text-slate-500">Active Borrowings</span>
                      <span className="col-span-3 text-right font-mono text-rose-600 font-semibold">RM {totalDebts.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1 text-slate-600">
                  <div className="flex items-center space-x-1.5 font-semibold text-slate-800">
                    <Info className="w-3.5 h-3.5 text-indigo-505" />
                    <span>Lembaga Audit Kewangan Tempatan</span>
                  </div>
                  <p className="leading-relaxed">
                    Sistem memastikan workspace diasingkan secara fizikal di bawah tenant ID anda. Tidak ada sebarang risiko pendedahan merentas portal atau percampuran baki di peringkat pangkalan data.
                  </p>
                </div>

              </div>

            </div>
          )}

          {/* Report 2: Cashflow Report */}
          {selectedReport === "cashflow" && (
            <div className="space-y-6 animate-fade-in" id="report_cashflow_view">
              
              {/* Cashflow core metrics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-emerald-50 border border-emerald-150 p-4 rounded-xl text-emerald-800">
                  <span className="text-[10px] font-mono uppercase text-emerald-700 font-bold block">
                    ALIRAN MASUK BERJAYA (INFLOW)
                  </span>
                  <p className="text-xl font-mono font-bold mt-1">
                    + RM {sumCompletedInflow.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                  </p>
                  <span className="text-[9px] text-emerald-650 font-sans mt-0.5 block">
                    Berasas resit pendapatan disahkan
                  </span>
                </div>

                <div className="bg-rose-50 border border-rose-150 p-4 rounded-xl text-rose-800">
                  <span className="text-[10px] font-mono uppercase text-rose-700 font-bold block">
                    ALIRAN KELUAR BERJAYA (OUTFLOW)
                  </span>
                  <p className="text-xl font-mono font-bold mt-1">
                    - RM {sumCompletedOutflow.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                  </p>
                  <span className="text-[9px] text-rose-650 font-sans mt-0.5 block">
                    Berasas bil & perbelanjaan dibayar
                  </span>
                </div>

                <div className="bg-slate-900 text-white p-4 rounded-xl">
                  <span className="text-[10px] font-mono text-slate-350 uppercase font-bold block">
                    PERUBAHAN ALIRAN BERSIH
                  </span>
                  <p className={`text-xl font-mono font-bold mt-1 ${netCashflowChange >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    RM {netCashflowChange.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                  </p>
                  <span className="text-[9px] text-slate-400 font-sans mt-0.5 block">
                    Peningkatan/susutan tunai bersih
                  </span>
                </div>
              </div>

              {/* Transactions search section */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h4 className="font-display font-semibold text-xs text-slate-900 uppercase">
                    Aktiviti Aliran Tunai Selesai ({completedInflows.length + completedOutflows.length} item)
                  </h4>
                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      className="w-full text-xs font-sans pl-8 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden"
                      placeholder="Cari pihak atau kategori..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>

                {/* Combined Table of Completed Events */}
                <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono text-[9px] uppercase tracking-wider">
                          <th className="p-3">Ref</th>
                          <th className="p-3">Kategori</th>
                          <th className="p-3">Tarikh Selesai</th>
                          <th className="p-3">Pihak Berkenaan</th>
                          <th className="p-3 text-right">Nilai (MYR)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {(() => {
                          const combined = [...completedInflows, ...completedOutflows]
                            .sort((a,b) => b.date.localeCompare(a.date))
                            .filter(e => {
                              const key = searchTerm.toLowerCase();
                              return e.categoryName.toLowerCase().includes(key) || 
                                     e.partyName.toLowerCase().includes(key) ||
                                     e.referenceNumber.toLowerCase().includes(key);
                            });

                          if (combined.length === 0) {
                            return (
                              <tr>
                                <td colSpan={5} className="p-6 text-center text-slate-400 italic">
                                  Tiada rekod seseai ditemui untuk penapis terkini.
                                </td>
                              </tr>
                            );
                          }

                          return combined.map(e => {
                            const isIncome = e.type === "INCOME";
                            return (
                              <tr key={e.id} className="hover:bg-slate-50/50">
                                <td className="p-3 font-mono font-bold text-slate-500">{e.referenceNumber || "—"}</td>
                                <td className="p-3">
                                  <span className="font-semibold text-slate-900 block">{e.categoryName}</span>
                                  <span className="text-[10px] text-slate-405 font-mono">{isIncome ? "OPERATING INFLOW" : "OPERATING OUTFLOW"}</span>
                                </td>
                                <td className="p-3 font-mono text-slate-500">{e.date}</td>
                                <td className="p-3 font-medium">{e.partyName}</td>
                                <td className={`p-3 text-right font-mono font-bold ${isIncome ? "text-emerald-600" : "text-rose-600"}`}>
                                  {isIncome ? "+" : "-"} RM {e.amountMyr.toLocaleString()}
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* Report 3: Receivables Aging Report */}
          {selectedReport === "receivables_aging" && (
            <div className="space-y-6 animate-fade-in" id="report_receivables_aging_view">
              
              {/* Summary brackets cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-slate-50 p-3 border border-slate-200 rounded-xl">
                  <span className="text-[9px] font-mono uppercase text-slate-400 font-bold block">
                    Belum Matang (Current)
                  </span>
                  <p className="text-sm font-mono font-bold text-slate-800 mt-0.5">
                    RM {receivablesAgingData.current.toLocaleString()}
                  </p>
                </div>
                <div className="bg-slate-50 p-3 border border-slate-200 rounded-xl">
                  <span className="text-[9px] font-mono uppercase text-slate-400 font-bold block">
                    1-30 Hari Lambat
                  </span>
                  <p className="text-sm font-mono font-bold text-indigo-700 mt-0.5">
                    RM {receivablesAgingData.b1_30.toLocaleString()}
                  </p>
                </div>
                <div className="bg-amber-50 border border-amber-150 p-3 rounded-xl">
                  <span className="text-[9px] font-mono uppercase text-amber-700 font-bold block">
                    31-60 Hari Lambat
                  </span>
                  <p className="text-sm font-mono font-bold text-amber-805 mt-0.5">
                    RM {receivablesAgingData.b31_60.toLocaleString()}
                  </p>
                </div>
                <div className="bg-rose-50 border border-rose-150 p-3 rounded-xl">
                  <span className="text-[9px] font-mono uppercase text-rose-700 font-bold block">
                    60+ Hari Lambat
                  </span>
                  <p className="text-sm font-mono font-bold text-rose-800 mt-0.5">
                    RM {receivablesAgingData.b61_plus.toLocaleString()}
                  </p>
                </div>
                <div className="col-span-2 md:col-span-1 bg-slate-900 text-white p-3 rounded-xl text-center flex flex-col justify-center">
                  <span className="text-[9px] font-mono text-slate-350 uppercase font-bold block">
                    JUMLAH BESAR
                  </span>
                  <p className="text-sm font-mono font-bold mt-0.5">
                    RM {receivablesAgingData.total.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Progress visualizer */}
              <div className="space-y-2">
                <span className="text-[10px] font-mono uppercase text-slate-400 font-bold tracking-wider block">
                  Agihan Peratusan Penuaan Tuntutan
                </span>
                <div className="w-full bg-slate-105 h-4 rounded-lg overflow-hidden flex text-[9px] font-mono text-white text-center font-bold">
                  {receivablesAgingData.total > 0 ? (
                    <>
                      {receivablesAgingData.current > 0 && (
                        <div 
                          className="bg-slate-400 flex items-center justify-center" 
                          style={{ width: `${(receivablesAgingData.current / receivablesAgingData.total) * 100}%` }}
                          title="Current"
                        >
                          {Math.round((receivablesAgingData.current / receivablesAgingData.total) * 100)}%
                        </div>
                      )}
                      {receivablesAgingData.b1_30 > 0 && (
                        <div 
                          className="bg-indigo-505 bg-indigo-500 flex items-center justify-center" 
                          style={{ width: `${(receivablesAgingData.b1_30 / receivablesAgingData.total) * 100}%` }}
                          title="1-30 Days"
                        >
                          {Math.round((receivablesAgingData.b1_30 / receivablesAgingData.total) * 100)}%
                        </div>
                      )}
                      {receivablesAgingData.b31_60 > 0 && (
                        <div 
                          className="bg-amber-500 flex items-center justify-center" 
                          style={{ width: `${(receivablesAgingData.b31_60 / receivablesAgingData.total) * 100}%` }}
                          title="31-60 Days"
                        >
                          {Math.round((receivablesAgingData.b31_60 / receivablesAgingData.total) * 100)}%
                        </div>
                      )}
                      {receivablesAgingData.b61_plus > 0 && (
                        <div 
                          className="bg-rose-500 flex items-center justify-center" 
                          style={{ width: `${(receivablesAgingData.b61_plus / receivablesAgingData.total) * 100}%` }}
                          title="60+ Days"
                        >
                          {Math.round((receivablesAgingData.b61_plus / receivablesAgingData.total) * 100)}%
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="w-full bg-slate-100 text-slate-400 text-center flex items-center justify-center italic font-sans font-medium">
                      Tiada sebarang piutang tertunggak sedia ditayangkan.
                    </div>
                  )}
                </div>
              </div>

              {/* Chronological Outstanding items list */}
              <div className="space-y-3">
                <h4 className="font-display font-semibold text-xs text-slate-900 uppercase">
                  Perincian Item Piutang yang Belum Dikutip
                </h4>

                <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono text-[9px] uppercase tracking-wider">
                        <th className="p-3">Kategori</th>
                        <th className="p-3">Nama Pelanggan</th>
                        <th className="p-3">Tarikh Inv</th>
                        <th className="p-3">Tempoh Lambat</th>
                        <th className="p-3 text-right">Nilai (MYR)</th>
                        <th className="p-3 text-center">Status Braket</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700 font-sans">
                      {(() => {
                        const outstanding = financialEvents.filter(e => e.type === "RECEIVABLE" && !e.isCompleted);
                        if (outstanding.length === 0) {
                          return (
                            <tr>
                              <td colSpan={6} className="p-6 text-center text-slate-400 italic">
                                Sempurna! Tiada baki bil tuntutan pelanggan tertunggak dikesan.
                              </td>
                            </tr>
                          );
                        }

                        return outstanding
                          .sort((a,b) => a.date.localeCompare(b.date))
                          .map(e => {
                            const eventDate = new Date(e.date);
                            const diffMs = baseDate.getTime() - eventDate.getTime();
                            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                            
                            let ageText = diffDays <= 0 ? "Current" : `${diffDays} hari lambat`;
                            let labelStyle = "bg-slate-50 text-slate-600 border-slate-200";
                            
                            if (diffDays >= 1 && diffDays <= 30) {
                              labelStyle = "bg-indigo-50 text-indigo-700 border-indigo-150";
                            } else if (diffDays >= 31 && diffDays <= 60) {
                              labelStyle = "bg-amber-50 text-amber-800 border-amber-200/60";
                            } else if (diffDays > 60) {
                              labelStyle = "bg-rose-50 text-rose-800 border-rose-150";
                            }

                            return (
                              <tr key={e.id} className="hover:bg-slate-50/50">
                                <td className="p-3 font-semibold text-slate-900">{e.categoryName}</td>
                                <td className="p-3 font-medium">{e.partyName}</td>
                                <td className="p-3 font-mono text-slate-500">{e.date}</td>
                                <td className="p-3 font-mono font-bold text-slate-650">{ageText}</td>
                                <td className="p-3 text-right font-mono font-bold text-slate-900">RM {e.amountMyr.toLocaleString()}</td>
                                <td className="p-3 text-center">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[9px] font-bold uppercase ${labelStyle}`}>
                                    {diffDays <= 0 ? "CURRENT" : diffDays <= 30 ? "1-30 DAYS" : diffDays <= 60 ? "31-60 DAYS" : "60+ OVERDUE"}
                                  </span>
                                </td>
                              </tr>
                            );
                          });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* Report 4: Payables Aging Report */}
          {selectedReport === "payables_aging" && (
            <div className="space-y-6 animate-fade-in" id="report_payables_aging_view">
              
              {/* Summary bracket boxes */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-slate-50 p-3 border border-slate-200 rounded-xl">
                  <span className="text-[9px] font-mono uppercase text-slate-400 font-bold block">
                    Belum Matang (Current)
                  </span>
                  <p className="text-sm font-mono font-bold text-slate-850 mt-0.5">
                    RM {payablesAgingData.current.toLocaleString()}
                  </p>
                </div>
                <div className="bg-slate-50 p-3 border border-slate-200 rounded-xl">
                  <span className="text-[9px] font-mono uppercase text-slate-400 font-bold block">
                    1-30 Hari Lambat
                  </span>
                  <p className="text-sm font-mono font-bold text-indigo-700 mt-0.5">
                    RM {payablesAgingData.b1_30.toLocaleString()}
                  </p>
                </div>
                <div className="bg-amber-50 border border-amber-150 p-3 rounded-xl">
                  <span className="text-[9px] font-mono uppercase text-amber-700 font-bold block">
                    31-60 Hari Lambat
                  </span>
                  <p className="text-sm font-mono font-bold text-amber-805 mt-0.5">
                    RM {payablesAgingData.b31_60.toLocaleString()}
                  </p>
                </div>
                <div className="bg-rose-50 border border-rose-150 p-3 rounded-xl">
                  <span className="text-[9px] font-mono uppercase text-rose-700 font-bold block">
                    60+ Hari Lambat
                  </span>
                  <p className="text-sm font-mono font-bold text-rose-800 mt-0.5">
                    RM {payablesAgingData.b61_plus.toLocaleString()}
                  </p>
                </div>
                <div className="col-span-2 md:col-span-1 bg-slate-900 text-white p-3 rounded-xl text-center flex flex-col justify-center">
                  <span className="text-[9px] font-mono text-slate-350 uppercase font-bold block">
                    JUMLAH BESAR
                  </span>
                  <p className="text-sm font-mono font-bold mt-0.5">
                    RM {payablesAgingData.total.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Progress visualizer */}
              <div className="space-y-2">
                <span className="text-[10px] font-mono uppercase text-slate-400 font-bold tracking-wider block">
                  Agihan Peratusan Penuaan Hutang Pembekal
                </span>
                <div className="w-full bg-slate-105 h-4 rounded-lg overflow-hidden flex text-[9px] font-mono text-white text-center font-bold">
                  {payablesAgingData.total > 0 ? (
                    <>
                      {payablesAgingData.current > 0 && (
                        <div 
                          className="bg-slate-400 flex items-center justify-center" 
                          style={{ width: `${(payablesAgingData.current / payablesAgingData.total) * 100}%` }}
                          title="Current"
                        >
                          {Math.round((payablesAgingData.current / payablesAgingData.total) * 100)}%
                        </div>
                      )}
                      {payablesAgingData.b1_30 > 0 && (
                        <div 
                          className="bg-indigo-505 bg-indigo-500 flex items-center justify-center" 
                          style={{ width: `${(payablesAgingData.b1_30 / payablesAgingData.total) * 100}%` }}
                          title="1-30 Days"
                        >
                          {Math.round((payablesAgingData.b1_30 / payablesAgingData.total) * 100)}%
                        </div>
                      )}
                      {payablesAgingData.b31_60 > 0 && (
                        <div 
                          className="bg-amber-500 flex items-center justify-center" 
                          style={{ width: `${(payablesAgingData.b31_60 / payablesAgingData.total) * 100}%` }}
                          title="31-60 Days"
                        >
                          {Math.round((payablesAgingData.b31_60 / payablesAgingData.total) * 100)}%
                        </div>
                      )}
                      {payablesAgingData.b61_plus > 0 && (
                        <div 
                          className="bg-rose-500 flex items-center justify-center" 
                          style={{ width: `${(payablesAgingData.b61_plus / payablesAgingData.total) * 100}%` }}
                          title="60+ Days"
                        >
                          {Math.round((payablesAgingData.b61_plus / payablesAgingData.total) * 100)}%
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="w-full bg-slate-100 text-slate-400 text-center flex items-center justify-center italic font-sans font-medium">
                      Tiada sebarang bil pembekal aktif yang tertunggak.
                    </div>
                  )}
                </div>
              </div>

              {/* Chronological Outstanding items list */}
              <div className="space-y-3">
                <h4 className="font-display font-semibold text-xs text-slate-900 uppercase">
                  Perincian Hutang Pembekal & Bil yang Perlu Dijelaskan
                </h4>

                <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono text-[9px] uppercase tracking-wider">
                        <th className="p-3">Kategori Bil</th>
                        <th className="p-3">Nama Pembekal</th>
                        <th className="p-3">Tarikh Bil</th>
                        <th className="p-3">Tempoh Lambat</th>
                        <th className="p-3 text-right">Nilai (MYR)</th>
                        <th className="p-3 text-center">Status Braket</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700 font-sans">
                      {(() => {
                        const outstanding = financialEvents.filter(e => e.type === "PAYABLE" && !e.isCompleted);
                        if (outstanding.length === 0) {
                          return (
                            <tr>
                              <td colSpan={6} className="p-6 text-center text-slate-400 italic">
                                Selamat! Tiada baki hutang pembekal belum terbayar dijumpai.
                              </td>
                            </tr>
                          );
                        }

                        return outstanding
                          .sort((a,b) => a.date.localeCompare(b.date))
                          .map(e => {
                            const eventDate = new Date(e.date);
                            const diffMs = baseDate.getTime() - eventDate.getTime();
                            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                            
                            let ageText = diffDays <= 0 ? "Current" : `${diffDays} hari lambat`;
                            let labelStyle = "bg-slate-50 text-slate-600 border-slate-200";
                            
                            if (diffDays >= 1 && diffDays <= 30) {
                              labelStyle = "bg-indigo-50 text-indigo-700 border-indigo-150";
                            } else if (diffDays >= 31 && diffDays <= 60) {
                              labelStyle = "bg-amber-50 text-amber-800 border-amber-200/60";
                            } else if (diffDays > 60) {
                              labelStyle = "bg-rose-50 text-rose-800 border-rose-150";
                            }

                            return (
                              <tr key={e.id} className="hover:bg-slate-50/50">
                                <td className="p-3 font-semibold text-slate-900">{e.categoryName}</td>
                                <td className="p-3 font-medium">{e.partyName}</td>
                                <td className="p-3 font-mono text-slate-500">{e.date}</td>
                                <td className="p-3 font-mono font-bold text-slate-650">{ageText}</td>
                                <td className="p-3 text-right font-mono font-bold text-rose-600">RM {e.amountMyr.toLocaleString()}</td>
                                <td className="p-3 text-center">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[9px] font-bold uppercase ${labelStyle}`}>
                                    {diffDays <= 0 ? "CURRENT" : diffDays <= 30 ? "1-30 DAYS" : diffDays <= 60 ? "31-60 DAYS" : "60+ OVERDUE"}
                                  </span>
                                </td>
                              </tr>
                            );
                          });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* Report 5: Commitment Report */}
          {selectedReport === "commitments" && (
            <div className="space-y-6 animate-fade-in" id="report_commitments_view">
              
              {/* Burn Rate box headers */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-950 text-white p-4 rounded-xl">
                  <span className="text-[10px] font-mono text-indigo-200 font-bold block">
                    KOMITMEN KONTRAK AKTIF
                  </span>
                  <p className="text-xl font-mono font-bold mt-1">
                    {commitmentBurnData.count} Isian Kontrak
                  </p>
                  <span className="text-[9px] text-indigo-300 font-sans mt-0.5 block">
                    Menyokong rancangan operasi pelbagai jangka
                  </span>
                </div>

                <div className="bg-slate-550 bg-slate-50 border border-slate-200 p-4 rounded-xl">
                  <span className="text-[10px] font-mono uppercase text-slate-400 font-bold block">
                    BURN RATE BULANAN (ESTIMASI)
                  </span>
                  <p className="text-xl font-mono font-bold text-slate-900 mt-1">
                    RM {commitmentBurnData.monthlyBurn.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                  </p>
                  <span className="text-[9px] text-slate-405 font-sans mt-0.5 block">
                    Kadar bil berulang ditukarkan ke bulanan
                  </span>
                </div>

                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                  <span className="text-[10px] font-mono uppercase text-slate-400 font-bold block">
                    LIABILITI TAHUNAN PROJEK
                  </span>
                  <p className="text-xl font-mono font-bold text-rose-605 text-rose-700 mt-1">
                    RM {commitmentBurnData.annualBurn.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                  </p>
                  <span className="text-[9px] text-slate-405 font-sans mt-0.5 block">
                    Hasil darab 12 bulan komitmen aktif syarikat
                  </span>
                </div>
              </div>

              {/* Items Table detailed */}
              <div className="space-y-3">
                <h4 className="font-display font-semibold text-xs text-slate-900 uppercase">
                  Inventori & Sumbangan Kadar Bulanan Kontrak Aktif
                </h4>

                <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono text-[9px] uppercase tracking-wider">
                        <th className="p-3">Syarikat / Pemberi Pajakan</th>
                        <th className="p-3">Kekerapan (Interval)</th>
                        <th className="p-3">Tarikh Mula</th>
                        <th className="p-3 text-right">Nilai Kontrak</th>
                        <th className="p-3 text-right">Kesan Bulanan (MYR)</th>
                        <th className="p-3 text-center">Keadaan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700 font-sans">
                      {commitmentBurnData.items.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-slate-400 italic">
                            Tiada sebarang komitmen kontrak berjadual yang aktif dalam workspace ini.
                          </td>
                        </tr>
                      ) : (
                        commitmentBurnData.items.map(c => {
                          return (
                            <tr key={c.id} className="hover:bg-slate-50/50">
                              <td className="p-3">
                                <span className="font-semibold text-slate-900 block">{c.obligeeName}</span>
                                <span className="text-[10px] font-mono text-slate-400 block truncate max-w-[200px]" title={c.description}>
                                  {c.description || "—"}
                                </span>
                              </td>
                              <td className="p-3">
                                <span className="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded font-mono font-bold text-[9px] tracking-wide select-none">
                                  {c.recurrence}
                                </span>
                              </td>
                              <td className="p-3 font-mono text-slate-500">{c.startDate}</td>
                              <td className="p-3 text-right font-mono font-bold text-slate-900">
                                RM {c.amountPerIntervalMyr.toLocaleString()}
                              </td>
                              <td className="p-3 text-right font-mono font-bold text-rose-600">
                                RM {Math.round(c.monthlyContribution).toLocaleString()}
                              </td>
                              <td className="p-3 text-center">
                                <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-150 text-[9px] font-bold">
                                  AKTIF
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* Report 6: Financial Health Report */}
          {selectedReport === "health" && (
            <div className="space-y-6 animate-fade-in" id="report_health_view">
              
              {/* Detailed diagnostics indicators grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                
                {/* Solvency Solvency Indicator */}
                <div className={`p-5 rounded-2xl border-2 space-y-3 ${healthScoring.solvencyColor}`}>
                  <div className="flex justify-between items-center border-b border-white/20 pb-2">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wide">
                      Aset vs Liabiliti (Solvency)
                    </span>
                    <span className="text-xs font-mono font-bold">{healthScoring.solvencyGrade}</span>
                  </div>
                  <div>
                    <span className="text-[10px] block opacity-80 font-medium">Nisbah Pelindung</span>
                    <p className="text-2xl font-mono font-bold tracking-tight mt-0.5">
                      {healthScoring.solvencyRatio.toFixed(2)}x
                    </p>
                    <p className="text-[11px] font-sans mt-2 opacity-90 leading-relaxed">
                      Mengukur sama ada nilai keseluruhan tunai dan tuntutan dwi-lejar mencukupi untuk menutupi hutang dan bil supplier. Tahap semasa: <strong>{healthScoring.solvencyGrade}</strong>.
                    </p>
                  </div>
                </div>

                {/* Quick Liquidity Indicator */}
                <div className={`p-5 rounded-2xl border-2 space-y-3 ${healthScoring.quickColor}`}>
                  <div className="flex justify-between items-center border-b border-white/20 pb-2">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wide">
                      Mudah Tunai vs Bil (Quick Ratio)
                    </span>
                    <span className="text-xs font-mono font-bold">{healthScoring.quickGrade}</span>
                  </div>
                  <div>
                    <span className="text-[10px] block opacity-80 font-medium">Liquid Quotient</span>
                    <p className="text-2xl font-mono font-bold tracking-tight mt-0.5">
                      {healthScoring.quickRatio.toFixed(2)}x
                    </p>
                    <p className="text-[11px] font-sans mt-2 opacity-90 leading-relaxed">
                      Mengesan keupayaan perniagaan anda membayar bil pembekal serta-merta menggunakan baki tunai & bank sedia ada. Keadaan: <strong>{healthScoring.quickGrade}</strong>.
                    </p>
                  </div>
                </div>

                {/* Survival Operating Runway Indicator */}
                <div className={`p-5 rounded-2xl border-2 space-y-3 ${healthScoring.runwayColor}`}>
                  <div className="flex justify-between items-center border-b border-white/20 pb-2">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wide">
                      Kelangsungan Operasi (Runway)
                    </span>
                    <span className="text-xs font-mono font-bold">{healthScoring.runwayGrade}</span>
                  </div>
                  <div>
                    <span className="text-[10px] block opacity-80 font-medium font-semibold">Tahan Tanpa Jualan</span>
                    <p className="text-2xl font-mono font-bold tracking-tight mt-0.5">
                      {healthScoring.runwayMonths === 999 ? "∞" : `${healthScoring.runwayMonths.toFixed(1)} Bulan`}
                    </p>
                    <p className="text-[11px] font-sans mt-2 opacity-90 leading-relaxed">
                      Nisbah baki tunai cair dibahagi dengan bil komitmen bulanan syarikat. Jangkaan ketahanan: <strong>{healthScoring.runwayGrade}</strong>.
                    </p>
                  </div>
                </div>

              </div>

              {/* Cognitive Health Assessment Checklist */}
              <div className="space-y-3">
                <h4 className="font-display font-semibold text-xs text-slate-900 uppercase tracking-widest">
                  Analisis Risiko & Status Berkanun PKS
                </h4>

                <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden text-xs">
                  
                  <div className="p-4 flex items-start space-x-3.5 bg-slate-50/50">
                    <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <span className="font-bold text-slate-805 block">Pematuhan Pengasingan Workspace (Tenant Isolation Rule)</span>
                      <p className="text-slate-505 leading-relaxed font-sans">
                        Pemeriksaan dwi-lejar mengesahkan tiada data silang atau bocor dikesan merentas entiti perniagaan. Segala audit diasingkan sepenuhnya di peringkat data storage.
                      </p>
                    </div>
                  </div>

                  <div className="p-4 flex items-start space-x-3.5">
                    {receivablesAgingData.b61_plus > 0 ? (
                      <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1">
                      <span className="font-bold text-slate-805 block">Kualiti Piutang (Receivables Age Balance)</span>
                      <p className="text-slate-505 leading-relaxed font-sans">
                        {receivablesAgingData.b61_plus > 0 ? (
                          <span className="text-rose-700">Perhatian: Anda mempunyai sebanyak RM {receivablesAgingData.b61_plus.toLocaleString()} bil tuntutan melebihi 60 hari lama. Sila lakukan kutipan segera untuk memulihkan mudah tunai.</span>
                        ) : (
                          "Tiada baki piutang lapuk melebihi 60 hari dikesan. Semua aliran pelanggan adalah segar dan memuaskan."
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="p-4 flex items-start space-x-3.5">
                    {totalPayables > totalLiquidAssets ? (
                      <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1">
                      <span className="font-bold text-slate-805 block">Sokongan Hutang Pembekal (Payables Covered Rate)</span>
                      <p className="text-slate-505 leading-relaxed font-sans">
                        {totalPayables > totalLiquidAssets ? (
                          <span className="text-amber-80 *0 text-amber-800">Amaran mudah tunai: Hutang pembekal tertinggal melebihi baki tunai lancar syarikat. Kami menasihati anda menetapkan jadual pembayaran ansuran or perbaharui tempoh kredit.</span>
                        ) : (
                          "Baki tunai dan dana bank sedia ada syarikat tersangat mantap buat masa kini untuk melunaskan seluruh jumlah hutang pembekal pada bila-bila masa sahaja."
                        )}
                      </p>
                    </div>
                  </div>

                </div>
              </div>

            </div>
          )}

          {/* Report 7: LHDN Tax Readiness */}
          {selectedReport === "tax_readiness" && (
            <div className="space-y-6 animate-fade-in" id="report_tax_readiness_view">

              <div className={`p-5 rounded-2xl border-2 space-y-2 ${taxReadiness.scoreColor}`}>
                <div className="flex justify-between items-center border-b border-white/20 pb-2">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wide">
                    Skor Kesediaan Cukai LHDN
                  </span>
                  <span className="text-xs font-mono font-bold">{taxReadiness.passedCount}/{taxReadiness.totalChecks} Pemeriksaan Lulus</span>
                </div>
                <p className="text-2xl font-mono font-bold tracking-tight mt-0.5">
                  {taxReadiness.scorePct.toFixed(0)}%
                </p>
                <p className="text-[11px] font-sans mt-1 opacity-90 leading-relaxed">
                  Status: <strong>{taxReadiness.scoreGrade}</strong>. Skor ini dikira terus daripada kelengkapan rekod pendapatan, perbelanjaan, bukti dokumen dan profil perniagaan anda — bukan anggaran kosmetik.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="font-display font-semibold text-xs text-slate-900 uppercase tracking-widest">
                  Senarai Semak Terperinci
                </h4>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden text-xs">
                  {taxReadiness.checks.map(c => (
                    <div key={c.id} className="p-4 flex items-start space-x-3.5">
                      {c.pass ? (
                        <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      )}
                      <div className="space-y-1">
                        <span className="font-bold text-slate-805 block">{c.label}</span>
                        <p className={`leading-relaxed font-sans ${c.pass ? "text-slate-505" : "text-amber-700"}`}>{c.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-[11px] text-slate-500 leading-relaxed font-sans">
                  Senarai semak ini adalah panduan kesediaan dalaman MYKERANI dan bukan nasihat percukaian rasmi. Sila rujuk akauntan bertauliah atau LHDN sebelum penyerahan cukai sebenar.
                </p>
              </div>

            </div>
          )}

          {/* Report 8: Bank/Financing Readiness */}
          {selectedReport === "bank_readiness" && (
            <div className="space-y-6 animate-fade-in" id="report_bank_readiness_view">

              <div className={`p-5 rounded-2xl border-2 space-y-2 ${bankReadiness.scoreColor}`}>
                <div className="flex justify-between items-center border-b border-white/20 pb-2">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wide">
                    Skor Kesediaan Pembiayaan/Pinjaman
                  </span>
                  <span className="text-xs font-mono font-bold">{bankReadiness.passedCount}/{bankReadiness.totalChecks} Pemeriksaan Lulus</span>
                </div>
                <p className="text-2xl font-mono font-bold tracking-tight mt-0.5">
                  {bankReadiness.scorePct.toFixed(0)}%
                </p>
                <p className="text-[11px] font-sans mt-1 opacity-90 leading-relaxed">
                  Status: <strong>{bankReadiness.scoreGrade}</strong>. Skor ini dikira daripada nisbah solvensi, penampan mudah tunai, rekod pembayaran hutang dan kutipan piutang sebenar anda. Kriteria sebenar berbeza mengikut bank/institusi — ini adalah panduan signal umum, bukan kelulusan rasmi.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="font-display font-semibold text-xs text-slate-900 uppercase tracking-widest">
                  Senarai Semak Terperinci
                </h4>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden text-xs">
                  {bankReadiness.checks.map(c => (
                    <div key={c.id} className="p-4 flex items-start space-x-3.5">
                      {c.pass ? (
                        <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      )}
                      <div className="space-y-1">
                        <span className="font-bold text-slate-805 block">{c.label}</span>
                        <p className={`leading-relaxed font-sans ${c.pass ? "text-slate-505" : "text-amber-700"}`}>{c.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-[11px] text-slate-500 leading-relaxed font-sans">
                  Senarai semak ini adalah panduan kesediaan dalaman MYKERANI berdasarkan signal kewangan umum dan bukan kelulusan atau nasihat pembiayaan rasmi. Setiap bank/institusi mempunyai kriteria sendiri — sila rujuk pegawai pembiayaan untuk penilaian sebenar.
                </p>
              </div>

            </div>
          )}

          {selectedReport === "profit_loss" && (
            <div className="animate-fade-in" id="report_profit_loss_view">
              <ProfitLossReport
                financialEvents={financialEvents}
                financialEvidencePackages={financialEvidencePackages}
              />
            </div>
          )}

        </div>

      </div>

    </div>
  );
};
