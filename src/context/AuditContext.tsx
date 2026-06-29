import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { useAuth } from "./AuthContext";
import { useTenant } from "./TenantContext";
import { type AuditLogEntry, type UserRole } from "../types";

export interface AuditContextType {
  auditLogs: AuditLogEntry[];
  loading: boolean;
  error: string | null;
  writeAuditLog: (log: {
    workspaceId?: string;
    module: "Financial Records" | "Financial Commitments" | "Financial Evidence Package" | "Backup & Recovery" | "OCR Learning" | "Storage Provider" | "Notifications" | "Debt Records";
    action: "CREATE" | "UPDATE" | "DELETE";
    oldValue: Record<string, any> | null;
    newValue: Record<string, any> | null;
  }) => Promise<void>;
  fetchAuditLogs: () => Promise<void>;
}

const AuditContext = createContext<AuditContextType | undefined>(undefined);

const getMockAuditLogs = (tenantId: string): AuditLogEntry[] => [
  {
    id: "audit-1",
    userId: "user-mock-ahmad",
    userEmail: "ahmad@company.com",
    userRole: "TENANT_OWNER",
    tenantId,
    workspaceId: "ws-mock-1",
    module: "Financial Records",
    action: "CREATE",
    oldValue: null,
    newValue: { type: "INCOME", amountMyr: 12500, category: "Software Sales" },
    timestamp: new Date(Date.now() - 3600000 * 2.5).toISOString()
  },
  {
    id: "audit-2",
    userId: "user-mock-sarah",
    userEmail: "sarah@company.com",
    userRole: "TENANT_STAFF",
    tenantId,
    workspaceId: "ws-mock-1",
    module: "Financial Evidence Package",
    action: "CREATE",
    oldValue: null,
    newValue: { fileName: "invoice_9982.pdf", documentType: "INVOICE", fileUrl: "https://example.com/invoice" },
    timestamp: new Date(Date.now() - 3600000 * 1.8).toISOString()
  },
  {
    id: "audit-3",
    userId: "user-mock-ahmad",
    userEmail: "ahmad@company.com",
    userRole: "TENANT_OWNER",
    tenantId,
    workspaceId: "ws-mock-1",
    module: "Financial Commitments",
    action: "UPDATE",
    oldValue: { obligeeName: "AWS Cloud Services", amountPerIntervalMyr: 3000, isActive: true },
    newValue: { obligeeName: "AWS Cloud Services", amountPerIntervalMyr: 3500, isActive: true },
    timestamp: new Date(Date.now() - 3600000 * 0.5).toISOString()
  }
];

