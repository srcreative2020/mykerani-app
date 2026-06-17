import { useState, useEffect, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────────
export type NotifSeverity = "info" | "warn" | "critical";
export type NotifAction   = "billing" | "storage" | "support" | "dashboard" | "customers" | "system";

export interface AppNotif {
  id: string;
  type: string;
  severity: NotifSeverity;
  title: string;
  body: string;
  at: string;          // ISO
  read: boolean;
  action?: NotifAction;
  tenantName?: string; // for HQ notifications
}

// ── Hook ───────────────────────────────────────────────────────────────────
export function useNotifications(scopeId: string) {
  const key = `mykerani_notifs_${scopeId}`;

  const [notifs, setNotifs] = useState<AppNotif[]>(() => {
    try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(notifs));
  }, [notifs, key]);

  const unreadCount = notifs.filter(n => !n.read).length;

  const push = useCallback((n: Omit<AppNotif, "id" | "at" | "read">) => {
    setNotifs(prev => {
      // Deduplicate by type — don't add same type if last one is < 1 hour old and unread
      const recent = prev.find(p => p.type === n.type && !p.read && (Date.now() - new Date(p.at).getTime()) < 3_600_000);
      if (recent) return prev;
      const newNotif: AppNotif = { ...n, id: `n-${Date.now()}-${Math.random().toString(36).slice(2)}`, at: new Date().toISOString(), read: false };
      return [newNotif, ...prev].slice(0, 50); // keep max 50
    });
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifs(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearAll = useCallback(() => setNotifs([]), []);

  return { notifs, unreadCount, push, markRead, markAllRead, dismiss, clearAll };
}

// ── Auto-notification generators ───────────────────────────────────────────

export interface TenantNotifContext {
  storagePct: number;
  isFrozen: boolean;
  frozenReason: string;
  aiCreditsUsed: number;
  aiCreditsTotal: number;
  renewalDaysLeft: number;
  hasOpenTicket: boolean;
}

export function buildTenantNotifs(ctx: TenantNotifContext): Omit<AppNotif, "id" | "at" | "read">[] {
  const notifs: Omit<AppNotif, "id" | "at" | "read">[] = [];

  // Storage
  if (ctx.isFrozen) {
    notifs.push({
      type: "storage_frozen",
      severity: "critical",
      title: "Storan Dibekukan",
      body: ctx.frozenReason === "quota_exceeded"
        ? "Upload disekat kerana storan melebihi 95%. Beli tambahan storan."
        : ctx.frozenReason === "inactive"
        ? "Storan dibekukan kerana akaun tidak aktif. Hubungi HQ."
        : "HQ telah membekukan storan anda. Hubungi HQ untuk maklumat.",
      action: "storage",
    });
  } else if (ctx.storagePct >= 0.95) {
    notifs.push({ type: "storage_95", severity: "critical", title: "Storan Kritikal (95%)", body: "Upload hampir disekat. Tambah storan segera.", action: "storage" });
  } else if (ctx.storagePct >= 0.85) {
    notifs.push({ type: "storage_85", severity: "warn", title: "Storan Hampir Penuh (85%)", body: "Pertimbangkan tambah storan sebelum disekat.", action: "storage" });
  } else if (ctx.storagePct >= 0.70) {
    notifs.push({ type: "storage_70", severity: "info", title: "Storan Mencapai 70%", body: "Pantau penggunaan storan anda.", action: "storage" });
  }

  // AI Credits
  const aiPct = ctx.aiCreditsTotal > 0 ? ctx.aiCreditsUsed / ctx.aiCreditsTotal : 0;
  if (aiPct >= 0.95) {
    notifs.push({ type: "ai_95", severity: "critical", title: "Kredit AI Hampir Habis", body: "Hanya tinggal 5% kredit AI. Beli tambahan atau tunggu renewal.", action: "billing" });
  } else if (aiPct >= 0.80) {
    notifs.push({ type: "ai_80", severity: "warn", title: "Kredit AI 80% Digunakan", body: `${Math.round((1 - aiPct) * ctx.aiCreditsTotal)} kredit berbaki bulan ini.`, action: "billing" });
  }

  // Renewal
  if (ctx.renewalDaysLeft <= 3) {
    notifs.push({ type: "renewal_3", severity: "critical", title: "Langganan Tamat dalam 3 Hari", body: "Perbaharui sekarang untuk elak gangguan perkhidmatan.", action: "billing" });
  } else if (ctx.renewalDaysLeft <= 7) {
    notifs.push({ type: "renewal_7", severity: "warn", title: "Langganan Tamat dalam 7 Hari", body: "Ingat perbaharui langganan anda.", action: "billing" });
  }

  // Support reply
  if (ctx.hasOpenTicket) {
    notifs.push({ type: "ticket_open", severity: "info", title: "Tiket Sokongan Menunggu", body: "Anda mempunyai tiket sokongan yang belum diselesaikan.", action: "support" });
  }

  return notifs;
}

export interface HQNotifContext {
  frozenTenants: string[];
  inactiveTenants: string[];
  highStorageTenants: { name: string; pct: number }[];
  openTickets: number;
  supabasePct: number;
  newCustomers: string[];
}

export function buildHQNotifs(ctx: HQNotifContext): Omit<AppNotif, "id" | "at" | "read">[] {
  const notifs: Omit<AppNotif, "id" | "at" | "read">[] = [];

  if (ctx.supabasePct >= 0.85) {
    notifs.push({ type: "hq_supabase_85", severity: "critical", title: "Storan Supabase HQ Kritikal", body: `${(ctx.supabasePct * 100).toFixed(0)}% digunakan. Upgrade Supabase plan sebelum pelanggan terjejas.`, action: "system" });
  } else if (ctx.supabasePct >= 0.70) {
    notifs.push({ type: "hq_supabase_70", severity: "warn", title: "Storan Supabase 70%", body: "Sedia upgrade Supabase plan anda.", action: "system" });
  }

  ctx.highStorageTenants.forEach(t => {
    if (t.pct >= 0.90) {
      notifs.push({ type: `tenant_storage_${t.name}`, severity: "critical", title: `${t.name}: Storan ${Math.round(t.pct * 100)}%`, body: "Hampir dibekukan. Hubungi pelanggan atau naikkan had.", action: "customers", tenantName: t.name });
    }
  });

  if (ctx.frozenTenants.length > 0) {
    notifs.push({ type: "hq_frozen_tenants", severity: "critical", title: `${ctx.frozenTenants.length} Tenant Dibekukan`, body: `${ctx.frozenTenants.join(", ")} - storan dibekukan dan perlu perhatian.`, action: "system" });
  }

  if (ctx.inactiveTenants.length > 0) {
    notifs.push({ type: "hq_inactive", severity: "warn", title: `${ctx.inactiveTenants.length} Tenant Tidak Aktif`, body: "Tenant tidak aktif melebihi tempoh yang ditetapkan. Pertimbangkan cleanup.", action: "system" });
  }

  if (ctx.openTickets > 0) {
    notifs.push({ type: "hq_tickets", severity: "warn", title: `${ctx.openTickets} Tiket Sokongan Terbuka`, body: "Pelanggan menunggu respons sokongan.", action: "support" });
  }

  if (ctx.newCustomers.length > 0) {
    notifs.push({ type: "hq_new_customers", severity: "info", title: `${ctx.newCustomers.length} Pelanggan Baru`, body: `${ctx.newCustomers.slice(0, 2).join(", ")} baru mendaftar.`, action: "customers" });
  }

  return notifs;
}

// ── Time formatter ─────────────────────────────────────────────────────────
export function fmtNotifTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)   return "baru sahaja";
  if (mins < 60)  return `${mins} min lalu`;
  if (hours < 24) return `${hours} jam lalu`;
  return `${days} hari lalu`;
}
