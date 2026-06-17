import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { useFinancials } from "../context/FinancialRecordsContext";
import {
  ClipboardList,
  ReceiptText,
  FileCheck2,
  AlertCircle,
  Clock,
  Plus,
  Upload,
  Search,
  Bell,
  User,
  LogOut,
  ChevronRight,
  TrendingUp,
  CheckCircle2,
} from "lucide-react";

type StaffTab = "hari_ini" | "tambah" | "muat_naik" | "rekod" | "notifikasi" | "profil";

export function StaffHomeScreen() {
  const { user, signOut } = useAuth();
  const { activeWorkspace, workspaces, selectWorkspace } = useWorkspace();
  const { financialEvents, addFinancialEvent } = useFinancials();

  const [activeTab, setActiveTab] = useState<StaffTab>("hari_ini");
  const [addType, setAddType] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [addAmount, setAddAmount] = useState("");
  const [addDesc, setAddDesc] = useState("");
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const today = new Date().toLocaleDateString("ms-MY", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const myRecords = financialEvents
    .filter((e) => e.workspaceId === activeWorkspace?.id)
    .slice(-5)
    .reverse();

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !addAmount) return;
    addFinancialEvent({
      workspaceId: activeWorkspace.id,
      type: addType,
      categoryName: addType === "INCOME" ? "Pendapatan Am" : "Perbelanjaan Am",
      amountMyr: parseFloat(addAmount),
      partyName: addDesc || "Tidak dinyatakan",
      date: new Date().toISOString().split("T")[0],
      referenceNumber: `TXN-STAFF-${Math.floor(Math.random() * 90000 + 10000)}`,
      description: addDesc,
      isCompleted: false,
    });
    setAddSuccess(`Rekod RM ${parseFloat(addAmount).toFixed(2)} berjaya ditambah.`);
    setAddAmount("");
    setAddDesc("");
    setTimeout(() => {
      setAddSuccess(null);
      setShowAddModal(false);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col" id="staff_home_root">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center justify-between" id="staff_header">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center text-white font-bold text-base shadow-sm">
            MK
          </div>
          <div>
            <h1 className="font-bold text-slate-900 text-base tracking-tight">MYKERANI</h1>
            {activeWorkspace && (
              <p className="text-[11px] text-slate-500">{activeWorkspace.name}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-slate-100 border border-slate-200 rounded-xl px-3 py-1.5 flex items-center space-x-2">
            <div className="w-5 h-5 rounded-full bg-indigo-900 text-white flex items-center justify-center text-[10px] font-bold">
              {user?.fullName?.charAt(0).toUpperCase() || "S"}
            </div>
            <p className="text-[11px] font-semibold text-slate-900 hidden sm:block">{user?.fullName || "Kakitangan"}</p>
          </div>
          <button
            onClick={() => signOut()}
            className="p-2 bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 rounded-xl transition cursor-pointer"
            title="Log Keluar"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Company selector for staff */}
      {workspaces.length > 1 && (
        <div className="bg-amber-50 border-b border-amber-100 px-5 py-2 flex items-center space-x-2">
          <span className="text-[11px] text-amber-700 font-semibold">Syarikat:</span>
          <select
            value={activeWorkspace?.id || ""}
            onChange={(e) => selectWorkspace(e.target.value)}
            className="text-xs font-semibold bg-white border border-amber-200 rounded-lg px-2 py-1 outline-none cursor-pointer text-slate-700"
          >
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>{ws.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-grow max-w-lg w-full mx-auto px-4 py-5 space-y-4" id="staff_main">

        {/* TAB: Hari Ini */}
        {activeTab === "hari_ini" && (
          <div className="space-y-4" id="staff_today_pane">
            {/* Greeting */}
            <div className="bg-gradient-to-br from-indigo-950 to-slate-900 rounded-2xl p-5 text-white shadow-lg">
              <p className="text-xs text-indigo-300 font-medium mb-1">{today}</p>
              <h2 className="text-lg font-bold">Selamat datang, {user?.fullName?.split(" ")[0] || "Kakitangan"} 👋</h2>
              <p className="text-indigo-200 text-xs mt-1">
                {activeWorkspace ? `Syarikat: ${activeWorkspace.name}` : "Sila pilih syarikat anda"}
              </p>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-3" id="staff_quick_actions">
              <button
                onClick={() => { setActiveTab("tambah"); setShowAddModal(true); setAddType("EXPENSE"); }}
                className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col items-center space-y-2 shadow-sm hover:shadow-md hover:border-indigo-200 transition cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
                  <Plus className="w-5 h-5 text-rose-500" />
                </div>
                <span className="text-xs font-semibold text-slate-700">Tambah Perbelanjaan</span>
              </button>
              <button
                onClick={() => { setActiveTab("tambah"); setShowAddModal(true); setAddType("INCOME"); }}
                className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col items-center space-y-2 shadow-sm hover:shadow-md hover:border-indigo-200 transition cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-emerald-500" />
                </div>
                <span className="text-xs font-semibold text-slate-700">Tambah Pendapatan</span>
              </button>
              <button
                onClick={() => setActiveTab("muat_naik")}
                className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col items-center space-y-2 shadow-sm hover:shadow-md hover:border-indigo-200 transition cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Upload className="w-5 h-5 text-blue-500" />
                </div>
                <span className="text-xs font-semibold text-slate-700">Muat Naik Resit</span>
              </button>
              <button
                onClick={() => setActiveTab("rekod")}
                className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col items-center space-y-2 shadow-sm hover:shadow-md hover:border-indigo-200 transition cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center">
                  <Search className="w-5 h-5 text-slate-500" />
                </div>
                <span className="text-xs font-semibold text-slate-700">Cari Rekod</span>
              </button>
            </div>

            {/* Task Cards */}
            <div className="space-y-3" id="staff_task_cards">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">Tugasan Anda</h3>

              <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                    <ReceiptText className="w-4.5 h-4.5 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Muat Naik Resit</p>
                    <p className="text-xs text-slate-400">Resit belum dimuat naik hari ini</p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab("muat_naik")}
                  className="text-slate-300 hover:text-indigo-500 transition"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                    <ClipboardList className="w-4.5 h-4.5 text-indigo-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Rekod Transaksi</p>
                    <p className="text-xs text-slate-400">Rekod semua pendapatan & perbelanjaan</p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab("tambah")}
                  className="text-slate-300 hover:text-indigo-500 transition"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
                    <AlertCircle className="w-4.5 h-4.5 text-rose-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Bil Belum Bayar</p>
                    <p className="text-xs text-slate-400">Semak komitmen kewangan anda</p>
                  </div>
                </div>
                <button className="text-slate-300 hover:text-indigo-500 transition">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Recent Records */}
            {myRecords.length > 0 && (
              <div className="space-y-2" id="staff_recent_records">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">Rekod Terkini</h3>
                {myRecords.map((rec) => (
                  <div key={rec.id} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${rec.type === "INCOME" ? "bg-emerald-50" : "bg-rose-50"}`}>
                        {rec.type === "INCOME"
                          ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                          : <Clock className="w-3.5 h-3.5 text-rose-400" />
                        }
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-800 truncate max-w-[160px]">{rec.categoryName}</p>
                        <p className="text-[10px] text-slate-400">{rec.date}</p>
                      </div>
                    </div>
                    <span className={`text-xs font-bold ${rec.type === "INCOME" ? "text-emerald-600" : "text-rose-500"}`}>
                      {rec.type === "INCOME" ? "+" : "-"}RM {rec.amountMyr.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB: Tambah Rekod */}
        {activeTab === "tambah" && (
          <div className="space-y-4" id="staff_add_pane">
            <h2 className="font-bold text-slate-900 text-lg">Tambah Rekod</h2>

            {addSuccess && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center space-x-2 text-xs text-emerald-700 font-medium">
                <CheckCircle2 className="w-4 h-4" />
                <span>{addSuccess}</span>
              </div>
            )}

            {!activeWorkspace ? (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center space-y-2">
                <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
                <p className="text-sm font-semibold text-amber-800">Sila pilih syarikat dahulu</p>
              </div>
            ) : (
              <form onSubmit={handleAddSubmit} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAddType("EXPENSE")}
                    className={`py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${addType === "EXPENSE" ? "bg-rose-500 text-white shadow" : "bg-slate-50 text-slate-600 border border-slate-200"}`}
                  >
                    Perbelanjaan
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddType("INCOME")}
                    className={`py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${addType === "INCOME" ? "bg-emerald-500 text-white shadow" : "bg-slate-50 text-slate-600 border border-slate-200"}`}
                  >
                    Pendapatan
                  </button>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Jumlah (RM)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={addAmount}
                    onChange={(e) => setAddAmount(e.target.value)}
                    placeholder="0.00"
                    required
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 text-slate-900 font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Penerangan</label>
                  <input
                    type="text"
                    value={addDesc}
                    onChange={(e) => setAddDesc(e.target.value)}
                    placeholder="Cth: Minyak, Bayar supplier..."
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 text-slate-800"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-indigo-950 text-white rounded-xl py-3 text-sm font-bold hover:bg-slate-900 transition shadow cursor-pointer"
                >
                  Simpan Rekod
                </button>
              </form>
            )}
          </div>
        )}

        {/* TAB: Muat Naik */}
        {activeTab === "muat_naik" && (
          <div className="space-y-4" id="staff_upload_pane">
            <h2 className="font-bold text-slate-900 text-lg">Muat Naik Dokumen</h2>
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4 shadow-sm">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto">
                <Upload className="w-7 h-7 text-indigo-400" />
              </div>
              <div>
                <p className="font-semibold text-slate-800">Muat Naik Resit / Invois</p>
                <p className="text-xs text-slate-400 mt-1">Foto atau fail PDF resit & invois anda</p>
              </div>
              <label className="block cursor-pointer">
                <span className="inline-block px-6 py-2.5 bg-indigo-950 text-white rounded-xl text-xs font-bold hover:bg-slate-900 transition shadow cursor-pointer">
                  Pilih Fail
                </span>
                <input type="file" accept="image/*,.pdf" className="hidden" />
              </label>
              <p className="text-[10px] text-slate-300">JPG, PNG atau PDF · Maks 10MB</p>
            </div>

            {/* Document type shortcuts */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Resit", icon: ReceiptText, color: "bg-amber-50 text-amber-500" },
                { label: "Invois", icon: FileCheck2, color: "bg-blue-50 text-blue-500" },
                { label: "Penyata", icon: ClipboardList, color: "bg-slate-50 text-slate-500" },
              ].map(({ label, icon: Icon, color }) => (
                <button
                  key={label}
                  className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col items-center space-y-2 shadow-sm hover:border-indigo-200 transition cursor-pointer"
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-600">{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* TAB: Rekod */}
        {activeTab === "rekod" && (
          <div className="space-y-4" id="staff_records_pane">
            <h2 className="font-bold text-slate-900 text-lg">Rekod Saya</h2>
            {myRecords.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-2 shadow-sm">
                <ClipboardList className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-sm text-slate-500">Tiada rekod lagi</p>
                <button
                  onClick={() => setActiveTab("tambah")}
                  className="px-5 py-2 bg-indigo-950 text-white rounded-xl text-xs font-bold hover:bg-slate-900 transition shadow cursor-pointer"
                >
                  Tambah Rekod Pertama
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {financialEvents
                  .filter((e) => e.workspaceId === activeWorkspace?.id)
                  .reverse()
                  .map((rec) => (
                    <div key={rec.id} className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-sm">
                      <div className="flex items-center space-x-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${rec.type === "INCOME" ? "bg-emerald-50" : "bg-rose-50"}`}>
                          {rec.type === "INCOME"
                            ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                            : <Clock className="w-3.5 h-3.5 text-rose-400" />
                          }
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-800">{rec.categoryName}</p>
                          <p className="text-[10px] text-slate-400">{rec.partyName} · {rec.date}</p>
                        </div>
                      </div>
                      <span className={`text-sm font-bold ${rec.type === "INCOME" ? "text-emerald-600" : "text-rose-500"}`}>
                        {rec.type === "INCOME" ? "+" : "-"}RM {rec.amountMyr.toFixed(2)}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* TAB: Notifikasi */}
        {activeTab === "notifikasi" && (
          <div className="space-y-4" id="staff_notif_pane">
            <h2 className="font-bold text-slate-900 text-lg">Notifikasi</h2>
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-2 shadow-sm">
              <Bell className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm text-slate-500">Tiada notifikasi baru</p>
            </div>
          </div>
        )}

        {/* TAB: Profil */}
        {activeTab === "profil" && (
          <div className="space-y-4" id="staff_profile_pane">
            <h2 className="font-bold text-slate-900 text-lg">Profil Saya</h2>
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
              <div className="flex items-center space-x-4">
                <div className="w-14 h-14 rounded-2xl bg-indigo-900 text-white flex items-center justify-center text-2xl font-bold">
                  {user?.fullName?.charAt(0).toUpperCase() || "S"}
                </div>
                <div>
                  <p className="font-bold text-slate-900">{user?.fullName || "Kakitangan"}</p>
                  <p className="text-xs text-slate-500">{user?.email}</p>
                  <span className="text-[10px] bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-full">Kakitangan</span>
                </div>
              </div>
              {activeWorkspace && (
                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs text-slate-400 mb-1">Syarikat Aktif</p>
                  <p className="text-sm font-semibold text-slate-800">{activeWorkspace.name}</p>
                </div>
              )}
              <button
                onClick={() => signOut()}
                className="w-full py-2.5 border border-rose-200 text-rose-500 rounded-xl text-sm font-semibold hover:bg-rose-50 transition cursor-pointer"
              >
                Log Keluar
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Nav */}
      <nav className="bg-white border-t border-slate-200 px-4 py-2 flex items-center justify-around" id="staff_bottom_nav">
        {[
          { tab: "hari_ini" as StaffTab, icon: ClipboardList, label: "Hari Ini" },
          { tab: "tambah" as StaffTab, icon: Plus, label: "Tambah" },
          { tab: "muat_naik" as StaffTab, icon: Upload, label: "Muat Naik" },
          { tab: "rekod" as StaffTab, icon: Search, label: "Rekod" },
          { tab: "notifikasi" as StaffTab, icon: Bell, label: "Notif" },
          { tab: "profil" as StaffTab, icon: User, label: "Profil" },
        ].map(({ tab, icon: Icon, label }) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex flex-col items-center space-y-0.5 px-2 py-1 rounded-xl transition cursor-pointer ${
              activeTab === tab ? "text-indigo-900" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <Icon className={`w-5 h-5 ${activeTab === tab ? "text-indigo-900" : ""}`} />
            <span className={`text-[10px] font-semibold ${activeTab === tab ? "text-indigo-900" : ""}`}>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
