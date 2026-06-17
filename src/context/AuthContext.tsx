import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { type UserSessionProfile, type AuthState, type UserRole } from "../types";

interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string, initialRole?: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
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
          role: (session.user.user_metadata?.role as UserRole) || "TENANT_ADMIN",
          fullName: session.user.user_metadata?.fullName || "Account Operator",
          tenantId: session.user.user_metadata?.tenantId,
        };
        setState({ user: profile, loading: false, error: null, isMockUser: false });
      } else {
        setState({ user: null, loading: false, error: null, isMockUser: false });
      }
    });

    // Dengar perubahan sesi Supabase secara real-time
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const profile: UserSessionProfile = {
          id: session.user.id,
          email: session.user.email || "",
          role: (session.user.user_metadata?.role as UserRole) || "TENANT_ADMIN",
          fullName: session.user.user_metadata?.fullName || "Account Operator",
          tenantId: session.user.user_metadata?.tenantId,
        };
        setState({ user: profile, loading: false, error: null, isMockUser: false });
      } else {
        setState({ user: null, loading: false, error: null, isMockUser: false });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
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
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        // Tunjuk error sebenar — JANGAN bagi masuk
        setState(prev => ({
          ...prev,
          loading: false,
          error: "Email atau kata laluan tidak sah. Sila cuba lagi.",
        }));
        return;
      }

      if (data.user) {
        const profile: UserSessionProfile = {
          id: data.user.id,
          email: data.user.email || "",
          role: (data.user.user_metadata?.role as UserRole) || "TENANT_ADMIN",
          fullName: data.user.user_metadata?.fullName || "Account Operator",
          tenantId: data.user.user_metadata?.tenantId,
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
    initialRole: UserRole = "TENANT_ADMIN"
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

  const signOut = async () => {
    setState(prev => ({ ...prev, loading: true }));

    if (supabase) {
      await supabase.auth.signOut();
    }

    localStorage.removeItem("mykerani_mock_user");
    localStorage.removeItem("mykerani_auth_bypass");
    setState({ user: null, loading: false, error: null, isMockUser: false });
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        signIn,
        signUp,
        signOut,
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
