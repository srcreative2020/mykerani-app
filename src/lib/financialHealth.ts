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
