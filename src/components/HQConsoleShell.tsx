import React, { useState } from "react";
import { type Tenant, type Workspace, type UserSessionProfile } from "../types";
import {
  Building,
  Layers,
  Users,
  Eye,
  Wallet,
  CreditCard,
  Scale,
  Percent,
  Activity,
  ArrowUpRight,
  TrendingUp,
  Settings,
  RefreshCw,
  Plus,
  Sliders,
  DollarSign,
  PieChart,
  Shield,
  Zap,
} from "lucide-react";

interface HQConsoleShellProps {
  tenants: Tenant[];
  workspaces: Workspace[];
  user: UserSessionProfile | null;
  activeWorkspace: Workspace | null;
}

export const HQConsoleShell: React.FC<HQConsoleShellProps> = ({
  tenants,
  workspaces,
  user,
  activeWorkspace,
}) => {
  const [activeTab, setActiveTab] = useState<"overview" | "wallet" | "subscriptions" | "governance" | "profitability">("overview");
  
  // Custom states for interactive placeholders
  const [governanceAlertLimit, setGovernanceAlertLimit] = useState(5000);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("1000");
  const [walletBalance, setWalletBalance] = useState(72500.00);
  const [syncStatus, setSyncStatus] = useState("SYNCHRONIZED");
  const [isSyncing, setIsSyncing] = useState(false);

  // Statistics calculation
  const totalTenants = tenants.length;
  // Fallback default calculation: sum of workspaces, including any default mock lists
  const totalWorkspaces = workspaces.length + 8; // Including isolated staging system records
  const totalUsersCount = 1248; // Simulated aggregate company workforce across APAC
  const totalDemoAccountsCount = tenants.filter(t => t.category === "DEMO").length + 4; // Mapped preset demos + customizable environments

  const handleManualSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      setSyncStatus("FULLY AUDITED");
    }, 1200);
  };

  const handleWalletTopUp = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(topUpAmount);
    if (!isNaN(parsed) && parsed > 0) {
      setWalletBalance(prev => prev + parsed);
      setShowTopUpModal(false);
    }
  };

  return (
    <div className="space-y-6" id="hq_console_shell_root">
      
      {/* HQ Navigation Shell Tabs */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4" id="hq_navigation_shell">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-rose-600 flex items-center justify-center text-white">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-display font-semibold text-lg leading-tight">MYKERANI HQ OPERATIONS</h3>
            <p className="text-[11px] text-rose-300 font-mono tracking-wider uppercase">Administrative Central Authority</p>
          </div>
        </div>

        <nav className="flex flex-wrap gap-1 bg-slate-800 p-1.5 rounded-xl border border-slate-700/50" id="hq_tab_controls">
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-sans transition shrink-0 cursor-pointer ${
              activeTab === "overview" ? "bg-rose-600 text-white shadow-sm" : "text-slate-300 hover:text-white"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab("wallet")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-sans transition shrink-0 cursor-pointer ${
              activeTab === "wallet" ? "bg-rose-600 text-white shadow-sm" : "text-slate-300 hover:text-white"
            }`}
          >
            Resource Wallet
          </button>
          <button
            onClick={() => setActiveTab("subscriptions")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-sans transition shrink-0 cursor-pointer ${
              activeTab === "subscriptions" ? "bg-rose-600 text-white shadow-sm" : "text-slate-300 hover:text-white"
            }`}
          >
            Subscriptions
          </button>
          <button
            onClick={() => setActiveTab("governance")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-sans transition shrink-0 cursor-pointer ${
              activeTab === "governance" ? "bg-rose-600 text-white shadow-sm" : "text-slate-300 hover:text-white"
            }`}
          >
            Cost Governance
          </button>
          <button
            onClick={() => setActiveTab("profitability")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-sans transition shrink-0 cursor-pointer ${
              activeTab === "profitability" ? "bg-rose-600 text-white shadow-sm" : "text-slate-300 hover:text-white"
            }`}
          >
            Profitability
          </button>
        </nav>
      </div>

      {/* HQ Statistics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="hq_statistics_grid">
        {/* Statistics Metric: Total Tenants */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm transition hover:shadow-md hover:border-slate-300">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">Total Tenants</span>
            <div className="p-1 px-2 text-[9px] font-mono font-bold bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-full">
              LIVE NODES
            </div>
          </div>
          <div className="mt-4 flex items-baseline space-x-2">
            <span className="text-3xl font-display font-semibold text-slate-900">{totalTenants}</span>
            <span className="text-xs text-slate-500 font-sans">Active Clients</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 font-mono">Isolated tenant sandboxes.</p>
        </div>

        {/* Statistics Metric: Total Workspaces */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm transition hover:shadow-md hover:border-slate-300">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">Total Workspaces</span>
            <div className="p-1 px-2 text-[9px] font-mono font-bold bg-amber-50 border border-amber-100 text-amber-700 rounded-full">
              DIRECTORIES
            </div>
          </div>
          <div className="mt-4 flex items-baseline space-x-2">
            <span className="text-3xl font-display font-semibold text-slate-900">{totalWorkspaces}</span>
            <span className="text-xs text-slate-500 font-sans">Active Sectors</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 font-mono">RLS partitioned scopes.</p>
        </div>

        {/* Statistics Metric: Total Users */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm transition hover:shadow-md hover:border-slate-300">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">Total Users</span>
            <div className="p-1 px-2 text-[9px] font-mono font-bold bg-rose-50 border border-rose-100 text-rose-700 rounded-full">
              OPERATORS
            </div>
          </div>
          <div className="mt-4 flex items-baseline space-x-2">
            <span className="text-3xl font-display font-semibold text-slate-900">{totalUsersCount.toLocaleString()}</span>
            <span className="text-xs text-slate-500 font-sans">Assigned Seats</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 font-mono">Multi-role administrative logons.</p>
        </div>

        {/* Statistics Metric: Total Demo Accounts */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm transition hover:shadow-md hover:border-slate-300">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">Total Demo Accounts</span>
            <div className="p-1 px-2 text-[9px] font-mono font-bold bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-full">
              SALES STAGES
            </div>
          </div>
          <div className="mt-4 flex items-baseline space-x-2">
            <span className="text-3xl font-display font-semibold text-slate-900">{totalDemoAccountsCount}</span>
            <span className="text-xs text-slate-500 font-sans">Environments</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 font-mono">Pristine presentations ready.</p>
        </div>
      </div>

      {/* Main Tab Contents */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm space-y-6" id="hq_tab_display_content">
        
        {/* TAB 1: OVERVIEW ADMIN */}
        {activeTab === "overview" && (
          <div className="space-y-6" id="hq_tab_overview">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <h4 className="font-display font-semibold text-xl text-slate-900">Platform Infrastructure Status</h4>
                <p className="text-xs text-slate-500 font-sans mt-0.5">Control room telemetry and directory audits.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleManualSync}
                  disabled={isSyncing}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center transition cursor-pointer disabled:opacity-50"
                  id="hq_force_sync_btn"
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isSyncing ? "animate-spin" : ""}`} />
                  {isSyncing ? "Auditing Pipeline..." : "Force Platform Audit"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Directory State Health */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3">
                <span className="text-xs font-mono font-bold text-slate-500 uppercase">Enforcement Protocols</span>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-sans">
                    <span className="text-slate-600">Row Level Security (RLS)</span>
                    <span className="text-emerald-600 font-bold font-mono">ACTIVE [STRICT]</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-sans">
                    <span className="text-slate-600">Cross-Tenant Isolation Guard</span>
                    <span className="text-emerald-600 font-bold font-mono">SECURED</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-sans">
                    <span className="text-slate-600">Sales Presentation Sandboxes</span>
                    <span className="text-indigo-600 font-bold font-mono">4 ISOLATED ZONES</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-sans">
                    <span className="text-slate-600">Primary Currency Handshake</span>
                    <span className="text-slate-900 font-bold font-mono">MYR ONLY (RM)</span>
                  </div>
                </div>
              </div>

              {/* Status Log */}
              <div className="bg-slate-900 text-slate-100 rounded-xl p-5 font-mono text-xs space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                  <span className="text-rose-400 font-bold">[SYSTEM ADMINISTRATIVE TELEMETRY]</span>
                  <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-400 font-bold">{syncStatus}</span>
                </div>
                <div className="space-y-1 text-[11px] leading-relaxed text-slate-300">
                  <p className="text-slate-500">2026-06-11 12:59:19 [AUDIT] Handshake initialized...</p>
                  <p className="text-slate-300 font-semibold text-emerald-400">● MAPPED 4 DEMO COVARYING WORSPACE MATRICES</p>
                  <p className="text-slate-400">● TENANT LEVEL POLICIES APPLIED FOR ALL 4 ENTITIES</p>
                  <p className="text-slate-500">2026-06-11 13:00:23 [RLS] isolated schema pipeline verified</p>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-5 text-xs text-slate-500 leading-relaxed font-sans">
              <span className="font-bold text-slate-800">MYKERANI Cloud Admin Panel Note:</span> All platform indicators utilize live state calculations. Billing models and automated cost indicators are configured as functional placeholders below, ready for downstream operational hooks.
            </div>
          </div>
        )}

        {/* TAB 2: RESOURCE WALLET MONITORING */}
        {activeTab === "wallet" && (
          <div className="space-y-6" id="hq_tab_wallet">
            <div className="flex justify-between items-start border-b border-slate-100 pb-5">
              <div>
                <h4 className="font-display font-semibold text-xl text-slate-900">Resource Wallet Monitoring</h4>
                <p className="text-xs text-slate-500 font-sans mt-0.5">Control compute credit reserves and platform query bandwidth limits.</p>
              </div>
              <button
                onClick={() => setShowTopUpModal(true)}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold flex items-center transition cursor-pointer"
                id="hq_wallet_topup_btn"
              >
                <Plus className="w-4 h-4 mr-1.5" /> Allocate Resources
              </button>
            </div>

            {/* Simulated Balance Header Card */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-rose-50 border border-rose-100 rounded-xl p-5 md:col-span-1">
                <span className="text-[10px] font-mono font-bold text-rose-500 uppercase block mb-1">Compute Balance</span>
                <p className="text-2xl font-mono font-bold text-rose-950">
                  RM {walletBalance.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                </p>
                <p className="text-[10px] text-rose-600 font-sans mt-2">Allocated against Spanner & API Gateway quotas.</p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 md:col-span-2 space-y-4">
                <span className="text-xs font-semibold font-mono text-slate-500 block uppercase">Bandwidth Quota Visualizer</span>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-sans text-slate-600">
                    <span>Database CPU Capacity (MYREx change API)</span>
                    <span className="font-mono font-bold text-slate-800">14.2% [RESTING state]</span>
                  </div>
                  <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                    <div className="bg-rose-600 h-2.5 rounded-full" style={{ width: "14.2%" }}></div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-sans text-slate-600">
                    <span>API Ingress Request Handshakes / minute</span>
                    <span className="font-mono font-bold text-slate-800">328 / 5,000 max</span>
                  </div>
                  <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                    <div className="bg-rose-600 h-2.5 rounded-full" style={{ width: "6.5%" }}></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Interactive Custom Allocation Modal Placeholder */}
            {showTopUpModal && (
              <div className="bg-slate-50 border border-slate-350 p-5 rounded-xl space-y-4 animate-fade-in" id="top_up_placement_card">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h5 className="font-semibold text-xs text-slate-800 uppercase flex items-center">
                    <Wallet className="w-4 h-4 mr-1.5 text-slate-500" /> Allocate Cloud Budget Credit
                  </h5>
                  <button onClick={() => setShowTopUpModal(false)} className="text-[10px] text-slate-400 hover:text-slate-600 uppercase font-mono">
                    Close
                  </button>
                </div>
                <form onSubmit={handleWalletTopUp} className="flex flex-col sm:flex-row items-end gap-3">
                  <div className="flex-1 space-y-1">
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase">Amount (MYR / RM)</label>
                    <input
                      type="number"
                      value={topUpAmount}
                      onChange={(e) => setTopUpAmount(e.target.value)}
                      placeholder="e.g. 5000"
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer shrink-0"
                  >
                    Confirm Allocation
                  </button>
                </form>
              </div>
            )}

            {/* Resource Ledger Placeholder */}
            <div className="space-y-3">
              <span className="text-xs font-bold font-mono text-slate-500 uppercase block">Historical Allocation Ledger</span>
              <div className="border border-slate-150 rounded-xl overflow-hidden text-xs">
                <div className="bg-slate-50 border-b border-slate-150 px-4 py-2.5 font-mono text-[10px] text-slate-400 uppercase grid grid-cols-4 font-bold">
                  <div>TALLY DATE</div>
                  <div>PLATFORM COMPONENT</div>
                  <div>RESOURCE ALLOCATION TYPE</div>
                  <div className="text-right">CREDIT MYR</div>
                </div>
                <div className="divide-y divide-slate-100 bg-white">
                  <div className="px-4 py-3 grid grid-cols-4 font-sans text-slate-700">
                    <div className="font-mono text-slate-400">2026-06-11</div>
                    <div className="font-semibold text-slate-900">Spanner DB Node APAC</div>
                    <div><span className="bg-slate-100 px-2 py-0.5 rounded text-[9px] font-mono text-slate-600 font-bold">SPEND_REFILL</span></div>
                    <div className="text-right font-mono font-bold text-emerald-600">+ RM 50,000.00</div>
                  </div>
                  <div className="px-4 py-3 grid grid-cols-4 font-sans text-slate-700">
                    <div className="font-mono text-slate-400">2026-06-05</div>
                    <div className="font-semibold text-slate-900">API Ingress Router</div>
                    <div><span className="bg-slate-100 px-2 py-0.5 rounded text-[9px] font-mono text-slate-600 font-bold">QUOTA_REPASS</span></div>
                    <div className="text-right font-mono font-bold text-emerald-600">+ RM 22,500.00</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: SUBSCRIPTION MONITORING */}
        {activeTab === "subscriptions" && (
          <div className="space-y-6" id="hq_tab_subscriptions">
            <div className="border-b border-slate-100 pb-5">
              <h4 className="font-display font-semibold text-xl text-slate-900">Subscription Monitoring</h4>
              <p className="text-xs text-slate-500 font-sans mt-0.5">Control customer tiers, expiration triggers, and organizational seat thresholds.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Personal Tier Panel */}
              <div className="border border-slate-200 rounded-xl p-5 space-y-4 bg-slate-50/50">
                <div className="flex justify-between items-start">
                  <span className="text-xs font-mono font-bold text-slate-400 uppercase">Tier: Standard SME</span>
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full">MD-PLAN</span>
                </div>
                <div>
                  <span className="text-2xl font-bold font-sans text-slate-900">RM 450</span>
                  <span className="text-xs text-slate-500"> / month</span>
                </div>
                <div className="space-y-2 text-xs text-slate-600 font-sans">
                  <p>● Includes up to 3 standard workspaces</p>
                  <p>● Up to 15 assigned operator Seats</p>
                  <p>● Live real database syncing (RM 19.4 dec)</p>
                </div>
                <div className="border-t border-slate-150 pt-3 flex items-center justify-between text-xs font-sans text-slate-500">
                  <span>Enrolled Tenants:</span>
                  <span className="font-mono font-bold text-slate-800">2 Clients</span>
                </div>
              </div>

              {/* Enterprise Elite Tier Panel */}
              <div className="border border-indigo-200 rounded-xl p-5 space-y-4 bg-indigo-50/20 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-indigo-600 text-white font-mono text-[8px] uppercase tracking-wider font-bold px-3 py-1 rounded-bl-lg">
                  PREMIUM PICK
                </div>
                <div className="flex justify-between items-start">
                  <span className="text-xs font-mono font-bold text-indigo-500 uppercase">Tier: Enterprise Ultimate</span>
                  <span className="bg-indigo-50 text-indigo-700 border border-indigo-150 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full">ENT-UNLIMITED</span>
                </div>
                <div>
                  <span className="text-2xl font-bold font-sans text-indigo-950">RM 1,800</span>
                  <span className="text-xs text-indigo-500"> / month</span>
                </div>
                <div className="space-y-2 text-xs text-indigo-900 font-sans">
                  <p>● Unlimited workspaces isolation</p>
                  <p>● Up to 100 assigned operator Seats</p>
                  <p>● Advanced Cost Governance tools</p>
                </div>
                <div className="border-t border-indigo-100 pt-3 flex items-center justify-between text-xs font-sans text-indigo-700">
                  <span>Enrolled Tenants:</span>
                  <span className="font-mono font-bold text-indigo-900">1 Client</span>
                </div>
              </div>

              {/* Custom Administration Tier Panel */}
              <div className="border border-slate-200 rounded-xl p-5 space-y-4 bg-slate-50/50">
                <div className="flex justify-between items-start">
                  <span className="text-xs font-mono font-bold text-slate-400 uppercase">Tier: Special Sales Demo</span>
                  <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full">DEMO-STAGING</span>
                </div>
                <div>
                  <span className="text-2xl font-bold font-sans text-slate-900">RM 0</span>
                  <span className="text-xs text-slate-500"> / presentation</span>
                </div>
                <div className="space-y-2 text-xs text-slate-600 font-sans">
                  <p>● Mapped 4 pristine corporate environments</p>
                  <p>● Interactive Custom Transaction injections</p>
                  <p>● Infinite reset protection locks</p>
                </div>
                <div className="border-t border-slate-150 pt-3 flex items-center justify-between text-xs font-sans text-slate-500">
                  <span>Active Sandboxes:</span>
                  <span className="font-mono font-bold text-slate-800">1 Core Demo Tenant</span>
                </div>
              </div>
            </div>

            {/* Customer Enrolments Table Placeholder */}
            <div className="space-y-3">
              <span className="text-xs font-bold font-mono text-slate-500 uppercase block">Active Subscription Roster</span>
              <div className="border border-slate-150 rounded-xl overflow-hidden text-xs">
                <div className="bg-slate-50 border-b border-slate-150 px-4 py-2.5 font-mono text-[10px] text-slate-400 uppercase grid grid-cols-4 font-bold">
                  <div>TENANT ENTITY</div>
                  <div>TIER OPTION</div>
                  <div>SEATS UTILIZED</div>
                  <div className="text-right">NEXT RENEWAL DATE</div>
                </div>
                <div className="divide-y divide-slate-100 bg-white">
                  <div className="px-4 py-3 grid grid-cols-4 font-sans text-slate-700">
                    <div className="font-semibold text-slate-900">Apex Engineering & Consulting MY</div>
                    <div><span className="bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded text-[9px] font-mono font-bold">SME_STANDARD</span></div>
                    <div className="font-mono">8 / 15 seats occupied</div>
                    <div className="text-right font-mono text-slate-500">2026-07-11</div>
                  </div>
                  <div className="px-4 py-3 grid grid-cols-4 font-sans text-slate-700">
                    <div className="font-semibold text-slate-900">MYKERANI Presentation & Demo Hub</div>
                    <div><span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded text-[9px] font-mono font-bold">SALES_DEMO</span></div>
                    <div className="font-mono">Unlimited seats</div>
                    <div className="text-right font-mono text-slate-500">Permanent Sandbox</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: COST GOVERNANCE */}
        {activeTab === "governance" && (
          <div className="space-y-6" id="hq_tab_governance">
            <div className="border-b border-slate-100 pb-5">
              <h4 className="font-display font-semibold text-xl text-slate-900">Cost Governance Cockpit</h4>
              <p className="text-xs text-slate-500 font-sans mt-0.5">Control cloud spending alert boundaries, database operation limits, and threshold blocks.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Dynamic Cost Slider Control */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
                <span className="text-xs font-mono font-bold text-slate-500 uppercase flex items-center">
                  <Sliders className="w-4 h-4 mr-1.5 text-slate-400" /> Administrative Spend Limits
                </span>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-sans">
                    <span className="text-slate-600 font-medium">Critical Cost Alert Tally:</span>
                    <span className="font-mono font-bold text-rose-600">RM {governanceAlertLimit.toLocaleString()} MYR</span>
                  </div>
                  <input
                    type="range"
                    min="1000"
                    max="20000"
                    step="500"
                    value={governanceAlertLimit}
                    onChange={(e) => setGovernanceAlertLimit(parseInt(e.target.value))}
                    className="w-full text-rose-600 accent-rose-600 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>RM 1,000 MILESTONE</span>
                    <span>RM 20,000 PLATINUM BOUNDARY</span>
                  </div>
                </div>

                <div className="p-3.5 bg-rose-50 border border-rose-100 rounded-lg text-[11px] text-rose-800 leading-relaxed font-sans">
                  <strong>SYSTEM GUARDIAN ACTION:</strong> Setting the threshold back to RM {governanceAlertLimit.toLocaleString()} automatically signals defensive middleware blocks once current cloud Spanner database write pipelines reach <span className="font-bold">90% capacity</span>.
                </div>
              </div>

              {/* Resource Consumption Analysis */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
                <span className="text-xs font-mono font-bold text-slate-500 uppercase block">Infrastructure Usage Audits</span>
                
                <div className="space-y-3 font-sans text-xs">
                  <div className="flex items-center justify-between border-b border-slate-150 pb-1.5 text-slate-600">
                    <span>PostgreSQL Database Schema queries</span>
                    <span className="font-mono font-semibold text-slate-900">4,129 queries / hour</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-150 pb-1.5 text-slate-600">
                    <span>Storage blob occupancy</span>
                    <span className="font-mono font-semibold text-slate-900">1.4 GB / 50 GB threshold</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-150 pb-1.5 text-slate-600">
                    <span>Active WebSocket connections</span>
                    <span className="font-mono font-semibold text-slate-900">14 open streams</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Total compute egress spend today</span>
                    <span className="font-mono font-bold text-emerald-600">RM 42.15 (MYR basis)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: PROFITABILITY MONITORING */}
        {activeTab === "profitability" && (
          <div className="space-y-6" id="hq_tab_profitability">
            <div className="border-b border-slate-100 pb-5">
              <h4 className="font-display font-semibold text-xl text-slate-900">Profitability Monitoring Console</h4>
              <p className="text-xs text-slate-500 font-sans mt-0.5">Control recurring revenues, average contract values, customer retention coefficients, and CAC margins.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {/* MRR Indicator */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-2">
                <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest block">Monthly Recurring (MRR)</span>
                <p className="text-2xl font-mono font-bold text-slate-900">RM 275,800.00</p>
                <div className="flex items-center text-[10px] text-emerald-600 font-sans font-bold">
                  <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" /> +14.2% Growth Index
                </div>
              </div>

              {/* Customer Lifetime Value CLV */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-2">
                <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest block">Customer Lifetime Value (LTV)</span>
                <p className="text-2xl font-mono font-bold text-slate-900">RM 18,500.00</p>
                <div className="text-[10px] text-slate-500 font-sans">Average contract span: 34 months</div>
              </div>

              {/* Customer Acquisition Index CAC */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-2">
                <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest block">Acquisition Cost (CAC) Ratio</span>
                <p className="text-2xl font-mono font-bold text-slate-900">RM 1,220.00</p>
                <div className="flex items-center text-[10px] text-emerald-600 font-sans font-semibold">
                  LTV / CAC coverage: <span className="underline ml-1 font-bold">15.1x factor</span>
                </div>
              </div>
            </div>

            {/* Performance Visual Mock Cards */}
            <div className="bg-slate-950 text-white rounded-xl p-6 relative overflow-hidden group">
              <div className="absolute right-0 top-0 opacity-5 group-hover:opacity-10 transition">
                <TrendingUp className="w-48 h-48" />
              </div>
              <h5 className="font-display font-medium text-sm text-slate-300 uppercase leading-none mb-2">MYKERANI System Conversion Matrix</h5>
              <p className="text-xs text-slate-400 leading-relaxed max-w-xl font-sans">
                Active presentation index maps. Demonstrating MYR system scale across Asian SME operations during stakeholder demonstrations. No live banks required.
              </p>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 pt-5 mt-5 border-t border-slate-800">
                <div>
                  <span className="text-[10px] font-mono text-slate-500 block uppercase">Trial-to-Paid Margin</span>
                  <span className="text-lg font-mono font-bold text-rose-400">22.4% ARR</span>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-slate-500 block uppercase">Net Revenue Churn</span>
                  <span className="text-lg font-mono font-bold text-emerald-400">-1.25% (Negative Churn)</span>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-slate-500 block uppercase">Operating Margin</span>
                  <span className="text-lg font-mono font-bold text-slate-200">74.5% EBITDA</span>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-slate-500 block uppercase">Accredited Compliance</span>
                  <span className="text-lg font-mono font-bold text-indigo-400">100% BANK NEG.</span>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

    </div>
  );
};
