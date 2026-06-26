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
  // AUTH-02B — set true when Supabase fires PASSWORD_RECOVERY (user clicked
  // the "reset password" link in their e-mail). The UI must show a "Set New
  // Password" screen instead of the normal app while this is true.
  passwordRecoveryMode: boolean;
  setNewPasswordAfterRecovery: (newPassword: string) => Promise<{ success: boolean; message: string }>;
  cancelPasswordRecovery: () => void;
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

  // AUTH-02B — true between the moment Supabase fires PASSWORD_RECOVERY
  // (user clicked the e-mail link) and the moment they successfully set a
  // new password (or cancel). Guard.tsx renders a dedicated screen while
  // this is true, regardless of whatever `user` session state exists.
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(false);

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

    // Resolve the user's role from user_role_assignments DB table (the single
    // Source of Truth). Never falls back to TENANT_OWNER — if the DB lookup
    // fails or returns no row, loading stays true and a error is surfaced.
    const resolveUserRole = async (authUser: any): Promise<UserSessionProfile> => {
      const { data: roleRows } = await supabase!
        .from("user_role_assignments")
        .select("role, tenant_id, full_name")
        .eq("user_id", authUser.id)
        .limit(1);

      let tenantId = authUser.user_metadata?.tenantId;
      let role = (authUser.user_metadata?.role as UserRole) || undefined;
      let fullName = authUser.user_metadata?.fullName || authUser.email?.split("@")[0] || "Pengguna";

      if (roleRows && roleRows.length > 0) {
        tenantId = roleRows[0].tenant_id;
        role = roleRows[0].role as UserRole;
        fullName = roleRows[0].full_name || fullName;
      }

      // If role is still undefined after DB lookup, this is an unknown state —
      // do NOT default to TENANT_OWNER. Sign the user out so they can re-auth.
      if (!role) {
        throw new Error("Peranan pengguna tidak dijumpai. Sila log masuk semula.");
      }

      return {
        id: authUser.id,
        email: authUser.email || "",
        role,
        fullName,
        tenantId,
      };
    };

    // Semak sesi Supabase yang aktif
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (isMockRef.current) return; // demo aktif — jangan override (ref synchronous)
      if (error) { setState({ user: null, loading: false, error: error.message, isMockUser: false }); return; }
      if (session?.user) {
        try {
          const profile = await resolveUserRole(session.user);
          setState({ user: profile, loading: false, error: null, isMockUser: false });
        } catch (err: any) {
          // Role resolution failed — sign out and surface error. Never render
          // with a guessed/default role.
          await supabase!.auth.signOut();
          setState({ user: null, loading: false, error: err?.message || "Sessi tidak sah. Sila log masuk semula.", isMockUser: false });
        }
      } else {
        setState({ user: null, loading: false, error: null, isMockUser: false });
      }
    });

    // Dengar perubahan sesi Supabase — ref guard memastikan demo session tidak ditimpa
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (isMockRef.current) return; // demo aktif — abaikan semua Supabase events

      // AUTH-02B — Supabase fires this event when the user lands back on the
      // app via the password-reset e-mail link (it creates a transient
      // recovery session). Switch the whole app into a "Set New Password"
      // screen instead of routing them into the dashboard with whatever
      // stale password they still have.
      if (_event === "PASSWORD_RECOVERY") {
        setPasswordRecoveryMode(true);
      }

      // Skip INITIAL_SESSION — handled by getSession above to avoid double-fire
      if (_event === "INITIAL_SESSION") return;

      if (session?.user) {
        try {
          const profile = await resolveUserRole(session.user);
          setState({ user: profile, loading: false, error: null, isMockUser: false });
        } catch (err: any) {
          await supabase!.auth.signOut();
          setState({ user: null, loading: false, error: err?.message || "Sessi tidak sah. Sila log masuk semula.", isMockUser: false });
        }
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
        let role       = (data.user.user_metadata?.role as UserRole) || undefined;
        let fullName   = data.user.user_metadata?.fullName || data.user.email?.split("@")[0] || "Pengguna";

        if (roleRows && roleRows.length > 0) {
          // Use DB record — more reliable than metadata
          tenantId = roleRows[0].tenant_id;
          role     = roleRows[0].role as UserRole;
          fullName = roleRows[0].full_name || fullName;
        } else if (data.user.user_metadata?.role && data.user.user_metadata.role !== "TENANT_OWNER" && data.user.user_metadata?.tenantId) {
          // BUG FIX (AUTH-02A): no row in user_role_assignments does NOT
          // always mean "brand-new self-registrant." An invited TENANT_STAFF/
          // HQ_STAFF/HQ_OWNER account is created with role+tenantId already
          // stamped into user_metadata by /api/admin/create-staff — if that
          // row insert is ever missing (e.g. transient failure), the OLD
          // behavior here silently demoted/reprovisioned them as a brand-new
          // TENANT_OWNER in a new tenant, discarding the invite. Detect this
          // signal (a non-owner role + a tenantId already present in
          // metadata) and self-heal the missing row into the INVITED
          // tenant/role instead of ever calling provisionNewTenant().
          const invitedRole = data.user.user_metadata.role as UserRole;
          const invitedTenantId = data.user.user_metadata.tenantId as string;
          await supabase.from("user_role_assignments").insert({
            user_id: data.user.id, email: cleanEmail, full_name: fullName,
            role: invitedRole, tenant_id: invitedTenantId,
          });
          tenantId = invitedTenantId;
          role     = invitedRole;
        } else {
          // Genuine first login with no invite signal at all — auto-provision
          // a brand-new tenant + workspace + role assignment (self-registration).
          const provisioned = await provisionNewTenant(data.user.id, cleanEmail, fullName);
          tenantId = provisioned.tenantId;
          role     = provisioned.role;
        }

        const profile: UserSessionProfile = {
          id: data.user.id,
          email: data.user.email || "",
          role: role as UserRole,
          fullName,
          tenantId,
        };
        // Safety net: if role is still undefined after all resolution paths,
        // refuse to sign in rather than defaulting to TENANT_OWNER.
        if (!profile.role) {
          setState(prev => ({ ...prev, loading: false, error: "Peranan pengguna tidak dapat ditentukan. Sila hubungi pentadbir." }));
          return;
        }
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
          emailRedirectTo: window.location.origin,
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

  // AUTH-02B — called from the "Set New Password" screen shown while
  // passwordRecoveryMode is true. Uses the transient recovery session
  // Supabase already created when the user clicked the e-mail link, so no
  // separate token handling is needed here.
  const setNewPasswordAfterRecovery = async (newPassword: string): Promise<{ success: boolean; message: string }> => {
    if (!isSupabaseConfigured() || !supabase) {
      return { success: false, message: "Sistem tidak dikonfigurasi. Sila hubungi pentadbir." };
    }
    if (!newPassword || newPassword.length < 6) {
      return { success: false, message: "Kata laluan mestilah sekurang-kurangnya 6 aksara." };
    }
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        return { success: false, message: error.message };
      }
      setPasswordRecoveryMode(false);
      return { success: true, message: "Kata laluan baharu berjaya ditetapkan. Sila log masuk semula." };
    } catch {
      return { success: false, message: "Ralat sambungan. Sila cuba lagi." };
    }
  };

  // Lets the user back out of the recovery screen (e.g. opened the link by
  // mistake) without setting a new password — falls back to a normal
  // sign-out so they land on the regular login screen.
  const cancelPasswordRecovery = () => {
    setPasswordRecoveryMode(false);
    if (supabase) {
      supabase.auth.signOut().catch(() => {});
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
        passwordRecoveryMode,
        setNewPasswordAfterRecovery,
        cancelPasswordRecovery,
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
