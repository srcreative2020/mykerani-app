import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { useAuth } from "./AuthContext";
import { useTenant } from "./TenantContext";
import { type Workspace, type WorkspaceState } from "../types";
import { PERMANENT_DEMO_TENANT_ID, PERMANENT_DEMO_WORKSPACES } from "../lib/seeder";
import { endActiveSession } from "../lib/chatSession";

interface WorkspaceContextType extends WorkspaceState {
  createWorkspace: (name: string, slug?: string, workspaceType?: string) => Promise<Workspace>;
  selectWorkspace: (workspaceId: string) => void;
  clearWorkspaceError: () => void;
  getWorkspaceHeaders: () => Record<string, string>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

// Core default sandbox workspaces per tenant
const getDefaultMockWorkspaces = (tenantId: string): Workspace[] => {
  if (tenantId === PERMANENT_DEMO_TENANT_ID) {
    return PERMANENT_DEMO_WORKSPACES;
  }
  return [
    { id: `ws-personal-${tenantId}`, tenantId, name: "Personal Workspace", slug: "personal", isActive: true },
    { id: `ws-company-a-${tenantId}`, tenantId, name: "Company A (Operations)", slug: "company-a", isActive: true },
    { id: `ws-company-b-${tenantId}`, tenantId, name: "Company B (Holding)", slug: "company-b", isActive: true },
    { id: `ws-company-c-${tenantId}`, tenantId, name: "Company C (Logistics)", slug: "company-c", isActive: true },
  ];
};

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isMockUser } = useAuth();
  const { activeTenant } = useTenant();

  const [state, setState] = useState<WorkspaceState>({
    workspaces: [],
    activeWorkspace: null,
    loading: true,
    error: null,
  });

  const clearWorkspaceError = () => setState(prev => ({ ...prev, error: null }));

  // Dynamic Workspace switching & contextual headers (X-Workspace-Id foundation)
  const getWorkspaceHeaders = (): Record<string, string> => {
    if (state.activeWorkspace) {
      return {
        "X-Workspace-Id": state.activeWorkspace.id,
        "X-Tenant-Id": activeTenant?.id || "",
      };
    }
    return {};
  };

  // Switch Workspace action
  const selectWorkspace = (workspaceId: string) => {
    if (!user || !activeTenant) return;

    const target = state.workspaces.find(ws => ws.id === workspaceId);
    if (target) {
      // Archive current chat session before switching workspace (M-02/L-08)
      if (state.activeWorkspace && state.activeWorkspace.id !== workspaceId) {
        endActiveSession(user.id, !isSupabaseConfigured() || isMockUser).catch(() => {});
      }
      localStorage.setItem(`mykerani_active_ws_${user.id}_${activeTenant.id}`, workspaceId);
      setState(prev => ({ ...prev, activeWorkspace: target }));
    }
  };

  // Load Workspaces list based on selected Active Tenant
  useEffect(() => {
    if (!user || !activeTenant) {
      setState({ workspaces: [], activeWorkspace: null, loading: false, error: null });
      return;
    }

    const loadWorkspaces = async () => {
      setState(prev => ({ ...prev, loading: true, error: null }));

      if (activeTenant.id === PERMANENT_DEMO_TENANT_ID) {
        const activeWSKey = `mykerani_active_ws_${user.id}_${activeTenant.id}`;
        const lastSelectedWSId = localStorage.getItem(activeWSKey);
        let active = PERMANENT_DEMO_WORKSPACES.find(ws => ws.id === lastSelectedWSId) || PERMANENT_DEMO_WORKSPACES[0];
        setState({
          workspaces: PERMANENT_DEMO_WORKSPACES,
          activeWorkspace: active,
          loading: false,
          error: null,
        });
        return;
      }

      if (!isSupabaseConfigured() || isMockUser) {
        // --- SANDBOX / MOCK FLOW ---
        const storedWSKey = `mykerani_workspaces_${user.id}_${activeTenant.id}`;
        const storedWS = localStorage.getItem(storedWSKey);
        let wsList: Workspace[] = [];

        if (storedWS) {
          try {
            wsList = JSON.parse(storedWS);
          } catch {
            wsList = getDefaultMockWorkspaces(activeTenant.id);
          }
        } else {
          wsList = getDefaultMockWorkspaces(activeTenant.id);
          localStorage.setItem(storedWSKey, JSON.stringify(wsList));
        }

        // Restore active workspace
        const activeWSKey = `mykerani_active_ws_${user.id}_${activeTenant.id}`;
        const lastSelectedWSId = localStorage.getItem(activeWSKey);
        let active = wsList.find(ws => ws.id === lastSelectedWSId);

        if (!active && wsList.length > 0) {
          active = wsList[0];
          localStorage.setItem(activeWSKey, active.id);
        }

        setState({
          workspaces: wsList,
          activeWorkspace: active || null,
          loading: false,
          error: null,
        });
      } else {
        // --- REAL SUPABASE CLIENT FLOW ---
        if (!supabase) return;

        try {
          const { data: wsData, error: dbError } = await supabase
            .from("workspaces")
            .select("*")
            .eq("tenant_id", activeTenant.id);

          if (dbError) {
            console.warn("Workspaces table not ready:", dbError.message);
            // Real user: buat satu workspace kosong dari tenant — JANGAN guna demo workspaces
            const realWS: Workspace = {
              id: `ws-main-${activeTenant.id}`,
              tenantId: activeTenant.id,
              name: user?.fullName ? `${user.fullName} - Workspace` : "Workspace Utama",
              slug: "main",
              isActive: true,
            };
            setState({ workspaces: [realWS], activeWorkspace: realWS, loading: false, error: null });
            return;
          }

          if (wsData && wsData.length > 0) {
            const mappedWorkspaces: Workspace[] = wsData.map(row => ({
              id: row.id,
              tenantId: row.tenant_id,
              name: row.name,
              slug: row.slug,
              isActive: row.is_active,
              createdAt: row.created_at,
            }));

            // Restore from localStorage
            const activeWSKey = `mykerani_active_ws_${user.id}_${activeTenant.id}`;
            const lastSelectedWSId = localStorage.getItem(activeWSKey);
            let active = mappedWorkspaces.find(ws => ws.id === lastSelectedWSId) || mappedWorkspaces[0];

            setState({
              workspaces: mappedWorkspaces,
              activeWorkspace: active,
              loading: false,
              error: null,
            });
          } else {
            // Seed a default Workspace if none exists
            const defaultName = "Personal Workspace";
            const defaultSlug = "personal";

            const { data: newWS, error: createError } = await supabase
              .from("workspaces")
              .insert({
                tenant_id: activeTenant.id,
                name: defaultName,
                slug: defaultSlug,
                is_active: true,
              })
              .select()
              .single();

            if (createError) {
              throw createError;
            }

            const mapped: Workspace = {
              id: newWS.id,
              tenantId: newWS.tenant_id,
              name: newWS.name,
              slug: newWS.slug,
              isActive: newWS.is_active,
              createdAt: newWS.created_at,
            };

            setState({
              workspaces: [mapped],
              activeWorkspace: mapped,
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

    loadWorkspaces();
  }, [user, activeTenant, isMockUser]);

  // Create a new Workspace
  const createWorkspace = async (name: string, slug?: string, workspaceType?: string): Promise<Workspace> => {
    if (!user || !activeTenant) {
      throw new Error("Active Tenant session is required to initialize client workspaces.");
    }

    const role = user?.role || "TENANT_STAFF";
    if (["TENANT_STAFF"].includes(role)) {
      throw new Error(`Access Denied: Your system actor role (${role}) is restricted from constructing new workspaces.`);
    }

    const calculatedSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const resolvedType = workspaceType || "personal";

    if (!isSupabaseConfigured() || isMockUser) {
      // --- SANDBOX CREATE ---
      const newWS: Workspace = {
        id: `ws-${calculatedSlug}-${Math.floor(Math.random() * 100000)}`,
        tenantId: activeTenant.id,
        name,
        slug: calculatedSlug,
        isActive: true,
        workspaceType: resolvedType,
        createdAt: new Date().toISOString(),
      };

      const updatedList = [...state.workspaces, newWS];
      const storedWSKey = `mykerani_workspaces_${user.id}_${activeTenant.id}`;
      localStorage.setItem(storedWSKey, JSON.stringify(updatedList));

      setState(prev => ({
        ...prev,
        workspaces: updatedList,
        activeWorkspace: prev.activeWorkspace || newWS,
      }));

      return newWS;
    } else {
      // --- REAL SUPABASE CREATE ---
      if (!supabase) throw new Error("Supabase client is not instantiated");

      const { data, error: dbError } = await supabase
        .from("workspaces")
        .insert({
          tenant_id: activeTenant.id,
          name,
          slug: calculatedSlug,
          is_active: true,
          workspace_type: resolvedType,
        })
        .select()
        .single();

      if (dbError) {
        throw dbError;
      }

      const ws: Workspace = {
        id: data.id,
        tenantId: data.tenant_id,
        name: data.name,
        slug: data.slug,
        isActive: data.is_active,
        workspaceType: data.workspace_type || resolvedType,
        createdAt: data.created_at,
      };

      setState(prev => ({
        ...prev,
        workspaces: [...prev.workspaces, ws],
        activeWorkspace: prev.activeWorkspace || ws,
      }));

      return ws;
    }
  };

  return (
    <WorkspaceContext.Provider
      value={{
        ...state,
        createWorkspace,
        selectWorkspace,
        clearWorkspaceError,
        getWorkspaceHeaders,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error("useWorkspace must be used inside a WorkspaceProvider");
  }
  return context;
};
