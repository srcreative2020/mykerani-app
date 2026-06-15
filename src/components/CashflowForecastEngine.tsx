import React, { useState, useMemo } from "react";
import { useFinancials } from "../context/FinancialRecordsContext";
import { type FinancialEvent, type DebtRecord, type FinancialCommitment } from "../types";
import { motion } from "motion/react";
import {
  CalendarDays,
  TrendingUp,
  TrendingDown,
  Scale,
  ShieldCheck,
  AlertTriangle,
  XOctagon,
  ArrowUpRight,
  ArrowDownLeft,
  DollarSign,
  Layers,
  ChevronRight,
  Info
} from "lucide-react";

export const CashflowForecastEngine: React.FC = () => {
  const {
    financialEvents,
    cashAccounts,
    bankAccounts,
    debtRecords,
    financialCommitments,
    loading
  } = useFinancials();

  // Active Forecast Duration: 7, 30, or 90 days
  const [forecastDays, setForecastDays] = useState<7 | 30 | 90>(30);

  // Today base date setup
  const baseDate = useMemo(() => {
    // Standardize to midnight for clean date calculations
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }, []);

  // Utility to check commitment occurrence on a specific date
  const isCommitmentOnDate = (commitment: FinancialCommitment, dateVal: Date): boolean => {
    const compStart = new Date(commitment.startDate);
    compStart.setHours(0, 0, 0, 0);

    const checkDate = new Date(dateVal);
    checkDate.setHours(0, 0, 0, 0);

    if (checkDate < compStart) return false;

    if (commitment.endDate) {
      const compEnd = new Date(commitment.endDate);
      compEnd.setHours(0, 0, 0, 0);
      if (checkDate > compEnd) return false;
    }

    if (commitment.status === "PAUSED" || commitment.status === "COMPLETED") return false;

    if (commitment.recurrence === "ONE-TIME") {
      return checkDate.getTime() === compStart.getTime();
    }
    if (commitment.recurrence === "DAILY") {
      return true;
    }
    if (commitment.recurrence === "WEEKLY") {
      return checkDate.getDay() === compStart.getDay();
    }
    if (commitment.recurrence === "MONTHLY") {
      return checkDate.getDate() === compStart.getDate();
    }
    if (commitment.recurrence === "QUARTERLY") {
      const diffMonths = (checkDate.getFullYear() - compStart.getFullYear()) * 12 + (checkDate.getMonth() - compStart.getMonth());
      return diffMonths % 3 === 0 && checkDate.getDate() === compStart.getDate();
    }
    if (commitment.recurrence === "YEARLY") {
      return checkDate.getDate() === compStart.getDate() && checkDate.getMonth() === compStart.getMonth();
    }

    return false;
  };

  // Helper formatting for simple YYYY-MM-DD matching
  const toDateString = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const r = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${r}`;
  };

  // 1. Core Forecast calculations
  const forecastData = useMemo(() => {
    // Current opening balance setup
    const totalCash = cashAccounts.reduce((acc, c) => acc + (c.currentBalanceMyr || 0), 0);
    const totalBank = bankAccounts.reduce((acc, b) => acc + (b.currentBalanceMyr || 0), 0);
    const openingBalance = totalCash + totalBank;

    // Timeline days list setup
    const timeline: { date: Date; dateStr: string; label: string; inflows: number; outflows: number }[] = [];
    for (let i = 1; i <= forecastDays; i++) {
      const dayDate = new Date(baseDate);
      dayDate.setDate(baseDate.getDate() + i);
      dayDate.setHours(0, 0, 0, 0);
      
      const label = dayDate.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
      timeline.push({
        date: dayDate,
        dateStr: toDateString(dayDate),
        label,
        inflows: 0,
        outflows: 0
      });
    }

    // Detailed list arrays to display line items
    const expectedInflowItems: { id: string; date: string; source: string; category: string; amount: number; party: string }[] = [];
    const expectedOutflowItems: { id: string; date: string; source: string; category: string; amount: number; party: string }[] = [];

    // Filter windows
    const startDateLimit = new Date(baseDate);
    startDateLimit.setDate(baseDate.getDate() + 1);
    startDateLimit.setHours(0, 0, 0, 0);

    const endDateLimit = new Date(baseDate);
    endDateLimit.setDate(baseDate.getDate() + forecastDays);
    endDateLimit.setHours(23, 59, 59, 999);

    // Compute Event driven expected items:
    // Receivables (Inflows) and Payables (Outflows) + uncompleted core Income/Expenses
    financialEvents.forEach((ev) => {
      if (ev.isCompleted) return; // Do not forecast already settled cash movements

      const targetDateStr = ev.dueDate || ev.date;
      const targetDate = new Date(targetDateStr);
      targetDate.setHours(0, 0, 0, 0);

      if (targetDate >= startDateLimit && targetDate <= endDateLimit) {
        const daysDiff = Math.floor((targetDate.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24)) - 1;
        
        if (daysDiff >= 0 && daysDiff < timeline.length) {
          if (ev.type === "RECEIVABLE" || ev.type === "INCOME") {
            timeline[daysDiff].inflows += ev.amountMyr;
            expectedInflowItems.push({
              id: ev.id,
              date: targetDateStr,
              source: ev.type,
              category: ev.categoryName,
              amount: ev.amountMyr,
              party: ev.partyName
            });
          } else if (ev.type === "PAYABLE" || ev.type === "EXPENSE") {
            timeline[daysDiff].outflows += ev.amountMyr;
            expectedOutflowItems.push({
              id: ev.id,
              date: targetDateStr,
              source: ev.type,
              category: ev.categoryName,
              amount: ev.amountMyr,
              party: ev.partyName
            });
          }
        }
      }
    });

    // Compute Debt repayments (Outflows)
    debtRecords.forEach((debt) => {
      if (debt.status === "FULLY_REPAID" || !debt.repaymentDueDate) return;

      const targetDateStr = debt.repaymentDueDate;
      const targetDate = new Date(targetDateStr);
      targetDate.setHours(0, 0, 0, 0);

      if (targetDate >= startDateLimit && targetDate <= endDateLimit) {
        const remainingAmount = debt.totalAmountMyr - debt.repaidAmountMyr;
        if (remainingAmount <= 0) return;

        const daysDiff = Math.floor((targetDate.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24)) - 1;
        if (daysDiff >= 0 && daysDiff < timeline.length) {
          timeline[daysDiff].outflows += remainingAmount;
          expectedOutflowItems.push({
            id: debt.id,
            date: targetDateStr,
            source: "DEBT_REPAYMENT",
            category: "Financing Restructuring",
            amount: remainingAmount,
            party: debt.creditorName
          });
        }
      }
    });

    // Compute Financial Commitments (Outflows) recurrent checking
    timeline.forEach((day, index) => {
      financialCommitments.forEach((cmt) => {
        if (isCommitmentOnDate(cmt, day.date)) {
          day.outflows += cmt.amountPerIntervalMyr;
          expectedOutflowItems.push({
            id: `${cmt.id}-${day.dateStr}`,
            date: day.dateStr,
            source: "COMMITMENT",
            category: cmt.recurrence + " Agreement",
            amount: cmt.amountPerIntervalMyr,
            party: cmt.obligeeName
          });
        }
      });
    });

    // Sort itemized lists chronologically
    expectedInflowItems.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    expectedOutflowItems.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Aggregate values
    const expectedInflows = expectedInflowItems.reduce((acc, item) => acc + item.amount, 0);
    const expectedOutflows = expectedOutflowItems.reduce((acc, item) => acc + item.amount, 0);
    const netPosition = expectedInflows - expectedOutflows;
    const closingBalance = openingBalance + netPosition;

    // Day by Day cumulative calculations for the SVG chart
    let runningBalance = openingBalance;
    const chartPoints = timeline.map((pt) => {
      runningBalance = runningBalance + (pt.inflows - pt.outflows);
      return {
        label: pt.label,
        dateStr: pt.dateStr,
        balance: Math.round(runningBalance * 100) / 100,
        inflow: Math.round(pt.inflows * 100) / 100,
        outflow: Math.round(pt.outflows * 100) / 100
      };
    });

    // 2. Risk Indicator assessment
    let riskStatus: "Healthy" | "Watch" | "Critical" = "Healthy";
    const riskReasons: string[] = [];

    // Lowest forecasted point checks
    let lowestPoint = openingBalance;
    let lowestPointDay = "";
    let runningBalTrack = openingBalance;

    timeline.forEach((day) => {
      runningBalTrack = runningBalTrack + (day.inflows - day.outflows);
      if (runningBalTrack < lowestPoint) {
        lowestPoint = runningBalTrack;
        lowestPointDay = day.date.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
      }
    });

    if (lowestPoint <= 0) {
      riskStatus = "Critical";
      riskReasons.push(`Forecast indicates cash balance depletion! Liquid funds projected to drop to RM ${Math.round(lowestPoint).toLocaleString()} on ${lowestPointDay}.`);
    } else if (lowestPoint < expectedOutflows * 0.15 || lowestPoint < openingBalance * 0.3) {
      riskStatus = "Watch";
      riskReasons.push(`Low cash cushion detected. Cash balance drops below 15% of expected periodic operating outflows (lowest RM ${Math.round(lowestPoint).toLocaleString()}).`);
    }

    if (netPosition < 0 && Math.abs(netPosition) > openingBalance * 0.5) {
      if (riskStatus !== "Critical") riskStatus = "Watch";
      riskReasons.push(`High periodic deficit: outbound operating commitments (RM ${Math.round(expectedOutflows).toLocaleString()}) exceed periodic inflows, using up over 50% of starting reserves.`);
    }

    if (riskReasons.length === 0) {
      riskReasons.push("All contractual commitments, payables, and debts are safely covered by starting cash drawer and expected receivables.");
    }

    return {
      openingBalance: Math.round(openingBalance * 100) / 100,
      expectedInflows: Math.round(expectedInflows * 100) / 100,
      expectedOutflows: Math.round(expectedOutflows * 100) / 100,
      netPosition: Math.round(netPosition * 100) / 100,
      closingBalance: Math.round(closingBalance * 100) / 100,
      expectedInflowItems,
      expectedOutflowItems,
      chartPoints,
      riskStatus,
      riskReasons,
      lowestForecastedPoint: Math.round(lowestPoint * 100) / 100
    };
  }, [financialEvents, cashAccounts, bankAccounts, debtRecords, financialCommitments, forecastDays, baseDate]);

  // UI status specific classes
  const getRiskStyles = (status: "Healthy" | "Watch" | "Critical") => {
    switch (status) {
      case "Healthy":
        return {
          bg: "bg-emerald-50/75 border-emerald-200 text-emerald-800",
          iconBg: "bg-emerald-100 text-emerald-700",
          icon: <ShieldCheck className="w-5 h-5" />,
          badge: "bg-emerald-600 text-white"
        };
      case "Watch":
        return {
          bg: "bg-amber-50/75 border-amber-200 text-amber-800",
          iconBg: "bg-amber-100 text-amber-700",
          icon: <AlertTriangle className="w-5 h-5" />,
          badge: "bg-amber-500 text-white"
        };
      case "Critical":
        return {
          bg: "bg-rose-50/75 border-rose-200 text-rose-800",
          iconBg: "bg-rose-100 text-rose-700",
          icon: <XOctagon className="w-5 h-5" />,
          badge: "bg-rose-600 text-white"
        };
    }
  };

  const riskStyle = getRiskStyles(forecastData.riskStatus);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500 font-mono text-xs" id="forecast_loader">
        <span className="animate-spin mr-2">⏳</span> Loading workspace cashflow telemetry data...
      </div>
    );
  }

  // Quick manual calculations for SVG Path rendering
  const balancesPoints = forecastData.chartPoints.map(p => p.balance);
  const maxBalance = Math.max(...balancesPoints, forecastData.openingBalance) || 1000;
  const minBalance = Math.min(...balancesPoints, forecastData.openingBalance, 0);
  const balanceRange = maxBalance - minBalance;

  // Render SVG points
  const width = 600;
  const height = 180;
  const paddingX = 40;
  const paddingY = 20;

  const getSvgCoordinates = (): string => {
    const pointsCount = forecastData.chartPoints.length;
    if (pointsCount === 0) return "";

    const startingX = paddingX;
    const startingY = height - paddingY - ((forecastData.openingBalance - minBalance) / balanceRange) * (height - 2 * paddingY);
    let path = `M ${startingX} ${startingY}`;

    forecastData.chartPoints.forEach((pt, i) => {
      const x = paddingX + ((i + 1) / (pointsCount + 1)) * (width - 2 * paddingX);
      const y = height - paddingY - ((pt.balance - minBalance) / balanceRange) * (height - 2 * paddingY);
      path += ` L ${x} ${y}`;
    });

    return path;
  };

  const getSvgAreaPath = (): string => {
    const pointsCount = forecastData.chartPoints.length;
    if (pointsCount === 0) return "";

    const svgLine = getSvgCoordinates();
    const startingX = paddingX;
    const finalX = paddingX + (pointsCount / (pointsCount + 1)) * (width - 2 * paddingX);
    const zeroY = height - paddingY - ((Math.max(0, minBalance) - minBalance) / balanceRange) * (height - 2 * paddingY);

    return `${svgLine} L ${finalX} ${zeroY} L ${startingX} ${zeroY} Z`;
  };

  return (
    <div className="space-y-6" id="cashflow_forecast_wrapper">
      
      {/* HEADER CONTROLS SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4" id="forecast_config_controls">
        <div className="flex items-center space-x-2">
          <CalendarDays className="w-4 h-4 text-indigo-500" />
          <span className="font-mono text-xs text-slate-500 uppercase tracking-widest font-bold">Forecast Parameters:</span>
        </div>
        <div className="flex bg-slate-100 rounded-xl p-1 shadow-sm border border-slate-200/50 self-start md:self-auto">
          <button
            onClick={() => setForecastDays(7)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-mono transition-all cursor-pointer ${
              forecastDays === 7 ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            7-Day Ultra-Short Plan
          </button>
          <button
            onClick={() => setForecastDays(30)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-mono transition-all cursor-pointer ${
              forecastDays === 30 ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            30-Day Operating Run-rate
          </button>
          <button
            onClick={() => setForecastDays(90)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-mono transition-all cursor-pointer ${
              forecastDays === 90 ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            90-Day Structural Runway
          </button>
        </div>
      </div>

      {/* CORE SPREAD COMPARISON CELLS */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4" id="forecast_metrics_cells">
        
        {/* 1. OPENING BALANCE */}
        <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex flex-col justify-between" id="metric_opening_bal">
          <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Opening Liquid Reserves</p>
          <p className="text-lg font-bold text-slate-900 mt-1 font-mono">
            RM {forecastData.openingBalance.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-indigo-600 flex items-center mt-2 bg-indigo-50/60 px-1.5 py-0.5 rounded w-max">
            <Layers className="w-3 h-3 mr-1" /> Cash + Bank balances
          </span>
        </div>

        {/* 2. EXPECTED INFLOWS */}
        <div className="bg-emerald-50/40 border border-emerald-100 p-4 rounded-xl flex flex-col justify-between" id="metric_expected_inflow">
          <p className="text-[10px] text-emerald-700 font-mono uppercase tracking-wider">Prospective Receipts (+)</p>
          <p className="text-lg font-bold text-emerald-700 mt-1 font-mono">
            RM {forecastData.expectedInflows.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-emerald-800 flex items-center mt-2 bg-emerald-100/50 px-1.5 py-0.5 rounded w-max">
            <ArrowUpRight className="w-3 h-3 mr-1" /> Receivables & income
          </span>
        </div>

        {/* 3. EXPECTED OUTFLOWS */}
        <div className="bg-rose-50/40 border border-rose-100 p-4 rounded-xl flex flex-col justify-between" id="metric_expected_outflow">
          <p className="text-[10px] text-rose-700 font-mono uppercase tracking-wider">Prospective Commitments (-)</p>
          <p className="text-lg font-bold text-rose-700 mt-1 font-mono">
            RM {forecastData.expectedOutflows.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-rose-800 flex items-center mt-2 bg-rose-100/50 px-1.5 py-0.5 rounded w-max">
            <ArrowDownLeft className="w-3 h-3 mr-1" /> Payables + debts + agreements
          </span>
        </div>

        {/* 4. NET POSITION */}
        <div className={`border p-4 rounded-xl flex flex-col justify-between ${
          forecastData.netPosition >= 0 ? "bg-slate-50 border-slate-100" : "bg-amber-50/30 border-amber-100"
        }`} id="metric_net_position">
          <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Net Flow Surplus/Deficit</p>
          <p className={`text-lg font-bold mt-1 font-mono ${
            forecastData.netPosition >= 0 ? "text-slate-900" : "text-amber-700"
          }`}>
            {forecastData.netPosition >= 0 ? "+" : "—"} RM {Math.abs(forecastData.netPosition).toLocaleString("en-MY", { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-slate-600 flex items-center mt-2">
            Inflows minus Outflows
          </span>
        </div>

        {/* 5. CLOSING BALANCE */}
        <div className={`p-4 rounded-xl flex flex-col justify-between ${
          forecastData.closingBalance > 0 ? "bg-slate-950 border-slate-800 text-white" : "bg-rose-950 border-rose-900 text-white animate-pulse"
        }`} id="metric_closing_bal_proj">
          <p className="text-[10px] text-slate-300 font-mono uppercase tracking-wider">Projected Liquid End</p>
          <p className="text-lg font-bold mt-1 font-mono">
            RM {forecastData.closingBalance.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-slate-300 flex items-center mt-2 font-semibold">
            Estimated ending ledger
          </span>
        </div>

      </div>

      {/* FINANCIAL RISK INDICATOR BAR */}
      <div className={`border rounded-xl p-4 md:p-5 flex flex-col sm:flex-row shadow-xs gap-4 items-start ${riskStyle.bg}`} id="risk_indicator_panel">
        <div className={`p-2 rounded-lg ${riskStyle.iconBg}`}>
          {riskStyle.icon}
        </div>
        <div className="space-y-1.5 flex-1 select-none">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-sans font-extrabold text-sm uppercase tracking-wider">MYKERANI Health Risk:</span>
            <span className={`text-[10px] font-mono tracking-widest font-extrabold uppercase px-2.5 py-0.5 rounded-full ${riskStyle.badge}`}>
              {forecastData.riskStatus}
            </span>
          </div>
          <div className="space-y-1 text-xs">
            {forecastData.riskReasons.map((reason, rIdx) => (
              <p key={rIdx} className="leading-tight text-slate-850 flex items-start">
                <span className="mr-1.5 mt-1 block w-1 h-1 rounded-full bg-slate-900" />
                {reason}
              </p>
            ))}
          </div>
        </div>
        <div className="bg-white/60 border border-slate-200/50 backdrop-blur-xs px-3 py-2 rounded-lg text-[10px] text-slate-600 font-mono mt-2 sm:mt-0 max-w-[190px]">
          <span className="font-bold flex items-center mb-0.5 text-slate-800 uppercase tracking-tight text-[9px]">
            <Info className="w-3 h-3 mr-1" /> Safety Thresholds
          </span>
          Healthy &gt; Watch &gt; Critical. Red status targets liquidity depletion limits.
        </div>
      </div>

      {/* VISUAL CHART & DAILY CUMULATIVE BALANCE GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="forecast_chart_and_lists">
        
        {/* CHART COL (SPLIT 7) */}
        <div className="lg:col-span-7 bg-white border border-slate-100 rounded-xl p-4 md:p-5 flex flex-col justify-between" id="forecast_chart_panel">
          <div>
            <h4 className="font-display font-semibold text-xs text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-3 flex items-center">
              <TrendingUp className="w-3.5 h-3.5 text-indigo-500 mr-1.5" />
              Dynamic Liquid Balance Trend ({forecastDays} Days)
            </h4>
            <div className="mt-4 flex items-center justify-center bg-slate-50/50 border border-slate-100/50 rounded-xl p-3 h-[200px]" id="svg_vector_canvas_wrapper">
              <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full font-mono">
                {/* Horizontal gridlines */}
                <line x1={paddingX} y1={paddingY} x2={width - paddingX} y2={paddingY} stroke="#f1f5f9" strokeDasharray="4 4" />
                <line x1={paddingX} y1={height / 2} x2={width - paddingX} y2={height / 2} stroke="#edf2f7" strokeDasharray="4 4" />
                <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} stroke="#e2e8f0" strokeWidth="1.5" />

                {/* SVG Area Gradation */}
                <path d={getSvgAreaPath()} fill="url(#balance-gradient)" opacity="0.12" />

                {/* SVG Line path */}
                <path d={getSvgCoordinates()} fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

                {/* Plot circle markers on timeline blips */}
                {forecastData.chartPoints.map((pt, i) => {
                  if (forecastDays === 90 && i % 3 !== 0) return null; // Avoid crowding on long 90-day intervals
                  if (forecastDays === 30 && i % 2 !== 0) return null;

                  const x = paddingX + ((i + 1) / (forecastData.chartPoints.length + 1)) * (width - 2 * paddingX);
                  const y = height - paddingY - ((pt.balance - minBalance) / balanceRange) * (height - 2 * paddingY);

                  return (
                    <g key={i}>
                      <circle cx={x} cy={y} r="3.5" fill="#4f46e5" stroke="#ffffff" strokeWidth="1.5" />
                      <text x={x} y={y - 8} fontSize="7" textAnchor="middle" fill="#64748b" className="font-mono">
                        RM {Math.round(pt.balance).toLocaleString()}
                      </text>
                    </g>
                  );
                })}

                {/* Gradient shader definition */}
                <defs>
                  <linearGradient id="balance-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4f46e5" />
                    <stop offset="100%" stopColor="#ffffff" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </div>
          
          <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500 font-mono border-t border-slate-50 pt-3 select-none">
            <span>Date Range: Next Day to Day {forecastDays}</span>
            <span className="flex items-center">
              <span className="w-2.5 h-1 bg-indigo-600 rounded mr-1 inline-block" />
              Projected Ending Ledger
            </span>
          </div>
        </div>

        {/* CRITICAL UPCOMING SUMMARY SIDEBAR (SPLIT 5) */}
        <div className="lg:col-span-5 bg-white border border-slate-100 rounded-xl p-4 md:p-5 flex flex-col justify-between" id="forecast_action_items">
          <div>
            <h4 className="font-display font-semibold text-xs text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-3 flex items-center">
              <Scale className="w-3.5 h-3.5 text-indigo-500 mr-1.5" />
              Daily Runway Breakdowns
            </h4>
            <div className="mt-3 space-y-2 max-h-[195px] overflow-y-auto pr-1 text-xs" id="runway_steps_list">
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-between">
                <span className="font-mono text-[11px] text-slate-500">Day 1 Forecast</span>
                <span className="font-mono font-bold text-slate-800">
                  RM {(forecastData.chartPoints[0]?.balance || forecastData.openingBalance).toLocaleString("en-MY", { minimumFractionDigits: 1 })}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-between">
                <span className="font-mono text-[11px] text-slate-500">Day 7 Forecast</span>
                <span className="font-mono font-bold text-slate-800">
                  RM {(forecastData.chartPoints[6]?.balance || forecastData.chartPoints[forecastData.chartPoints.length - 1]?.balance || forecastData.openingBalance).toLocaleString("en-MY", { minimumFractionDigits: 1 })}
                </span>
              </div>
              {forecastDays >= 30 && (
                <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-between">
                  <span className="font-mono text-[11px] text-slate-500">Day 30 Forecast</span>
                  <span className="font-mono font-bold text-slate-800">
                    RM {(forecastData.chartPoints[29]?.balance || forecastData.chartPoints[forecastData.chartPoints.length - 1]?.balance || forecastData.openingBalance).toLocaleString("en-MY", { minimumFractionDigits: 1 })}
                  </span>
                </div>
              )}
              {forecastDays >= 90 && (
                <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-between">
                  <span className="font-mono text-[11px] text-slate-500">Day 90 Forecast</span>
                  <span className="font-mono font-bold text-slate-800">
                    RM {(forecastData.chartPoints[89]?.balance || forecastData.chartPoints[forecastData.chartPoints.length - 1]?.balance || forecastData.openingBalance).toLocaleString("en-MY", { minimumFractionDigits: 1 })}
                  </span>
                </div>
              )}
              <div className="p-2.5 border-2 border-dashed border-slate-150/80 rounded-xl flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="font-sans font-bold text-[10px] text-slate-500 uppercase tracking-wider block">Lowest cash level</span>
                  <span className="text-[9px] text-slate-400">Periodic cushion minimum floor</span>
                </div>
                <span className={`font-mono font-bold text-xs px-2.5 py-1 rounded-md ${
                  forecastData.lowestForecastedPoint > 0 ? "bg-indigo-50 text-indigo-700" : "bg-rose-50 text-rose-700 animate-pulse"
                }`}>
                  RM {forecastData.lowestForecastedPoint.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-3 flex items-center space-x-1.5 text-[10px] text-slate-450 leading-tight">
            <Info className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <p className="font-sans">Daily runway predictions help anticipate liquidity bottlenecks prior to high outflow draws.</p>
          </div>
        </div>

      </div>

      {/* DETAILED LEDGERS ACCORDIONS FOR INFLOWS & OUTFLOWS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6" id="expected_source_flows">
        
        {/* INFLOW EXPECTATIONS CELL */}
        <div className="bg-white border border-slate-100 rounded-xl p-4 md:p-5" id="inflow_expectations_card">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
            <div className="flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <h4 className="font-display font-semibold text-xs text-slate-900 uppercase tracking-widest">
                Expected Receipts ({forecastData.expectedInflowItems.length})
              </h4>
            </div>
            <span className="font-mono font-extrabold text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg">
              RM {forecastData.expectedInflows.toLocaleString()}
            </span>
          </div>

          <div className="space-y-2 max-h-[295px] overflow-y-auto pr-1" id="inflow_items_scroller">
            {forecastData.expectedInflowItems.length === 0 ? (
              <div className="p-10 text-center border-2 border-dashed border-slate-100 rounded-lg text-slate-400">
                <ArrowUpRight className="w-8 h-8 mx-auto stroke-[1.2] mb-1.5 text-slate-300" />
                <p className="text-xs font-sans">No expected receivables fall in this forecast window.</p>
              </div>
            ) : (
              forecastData.expectedInflowItems.map((item) => (
                <div key={item.id} className="p-3 bg-slate-50/50 border border-slate-100 rounded-lg text-xs flex items-center justify-between">
                  <div className="space-y-0.5 min-w-0 pr-2">
                    <p className="font-semibold text-slate-900 truncate">{item.party}</p>
                    <div className="flex items-center space-x-2 text-[10px] text-slate-550">
                      <span className="font-mono bg-emerald-50 text-emerald-800 px-1 py-0.2 rounded font-bold capitalize select-none">{item.source.toLowerCase()}</span>
                      <span className="text-slate-400 font-mono">{item.date}</span>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-emerald-600 flex-shrink-0">
                    +RM {item.amount.toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* OUTFLOW EXPECTATIONS CELL */}
        <div className="bg-white border border-slate-100 rounded-xl p-4 md:p-5" id="outflow_expectations_card">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
            <div className="flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <h4 className="font-display font-semibold text-xs text-slate-900 uppercase tracking-widest">
                Expected Commitments ({forecastData.expectedOutflowItems.length})
              </h4>
            </div>
            <span className="font-mono font-extrabold text-xs text-rose-600 bg-rose-50 px-2 py-0.5 rounded-lg">
              RM {forecastData.expectedOutflows.toLocaleString()}
            </span>
          </div>

          <div className="space-y-2 max-h-[295px] overflow-y-auto pr-1" id="outflow_items_scroller">
            {forecastData.expectedOutflowItems.length === 0 ? (
              <div className="p-10 text-center border-2 border-dashed border-slate-100 rounded-lg text-slate-400">
                <ArrowDownLeft className="w-8 h-8 mx-auto stroke-[1.2] mb-1.5 text-slate-300" />
                <p className="text-xs font-sans">No regular operational commitments or payables are scheduled.</p>
              </div>
            ) : (
              forecastData.expectedOutflowItems.map((item) => (
                <div key={item.id} className="p-3 bg-slate-50/50 border border-slate-100 rounded-lg text-xs flex items-center justify-between">
                  <div className="space-y-0.5 min-w-0 pr-2">
                    <p className="font-semibold text-slate-900 truncate">{item.party}</p>
                    <div className="flex items-center space-x-2 text-[10px] text-slate-550">
                      <span className="font-mono bg-rose-50 text-rose-800 px-1 py-0.2 rounded font-bold capitalize select-none">
                        {item.source === "DEBT_REPAYMENT" ? "debt repay" : item.source.toLowerCase()}
                      </span>
                      <span className="text-slate-400 font-mono">{item.date}</span>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-rose-600 flex-shrink-0">
                    -RM {item.amount.toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
};
