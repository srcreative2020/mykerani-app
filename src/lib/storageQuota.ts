import { useState, useEffect, useCallback } from "react";
import { getStorageUsage } from "./documentStorage";
import { supabase, isSupabaseConfigured } from "./supabase";

// ── Constants ──────────────────────────────────────────────────────────────
export const GB = 1_073_741_824;
export const MB = 1_048_576;

export const PLAN_QUOTAS: Record<string, number> = {
  Starter:    5  * GB,
  Pro:        25 * GB,
  Enterprise: 100 * GB,
  default:    5  * GB,
};

export const FREEZE_PCT   = 0.95;
export const WARN_ORANGE  = 0.85;
export const WARN_YELLOW  = 0.70;

// ── Types ──────────────────────────────────────────────────────────────────
export interface StorageQuotaState {
  usedBytes: number;
  quotaBytes: number;
  isFrozen: boolean;
  frozenReason: "quota_exceeded" | "hq_manual" | "inactive" | "";
  lastActiveAt: string;
  inactiveDaysLimit: number;
  addOns: { bytes: number; addedAt: string }[];
}

export interface StorageQuotaHook extends StorageQuotaState {
  pctUsed: number;
  usedGB: number;
  quotaGB: number;
  canUpload: boolean;
  warnLevel: "none" | "yellow" | "orange" | "red" | "frozen";
  fileCount: number;
  isLoading: boolean;
  refresh: () => void;
  setQuota: (bytes: number) => void;
  applyAddon: (bytes: number) => void;
  freeze: (reason?: StorageQuotaState["frozenReason"]) => void;
  unfreeze: () => void;
  setInactiveDaysLimit: (days: number) => void;
  touchActive: () => void;
}

export interface HQTenantStorageView {
  tenantId: string;
  tenantName: string;
  usedBytes: number;
  quotaBytes: number;
  pctUsed: number;
  isFrozen: boolean;
  frozenReason: string;
  lastActiveAt: string;
  inactiveDays: number;
  isInactive: boolean;
}

// ── Storage key helper ─────────────────────────────────────────────────────
export function storageQuotaKey(tenantId: string): string {
  return `mykerani_storage_quota_${tenantId}`;
}

// ── Default state ──────────────────────────────────────────────────────────
function defaultState(quotaBytes = PLAN_QUOTAS.default): StorageQuotaState {
  return {
    usedBytes: 0,
    quotaBytes,
    isFrozen: false,
    frozenReason: "",
    lastActiveAt: new Date().toISOString(),
    inactiveDaysLimit: 30,
    addOns: [],
  };
}

