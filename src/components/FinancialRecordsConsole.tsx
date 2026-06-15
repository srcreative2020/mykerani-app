import React, { useState } from "react";
import { useFinancials } from "../context/FinancialRecordsContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { useAuth } from "../context/AuthContext";
import { 
  Plus, 
  Trash2, 
  Check, 
  X,
  Wallet, 
  Building2, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Clock, 
  AlertCircle, 
  Scale, 
  FileText, 
  Coins, 
  DollarSign, 
  RotateCw,
  TrendingUp,
  User,
  Calendar,
  Layers,
  Percent,
  Paperclip,
  FolderLock,
  ShieldCheck,
  Database,
  Bell,
} from "lucide-react";
import { type FinancialEvent, type CashAccount, type BankAccount, type DebtRecord, type FinancialRecordType, type FinancialCommitment, type ModuleName } from "../types";
import { FinancialCommitmentsManager } from "./FinancialCommitmentsManager";
import { CashflowForecastEngine } from "./CashflowForecastEngine";
import { FinancialEvidencePackageManager } from "./FinancialEvidencePackage";
import { PermissionSettingsConsole } from "./PermissionSettingsConsole";
import { AuditConsole } from "./AuditConsole";
import { OCREngineConsole } from "./OCREngineConsole";
import { AIFinancialAssistant } from "./AIFinancialAssistant";
import { FinancialReportsAnalytics } from "./FinancialReportsAnalytics";
import { MyKeraniBackupRecovery } from "./MyKeraniBackupRecovery";
import { StorageSettingsConsole } from "./StorageSettingsConsole";
import { NotificationCenterConsole } from "./NotificationCenterConsole";
import { usePermission } from "../context/PermissionContext";
import { Sparkles, Archive } from "lucide-react";

