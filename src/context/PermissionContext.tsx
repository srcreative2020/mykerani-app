import React, { createContext, useContext, useState, useEffect } from "react";
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
  setUserAssignmentSuspended: (id: string, suspended: boolean) => Promise<void>;
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
  const [realtimeTick, setRealtimeTick] = useState(0);

  // Sync / Load permissions from database or localStorage
  useEffect(() => {
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
          // 1. Load Custom Permission Matrix Override values: platform
          // defaults (the HQ tenant's sentinel row) first, then this
          // tenant's own overrides layered on top (GAP-C3: tenant-scoped,
          // not global — see permission_matrices_tenant_id_role_key).
          const { data: hqTenantRow } = await supabase
            .from("tenants")
            .select("id")
            .eq("category", "HQ")
            .limit(1)
            .maybeSingle();

          const matrixTenantFilter = hqTenantRow?.id && hqTenantRow.id !== activeTenant.id
            ? `tenant_id.eq.${hqTenantRow.id},tenant_id.eq.${activeTenant.id}`
            : `tenant_id.eq.${activeTenant.id}`;

          const { data: matrixData, error: mError } = await supabase
            .from("permission_matrices")
            .select("*")
            .or(matrixTenantFilter);

          if (!mError && matrixData && matrixData.length > 0) {
            const loadedMatrix = { ...DEFAULT_PERMISSION_MATRIX };
            // Apply platform defaults (HQ sentinel row) first, this
            // tenant's own overrides last so they take precedence.
            const sorted = [...matrixData].sort(
              (a, b) => (a.tenant_id === activeTenant.id ? 1 : 0) - (b.tenant_id === activeTenant.id ? 1 : 0)
            );
            sorted.forEach(row => {
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

          if (!rError && rolesData) {
            const mapped: UserRoleAssignment[] = rolesData.map(row => ({
              id: row.id,
              userId: row.user_id,
              fullName: row.full_name,
              email: row.email,
              role: row.role as UserRole,
              tenantId: row.tenant_id,
              createdAt: row.created_at,
              isSuspended: row.is_suspended ?? false
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
          setPermissionMatrix(DEFAULT_PERMISSION_MATRIX);
          const locals = getMockAssignments(activeTenant.id);
          setUserRoles(locals);
        } finally {
          setLoading(false);
        }
      }
    };

    loadData();
  }, [user, activeTenant, isMockUser, realtimeTick]);

  // GAP-M4: another session's role/permission change (e.g. an Owner
  // editing Staff access) must be reflected here without a manual
  // refresh, so a revoked/suspended Staff session loses access promptly.
  useEffect(() => {
    if (!isSupabaseConfigured() || isMockUser || !supabase || !activeTenant) return;

    const channel = supabase
      .channel(`permission-sync-${activeTenant.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_role_assignments", filter: `tenant_id=eq.${activeTenant.id}` },
        () => setRealtimeTick(t => t + 1)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "permission_matrices", filter: `tenant_id=eq.${activeTenant.id}` },
        () => setRealtimeTick(t => t + 1)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeTenant, isMockUser]);

  // Access check for a specific role
  const checkPermission = (role: UserRole, module: ModuleName, action: keyof ModulePermissions): boolean => {
    const roleMap = permissionMatrix[role];
    if (!roleMap) return false;
    const moduleMap = roleMap[module];
    if (!moduleMap) return false;
    return Boolean(moduleMap[action]);
  };

  // Direct active user security context verification
  const hasPermission = (module: ModuleName, action: keyof ModulePermissions): boolean => {
    // HQ Admin holds total absolute override master clearance
    if (user?.role === "HQ_OWNER") return true;
    return checkPermission(user?.role || "TENANT_STAFF", module, action);
  };

  const canManageWorkspaces = (): boolean => {
    const role = user?.role || "TENANT_STAFF";
    return ["HQ_OWNER", "TENANT_OWNER"].includes(role);
  };

  const canManageTenants = (): boolean => {
    return user?.role === "HQ_OWNER";
  };

  // Assign user roles within active tenant boundary
  const assignUserRole = async (email: string, fullName: string, role: UserRole): Promise<void> => {
    if (!user || !activeTenant) {
      throw new Error("Active Tenant session is required to initialize user assignments.");
    }

    if (!isSupabaseConfigured() || isMockUser) {
      // --- MOCK FLOW ---
      const localRolesKey = `mykerani_user_roles_${activeTenant.id}`;
      const existing = [...userRoles];
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
      setUserRoles(existing);
    } else {
      // --- SUPABASE FLOW ---
      if (!supabase) return;

      const existingRole = userRoles.find(r => r.email === email)?.role ?? null;

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

        // GAP-H1 (notification) / closed-loop audit for this role editor —
        // kept as a direct write rather than routed through
        // tenant_assign_staff_role() because that RPC enforces a different,
        // incompatible role vocabulary (TENANT_ADMIN/MANAGER/STAFF/VIEWER).
        await supabase.from("role_change_audit_log").insert({
          assignment_id: data[0].id,
          target_user_id: data[0].user_id,
          target_email: email,
          tenant_id: activeTenant.id,
          old_role: existingRole,
          new_role: role,
          change_type: existingRole ? "UPDATE" : "GRANT",
          changed_by: user.id,
          changed_by_email: user.email
        });

        const { data: workspaces } = await supabase
          .from("workspaces")
          .select("id")
          .eq("tenant_id", activeTenant.id);
        if (workspaces && workspaces.length > 0) {
          await supabase.from("workspace_notifications").insert(
            workspaces.map(w => ({
              workspace_id: w.id,
              tenant_id: activeTenant.id,
              category: "SECURITY",
              title: "Peranan ahli pasukan dikemaskini",
              message: `${fullName} kini mempunyai peranan ${role}.`,
              metadata: { target_email: email, role }
            }))
          );
        }
      }
    }
  };

  // Revoke role assignments
  const removeUserAssignment = async (id: string): Promise<void> => {
    if (!user || !activeTenant) return;

    if (!isSupabaseConfigured() || isMockUser) {
      const localRolesKey = `mykerani_user_roles_${activeTenant.id}`;
      const filtered = userRoles.filter(item => item.id !== id);
      localStorage.setItem(localRolesKey, JSON.stringify(filtered));
      setUserRoles(filtered);
    } else {
      if (!supabase) return;

      const target = userRoles.find(item => item.id === id);

      const { error: dbErr } = await supabase
        .from("user_role_assignments")
        .delete()
        .eq("id", id)
        .eq("tenant_id", activeTenant.id);

      if (dbErr) {
        throw new Error(dbErr.message);
      }

      setUserRoles(prev => prev.filter(item => item.id !== id));

      // GAP-H1/H2: revoke must leave an audit trail and notify the
      // workspace, matching tenant_revoke_staff_role()'s closed loop.
      if (target) {
        await supabase.from("role_change_audit_log").insert({
          assignment_id: id,
          target_user_id: target.userId,
          target_email: target.email,
          tenant_id: activeTenant.id,
          old_role: target.role,
          new_role: null,
          change_type: "REVOKE",
          changed_by: user.id,
          changed_by_email: user.email
        });

        const { data: workspaces } = await supabase
          .from("workspaces")
          .select("id")
          .eq("tenant_id", activeTenant.id);
        if (workspaces && workspaces.length > 0) {
          await supabase.from("workspace_notifications").insert(
            workspaces.map(w => ({
              workspace_id: w.id,
              tenant_id: activeTenant.id,
              category: "SECURITY",
              title: "Akses ahli pasukan dibatalkan",
              message: `${target.fullName} (${target.email}) tidak lagi mempunyai akses kepada workspace ini.`,
              metadata: { target_email: target.email, old_role: target.role }
            }))
          );
        }
      }
    }
  };

  // GAP-C4: tenant-level Owner suspend/reactivate Staff, via the audited +
  // notified tenant_suspend_staff_role() RPC. Safe to share across both
  // role vocabularies in this table since the RPC only checks the calling
  // user's own role (TENANT_OWNER) and that the target isn't TENANT_OWNER.
  const setUserAssignmentSuspended = async (id: string, suspended: boolean): Promise<void> => {
    if (!user || !activeTenant) {
      throw new Error("Active Tenant session is required.");
    }

    if (!isSupabaseConfigured() || isMockUser) {
      setUserRoles(prev => prev.map(r => (r.id === id ? { ...r, isSuspended: suspended } : r)));
      return;
    }

    if (!supabase) return;

    const { error: rpcErr } = await supabase.rpc("tenant_suspend_staff_role", {
      p_assignment_id: id,
      p_suspended: suspended
    });

    if (rpcErr) {
      throw new Error(rpcErr.message);
    }

    setUserRoles(prev => prev.map(r => (r.id === id ? { ...r, isSuspended: suspended } : r)));
  };

  // Dynamically update role permissions in the matrix cells
  const updateMatrixCell = async (
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

    if (!isSupabaseConfigured() || isMockUser) {
      setPermissionMatrix(updated);
      localStorage.setItem(`mykerani_permission_matrix`, JSON.stringify(updated));
      return;
    }

    if (!supabase || !activeTenant) {
      throw new Error("Active Tenant session is required to update permissions.");
    }

    // Save matrix override scoped to this tenant only (GAP-C3/C5): a
    // Tenant Owner editing their matrix must never mutate another
    // tenant's permissions, and write failures must surface to the UI
    // instead of silently reverting on next reload.
    const { error: writeErr } = await supabase
      .from("permission_matrices")
      .upsert({
        role,
        tenant_id: activeTenant.id,
        permissions: updated[role],
        updated_at: new Date().toISOString()
      }, {
        onConflict: "tenant_id,role"
      });

    if (writeErr) {
      throw new Error(writeErr.message);
    }

    setPermissionMatrix(updated);
  };

  return (
    <PermissionContext.Provider
      value={{
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
        setUserAssignmentSuspended,
        updateMatrixCell
      }}
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
