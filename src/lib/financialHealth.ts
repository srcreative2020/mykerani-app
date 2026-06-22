import { type CashAccount, type BankAccount, type FinancialEvent, type DebtRecord, type FinancialCommitment } from "../types";

export interface FinancialHealthScoring {
  solvencyRatio: number;
  solvencyGrade: "Excellent" | "Moderate" | "Critical Risk";
  quickRatio: number;
  quickGrade: "Secure" | "Adequate" | "Strained";
  runwayMonths: number;
  runwayGrade: "Healthy (6+ Months)" | "Moderate Buffer (2-5 Months)" | "Immediate Action Required (< 2 Months)";
}

function monthlyCommitmentBurn(financialCommitments: FinancialCommitment[], baseDate: Date): number {
  const active = financialCommitments.filter(c => c.isActive && c.status === "ACTIVE");
  let monthlyBurn = 0;
  for (const c of active) {
    switch (c.recurrence) {
      case "DAILY":
        monthlyBurn += c.amountPerIntervalMyr * 30;
        break;
      case "WEEKLY":
        monthlyBurn += c.amountPerIntervalMyr * 4.33;
        break;
      case "MONTHLY":
        monthlyBurn += c.amountPerIntervalMyr;
        break;
      case "QUARTERLY":
        monthlyBurn += c.amountPerIntervalMyr / 3;
        break;
      case "YEARLY":
        monthlyBurn += c.amountPerIntervalMyr / 12;
        break;
      case "ONE-TIME": {
        const start = new Date(c.startDate);
        if (start.getMonth() === baseDate.getMonth() && start.getFullYear() === baseDate.getFullYear()) {
          monthlyBurn += c.amountPerIntervalMyr;
        }
        break;
      }
    }
  }
  return monthlyBurn;
}

/**
 * Single source of truth for the solvency/quick-ratio/runway health model.
 * Used by both the Financial Health report (FinancialReportsAnalytics) and
 * the proactive advisory alert engine (NotificationContext) so grades never drift.
 */
export function computeFinancialHealthScoring(
  cashAccounts: CashAccount[],
  bankAccounts: BankAccount[],
  financialEvents: FinancialEvent[],
  debtRecords: DebtRecord[],
  financialCommitments: FinancialCommitment[],
  baseDate: Date = new Date()
): FinancialHealthScoring {
  const totalLiquidAssets =
    cashAccounts.reduce((sum, c) => sum + c.currentBalanceMyr, 0) +
    bankAccounts.reduce((sum, b) => sum + b.currentBalanceMyr, 0);

  const totalReceivables = financialEvents
    .filter(e => e.type === "RECEIVABLE" && !e.isCompleted)
    .reduce((sum, e) => sum + e.amountMyr, 0);

  const totalPayables = financialEvents
    .filter(e => e.type === "PAYABLE" && !e.isCompleted)
    .reduce((sum, e) => sum + e.amountMyr, 0);

  const totalDebts = debtRecords
    .filter(d => d.status === "ACTIVE")
    .reduce((sum, d) => sum + (d.totalAmountMyr - d.repaidAmountMyr), 0);

  const aggregateAssets = totalLiquidAssets + totalReceivables;
  const aggregateLiabilities = totalPayables + totalDebts;

  const solvencyRatio = aggregateLiabilities === 0 ? 10 : aggregateAssets / aggregateLiabilities;
  const quickRatio = totalPayables === 0 ? 10 : totalLiquidAssets / totalPayables;

  const monthlyBurn = monthlyCommitmentBurn(financialCommitments, baseDate);
  const runwayMonths = monthlyBurn === 0 ? 999 : totalLiquidAssets / monthlyBurn;

  let solvencyGrade: FinancialHealthScoring["solvencyGrade"] = "Excellent";
  if (solvencyRatio < 1.0) solvencyGrade = "Critical Risk";
  else if (solvencyRatio < 1.8) solvencyGrade = "Moderate";

  let quickGrade: FinancialHealthScoring["quickGrade"] = "Secure";
  if (quickRatio < 1.0) quickGrade = "Strained";
  else if (quickRatio < 1.6) quickGrade = "Adequate";

  let runwayGrade: FinancialHealthScoring["runwayGrade"] = "Healthy (6+ Months)";
  if (runwayMonths < 2.0) runwayGrade = "Immediate Action Required (< 2 Months)";
  else if (runwayMonths < 5.0) runwayGrade = "Moderate Buffer (2-5 Months)";

  return { solvencyRatio, solvencyGrade, quickRatio, quickGrade, runwayMonths, runwayGrade };
}

export interface FinancialHealthV1 {
  cashHealth: { totalLiquidAssets: number; quickRatio: number; quickGrade: FinancialHealthScoring["quickGrade"] };
  debtHealth: { totalActiveDebt: number; overdueDebtCount: number; solvencyRatio: number; solvencyGrade: FinancialHealthScoring["solvencyGrade"] };
  commitmentHealth: { monthlyCommitmentBurn: number; runwayMonths: number; runwayGrade: FinancialHealthScoring["runwayGrade"] };
  evidenceCoveragePct: number;
  dataCompletenessPct: number;
}

/**
 * Financial Health V1 (Report Completion Sprint V1) — wraps the existing,
 * already-shipped computeFinancialHealthScoring() (unchanged, still used by
 * the live Health tab and the advisory alert engine) and adds the two
 * sub-metrics the sprint asked for that did not exist yet: Evidence Coverage
 * and Data Completeness. Additive only — no existing field/behavior changed.
 */
export function computeFinancialHealthV1(
  cashAccounts: CashAccount[],
  bankAccounts: BankAccount[],
  financialEvents: FinancialEvent[],
  debtRecords: DebtRecord[],
  financialCommitments: FinancialCommitment[],
  evidenceCoverageRatio: number,
  baseDate: Date = new Date()
): FinancialHealthV1 {
  const base = computeFinancialHealthScoring(cashAccounts, bankAccounts, financialEvents, debtRecords, financialCommitments, baseDate);
  const totalLiquidAssets = cashAccounts.reduce((sum, c) => sum + c.currentBalanceMyr, 0) + bankAccounts.reduce((sum, b) => sum + b.currentBalanceMyr, 0);
  const totalActiveDebt = debtRecords.filter((d) => d.status === "ACTIVE").reduce((sum, d) => sum + (d.totalAmountMyr - d.repaidAmountMyr), 0);
  const overdueDebtCount = debtRecords.filter(
    (d) => d.status === "ACTIVE" && d.repaymentDueDate && new Date(d.repaymentDueDate).getTime() < baseDate.getTime() && d.repaidAmountMyr < d.totalAmountMyr
  ).length;
  const monthlyCommitmentBurnAmt = monthlyCommitmentBurn(financialCommitments, baseDate);

  const uncategorized = financialEvents.filter((e) => !e.categoryName || e.categoryName.trim() === "" || e.categoryName === "Lain-lain").length;
  const dataCompletenessPct = financialEvents.length === 0 ? 0 : ((financialEvents.length - uncategorized) / financialEvents.length) * 100;

  return {
    cashHealth: { totalLiquidAssets, quickRatio: base.quickRatio, quickGrade: base.quickGrade },
    debtHealth: { totalActiveDebt, overdueDebtCount, solvencyRatio: base.solvencyRatio, solvencyGrade: base.solvencyGrade },
    commitmentHealth: { monthlyCommitmentBurn: monthlyCommitmentBurnAmt, runwayMonths: base.runwayMonths, runwayGrade: base.runwayGrade },
    evidenceCoveragePct: evidenceCoverageRatio * 100,
    dataCompletenessPct,
  };
}
