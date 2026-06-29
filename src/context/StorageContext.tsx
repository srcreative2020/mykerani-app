import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { useAuth } from "./AuthContext";
import { useTenant } from "./TenantContext";
import { useWorkspace } from "./WorkspaceContext";
import { useAudit } from "./AuditContext";
import { isDemoWorkspace } from "../lib/seeder";

export interface StorageProviderRegistry {
  id: string;
  workspaceId: string;
  tenantId: string;
  providerType: "HQ_MANAGED" | "GOOGLE_DRIVE" | "ONEDRIVE" | "DROPBOX";
  connectionStatus: "CONNECTED" | "DISCONNECTED";
  storageType: "HQ_STORAGE" | "CLOUD_PROVIDER";
  lastSync: string;
  createdAt?: string;
  updatedAt?: string;
}

interface StorageContextType {
  activeProvider: StorageProviderRegistry | null;
  loading: boolean;
  error: string | null;
  updateProviderSetting: (provider: "HQ_MANAGED" | "GOOGLE_DRIVE" | "ONEDRIVE" | "DROPBOX") => Promise<void>;
  toggleConnectionStatus: () => Promise<void>;
  isOwnerOrAdmin: boolean;
  storageUsedBytes: number;
  storageLimitBytes: number;
}

const StorageContext = createContext<StorageContextType | undefined>(undefined);

