import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { type UserSessionProfile, type AuthState, type UserRole } from "../types";

interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string, initialRole?: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
  toggleBypassAuth: (enabled: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
    isMockUser: false,
  });

  // Track if bypass mode is manually selected to test the screens immediately
  const [useBypass, setUseBypass] = useState<boolean>(() => {
    return localStorage.getItem("mykerani_auth_bypass") === "true";
  });

  const clearError = () => setState(prev => ({ ...prev, error: null }));

  const toggleBypassAuth = (enabled: boolean) => {
    localStorage.setItem("mykerani_auth_bypass", String(enabled));
    setUseBypass(enabled);
    if (!enabled) {
      // Clear out mock user
      setState(prev => ({ ...prev, user: null, isMockUser: false }));
    }
  };

  // Setup actual Supabase auth listeners or trigger fallback modes
  useEffect(() => {
    // Certified demo user bypass to prevent Supabase rate-limiting issues
    const cachedMockUser = localStorage.getItem("mykerani_mock_user");
    if (cachedMockUser) {
      try {
        const parsed = JSON.parse(cachedMockUser);
        if (parsed && ["hq@mykerani.demo", "owner@mykerani.demo", "staff@mykerani.demo"].includes(parsed.email)) {
          setState({
            user: parsed,
            loading: false,
            error: null,
            isMockUser: true,
          });
          return;
        }
      } catch (e) {}
    }

    if (!isSupabaseConfigured() || useBypass) {
      // Local development bypass modes
      if (cachedMockUser) {
        try {
          const parsed = JSON.parse(cachedMockUser);
          setState({
            user: parsed,
            loading: false,
            error: null,
            isMockUser: true,
          });
        } catch {
          setState({ user: null, loading: false, error: null, isMockUser: true });
        }
      } else {
        setState({ user: null, loading: false, error: null, isMockUser: true });
      }
      return;
    }

    if (!supabase) return;

    // Load active session immediately 
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        setState(prev => ({ ...prev, error: error.message, loading: false }));
        return;
      }

      if (session?.user) {
        // Build user profile mapping 
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

    // Listen on session state shifts
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
  }, [useBypass]);

  const signIn = async (email: string, password: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    // Predefined demo accounts bypass logic to avoid Supabase email rate limits
    if (["hq@mykerani.demo", "owner@mykerani.demo", "staff@mykerani.demo"].includes(email)) {
      if (password !== "MyKerani@123") {
        setState(prev => ({
          ...prev,
          loading: false,
          error: "Kata laluan tidak sah untuk akaun demo.",
        }));
        return;
      }

      let selectedRole: UserRole = "TENANT_ADMIN";
      let resolvedName = "Demonstration User";
      let selectedTenantId = "tenant-demo-8bit";

      if (email === "hq@mykerani.demo") {
        selectedRole = "HQ_ADMIN";
        resolvedName = "HQ Operator";
        selectedTenantId = "tenant-hq-0001";
      } else if (email === "owner@mykerani.demo") {
        selectedRole = "TENANT_ADMIN";
        resolvedName = "Tenant Owner";
        selectedTenantId = "tenant-demo-8bit";
      } else if (email === "staff@mykerani.demo") {
        selectedRole = "STAFF";
        resolvedName = "Staff Account";
        selectedTenantId = "tenant-demo-8bit";
      }

      const mockProfile: UserSessionProfile = {
        id: `mock-id-${resolvedName.toLowerCase().replace(/\s+/g, "-")}`,
        email,
        fullName: resolvedName,
        role: selectedRole,
        tenantId: selectedTenantId,
      };

      localStorage.setItem("mykerani_mock_user", JSON.stringify(mockProfile));
      setState({
        user: mockProfile,
        loading: false,
        error: null,
        isMockUser: true,
      });
      return;
    }

    if (!isSupabaseConfigured() || useBypass) {
      // Local development mock registration checks
      if (email && password.length >= 6) {
        let selectedRole: UserRole = "TENANT_ADMIN";
        let resolvedName = email.split("@")[0].toUpperCase();
        let selectedTenantId = "tenant-demo-8bit";

        if (email === "hq@mykerani.demo") {
          selectedRole = "HQ_ADMIN";
          resolvedName = "HQ Operator";
          selectedTenantId = "tenant-hq-0001";
        } else if (email === "owner@mykerani.demo") {
          selectedRole = "TENANT_ADMIN";
          resolvedName = "Tenant Owner";
          selectedTenantId = "tenant-demo-8bit";
        } else if (email === "staff@mykerani.demo") {
          selectedRole = "STAFF";
          resolvedName = "Staff Account";
          selectedTenantId = "tenant-demo-8bit";
        } else {
          // Standard mock logons
          selectedRole = "TENANT_ADMIN";
        }

        // Create matching mock credentials
        const mockProfile: UserSessionProfile = {
          id: `mock-id-${resolvedName.toLowerCase()}`,
          email,
          fullName: resolvedName,
          role: selectedRole,
          tenantId: selectedTenantId,
        };
        localStorage.setItem("mykerani_mock_user", JSON.stringify(mockProfile));
        setState({
          user: mockProfile,
          loading: false,
          error: null,
          isMockUser: true,
        });
      } else {
        setState(prev => ({
          ...prev,
          loading: false,
          error: "Simple bypass authentication requires email and password >= 6 chars.",
        }));
      }
      return;
    }

    if (!supabase) throw new Error("Supabase is not configured.");

    const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // Auto-register pre-defined demo profiles if missing on newly provisioned Supabase DBs
      if (
        (error.message?.toLowerCase().includes("invalid login credentials") ||
         error.message?.toLowerCase().includes("user not found")) &&
        ["hq@mykerani.demo", "owner@mykerani.demo", "staff@mykerani.demo"].includes(email) &&
        password === "MyKerani@123"
      ) {
        let proposedRole: UserRole = "TENANT_ADMIN";
        let proposedName = "Account Operator";
        if (email === "hq@mykerani.demo") {
          proposedRole = "HQ_ADMIN";
          proposedName = "HQ Operator";
        } else if (email === "owner@mykerani.demo") {
          proposedRole = "TENANT_ADMIN";
          proposedName = "Tenant Owner";
        } else if (email === "staff@mykerani.demo") {
          proposedRole = "STAFF";
          proposedName = "Staff Account";
        }

        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              fullName: proposedName,
              role: proposedRole,
            },
          },
        });

        if (!signUpError) {
          // Retry signing in now that they are seeded
          const { error: reSignInError } = await supabase.auth.signInWithPassword({ email, password });
          if (reSignInError) {
            setState(prev => ({ ...prev, loading: false, error: reSignInError.message }));
          } else {
            setState(prev => ({ ...prev, loading: false }));
          }
        } else {
          setState(prev => ({ ...prev, loading: false, error: `Automated demo seeding failed: ${signUpError.message}` }));
        }
      } else {
        setState(prev => ({ ...prev, loading: false, error: error.message }));
      }
    }
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    initialRole: UserRole = "TENANT_ADMIN"
  ) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    if (!isSupabaseConfigured() || useBypass) {
      const mockProfile: UserSessionProfile = {
        id: `mock-id-${Date.now()}`,
        email,
        fullName,
        role: initialRole,
        tenantId: `tenant-${Math.floor(Math.random() * 10000)}`,
      };
      localStorage.setItem("mykerani_mock_user", JSON.stringify(mockProfile));
      setState({
        user: mockProfile,
        loading: false,
        error: null,
        isMockUser: true,
      });
      return;
    }

    if (!supabase) throw new Error("Supabase is not configured.");

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          fullName,
          role: initialRole,
        },
      },
    });

    if (error) {
      setState(prev => ({ ...prev, loading: false, error: error.message }));
    } else {
      setState(prev => ({ ...prev, loading: false }));
    }
  };

  const signOut = async () => {
    setState(prev => ({ ...prev, loading: true }));

    if (!isSupabaseConfigured() || useBypass) {
      localStorage.removeItem("mykerani_mock_user");
      setState({ user: null, loading: false, error: null, isMockUser: true });
      return;
    }

    if (supabase) {
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
