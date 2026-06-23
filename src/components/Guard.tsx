import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import LoginScreen from "../screens/LoginScreen";
import LandingPage from "../screens/LandingPage";
import { Loader2, Lock, AlertCircle, CheckCircle2 } from "lucide-react";

// AUTH-02B — Set New Password screen, shown whenever Supabase fires the
// PASSWORD_RECOVERY auth event (user clicked the reset-password link in
// their e-mail). Reuses the same visual language as LoginScreen's forms.
const SetNewPasswordScreen: React.FC = () => {
  const { setNewPasswordAfterRecovery, cancelPasswordRecovery } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Kata laluan mestilah sekurang-kurangnya 6 aksara.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Kata laluan tidak sepadan.");
      return;
    }
    setLoading(true);
    const result = await setNewPasswordAfterRecovery(password);
    setLoading(false);
    if (result.success) {
      setSuccess(result.message);
    } else {
      setError(result.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 md:p-8 font-sans" id="set_new_password_screen">
      <div className="w-full max-w-md bg-white border border-slate-200/80 rounded-3xl p-6 md:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-6">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center shadow-lg">
            <Lock className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-display font-bold text-slate-900 tracking-tight">Tetapkan Kata Laluan Baharu</h1>
            <p className="text-xs text-slate-400 mt-1">Masukkan kata laluan baharu untuk akaun anda.</p>
          </div>
        </div>

        {success ? (
          <div className="space-y-4 text-center">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-start gap-2 text-left">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
            <button
              type="button"
              onClick={cancelPasswordRecovery}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer"
              id="recovery_done_login_btn"
            >
              Log Masuk Sekarang
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" id="set_new_password_form">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-600">Kata Laluan Baharu</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-4 py-2.5 text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:border-slate-900 rounded-xl transition outline-none text-slate-800"
                id="new_password_field"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-600">Sahkan Kata Laluan Baharu</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-4 py-2.5 text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:border-slate-900 rounded-xl transition outline-none text-slate-800"
                id="confirm_new_password_field"
                autoComplete="new-password"
              />
            </div>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-600 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center justify-center cursor-pointer"
              id="submit_new_password_btn"
            >
              {loading ? <span className="animate-pulse">Sila tunggu...</span> : "Tetapkan Kata Laluan"}
            </button>

            <button
              type="button"
              onClick={cancelPasswordRecovery}
              className="w-full text-center text-xs text-slate-400 hover:text-slate-700 transition cursor-pointer py-1"
              id="cancel_recovery_btn"
            >
              ← Batal, Kembali ke Log Masuk
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export const Guard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading, passwordRecoveryMode } = useAuth();
  // AUTH-02B — "login_hq" is a separate, non-advertised entry point for HQ
  // Owner/Staff login. It is never linked from LandingPage; the only way to
  // reach it is the small "HQ Console" text link at the bottom of the
  // regular LoginScreen (see LoginScreen.tsx's hq_console_entry_link).
  const [view, setView] = useState<"landing" | "login" | "register" | "login_hq">("landing");

  // AUTH-02B — PASSWORD_RECOVERY takes priority over everything else,
  // including an existing session, since Supabase creates a transient
  // recovery session for the click-through that must not be treated as a
  // normal logged-in session.
  if (passwordRecoveryMode) {
    return <SetNewPasswordScreen />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans" id="auth_loader">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="w-8 h-8 text-slate-900 animate-spin" />
          <p className="text-sm font-medium text-slate-600 font-mono tracking-tight animate-pulse">
            Syncing user session state...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (view === "landing") {
      return <LandingPage onLogin={() => setView("login")} onRegister={() => setView("register")} />;
    }
    if (view === "login_hq") {
      return <LoginScreen initialMode="login" forceHQ onBack={() => setView("landing")} />;
    }
    return (
      <LoginScreen
        initialMode={view === "register" ? "signup" : "login"}
        onBack={() => setView("landing")}
        onHQConsoleLink={() => setView("login_hq")}
      />
    );
  }

  return <>{children}</>;
};
