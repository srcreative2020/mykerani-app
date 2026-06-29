import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { useAuth } from "./AuthContext";
import { useTenant } from "./TenantContext";
import { 
  type UserRole, 
  type ModuleName, 
  type ModulePermissions, 
  type RolePermissions, 
  type UserRoleAssignment 
} from "../types";

export interface PermissionContextType {
  userRoles: UserRoleAssignment[];
  permissionMatrix: Record<UserRole, RolePermissions>;
  loading: boolean;
  error: string | null;
  hasPermission: (module: ModuleName, action: keyof ModulePermissions) => boolean;
  checkPermission: (role: UserRole, module: ModuleName, action: keyof ModulePermissions) => boolean;
  canManageWorkspaces: () => boolean;
  canManageTenants: () => boolean;
  assignUserRole: (email: string, fullName: string, role: UserRole) => Promise<void>;
  removeUserAssignment: (id: string) => Promise<void>;
  updateMatrixCell: (role: UserRole, module: ModuleName, action: keyof ModulePermissions, val: boolean) => Promise<void>;
}

const PermissionContext = createContext<PermissionContextType | undefined>(undefined);

export const DEFAULT_PERMISSION_MATRIX: Record<UserRole, RolePermissions> = {
  HQ_OWNER: {
    "Financial Records": { read: true, create: true, update: true, delete: true },
    "Financial Commitments": { read: true, create: true, update: true, delete: true },
    "Financial Forecast": { read: true, create: true, update: true, delete: true },
    "Financial Evidence Package": { read: true, create: true, update: true, delete: true },
    "Notifications": { read: true, create: true, update: true, delete: true }
  },
  HQ_STAFF: {
    "Financial Records": { read: true, create: true, update: true, delete: false },
    "Financial Commitments": { read: true, create: true, update: true, delete: false },
    "Financial Forecast": { read: true, create: false, update: false, delete: false },
    "Financial Evidence Package": { read: true, create: true, update: true, delete: false },
    "Notifications": { read: true, create: true, update: true, delete: false }
  },
  TENANT_OWNER: {
    "Financial Records": { read: true, create: true, update: true, delete: true },
    "Financial Commitments": { read: true, create: true, update: true, delete: true },
    "Financial Forecast": { read: true, create: true, update: true, delete: true },
    "Financial Evidence Package": { read: true, create: true, update: true, delete: true },
    "Notifications": { read: true, create: true, update: true, delete: true }
  },
  TENANT_STAFF: {
    "Financial Records": { read: true, create: true, update: true, delete: false },
    "Financial Commitments": { read: true, create: false, update: false, delete: false },
    "Financial Forecast": { read: false, create: false, update: false, delete: false },
    "Financial Evidence Package": { read: true, create: true, update: true, delete: false },
    "Notifications": { read: true, create: false, update: false, delete: false }
  }
};

const getMockAssignments = (tenantId: string): UserRoleAssignment[] => [
  { id: "role-asm-owner", userId: "user-mock-owner-demo", fullName: "Pemilik Syarikat", email: "owner@mykerani.demo", role: "TENANT_OWNER", tenantId },
  { id: "role-asm-staff", userId: "user-mock-staff-demo", fullName: "Kakitangan Syarikat", email: "staff@mykerani.demo", role: "TENANT_STAFF", tenantId },
];

