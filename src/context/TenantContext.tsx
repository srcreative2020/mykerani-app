import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { useAuth } from "./AuthContext";
import { type Tenant, type TenantState, type TenantCategory } from "../types";
import { PERMANENT_DEMO_TENANT_ID } from "../lib/seeder";

interface TenantContextType extends TenantState {
  createTenant: (name: string, category: TenantCategory) => Promise<Tenant>;
  selectTenant: (tenantId: string) => void;
  clearTenantError: () => void;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

// Core default sandbox tenants including the permanent sales/presentation tenant
const DEFAULT_MOCK_TENANTS: Tenant[] = [
  { id: PERMANENT_DEMO_TENANT_ID, name: "MYKERANI Urus Niaga Utama", category: "DEMO" },
  { id: "tenant-hq-0001", name: "MYKERANI Kawalan Pentadbiran Utama", category: "HQ" },
  { id: "tenant-demo-8bit", name: "LemonTree Bakery (Akaun Utama)", category: "DEMO" },
  { id: "tenant-user-1234", name: "Apex Engineering & Consulting MY", category: "USER" },
];

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isMockUser } = useAuth();
  const [state, setState] = useState<TenantState>({
    tenants: [],
    activeTenant: null,
    loading: true,
    error: null,
  });

  const clearTenantError = () => setState(prev => ({ ...prev, error: null }));

  // Load Tenants list
  useEffect(() => {
    if (!user) {
      setState({ tenants: [], activeTenant: null, loading: false, error: null });
      return;
    }

    const loadTenants = async () => {
      setState(prev => ({ ...prev, loading: true, error: null }));

      if (!isSupabaseConfigured() || isMockUser) {
        // --- SANDBOX / MOCK FLOW ---
        // Retrieve custom tenants list from localStorage or standard list
        const storedTenantsRaw = localStorage.getItem(`mykerani_tenants_${user.id}`);
        let tenantList: Tenant[] = [];
        
        if (storedTenantsRaw) {
          try {
            tenantList = JSON.parse(storedTenantsRaw);
          } catch {
            tenantList = [...DEFAULT_MOCK_TENANTS];
          }
        } else {
          // Initialize for this specific mock user
          tenantList = [...DEFAULT_MOCK_TENANTS];
          // If user email has specifiers, we can make their primary tenant matches role
          if (user.role === "HQ_OWNER") {
            // First item is active
          }
          localStorage.setItem(`mykerani_tenants_${user.id}`, JSON.stringify(tenantList));
        }

        // Selected Tenant
        const lastSelectedId = localStorage.getItem(`mykerani_active_tenant_${user.id}`);
        let active = tenantList.find(t => t.id === lastSelectedId);
        
        if (!active && tenantList.length > 0) {
          // Fallback based on user context
          if (user.role === "HQ_OWNER" || user.role === "HQ_STAFF") {
            active = tenantList.find(t => t.category === "HQ") || tenantList[0];
          } else {
            active = tenantList.find(t => t.category !== "HQ") || tenantList[0];
          }
        }

        setState({
          tenants: tenantList,
          activeTenant: active || null,
          loading: false,
          error: null,
        });
      } else {
        // --- REAL SUPABASE CLIENT FLOW ---
        if (!supabase) return;

        try {
          // Retrieve tenants associated with user session.
          // Note that a newly registered user might not have a tenant yet, so we query or auto-initialize one.
          const { data: tenantsData, error: dbError } = await supabase
            .from("tenants")
            .select("*");

          if (dbError) {
            console.warn("Tenants table not ready:", dbError.message);
            // Real user: buat tenant dari metadata user — JANGAN guna demo tenant
            const userTenantId = user.tenantId || `tenant-${user.id.slice(0, 8)}`;
            const category: TenantCategory = (user.role === "HQ_OWNER" || user.role === "HQ_STAFF") ? "HQ" : "USER";
            const realTenant: Tenant = {
              id: userTenantId,
              name: (user.role === "HQ_OWNER" || user.role === "HQ_STAFF") ? "MYKERANI HQ" : (user.fullName ? `${user.fullName} - Syarikat` : "Syarikat Saya"),
              category,
            };
            setState({ tenants: [realTenant], activeTenant: realTenant, loading: false, error: null });
            return;
          }

          if (tenantsData && tenantsData.length > 0) {
            const mappedTenants: Tenant[] = tenantsData.map(row => ({
              id: row.id,
              name: row.name,
              category: row.category as TenantCategory,
              createdAt: row.created_at,
            }));

            // Always ensure Permanent Demo Tenant is present for seamless sales demonstrations
            if (!mappedTenants.some(t => t.id === PERMANENT_DEMO_TENANT_ID)) {
              mappedTenants.unshift({
                id: PERMANENT_DEMO_TENANT_ID,
                name: "MYKERANI Urus Niaga Utama",
                category: "DEMO",
              });
            }

            // Restore from localStorage setting
            const lastSelectedId = localStorage.getItem(`mykerani_active_tenant_${user.id}`);
            let active = mappedTenants.find(t => t.id === lastSelectedId) || mappedTenants[0];

            setState({
              tenants: mappedTenants,
              activeTenant: active,
              loading: false,
              error: null,
            });
          } else {
            // Create a default tenant since none exists
            const defaultName = `${user.fullName || "Operator"}'s Venture`;
            const { data: newTenant, error: createError } = await supabase
              .from("tenants")
              .insert({
                name: defaultName,
                category: (user.role === "HQ_OWNER" || user.role === "HQ_STAFF") ? "HQ" : "USER",
              })
              .select()
              .single();

            if (createError) {
              throw createError;
            }

            const mapped: Tenant = {
              id: newTenant.id,
              name: newTenant.name,
              category: newTenant.category as TenantCategory,
              createdAt: newTenant.created_at,
            };

            setState({
              tenants: [mapped],
              activeTenant: mapped,
              loading: false,
              error: null,
            });
          }
        } catch (err: any) {
          setState(prev => ({
            ...prev,
            loading: false,
            error: err?.message || String(err),
          }));
        }
      }
    };

    loadTenants();
  }, [user, isMockUser]);

  // Create a new Tenant
  const createTenant = async (name: string, category: TenantCategory): Promise<Tenant> => {
    if (!user) {
      throw new Error("User session is required to initialize organizational tenants.");
    }

    if (!isSupabaseConfigured() || isMockUser) {
      // --- SANDBOX CREATE ---
      const newTenant: Tenant = {
        id: `tenant-${category.toLowerCase()}-${Math.floor(Math.random() * 100000)}`,
        name,
        category,
        createdAt: new Date().toISOString(),
      };

      const updatedList = [...state.tenants, newTenant];
      localStorage.setItem(`mykerani_tenants_${user.id}`, JSON.stringify(updatedList));

      setState(prev => ({
        ...prev,
        tenants: updatedList,
        activeTenant: prev.activeTenant || newTenant,
      }));

      return newTenant;
    } else {
      // --- REAL SUPABASE CREATE ---
      if (!supabase) throw new Error("Supabase client is not instantiated");

      const { data, error: dbError } = await supabase
        .from("tenants")
        .insert({ name, category })
        .select()
        .single();

      if (dbError) {
        throw dbError;
      }

      const tenant: Tenant = {
        id: data.id,
        name: data.name,
        category: data.category as TenantCategory,
        createdAt: data.created_at,
      };

      setState(prev => ({
        ...prev,
        tenants: [...prev.tenants, tenant],
        activeTenant: prev.activeTenant || tenant,
      }));

      return tenant;
    }
  };

  // Switch Active Tenant
  const selectTenant = (tenantId: string) => {
    if (!user) return;

    const target = state.tenants.find(t => t.id === tenantId);
    if (target) {
      localStorage.setItem(`mykerani_active_tenant_${user.id}`, tenantId);
      setState(prev => ({ ...prev, activeTenant: target }));
    }
  };

  return (
    <TenantContext.Provider
      value={{
        ...state,
        createTenant,
        selectTenant,
        clearTenantError,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error("useTenant must be used inside a TenantProvider");
  }
  return context;
};