export const StorageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isMockUser } = useAuth();
  const { activeTenant } = useTenant();
  const { activeWorkspace } = useWorkspace();
  const { writeAuditLog } = useAudit();

  const [activeProvider, setActiveProvider] = useState<StorageProviderRegistry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageUsedBytes, setStorageUsedBytes] = useState(0);
  const [storageLimitBytes, setStorageLimitBytes] = useState(0);

  // Permission Integration: Only HQ_ADMIN, TENANT_OWNER, TENANT_ADMIN can modify storage settings
  const isOwnerOrAdmin = !!(user && ["HQ_OWNER", "TENANT_OWNER"].includes(user.role));

  useEffect(() => {
    let cancelled = false;

    if (!activeWorkspace || !activeTenant || !user) {
      setActiveProvider(null);
      return;
    }

    const loadProviderSetting = async () => {
      setLoading(true);
      setError(null);

      const localKey = `mykerani_storage_provider_${activeWorkspace.id}`;

      if (!isSupabaseConfigured() || isMockUser || isDemoWorkspace(activeWorkspace.id)) {
        // Mock / Sandbox flow
        const cached = localStorage.getItem(localKey);
        if (cached) {
          try {
            setActiveProvider(JSON.parse(cached));
          } catch {
            const defaultMock: StorageProviderRegistry = {
              id: `prov-mock-${activeWorkspace.id}`,
              workspaceId: activeWorkspace.id,
              tenantId: activeTenant.id,
              providerType: "HQ_MANAGED",
              connectionStatus: "CONNECTED",
              storageType: "HQ_STORAGE",
              lastSync: new Date().toISOString(),
            };
            localStorage.setItem(localKey, JSON.stringify(defaultMock));
            setActiveProvider(defaultMock);
          }
        } else {
          const defaultMock: StorageProviderRegistry = {
            id: `prov-mock-${activeWorkspace.id}`,
            workspaceId: activeWorkspace.id,
            tenantId: activeTenant.id,
            providerType: "HQ_MANAGED",
            connectionStatus: "CONNECTED",
            storageType: "HQ_STORAGE",
            lastSync: new Date().toISOString(),
          };
          localStorage.setItem(localKey, JSON.stringify(defaultMock));
          setActiveProvider(defaultMock);
        }
        setLoading(false);
      } else {
        // Real Supabase Flow
        if (!supabase) {
          setLoading(false);
          return;
        }

        try {
          const { data, error: fetchError } = await supabase
            .from("workspace_storage_providers")
            .select("*")
            .eq("workspace_id", activeWorkspace.id)
            .maybeSingle();

          if (cancelled) return;
          if (fetchError) {
            // Table belum wujud — guna localStorage sebagai fallback
            console.warn("workspace_storage_providers not ready, using local fallback:", fetchError.message);
            const defaultFallback: StorageProviderRegistry = {
              id: `prov-local-${activeWorkspace.id}`,
              workspaceId: activeWorkspace.id,
              tenantId: activeTenant.id,
              providerType: "HQ_MANAGED",
              connectionStatus: "CONNECTED",
              storageType: "HQ_STORAGE",
              lastSync: new Date().toISOString(),
            };
            localStorage.setItem(localKey, JSON.stringify(defaultFallback));
            setActiveProvider(defaultFallback);
            setLoading(false);
            return;
          }

          if (data) {
            setActiveProvider({
              id: data.id,
              workspaceId: data.workspace_id,
              tenantId: data.tenant_id,
              providerType: data.provider_type,
              connectionStatus: data.connection_status,
              storageType: data.storage_type,
              lastSync: data.last_sync,
              createdAt: data.created_at,
              updatedAt: data.updated_at,
            });
          } else {
            // Self-seed dynamic provider registry for this workspace
            const { data: inserted, error: insertError } = await supabase
              .from("workspace_storage_providers")
              .insert({
                workspace_id: activeWorkspace.id,
                tenant_id: activeTenant.id,
                provider_type: "HQ_MANAGED",
                connection_status: "CONNECTED",
                storage_type: "HQ_STORAGE",
              })
              .select()
              .single();

            if (cancelled) return;
            if (insertError) {
              throw insertError;
            }

            setActiveProvider({
              id: inserted.id,
              workspaceId: inserted.workspace_id,
              tenantId: inserted.tenant_id,
              providerType: inserted.provider_type,
              connectionStatus: inserted.connection_status,
              storageType: inserted.storage_type,
              lastSync: inserted.last_sync,
              createdAt: inserted.created_at,
              updatedAt: inserted.updated_at,
            });
          }

          // Load real storage bytes from resource_wallets
          const { data: walletData } = await supabase
            .from("resource_wallets")
            .select("storage_used_bytes, storage_limit_bytes")
            .eq("workspace_id", activeWorkspace.id)
            .single();

          if (cancelled) return;
          if (walletData) {
            setStorageUsedBytes(walletData.storage_used_bytes || 0);
            setStorageLimitBytes(walletData.storage_limit_bytes || 0);
          }
        } catch (err: any) {
          console.error("Storage Provider Context initialization alert:", err.message);
          if (cancelled) return;
          setError(err.message);
        } finally {
          if (!cancelled) setLoading(false);
        }
      }
    };

    loadProviderSetting();

    return () => { cancelled = true; };
  }, [activeWorkspace?.id, activeTenant?.id, user?.id, isMockUser]);

  // Action: Modify Storage Setting with strict permission guard
  const updateProviderSetting = useCallback(async (provider: "HQ_MANAGED" | "GOOGLE_DRIVE" | "ONEDRIVE" | "DROPBOX") => {
    if (!activeWorkspace || !activeTenant || !user) return;

    if (!isOwnerOrAdmin) {
      throw new Error(`Permission Denied: Your system actor role (${user.role}) is restricted from editing workspace storage providers.`);
    }

    const prevProvider = activeProvider;
    const oldVal = prevProvider ? { ...prevProvider } : null;

    const storageType = provider === "HQ_MANAGED" ? "HQ_STORAGE" : "CLOUD_PROVIDER";
    const status = provider === "HQ_MANAGED" ? "CONNECTED" : "DISCONNECTED"; // Start cloud paths disconnected for BYOS authentication prep

    const lastSync = new Date().toISOString();
    const localKey = `mykerani_storage_provider_${activeWorkspace.id}`;

    if (!isSupabaseConfigured() || isMockUser) {
      // Mock Update
      const updated: StorageProviderRegistry = {
        id: prevProvider?.id || `prov-mock-${activeWorkspace.id}`,
        workspaceId: activeWorkspace.id,
        tenantId: activeTenant.id,
        providerType: provider,
        connectionStatus: status as "CONNECTED" | "DISCONNECTED",
        storageType: storageType as "HQ_STORAGE" | "CLOUD_PROVIDER",
        lastSync,
      };

      localStorage.setItem(localKey, JSON.stringify(updated));
      setActiveProvider(updated);

      // Log audit
      await writeAuditLog({
        workspaceId: activeWorkspace.id,
        module: "Storage Provider",
        action: "UPDATE",
        oldValue: oldVal,
        newValue: updated,
      });
    } else {
      // Real DB Update
      if (!supabase) return;

      try {
        const { data, error: updateError } = await supabase
          .from("workspace_storage_providers")
          .update({
            provider_type: provider,
            connection_status: status,
            storage_type: storageType,
            last_sync: lastSync,
            updated_at: new Date().toISOString(),
          })
          .eq("workspace_id", activeWorkspace.id)
          .select()
          .single();

        if (updateError) {
          throw updateError;
        }

        const updated: StorageProviderRegistry = {
          id: data.id,
          workspaceId: data.workspace_id,
          tenantId: data.tenant_id,
          providerType: data.provider_type,
          connectionStatus: data.connection_status,
          storageType: data.storage_type,
          lastSync: data.last_sync,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        };

        setActiveProvider(updated);

        // Log audit
        await writeAuditLog({
          workspaceId: activeWorkspace.id,
          module: "Storage Provider",
          action: "UPDATE",
          oldValue: oldVal,
          newValue: updated,
        });
      } catch (err: any) {
        throw new Error(`Failed to save storage configuration: ${err.message}`);
      }
    }
  }, [activeWorkspace, activeTenant, user, isOwnerOrAdmin, activeProvider, isMockUser, writeAuditLog]);

  // Connects or disconnects the simulated cloud service provider (Prepares byos architecture)
  const toggleConnectionStatus = useCallback(async () => {
    if (!activeWorkspace || !activeProvider || !user) return;

    if (!isOwnerOrAdmin) {
      throw new Error(`Permission Denied: Your system actor role (${user.role}) is restricted from activating storage configurations.`);
    }

    const prevProvider = { ...activeProvider };
    const nextStatus = activeProvider.connectionStatus === "CONNECTED" ? "DISCONNECTED" : "CONNECTED";
    const lastSync = new Date().toISOString();
    const localKey = `mykerani_storage_provider_${activeWorkspace.id}`;

    if (!isSupabaseConfigured() || isMockUser) {
      const updated: StorageProviderRegistry = {
        ...activeProvider,
        connectionStatus: nextStatus as "CONNECTED" | "DISCONNECTED",
        lastSync,
      };

      localStorage.setItem(localKey, JSON.stringify(updated));
      setActiveProvider(updated);

      await writeAuditLog({
        workspaceId: activeWorkspace.id,
        module: "Storage Provider",
        action: "UPDATE",
        oldValue: prevProvider,
        newValue: updated,
      });
    } else {
      if (!supabase) return;

      try {
        const { data, error: updateError } = await supabase
          .from("workspace_storage_providers")
          .update({
            connection_status: nextStatus,
            last_sync: lastSync,
            updated_at: new Date().toISOString(),
          })
          .eq("workspace_id", activeWorkspace.id)
          .select()
          .single();

        if (updateError) {
          throw updateError;
        }

        const updated: StorageProviderRegistry = {
          id: data.id,
          workspaceId: data.workspace_id,
          tenantId: data.tenant_id,
          providerType: data.provider_type,
          connectionStatus: data.connection_status,
          storageType: data.storage_type,
          lastSync: data.last_sync,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        };

        setActiveProvider(updated);

        await writeAuditLog({
          workspaceId: activeWorkspace.id,
          module: "Storage Provider",
          action: "UPDATE",
          oldValue: prevProvider,
          newValue: updated,
        });
      } catch (err: any) {
        throw new Error(`Failed to toggle connection state: ${err.message}`);
      }
    }
  }, [activeWorkspace, activeProvider, user, isOwnerOrAdmin, isMockUser, writeAuditLog]);

  return (
    <StorageContext.Provider
      value={useMemo(() => ({
        activeProvider,
        loading,
        error,
        updateProviderSetting,
        toggleConnectionStatus,
        isOwnerOrAdmin,
        storageUsedBytes,
        storageLimitBytes,
      }), [activeProvider, loading, error, updateProviderSetting, toggleConnectionStatus, isOwnerOrAdmin, storageUsedBytes, storageLimitBytes])}
    >
      {children}
    </StorageContext.Provider>
  );
};

export const useStorage = () => {
  const context = useContext(StorageContext);
  if (context === undefined) {
    throw new Error("useStorage must be used inside a StorageProvider");
  }
  return context;
};
