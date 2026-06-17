import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { type UserSessionProfile, type AuthState, type UserRole } from "../types";

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
  signUp: (email: string, password: string, fullName: string, initialRole?: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ success: boolean; message: string }>;
  clearError: () => void;
  toggleBypassAuth: (enabled: boolean) => void;
  isMockUser: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
      if (error) {
        setState({ user: null, loading: false, error: error.message, isMockUser: false });
        return;
      }

      if (session?.user) {
        const profile: UserSessionProfile = {
          id: session.user.id,
          email: session.user.email || "",
          role: (session.user.user_metadata?.role as UserRole) || "TENANT_OWNER",
          fullName: session.user.user_metadata?.fullName || "Account Operator",
          tenantId: session.user.user_metadata?.tenantId,
        };
        setState({ user: profile, loading: false, error: null, isMockUser: false });
      } else {
        setState({ user: null, loading: false, error: null, isMockUser: false });
      }
    });

    // Dengar perubahan sesi Supabase secara real-time
    // PENTING: jangan override state kalau sedang dalam demo/mock mode
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(prev => {
        if (prev.isMockUser) return prev; // demo session aktif — ignore Supabase event
        if (session?.user) {
          return {
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
          };
        }
        return { user: null, loading: false, error: null, isMockUser: false };
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    const cleanEmail = email.trim().toLowerCase();

    // Demo accounts — sesi mock dibuat HANYA apabila user ketap butang secara eksplisit.
    // Tiada auto-login. Tiada simpanan ke localStorage.
    const demoAccount = DEMO_ACCOUNTS[cleanEmail];
    if (demoAccount) {
      const mockProfile: UserSessionProfile = {
        id: `demo-${cleanEmail.split("@")[0]}`,
        email: cleanEmail,
        fullName: demoAccount.fullName,
        role: demoAccount.role,
        tenantId: demoAccount.tenantId,
      };
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
          const newTenantId   = crypto.randomUUID();
          const newWorkspaceId = crypto.randomUUID();
          const bizName = fullName;

          await supabase.from("tenants").insert({ id: newTenantId, name: bizName, category: "USER" });
          await supabase.from("workspaces").insert({ id: newWorkspaceId, tenant_id: newTenantId, name: bizName, slug: newTenantId.slice(0, 8), is_active: true });
          await supabase.from("user_role_assignments").insert({
            user_id: data.user.id, email: cleanEmail, full_name: fullName,
            role: "TENANT_OWNER", tenant_id: newTenantId,
          });

          // Save tenantId to user metadata for next login
          await supabase.auth.updateUser({ data: { tenantId: newTenantId, role: "TENANT_OWNER", fullName } });
          tenantId = newTenantId;
          role     = "TENANT_OWNER";
        }

        const profile: UserSessionProfile = {
          id: data.user.id,
          email: data.user.email || "",
          role,
          fullName,
          tenantId,
        };
        setState({ user: profile, loading: false, error: null, isMockUser: false });
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
  ) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    if (!isSupabaseConfigured() || !supabase) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: "Sistem pengesahan tidak dikonfigurasi. Sila hubungi pentadbir.",
      }));
      return;
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
        return;
      }

      if (data.user) {
        const profile: UserSessionProfile = {
          id: data.user.id,
          email: data.user.email || "",
          role: initialRole,
          fullName,
          tenantId: data.user.user_metadata?.tenantId,
        };
        setState({ user: profile, loading: false, error: null, isMockUser: false });
      } else {
        // Supabase hantar email pengesahan — user perlu verify dulu
        setState({
          user: null,
          loading: false,
          error: null,
          isMockUser: false,
        });
      }
    } catch (err: any) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: "Ralat pendaftaran. Sila cuba lagi.",
      }));
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

  const signOut = async () => {
    setState(prev => ({ ...prev, loading: true }));

    // Hanya panggil Supabase signOut untuk user sebenar (bukan demo)
    if (supabase && !state.isMockUser) {
      await supabase.auth.signOut();
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