export const AuditProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isMockUser } = useAuth();
  const { activeTenant } = useTenant();

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAuditLogs = useCallback(async () => {
    if (!user || !activeTenant) {
      setAuditLogs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    if (!isSupabaseConfigured() || isMockUser || activeTenant.category === "DEMO") {
      // --- SANDBOX MOCKPERSISTENCE ---
      const localAuditKey = `mykerani_audit_logs_${activeTenant.id}`;
      const cached = localStorage.getItem(localAuditKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          // Sort chronologically descending
          parsed.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          setAuditLogs(parsed);
        } catch {
          const fresh = getMockAuditLogs(activeTenant.id);
          localStorage.setItem(localAuditKey, JSON.stringify(fresh));
          setAuditLogs(fresh);
        }
      } else {
        const fresh = getMockAuditLogs(activeTenant.id);
        localStorage.setItem(localAuditKey, JSON.stringify(fresh));
        setAuditLogs(fresh);
      }
      setLoading(false);
    } else {
      // --- SUPABASE DIRECT FETCH ---
      if (!supabase) return;
      try {
        const { data, error: dbErr } = await supabase
          .from("audit_logs")
          .select("*")
          .eq("tenant_id", activeTenant.id)
          .order("timestamp", { ascending: false });

        if (dbErr) {
          throw new Error(dbErr.message);
        }

        if (data) {
          const mapped: AuditLogEntry[] = data.map(row => ({
            id: row.id,
            userId: row.user_id,
            userEmail: row.user_email,
            userRole: row.user_role as UserRole,
            tenantId: row.tenant_id,
            workspaceId: row.workspace_id,
            module: row.module as any,
            action: row.action as any,
            oldValue: row.old_value,
            newValue: row.new_value,
            timestamp: row.timestamp
          }));
          setAuditLogs(mapped);
        }
      } catch (err: any) {
        console.warn("Audit logs Db query failed, falling back to cached local logs:", err.message);
        const localAuditKey = `mykerani_audit_logs_${activeTenant.id}`;
        const cached = localStorage.getItem(localAuditKey);
        if (cached) {
          try {
            setAuditLogs(JSON.parse(cached));
          } catch {
            setAuditLogs([]);
          }
        } else {
          setAuditLogs([]);
        }
      } finally {
        setLoading(false);
      }
    }
  }, [user, activeTenant, isMockUser]);

  // Load trace log index initially
  useEffect(() => {
    let cancelled = false;
    fetchAuditLogs();
    return () => { cancelled = true; };
  }, [fetchAuditLogs]);

  // Append new trace lines securely
  const writeAuditLog = useCallback(async (log: {
    workspaceId?: string;
    module: "Financial Records" | "Financial Commitments" | "Financial Evidence Package" | "Backup & Recovery" | "OCR Learning" | "Storage Provider" | "Notifications" | "Debt Records";
    action: "CREATE" | "UPDATE" | "DELETE";
    oldValue: Record<string, any> | null;
    newValue: Record<string, any> | null;
  }) => {
    if (!user || !activeTenant) {
      console.warn("Audit System triggered without active login credentials.");
      return;
    }

    const newLogEntry: AuditLogEntry = {
      id: `audit-${Math.random().toString(36).substr(2, 9)}`,
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      tenantId: activeTenant.id,
      workspaceId: log.workspaceId,
      module: log.module,
      action: log.action,
      oldValue: log.oldValue,
      newValue: log.newValue,
      timestamp: new Date().toISOString()
    };

    if (!isSupabaseConfigured() || isMockUser || activeTenant.category === "DEMO") {
      // --- MOCK STORAGE ---
      const localAuditKey = `mykerani_audit_logs_${activeTenant.id}`;
      setAuditLogs(prev => {
        const currentLogs = [newLogEntry, ...prev];
        localStorage.setItem(localAuditKey, JSON.stringify(currentLogs));
        return currentLogs;
      });
    } else {
      // --- SUPABASE STORAGE ---
      if (!supabase) return;
      try {
        const { error: dbErr } = await supabase
          .from("audit_logs")
          .insert({
            user_id: user.id,
            user_email: user.email,
            user_role: user.role,
            tenant_id: activeTenant.id,
            workspace_id: log.workspaceId || null,
            module: log.module,
            action: log.action,
            old_value: log.oldValue || null,
            new_value: log.newValue || null
          });

        if (dbErr) {
          throw new Error(dbErr.message);
        }

        // Prepend directly so state stays synchronized with live data
        setAuditLogs(prev => [newLogEntry, ...prev]);
      } catch (err: any) {
        console.error("Critical audit log write error to Postgres ledger: ", err.message);
        // Fallback to local storage
        const localAuditKey = `mykerani_audit_logs_${activeTenant.id}`;
        setAuditLogs(prev => {
          const currentLogs = [newLogEntry, ...prev];
          localStorage.setItem(localAuditKey, JSON.stringify(currentLogs));
          return currentLogs;
        });
      }
    }
  }, [user, activeTenant, isMockUser, auditLogs]);

  return (
    <AuditContext.Provider
      value={useMemo(() => ({
        auditLogs,
        loading,
        error,
        writeAuditLog,
        fetchAuditLogs
      }), [auditLogs, loading, error, writeAuditLog, fetchAuditLogs])}
    >
      {children}
    </AuditContext.Provider>
  );
};

export const useAudit = () => {
  const context = useContext(AuditContext);
  if (context === undefined) {
    throw new Error("useAudit must be used inside an AuditProvider");
  }
  return context;
};
