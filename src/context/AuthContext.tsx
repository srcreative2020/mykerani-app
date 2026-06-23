import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { type UserSessionProfile, type AuthState, type UserRole } from "../types";
import { logEvent } from "../lib/eventLog";
import { endActiveSession } from "../lib/chatSession";

// Akaun demo untuk presentation/sales — hanya aktif bila user ketap butang secara
// eksplisit. Tidak boleh auto-login. Tenant ID diselaraskan dengan DEFAULT_MOCK_TENANTS.
const DEMO_ACCOUNTS: Record<string, { role: UserRole; fullName: string; tenantId: string }> = {
  "hq@mykerani.demo":      { role: "HQ_OWNER",       fullName: "Pemilik HQ MyKerani",    tenantId: "tenant-hq-0001" },
  "hqstaff@mykerani.demo": { role: "HQ_STAFF",        fullName: "Kakitangan HQ",          tenantId: "tenant-hq-0001" },
  "owner@mykerani.demo":   { role: "TENANT_OWNER",    fullName: "Pemilik Perniagaan",     tenantId: "tenant-demo-presentation" },
  "staff@mykerani.demo":   { role: "TENANT_STAFF",    fullName: "Kakitangan Syarikat",    tenantId: "tenant-demo-presentation" },
};

interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string, initialRole?: UserRole) => Promise<{ pendingConfirmation: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ success: boolean; message: string }>;
  updateProfile: (fullName: string, email: string) => Promise<{ success: boolean; message: string }>;
  clearError: () => void;
  toggleBypassAuth: (enabled: boolean) => void;
  isMockUser: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Ref untuk track mock mode secara synchronous — tidak bergantung pada React batching
  const isMockRef = useRef(false);

  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
    isMockUser: false,
  });

  const clearError = () => setState(prev => ({ ...prev, error: null }));

  // toggleBypassAuth dikekalkan untuk keserasian komponen lain
  // tetapi tidak lagi melakukan apa-apa dalam production
  const toggleBypassAuth = (_enabled: boolean) => {
    // Disabled — tiada bypass mode dalam production
  };

  useEffect(() => {
    // Buang semua mock/cache lama dari sesi sebelum fix ini
    localStorage.removeItem("mykerani_mock_user");
    localStorage.removeItem("mykerani_auth_bypass");

    if (!isSupabaseConfigured() || !supabase) {
      // Supabase tidak dikonfigurasi — tunjuk error, jangan bagi masuk
      setState({
        user: null,
        loading: false,
        error: "Sistem tidak dikonfigurasi. Sila hubungi pentadbir.",
        isMockUser: false,
      });
      return;
    }

    // Semak sesi Supabase yang aktif
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (isMockRef.current) return; // demo aktif — jangan override (ref synchronous)
      if (error) { setState({ user: null, loading: false, error: error.message, isMockUser: false }); return; }
      if (session?.user) {
        setState({
          user: {
            id: session.user.id,
            email: session.user.email || "",
            role: (session.user.user_metadata?.role as UserRole) || "TENANT_OWNER",
            fullName: session.user.user_metadata?.fullName || "Account Operator",
            tenantId: session.user.user_metadata?.tenantId,
          },
          loading: false,
          error: null,
          isMockUser: false,
        });
      } else {
        setState({ user: null, loading: false, error: null, isMockUser: false });
      }
    });

    // Dengar perubahan sesi Supabase — ref guard memastikan demo session tidak ditimpa
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMockRef.current) return; // demo aktif — abaikan semua Supabase events
      if (session?.user) {
        setState({
          user: {
            id: session.user.id,
            email: session.user.email || "",
            role: (session.user.user_metadata?.role as UserRole) || "TENANT_OWNER",
            fullName: session.user.user_metadata?.fullName || "Account Operator",
            tenantId: session.user.user_metadata?.tenantId,
          },
          loading: false,
          error: null,
          isMockUser: false,
        });
      } else {
        setState({ user: null, loading: false, error: null, isMockUser: false });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Shared first-login provisioning — creates tenant + workspace + role
  // assignment row for a brand-new user, and mirrors tenantId/role/fullName
  // into auth user_metadata for subsequent sessions. Called from BOTH
  // signIn()'s no-role-row branch and signUp()'s immediate-session branch,
  // so a new user is identically provisioned regardless of which path
  // created their account. `bizName` defaults to "Nama Peribadi" — NEVER the
  // user's own full name — until Step 5 of onboarding lets them rename it.
  const provisionNewTenant = async (
    userId: string,
    email: string,
    fullName: string
  ): Promise<{ tenantId: string; role: UserRole }> => {
    if (!supabase) throw new Error("Supabase client is not instantiated");

    const newTenantId = crypto.randomUUID();
    const newWorkspaceId = crypto.randomUUID();
    const bizName = "Nama Peribadi";

    await supabase.from("tenants").insert({ id: newTenantId, name: bizName, category: "USER" });
    await supabase.from("workspaces").insert({ id: newWorkspaceId, tenant_id: newTenantId, name: bizName, slug: newTenantId.slice(0, 8), is_active: true });
    await supabase.from("user_role_assignments").insert({
      user_id: userId, email, full_name: fullName,
      role: "TENANT_OWNER", tenant_id: newTenantId,
    });

    // Save tenantId to user metadata for next login
    await supabase.auth.updateUser({ data: { tenantId: newTenantId, role: "TENANT_OWNER", fullName } });

    return { tenantId: newTenantId, role: "TENANT_OWNER" };
  };

  const signIn = async (email: string, password: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    const cleanEmail = email.trim().toLowerCase();

    // Demo accounts — sesi mock dibuat HANYA apabila user ketap butang secara eksplisit.
    // Tiada auto-login. Tiada simpanan ke localStorage.
    const demoAccount = DEMO_ACCOUNTS[cleanEmail];
    if (demoAccount) {
      // Set ref DAHULU (synchronous) sebelum apa-apa async — ini menghalang
      // onAuthStateChange daripada override walaupun ia fire pada masa yang sama
      isMockRef.current = true;
      if (supabase) {
        try { await supabase.auth.signOut(); } catch {}
      }
      const mockProfile: UserSessionProfile = {
        id: `demo-${cleanEmail.split("@")[0]}`,
        email: cleanEmail,
        fullName: demoAccount.fullName,
        role: demoAccount.role,
        tenantId: demoAccount.tenantId,
      };
      // Every explicit login (including demo) starts a brand-new chat session.
      await endActiveSession(mockProfile.id, true);
      setState({ user: mockProfile, loading: false, error: null, isMockUser: true });
      return;
    }

    // User sebenar — wajib melalui Supabase Auth
    if (!isSupabaseConfigured() || !supabase) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: "Sistem pengesahan tidak dikonfigurasi. Sila hubungi pentadbir.",
      }));
      return;
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: "Email atau kata laluan tidak sah. Sila cuba lagi.",
        }));
        return;
      }

      if (data.user) {
        // Lookup role assignment from DB (source of truth)
        const { data: roleRows } = await supabase
          .from("user_role_assignments")
          .select("role, tenant_id, full_name")
          .eq("user_id", data.user.id)
          .limit(1);

        let tenantId   = data.user.user_metadata?.tenantId;
        let role       = (data.user.user_metadata?.role as UserRole) || "TENANT_OWNER";
        let fullName   = data.user.user_metadata?.fullName || data.user.email?.split("@")[0] || "Pengguna";

        if (roleRows && roleRows.length > 0) {
          // Use DB record — more reliable than metadata
          tenantId = roleRows[0].tenant_id;
          role     = roleRows[0].role as UserRole;
          fullName = roleRows[0].full_name || fullName;
        } else {
          // First login — auto-provision tenant + workspace + role assignment
          const provisioned = await provisionNewTenant(data.user.id, cleanEmail, fullName);
          tenantId = provisioned.tenantId;
          role     = provisioned.role;
        }

        const profile: UserSessionProfile = {
          id: data.user.id,
          email: data.user.email || "",
          role,
          fullName,
          tenantId,
        };
        // Every explicit login starts a brand-new chat session — archives
        // whatever was active in this browser before, per product requirement
        // (refresh resumes a session, login never does).
        await endActiveSession(profile.id, false);
        setState({ user: profile, loading: false, error: null, isMockUser: false });
        logEvent({ tenantId, userId: profile.id, userEmail: profile.email, userRole: profile.role, eventType: "LOGIN" });
      }
    } catch (err: any) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: "Ralat sambungan. Sila periksa internet anda dan cuba lagi.",
      }));
    }
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    initialRole: UserRole = "TENANT_OWNER"
  ): Promise<{ pendingConfirmation: boolean }> => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    if (!isSupabaseConfigured() || !supabase) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: "Sistem pengesahan tidak dikonfigurasi. Sila hubungi pentadbir.",
      }));
      return { pendingConfirmation: false };
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            fullName,
            role: initialRole,
          },
        },
      });

      if (error) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: error.message,
        }));
        return { pendingConfirmation: false };
      }

      if (data.session && data.user) {
        // Email confirmation is OFF (or auto-confirmed) — session present
        // immediately. Provision the same tenant/workspace/role-assignment
        // that signIn() creates on a first login, so this brand-new user
        // never reaches the dashboard unprovisioned.
        const provisioned = await provisionNewTenant(data.user.id, data.user.email || email, fullName);
        const profile: UserSessionProfile = {
          id: data.user.id,
          email: data.user.email || "",
          role: provisioned.role,
          fullName,
          tenantId: provisioned.tenantId,
        };
        setState({ user: profile, loading: false, error: null, isMockUser: false });
        return { pendingConfirmation: false };
      }

      // No session yet — Supabase hantar email pengesahan, user perlu
      // sahkan emel dahulu sebelum sesi sebenar dicipta. Provisioning
      // berlaku kemudian, pada signIn() pertama selepas pengesahan emel
      // (no-role-row branch), bukan di sini — sebab tiada sesi sah lagi.
      setState({
        user: null,
        loading: false,
        error: null,
        isMockUser: false,
      });
      return { pendingConfirmation: true };
    } catch (err: any) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: "Ralat pendaftaran. Sila cuba lagi.",
      }));
      return { pendingConfirmation: false };
    }
  };

  const resetPassword = async (email: string): Promise<{ success: boolean; message: string }> => {
    const cleanEmail = email.trim().toLowerCase();

    // Demo accounts tidak boleh reset password
    if (DEMO_ACCOUNTS[cleanEmail]) {
      return { success: false, message: "Akaun demo tidak menyokong tetapan semula kata laluan." };
    }

    if (!isSupabaseConfigured() || !supabase) {
      return { success: false, message: "Sistem tidak dikonfigurasi. Sila hubungi pentadbir." };
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        return { success: false, message: error.message };
      }
      return { success: true, message: `E-mel tetapan semula telah dihantar ke ${cleanEmail}. Sila semak peti masuk anda.` };
    } catch {
      return { success: false, message: "Ralat sambungan. Sila cuba lagi." };
    }
  };

  const updateProfile = async (fullName: string, email: string): Promise<{ success: boolean; message: string }> => {
    if (!state.user) return { success: false, message: "Tiada sesi aktif." };
    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanName) return { success: false, message: "Nama tidak boleh kosong." };

    if (state.isMockUser) {
      setState(prev => ({ ...prev, user: prev.user ? { ...prev.user, fullName: cleanName } : prev.user }));
      return { success: false, message: "Akaun demo tidak boleh kemas kini profil." };
    }

    if (!isSupabaseConfigured() || !supabase) {
      return { success: false, message: "Sistem tidak dikonfigurasi. Sila hubungi pentadbir." };
    }

    try {
      const emailChanged = cleanEmail !== state.user.email.toLowerCase();
      const { error: authErr } = await supabase.auth.updateUser({
        data: { fullName: cleanName },
        ...(emailChanged ? { email: cleanEmail } : {}),
      });
      if (authErr) return { success: false, message: authErr.message };

      await supabase.from("user_role_assignments").update({ full_name: cleanName }).eq("user_id", state.user.id);

      setState(prev => ({ ...prev, user: prev.user ? { ...prev.user, fullName: cleanName } : prev.user }));

      return {
        success: true,
        message: emailChanged
          ? "Nama dikemas kini. Sila semak e-mel baharu anda untuk sahkan pertukaran e-mel."
          : "Profil dikemas kini.",
      };
    } catch (err: any) {
      return { success: false, message: "Ralat sambungan. Sila cuba lagi." };
    }
  };

  const signOut = async () => {
    isMockRef.current = false; // reset ref dulu supaya onAuthStateChange boleh fire
    setState(prev => ({ ...prev, loading: true }));

    if (state.user && !state.isMockUser) {
      logEvent({ tenantId: state.user.tenantId, userId: state.user.id, userEmail: state.user.email, userRole: state.user.role, eventType: "LOGOUT" });
    }

    if (supabase && !state.isMockUser) {
      await supabase.auth.signOut();
    }

    // Archive the current chat session so the next login starts fresh —
    // it stays reachable in Arkib Perbualan, just not auto-resumed.
    if (state.user) {
      await endActiveSession(state.user.id, state.isMockUser);
    }

    setState({ user: null, loading: false, error: null, isMockUser: false });
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        signIn,
        signUp,
        signOut,
        resetPassword,
        updateProfile,
        clearError,
        toggleBypassAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }
  return context;
};
