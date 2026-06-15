import React, { useState, useMemo } from "react";
import { useFinancials } from "../context/FinancialRecordsContext";
import { type FinancialCommitment } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { 
  Plus, 
  Trash2, 
  Edit3, 
  Calendar as CalendarIcon, 
  Check, 
  X, 
  FileText, 
  AlertCircle, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight,
  TrendingDown,
  Clock,
  Briefcase,
  AlertTriangle,
  Play,
  Pause
} from "lucide-react";

export const FinancialCommitmentsManager: React.FC = () => {
  const { 
    financialCommitments, 
    addFinancialCommitment, 
    editFinancialCommitment, 
    deleteFinancialCommitment,
    loading
  } = useFinancials();

  // Calendar State
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | null>(new Date());

  // Search, Status, and Category filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "PAUSED" | "COMPLETED" | "PENDING">("ALL");
  const [freqFilter, setFreqFilter] = useState<"ALL" | "DAILY" | "WEEKLY" | "MONTHLY" | "ONE-TIME">("ALL");

  // Form Management
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCommitment, setEditingCommitment] = useState<FinancialCommitment | null>(null);

  // Form states
  const [obligeeName, setObligeeName] = useState("");
  const [contractNumber, setContractNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [freq, setFreq] = useState<"DAILY" | "WEEKLY" | "MONTHLY" | "ONE-TIME">("MONTHLY");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "COMPLETED" | "PAUSED" | "PENDING">("ACTIVE");
  const [description, setDescription] = useState(""); // Notes

  // Calendar Month helpers
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  const handleOpenCreateForm = (targetDate?: string) => {
    setEditingCommitment(null);
    setObligeeName("");
    setContractNumber("");
    setAmount("");
    setFreq("MONTHLY");
    setStartDate(targetDate || new Date().toISOString().split("T")[0]);
    setEndDate("");
    setStatus("ACTIVE");
    setDescription("");
    setIsFormOpen(true);
  };

  const handleOpenEditForm = (commitment: FinancialCommitment) => {
    setEditingCommitment(commitment);
    setObligeeName(commitment.obligeeName);
    setContractNumber(commitment.contractNumber || "");
    setAmount(commitment.amountPerIntervalMyr.toString());
    setFreq(commitment.recurrence === "DAILY" || commitment.recurrence === "WEEKLY" || commitment.recurrence === "MONTHLY" || commitment.recurrence === "ONE-TIME" ? commitment.recurrence : "MONTHLY");
    setStartDate(commitment.startDate);
    setEndDate(commitment.endDate || "");
    setStatus(commitment.status);
    setDescription(commitment.description);
    setIsFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!obligeeName || !amount || !startDate) {
      alert("Please fill in all required fields.");
      return;
    }

    const commitmentPayload = {
      description,
      contractNumber: contractNumber || undefined,
      obligeeName,
      amountPerIntervalMyr: parseFloat(amount),
      recurrence: freq,
      startDate,
      endDate: endDate || undefined,
      isActive: status === "ACTIVE" || status === "PENDING",
      status
    };

    if (editingCommitment) {
      editFinancialCommitment(editingCommitment.id, commitmentPayload);
    } else {
      addFinancialCommitment(commitmentPayload);
    }

    setIsFormOpen(false);
    setEditingCommitment(null);
  };

  const toggleActiveStatus = (commitment: FinancialCommitment) => {
    if (commitment.status === "ACTIVE") {
      editFinancialCommitment(commitment.id, { status: "PAUSED", isActive: false });
    } else {
      editFinancialCommitment(commitment.id, { status: "ACTIVE", isActive: true });
    }
  };

  // Determine recurrence alignment on a calendar date
  const isCommitmentOnDate = (commitment: FinancialCommitment, dateVal: Date): boolean => {
    const compStart = new Date(commitment.startDate);
    compStart.setHours(0, 0, 0, 0);

    const checkDate = new Date(dateVal);
    checkDate.setHours(0, 0, 0, 0);

    // Cannot happen before original contract start date
    if (checkDate < compStart) return false;

    // Cannot happen after contract end date if exists
    if (commitment.endDate) {
      const compEnd = new Date(commitment.endDate);
      compEnd.setHours(0, 0, 0, 0);
      if (checkDate > compEnd) return false;
    }

    // Status-based execution limits
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

    return false;
  };

  // Filtered Commitments
  const filteredCommitments = useMemo(() => {
    return financialCommitments.filter(c => {
      const query = searchQuery.toLowerCase();
      const matchesSearch = 
        c.obligeeName.toLowerCase().includes(query) ||
        (c.contractNumber && c.contractNumber.toLowerCase().includes(query)) ||
        c.description.toLowerCase().includes(query);
      
      const matchesStatus = statusFilter === "ALL" || c.status === statusFilter;
      const matchesFreq = freqFilter === "ALL" || c.recurrence === freqFilter;

      return matchesSearch && matchesStatus && matchesFreq;
    });
  }, [financialCommitments, searchQuery, statusFilter, freqFilter]);

  // Aggregate stats of ACTIVE commitments
  const { totalActiveCount, monthlyProjectedOutflow, upcomingSevenDaysCount, upcomingSevenDaysTotal } = useMemo(() => {
    let activeCount = 0;
    let projectedOutflow = 0;
    let nextSevenCount = 0;
    let nextSevenTotal = 0;

    const todayLocal = new Date();
    todayLocal.setHours(0, 0, 0, 0);

    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(todayLocal.getDate() + 7);
    sevenDaysLater.setHours(23, 59, 59, 999);

    financialCommitments.forEach(c => {
      if (c.status !== "ACTIVE" && c.status !== "PENDING") return;
      activeCount++;

      // Monthly outflow projection
      if (c.recurrence === "MONTHLY") {
        projectedOutflow += c.amountPerIntervalMyr;
      } else if (c.recurrence === "WEEKLY") {
        projectedOutflow += c.amountPerIntervalMyr * 4.33; // ~4.33 weeks per month
      } else if (c.recurrence === "DAILY") {
        projectedOutflow += c.amountPerIntervalMyr * 30.4;  // ~30.4 days per month
      } else if (c.recurrence === "ONE-TIME") {
        // Only include if one-time falls within current calendar month
        const cDate = new Date(c.startDate);
        if (cDate.getMonth() === currentMonth && cDate.getFullYear() === currentYear) {
          projectedOutflow += c.amountPerIntervalMyr;
        }
      }

      // Check date matches in next 7 days
      for (let offset = 0; offset <= 7; offset++) {
        const testDate = new Date(todayLocal);
        testDate.setDate(todayLocal.getDate() + offset);
        if (isCommitmentOnDate(c, testDate)) {
          nextSevenCount++;
          nextSevenTotal += c.amountPerIntervalMyr;
          break; // Avoid double counting if daily/etc.
        }
      }
    });

    return {
      totalActiveCount: activeCount,
      monthlyProjectedOutflow: Math.round(projectedOutflow * 100) / 100,
      upcomingSevenDaysCount: nextSevenCount,
      upcomingSevenDaysTotal: Math.round(nextSevenTotal * 100) / 100
    };
  }, [financialCommitments, currentMonth, currentYear]);

  // Calendar Day generation
  const calendarDays = useMemo(() => {
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay(); // Sunday=0, Monday=1...

    const list: { dayNum: number | null; date: Date | null; commitments: FinancialCommitment[] }[] = [];

    // Pad original slots
    for (let i = 0; i < firstDayIndex; i++) {
      list.push({ dayNum: null, date: null, commitments: [] });
    }

    // Days slots
    for (let d = 1; d <= daysInMonth; d++) {
      const targetDayDate = new Date(currentYear, currentMonth, d);
      const activeCmts = financialCommitments.filter(c => isCommitmentOnDate(c, targetDayDate));
      list.push({
        dayNum: d,
        date: targetDayDate,
        commitments: activeCmts
      });
    }

    return list;
  }, [currentYear, currentMonth, financialCommitments]);

  const selectedCalendarCommitments = useMemo(() => {
    if (!selectedCalendarDate) return [];
    return financialCommitments.filter(c => isCommitmentOnDate(c, selectedCalendarDate));
  }, [selectedCalendarDate, financialCommitments]);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const getUrgencyColor = (statusVal: string) => {
    switch (statusVal) {
      case "ACTIVE": return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "PAUSED": return "bg-slate-100 text-slate-600 border-slate-200";
      case "COMPLETED": return "bg-blue-50 text-blue-700 border-blue-200";
      case "PENDING": return "bg-amber-50 text-amber-700 border-amber-200";
      default: return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  return (
    <div className="space-y-6" id="commitments_module_root">
      
      {/* 1. COMPACT METRICS AND KPI PANEL */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4" id="commitments_kpis">
        <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex items-center space-x-3.5">
          <div className="bg-indigo-100 p-2.5 rounded-lg text-indigo-600">
            <Briefcase className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Active Commitments</p>
            <p className="text-xl font-semibold text-slate-900 mt-0.5">{totalActiveCount}</p>
          </div>
        </div>
        
        <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex items-center space-x-3.5">
          <div className="bg-rose-100 p-2.5 rounded-lg text-rose-600">
            <TrendingDown className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Projected Outflow (Est)</p>
            <p className="text-xl font-semibold text-rose-600 mt-0.5">RM {monthlyProjectedOutflow.toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex items-center space-x-3.5">
          <div className="bg-amber-100 p-2.5 rounded-lg text-amber-600">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Due Next 7 Days</p>
            <p className="text-xl font-semibold text-slate-900 mt-0.5">{upcomingSevenDaysCount} obligations</p>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex items-center space-x-3.5">
          <div className="bg-stone-100 p-2.5 rounded-lg text-stone-600">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">7-Day Due Volume</p>
            <p className="text-xl font-semibold text-slate-900 mt-0.5">RM {upcomingSevenDaysTotal.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* 2. DYNAMIC LAYOUT: CALENDAR VIEW + UPCOMING LIST SIDE-BY-SIDE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="commitments_calendar_section">
        
        {/* CALENDAR COLUMN (SPAN 7) */}
        <div className="lg:col-span-7 bg-white border border-slate-100 rounded-xl p-4 md:p-5" id="commitment_calendar_grid">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-display font-semibold text-sm text-slate-900 flex items-center">
              <CalendarIcon className="w-4 h-4 mr-2 text-indigo-500" />
              Commitment Calendar
            </h4>
            <div className="flex items-center space-x-1 bg-slate-50 border border-slate-150 rounded-lg p-1">
              <button 
                onClick={handlePrevMonth}
                className="p-1 hover:bg-white rounded-md text-slate-600 hover:text-slate-900 transition cursor-pointer"
                title="Previous Month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-semibold px-2 text-slate-700 min-w-[100px] text-center font-mono select-none">
                {monthNames[currentMonth]} {currentYear}
              </span>
              <button 
                onClick={handleNextMonth}
                className="p-1 hover:bg-white rounded-md text-slate-600 hover:text-slate-900 transition cursor-pointer"
                title="Next Month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* CALENDAR ROW LABELS */}
          <div className="grid grid-cols-7 gap-1 text-center font-mono text-[10px] text-slate-500 uppercase tracking-widest border-b border-slate-100 pb-2">
            <div>Sun</div>
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
          </div>

          {/* DAYS BLOCKS */}
          <div className="grid grid-cols-7 gap-1 mt-1">
            {calendarDays.map((day, idx) => {
              const isSelected = selectedCalendarDate && day.date && 
                day.date.getDate() === selectedCalendarDate.getDate() && 
                day.date.getMonth() === selectedCalendarDate.getMonth() && 
                day.date.getFullYear() === selectedCalendarDate.getFullYear();

              const containsActive = day.commitments.length > 0;

              return (
                <div key={idx} className="relative min-h-[50px] md:min-h-[60px] flex flex-col justify-between">
                  {day.dayNum !== null ? (
                    <button
                      onClick={() => {
                        if (day.date) setSelectedCalendarDate(day.date);
                      }}
                      className={`w-full h-full p-1.5 rounded-lg flex flex-col justify-between text-left transition select-none cursor-pointer ${
                        isSelected 
                          ? "bg-indigo-600 text-white shadow-xs" 
                          : containsActive 
                          ? "bg-slate-50 hover:bg-slate-100 text-slate-800 border border-indigo-100" 
                          : "hover:bg-slate-50 text-slate-700 border border-slate-100/40"
                      }`}
                    >
                      <span className="text-xs font-mono font-medium">{day.dayNum}</span>
                      {containsActive && (
                        <div className="flex flex-wrap gap-1 mt-1 max-w-full">
                          {day.commitments.slice(0, 3).map((cmt, cIdx) => (
                            <span 
                              key={cIdx} 
                              className={`w-1.5 h-1.5 rounded-full ${
                                isSelected ? "bg-white" : "bg-indigo-500"
                              }`} 
                              title={`${cmt.obligeeName}: RM ${cmt.amountPerIntervalMyr}`}
                            />
                          ))}
                          {day.commitments.length > 3 && (
                            <span className={`text-[8px] font-mono leading-none ${isSelected ? "text-indigo-150" : "text-indigo-600 font-bold"}`}>
                              +{day.commitments.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  ) : (
                    <div className="w-full h-full bg-slate-50/10 rounded-lg" />
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 font-mono border-t border-slate-100 pt-3">
            <span className="flex items-center">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 mr-1.5 inline-block" />
              Active Commitment Date
            </span>
            <button 
              onClick={() => {
                const dateStr = selectedCalendarDate?.toISOString().split("T")[0];
                handleOpenCreateForm(dateStr);
              }}
              className="text-xs font-sans font-semibold text-indigo-600 hover:text-indigo-700 flex items-center transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Contract on Selected Date
            </button>
          </div>
        </div>

        {/* SELECTED DATE DETAILS SIDEBAR (SPAN 5) */}
        <div className="lg:col-span-5 bg-white border border-slate-100 rounded-xl p-4 md:p-5 flex flex-col justify-between" id="commitment_selected_details">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
              <h4 className="font-display font-semibold text-sm text-slate-800 flex items-center">
                <Clock className="w-4 h-4 mr-2 text-indigo-500" />
                Due on Selected Date
              </h4>
              <span className="text-xs font-mono font-bold bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-md">
                {selectedCalendarDate ? selectedCalendarDate.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" }) : "None selected"}
              </span>
            </div>

            <div className="space-y-3 max-h-[290px] overflow-y-auto pr-1" id="selected_date_commitments_scroller">
              {selectedCalendarCommitments.length === 0 ? (
                <div className="p-6 text-center border-2 border-dashed border-slate-100 rounded-lg text-slate-400">
                  <CalendarIcon className="w-8 h-8 mx-auto stroke-[1.5] mb-2 text-slate-300" />
                  <p className="text-xs font-sans">No recurring payment outlays fall on this specific calendar day.</p>
                </div>
              ) : (
                selectedCalendarCommitments.map(cmt => (
                  <div 
                    key={cmt.id} 
                    className="p-3 border border-slate-100 rounded-lg hover:border-slate-200 transition flex items-center justify-between"
                  >
                    <div className="space-y-0.5 min-w-0 pr-2">
                      <p className="text-xs font-semibold text-slate-950 truncate">{cmt.obligeeName}</p>
                      <p className="text-[10px] text-slate-500 truncate">{cmt.description || "No Notes Added"}</p>
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] font-mono font-bold text-rose-500">RM {cmt.amountPerIntervalMyr.toLocaleString()}</span>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 bg-indigo-50 text-indigo-700 rounded capitalize">{cmt.recurrence.toLowerCase()}</span>
                      </div>
                    </div>
                    <div className="flex space-x-1 flex-shrink-0">
                      <button 
                        onClick={() => handleOpenEditForm(cmt)}
                        className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 transition"
                        title="Edit Commitment"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => deleteFinancialCommitment(cmt.id)}
                        className="p-1 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600 transition"
                        title="Delete Commitment Contract"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 border-t border-slate-100 pt-3">
            <button 
              onClick={() => handleOpenCreateForm()}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center justify-center transition cursor-pointer"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Add New Commitment Contract
            </button>
          </div>
        </div>
      </div>

      {/* 3. LIST VIEW TABLE WITH FILTERS & RECURRENCE MANAGER */}
      <div className="bg-white border border-slate-100 rounded-xl p-4 md:p-5" id="commitment_register_table">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
          <h4 className="font-display font-semibold text-sm text-slate-900 flex items-center">
            <FileText className="w-4 h-4 mr-2 text-indigo-500" />
            Financial Commitments Register
          </h4>
          
          <div className="flex flex-wrap items-center gap-2">
            <input 
              type="text" 
              placeholder="Filter by Obligee/Contract/Notes..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-hidden focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 min-w-[180px] font-sans"
            />
            
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-hidden focus:bg-white text-slate-700"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Obligations</option>
              <option value="PAUSED">Paused Agreements</option>
              <option value="COMPLETED">Completed/Perpetual</option>
              <option value="PENDING">Pending Setup</option>
            </select>

            <select
              value={freqFilter}
              onChange={e => setFreqFilter(e.target.value as any)}
              className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-hidden focus:bg-white text-slate-700"
            >
              <option value="ALL">All Frequencies</option>
              <option value="DAILY">Daily outlays</option>
              <option value="WEEKLY">Weekly billing</option>
              <option value="MONTHLY">Monthly contracts</option>
              <option value="ONE-TIME">One-time provisions</option>
            </select>
          </div>
        </div>

        {/* REGISTRATION DATAGRID */}
        <div className="overflow-x-auto" id="commitments_register_scroller">
          {filteredCommitments.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <AlertTriangle className="w-8 h-8 mx-auto stroke-[1.5] mb-2 text-slate-350" />
              <p className="text-xs font-sans font-medium">No commitments match the selected status / frequency criteria.</p>
              <button 
                onClick={() => { setSearchQuery(""); setStatusFilter("ALL"); setFreqFilter("ALL"); }}
                className="mt-2 text-xs font-sans text-indigo-600 hover:underline"
              >
                Clear all active search filters
              </button>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-mono uppercase tracking-widest text-slate-500">
                  <th className="py-3 px-2 font-mono">Obligee (Vendor Name)</th>
                  <th className="py-3 px-2 font-mono">Reference/License Contract</th>
                  <th className="py-3 px-2 font-mono">Recurrence Frequency</th>
                  <th className="py-3 px-2 font-mono">Due/Start Date</th>
                  <th className="py-3 px-2 font-mono text-right">Commitment Amount (Est)</th>
                  <th className="py-3 px-2 font-thin text-center">Status Tracking</th>
                  <th className="py-3 px-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCommitments.map(cmt => (
                  <tr key={cmt.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition text-slate-800">
                    <td className="py-3 px-2">
                      <div className="font-sans font-semibold text-xs text-slate-900">{cmt.obligeeName}</div>
                      <div className="text-[10px] text-slate-400 truncate max-w-[200px]" title={cmt.description}>{cmt.description || "No notes appended."}</div>
                    </td>
                    <td className="py-3 px-2 font-mono text-[11px] text-slate-600">
                      {cmt.contractNumber || "—"}
                    </td>
                    <td className="py-3 px-2">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full font-mono bg-slate-100 text-slate-800 uppercase">
                        {cmt.recurrence}
                      </span>
                    </td>
                    <td className="py-3 px-2 font-mono text-[11px] text-slate-600">
                      <div>{cmt.startDate}</div>
                      {cmt.endDate && <div className="text-[9px] text-slate-400 italic">to {cmt.endDate}</div>}
                    </td>
                    <td className="py-3 px-2 text-right font-mono text-xs font-bold text-rose-600">
                      RM {cmt.amountPerIntervalMyr.toLocaleString()}
                    </td>
                    <td className="py-3 px-2 text-center">
                      <span className={`inline-block text-[10px] font-sans font-semibold px-2.5 py-0.5 rounded-md border ${getUrgencyColor(cmt.status)}`}>
                        {cmt.status}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right">
                      <div className="flex items-center justify-end space-x-1">
                        <button 
                          onClick={() => toggleActiveStatus(cmt)}
                          className={`p-1.5 rounded transition ${
                            cmt.status === "ACTIVE" 
                              ? "hover:bg-amber-50 text-amber-600" 
                              : "hover:bg-emerald-50 text-emerald-600"
                          }`}
                          title={cmt.status === "ACTIVE" ? "Pause Commitment Contract" : "Resume Commitment Contract"}
                        >
                          {cmt.status === "ACTIVE" ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        </button>
                        <button 
                          onClick={() => handleOpenEditForm(cmt)}
                          className="p-1.5 hover:bg-slate-100 rounded text-slate-600 transition"
                          title="Edit Obligation parameters"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => deleteFinancialCommitment(cmt.id)}
                          className="p-1.5 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600 transition"
                          title="Delete Agreement"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 4. MODAL DRAWER SLIDE OVER (CREATION & EDITING) */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center z-50 p-4" id="commitment_form_modal_overlay">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xl w-full max-w-lg space-y-4"
              id="commitment_form_modal_container"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h4 className="font-display font-semibold text-slate-900 text-sm flex items-center">
                  <CalendarIcon className="w-4 h-4 mr-2 text-indigo-600 animate-pulse" />
                  {editingCommitment ? "Modifying Commitment Contract Parameters" : "Add Recurring Commitment Ledger"}
                </h4>
                <button 
                  onClick={() => setIsFormOpen(false)}
                  className="p-1 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-slate-700 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 text-xs font-sans">
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-slate-600 font-medium">Obligee (Entity to pay) <span className="text-rose-500">*</span></label>
                    <input 
                      type="text" 
                      placeholder="e.g. Tenaga Nasional Bhd, Rent Corp"
                      value={obligeeName}
                      onChange={e => setObligeeName(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-hidden focus:ring-1 focus:ring-indigo-500 font-sans"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-slate-600 font-medium">Contract / Reference Number</label>
                    <input 
                      type="text" 
                      placeholder="e.g. LSE-APT-901B"
                      value={contractNumber}
                      onChange={e => setContractNumber(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-hidden focus:ring-1 focus:ring-indigo-500 font-sans"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-slate-600 font-medium">Commitment Outlay (MYR) <span className="text-rose-500">*</span></label>
                    <input 
                      type="number" 
                      step="0.01" 
                      min="0.01"
                      placeholder="0.00"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-hidden focus:ring-1 focus:ring-indigo-500 font-mono font-bold"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-slate-600 font-medium">Frequency (Project Recurrence) <span className="text-rose-500">*</span></label>
                    <select
                      value={freq}
                      onChange={e => setFreq(e.target.value as any)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-hidden focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-slate-700"
                    >
                      <option value="DAILY">Daily loop outlays</option>
                      <option value="WEEKLY">Weekly supply billing</option>
                      <option value="MONTHLY">Monthly service rental contracts</option>
                      <option value="ONE-TIME">One-time contractual outlays</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-slate-600 font-medium">Due Date / Start Date <span className="text-rose-500">*</span></label>
                    <input 
                      type="date" 
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-hidden focus:ring-1 focus:ring-indigo-500 font-mono"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-slate-600 font-medium">End Date (Optional)</label>
                    <input 
                      type="date" 
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-hidden focus:ring-1 focus:ring-indigo-500 font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-600 font-medium">Agreement Tracking Status <span className="text-rose-500">*</span></label>
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-hidden focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-slate-700"
                  >
                    <option value="ACTIVE">ACTIVE — Outstanding regular obligation</option>
                    <option value="PAUSED">PAUSED — Agreement currently on hold/not active</option>
                    <option value="COMPLETED">COMPLETED — Perpetual/Contract fully satisfied</option>
                    <option value="PENDING">PENDING — Prepared/waiting setup details</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-600 font-medium">Notes & Commitment Descriptions</label>
                  <textarea 
                    placeholder="Provide specific notes regarding terms, grace periods, payment details, contact persons, etc."
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-hidden focus:ring-1 focus:ring-indigo-500 font-sans"
                  />
                </div>

                <div className="flex items-center justify-end space-x-2 border-t border-slate-100 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold transition cursor-pointer"
                  >
                    Cancel Action
                  </button>
                  <button 
                    type="submit"
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold transition flex items-center cursor-pointer"
                  >
                    <Check className="w-4 h-4 mr-1.5" />
                    {editingCommitment ? "Uphold Modification" : "Engage Commitment"}
                  </button>
                </div>

              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