export const FinancialRecordsConsole: React.FC = () => {
  const { activeWorkspace } = useWorkspace();
  const {
    financialEvents,
    cashAccounts,
    bankAccounts,
    debtRecords,
    financialCommitments,
    addFinancialEvent,
    editFinancialEvent,
    deleteFinancialEvent,
    addCashAccount,
    editCashAccount,
    deleteCashAccount,
    addBankAccount,
    editBankAccount,
    deleteBankAccount,
    addDebtRecord,
    editDebtRecord,
    deleteDebtRecord,
    resetWorkspaceData,
  } = useFinancials();

  const [boardAiLoading, setBoardAiLoading] = useState(false);
  const [boardAiSummary, setBoardAiSummary] = useState<string | null>(null);

  // Helper formatting for simple YYYY-MM-DD matching
  const toDateString = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const r = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${r}`;
  };

  // Utility to check commitment occurrence on a specific date in our file:
  const isCommitmentOnDate = (commitment: any, dateVal: Date): boolean => {
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

  const getUpcomingCommitmentSums = () => {
    let sum7d = 0;
    let sum30d = 0;
    const list7d: any[] = [];
    const list30d: any[] = [];
    const baseDate = new Date();
    baseDate.setHours(0, 0, 0, 0);

    // we check for next 30 days
    for (let i = 1; i <= 30; i++) {
      const dayDate = new Date(baseDate);
      dayDate.setDate(baseDate.getDate() + i);
      const dateStr = toDateString(dayDate);
      
      (financialCommitments || []).forEach(cmt => {
        if (isCommitmentOnDate(cmt, dayDate)) {
          const item = {
            id: `${cmt.id}-${dateStr}`,
            date: dateStr,
            obligeeName: cmt.obligeeName,
            amount: cmt.amountPerIntervalMyr,
            description: cmt.description,
            recurrence: cmt.recurrence
          };
          sum30d += cmt.amountPerIntervalMyr;
          list30d.push(item);
          if (i <= 7) {
            sum7d += cmt.amountPerIntervalMyr;
            list7d.push(item);
          }
        }
      });
    }
    return { sum7d, sum30d, list7d, list30d };
  };

  const { hasPermission } = usePermission();
  const { user } = useAuth();
  const sessionUserRole = user?.role || "VIEWER";

  // Selected sub-module navigation
  const [activeModule, setActiveModule] = useState<
    "dashboard" | "reports" | "backup" | "income" | "expense" | "receivable" | "payable" | "debt" | "cash" | "bank" | "commitments" | "forecast" | "evidence" | "permissions" | "audit" | "ocr"
  >("dashboard");

  React.useEffect(() => {
    if (!activeWorkspace || activeModule !== "dashboard") return;
    
    let isMounted = true;
    const fetchDashboardSummary = async () => {
      setBoardAiLoading(true);
      try {
        const financialContext = {
          activeWorkspace,
          financialEvents,
          cashAccounts,
          bankAccounts,
          debtRecords,
          financialCommitments
        };
        const res = await fetch("/api/ai/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: "Sila berikan rumusan pendek kewangan (3-4 ayat ringkas dalam Bahasa Melayu terjemahan sopan, profesional, mesra pemilik perniagaan) berasaskan baki tunai perniagaan, baki bank, tuntutan belum terima, bayaran tertunggak, dan komitmen kewangan dalam workspace ini untuk dipaparkan di Dashboard utama MYKERANI. Terangkan status kesihatan syarikat secara membimbing tanpa bahasa teknikal perakaunan.",
            financialContext
          })
        });
        if (res.ok && isMounted) {
          const data = await res.json();
          setBoardAiSummary(data.text);
        }
      } catch (err) {
        console.warn("Could not load AI summary:", err);
      } finally {
        if (isMounted) {
          setBoardAiLoading(false);
        }
      }
    };
    
    fetchDashboardSummary();
    return () => {
      isMounted = false;
    };
  }, [activeWorkspace?.id, activeModule, financialEvents.length, financialCommitments?.length, cashAccounts?.length, bankAccounts?.length]);

  // Form toggle states
  const [showAddForm, setShowAddForm] = useState(false);

  // Form inputs states
  // Financial Event States (Income, Expense, Receivable, Payable)
  const [eventCategoryName, setEventCategoryName] = useState("");
  const [eventAmount, setEventAmount] = useState("");
  const [eventPartyName, setEventPartyName] = useState("");
  const [eventDate, setEventDate] = useState(new Date().toISOString().split("T")[0]);
  const [eventDueDate, setEventDueDate] = useState("");
  const [eventReference, setEventReference] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventSelectedCash, setEventSelectedCash] = useState("");
  const [eventSelectedBank, setEventSelectedBank] = useState("");
  const [eventIsCompleted, setEventIsCompleted] = useState(true);

  // Cash Account state
  const [cashName, setCashName] = useState("");
  const [cashResponsible, setCashResponsible] = useState("");
  const [cashBalance, setCashBalance] = useState("");

  // Bank Account state
  const [bankName, setBankName] = useState("");
  const [bankNumber, setBankNumber] = useState("");
  const [bankAccountHolder, setBankAccountHolder] = useState("");
  const [bankBranch, setBankBranch] = useState("");
  const [bankBalance, setBankBalance] = useState("");

  // Debt record state
  const [debtCreditor, setDebtCreditor] = useState("");
  const [debtDate, setDebtDate] = useState(new Date().toISOString().split("T")[0]);
  const [debtDueDate, setDebtDueDate] = useState("");
  const [debtTotal, setDebtTotal] = useState("");
  const [debtInterest, setDebtInterest] = useState("");
  const [debtRepaid, setDebtRepaid] = useState("0");
  const [debtDesc, setDebtDesc] = useState("");

  // Quick summary analytics
  const totalInflowMyr = financialEvents
    .filter(e => e.type === "INCOME" && e.isCompleted)
    .reduce((sum, e) => sum + e.amountMyr, 0);

  const totalOutflowMyr = financialEvents
    .filter(e => (e.type === "EXPENSE" || e.type === "DEBT") && e.isCompleted)
    .reduce((sum, e) => sum + e.amountMyr, 0);

  const outstandingReceivablesMyr = financialEvents
    .filter(e => e.type === "RECEIVABLE" && !e.isCompleted)
    .reduce((sum, e) => sum + e.amountMyr, 0);

  const outstandingPayablesMyr = financialEvents
    .filter(e => e.type === "PAYABLE" && !e.isCompleted)
    .reduce((sum, e) => sum + e.amountMyr, 0);

  const totalOutstandingDebtsMyr = debtRecords
    .filter(d => d.status === "ACTIVE")
    .reduce((sum, d) => sum + (d.totalAmountMyr - d.repaidAmountMyr), 0);

  const aggregateCashReserveMyr = cashAccounts.reduce((sum, c) => sum + c.currentBalanceMyr, 0);
  const aggregateBankReserveMyr = bankAccounts.reduce((sum, b) => sum + b.currentBalanceMyr, 0);

  if (!activeWorkspace) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500 shadow-sm" id="records_console_no_workspace">
        <AlertCircle className="w-8 h-8 mx-auto text-slate-400 mb-2" />
        <p className="text-sm font-sans">
          Please select or generate a workspace compartment to initialize your Financial Records modules.
        </p>
      </div>
    );
  }

  // Handle addition form submissions
  const handleAddEventSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventCategoryName || !eventAmount || !eventPartyName) return;

    let targetType: FinancialRecordType = "INCOME";
    if (activeModule === "expense") targetType = "EXPENSE";
    if (activeModule === "receivable") targetType = "RECEIVABLE";
    if (activeModule === "payable") targetType = "PAYABLE";

    addFinancialEvent({
      workspaceId: activeWorkspace.id,
      type: targetType,
      categoryName: eventCategoryName,
      amountMyr: parseFloat(eventAmount),
      partyName: eventPartyName,
      date: eventDate,
      dueDate: targetType === "RECEIVABLE" || targetType === "PAYABLE" ? eventDueDate || undefined : undefined,
      referenceNumber: eventReference || `REF-${Math.floor(Math.random() * 90000) + 10000}`,
      description: eventDescription,
      cashAccountId: eventSelectedCash || undefined,
      bankAccountId: eventSelectedBank || undefined,
      isCompleted: targetType === "RECEIVABLE" || targetType === "PAYABLE" ? eventIsCompleted : true
    });

    // Reset inputs
    setEventCategoryName("");
    setEventAmount("");
    setEventPartyName("");
    setEventDueDate("");
    setEventReference("");
    setEventDescription("");
    setEventSelectedCash("");
    setEventSelectedBank("");
    setEventIsCompleted(true);
    setShowAddForm(false);
  };

  const handleAddCashSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cashName || !cashResponsible || !cashBalance) return;

    addCashAccount({
      workspaceId: activeWorkspace.id,
      name: cashName,
      responsiblePerson: cashResponsible,
      currentBalanceMyr: parseFloat(cashBalance),
    });

    setCashName("");
    setCashResponsible("");
    setCashBalance("");
    setShowAddForm(false);
  };

  const handleAddBankSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankName || !bankNumber || !bankAccountHolder || !bankBalance) return;

    addBankAccount({
      workspaceId: activeWorkspace.id,
      bankName,
      accountNumber: bankNumber,
      accountName: bankAccountHolder,
      branchName: bankBranch || "Primary Branch",
      currentBalanceMyr: parseFloat(bankBalance),
    });

    setBankName("");
    setBankNumber("");
    setBankAccountHolder("");
    setBankBranch("");
    setBankBalance("");
    setShowAddForm(false);
  };

  const handleAddDebtSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!debtCreditor || !debtTotal) return;

    addDebtRecord({
      workspaceId: activeWorkspace.id,
      creditorName: debtCreditor,
      borrowedDate: debtDate,
      repaymentDueDate: debtDueDate || undefined,
      totalAmountMyr: parseFloat(debtTotal),
      repaidAmountMyr: parseFloat(debtRepaid) || 0,
      interestRateAnnualPercent: parseFloat(debtInterest) || undefined,
      status: "ACTIVE",
      description: debtDesc,
    });

    setDebtCreditor("");
    setDebtDueDate("");
    setDebtTotal("");
    setDebtRepaid("0");
    setDebtInterest("");
    setDebtDesc("");
    setShowAddForm(false);
  };

  return (
    <div className="space-y-6" id="financial_records_console_root">
      
      {/* MODULE NAVIGATION HEADER */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-sm flex flex-col xl:flex-row xl:items-center justify-between gap-6" id="financials_nav_header">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-rose-400 font-mono text-xs uppercase tracking-wider">
            <Coins className="w-4 h-4 text-rose-500" />
            <span>MYKERANI Cloud Financial Partition</span>
          </div>
          <h2 className="font-display font-semibold text-2xl tracking-tight leading-tight">
            Financial Records Workspace
          </h2>
          <p className="text-xs text-slate-350 font-sans max-w-xl">
            Audit compartmentalized business flows, outstanding vendor claims, cash reserves, and debtor obligations under the active <strong>{activeWorkspace.name}</strong> workspace boundary.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={resetWorkspaceData}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-mono font-bold flex items-center transition cursor-pointer"
            id="btn_reset_financials_workspace"
          >
            <RotateCw className="w-3.5 h-3.5 mr-1.5" />
            Restore Workspace Presets
          </button>
        </div>
      </div>

      {/* THREE-COLUMN DYNAMIC CAPACITY / OVERVIEW BOARD */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" id="aggregate_overview_grid">
        {/* Card 1: Combined Cash & Bank Holdings */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex justify-between items-center text-slate-400 font-mono text-[10px] uppercase font-bold tracking-wider">
            <span>Aggregated Cash Holdings</span>
            <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 uppercase">Liquidity</span>
          </div>
          <div className="space-y-1">
            <span className="text-3xl font-mono font-bold text-slate-900">
              RM {(aggregateCashReserveMyr + aggregateBankReserveMyr).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <div className="flex justify-between text-xs text-slate-500 pt-1 font-sans">
              <span className="flex items-center"><Wallet className="w-3 h-3 text-slate-400 mr-1" /> Cash Drawer: RM {aggregateCashReserveMyr.toLocaleString()}</span>
              <span className="flex items-center"><Building2 className="w-3 h-3 text-slate-400 mr-1" /> Licensed Banks: RM {aggregateBankReserveMyr.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Card 2: Operating Capital Inflow vs Downflow */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex justify-between items-center text-slate-400 font-mono text-[10px] uppercase font-bold tracking-wider">
            <span>Operating Flows (Completed)</span>
            <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 uppercase font-mono">Completed</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-sans">
              <span className="text-slate-500 flex items-center">
                <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600 mr-1" /> Total Inflow RECEIPTS:
              </span>
              <span className="font-mono font-bold text-emerald-600">
                + RM {totalInflowMyr.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs font-sans">
              <span className="text-slate-500 flex items-center">
                <ArrowUpRight className="w-3.5 h-3.5 text-rose-600 mr-1" /> Outflow DISBURSALS:
              </span>
              <span className="font-mono font-bold text-rose-600">
                - RM {totalOutflowMyr.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Pending Claims & Debts */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex justify-between items-center text-slate-400 font-mono text-[10px] uppercase font-bold tracking-wider">
            <span>Outstanding Obligations</span>
            <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100 uppercase">Liability</span>
          </div>
          <div className="space-y-2 text-xs font-sans">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 flex items-center">
                <Clock className="w-3.5 h-3.5 text-indigo-500 mr-1" /> Customer Claims Receivable:
              </span>
              <span className="font-mono font-bold text-indigo-700">
                RM {outstandingReceivablesMyr.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 flex items-center">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500 mr-1" /> Vendor Payables Pending:
              </span>
              <span className="font-mono font-bold text-amber-700">
                RM {outstandingPayablesMyr.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 flex items-center">
                <Scale className="w-3.5 h-3.5 text-rose-500 mr-1" /> Active Borrowed Credit:
              </span>
              <span className="font-mono font-bold text-rose-700">
                RM {totalOutstandingDebtsMyr.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* NAVIGATION TABS SUB-BAR */}
      <div className="bg-white border border-slate-200 rounded-xl p-2.5 shadow-xs flex flex-wrap gap-1" id="financial_subnavigation_tabs">
        <button
          onClick={() => { setActiveModule("dashboard"); setShowAddForm(false); }}
          className={`flex-1 min-w-[140px] px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center transition cursor-pointer ${
            activeModule === "dashboard" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
          id="tab_nav_dashboard"
        >
          <TrendingUp className="w-4 h-4 mr-1.5 text-indigo-500 animate-pulse" />
          Financial Dashboard
        </button>
        <button
          onClick={() => { setActiveModule("reports"); setShowAddForm(false); }}
          className={`flex-1 min-w-[140px] px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center transition cursor-pointer ${
            activeModule === "reports" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
          id="tab_nav_reports"
        >
          <FileText className="w-4 h-4 mr-1.5 text-rose-500 animate-pulse" />
          Statutory Reports
        </button>
        <button
          onClick={() => { setActiveModule("income"); setShowAddForm(false); }}
          className={`flex-1 min-w-[120px] px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center transition cursor-pointer ${
            activeModule === "income" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
          id="tab_nav_income"
        >
          <ArrowDownLeft className="w-4 h-4 mr-1.5 text-emerald-500" />
          Income Flows
        </button>
        <button
          onClick={() => { setActiveModule("expense"); setShowAddForm(false); }}
          className={`flex-1 min-w-[120px] px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center transition cursor-pointer ${
            activeModule === "expense" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
          id="tab_nav_expense"
        >
          <ArrowUpRight className="w-4 h-4 mr-1.5 text-rose-500" />
          Expense Outlays
        </button>
        <button
          onClick={() => { setActiveModule("receivable"); setShowAddForm(false); }}
          className={`flex-1 min-w-[130px] px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center transition cursor-pointer ${
            activeModule === "receivable" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
          id="tab_nav_receivable"
        >
          <Clock className="w-4 h-4 mr-1.5 text-indigo-500" />
          Receivables
        </button>
        <button
          onClick={() => { setActiveModule("payable"); setShowAddForm(false); }}
          className={`flex-1 min-w-[130px] px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center transition cursor-pointer ${
            activeModule === "payable" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
          id="tab_nav_payable"
        >
          <AlertCircle className="w-4 h-4 mr-1.5 text-amber-500" />
          Payables
        </button>
        <button
          onClick={() => { setActiveModule("debt"); setShowAddForm(false); }}
          className={`flex-1 min-w-[120px] px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center transition cursor-pointer ${
            activeModule === "debt" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
          id="tab_nav_debt"
        >
          <Scale className="w-4 h-4 mr-1.5 text-purple-500" />
          Credit & Debts
        </button>
        <button
          onClick={() => { setActiveModule("cash"); setShowAddForm(false); }}
          className={`flex-1 min-w-[120px] px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center transition cursor-pointer ${
            activeModule === "cash" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
          id="tab_nav_cash"
        >
          <Wallet className="w-4 h-4 mr-1.5 text-amber-600" />
          Cash draw
        </button>
        <button
          onClick={() => { setActiveModule("bank"); setShowAddForm(false); }}
          className={`flex-1 min-w-[120px] px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center transition cursor-pointer ${
            activeModule === "bank" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
          id="tab_nav_bank"
        >
          <Building2 className="w-4 h-4 mr-1.5 text-blue-500" />
          Bank vaults
        </button>
        <button
          onClick={() => { setActiveModule("commitments"); setShowAddForm(false); }}
          className={`flex-1 min-w-[140px] px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center transition cursor-pointer ${
            activeModule === "commitments" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
          id="tab_nav_commitments"
        >
          <Calendar className="w-4 h-4 mr-1.5 text-indigo-500" />
          Financial Commitments
        </button>
        <button
          onClick={() => { setActiveModule("forecast"); setShowAddForm(false); }}
          className={`flex-1 min-w-[140px] px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center transition cursor-pointer ${
            activeModule === "forecast" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
          id="tab_nav_forecast"
        >
          <TrendingUp className="w-4 h-4 mr-1.5 text-emerald-500 animate-pulse" />
          Cashflow Forecast
        </button>
        <button
          onClick={() => { setActiveModule("ocr"); setShowAddForm(false); }}
          className={`flex-1 min-w-[150px] px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center transition border cursor-pointer ${
            activeModule === "ocr" ? "bg-emerald-900 border-emerald-950 text-white shadow-xs" : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border-emerald-200/50"
          }`}
          id="tab_nav_ocr"
        >
          <Scale className="w-4 h-4 mr-1.5 text-emerald-600 animate-pulse" />
          AI OCR Scanner
        </button>
        <button
          onClick={() => { setActiveModule("ai_assistant"); setShowAddForm(false); }}
          className={`flex-1 min-w-[150px] px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center transition border cursor-pointer border-indigo-200/50 ${
            activeModule === "ai_assistant" ? "bg-indigo-900 border-indigo-950 text-white shadow-xs" : "bg-indigo-50 text-indigo-800 hover:bg-indigo-100"
          }`}
          id="tab_nav_ai_assistant"
        >
          <Sparkles className="w-4 h-4 mr-1.5 text-indigo-500 animate-pulse" />
          AI Copilot Desk
        </button>
        <button
          onClick={() => { setActiveModule("evidence"); setShowAddForm(false); }}
          className={`flex-1 min-w-[150px] px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center transition cursor-pointer ${
            activeModule === "evidence" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
          id="tab_nav_evidence"
        >
          <Paperclip className="w-4 h-4 mr-1.5 text-rose-500" />
          Financial Evidence Package
        </button>
        <button
          onClick={() => { setActiveModule("storage"); setShowAddForm(false); }}
          className={`flex-1 min-w-[150px] px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center transition border border-slate-200/50 cursor-pointer ${
            activeModule === "storage" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
          id="tab_nav_storage"
        >
          <Database className="w-4 h-4 mr-1.5 text-blue-500 animate-pulse" />
          Storage Settings
        </button>
        <button
          onClick={() => { setActiveModule("notifications"); setShowAddForm(false); }}
          className={`flex-1 min-w-[150px] px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center transition border border-slate-200/50 cursor-pointer ${
            activeModule === "notifications" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
          id="tab_nav_notifications"
        >
          <Bell className="w-4 h-4 mr-1.5 text-blue-500" />
          Notification Router
        </button>
        <button
          onClick={() => { setActiveModule("permissions"); setShowAddForm(false); }}
          className={`flex-1 min-w-[160px] px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center transition border border-rose-200/50 cursor-pointer ${
            activeModule === "permissions" ? "bg-rose-900 text-white border-rose-950 shadow-xs" : "bg-rose-500/5 text-rose-700 hover:bg-rose-500/10"
          }`}
          id="tab_nav_permissions"
        >
          <FolderLock className="w-4 h-4 mr-1.5" />
          HQ Permissions Suite
        </button>
        <button
          onClick={() => { setActiveModule("backup"); setShowAddForm(false); }}
          className={`flex-1 min-w-[160px] px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center transition border border-orange-200/50 cursor-pointer ${
            activeModule === "backup" ? "bg-orange-850 text-white bg-orange-905 border-orange-950 shadow-xs animate-none" : "bg-orange-500/5 text-orange-700 hover:bg-orange-500/10"
          }`}
          id="tab_nav_backup"
        >
          <Archive className="w-4 h-4 mr-1.5 text-orange-600" />
          Backup & Recovery
        </button>
        <button
          onClick={() => { setActiveModule("audit"); setShowAddForm(false); }}
          className={`flex-1 min-w-[160px] px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center transition border border-emerald-200/50 cursor-pointer ${
            activeModule === "audit" ? "bg-emerald-805 text-white bg-emerald-900 border-emerald-950 shadow-xs" : "bg-emerald-500/5 text-emerald-700 hover:bg-emerald-500/10"
          }`}
          id="tab_nav_audit"
        >
          <ShieldCheck className="w-4 h-4 mr-1.5" />
          Immutable Audit Trail
        </button>
      </div>

      {/* CORE ACTIVE MODULE DISPLAY BOX */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-xs space-y-6" id="module_active_canvas">
        {(() => {
          const getModuleForTab = (tab: string): ModuleName => {
            if (tab === "commitments") return "Financial Commitments";
            if (tab === "forecast") return "Financial Forecast";
            if (tab === "evidence") return "Financial Evidence Package";
            if (tab === "ocr") return "Financial Evidence Package";
            if (tab === "storage") return "Financial Evidence Package";
            if (tab === "notifications") return "Notifications";
            return "Financial Records";
          };

          const currentModuleLabel = getModuleForTab(activeModule);
          const isAuthorized = activeModule === "permissions" || activeModule === "audit" || activeModule === "ocr" || activeModule === "ai_assistant" || activeModule === "storage" || activeModule === "notifications" || hasPermission(currentModuleLabel, "read");

          if (!isAuthorized) {
            return (
              <div className="flex flex-col items-center justify-center text-center py-16 px-4 space-y-5" id="access_denied_block">
                <div className="p-3 bg-rose-50 border border-rose-100/60 text-rose-600 rounded-full">
                  <FolderLock className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-display font-semibold text-slate-900 text-base">
                    Auditing Access Restriction Enforced
                  </h4>
                  <p className="text-xs text-slate-500 max-w-sm leading-relaxed font-sans">
                    Your currently configured authentication session role does not have reading clearance to view the <strong>{currentModuleLabel}</strong> module inside this isolated workspace.
                  </p>
                </div>
                <div className="p-4 bg-slate-900 text-slate-400 rounded-xl text-left text-[11px] font-mono leading-relaxed max-w-md w-full border border-slate-800 shadow-sm">
                  <span className="text-rose-400 font-bold block mb-1">{"\u003e\u003e POLICY GATEWAY TRACE LOGS:"}</span>
                  <p>{"-\u003e RESOURCE ID: "}{currentModuleLabel}</p>
                  <p>{"-\u003e EXECUTING PROFILE: "}{sessionUserRole}</p>
                  <p>{"-\u003e POLICY CLEARANCE REQUIRED: READ"}</p>
                  <p>{"-\u003e CONFLICT STATE: SECURITY_EXCEPTION_BLOCK"}</p>
                </div>
              </div>
            );
          }

          return (
            <>
              {/* Module Sub-Header Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5" id="module_detail_header">
          <div>
            <h3 className="font-display font-semibold text-lg text-slate-900 capitalize">
              {activeModule === "dashboard"
                ? "Financial Summary"
                : activeModule === "reports"
                ? "Autonomous Financial & Statutory Reports"
                : activeModule === "storage"
                ? "BYOS Storage Settings Console (Sprint 5 Foundation)"
                : activeModule === "notifications"
                ? "Advisory Notification Router Desk (Sprint 5 Task 6)"
                : activeModule === "backup"
                ? "Disaster Backup & Recovery Hub"
                : activeModule === "cash" 
                ? "Physical Cash Holding Drawers" 
                : activeModule === "bank" 
                ? "Licensed Bank Depositories" 
                : activeModule === "debt"
                ? "Active Creditors & Loan Obligations"
                : activeModule === "receivable"
                ? "Outstanding Customer Claims"
                : activeModule === "payable"
                ? "Provider Bills Pending Clearing"
                : activeModule === "commitments"
                ? "Contractual Contracts & Financial Commitments"
                : activeModule === "forecast"
                ? "MYKERANI Cashflow Forecast Engine"
                : activeModule === "ai_assistant"
                ? "AI Financial Copilot Desk"
                : `${activeModule} Transactions`}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 font-sans">
              {activeModule === "dashboard" && "Consolidated overview of financial states, business financial health, and recent activities."}
              {activeModule === "reports" && "Compliant financial statements, cashflow assessments, vendor aging penuaan matrix, and solvency health scores."}
              {activeModule === "storage" && "Manage multi-tenant isolated physical file roots and configure Bring-Your-Own-Storage (BYOS) cloud endpoints."}
              {activeModule === "notifications" && "Broadcast secure in-app, email, and push communications relating to workspace indicators."}
              {activeModule === "backup" && "Auditable, user-owned workspace backup snapshots, downloadable JSON archives, and policy-gated restore actions."}
              {activeModule === "income" && "Real-time records of sales collections and ingress capital receipts."}
              {activeModule === "expense" && "Real-time records of operating disbursements, rentals, and payments."}
              {activeModule === "receivable" && "Track customer invoices issued with outstanding uncollected balances."}
              {activeModule === "payable" && "Track incoming vendor/creditor service billing invoices waiting for clearance."}
              {activeModule === "debt" && "Oversight of external capital credit, auto hire-purchase, or corporate syndicated lending agreements."}
              {activeModule === "cash" && "Manage localized physical cash vaults, storefront register floats, or petty cash envelopes."}
              {activeModule === "bank" && "Track assigned credit bank vaults, enterprise current accounts, and institutional clearing deposits."}
              {activeModule === "commitments" && "Forecast upcoming recurring operational, structural rent, loan repayments, interest, utilities, and vendor billing obligations."}
              {activeModule === "forecast" && "Predict short-term (7-day), medium-term (30-day), and long-term (90-day) liquidity runways to manage operational and financial risks."}
              {activeModule === "ai_assistant" && "Interactive deep search, healthcare diagnostics, runway forecasting, and cognitive learning layer."}
            </p>
          </div>

          {activeModule !== "dashboard" && activeModule !== "reports" && activeModule !== "backup" && activeModule !== "commitments" && activeModule !== "forecast" && activeModule !== "ai_assistant" && activeModule !== "storage" && activeModule !== "notifications" && (
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center transition self-start sm:self-auto cursor-pointer"
              id="toggle_module_add_form_btn"
            >
              {showAddForm ? (
                <>
                  <X className="w-4 h-4 mr-1.5" /> Close Entry Form
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-1.5" /> Add New Entry
                </>
              )}
            </button>
          )}
        </div>

        {/* 1. DYNAMIC ADDITION FORMS */}
        {showAddForm && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 md:p-6 animate-fade-in" id="addition_form_wrapper">
            
            {/* Form A: Income, Expense, Receivable, Payable */}
            {(activeModule === "income" || activeModule === "expense" || activeModule === "receivable" || activeModule === "payable") && (
              <form onSubmit={handleAddEventSubmit} className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                  <span className="text-xs font-bold font-mono text-slate-700 uppercase flex items-center">
                    <FileText className="w-4 h-4 mr-1.5 text-slate-400" />
                    Inject New {activeModule.toUpperCase()} Record
                  </span>
                  <span className="text-[10px] font-mono bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-bold uppercase">
                    MYR Basin
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">Category Name</label>
                    <input
                      type="text"
                      id="event_input_category_name"
                      required
                      placeholder={activeModule === "income" ? "e.g., Consulting Fees" : "e.g., Office Rent"}
                      value={eventCategoryName}
                      onChange={(e) => setEventCategoryName(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">Amount (MYR / RM)</label>
                    <input
                      type="number"
                      step="0.01"
                      id="event_input_amount"
                      required
                      placeholder="0.00"
                      value={eventAmount}
                      onChange={(e) => setEventAmount(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">Counterparty Name</label>
                    <input
                      type="text"
                      id="event_input_party_name"
                      required
                      placeholder="e.g., Malayan Ventures Ltd"
                      value={eventPartyName}
                      onChange={(e) => setEventPartyName(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">Date of Event</label>
                    <input
                      type="date"
                      id="event_input_date"
                      required
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg outline-none"
                    />
                  </div>

                  {(activeModule === "receivable" || activeModule === "payable") && (
                    <div className="space-y-1">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase">Expected Settling Due Date</label>
                      <input
                        type="date"
                        id="event_input_due_date"
                        required
                        value={eventDueDate}
                        onChange={(e) => setEventDueDate(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg outline-none"
                      />
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">Custom Reference / Receipt #</label>
                    <input
                      type="text"
                      id="event_input_ref"
                      placeholder="e.g., INV-2026-0031"
                      value={eventReference}
                      onChange={(e) => setEventReference(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg outline-none"
                    />
                  </div>

                  {/* Liquidity Accounts Linker */}
                  {(activeModule === "income" || activeModule === "expense") && (
                    <>
                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase">Link To Physical Cash Drawer</label>
                        <select
                          id="event_input_cash_link"
                          value={eventSelectedCash}
                          onChange={(e) => {
                            setEventSelectedCash(e.target.value);
                            if (e.target.value) setEventSelectedBank("");
                          }}
                          className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg outline-none cursor-pointer"
                        >
                          <option value="">-- No cash drawer link --</option>
                          {cashAccounts.map(c => (
                            <option key={c.id} value={c.id}>{c.name} (RM {c.currentBalanceMyr})</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase">Link To Bank Vault</label>
                        <select
                          id="event_input_bank_link"
                          value={eventSelectedBank}
                          onChange={(e) => {
                            setEventSelectedBank(e.target.value);
                            if (e.target.value) setEventSelectedCash("");
                          }}
                          className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg outline-none cursor-pointer"
                        >
                          <option value="">-- No bank custody link --</option>
                          {bankAccounts.map(b => (
                            <option key={b.id} value={b.id}>{b.bankName} - {b.accountName}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}

                  {(activeModule === "receivable" || activeModule === "payable") && (
                    <div className="space-y-1">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase">Initial Flow Completion Status</label>
                      <select
                        id="event_input_status_link"
                        value={eventIsCompleted ? "true" : "false"}
                        onChange={(e) => setEventIsCompleted(e.target.value === "true")}
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg outline-none cursor-pointer"
                      >
                        <option value="false">Outstanding (Uncompleted claims pipeline)</option>
                        <option value="true">Settle/Paid Instantly (Clear Flow)</option>
                      </select>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Description Details</label>
                  <textarea
                    id="event_input_desc"
                    placeholder="Provide a clear, brief summary of why these financial events occurred."
                    value={eventDescription}
                    onChange={(e) => setEventDescription(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg outline-none h-16 resize-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-200/50">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
                  >
                    Save Operational Event
                  </button>
                </div>
              </form>
            )}

            {/* Form B: Cash Account */}
            {activeModule === "cash" && (
              <form onSubmit={handleAddCashSubmit} className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                  <span className="text-xs font-bold font-mono text-slate-700 uppercase flex items-center">
                    <Wallet className="w-4 h-4 mr-1.5 text-slate-400" />
                    Register New Cash Holding Drawer / Float
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">Drawer Compartment Name</label>
                    <input
                      type="text"
                      id="cash_input_name"
                      required
                      placeholder="e.g. Backoffice Safe Cabinet"
                      value={cashName}
                      onChange={(e) => setCashName(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">Assigned Person-in-charge</label>
                    <input
                      type="text"
                      id="cash_input_responsible"
                      required
                      placeholder="e.g. Jessica Low (SME Admin)"
                      value={cashResponsible}
                      onChange={(e) => setCashResponsible(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">Opening Balance Float (MYR)</label>
                    <input
                      type="number"
                      step="0.01"
                      id="cash_input_balance"
                      required
                      placeholder="0.00"
                      value={cashBalance}
                      onChange={(e) => setCashBalance(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-200/50">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
                  >
                    Incorporate Cash Float
                  </button>
                </div>
              </form>
            )}

            {/* Form C: Bank Account */}
            {activeModule === "bank" && (
              <form onSubmit={handleAddBankSubmit} className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                  <span className="text-xs font-bold font-mono text-slate-700 uppercase flex items-center">
                    <Building2 className="w-4 h-4 mr-1.5 text-slate-400" />
                    Register Corporate Licensed Depository
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">Banking Institution</label>
                    <input
                      type="text"
                      id="bank_input_name"
                      required
                      placeholder="e.g., Maybank Bhd, CIMB Bank"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">Account Identifier Number</label>
                    <input
                      type="text"
                      id="bank_input_number"
                      required
                      placeholder="e.g., 5140-1284-9921"
                      value={bankNumber}
                      onChange={(e) => setBankNumber(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">Registered Account Owner (Holder)</label>
                    <input
                      type="text"
                      id="bank_input_holder"
                      required
                      placeholder="e.g. LemonTree Bakery Sdn Bhd"
                      value={bankAccountHolder}
                      onChange={(e) => setBankAccountHolder(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">Bank Branch Location</label>
                    <input
                      type="text"
                      id="bank_input_branch"
                      placeholder="e.g., Mid Valley KL Branch"
                      value={bankBranch}
                      onChange={(e) => setBankBranch(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">Current Ledger Deposit (MYR)</label>
                    <input
                      type="number"
                      step="0.01"
                      id="bank_input_balance"
                      required
                      placeholder="0.00"
                      value={bankBalance}
                      onChange={(e) => setBankBalance(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-200/50">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
                  >
                    Secure Account Binding
                  </button>
                </div>
              </form>
            )}

            {/* Form D: Debt Records */}
            {activeModule === "debt" && (
              <form onSubmit={handleAddDebtSubmit} className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                  <span className="text-xs font-bold font-mono text-slate-700 uppercase flex items-center">
                    <Scale className="w-4 h-4 mr-1.5 text-slate-400" />
                    Register Secured Lending Agreement / Corporate Credit
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">Creditor Institution / Sponsor Name</label>
                    <input
                      type="text"
                      id="debt_input_creditor"
                      required
                      placeholder="e.g. SME Corp MicroCredit Facility"
                      value={debtCreditor}
                      onChange={(e) => setDebtCreditor(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">Capital Acquisition Date</label>
                    <input
                      type="date"
                      id="debt_input_date"
                      required
                      value={debtDate}
                      onChange={(e) => setDebtDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">Maturity Repayment Deadline</label>
                    <input
                      type="date"
                      id="debt_input_due"
                      value={debtDueDate}
                      onChange={(e) => setDebtDueDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">Nominal Credit Awarded (Total MYR)</label>
                    <input
                      type="number"
                      step="0.01"
                      id="debt_input_total"
                      required
                      placeholder="0.00"
                      value={debtTotal}
                      onChange={(e) => setDebtTotal(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">Already repaid Tally (MYR / RM)</label>
                    <input
                      type="number"
                      step="0.01"
                      id="debt_input_repaid"
                      placeholder="e.g. 10000"
                      value={debtRepaid}
                      onChange={(e) => setDebtRepaid(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">Annualized Interest Rate (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      id="debt_input_rate"
                      placeholder="e.g. 4.75"
                      value={debtInterest}
                      onChange={(e) => setDebtInterest(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Credit Description & Backers</label>
                  <textarea
                    id="debt_input_desc"
                    placeholder="Describe usage parameters, asset hypothecations, collateral notes, etc."
                    value={debtDesc}
                    onChange={(e) => setDebtDesc(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg outline-none h-16 resize-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-200/50">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
                  >
                    Incorporate Loan Obligation
                  </button>
                </div>
              </form>
            )}

          </div>
        )}

        {/* 1.5 FINANCIAL DASHBOARD COMPONENT */}
        {activeModule === "dashboard" && (
          <div className="space-y-8 animate-fade-in" id="dashboard_panel_root">
            
            {/* Header Greeting */}
            <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl p-6 shadow-sm border border-slate-950 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-xl font-display font-bold tracking-tight">
                  MYKERANI Dashboard
                </h3>
                <p className="text-xs text-indigo-200 font-sans">
                  Pembantu Kewangan Pintar Anda • Menyediakan kejelasan, kawalan & ketetapan kewangan PKS.
                </p>
              </div>
              <div className="flex items-center space-x-2 bg-indigo-900/40 border border-indigo-400/20 px-3 py-1.5 rounded-xl">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[10px] font-mono tracking-wide text-indigo-150 uppercase font-bold">
                  Sistem Aktif & Terisolasi
                </span>
              </div>
            </div>

            {/* Row 1: AI Summary & Health */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Left Column: AI Assistant Summary (Col Span 7) */}
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4" id="ai_summary_container">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="bg-indigo-50 p-2 rounded-xl border border-indigo-100/60">
                      <Sparkles className="w-4 h-4 text-indigo-600 animate-pulse" />
                    </div>
                    <div>
                      <h4 className="font-display font-semibold text-sm text-slate-900">
                        Rumusan AI MYKERANI Pintar
                      </h4>
                      <p className="text-[9px] text-slate-400 font-mono uppercase tracking-wide">
                        Real-Time Cognitive Advisory
                      </p>
                    </div>
                  </div>
                  {boardAiLoading && (
                    <div className="flex items-center space-x-1 text-slate-405 font-mono text-[10px]">
                      <RotateCw className="w-3 h-3 animate-spin" />
                      <span>Sila tunggu...</span>
                    </div>
                  )}
                </div>

                <div className="text-slate-700 text-xs min-h-[90px] prose prose-slate max-w-none leading-relaxed bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                  {boardAiLoading ? (
                    <div className="space-y-2.5 py-2">
                      <div className="h-3 w-11/12 bg-slate-200 rounded animate-pulse" />
                      <div className="h-3 w-5/6 bg-slate-200 rounded animate-pulse" />
                      <div className="h-3 w-3/4 bg-slate-200 rounded animate-pulse" />
                    </div>
                  ) : boardAiSummary ? (
                    <div className="whitespace-pre-line font-sans" id="ai_board_summary_text">
                      {boardAiSummary}
                    </div>
                  ) : (
                    <div className="space-y-2 font-sans text-slate-600">
                      <p className="font-semibold text-slate-805">Ringkasan kedudukan kewangan PKS anda:</p>
                      <ul className="list-disc pl-4 space-y-1.5 text-slate-505">
                        <li>Kompartmen mudah tunai semasa anda adalah bernilai <strong className="text-slate-900 font-mono font-bold">RM {(aggregateCashReserveMyr + aggregateBankReserveMyr).toLocaleString("en-MY", { minimumFractionDigits: 2 })}</strong>, bersedia menyokong operasi.</li>
                        <li>Sektor piutang jualan tertunggak (<strong className="text-indigo-600 font-mono">RM {outstandingReceivablesMyr.toLocaleString()}</strong>) perlu dipantau rapi untuk mempercepat pusingan tunai.</li>
                        <li>Pastikan komitmen berjadual dalam masa terdekat diselesaikan mengikut pelan aliran tunai bagi memelihara skor kesihatan organisasi.</li>
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Financial Health (Col Span 5) */}
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between space-y-4" id="financial_health_container">
                <div className="flex items-center space-x-2">
                  <div className="bg-slate-50 p-2 rounded-xl border border-slate-200/60">
                    <TrendingUp className="w-4 h-4 text-slate-700" />
                  </div>
                  <div>
                    <h4 className="font-display font-semibold text-sm text-slate-900">
                      Tahap Kesihatan Kewangan
                    </h4>
                    <p className="text-[9px] text-slate-400 font-mono uppercase tracking-wide">
                      Automatic Audit Scorecard
                    </p>
                  </div>
                </div>

                {(() => {
                  const totalCashAndBank = aggregateCashReserveMyr + aggregateBankReserveMyr;
                  const { sum30d } = getUpcomingCommitmentSums();
                  const totalUpcomingLiabilities = outstandingPayablesMyr + sum30d;
                  const ratio = totalUpcomingLiabilities === 0 ? 10 : totalCashAndBank / totalUpcomingLiabilities;

                  let healthState: "Healthy" | "Watch" | "Critical" = "Healthy";
                  let healthBg = "bg-emerald-50 border-emerald-200 text-emerald-800";
                  let healthDot = "bg-emerald-500";
                  let healthLabel = "Cemerlang & Selamat (Healthy)";
                  let healthMessage = "Semua baki sedia ada tunai mencukupi untuk menampung komitmen jangka pendek dalam tempoh 30 hari ke hadapan.";

                  if (ratio < 1.0) {
                    healthState = "Critical";
                    healthBg = "bg-rose-50 border-rose-200 text-rose-800";
                    healthDot = "bg-rose-500 animate-ping";
                    healthLabel = "Kritikal / Pelarasan Segera (Critical)";
                    healthMessage = "Aliran tunai semasa adalah tipis berbanding tuntutan pembekal & bil. Sila kutip bahagian piutang secepat mungkin.";
                  } else if (ratio < 1.8) {
                    healthState = "Watch";
                    healthBg = "bg-amber-50 border-amber-200 text-amber-800";
                    healthDot = "bg-amber-500 animate-pulse";
                    healthLabel = "Dalam Perhatian (Watch)";
                    healthMessage = "Aliran tunai mencukupi untuk bil semasa tetapi pemantauan rapi perbelanjaan minggu hadapan sangat disyorkan.";
                  }

                  return (
                    <div className="space-y-4 flex-1 flex flex-col justify-center">
                      <div className={`p-4 rounded-xl border-2 flex items-start gap-3 ${healthBg}`} id="health_state_alert">
                        <span className="relative flex h-2.5 w-2.5 mt-1 flex-shrink-0">
                          <span className={`${healthDot} absolute inline-flex h-full w-full rounded-full opacity-75`}></span>
                          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${healthDot.replace("animate-pulse", "").replace("animate-ping", "")}`}></span>
                        </span>
                        <div>
                          <p className="font-bold text-xs uppercase tracking-wide">
                            {healthLabel}
                          </p>
                          <p className="text-[11px] mt-1 opacity-90 leading-relaxed font-sans">
                            {healthMessage}
                          </p>
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono uppercase font-bold pt-1">
                        <span>Liquidity Ratio Index</span>
                        <span className="font-bold text-slate-800">{ratio.toFixed(2)}x Margin Runway</span>
                      </div>
                    </div>
                  );
                })()}

              </div>

            </div>

            {/* Section 2: Financial Position Deck */}
            <div className="space-y-3" id="financial_position_deck">
              <div>
                <h4 className="font-display font-semibold text-base text-slate-900">
                  1. Kedudukan Kewangan (Financial Position)
                </h4>
                <p className="text-xs text-slate-500">
                  Rumusan terperinci dana tunai sedia ada, nilai tuntutan bersih, dan kewajipan baki semasa perniagaan anda.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                
                {/* 1. Total Cash */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs hover:border-slate-300 transition duration-150 flex flex-col justify-between min-h-[110px]">
                  <div className="flex justify-between items-center text-slate-400 text-[10px] uppercase font-bold tracking-wide">
                    <span>Jumlah Tunai</span>
                    <Wallet className="w-3.5 h-3.5 text-emerald-600 bg-emerald-50 rounded p-0.5" />
                  </div>
                  <div>
                    <span className="font-sans text-[10px] text-slate-400 block font-medium">Laci Tunai</span>
                    <p className="text-lg font-mono font-bold text-slate-950 tracking-tight mt-0.5">
                      RM {aggregateCashReserveMyr.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                {/* 2. Total Bank Balance */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs hover:border-slate-300 transition duration-150 flex flex-col justify-between min-h-[110px]">
                  <div className="flex justify-between items-center text-slate-400 text-[10px] uppercase font-bold tracking-wide">
                    <span>Baki Akaun Bank</span>
                    <Building2 className="w-3.5 h-3.5 text-blue-600 bg-blue-50 rounded p-0.5" />
                  </div>
                  <div>
                    <span className="font-sans text-[10px] text-slate-400 block font-medium">Baki Terpelihara</span>
                    <p className="text-lg font-mono font-bold text-slate-950 tracking-tight mt-0.5">
                      RM {aggregateBankReserveMyr.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                {/* 3. Total Receivables */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs hover:border-slate-300 transition duration-150 flex flex-col justify-between min-h-[110px]">
                  <div className="flex justify-between items-center text-slate-400 text-[10px] uppercase font-bold tracking-wide">
                    <span>Tuntutan Pelanggan</span>
                    <Clock className="w-3.5 h-3.5 text-indigo-600 bg-indigo-50 rounded p-0.5" />
                  </div>
                  <div>
                    <span className="font-sans text-[10px] text-slate-400 block font-medium">Receivables Belum Kutip</span>
                    <p className="text-lg font-mono font-bold text-indigo-650 tracking-tight mt-0.5">
                      RM {outstandingReceivablesMyr.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                {/* 4. Total Payables */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs hover:border-slate-300 transition duration-150 flex flex-col justify-between min-h-[110px]">
                  <div className="flex justify-between items-center text-slate-400 text-[10px] uppercase font-bold tracking-wide">
                    <span>Tunggakan Pembekal</span>
                    <AlertCircle className="w-3.5 h-3.5 text-amber-650 bg-amber-50 rounded p-0.5" />
                  </div>
                  <div>
                    <span className="font-sans text-[10px] text-slate-400 block font-medium">Payables Belum Selesai</span>
                    <p className="text-lg font-mono font-bold text-amber-700 tracking-tight mt-0.5">
                      RM {outstandingPayablesMyr.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                {/* 5. Total Commitments */}
                <div className="bg-slate-950 text-white rounded-xl p-4 shadow-2xs flex flex-col justify-between min-h-[110px]">
                  <div className="flex justify-between items-center text-indigo-200 text-[10px] uppercase font-bold tracking-wide">
                    <span>Komitmen Kontrak</span>
                    <Scale className="w-3.5 h-3.5 text-indigo-400 bg-slate-800 rounded p-0.5" />
                  </div>
                  <div>
                    <span className="font-sans text-[10px] text-indigo-200 block font-medium">Kadar Bulanan Aktif</span>
                    {(() => {
                      const totalCmtActive = (financialCommitments || [])
                        .filter(c => c.isActive && c.status === "ACTIVE")
                        .reduce((sum, c) => sum + c.amountPerIntervalMyr, 0);
                      return (
                        <p className="text-lg font-mono font-bold text-indigo-400 tracking-tight mt-0.5">
                          RM {totalCmtActive.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                        </p>
                      );
                    })()}
                  </div>
                </div>

              </div>
            </div>

            {/* Row 3: Upcoming Commitments Detailed */}
            <div className="space-y-4" id="upcoming_commitments_module">
              <div>
                <h4 className="font-display font-semibold text-base text-slate-900">
                  2. Aliran Komitmen Akan Datang (Upcoming Commitments)
                </h4>
                <p className="text-xs text-slate-500">
                  Unjuran pembayaran obligasi & bil sewaan berjadual mengikut kalendar kedudukan aliran tunai workspace.
                </p>
              </div>

              {(() => {
                const { sum7d, sum30d, list7d, list30d } = getUpcomingCommitmentSums();
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* Next 7 Days Box */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
                      <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                        <div className="flex items-center space-x-2">
                          <div className="bg-rose-50 p-1.5 rounded-lg border border-rose-100">
                            <Calendar className="w-4 h-4 text-rose-500" />
                          </div>
                          <span className="font-display font-semibold text-sm text-slate-950">
                            Seterusnya: 7 Hari Akan Datang
                          </span>
                        </div>
                        <span className="font-mono text-xs font-bold text-rose-600 bg-rose-50/50 px-2 py-0.5 rounded-md">
                          RM {sum7d.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                        {list7d.length === 0 ? (
                          <p className="text-slate-400 text-[11px] font-sans italic py-4">
                            Tiada komitmen berjadual dalam tempoh 7 hari akan datang.
                          </p>
                        ) : (
                          list7d.map((item, index) => (
                            <div key={item.id + index} className="flex items-center justify-between text-xs p-2.5 bg-slate-50/50 rounded-lg border border-slate-100 font-sans">
                              <div className="min-w-0 pr-2">
                                <span className="font-semibold text-slate-800 block truncate">{item.obligeeName}</span>
                                <span className="text-[10px] text-slate-405 font-mono">Tarikh: {item.date} • {item.recurrence}</span>
                              </div>
                              <span className="font-mono font-bold text-rose-600">-RM {item.amount.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Next 30 Days Box */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
                      <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                        <div className="flex items-center space-x-2">
                          <div className="bg-emerald-50 p-1.5 rounded-lg border border-emerald-100">
                            <Calendar className="w-4 h-4 text-emerald-500" />
                          </div>
                          <span className="font-display font-semibold text-sm text-slate-950">
                            Seterusnya: 30 Hari Akan Datang
                          </span>
                        </div>
                        <span className="font-mono text-xs font-bold text-slate-800 bg-slate-50 px-2 py-0.5 rounded-md">
                          RM {sum30d.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                        {list30d.length === 0 ? (
                          <p className="text-slate-400 text-[11px] font-sans italic py-4">
                            Tiada komitmen berjadual dalam tempoh 30 hari akan datang.
                          </p>
                        ) : (
                          list30d.map((item, index) => (
                            <div key={item.id + index} className="flex items-center justify-between text-xs p-2.5 bg-slate-50/50 rounded-lg border border-slate-100 font-sans">
                              <div className="min-w-0 pr-2">
                                <span className="font-semibold text-slate-800 block truncate">{item.obligeeName}</span>
                                <span className="text-[10px] text-slate-405 font-mono">Tarikh: {item.date} • {item.recurrence}</span>
                              </div>
                              <span className="font-mono font-bold text-rose-600">-RM {item.amount.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                  </div>
                );
              })()}
            </div>

            {/* Row 4: Recent Financial Activities feed */}
            <div className="space-y-3" id="recent_activities_feed_panel">
              <div className="flex justify-between items-center">
                <h4 className="font-display font-semibold text-base text-slate-900">
                  3. Aktiviti Kewangan Terkini (Recent Financial Activities)
                </h4>
                <span className="text-[10px] font-mono font-bold text-slate-455 px-2.5 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-750 rounded-full">
                  Real-Time Workspace Feed
                </span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white" id="activities_table_wrapper">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-mono text-[10px] uppercase font-semibold tracking-wider">
                        <th className="px-5 py-3">Receipt / Rujukan</th>
                        <th className="px-5 py-3">Jenis Aliran</th>
                        <th className="px-5 py-3">Kategori</th>
                        <th className="px-5 py-3">Tarikh</th>
                        <th className="px-5 py-3">Nama Pihak</th>
                        <th className="px-5 py-3 text-right">Nilai (MYR)</th>
                        <th className="px-5 py-3 text-center">Status Selesai</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {financialEvents.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400 text-xs bg-white font-sans italic">
                            Tiada sebarang operasi rekod kewangan ditemui dalam workspace ini. Gunakan tab menu untuk merekod transaksi baru.
                          </td>
                        </tr>
                      ) : (
                        financialEvents.slice(0, 6).map((event) => {
                          const isIngress = event.type === "INCOME" || event.type === "RECEIVABLE";
                          return (
                            <tr key={event.id} className="hover:bg-slate-50/30 transition-colors font-sans border-b border-slate-100">
                              <td className="px-5 py-3 font-mono font-bold text-slate-550">{event.referenceNumber || "N/A"}</td>
                              <td className="px-5 py-3">
                                {event.type === "INCOME" && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-150 text-[9px] font-bold">
                                    📈 Pendapatan
                                  </span>
                                )}
                                {event.type === "EXPENSE" && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-150 text-[9px] font-bold">
                                    📉 Perbelanjaan
                                  </span>
                                )}
                                {event.type === "RECEIVABLE" && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-150 text-[9px] font-bold">
                                    💰 Aliran Tunai Masuk
                                  </span>
                                )}
                                {event.type === "PAYABLE" && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-50 text-amber-850 border border-amber-200/50 text-[9px] font-bold">
                                    🗓️ Aliran Tunai Keluar
                                  </span>
                                )}
                                {event.type === "DEBT" && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-150 text-[9px] font-bold">
                                    Credit Obligation
                                  </span>
                                )}
                              </td>
                              <td className="px-5 py-3">
                                <span className="font-semibold text-slate-900 block">{event.categoryName}</span>
                                <span className="text-[10px] text-slate-400 block max-w-[200px] truncate" title={event.description}>
                                  {event.description || "—"}
                                </span>
                              </td>
                              <td className="px-5 py-3 font-mono whitespace-nowrap text-slate-550">{event.date}</td>
                              <td className="px-5 py-3 font-medium text-slate-800">{event.partyName}</td>
                              <td className={`px-5 py-3 text-right font-mono font-bold text-sm ${isIngress ? "text-emerald-600" : "text-rose-600"}`}>
                                {isIngress ? "+" : "-"} RM {event.amountMyr.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                              </td>
                              <td className="px-5 py-3 text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                                  event.isCompleted 
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-150" 
                                    : "bg-amber-50 text-amber-700 border border-amber-200"
                                }`}>
                                  {event.isCompleted ? "Selesai" : "Belum Dijelaskan"}
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

          </div>
        )}

        {/* 2. TRANSACTIONS TABLE DISPLAY */}
        {(activeModule === "income" || activeModule === "expense" || activeModule === "receivable" || activeModule === "payable") && (
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs" id="operational_flows_table_wrapper">
            <div className="overflow-x-auto bg-white">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-mono text-[10px] uppercase font-bold">
                    <th className="px-4 py-3">Reference #</th>
                    <th className="px-4 py-3">Category Name</th>
                    <th className="px-4 py-3">Date</th>
                    {(activeModule === "receivable" || activeModule === "payable") && <th className="px-4 py-3">Due Date</th>}
                    <th className="px-4 py-3">Target Party</th>
                    {(activeModule === "income" || activeModule === "expense") && <th className="px-4 py-3">Settlement Route</th>}
                    {(activeModule === "receivable" || activeModule === "payable") && <th className="px-4 py-3 text-center">Settled Status</th>}
                    <th className="px-4 py-3 text-right">Volume (MYR)</th>
                    <th className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {financialEvents
                    .filter(e => e.type === activeModule.toUpperCase())
                    .length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-400 text-xs bg-white">
                        No active operational events indexed in this partition. Click "Add New Entry" to seed or test customized data records!
                      </td>
                    </tr>
                  ) : (
                    financialEvents
                      .filter(e => e.type === activeModule.toUpperCase())
                      .map((event) => {
                        const linkedCash = cashAccounts.find(c => c.id === event.cashAccountId);
                        const linkedBank = bankAccounts.find(b => b.id === event.bankAccountId);
                        return (
                          <tr key={event.id} className="hover:bg-slate-50/50 transition-colors font-sans">
                            <td className="px-4 py-3.5 font-mono font-bold text-slate-500">{event.referenceNumber}</td>
                            <td className="px-4 py-3.5">
                              <span className="font-semibold text-slate-900 block">{event.categoryName}</span>
                              <span className="text-[10px] text-slate-400 block truncate max-w-[200px]" title={event.description}>
                                {event.description || "No descriptions saved."}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 font-mono font-bold whitespace-nowrap">{event.date}</td>
                            {(activeModule === "receivable" || activeModule === "payable") && (
                              <td className="px-4 py-3.5 font-mono font-bold whitespace-nowrap text-amber-600">
                                {event.dueDate || "N/A"}
                              </td>
                            )}
                            <td className="px-4 py-3.5 font-medium text-slate-800">{event.partyName}</td>
                            
                            {/* Settlement Routes column */}
                            {(activeModule === "income" || activeModule === "expense") && (
                              <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap">
                                {linkedCash && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-semibold">
                                    <Wallet className="w-3 h-3 mr-1" /> {linkedCash.name}
                                  </span>
                                )}
                                {linkedBank && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-semibold">
                                    <Building2 className="w-3 h-3 mr-1" /> {linkedBank.bankName} Account
                                  </span>
                                )}
                                {!linkedCash && !linkedBank && <span className="text-slate-400 text-[10px] font-mono italic">Not Linked</span>}
                              </td>
                            )}

                            {/* Receivable / Payable Status toggle */}
                            {(activeModule === "receivable" || activeModule === "payable") && (
                              <td className="px-4 py-3.5 text-center">
                                <button
                                  onClick={() => editFinancialEvent(event.id, { isCompleted: !event.isCompleted })}
                                  className={`px-2 py-1 rounded text-[10px] font-semibold cursor-pointer uppercase transition ${
                                    event.isCompleted 
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-250" 
                                      : "bg-red-50 text-red-700 border border-red-250"
                                  }`}
                                  title="Toggle Claim Settled Status"
                                >
                                  {event.isCompleted ? "Fully Settled" : "Outstanding Claims"}
                                </button>
                              </td>
                            )}

                            <td className={`px-4 py-3.5 text-right font-mono font-bold whitespace-nowrap text-sm ${
                              activeModule === "income" || activeModule === "receivable" ? "text-emerald-600" : "text-rose-600"
                            }`}>
                              {activeModule === "income" || activeModule === "receivable" ? "+" : "-"} RM {event.amountMyr.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                            </td>

                            <td className="px-4 py-3.5 text-center">
                              {hasPermission("Financial Records", "delete") ? (
                                <button
                                  onClick={() => deleteFinancialEvent(event.id)}
                                  className="p-1 px-1.5 text-red-600 hover:bg-red-50 hover:border-red-200 rounded transition cursor-pointer"
                                  title="Delete Operational Record"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              ) : (
                                <span className="text-slate-350 font-mono text-[9px] uppercase font-bold tracking-tight inline-flex items-center">
                                  LOCKED
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. CASH ACCOUNT MANAGEMENT */}
        {activeModule === "cash" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" id="cash_holding_drawers_deck">
            {cashAccounts.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200 col-span-2">
                No local cash holding drawers registered. Use "Add New Entry" to configure localized safes or cash floats!
              </div>
            ) : (
              cashAccounts.map((account) => (
                <div key={account.id} className="border border-slate-200 hover:border-slate-300 rounded-xl p-5 bg-white space-y-4 shadow-xs transition" id={`cash_card_${account.id}`}>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center space-x-2">
                      <div className="p-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg">
                        <Wallet className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-950 font-sans">{account.name}</h4>
                        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-tight block">PIC: {account.responsiblePerson}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteCashAccount(account.id)}
                      className="p-1 text-slate-400 hover:text-red-600 rounded transition cursor-pointer"
                      title="Decommission Cash Floating Drawer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex justify-between items-end border-t border-slate-100 pt-3">
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">Tally Floating Balance</span>
                    <span className="text-xl font-mono font-bold text-slate-900">
                      RM {account.currentBalanceMyr.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* 4. BANK ACCOUNT MANAGEMENT */}
        {activeModule === "bank" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" id="bank_depositories_deck">
            {bankAccounts.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200 col-span-2">
                No licensed depositories allocated. Bind dynamic enterprise checking vaults instantly!
              </div>
            ) : (
              bankAccounts.map((account) => (
                <div key={account.id} className="border border-slate-200 hover:border-slate-300 rounded-xl p-5 bg-white space-y-4 shadow-xs transition animate-fade-in" id={`bank_card_${account.id}`}>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center space-x-2.5">
                      <div className="p-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-950 font-sans">{account.bankName}</h4>
                        <span className="text-[10px] font-mono text-slate-400 block font-semibold">{account.accountNumber}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteBankAccount(account.id)}
                      className="p-1 text-slate-400 hover:text-red-600 rounded transition cursor-pointer"
                      title="Decommission Depository Vault"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-1 text-xs font-sans text-slate-600">
                    <p className="flex justify-between"><span>Account Name:</span> <span className="font-semibold text-slate-800">{account.accountName}</span></p>
                    <p className="flex justify-between"><span>Clearing Branch:</span> <span className="text-slate-500">{account.branchName}</span></p>
                  </div>

                  <div className="flex justify-between items-end border-t border-slate-100 pt-3">
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">Available Vault Balance</span>
                    <span className="text-sm md:text-lg font-mono font-bold text-slate-900">
                      RM {account.currentBalanceMyr.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* 5. DEBT RECORDS MANAGEMENT */}
        {activeModule === "debt" && (
          <div className="space-y-4" id="obligations_claims_management">
            {debtRecords.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-slate-200">
                No active lending facilities mapped under this workspace partition. Add custom credit arrays to inspect downflow.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {debtRecords.map((debt) => {
                  const outstandingAmountMyr = debt.totalAmountMyr - debt.repaidAmountMyr;
                  const isFullyRepaid = outstandingAmountMyr <= 0 || debt.status === "FULLY_REPAID";
                  return (
                    <div key={debt.id} className="border border-slate-200 rounded-xl p-5 bg-white shadow-xs space-y-4" id={`debt_card_${debt.id}`}>
                      <div className="flex justify-between items-baseline">
                        <div>
                          <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                            CREDITOR OBLIGATION
                          </span>
                          <h4 className="font-semibold text-slate-950 font-sans text-sm mt-1">{debt.creditorName}</h4>
                        </div>
                        <button
                          onClick={() => deleteDebtRecord(debt.id)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded transition cursor-pointer"
                          title="Filing Close and Delete Obligation"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="text-xs space-y-1.5 font-sans text-slate-600">
                        <p className="flex justify-between"><span>Issuance Date:</span> <span className="font-mono text-slate-800">{debt.borrowedDate}</span></p>
                        {debt.repaymentDueDate && (
                          <p className="flex justify-between text-rose-600"><span>Maturity Deadline:</span> <span className="font-mono font-bold">{debt.repaymentDueDate}</span></p>
                        )}
                        {debt.interestRateAnnualPercent !== undefined && (
                          <p className="flex justify-between text-slate-600">
                            <span>Sponsor Annual Interest:</span> 
                            <span className="font-mono font-semibold flex items-center"><Percent className="w-3 h-3 mr-1 text-slate-400" /> {debt.interestRateAnnualPercent}%</span>
                          </p>
                        )}
                        <p className="flex justify-between font-mono bg-slate-50 rounded p-1.5 mt-2 border border-slate-150 text-[10px] uppercase font-bold text-slate-400 leading-tight">
                          <span>Description:</span> 
                          <span className="font-sans normal-case text-slate-600 font-medium truncate max-w-[200px]" title={debt.description}>
                            {debt.description || "No specific details logged."}
                          </span>
                        </p>
                      </div>

                      <div className="border-t border-slate-100 pt-3 space-y-3">
                        <div className="flex items-center justify-between text-xs font-sans">
                          <span className="text-slate-500 font-bold">Lending repayments timeline progress:</span>
                          <span className="font-semibold text-slate-900">
                            RM {debt.repaidAmountMyr.toLocaleString()} / RM {debt.totalAmountMyr.toLocaleString()} (MYR Basis)
                          </span>
                        </div>
                        {/* Interactive repayment quick loader */}
                        {!isFullyRepaid && (
                          <button
                            onClick={() => {
                              const extra = parseFloat(prompt("Enter settlement amount in RM:") || "0");
                              if (!isNaN(extra) && extra > 0) {
                                const newRepaid = Math.min(debt.totalAmountMyr, debt.repaidAmountMyr + extra);
                                editDebtRecord(debt.id, { 
                                  repaidAmountMyr: newRepaid,
                                  status: newRepaid >= debt.totalAmountMyr ? "FULLY_REPAID" : "ACTIVE"
                                });
                              }
                            }}
                            className="bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-1 rounded inline-flex items-center transition cursor-pointer"
                          >
                            <Calendar className="w-3 h-3 mr-1 text-indigo-500" /> Inject Settling Installment Pay
                          </button>
                        )}
                        
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div 
                            className="bg-emerald-500 h-full transition-all duration-300" 
                            style={{ width: `${Math.min(100, (debt.repaidAmountMyr / debt.totalAmountMyr) * 100)}%` }}
                          />
                        </div>

                        <div className="flex justify-between items-baseline">
                          <span className="text-[10px] font-mono text-slate-400 font-bold">REMAINING OBLIGATION:</span>
                          <span className={`text-sm font-mono font-bold ${isFullyRepaid ? "text-emerald-600 font-sans uppercase font-bold" : "text-rose-600"}`}>
                            {isFullyRepaid ? "● Fully Settled (REPAID)" : `RM ${outstandingAmountMyr.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeModule === "reports" && (
          <FinancialReportsAnalytics />
        )}

        {activeModule === "storage" && (
          <StorageSettingsConsole />
        )}

        {activeModule === "notifications" && (
          <NotificationCenterConsole />
        )}

        {activeModule === "backup" && (
          <MyKeraniBackupRecovery />
        )}

        {activeModule === "commitments" && (
          <FinancialCommitmentsManager />
        )}

        {activeModule === "forecast" && (
          <CashflowForecastEngine />
        )}

        {activeModule === "evidence" && (
          <FinancialEvidencePackageManager />
        )}

        {activeModule === "ocr" && (
          <OCREngineConsole />
        )}
        
        {activeModule === "ai_assistant" && (
          <AIFinancialAssistant />
        )}

        {activeModule === "permissions" && (
          <PermissionSettingsConsole />
        )}

        {activeModule === "audit" && (
          <AuditConsole />
        )}
            </>
          );
        })()}
      </div>
    </div>
  );
};
