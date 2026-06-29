import { useState, useEffect, useCallback, useMemo } from "react";

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

  return useMemo(() => ({ notifs, unreadCount, push, markRead, markAllRead, dismiss, clearAll }), [notifs, unreadCount, push, markRead, markAllRead, dismiss, clearAll]);
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

// ── Financial pattern alerts (real workspace data) ─────────────────────────
import type { FinancialHealthScoring } from "./financialHealth";

export interface FinancialNotifEvent {
  id: string;
  type: string;
  amountMyr: number;
  partyName?: string;
  categoryName?: string;
  date: string;
}

export interface FinancialNotifDoc {
  ocr_parsed_content?: Record<string, any>;
}

export function buildFinancialNotifs(
  events: FinancialNotifEvent[],
  docs: FinancialNotifDoc[],
  scoring: FinancialHealthScoring,
  today: Date
): Omit<AppNotif, "id" | "at" | "read">[] {
  const notifs: Omit<AppNotif, "id" | "at" | "read">[] = [];

  // Missing evidence — expense/payable >= RM100 with no linked document
  const linkedEventIds = new Set<string>();
  docs.forEach(d => {
    const ids = d.ocr_parsed_content?.linkedEventIds;
    if (Array.isArray(ids)) ids.forEach((id: string) => linkedEventIds.add(id));
  });
  events
    .filter(e => (e.type === "EXPENSE" || e.type === "PAYABLE") && e.amountMyr >= 100 && !linkedEventIds.has(e.id))
    .forEach(e => {
      notifs.push({
        type: `missing_evidence_${e.id}`,
        severity: "warn",
        title: "Dokumen Sokongan Tiada",
        body: `Rekod ${e.type === "PAYABLE" ? "hutang pembekal" : "perbelanjaan"} "${e.partyName || "-"}" (RM ${e.amountMyr.toLocaleString("en-MY", { minimumFractionDigits: 2 })}) belum ada resit/invois. Muat naik dokumen sokongan.`,
        action: "dashboard",
      });
    });

  // Financial health risk
  if (scoring.solvencyGrade === "Critical Risk") {
    notifs.push({
      type: "health_solvency_critical",
      severity: "critical",
      title: "Amaran: Risiko Solvensi Kritikal",
      body: "Jumlah liabiliti anda jauh melebihi aset. Semak semula hutang dan komitmen kewangan segera.",
      action: "dashboard",
    });
  }
  if (scoring.runwayGrade === "Immediate Action Required (< 2 Months)") {
    notifs.push({
      type: "health_runway_critical",
      severity: "critical",
      title: "Amaran: Kelangsungan Operasi Terhad",
      body: "Tunai/bank anda dijangka tidak mencukupi untuk komitmen bulanan dalam masa 2 bulan. Pertimbangkan langkah kecairan segera.",
      action: "dashboard",
    });
  }

  // Spending anomaly — category month-over-month increase >= 50% and >= RM50
  const currentMonthKey = `${today.getFullYear()}-${today.getMonth()}`;
  const byCategory = new Map<string, { currentMonthTotal: number; pastMonthTotals: Map<string, number> }>();
  events
    .filter(e => e.type === "EXPENSE" && e.categoryName)
    .forEach(e => {
      const d = new Date(e.date);
      const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
      const cat = e.categoryName as string;
      if (!byCategory.has(cat)) byCategory.set(cat, { currentMonthTotal: 0, pastMonthTotals: new Map() });
      const entry = byCategory.get(cat)!;
      if (monthKey === currentMonthKey) {
        entry.currentMonthTotal += e.amountMyr;
      } else {
        entry.pastMonthTotals.set(monthKey, (entry.pastMonthTotals.get(monthKey) || 0) + e.amountMyr);
      }
    });
  byCategory.forEach((entry, categoryName) => {
    const pastMonths = Array.from(entry.pastMonthTotals.values());
    if (pastMonths.length < 2 || entry.currentMonthTotal === 0) return;
    const avgPastMonth = pastMonths.reduce((sum, v) => sum + v, 0) / pastMonths.length;
    if (avgPastMonth <= 0) return;
    const increasePct = ((entry.currentMonthTotal - avgPastMonth) / avgPastMonth) * 100;
    if (increasePct >= 50 && (entry.currentMonthTotal - avgPastMonth) >= 50) {
      notifs.push({
        type: `spend_anomaly_${categoryName}_${currentMonthKey}`,
        severity: "warn",
        title: `Corak Perbelanjaan Luar Biasa: ${categoryName}`,
        body: `Perbelanjaan kategori "${categoryName}" bulan ini RM ${entry.currentMonthTotal.toFixed(2)}, naik ${increasePct.toFixed(0)}% berbanding purata RM ${avgPastMonth.toFixed(2)}.`,
        action: "dashboard",
      });
    }
  });

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
