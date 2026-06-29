import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { useAuth } from "./AuthContext";
import { useTenant } from "./TenantContext";
import { useWorkspace } from "./WorkspaceContext";
import { useAudit } from "./AuditContext";
import { useStorage } from "./StorageContext";
import { useFinancials } from "./FinancialRecordsContext";
import { isDemoWorkspace } from "../lib/seeder";
import { computeFinancialHealthScoring } from "../lib/financialHealth";

export interface WorkspaceNotification {
  id: string;
  workspaceId: string;
  tenantId: string;
  category: "FINANCIAL_RECORD" | "RECEIVABLE" | "PAYABLE" | "COMMITMENT" | "BACKUP" | "STORAGE" | "SECURITY" | "SYSTEM";
  title: string;
  message: string;
  status: "UNREAD" | "READ" | "ARCHIVED";
  recipientId?: string;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceNotificationPreferences {
  id: string;
  workspaceId: string;
  tenantId: string;
  enableInApp: boolean;
  enableEmail: boolean;
  enablePush: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface NotificationContextType {
  notifications: WorkspaceNotification[];
  preferences: WorkspaceNotificationPreferences | null;
  loading: boolean;
  error: string | null;
  markAsRead: (id: string) => Promise<void>;
  markAsArchived: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  updatePreferencesSetting: (enableInApp: boolean, enableEmail: boolean, enablePush: boolean) => Promise<void>;
  isOwnerOrAdmin: boolean;
  generateDynamicAdvisoryAlerts: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const LOCAL_NOTIF_KEY = "mykerani_notifications_repository";
const LOCAL_PREF_KEY = "mykerani_notification_preferences_repository";

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isMockUser } = useAuth();
  const { activeTenant } = useTenant();
  const { activeWorkspace } = useWorkspace();
  const { writeAuditLog } = useAudit();
  const { activeProvider } = useStorage();
  const { financialEvents, financialCommitments, financialEvidencePackages, cashAccounts, bankAccounts, debtRecords } = useFinancials();

  const [notifications, setNotifications] = useState<WorkspaceNotification[]>([]);
  const [preferences, setPreferences] = useState<WorkspaceNotificationPreferences | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Permission Integration: Only HQ_ADMIN, TENANT_OWNER, TENANT_ADMIN can modify preferences
  const isOwnerOrAdmin = !!(user && ["HQ_OWNER", "HQ_STAFF", "TENANT_OWNER"].includes(user.role));

  // Load Preferences & Notifications
  const fetchNotificationSettings = useCallback(async () => {
    if (!activeWorkspace || !activeTenant || !user) {
      setNotifications([]);
      setPreferences(null);
      return;
    }

    setLoading(true);
    setError(null);

    const workspaceId = activeWorkspace.id;
    const tenantId = activeTenant.id;

    if (!isSupabaseConfigured() || isMockUser || isDemoWorkspace(activeWorkspace.id)) {
      // 1. Mock Local Storage Path
      // Load Preferences
      const storedPrefsRaw = localStorage.getItem(LOCAL_PREF_KEY);
      let workspacePrefs: WorkspaceNotificationPreferences | null = null;
      if (storedPrefsRaw) {
        try {
          const parsed = JSON.parse(storedPrefsRaw) as WorkspaceNotificationPreferences[];
          const found = parsed.find(p => p.workspaceId === workspaceId);
          if (found) workspacePrefs = found;
        } catch (e) {
          console.error("Local preferences load failure, resetting:", e);
        }
      }

      if (!workspacePrefs) {
        workspacePrefs = {
          id: `pref-mock-${workspaceId}`,
          workspaceId,
          tenantId,
          enableInApp: true,
          enableEmail: true,
          enablePush: true,
        };
        const allPrefs = storedPrefsRaw ? JSON.parse(storedPrefsRaw) : [];
        allPrefs.push(workspacePrefs);
        localStorage.setItem(LOCAL_PREF_KEY, JSON.stringify(allPrefs));
      }
      setPreferences(workspacePrefs);

      // Load Notifications
      const storedNotifsRaw = localStorage.getItem(LOCAL_NOTIF_KEY);
      let workspaceNotifs: WorkspaceNotification[] = [];
      if (storedNotifsRaw) {
        try {
          const parsed = JSON.parse(storedNotifsRaw) as WorkspaceNotification[];
          workspaceNotifs = parsed.filter(n => n.workspaceId === workspaceId && n.tenantId === tenantId);
        } catch (e) {
          console.error("Local notifications load failure:", e);
        }
      }
      // Sort newest first
      workspaceNotifs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setNotifications(workspaceNotifs);
      setLoading(false);
    } else {
      // 2. Real DB Supabase Path
      if (!supabase) {
        setLoading(false);
        return;
      }

      try {
        // Fetch Preferences
        const { data: prefData, error: prefError } = await supabase
          .from("workspace_notification_preferences")
          .select("*")
          .eq("workspace_id", workspaceId)
          .maybeSingle();

        if (prefError) {
          // Table belum wujud — guna default fallback tanpa crash
          console.warn("workspace_notification_preferences not ready:", prefError.message);
          setPreferences({
            id: `pref-fallback-${workspaceId}`,
            workspaceId,
            tenantId,
            enableInApp: true,
            enableEmail: false,
            enablePush: false,
          });
          setNotifications([]);
          setLoading(false);
          return;
        }

        let activePrefs: WorkspaceNotificationPreferences;
        if (prefData) {
          activePrefs = {
            id: prefData.id,
            workspaceId: prefData.workspace_id,
            tenantId: prefData.tenant_id,
            enableInApp: prefData.enable_in_app,
            enableEmail: prefData.enable_email,
            enablePush: prefData.enable_push,
            createdAt: prefData.created_at,
            updatedAt: prefData.updated_at,
          };
        } else {
          // Auto seeds preferences
          const { data: insertedPref, error: insertPrefError } = await supabase
            .from("workspace_notification_preferences")
            .insert({
              workspace_id: workspaceId,
              tenant_id: tenantId,
              enable_in_app: true,
              enable_email: true,
              enable_push: true,
            })
            .select()
            .single();

          if (insertPrefError) throw insertPrefError;

          activePrefs = {
            id: insertedPref.id,
            workspaceId: insertedPref.workspace_id,
            tenantId: insertedPref.tenant_id,
            enableInApp: insertedPref.enable_in_app,
            enableEmail: insertedPref.enable_email,
            enablePush: insertedPref.enable_push,
            createdAt: insertedPref.created_at,
            updatedAt: insertedPref.updated_at,
          };
        }
        setPreferences(activePrefs);

        // Fetch Notifications
        const { data: notifData, error: notifError } = await supabase
          .from("workspace_notifications")
          .select("*")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false });

        if (notifError) throw notifError;

        const activeNotifs: WorkspaceNotification[] = (notifData || []).map(n => ({
          id: n.id,
          workspaceId: n.workspace_id,
          tenantId: n.tenant_id,
          category: n.category as any,
          title: n.title,
          message: n.message,
          status: n.status as any,
          recipientId: n.recipient_id,
          metadata: n.metadata,
          createdAt: n.created_at,
          updatedAt: n.updated_at,
        }));

        setNotifications(activeNotifs);
      } catch (err: any) {
        console.error("Notifications Engine initialization error:", err.message);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
  }, [activeWorkspace?.id, activeTenant?.id, user?.id, isMockUser]);

  useEffect(() => {
    let cancelled = false;
    fetchNotificationSettings();
    return () => { cancelled = true; };
  }, [fetchNotificationSettings]);

  // Action: Mark single notification as Read
  const markAsRead = async (id: string) => {
    if (!activeWorkspace || !activeTenant || !user) return;

    const targetNotif = notifications.find(n => n.id === id);
    if (!targetNotif) return;

    const oldState = { ...targetNotif };
    const newState = { ...targetNotif, status: "READ" as const, updatedAt: new Date().toISOString() };

    if (!isSupabaseConfigured() || isMockUser || isDemoWorkspace(activeWorkspace.id)) {
      // Mock update
      const storedNotifsRaw = localStorage.getItem(LOCAL_NOTIF_KEY);
      let allNotifs: WorkspaceNotification[] = storedNotifsRaw ? JSON.parse(storedNotifsRaw) : [];
      allNotifs = allNotifs.map(n => n.id === id ? newState : n);
      localStorage.setItem(LOCAL_NOTIF_KEY, JSON.stringify(allNotifs));

      setNotifications(prev => prev.map(n => n.id === id ? newState : n));

      await writeAuditLog({
        workspaceId: activeWorkspace.id,
        module: "Notifications",
        action: "UPDATE",
        oldValue: oldState,
        newValue: newState,
      });
    } else {
      if (!supabase) return;

      try {
        const { error: patchError } = await supabase
          .from("workspace_notifications")
          .update({ status: "READ", updated_at: new Date().toISOString() })
          .eq("id", id);

        if (patchError) throw patchError;

        setNotifications(prev => prev.map(n => n.id === id ? newState : n));

        await writeAuditLog({
          workspaceId: activeWorkspace.id,
          module: "Notifications",
          action: "UPDATE",
          oldValue: oldState,
          newValue: newState,
        });
      } catch (err: any) {
        console.error("Database markAsRead failed:", err.message);
      }
    }
  };

  // Action: Mark single notification as Archived
  const markAsArchived = async (id: string) => {
    if (!activeWorkspace || !activeTenant || !user) return;

    const targetNotif = notifications.find(n => n.id === id);
    if (!targetNotif) return;

    const oldState = { ...targetNotif };
    const newState = { ...targetNotif, status: "ARCHIVED" as const, updatedAt: new Date().toISOString() };

    if (!isSupabaseConfigured() || isMockUser || isDemoWorkspace(activeWorkspace.id)) {
      // Mock update
      const storedNotifsRaw = localStorage.getItem(LOCAL_NOTIF_KEY);
      let allNotifs: WorkspaceNotification[] = storedNotifsRaw ? JSON.parse(storedNotifsRaw) : [];
      allNotifs = allNotifs.map(n => n.id === id ? newState : n);
      localStorage.setItem(LOCAL_NOTIF_KEY, JSON.stringify(allNotifs));

      setNotifications(prev => prev.map(n => n.id === id ? newState : n));

      await writeAuditLog({
        workspaceId: activeWorkspace.id,
        module: "Notifications",
        action: "UPDATE",
        oldValue: oldState,
        newValue: newState,
      });
    } else {
      if (!supabase) return;

      try {
        const { error: patchError } = await supabase
          .from("workspace_notifications")
          .update({ status: "ARCHIVED", updated_at: new Date().toISOString() })
          .eq("id", id);

        if (patchError) throw patchError;

        setNotifications(prev => prev.map(n => n.id === id ? newState : n));

        await writeAuditLog({
          workspaceId: activeWorkspace.id,
          module: "Notifications",
          action: "UPDATE",
          oldValue: oldState,
          newValue: newState,
        });
      } catch (err: any) {
        console.error("Database markAsArchived failed:", err.message);
      }
    }
  };

  // Action: Mark all notifications as Read
  const markAllAsRead = async () => {
    if (!activeWorkspace || !activeTenant || !user) return;

    const unread = notifications.filter(n => n.status === "UNREAD");
    if (unread.length === 0) return;

    const nowStr = new Date().toISOString();

    if (!isSupabaseConfigured() || isMockUser || isDemoWorkspace(activeWorkspace.id)) {
      const storedNotifsRaw = localStorage.getItem(LOCAL_NOTIF_KEY);
      let allNotifs: WorkspaceNotification[] = storedNotifsRaw ? JSON.parse(storedNotifsRaw) : [];
      allNotifs = allNotifs.map(n => {
        if (n.workspaceId === activeWorkspace.id && n.status === "UNREAD") {
          return { ...n, status: "READ" as const, updatedAt: nowStr };
        }
        return n;
      });
      localStorage.setItem(LOCAL_NOTIF_KEY, JSON.stringify(allNotifs));

      setNotifications(prev => prev.map(n => n.status === "UNREAD" ? { ...n, status: "READ" as const, updatedAt: nowStr } : n));

      await writeAuditLog({
        workspaceId: activeWorkspace.id,
        module: "Notifications",
        action: "UPDATE",
        oldValue: { count: unread.length, status: "UNREAD" },
        newValue: { count: unread.length, status: "READ" },
      });
    } else {
      if (!supabase) return;

      try {
        const { error: patchError } = await supabase
          .from("workspace_notifications")
          .update({ status: "READ", updated_at: nowStr })
          .eq("workspace_id", activeWorkspace.id)
          .eq("status", "UNREAD");

        if (patchError) throw patchError;

        setNotifications(prev => prev.map(n => n.status === "UNREAD" ? { ...n, status: "READ" as const, updatedAt: nowStr } : n));

        await writeAuditLog({
          workspaceId: activeWorkspace.id,
          module: "Notifications",
          action: "UPDATE",
          oldValue: { count: unread.length, status: "UNREAD" },
          newValue: { count: unread.length, status: "READ" },
        });
      } catch (err: any) {
        console.error("Database markAllAsRead failed:", err.message);
      }
    }
  };

  // Action: Modify Preferences with strict permission checks
  const updatePreferencesSetting = async (enableInApp: boolean, enableEmail: boolean, enablePush: boolean) => {
    if (!activeWorkspace || !activeTenant || !user) return;

    if (!isOwnerOrAdmin) {
      throw new Error("Access Denied: Only HQ_ADMINs, TENANT_OWNERs, or TENANT_ADMINs may modify workspace notification configurations.");
    }

    const prevPrefs = preferences;
    const oldVal = prevPrefs ? { ...prevPrefs } : null;

    const workspaceId = activeWorkspace.id;
    const nowStr = new Date().toISOString();

    const updated: WorkspaceNotificationPreferences = {
      id: prevPrefs?.id || `pref-mock-${workspaceId}`,
      workspaceId,
      tenantId: activeTenant.id,
      enableInApp,
      enableEmail,
      enablePush,
      createdAt: prevPrefs?.createdAt,
      updatedAt: nowStr,
    };

    if (!isSupabaseConfigured() || isMockUser || isDemoWorkspace(activeWorkspace.id)) {
      // Mock Storage update
      const storedPrefsRaw = localStorage.getItem(LOCAL_PREF_KEY);
      let allPrefs: WorkspaceNotificationPreferences[] = storedPrefsRaw ? JSON.parse(storedPrefsRaw) : [];
      
      const foundIdx = allPrefs.findIndex(p => p.workspaceId === workspaceId);
      if (foundIdx >= 0) {
        allPrefs[foundIdx] = updated;
      } else {
        allPrefs.push(updated);
      }
      localStorage.setItem(LOCAL_PREF_KEY, JSON.stringify(allPrefs));

      setPreferences(updated);

      await writeAuditLog({
        workspaceId,
        module: "Notifications",
        action: "UPDATE",
        oldValue: oldVal,
        newValue: updated,
      });
    } else {
      if (!supabase) return;

      try {
        const { data, error: updateError } = await supabase
          .from("workspace_notification_preferences")
          .update({
            enable_in_app: enableInApp,
            enable_email: enableEmail,
            enable_push: enablePush,
            updated_at: nowStr,
          })
          .eq("workspace_id", workspaceId)
          .select()
          .single();

        if (updateError) throw updateError;

        const activePrefs: WorkspaceNotificationPreferences = {
          id: data.id,
          workspaceId: data.workspace_id,
          tenantId: data.tenant_id,
          enableInApp: data.enable_in_app,
          enableEmail: data.enable_email,
          enablePush: data.enable_push,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        };

        setPreferences(activePrefs);

        await writeAuditLog({
          workspaceId,
          module: "Notifications",
          action: "UPDATE",
          oldValue: oldVal,
          newValue: activePrefs,
        });
      } catch (err: any) {
        throw new Error(`Failed to update settings in DB: ${err.message}`);
      }
    }
  };

  // dynamic detector engine: Checks active data matrices and alerts
  const generateDynamicAdvisoryAlerts = async () => {
    if (!activeWorkspace || !activeTenant || !user) return;

    // If in-app notifications are disabled, skip advisory alerts entirely
    if (preferences?.enableInApp === false) return;

    const workspaceId = activeWorkspace.id;
    const tenantId = activeTenant.id;

    // We anchor today's date strictly as 2026-06-14 as per system timeline metadata
    const TODAY_STR = "2026-06-14";
    const today = new Date(TODAY_STR);

    // Track alerts to insert
    const proposedAlerts: Omit<WorkspaceNotification, "id" | "createdAt" | "updatedAt">[] = [];

    // --- Helper function to parse dates robustly ---
    const getDaysDelta = (dueDateStr: string | undefined): number | null => {
      if (!dueDateStr) return null;
      const t = new Date(dueDateStr);
      if (isNaN(t.getTime())) return null;
      const diffTime = t.getTime() - today.getTime();
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };

    // 1. --- Financial Commitments Reminders ---
    financialCommitments.forEach(c => {
      if (!c.isActive || c.status !== "ACTIVE") return;
      
      const delta = getDaysDelta(c.startDate);
      if (delta === null) return;

      const metaKey = `commitment_alert_${c.id}`;

      if (delta < 0) {
        // Overdue Alert
        proposedAlerts.push({
          workspaceId,
          tenantId,
          category: "COMMITMENT",
          title: "Overdue Operational Commitment",
          message: `The lease, recurring fee, or contract obligation for "${c.obligeeName}" (RM ${c.amountPerIntervalMyr.toLocaleString("en-MY", { minimumFractionDigits: 2 })}) was due on ${c.startDate} and is now overdue.`,
          status: "UNREAD",
          metadata: { alert_key: `${metaKey}_overdue`, commitment_id: c.id }
        });
      } else if (delta === 0) {
        // Due Today Alert
        proposedAlerts.push({
          workspaceId,
          tenantId,
          category: "COMMITMENT",
          title: "Operational Commitment Due Today",
          message: `The recurring operational invoice or contract for "${c.obligeeName}" (RM ${c.amountPerIntervalMyr.toLocaleString("en-MY", { minimumFractionDigits: 2 })}) is scheduled for settlement today.`,
          status: "UNREAD",
          metadata: { alert_key: `${metaKey}_today_${TODAY_STR}`, commitment_id: c.id }
        });
      } else if (delta === 7) {
        // Due in 7 Days Alert
        proposedAlerts.push({
          workspaceId,
          tenantId,
          category: "COMMITMENT",
          title: "Commitment Alert: Due in 7 Days",
          message: `The ongoing operational contract with "${c.obligeeName}" (RM ${c.amountPerIntervalMyr.toLocaleString("en-MY", { minimumFractionDigits: 2 })}) is scheduled to trigger in 7 days (${c.startDate}).`,
          status: "UNREAD",
          metadata: { alert_key: `${metaKey}_7days_${TODAY_STR}`, commitment_id: c.id }
        });
      } else if (delta === 30) {
        // Due in 30 Days Alert
        proposedAlerts.push({
          workspaceId,
          tenantId,
          category: "COMMITMENT",
          title: "Commitment Alert: Due in 30 Days",
          message: `The lease or capital obligation with "${c.obligeeName}" (RM ${c.amountPerIntervalMyr.toLocaleString("en-MY", { minimumFractionDigits: 2 })}) is scheduled to fall due in 30 days (${c.startDate}).`,
          status: "UNREAD",
          metadata: { alert_key: `${metaKey}_30days_${TODAY_STR}`, commitment_id: c.id }
        });
      }
    });

    // 2. --- Receivable Events Reminders ---
    const receivables = financialEvents.filter(e => e.type === "RECEIVABLE" && !e.isCompleted);
    receivables.forEach(r => {
      const delta = getDaysDelta(r.dueDate);
      if (delta === null) return;

      const metaKey = `receivable_alert_${r.id}`;

      if (delta < 0) {
        proposedAlerts.push({
          workspaceId,
          tenantId,
          category: "RECEIVABLE",
          title: "Overdue Customer Receivable Alert",
          message: `The sales receivable invoice reference ${r.referenceNumber || r.id.substring(0,8)} from customer "${r.partyName}" (RM ${r.amountMyr.toLocaleString("en-MY", { minimumFractionDigits: 2 })}) is overdue since ${r.dueDate}.`,
          status: "UNREAD",
          metadata: { alert_key: `${metaKey}_overdue`, receivable_id: r.id }
        });
      } else if (delta === 0) {
        proposedAlerts.push({
          workspaceId,
          tenantId,
          category: "RECEIVABLE",
          title: "Customer Receivable Due Today",
          message: `The sales receivable billing reference ${r.referenceNumber || r.id.substring(0,8)} from "${r.partyName}" (RM ${r.amountMyr.toLocaleString("en-MY", { minimumFractionDigits: 2 })}) is expected to clear today.`,
          status: "UNREAD",
          metadata: { alert_key: `${metaKey}_today_${TODAY_STR}`, receivable_id: r.id }
        });
      } else if (delta === 7) {
        proposedAlerts.push({
          workspaceId,
          tenantId,
          category: "RECEIVABLE",
          title: "Receivable Alert: Due in 7 Days",
          message: `The client invoice reference ${r.referenceNumber || r.id.substring(0,8)} for "${r.partyName}" (RM ${r.amountMyr.toLocaleString("en-MY", { minimumFractionDigits: 2 })}) is due for settlement in 7 days (${r.dueDate}).`,
          status: "UNREAD",
          metadata: { alert_key: `${metaKey}_7days_${TODAY_STR}`, receivable_id: r.id }
        });
      }
    });

    // 3. --- Payable Events Reminders ---
    const payables = financialEvents.filter(e => e.type === "PAYABLE" && !e.isCompleted);
    payables.forEach(p => {
      const delta = getDaysDelta(p.dueDate);
      if (delta === null) return;

      const metaKey = `payable_alert_${p.id}`;

      if (delta < 0) {
        proposedAlerts.push({
          workspaceId,
          tenantId,
          category: "PAYABLE",
          title: "Overdue Supplier Payable Alert",
          message: `The supplier payable reference ${p.referenceNumber || p.id.substring(0,8)} to vendor "${p.partyName}" (RM ${p.amountMyr.toLocaleString("en-MY", { minimumFractionDigits: 2 })}) is overdue since ${p.dueDate}.`,
          status: "UNREAD",
          metadata: { alert_key: `${metaKey}_overdue`, payable_id: p.id }
        });
      } else if (delta === 0) {
        proposedAlerts.push({
          workspaceId,
          tenantId,
          category: "PAYABLE",
          title: "Supplier Payable Due Today",
          message: `The purchase payable billing reference ${p.referenceNumber || p.id.substring(0,8)} to vendor "${p.partyName}" (RM ${p.amountMyr.toLocaleString("en-MY", { minimumFractionDigits: 2 })}) is due for settlement today.`,
          status: "UNREAD",
          metadata: { alert_key: `${metaKey}_today_${TODAY_STR}`, payable_id: p.id }
        });
      } else if (delta === 7) {
        proposedAlerts.push({
          workspaceId,
          tenantId,
          category: "PAYABLE",
          title: "Payable Alert: Due in 7 Days",
          message: `The supplier bill reference ${p.referenceNumber || p.id.substring(0,8)} to "${p.partyName}" (RM ${p.amountMyr.toLocaleString("en-MY", { minimumFractionDigits: 2 })}) falls due in 7 days (${p.dueDate}).`,
          status: "UNREAD",
          metadata: { alert_key: `${metaKey}_7days_${TODAY_STR}`, payable_id: p.id }
        });
      }
    });

    // 3b. --- Missing Evidence Detector ---
    // Vision requirement: AI must detect missing supporting documents ("kesan dokumen hilang").
    // Flag any EXPENSE or PAYABLE event above RM100 with no linked evidence document.
    const recordsWithEvidence = new Set(
      financialEvidencePackages
        .map(doc => doc.relatedRecordId)
        .filter((id): id is string => !!id)
    );
    financialEvents
      .filter(e => (e.type === "EXPENSE" || e.type === "PAYABLE") && e.amountMyr >= 100 && !recordsWithEvidence.has(e.id))
      .forEach(e => {
        proposedAlerts.push({
          workspaceId,
          tenantId,
          category: "FINANCIAL_RECORD",
          title: "Dokumen Sokongan Tiada (Missing Evidence)",
          message: `Rekod ${e.type === "PAYABLE" ? "hutang pembekal" : "perbelanjaan"} untuk "${e.partyName}" (RM ${e.amountMyr.toLocaleString("en-MY", { minimumFractionDigits: 2 })}) belum mempunyai resit/invois disahkan. Sila muat naik dokumen sokongan untuk rekod lengkap.`,
          status: "UNREAD",
          metadata: { alert_key: `missing_evidence_${e.id}`, financial_event_id: e.id }
        });
      });

    // 3c. --- Financial Health Risk Detector ---
    // Reuses the exact same solvency/quick-ratio/runway model shown in the
    // Financial Health report so the proactive alert never contradicts the report.
    const scoring = computeFinancialHealthScoring(cashAccounts, bankAccounts, financialEvents, debtRecords, financialCommitments, today);

    if (scoring.solvencyGrade === "Critical Risk") {
      proposedAlerts.push({
        workspaceId,
        tenantId,
        category: "FINANCIAL_RECORD",
        title: "Amaran Kesihatan Kewangan: Risiko Solvensi Kritikal",
        message: `Nisbah aset berbanding liabiliti anda kini ${scoring.solvencyRatio.toFixed(2)}x — jumlah hutang dan bil pembekal melebihi jumlah tunai dan tuntutan anda. Sila semak Laporan Kesihatan & Kelangsungan untuk butiran penuh.`,
        status: "UNREAD",
        metadata: { alert_key: `health_solvency_critical_${TODAY_STR}` }
      });
    }

    if (scoring.runwayGrade === "Immediate Action Required (< 2 Months)") {
      proposedAlerts.push({
        workspaceId,
        tenantId,
        category: "FINANCIAL_RECORD",
        title: "Amaran Kesihatan Kewangan: Kelangsungan Operasi Terhad",
        message: `Baki tunai cair anda hanya mampu menampung komitmen bulanan untuk ${scoring.runwayMonths.toFixed(1)} bulan sahaja. Sila semak Laporan Kesihatan & Kelangsungan dan pertimbangkan langkah memulihkan mudah tunai.`,
        status: "UNREAD",
        metadata: { alert_key: `health_runway_critical_${TODAY_STR}` }
      });
    }

    // 3d. --- Spending Anomaly Detector ---
    // Vision requirement: AI learns the user's typical spending pattern per category
    // and flags outliers, instead of just recording transactions blindly.
    const currentMonthKey = `${today.getFullYear()}-${today.getMonth()}`;
    const expenseEvents = financialEvents.filter(e => e.type === "EXPENSE" && e.categoryName);

    const byCategory = new Map<string, { currentMonthTotal: number; pastMonthTotals: Map<string, number> }>();
    expenseEvents.forEach(e => {
      const d = new Date(e.date);
      if (isNaN(d.getTime())) return;
      const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
      if (!byCategory.has(e.categoryName)) {
        byCategory.set(e.categoryName, { currentMonthTotal: 0, pastMonthTotals: new Map() });
      }
      const entry = byCategory.get(e.categoryName)!;
      if (monthKey === currentMonthKey) {
        entry.currentMonthTotal += e.amountMyr;
      } else {
        entry.pastMonthTotals.set(monthKey, (entry.pastMonthTotals.get(monthKey) || 0) + e.amountMyr);
      }
    });

    byCategory.forEach((entry, categoryName) => {
      const pastMonths = Array.from(entry.pastMonthTotals.values());
      if (pastMonths.length < 2 || entry.currentMonthTotal === 0) return; // need real history to learn a baseline

      const avgPastMonth = pastMonths.reduce((sum, v) => sum + v, 0) / pastMonths.length;
      if (avgPastMonth <= 0) return;

      const increasePct = ((entry.currentMonthTotal - avgPastMonth) / avgPastMonth) * 100;
      if (increasePct >= 50 && (entry.currentMonthTotal - avgPastMonth) >= 50) {
        proposedAlerts.push({
          workspaceId,
          tenantId,
          category: "FINANCIAL_RECORD",
          title: `Corak Perbelanjaan Luar Biasa: ${categoryName}`,
          message: `Perbelanjaan kategori "${categoryName}" bulan ini RM ${entry.currentMonthTotal.toLocaleString("en-MY", { minimumFractionDigits: 2 })}, iaitu ${increasePct.toFixed(0)}% lebih tinggi daripada purata bulanan biasa anda (RM ${avgPastMonth.toLocaleString("en-MY", { minimumFractionDigits: 2 })}). Sila semak rekod untuk pastikan semuanya betul.`,
          status: "UNREAD",
          metadata: { alert_key: `spend_anomaly_${categoryName}_${currentMonthKey}` }
        });
      }
    });

    // 4. --- Backup Detector ---
    const backupsRepoRaw = localStorage.getItem("mykerani_backups_repository");
    let workspaceBackups: any[] = [];
    if (backupsRepoRaw) {
      try {
        workspaceBackups = JSON.parse(backupsRepoRaw).filter(
          (b: any) => b.workspaceId === workspaceId && b.tenantId === tenantId
        );
      } catch (e) {
        console.error("Backup repo check failed:", e);
      }
    }

    if (workspaceBackups.length === 0) {
      proposedAlerts.push({
        workspaceId,
        tenantId,
        category: "BACKUP",
        title: "Disaster Backup Alert: No Backups Detected",
        message: "No auditable workspace database snapshots were detected in the repository index. Run a manual JSON archive now to safeguard corporate financial registers.",
        status: "UNREAD",
        metadata: { alert_key: "backup_none_detected" }
      });
    } else {
      // Check oldest snapshot
      const orderedBackups = [...workspaceBackups].sort(
        (a, b) => new Date(b.backupDate).getTime() - new Date(a.backupDate).getTime()
      );
      const latestBackupTime = new Date(orderedBackups[0].backupDate);
      const diffTime = today.getTime() - latestBackupTime.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays > 30) {
        proposedAlerts.push({
          workspaceId,
          tenantId,
          category: "BACKUP",
          title: "Backup Alert: Snapshot Stale (>30 days)",
          message: `Your latest workspace backup metadata is ${diffDays} days old (latest: ${orderedBackups[0].backupDate}). Please capture a secure backup snapshot immediately.`,
          status: "UNREAD",
          metadata: { alert_key: `backup_stale_${TODAY_STR}` }
        });
      }
    }

    // 5. --- Storage Sync Alerts ---
    if (activeProvider && activeProvider.providerType !== "HQ_MANAGED") {
      if (activeProvider.connectionStatus === "DISCONNECTED") {
        proposedAlerts.push({
          workspaceId,
          tenantId,
          category: "STORAGE",
          title: "Storage Alert: Endpoint Disconnected",
          message: `The third-party BYOS Cloud Provider (${activeProvider.providerType.replace("_", " ")}) is currently unlinked. Uploaded evidence will defaults back to local HQ Sandbox Storage.`,
          status: "UNREAD",
          metadata: { alert_key: `storage_disconnected_${activeProvider.providerType}` }
        });
      } else {
        // Simulate sync check or failed sync metadata mock logs for visual testing
        // Let's add a sync alert if the active provider has sync error metadata in mockup mode
        // For audit check simplicity, we can have a dynamic option
      }
    }

    // --- Filter and execute insertions ---
    // Get currently registered dynamic keys in local notifications list
    const activeKeys = new Set(
      notifications
        .map(n => n.metadata?.alert_key)
        .filter(key => !!key)
    );

    const newAlertsToInsert = proposedAlerts.filter(a => !activeKeys.has(a.metadata.alert_key));

    if (newAlertsToInsert.length === 0) return;

    if (!isSupabaseConfigured() || isMockUser || isDemoWorkspace(activeWorkspace.id)) {
      // Mock Storage Insert
      const storedNotifsRaw = localStorage.getItem(LOCAL_NOTIF_KEY);
      const allNotifs: WorkspaceNotification[] = storedNotifsRaw ? JSON.parse(storedNotifsRaw) : [];

      const insertedNotifs: WorkspaceNotification[] = newAlertsToInsert.map(a => {
        const id = `notif-mock-${Math.random().toString(36).substring(2, 11)}`;
        return {
          ...a,
          id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      });

      const updated = [...insertedNotifs, ...allNotifs];
      localStorage.setItem(LOCAL_NOTIF_KEY, JSON.stringify(updated));

      // Fetch newly integrated set
      const workspaceNotifs = updated.filter(n => n.workspaceId === workspaceId && n.tenantId === tenantId);
      workspaceNotifs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setNotifications(workspaceNotifs);

      // Audit logs
      for (const fresh of insertedNotifs) {
        await writeAuditLog({
          workspaceId,
          module: "Notifications",
          action: "CREATE",
          oldValue: null,
          newValue: fresh,
        });
      }
    } else {
      if (!supabase) return;

      try {
        const insertPayload = newAlertsToInsert.map(a => ({
          workspace_id: a.workspaceId,
          tenant_id: a.tenantId,
          category: a.category,
          title: a.title,
          message: a.message,
          status: a.status,
          recipient_id: a.recipientId || null,
          metadata: a.metadata,
        }));

        const { data: insertedData, error: dbInsertError } = await supabase
          .from("workspace_notifications")
          .insert(insertPayload)
          .select();

        if (dbInsertError) throw dbInsertError;

        if (insertedData && insertedData.length > 0) {
          const freshNotifs: WorkspaceNotification[] = insertedData.map(n => ({
            id: n.id,
            workspaceId: n.workspace_id,
            tenantId: n.tenant_id,
            category: n.category as any,
            title: n.title,
            message: n.message,
            status: n.status as any,
            recipientId: n.recipient_id,
            metadata: n.metadata,
            createdAt: n.created_at,
            updatedAt: n.updated_at,
          }));

          setNotifications(prev => [...freshNotifs, ...prev].sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));

          for (const fresh of freshNotifs) {
            await writeAuditLog({
              workspaceId,
              module: "Notifications",
              action: "CREATE",
              oldValue: null,
              newValue: fresh,
            });
          }
        }
      } catch (err: any) {
        console.error("Failed storing dynamic notifications in DB:", err.message);
      }
    }
  };

  // Run dynamic analysis whenever workspace data shifts
  useEffect(() => {
    if (activeWorkspace && activeTenant && user && financialEvents.length >= 0) {
      // Use setTimeout to allow previous states to fully resolve and prevent re-render loops
      const timer = setTimeout(() => {
        generateDynamicAdvisoryAlerts();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [activeWorkspace?.id, activeTenant?.id, user?.id, financialEvents, financialCommitments, activeProvider?.connectionStatus]);

  return (
    <NotificationContext.Provider
      value={useMemo(() => ({
        notifications,
        preferences,
        loading,
        error,
        markAsRead,
        markAsArchived,
        markAllAsRead,
        updatePreferencesSetting,
        isOwnerOrAdmin,
        generateDynamicAdvisoryAlerts,
      }), [notifications, preferences, loading, error, markAsRead, markAsArchived, markAllAsRead, updatePreferencesSetting, isOwnerOrAdmin, generateDynamicAdvisoryAlerts])}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error("useNotifications must be used inside a NotificationProvider");
  }
  return context;
};