export const PermissionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isMockUser } = useAuth();
  const { activeTenant } = useTenant();

  const [permissionMatrix, setPermissionMatrix] = useState<Record<UserRole, RolePermissions>>(DEFAULT_PERMISSION_MATRIX);
  const [userRoles, setUserRoles] = useState<UserRoleAssignment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Sync / Load permissions from database or localStorage
  useEffect(() => {
    let cancelled = false;

    if (!user || !activeTenant) {
      setUserRoles([]);
      setLoading(false);
      return;
    }

    const loadData = async () => {
      setLoading(true);
      setError(null);

      if (!isSupabaseConfigured() || isMockUser) {
        // --- SANDBOX MOCK PERSISTENCE ---
        const localMatrix = localStorage.getItem(`mykerani_permission_matrix`);
        if (localMatrix) {
          try {
            setPermissionMatrix(JSON.parse(localMatrix));
          } catch {
            setPermissionMatrix(DEFAULT_PERMISSION_MATRIX);
          }
        } else {
          setPermissionMatrix(DEFAULT_PERMISSION_MATRIX);
        }

        const localRolesKey = `mykerani_user_roles_${activeTenant.id}`;
        const localRoles = localStorage.getItem(localRolesKey);
        let list: UserRoleAssignment[] = [];
        if (localRoles) {
          try {
            list = JSON.parse(localRoles);
          } catch {
            list = getMockAssignments(activeTenant.id);
          }
        } else {
          list = getMockAssignments(activeTenant.id);
          localStorage.setItem(localRolesKey, JSON.stringify(list));
        }

        // Add the current logged-in user to the local list if not present
        if (!list.some(r => r.email === user.email)) {
          list.push({
            id: `role-asm-user-${user.id}`,
            userId: user.id,
            fullName: user.fullName || "Current User",
            email: user.email,
            role: user.role,
            tenantId: activeTenant.id
          });
          localStorage.setItem(localRolesKey, JSON.stringify(list));
        }

        // Sync local list to use current role if changed
        const listWithSync = list.map(item => {
          if (item.email === user.email && item.role !== user.role) {
            return { ...item, role: user.role };
          }
          return item;
        });
        
        setUserRoles(listWithSync);
        setLoading(false);
      } else {
        // --- SUPABASE PERSISTENCE ---
        if (!supabase) return;

        try {
          // 1. Load Custom Permission Matrix Override values
          const { data: matrixData, error: mError } = await supabase
            .from("permission_matrices")
            .select("*");

          if (cancelled) return;
          if (!mError && matrixData && matrixData.length > 0) {
            const loadedMatrix = { ...DEFAULT_PERMISSION_MATRIX };
            matrixData.forEach(row => {
              if (row.role in loadedMatrix) {
                loadedMatrix[row.role as UserRole] = row.permissions as RolePermissions;
              }
            });
            setPermissionMatrix(loadedMatrix);
          } else {
            setPermissionMatrix(DEFAULT_PERMISSION_MATRIX);
          }

          // 2. Load User Role Assignments
          const { data: rolesData, error: rError } = await supabase
            .from("user_role_assignments")
            .select("*")
            .eq("tenant_id", activeTenant.id);

          if (cancelled) return;
          if (!rError && rolesData) {
            const mapped: UserRoleAssignment[] = rolesData.map(row => ({
              id: row.id,
              userId: row.user_id,
              fullName: row.full_name,
              email: row.email,
              role: row.role as UserRole,
              tenantId: row.tenant_id,
              createdAt: row.created_at
            }));

            // Make sure the active user profile exists in table
            if (user && !mapped.some(m => m.email === user.email)) {
              const { data: newAsm, error: insertErr } = await supabase
                .from("user_role_assignments")
                .insert({
                  user_id: user.id,
                  full_name: user.fullName || "Operator",
                  email: user.email,
                  role: user.role,
                  tenant_id: activeTenant.id
                })
                .select()
                .single();

              if (cancelled) return;
              if (!insertErr && newAsm) {
                mapped.push({
                  id: newAsm.id,
                  userId: newAsm.user_id,
                  fullName: newAsm.full_name,
                  email: newAsm.email,
                  role: newAsm.role as UserRole,
                  tenantId: newAsm.tenant_id,
                  createdAt: newAsm.created_at
                });
              }
            }

            setUserRoles(mapped);
          } else {
            // Defensive setup fallback
            const fallbackList = getMockAssignments(activeTenant.id);
            if (!fallbackList.some(r => r.email === user.email)) {
              fallbackList.push({
                id: `role-asm-user-${user.id}`,
                userId: user.id,
                fullName: user.fullName || "Operator",
                email: user.email,
                role: user.role,
                tenantId: activeTenant.id
              });
            }
            setUserRoles(fallbackList);
          }
        } catch (err: any) {
          console.warn("Permission Database loading failed, using local fallback state:", err.message);
          if (cancelled) return;
          setPermissionMatrix(DEFAULT_PERMISSION_MATRIX);
          const locals = getMockAssignments(activeTenant.id);
          setUserRoles(locals);
        } finally {
          if (!cancelled) setLoading(false);
        }
      }
    };

    loadData();

    return () => { cancelled = true; };
  }, [user, activeTenant, isMockUser]);

  // Access check for a specific role
  const checkPermission = useCallback((role: UserRole, module: ModuleName, action: keyof ModulePermissions): boolean => {
    const roleMap = permissionMatrix[role];
    if (!roleMap) return false;
    const moduleMap = roleMap[module];
    if (!moduleMap) return false;
    return Boolean(moduleMap[action]);
  }, [permissionMatrix]);

  // Direct active user security context verification
  const hasPermission = useCallback((module: ModuleName, action: keyof ModulePermissions): boolean => {
    // HQ Admin holds total absolute override master clearance
    if (user?.role === "HQ_OWNER") return true;
    return checkPermission(user?.role || "TENANT_STAFF", module, action);
  }, [user?.role, checkPermission]);

  const canManageWorkspaces = useCallback((): boolean => {
    const role = user?.role || "TENANT_STAFF";
    return ["HQ_OWNER", "TENANT_OWNER"].includes(role);
  }, [user?.role]);

  const canManageTenants = useCallback((): boolean => {
    return user?.role === "HQ_OWNER";
  }, [user?.role]);

  // Assign user roles within active tenant boundary
  const assignUserRole = useCallback(async (email: string, fullName: string, role: UserRole): Promise<void> => {
    if (!user || !activeTenant) {
      throw new Error("Active Tenant session is required to initialize user assignments.");
    }

    if (!isSupabaseConfigured() || isMockUser) {
      // --- MOCK FLOW ---
      const localRolesKey = `mykerani_user_roles_${activeTenant.id}`;
      setUserRoles(prev => {
        const existing = [...prev];
        const matchIndex = existing.findIndex(asm => asm.email === email);

        if (matchIndex !== -1) {
          existing[matchIndex] = {
            ...existing[matchIndex],
            fullName,
            role
          };
        } else {
          existing.push({
            id: `role-asm-${Date.now()}`,
            userId: `user-mock-${Date.now()}`,
            fullName,
            email,
            role,
            tenantId: activeTenant.id
          });
        }

        localStorage.setItem(localRolesKey, JSON.stringify(existing));
        return existing;
      });
    } else {
      // --- SUPABASE FLOW ---
      if (!supabase) return;

      const { data, error: dbErr } = await supabase
        .from("user_role_assignments")
        .upsert({
          user_id: `user-db-${Date.now()}`,
          email,
          full_name: fullName,
          role,
          tenant_id: activeTenant.id
        }, {
          onConflict: "tenant_id,email"
        })
        .select();

      if (dbErr) {
        throw new Error(dbErr.message);
      }

      if (data && data.length > 0) {
        const mappedItem: UserRoleAssignment = {
          id: data[0].id,
          userId: data[0].user_id,
          fullName: data[0].full_name,
          email: data[0].email,
          role: data[0].role as UserRole,
          tenantId: data[0].tenant_id,
          createdAt: data[0].created_at
        };

        setUserRoles(prev => {
          const filtered = prev.filter(p => p.email !== email);
          return [...filtered, mappedItem];
        });
      }
    }
  }, [user, activeTenant, isMockUser]);

  // Revoke role assignments
  const removeUserAssignment = useCallback(async (id: string): Promise<void> => {
    if (!user || !activeTenant) return;

    if (!isSupabaseConfigured() || isMockUser) {
      const localRolesKey = `mykerani_user_roles_${activeTenant.id}`;
      setUserRoles(prev => {
        const filtered = prev.filter(item => item.id !== id);
        localStorage.setItem(localRolesKey, JSON.stringify(filtered));
        return filtered;
      });
    } else {
      if (!supabase) return;

      const { error: dbErr } = await supabase
        .from("user_role_assignments")
        .delete()
        .eq("id", id)
        .eq("tenant_id", activeTenant.id);

      if (dbErr) {
        throw new Error(dbErr.message);
      }

      setUserRoles(prev => prev.filter(item => item.id !== id));
    }
  }, [user, activeTenant, isMockUser]);

  // Dynamically update role permissions in the matrix cells
  const updateMatrixCell = useCallback(async (
    role: UserRole, 
    module: ModuleName, 
    action: keyof ModulePermissions, 
    val: boolean
  ): Promise<void> => {
    const updated = { ...permissionMatrix };
    if (!updated[role]) return;
    if (!updated[role][module]) return;

    updated[role][module] = {
      ...updated[role][module],
      [action]: val
    };

    setPermissionMatrix(updated);

    if (!isSupabaseConfigured() || isMockUser) {
      localStorage.setItem(`mykerani_permission_matrix`, JSON.stringify(updated));
    } else {
      if (!supabase) return;

      // Save matrix override state to Supabase
      await supabase
        .from("permission_matrices")
        .upsert({
          role,
          permissions: updated[role],
          updated_at: new Date().toISOString()
        }, {
          onConflict: "role"
        });
    }
  }, [permissionMatrix, isMockUser]);

  return (
    <PermissionContext.Provider
      value={useMemo(() => ({
        userRoles,
        permissionMatrix,
        loading,
        error,
        hasPermission,
        checkPermission,
        canManageWorkspaces,
        canManageTenants,
        assignUserRole,
        removeUserAssignment,
        updateMatrixCell
      }), [userRoles, permissionMatrix, loading, error, hasPermission, checkPermission, canManageWorkspaces, canManageTenants, assignUserRole, removeUserAssignment, updateMatrixCell])}
    >
      {children}
    </PermissionContext.Provider>
  );
};

export const usePermission = () => {
  const context = useContext(PermissionContext);
  if (context === undefined) {
    throw new Error("usePermission must be used inside a PermissionProvider");
  }
  return context;
};