function loadState(tenantId: string): StorageQuotaState {
  try {
    const raw = localStorage.getItem(storageQuotaKey(tenantId));
    if (raw) return { ...defaultState(), ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return defaultState();
}

// ── Helper: format bytes ───────────────────────────────────────────────────
export function fmtBytes(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

// ── Hook: useStorageQuota ──────────────────────────────────────────────────
// workspaceId = Supabase workspace UUID (for real data)
// tenantId    = fallback key for quota/freeze settings (localStorage)
export function useStorageQuota(tenantId: string, workspaceId?: string): StorageQuotaHook {
  const [state, setState] = useState<StorageQuotaState>(() => loadState(tenantId));
  const [usedBytes, setUsedBytes] = useState(0);
  const [fileCount, setFileCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const [realFrozen, setRealFrozen] = useState<{ isFrozen: boolean; frozenReason: string } | null>(null);

  // Real, HQ-enforced freeze state from Supabase — a freeze set by HQ must
  // actually block this tenant's uploads, not just live in HQ's own browser.
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase || !tenantId || !uuidRe.test(tenantId)) {
      setRealFrozen(null);
      return;
    }
    let cancelled = false;
    supabase.from("workspace_storage_state").select("is_frozen, frozen_reason").eq("tenant_id", tenantId).maybeSingle().then(({ data }) => {
      if (cancelled) return;
      setRealFrozen(data ? { isFrozen: data.is_frozen, frozenReason: data.frozen_reason || "" } : { isFrozen: false, frozenReason: "" });
    });
    supabase.rpc("touch_tenant_active", { p_tenant_id: tenantId });
    return () => { cancelled = true; };
  }, [tenantId, tick]);

  // Persist quota settings (not usage — usage comes from Supabase)
  useEffect(() => {
    if (!tenantId) return;
    localStorage.setItem(storageQuotaKey(tenantId), JSON.stringify(state));
  }, [state, tenantId]);

  useEffect(() => {
    if (tenantId) setState(loadState(tenantId));
  }, [tenantId]);

  // Fetch real usage from Supabase
  useEffect(() => {
    if (!workspaceId) {
      // Fallback: use localStorage usedBytes
      setUsedBytes(state.usedBytes);
      setFileCount(0);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    getStorageUsage(workspaceId).then(usage => {
      if (cancelled) return;
      setUsedBytes(usage.total_bytes);
      setFileCount(usage.file_count);
      setIsLoading(false);
      // Auto-update lastActiveAt if files exist
      if (usage.file_count > 0) {
        setState(prev => ({ ...prev, lastActiveAt: new Date().toISOString() }));
      }
      // Auto-freeze if over quota
      const pct = usage.total_bytes / state.quotaBytes;
      if (pct >= FREEZE_PCT && !state.isFrozen) {
        setState(prev => ({ ...prev, isFrozen: true, frozenReason: "quota_exceeded" }));
      }
    });
    return () => { cancelled = true; };
  }, [workspaceId, tick, state.quotaBytes]);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  const isFrozen  = realFrozen ? realFrozen.isFrozen : state.isFrozen;
  const frozenReason = (realFrozen ? realFrozen.frozenReason : state.frozenReason) as StorageQuotaState["frozenReason"];
  const pctUsed   = state.quotaBytes > 0 ? usedBytes / state.quotaBytes : 0;
  const usedGB    = usedBytes / GB;
  const quotaGB   = state.quotaBytes / GB;
  const canUpload = !isFrozen && pctUsed < FREEZE_PCT;

  const warnLevel: StorageQuotaHook["warnLevel"] =
    isFrozen      ? "frozen"
    : pctUsed >= FREEZE_PCT  ? "red"
    : pctUsed >= WARN_ORANGE ? "orange"
    : pctUsed >= WARN_YELLOW ? "yellow"
    : "none";

  const setQuota = useCallback((bytes: number) => {
    setState(prev => ({ ...prev, quotaBytes: bytes }));
  }, []);

  const applyAddon = useCallback((bytes: number) => {
    setState(prev => ({
      ...prev,
      quotaBytes: prev.quotaBytes + bytes,
      addOns: [...prev.addOns, { bytes, addedAt: new Date().toISOString() }],
    }));
  }, []);

  const freeze = useCallback((reason: StorageQuotaState["frozenReason"] = "hq_manual") => {
    setState(prev => ({ ...prev, isFrozen: true, frozenReason: reason }));
  }, []);

  const unfreeze = useCallback(() => {
    setState(prev => ({ ...prev, isFrozen: false, frozenReason: "" }));
  }, []);

  const setInactiveDaysLimit = useCallback((days: number) => {
    setState(prev => ({ ...prev, inactiveDaysLimit: days }));
  }, []);

  const touchActive = useCallback(() => {
    setState(prev => ({ ...prev, lastActiveAt: new Date().toISOString() }));
  }, []);

  return {
    ...state,
    usedBytes,
    isFrozen, frozenReason,
    pctUsed, usedGB, quotaGB, canUpload, warnLevel,
    fileCount, isLoading, refresh,
    setQuota, applyAddon, freeze, unfreeze, setInactiveDaysLimit, touchActive,
  };
}

// ── HQ helper: read all tenant storage snapshots ───────────────────────────
export function readHQTenantStorage(
  customers: { id: string; name: string; plan: string }[],
  inactiveDaysLimit: number = 30
): HQTenantStorageView[] {
  return customers.map(c => {
    const state = loadState(c.id);
    const used = state.usedBytes === 0
      ? Math.round((PLAN_QUOTAS[c.plan] || PLAN_QUOTAS.default) * (0.15 + Math.random() * 0.6))
      : state.usedBytes;
    const pctUsed = used / state.quotaBytes;
    const inactiveDays = daysSince(state.lastActiveAt);
    return {
      tenantId: c.id, tenantName: c.name,
      usedBytes: used, quotaBytes: state.quotaBytes,
      pctUsed, isFrozen: state.isFrozen, frozenReason: state.frozenReason,
      lastActiveAt: state.lastActiveAt, inactiveDays,
      isInactive: inactiveDays >= inactiveDaysLimit,
    };
  });
}
