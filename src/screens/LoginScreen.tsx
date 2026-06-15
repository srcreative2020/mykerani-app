import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { type UserRole } from "../types";
import {
  Mail,
  Lock,
  User,
  LogIn,
  UserPlus,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Wallet,
  FileText,
  LockKeyhole,
  CheckCircle2
} from "lucide-react";

export default function LoginScreen() {
  const { signIn, signUp, error, clearError } = useAuth();

  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role] = useState<UserRole>("TENANT_ADMIN"); // default to primary business proprietor role

  const [formLoading, setFormLoading] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustomError(null);
    clearError();

    if (!email) {
      setCustomError("Sila masukkan alamat e-mel anda.");
      return;
    }

    if (!password || password.length < 6) {
      setCustomError("Kata laluan mestilah sekurang-kurangnya 6 aksara.");
      return;
    }

    if (isSignUpMode && !fullName) {
      setCustomError("Sila masukkan nama penuh anda.");
      return;
    }

    setFormLoading(true);
    try {
      if (isSignUpMode) {
        await signUp(email, password, fullName, role);
      } else {
        await signIn(email, password);
      }
    } catch (err: any) {
      setCustomError(err?.message || "E-mel atau kata laluan tidak sah.");
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggleMode = () => {
    setIsSignUpMode(!isSignUpMode);
    setCustomError(null);
    clearError();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 md:p-8 font-sans select-none" id="login_screen_container">
      
      {/* Outer wrapper: Centered premium banking-inspired card */}
      <div className="w-full max-w-md bg-white border border-slate-200/80 rounded-3xl p-6 md:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.03)] space-y-7" id="login_card_wrapper">
        
        {/* HEADER: MYKERANI Logo Area */}
        <div className="flex flex-col items-center text-center space-y-3" id="login_branding_header">
          <div className="w-14 h-14 rounded-2xl bg-indigo-950 flex items-center justify-center shadow-lg hover:scale-105 transition duration-300" id="login_logo_box">
            <span className="font-display font-extrabold text-white text-xl tracking-tight">MK</span>
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-indigo-950 tracking-tight" id="login_app_title">
              MYKERANI
            </h1>
            <p className="text-xs font-semibold text-slate-400 tracking-wide uppercase mt-0.5" id="login_app_subtitle">
              Pembantu Kewangan Pintar Anda
            </p>
          </div>
        </div>

        {/* VALUE PROPOSITION: Clean Grid */}
        <div className="grid grid-cols-2 gap-3" id="value_proposition_grid">
          <div className="p-3 bg-slate-50 border border-slate-100/50 rounded-2xl flex items-center space-x-2 shadow-xs">
            <span className="text-base">📈</span>
            <span className="text-[11px] font-semibold text-slate-700">Pantau Pendapatan</span>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-100/50 rounded-2xl flex items-center space-x-2 shadow-xs">
            <span className="text-base">📉</span>
            <span className="text-[11px] font-semibold text-slate-700">Kawal Perbelanjaan</span>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-100/50 rounded-2xl flex items-center space-x-2 shadow-xs">
            <span className="text-base">💰</span>
            <span className="text-[11px] font-semibold text-slate-700">Urus Aliran Tunai</span>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-100/50 rounded-2xl flex items-center space-x-2 shadow-xs">
            <span className="text-base">📂</span>
            <span className="text-[11px] font-semibold text-slate-700">Simpan Dokumen Kewangan</span>
          </div>
        </div>

        {/* LOGIN / SIGNUP FORM */}
        <form onSubmit={handleAuthSubmit} className="space-y-4" id="login_action_form">
          
          {/* Full Name (Sign Up Mode Only) */}
          {isSignUpMode && (
            <div className="space-y-1" id="fullName_field_container">
              <label className="block text-xs font-semibold text-slate-600">Nama Penuh</label>
              <div className="relative">
                <User className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Contoh: Muhammad Ali"
                  className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 hover:bg-slate-100/40 border border-slate-200 focus:bg-white focus:border-indigo-950 rounded-xl transition outline-none text-slate-800"
                  id="fullName_field"
                />
              </div>
            </div>
          )}

          {/* Email field */}
          <div className="space-y-1" id="email_field_container">
            <label className="block text-xs font-semibold text-slate-600">Alamat E-mel</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ali@kedai.com"
                className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 hover:bg-slate-100/40 border border-slate-200 focus:bg-white focus:border-indigo-950 rounded-xl transition outline-none text-slate-800"
                id="email_field"
                required
              />
            </div>
          </div>

          {/* Password field */}
          <div className="space-y-1" id="password_field_container">
            <label className="block text-xs font-semibold text-slate-600">Kata Laluan</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 hover:bg-slate-100/40 border border-slate-200 focus:bg-white focus:border-indigo-950 rounded-xl transition outline-none text-slate-800"
                id="password_field"
                required
              />
            </div>
          </div>

          {/* Error notifications */}
          {(error || customError) && (
            <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-600 flex items-start space-x-2" id="login_error_box">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{customError || error}</span>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={formLoading}
            className="w-full py-2.5 bg-indigo-950 hover:bg-slate-900 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-md transition-all duration-200 flex items-center justify-center cursor-pointer"
            id="auth_submit_btn"
          >
            {formLoading ? (
              <span>Sila tunggu...</span>
            ) : isSignUpMode ? (
              <>
                <UserPlus className="w-4 h-4 mr-2" />
                Daftar Akaun
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4 mr-2" />
                Log Masuk
              </>
            )}
          </button>
        </form>

        {/* BOTTOM SECTION */}
        <div className="pt-4 border-t border-slate-100 text-center" id="login_toggle_container">
          {isSignUpMode ? (
            <p className="text-xs text-slate-500">
              Sudah ada akaun?{" "}
              <button
                type="button"
                onClick={handleToggleMode}
                className="text-indigo-600 hover:text-indigo-850 font-semibold focus:outline-none cursor-pointer underline ml-0.5"
                id="toggle_login_btn"
              >
                Log Masuk
              </button>
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              Belum ada akaun?{" "}
              <button
                type="button"
                onClick={handleToggleMode}
                className="text-indigo-600 hover:text-indigo-850 font-semibold focus:outline-none cursor-pointer underline ml-0.5"
                id="toggle_register_btn"
              >
                Daftar Sekarang
              </button>
            </p>
          )}
        </div>

      </div>

    </div>
  );
}
