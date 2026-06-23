import React, { useState, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { type UserRole } from "../types";
import {
  Mail,
  Lock,
  User,
  LogIn,
  UserPlus,
  AlertCircle,
  ChevronRight,
  MailCheck,
} from "lucide-react";

// Akaun demo — diselaraskan dengan DEMO_ACCOUNTS dalam AuthContext
const DEMO_USERS = [
  {
    email: "hq@mykerani.demo",
    label: "HQ Pemilik (Demo)",
    sublabel: "HQ_OWNER · MYKERANI Kawalan Pentadbiran Utama",
    emoji: "👑",
    colorBg: "bg-rose-50",
    colorBorder: "border-rose-100/70",
    colorHover: "hover:bg-rose-100/40",
    colorLabel: "text-rose-950",
    colorSub: "text-rose-500/80",
    colorIcon: "bg-rose-100 text-rose-700",
    colorChevron: "text-rose-400",
  },
  {
    email: "hqstaff@mykerani.demo",
    label: "HQ Kakitangan (Demo)",
    sublabel: "HQ_STAFF · MYKERANI Kawalan Pentadbiran Utama",
    emoji: "🏢",
    colorBg: "bg-orange-50",
    colorBorder: "border-orange-100/70",
    colorHover: "hover:bg-orange-100/40",
    colorLabel: "text-orange-950",
    colorSub: "text-orange-500/80",
    colorIcon: "bg-orange-100 text-orange-700",
    colorChevron: "text-orange-400",
  },
  {
    email: "owner@mykerani.demo",
    label: "Pemilik Syarikat (Demo)",
    sublabel: "TENANT_OWNER · MYKERANI Urus Niaga Utama",
    emoji: "💼",
    colorBg: "bg-amber-50",
    colorBorder: "border-amber-100/70",
    colorHover: "hover:bg-amber-100/40",
    colorLabel: "text-amber-950",
    colorSub: "text-amber-500/80",
    colorIcon: "bg-amber-100 text-amber-700",
    colorChevron: "text-amber-400",
  },
  {
    email: "staff@mykerani.demo",
    label: "Kakitangan Syarikat (Demo)",
    sublabel: "TENANT_STAFF · MYKERANI Urus Niaga Utama",
    emoji: "👤",
    colorBg: "bg-indigo-50",
    colorBorder: "border-indigo-100/70",
    colorHover: "hover:bg-indigo-100/40",
    colorLabel: "text-indigo-950",
    colorSub: "text-indigo-500/80",
    colorIcon: "bg-indigo-100 text-indigo-700",
    colorChevron: "text-indigo-400",
  },
];

interface LoginScreenProps {
  initialMode?: "login" | "signup";
  onBack?: () => void;
}

export default function LoginScreen({ initialMode = "login", onBack }: LoginScreenProps) {
  const { signIn, signUp, resetPassword, error, clearError } = useAuth();

  const [isSignUpMode, setIsSignUpMode] = useState(initialMode === "signup");
  const [isForgotMode, setIsForgotMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role] = useState<UserRole>("TENANT_OWNER");

  const [formLoading, setFormLoading] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);

  // Step 2 — Email Verification screen: shown when signUp() succeeds but
  // Supabase requires email confirmation before a session is created.
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMsg, setResendMsg] = useState<string | null>(null);
  const resendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startResendCooldown = () => {
    setResendCooldown(30);
    if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    resendTimerRef.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) {
          if (resendTimerRef.current) clearInterval(resendTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleResendVerification = async () => {
    if (!pendingVerificationEmail || resendCooldown > 0 || !supabase) return;
    setResendMsg(null);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email: pendingVerificationEmail });
      if (error) {
        setResendMsg(error.message);
      } else {
        setResendMsg("E-mel pengesahan telah dihantar semula.");
        startResendCooldown();
      }
    } catch {
      setResendMsg("Ralat sambungan. Sila cuba lagi.");
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustomError(null);
    clearError();

    if (!email.trim()) {
      setCustomError("Sila masukkan alamat e-mel anda.");
      return;
    }
    if (!password || password.length < 6) {
      setCustomError("Kata laluan mestilah sekurang-kurangnya 6 aksara.");
      return;
    }
    if (isSignUpMode && !fullName.trim()) {
      setCustomError("Sila masukkan nama penuh anda.");
      return;
    }

    setFormLoading(true);
    try {
      if (isSignUpMode) {
        const result = await signUp(email, password, fullName, role);
        if (result?.pendingConfirmation) {
          setPendingVerificationEmail(email.trim().toLowerCase());
          startResendCooldown();
        }
      } else {
        await signIn(email, password);
      }
    } catch (err: any) {
      setCustomError(err?.message || "E-mel atau kata laluan tidak sah.");
    } finally {
      setFormLoading(false);
    }
  };

  const handleDemoLogin = async (demoEmail: string) => {
    setCustomError(null);
    clearError();
    setFormLoading(true);
    try {
      await signIn(demoEmail, "");
    } catch (e) {}
    setFormLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustomError(null);
    setForgotSuccess(null);
    if (!email.trim()) {
      setCustomError("Sila masukkan alamat e-mel anda.");
      return;
    }
    setFormLoading(true);
    const result = await resetPassword(email);
    setFormLoading(false);
    if (result.success) {
      setForgotSuccess(result.message);
    } else {
      setCustomError(result.message);
    }
  };

  const handleToggleMode = () => {
    setIsSignUpMode(prev => !prev);
    setIsForgotMode(false);
    setCustomError(null);
    setForgotSuccess(null);
    clearError();
  };

  return (
    <div
      className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 md:p-8 font-sans select-none"
      id="login_screen_container"
    >
      <div
        className="w-full max-w-md bg-white border border-slate-200/80 rounded-3xl p-6 md:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-6"
        id="login_card_wrapper"
      >
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="text-xs text-slate-400 hover:text-slate-700 transition cursor-pointer flex items-center gap-1"
            id="back_to_landing_btn"
          >
            ← Kembali ke Laman Utama
          </button>
        )}
        {/* Branding */}
        <div className="flex flex-col items-center text-center space-y-3" id="login_branding_header">
          <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center shadow-lg">
            <span className="font-display font-extrabold text-white text-xl tracking-tight">MK</span>
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight">
              MYKERANI
            </h1>
            <p className="text-xs font-semibold text-slate-400 tracking-widest uppercase mt-0.5">
              Pembantu Kewangan Pintar Anda
            </p>
          </div>
        </div>

        {/* Ciri-ciri utama */}
        <div className="grid grid-cols-2 gap-2.5" id="feature_highlights_grid">
          {[
            { emoji: "📈", label: "Pantau Pendapatan" },
            { emoji: "📉", label: "Kawal Perbelanjaan" },
            { emoji: "💰", label: "Urus Aliran Tunai" },
            { emoji: "📂", label: "Simpan Dokumen Kewangan" },
          ].map(f => (
            <div
              key={f.label}
              className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center space-x-2"
            >
              <span className="text-base">{f.emoji}</span>
              <span className="text-[11px] font-semibold text-slate-700 leading-tight">{f.label}</span>
            </div>
          ))}
        </div>

        {/* Step 2 — Semak Email Anda (selepas signUp() berjaya tapi belum sah emel) */}
        {pendingVerificationEmail ? (
          <div className="space-y-4 text-center" id="email_verification_screen">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto">
              <MailCheck className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="space-y-1">
              <h2 className="font-bold text-slate-800 text-sm">Semak Email Anda</h2>
              <p className="text-[11px] text-slate-400">
                Kami telah menghantar pautan pengesahan ke: <span className="font-semibold text-slate-600">{pendingVerificationEmail}</span>
              </p>
            </div>

            {resendMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 text-center font-medium">
                {resendMsg}
              </div>
            )}

            <a
              href="https://mail.google.com"
              target="_blank"
              rel="noreferrer"
              className="w-full min-h-11 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center justify-center cursor-pointer"
              id="open_gmail_btn"
            >
              Buka Gmail
            </a>

            <button
              type="button"
              onClick={handleResendVerification}
              disabled={resendCooldown > 0}
              className="w-full min-h-11 py-3 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-xl text-xs font-semibold transition flex items-center justify-center cursor-pointer"
              id="resend_verification_btn"
            >
              {resendCooldown > 0 ? `Hantar Semula Email (${resendCooldown}s)` : "Hantar Semula Email"}
            </button>

            <button
              type="button"
              onClick={() => { setPendingVerificationEmail(null); setResendMsg(null); setIsSignUpMode(false); }}
              className="w-full text-center text-xs text-slate-400 hover:text-slate-700 transition cursor-pointer py-1"
            >
              ← Kembali ke Log Masuk
            </button>
          </div>
        ) : isForgotMode ? (
          <form onSubmit={handleForgotPassword} className="space-y-4" id="forgot_password_form">
            <div className="text-center space-y-1">
              <h2 className="font-bold text-slate-800 text-sm">Tetapkan Semula Kata Laluan</h2>
              <p className="text-[11px] text-slate-400">Kami akan hantar pautan tetapan semula ke e-mel anda.</p>
            </div>

            {forgotSuccess ? (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 text-center font-medium">
                {forgotSuccess}
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600">Alamat E-mel</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="ali@kedai.com"
                      className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:border-slate-900 rounded-xl transition outline-none text-slate-800"
                      autoComplete="email"
                    />
                  </div>
                </div>
                {customError && (
                  <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-600 flex items-start space-x-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{customError}</span>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={formLoading}
                  className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center justify-center cursor-pointer"
                >
                  {formLoading ? <span className="animate-pulse">Sila tunggu...</span> : "Hantar E-mel Tetapan Semula"}
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => { setIsForgotMode(false); setCustomError(null); setForgotSuccess(null); }}
              className="w-full text-center text-xs text-slate-400 hover:text-slate-700 transition cursor-pointer py-1"
            >
              ← Kembali ke Log Masuk
            </button>
          </form>
        ) : (
        /* Borang Log Masuk / Daftar */
        <form onSubmit={handleAuthSubmit} className="space-y-4" id="login_action_form">

          {isSignUpMode && (
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-600">Nama Penuh</label>
              <div className="relative">
                <User className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Contoh: Ahmad Firdaus"
                  className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:border-slate-900 rounded-xl transition outline-none text-slate-800"
                  id="fullName_field"
                />
              </div>
            </div>
          )}

          <div className="space-y-1" id="email_field_container">
            <label className="block text-xs font-semibold text-slate-600">Alamat E-mel</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="ali@kedai.com"
                className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:border-slate-900 rounded-xl transition outline-none text-slate-800"
                id="email_field"
                autoComplete="email"
              />
            </div>
          </div>

          <div className="space-y-1" id="password_field_container">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-600">Kata Laluan</label>
              {!isSignUpMode && (
                <button
                  type="button"
                  onClick={() => { setIsForgotMode(true); setCustomError(null); clearError(); }}
                  className="text-[11px] text-indigo-500 hover:text-indigo-700 font-medium cursor-pointer transition"
                >
                  Lupa Kata Laluan?
                </button>
              )}
            </div>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:border-slate-900 rounded-xl transition outline-none text-slate-800"
                id="password_field"
                autoComplete={isSignUpMode ? "new-password" : "current-password"}
              />
            </div>
          </div>

          {(error || customError) && (
            <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-600 flex items-start space-x-2" id="login_error_box">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{customError || error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={formLoading}
            className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center justify-center cursor-pointer"
            id="auth_submit_btn"
          >
            {formLoading ? (
              <span className="animate-pulse">Sila tunggu...</span>
            ) : isSignUpMode ? (
              <><UserPlus className="w-4 h-4 mr-2" />Daftar Akaun</>
            ) : (
              <><LogIn className="w-4 h-4 mr-2" />Log Masuk</>
            )}
          </button>
        </form>
        )}

        {/* Akses Demo — hanya tunjuk pada skrin Log Masuk */}
        {!isSignUpMode && !isForgotMode && (
          <div className="pt-1 border-t border-slate-100 space-y-3" id="demo_access_section">
            <p className="text-center text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              Akses Demo Segera (Tap Sekali Terus Masuk)
            </p>
            <div className="space-y-2">
              {DEMO_USERS.map(demo => (
                <button
                  key={demo.email}
                  type="button"
                  onClick={() => handleDemoLogin(demo.email)}
                  disabled={formLoading}
                  className={`w-full flex items-center justify-between p-3 ${demo.colorBg} border ${demo.colorBorder} ${demo.colorHover} rounded-xl transition text-left cursor-pointer group disabled:opacity-50`}
                  id={`demo_btn_${demo.email.split("@")[0]}`}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`w-9 h-9 rounded-xl ${demo.colorIcon} flex items-center justify-center text-base shrink-0`}>
                      {demo.emoji}
                    </div>
                    <div>
                      <p className={`text-xs font-bold ${demo.colorLabel} leading-tight`}>{demo.label}</p>
                      <p className={`text-[10px] font-mono ${demo.colorSub} mt-0.5`}>{demo.sublabel}</p>
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 ${demo.colorChevron} group-hover:translate-x-0.5 transition shrink-0`} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Toggle Log Masuk / Daftar */}
        {!isForgotMode && <div className="pt-2 border-t border-slate-100 text-center">
          {isSignUpMode ? (
            <p className="text-xs text-slate-500">
              Sudah ada akaun?{" "}
              <button
                type="button"
                onClick={handleToggleMode}
                className="text-slate-900 font-semibold underline cursor-pointer focus:outline-none"
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
                className="text-slate-900 font-semibold underline cursor-pointer focus:outline-none"
                id="toggle_register_btn"
              >
                Daftar Sekarang
              </button>
            </p>
          )}
        </div>}
      </div>
    </div>
  );
}
