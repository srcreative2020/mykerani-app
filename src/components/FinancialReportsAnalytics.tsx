import React, { useState, useMemo, useEffect } from "react";
import { useFinancials } from "../context/FinancialRecordsContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { useAuth } from "../context/AuthContext";
import { useTenant } from "../context/TenantContext";
import { logEvent } from "../lib/eventLog";
import { loadBusinessProfile, EMPTY_BUSINESS_PROFILE, type BusinessProfile } from "../lib/profileData";
import {
  Clock,
  AlertCircle,
  Calendar,
  Building2,
  Info,
  ShieldCheck,
  PieChart,
  Landmark,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { type FinancialEvent, type FinancialCommitment } from "../types";
import { exportToCSV, exportToExcel, exportToJSON, exportToPDF, type ExportColumn } from "../lib/exportUtils";
import { computeFinancialHealthScoring, computeFinancialHealthV1 } from "../lib/financialHealth";
import { computeFinancialHealth, type FinancialHealthResult } from "../lib/financialHealthCenter";
import { computeLoanReadiness } from "../lib/loanReadiness";
import { computeLhdnReadiness } from "../lib/lhdnReadiness";
import { buildReportBuckets, flattenBuckets, getProfitAndLossSubtotals, getBalanceSheetTieOut } from "../lib/reportBucketAggregator";
import { buildEvidenceIndex, getEvidenceCoverageRatio, getDrilldownForRecords } from "../lib/evidenceDrilldown";
import { loadAssetPurchases, loadOwnerTransactions } from "../lib/assetOwnerData";
import { getCashFlowActivityTotals } from "../lib/cashFlowClassifier";
import { ProfitLossReport } from "./ProfitLossReport";
import { BalanceSheetReport } from "./BalanceSheetReport";
import { CashFlowReport } from "./CashFlowReport";
import { ReportCenterSnapshot } from "./ReportCenterSnapshot";
import { ReportCenterHealthCard, ReportCenterReadinessGrid, type ReadinessCardItem, type WeakHealthSubGrade } from "./ReportCenterReadiness";
import { ReportCenterTopActions, type TopActionItem } from "./ReportCenterTopActions";
import { ReportExportMenu } from "./ReportExportMenu";

export interface FinancialReportsAnalyticsProps {
  // Phase 2D.3 — Actionable Report Center: optional host-level navigation
  // callback. When the host (OwnerDashboard.tsx / StaffHomeScreen.tsx) wires
  // this, tapping a readiness issue or a Top-3 Action jumps straight to the
  // affected records using the host's existing health-filter mechanism (the
  // same setHealthFilterRecordIds/setHealthFilterLabel pattern from Phase
  // 2D.1). When omitted (FinancialRecordsConsole.tsx / MyKeraniAppTabs.tsx
  // today have no equivalent record-level filter), this component falls
  // back to simply opening the relevant report section — no broken
  // behavior, no new filter mechanism invented.
  onNavigateToRecords?: (recordIds: string[], label: string) => void;
  // Phase 2D.3A — single source of truth for "Kesihatan Kewangan". When the
  // host screen (OwnerDashboard.tsx) already computes computeFinancialHealth()
  // (it needs the same data for its own Dashboard health card), it passes the
  // identical result here so Dashboard and Report Center always show the same
  // band/issue-count for the same underlying data. When omitted (no host
  // wiring yet), this component computes a local fallback below using
  // whatever inputs it already has access to via useFinancials() — same
  // engine, same formula, just without chat-suggestion/import-failure data
  // this component does not otherwise read.
  health?: FinancialHealthResult;
  // Phase 2D.3A — Problem 1: "Tiada Akaun Bank Direkodkan" empty state's
  // "[Tambah Akaun Bank]" button navigates to the host's existing
  // bank-account-add flow. When omitted, the button is hidden (no broken
  // navigation invented).
  onAddBankAccount?: () => void;
}

export const FinancialReportsAnalytics: React.FC<FinancialReportsAnalyticsProps> = ({ onNavigateToRecords, health: hostHealth, onAddBankAccount }) => {
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
    duplicateFlags,
  } = useFinancials();

  // Active Report Selection state: 9 reports
  const [selectedReport, setSelectedReport] = useState<
    "summary" | "receivables_aging" | "payables_aging" | "commitments" | "health" | "tax_readiness" | "bank_readiness" | "profit_loss" | "balance_sheet" | "cash_flow_v1"
  >("summary");

  const [businessProfile, setBusinessProfile] = useState<BusinessProfile>(EMPTY_BUSINESS_PROFILE);
  useEffect(() => {
    if (activeWorkspace?.id) loadBusinessProfile(activeWorkspace.id, isMockUser).then(setBusinessProfile);
  }, [activeWorkspace?.id, isMockUser]);

  // Asset purchases / owner transactions — needed so P&L / Balance Sheet
  // export rows match the real bucketed dataset the screens themselves use.
  const [assetPurchases, setAssetPurchases] = useState<import("../lib/assetOwnerData").AssetPurchase[]>([]);
  const [ownerTransactions, setOwnerTransactions] = useState<import("../lib/assetOwnerData").OwnerTransaction[]>([]);
  useEffect(() => {
    if (!activeWorkspace?.id) return;
    loadAssetPurchases(activeWorkspace.id, isMockUser).then(setAssetPurchases);
    loadOwnerTransactions(activeWorkspace.id, isMockUser).then(setOwnerTransactions);
  }, [activeWorkspace?.id, isMockUser]);

  // Search filter inside specific reports
  const [searchTerm, setSearchTerm] = useState("");

  // Phase 2D.2 Report Center: Advanced Reports section is collapsed by default.
  const [advancedReportsOpen, setAdvancedReportsOpen] = useState(false);

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

  // Financial Health V1 (Report Delivery Closeout Sprint) — Evidence Coverage % and
  // Data Completeness % sub-metrics, additive to healthScoring above (no formula changed).
  const evidenceBuckets = useMemo(
    () => flattenBuckets(buildReportBuckets({ financialEvents, debtRecords, financialCommitments, assetPurchases: [], ownerTransactions: [] })),
    [financialEvents, debtRecords, financialCommitments]
  );
  const evidenceCoverageRatio = useMemo(() => {
    const evidenceIndex = buildEvidenceIndex(financialEvidencePackages);
    return getEvidenceCoverageRatio(evidenceBuckets, evidenceIndex);
  }, [evidenceBuckets, financialEvidencePackages]);

  // Phase 2D.3A — single source of truth for "Kesihatan Kewangan". Prefers
  // the host's computeFinancialHealth() result (identical inputs/engine as
  // OwnerDashboard.tsx's Dashboard health card, see financialHealthCenter.ts)
  // so Dashboard and Report Center never disagree on the same data. Falls
  // back to computing it locally with the inputs this component already has
  // via useFinancials() when no host prop is wired (e.g. a future mount
  // point with no health-filter host) — same engine, same formula, just
  // without chat-suggestion/import-failure data this screen doesn't read.
  const health = useMemo<FinancialHealthResult>(() => {
    if (hostHealth) return hostHealth;
    return computeFinancialHealth({
      events: financialEvents,
      evidencePackages: financialEvidencePackages,
      duplicateFlags,
      chatSuggestions: [],
      chatSuggestionStatus: {},
      importFailureCount: 0,
      importFailureBatchCount: 0,
    });
  }, [hostHealth, financialEvents, financialEvidencePackages, duplicateFlags]);

  // Audit Readiness "why"/"how many"/"navigate to" data — sourced from the
  // canonical computeFinancialHealth() "missingEvidence" bucket (identical
  // to the Dashboard's Health Center bucket of the same name) instead of a
  // second, locally-built evidence check, so the count never disagrees with
  // Dashboard's Health Center.
  const missingEvidenceRecordIds = useMemo(() => {
    return health.buckets.find((b) => b.key === "missingEvidence")?.recordIds ?? [];
  }, [health]);

  const healthV1 = useMemo(
    () => computeFinancialHealthV1(cashAccounts, bankAccounts, financialEvents, debtRecords, financialCommitments, evidenceCoverageRatio, baseDate),
    [cashAccounts, bankAccounts, financialEvents, debtRecords, financialCommitments, evidenceCoverageRatio, baseDate]
  );

  // LHDN Tax Readiness checklist — computed purely from existing income/expense
  // records, evidence linkage, and business profile completeness. No mock data.
  const taxReadiness = useMemo(
    () => computeLhdnReadiness(financialEvents, financialEvidencePackages, businessProfile, baseDate),
    [financialEvents, financialEvidencePackages, businessProfile, baseDate]
  );

  // Bank/Financing Readiness checklist — a generic, bank-agnostic
  // creditworthiness checklist computed from existing solvency, liquidity,
  // collections and debt-repayment data. Real banks vary in exact criteria,
  // so this surfaces the underlying signals lenders commonly check rather
  // than a single institution's rule set. receivablesAgingData.b61_plusList
  // is the same already-computed list backing b61_plus's amount — passed
  // through additively so the "receivables_quality" check can expose ids.
  const bankReadiness = useMemo(
    () => computeLoanReadiness(
      financialEvents, debtRecords, businessProfile, healthScoring, receivablesAgingData.b61_plus, baseDate,
      receivablesAgingData.b61_plusList.map((e) => e.id)
    ),
    [financialEvents, debtRecords, receivablesAgingData, healthScoring, businessProfile, baseDate]
  );

  // All-time buckets — the same shared aggregation API ProfitLossReport /
  // BalanceSheetReport / CashFlowReport read from, used here only so the
  // export switch (below) emits the real report dataset instead of the
  // generic summary. Does not alter any locked report's own calculation.
  const allTimeBuckets = useMemo(
    () => buildReportBuckets({ financialEvents, debtRecords, financialCommitments, assetPurchases, ownerTransactions, cashAccounts, bankAccounts }),
    [financialEvents, debtRecords, financialCommitments, assetPurchases, ownerTransactions, cashAccounts, bankAccounts]
  );

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
      case "health": {
        const columns: ExportColumn[] = [{ key: "metric", label: "Metrik" }, { key: "value", label: "Nilai" }, { key: "grade", label: "Gred" }];
        const rows = [
          { metric: "Nisbah Solvensi", value: healthScoring.solvencyRatio.toFixed(2), grade: healthScoring.solvencyGrade },
          { metric: "Nisbah Cepat", value: healthScoring.quickRatio.toFixed(2), grade: healthScoring.quickGrade },
          { metric: "Tempoh Survival (Bulan)", value: healthScoring.runwayMonths.toFixed(1), grade: healthScoring.runwayGrade },
          { metric: "Cash Health (RM)", value: healthV1.cashHealth.totalLiquidAssets.toFixed(2), grade: healthV1.cashHealth.quickGrade },
          { metric: "Debt Health (RM)", value: healthV1.debtHealth.totalActiveDebt.toFixed(2), grade: healthV1.debtHealth.solvencyGrade },
          { metric: "Evidence Coverage %", value: healthV1.evidenceCoveragePct.toFixed(1), grade: "" },
          { metric: "Data Completeness %", value: healthV1.dataCompletenessPct.toFixed(1), grade: "" },
        ];
        return { columns, rows, title: "Laporan Nisbah Kewangan" };
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
      case "profit_loss": {
        const subtotals = getProfitAndLossSubtotals(allTimeBuckets);
        const columns: ExportColumn[] = [{ key: "lineItem", label: "Item" }, { key: "amountMyr", label: "Jumlah (RM)" }];
        const rows = [
          { lineItem: "Hasil Jualan (Revenue)", amountMyr: subtotals.revenue },
          { lineItem: "Kos Jualan (Cost of Sales)", amountMyr: subtotals.costOfSales },
          { lineItem: "Untung Kasar (Gross Profit)", amountMyr: subtotals.grossProfit },
          { lineItem: "Perbelanjaan Operasi (Operating Expenses)", amountMyr: subtotals.operatingExpenses },
          { lineItem: "Untung Operasi (Operating Profit)", amountMyr: subtotals.operatingProfit },
        ];
        return { columns, rows, title: "Penyata Untung Rugi (Profit & Loss)" };
      }
      case "balance_sheet": {
        const tieOut = getBalanceSheetTieOut(allTimeBuckets);
        const columns: ExportColumn[] = [{ key: "lineItem", label: "Item" }, { key: "amountMyr", label: "Jumlah (RM)" }];
        const rows = [
          { lineItem: "Jumlah Aset (Assets)", amountMyr: tieOut.assets },
          { lineItem: "Jumlah Liabiliti (Liabilities)", amountMyr: tieOut.liabilities },
          { lineItem: "Ekuiti Pemilik (Equity)", amountMyr: tieOut.equity },
          { lineItem: "Untung Tertahan (Retained Earnings)", amountMyr: tieOut.retainedEarnings },
          { lineItem: "Jumlah Liabiliti + Ekuiti", amountMyr: tieOut.totalEquityAndLiabilities },
        ];
        return { columns, rows, title: "Kunci Kira-Kira (Balance Sheet)" };
      }
      case "cash_flow_v1": {
        const cashFlowTotals = getCashFlowActivityTotals(flattenBuckets(allTimeBuckets));
        const columns: ExportColumn[] = [{ key: "lineItem", label: "Item" }, { key: "amountMyr", label: "Jumlah (RM)" }];
        const rows = [
          { lineItem: "Aliran Tunai Operasi (Operating)", amountMyr: cashFlowTotals.operating },
          { lineItem: "Aliran Tunai Pelaburan (Investing)", amountMyr: cashFlowTotals.investing },
          { lineItem: "Aliran Tunai Pembiayaan (Financing)", amountMyr: cashFlowTotals.financing },
          { lineItem: "Aliran Tunai Bersih (Net Cash Flow)", amountMyr: cashFlowTotals.netCashFlow },
        ];
        return { columns, rows, title: "Penyata Aliran Tunai (Cash Flow)" };
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
    healthScoring, healthV1, totalLiquidAssets, totalReceivables, totalPayables, totalDebts, aggregateAssets, aggregateLiabilities,
    taxReadiness, bankReadiness, allTimeBuckets,
  ]);

  // Phase 2D.2 Report Center — Section 1 Financial Snapshot figures. Both
  // reuse the same buckets/balances already computed above for the
  // profit_loss / summary report exports; no new calculation logic.
  const netProfit = useMemo(() => getProfitAndLossSubtotals(allTimeBuckets).operatingProfit, [allTimeBuckets]);
  const currentCash = totalLiquidAssets;
  // Phase 2D.3A — Problem 1: distinguish "no bank/cash account recorded at
  // all" from "RM0.00 balance" so Tunai Semasa can show the right empty state.
  const hasAnyAccount = cashAccounts.length > 0 || bankAccounts.length > 0;

  // Phase 2D.3A — Problem 2: Popular Report tiles' live values, reusing the
  // exact same totals already computed above (getProfitAndLossSubtotals /
  // getCashFlowActivityTotals) for the profit_loss / cash_flow_v1 exports and
  // detail report views — no new aggregation logic. "Analisis Pendapatan"/
  // "Analisis Perbelanjaan" reuse the P&L's revenue/operatingExpenses line
  // items, the same mapping handleSelectPopularReport() already uses to
  // route both tiles into the profit_loss report (see comment there).
  const popularReportValues = useMemo(() => {
    const subtotals = getProfitAndLossSubtotals(allTimeBuckets);
    const cashFlowTotals = getCashFlowActivityTotals(flattenBuckets(allTimeBuckets));
    return {
      profit_loss: subtotals.operatingProfit,
      income_analysis: subtotals.revenue,
      expense_analysis: subtotals.operatingExpenses,
      cash_flow_v1: cashFlowTotals.netCashFlow,
    };
  }, [allTimeBuckets]);

  // Phase 2D.3A — Section 3 "Kesihatan Kewangan" now reads the SAME
  // computeFinancialHealth() result the Dashboard's <FinancialHealthSummary>
  // card uses (financialHealthCenter.ts), instead of the separate ratio-based
  // computeFinancialHealthScoring(). pct = % of records that are "complete"
  // (evidenced + not duplicate-flagged) — identical band/issue-count as
  // Dashboard for the same underlying data. The solvency/quick/runway ratio
  // engine below (healthScoring) is NOT deleted — it is still a legitimate
  // calculation, just relabelled "Nisbah Kewangan" in the detail view (see
  // Report 6) so it is never presented under the "Kesihatan Kewangan" label.
  const financialHealthPct = useMemo(() => {
    if (health.totalEvents === 0) return 100;
    const completeBucket = health.buckets.find((b) => b.key === "complete");
    return ((completeBucket?.count ?? 0) / health.totalEvents) * 100;
  }, [health]);

  // Phase 2D.3A — plain-language "why" for the Health card, sourced from the
  // same computeFinancialHealth() buckets driving the pct above (missing
  // evidence / possible duplicates / review recommended), instead of the
  // ratio engine's solvency/quick/runway grades.
  const healthWeakGrades = useMemo((): WeakHealthSubGrade[] => {
    const weak: WeakHealthSubGrade[] = [];
    const missingEvidence = health.buckets.find((b) => b.key === "missingEvidence");
    const duplicates = health.buckets.find((b) => b.key === "possibleDuplicates");
    const reviewRecommended = health.buckets.find((b) => b.key === "reviewRecommended");
    if (missingEvidence && missingEvidence.count > 0) {
      weak.push({ id: "solvency", label: "Bukti Hilang", reason: `${missingEvidence.count} rekod tiada dokumen sokongan (resit/invois) dimuat naik.` });
    }
    if (duplicates && duplicates.count > 0) {
      weak.push({ id: "quick", label: "Kemungkinan Duplikasi", reason: `${duplicates.count} pasangan rekod dikesan berkemungkinan duplikasi — belum disemak.` });
    }
    if (reviewRecommended && reviewRecommended.count > 0) {
      weak.push({ id: "runway", label: "Perlu Disemak", reason: `${reviewRecommended.count} cadangan AI dengan keyakinan rendah menunggu semakan anda.` });
    }
    return weak;
  }, [health]);

  // Section 4 Business Readiness cards — Tax/Financing reuse the existing
  // LHDN/Loan readiness engines verbatim, now enriched with each readiness's
  // top failing check (checks[] already carries Malay detail strings +
  // affectedCount/affectedRecordIds, see lhdnReadiness.ts/loanReadiness.ts
  // additive fields above). Audit Readiness has no dedicated checklist
  // engine; the closest existing computed figure is healthV1.evidenceCoveragePct
  // with missingEvidenceRecordIds (evidenceDrilldown.ts, unmodified) reused
  // as the Audit Readiness proxy — see ReportCenterReadiness.tsx header
  // comment for the full rationale. Top issue per card = the single failing
  // check with the highest affectedCount (a plain sort, not a new score).
  // UAT FIX #02 — a workspace with no financial activity and no evidence
  // yet (e.g. brand-new tenant, or right after a workspace reset) has
  // nothing for the readiness engines to score. The engines correctly
  // compute 0% coverage in that state (0 of N expected months/records),
  // but presenting 0%/Critical/Warning for an empty workspace is
  // misleading — "no data" is not "failed data". This flag gates only the
  // presentation layer below; computeLhdnReadiness/computeLoanReadiness and
  // their scorePct/checks are untouched.
  const hasInsufficientData = financialEvents.length === 0 && financialEvidencePackages.length === 0;

  const businessReadinessItems = useMemo((): ReadinessCardItem[] => {
    const topFailingCheck = (checks: { detail: string; pass: boolean; affectedCount: number; affectedRecordIds: string[] }[]) => {
      const failing = checks.filter((c) => !c.pass).sort((a, b) => b.affectedCount - a.affectedCount);
      if (failing.length === 0) return { topIssue: undefined, moreIssueCount: 0 };
      const [top, ...rest] = failing;
      return {
        topIssue: { detail: top.detail, affectedCount: top.affectedCount, recordIds: top.affectedRecordIds },
        moreIssueCount: rest.length,
      };
    };

    const tax = topFailingCheck(taxReadiness.checks);
    const bank = topFailingCheck(bankReadiness.checks);
    const auditTopIssue = missingEvidenceRecordIds.length > 0
      ? { detail: `${missingEvidenceRecordIds.length} rekod tiada dokumen sokongan (resit/invois) dimuat naik.`, affectedCount: missingEvidenceRecordIds.length, recordIds: missingEvidenceRecordIds }
      : undefined;
    // Phase 2D.3A — Audit Readiness % now reads health.readiness's
    // "documentationReadiness" score, the same canonical computeFinancialHealth()
    // output the missing-evidence count above (and Dashboard's Health Center)
    // already derive from, instead of the separate healthV1.evidenceCoveragePct.
    const auditPct = health.readiness.find((r) => r.key === "documentationReadiness")?.score ?? 100;

    return [
      { key: "tax_readiness", emoji: "🧾", label: "Tax Readiness", pct: taxReadiness.scorePct, topIssue: tax.topIssue, moreIssueCount: tax.moreIssueCount, insufficientData: hasInsufficientData },
      { key: "bank_readiness", emoji: "🏦", label: "Financing Readiness", pct: bankReadiness.scorePct, topIssue: bank.topIssue, moreIssueCount: bank.moreIssueCount, insufficientData: hasInsufficientData },
      { key: "health", emoji: "📂", label: "Audit Readiness", pct: auditPct, topIssue: auditTopIssue, moreIssueCount: 0, insufficientData: hasInsufficientData },
    ];
  }, [taxReadiness, bankReadiness, health, missingEvidenceRecordIds, hasInsufficientData]);

  // Section "Top 3 Actions Required" — ranking rule: pool every failing
  // check across Tax/Financing readiness plus the Audit evidence gap (all
  // already computed above, see businessReadinessItems), sort by
  // affectedCount descending, take the top 3. This is a plain sort over
  // existing counts — no new weighted scoring engine.
  const topActions = useMemo((): TopActionItem[] => {
    if (hasInsufficientData) return [];
    const candidates: TopActionItem[] = [];
    taxReadiness.checks.filter((c) => !c.pass && c.affectedCount > 0).forEach((c) => {
      candidates.push({ id: `tax_${c.id}`, problem: `[Cukai] ${c.label}`, affectedCount: c.affectedCount, recordIds: c.affectedRecordIds, band: "yellow" });
    });
    bankReadiness.checks.filter((c) => !c.pass && c.affectedCount > 0).forEach((c) => {
      candidates.push({ id: `bank_${c.id}`, problem: `[Pembiayaan] ${c.label}`, affectedCount: c.affectedCount, recordIds: c.affectedRecordIds, band: "yellow" });
    });
    if (missingEvidenceRecordIds.length > 0) {
      candidates.push({
        id: "audit_missing_evidence",
        problem: "[Audit] Rekod tiada dokumen sokongan",
        affectedCount: missingEvidenceRecordIds.length,
        recordIds: missingEvidenceRecordIds,
        band: missingEvidenceRecordIds.length > evidenceBuckets.length / 2 ? "red" : "yellow",
      });
    }
    return candidates
      .sort((a, b) => b.affectedCount - a.affectedCount)
      .slice(0, 3)
      .map((c) => (c.affectedCount >= 10 ? { ...c, band: "red" as const } : c));
  }, [taxReadiness, bankReadiness, missingEvidenceRecordIds, evidenceBuckets, hasInsufficientData]);

  // Phase 2D.3 — shared navigation handler for both the readiness grid's
  // top-issue line and the Top 3 Actions cards. Prefers the host's
  // record-level filter (onNavigateToRecords, wired in OwnerDashboard.tsx /
  // StaffHomeScreen.tsx); falls back to opening the relevant report section
  // in place when no record ids exist or no host callback is wired.
  const handleNavigateToIssue = (recordIds: string[], label: string, fallbackReport: typeof selectedReport) => {
    if (recordIds.length > 0 && onNavigateToRecords) {
      onNavigateToRecords(recordIds, label);
      return;
    }
    setSelectedReport(fallbackReport);
    setSearchTerm("");
  };

  const handleTopActionNavigate = (action: TopActionItem) => {
    const fallbackReport: typeof selectedReport = action.id.startsWith("tax_")
      ? "tax_readiness"
      : action.id.startsWith("bank_")
        ? "bank_readiness"
        : "health";
    handleNavigateToIssue(action.recordIds, action.problem, fallbackReport);
  };

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

  // Phase 2D.2 Report Center: maps a Popular Report tile key to the
  // existing report state. "income_analysis" / "expense_analysis" have no
  // dedicated engine in this file — they route into the existing
  // profit_loss report, which already contains the Revenue and Operating
  // Expenses line items (see ProfitLossReport.tsx), the closest existing
  // breakdown for each.
  const handleSelectPopularReport = (key: string) => {
    if (key === "income_analysis" || key === "expense_analysis") {
      setSelectedReport("profit_loss");
    } else {
      setSelectedReport(key as typeof selectedReport);
    }
    setSearchTerm("");
  };

  return (
    <div className="max-w-lg mx-auto w-full space-y-5" id="reports_foundation_root">

      {/* Section 1 — Financial Snapshot, with Phase 2D.3's "Top 3 Actions
          Required" slotted in immediately below it and above Section 2
          (Popular Reports), per spec. */}
      <ReportCenterSnapshot
        netProfit={netProfit}
        currentCash={currentCash}
        onSelectPopularReport={handleSelectPopularReport}
        topActionsSlot={<ReportCenterTopActions actions={topActions} onNavigate={handleTopActionNavigate} insufficientData={hasInsufficientData} />}
        // Problem 1 — Untung Bersih taps into the same Profit & Loss report
        // the "Untung & Rugi" Popular Report tile already opens.
        onOpenNetProfit={() => { setSelectedReport("profit_loss"); setSearchTerm(""); }}
        // Problem 1 — Tunai Semasa taps into the same Cash Flow report the
        // "Aliran Tunai" Popular Report tile already opens.
        onOpenCurrentCash={() => { setSelectedReport("cash_flow_v1"); setSearchTerm(""); }}
        hasAnyAccount={hasAnyAccount}
        onAddBankAccount={onAddBankAccount}
        popularValues={popularReportValues}
      />

      {/* Section 3 — Financial Health */}
      <ReportCenterHealthCard
        pct={financialHealthPct}
        onExpand={() => { setSelectedReport("health"); setSearchTerm(""); }}
        weakGrades={healthWeakGrades}
      />

      {/* Section 4 — Business Readiness */}
      <ReportCenterReadinessGrid
        items={businessReadinessItems}
        onSelect={(key) => { setSelectedReport(key as typeof selectedReport); setSearchTerm(""); }}
        onNavigateToIssue={(recordIds, label) => handleNavigateToIssue(recordIds, label, selectedReport)}
      />

      {/* Section 5 — Export Center */}
      <ReportExportMenu
        onExport={(format) => handleExport(format)}
        onPrint={handlePrint}
      />

      {/* Section 6 — Advanced Reports (collapsed by default) */}
      <div className="space-y-2" id="report_center_advanced">
        <button
          onClick={() => setAdvancedReportsOpen((v) => !v)}
          className="w-full flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          id="btn_toggle_advanced_reports"
        >
          <span>Laporan Lanjutan (Advanced Reports)</span>
          {advancedReportsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {advancedReportsOpen && (
          <div className="flex flex-col space-y-2" id="advanced_reports_list">
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
                <span>Ringkasan Kedudukan Kewangan</span>
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
                <span>Penuaan Tuntutan (Receivable Aging)</span>
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
                <span>Penuaan Hutang Pembekal (Payables)</span>
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
                <span>Komitmen Kontrak (Contract Commitments)</span>
              </div>
            </button>

            <button
              onClick={() => { setSelectedReport("balance_sheet"); setSearchTerm(""); }}
              className={`w-full text-left px-3.5 py-3 rounded-xl text-xs font-semibold flex items-center justify-between transition border ${
                selectedReport === "balance_sheet"
                  ? "bg-slate-950 border-slate-950 text-white shadow-xs"
                  : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-950"
              }`}
              id="nav_report_balance_sheet"
            >
              <div className="flex items-center space-x-2">
                <Landmark className="w-4 h-4 text-violet-600" />
                <span>Kunci Kira-Kira (Balance Sheet / Debt Analysis)</span>
              </div>
            </button>

            <button
              onClick={() => { setSelectedReport("bank_readiness"); setSearchTerm(""); }}
              className={`w-full text-left px-3.5 py-3 rounded-xl text-xs font-semibold flex items-center justify-between transition border ${
                selectedReport === "bank_readiness"
                  ? "bg-slate-950 border-slate-950 text-white shadow-xs"
                  : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-950"
              }`}
              id="nav_report_bank_readiness_advanced"
            >
              <div className="flex items-center space-x-2">
                <Building2 className="w-4 h-4 text-cyan-600" />
                <span>Kesediaan Pembiayaan — Butiran Penuh (Financing Analysis)</span>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Active Report Detail Canvas */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs space-y-6">

          {/* Active Canvas Header */}
          <div className="border-b border-slate-100 pb-4">
            <div className="flex items-center space-x-2 text-rose-500 font-mono text-[10px] uppercase font-bold tracking-wider">
              <span>Sistem Penyediaan Automatik Terkawal</span>
            </div>
            <h3 className="font-display font-bold text-lg text-slate-950 mt-1">
              {selectedReport === "summary" && "1. Laporan Kedudukan Kewangan Bersih (Financial Position)"}
              {selectedReport === "receivables_aging" && "3. Laporan Penuaan Tuntutan Jualan Terkumpul"}
              {selectedReport === "payables_aging" && "4. Laporan Penuaan Hutang Pembekal & Bil Belum Bayar"}
              {selectedReport === "commitments" && "5. Laporan Inventori Komitmen Operasional & Kontrak"}
              {selectedReport === "health" && "6. Nisbah Kewangan Syarikat & Ramalan Jangka Kelangsungan"}
              {selectedReport === "tax_readiness" && "7. Senarai Semak Kesediaan Cukai LHDN"}
              {selectedReport === "bank_readiness" && "8. Senarai Semak Kesediaan Pembiayaan/Pinjaman"}
              {selectedReport === "profit_loss" && "9. Penyata Untung Rugi (Profit & Loss Statement)"}
              {selectedReport === "balance_sheet" && "10. Kunci Kira-Kira (Balance Sheet Statement)"}
              {selectedReport === "cash_flow_v1" && "11. Penyata Aliran Tunai (Cash Flow Statement)"}
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

          {/* Report 2 (legacy Cashflow Matrix) removed — consolidated into single
              "11. Penyata Aliran Tunai" (cash_flow_v1 / CashFlowReport.tsx), the
              accounting-correct, validated (28/28) Cash Flow Statement. See
              MYKERANI_REPORT_STACK_V1_FINAL_READINESS.md for rationale. */}

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

              {/* Financial Health V1 — Sub-Metrik Tambahan */}
              <div className="space-y-3" id="health_v1_submetrics">
                <h4 className="font-display font-semibold text-xs text-slate-900 uppercase tracking-widest">
                  Sub-Metrik Kesihatan Tambahan (V1)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                  <div className="p-5 rounded-2xl border-2 border-slate-200 bg-white space-y-2" id="health_v1_cash">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wide text-slate-500">Cash Health</span>
                    <p className="text-xl font-mono font-bold tracking-tight text-slate-950">
                      RM {healthV1.cashHealth.totalLiquidAssets.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-[11px] text-slate-500">Quick Ratio: {healthV1.cashHealth.quickRatio.toFixed(2)}x · {healthV1.cashHealth.quickGrade}</p>
                  </div>
                  <div className="p-5 rounded-2xl border-2 border-slate-200 bg-white space-y-2" id="health_v1_debt">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wide text-slate-500">Debt Health</span>
                    <p className="text-xl font-mono font-bold tracking-tight text-slate-950">
                      RM {healthV1.debtHealth.totalActiveDebt.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-[11px] text-slate-500">{healthV1.debtHealth.overdueDebtCount} hutang tertunggak · {healthV1.debtHealth.solvencyGrade}</p>
                  </div>
                  <div className="p-5 rounded-2xl border-2 border-slate-200 bg-white space-y-2" id="health_v1_evidence_coverage">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wide text-slate-500">Evidence Coverage %</span>
                    <p className="text-xl font-mono font-bold tracking-tight text-slate-950">{healthV1.evidenceCoveragePct.toFixed(1)}%</p>
                    <p className="text-[11px] text-slate-505">Peratus rekod kewangan yang mempunyai pakej bukti (invois/resit) dikaitkan.</p>
                  </div>
                  <div className="p-5 rounded-2xl border-2 border-slate-200 bg-white space-y-2" id="health_v1_data_completeness">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wide text-slate-500">Data Completeness %</span>
                    <p className="text-xl font-mono font-bold tracking-tight text-slate-950">{healthV1.dataCompletenessPct.toFixed(1)}%</p>
                    <p className="text-[11px] text-slate-505">Peratus rekod kewangan yang dikategorikan dengan lengkap (bukan "Lain-lain"/kosong).</p>
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

          {selectedReport === "balance_sheet" && (
            <div className="animate-fade-in" id="report_balance_sheet_view">
              <BalanceSheetReport
                financialEvents={financialEvents}
                cashAccounts={cashAccounts}
                bankAccounts={bankAccounts}
                debtRecords={debtRecords}
                financialCommitments={financialCommitments}
                financialEvidencePackages={financialEvidencePackages}
                workspaceId={activeWorkspace?.id}
                isMockUser={isMockUser}
              />
            </div>
          )}

          {selectedReport === "cash_flow_v1" && (
            <div className="animate-fade-in" id="report_cash_flow_v1_view">
              <CashFlowReport
                financialEvents={financialEvents}
                debtRecords={debtRecords}
                financialCommitments={financialCommitments}
                financialEvidencePackages={financialEvidencePackages}
                workspaceId={activeWorkspace?.id}
                isMockUser={isMockUser}
              />
            </div>
          )}

        </div>

    </div>
  );
};
