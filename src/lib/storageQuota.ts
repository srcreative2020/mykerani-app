import { useState, useEffect, useCallback } from "react";

// ── Constants ──────────────────────────────────────────────────────────────
export const GB = 1_073_741_824;
export const MB = 1_048_576;

export const PLAN_QUOTAS: Record<string, number> = {
  Starter:    5  * GB,
  Pro:        25 * GB,
  Enterprise: 100 * GB,
  default:    5  * GB,
};

export const FREEZE_PCT   = 0.95;  // upload blocked
export const WARN_ORANGE  = 0.85;
export const WARN_YELLOW  = 0.70;

// ── Types ──────────────────────────────────────────────────────────────────
export interface StorageQuotaState {
  usedBytes: number;
  quotaBytes: number;
  isFrozen: boolean;
  frozenReason: "quota_exceeded" | "hq_manual" | "inactive" | "";
  lastActiveAt: string;
  inactiveDaysLimit: number;  // configurable by HQ
  addOns: { bytes: number; addedAt: string }[];
}

export interface StorageQuotaHook extends StorageQuotaState {
  pctUsed: number;
  usedGB: number;
  quotaGB: number;
  canUpload: boolean;
  warnLevel: "none" | "yellow" | "orange" | "red" | "frozen";
  addUsage: (bytes: number) => void;
  removeUsage: (bytes: number) => void;
  touchActive: () => void;
  setQuota: (bytes: number) => void;
  applyAddon: (bytes: number) => void;
  freeze: (reason?: StorageQuotaState["frozenReason"]) => void;
  unfreeze: () => void;
  setInactiveDaysLimit: (days: number) => void;
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
  isInactive: boolean;  // exceeds inactiveDaysLimit
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

// ── Helper: load from localStorage ────────────────────────────────────────
function loadState(tenantId: string): StorageQuotaState {
  try {
    const raw = localStorage.getItem(storageQuotaKey(tenantId));
    if (raw) return { ...defaultState(), ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return defaultState();
}

// ── Helper: format bytes human-readable ───────────────────────────────────
export function fmtBytes(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

// ── Helper: days since ISO timestamp ──────────────────────────────────────
export function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

// ── Hook: useStorageQuota ──────────────────────────────────────────────────
export function useStorageQuota(tenantId: string): StorageQuotaHook {
  const [state, setState] = useState<StorageQuotaState>(() => loadState(tenantId));

  // Persist on change
  useEffect(() => {
    if (!tenantId) return;
    localStorage.setItem(storageQuotaKey(tenantId), JSON.stringify(state));
  }, [state, tenantId]);

  // Reload if tenantId changes
  useEffect(() => {
    if (tenantId) setState(loadState(tenantId));
  }, [tenantId]);

  const pctUsed   = state.quotaBytes > 0 ? state.usedBytes / state.quotaBytes : 0;
  const usedGB    = state.usedBytes / GB;
  const quotaGB   = state.quotaBytes / GB;
  const canUpload = !state.isFrozen && pctUsed < FREEZE_PCT;

  const warnLevel: StorageQuotaHook["warnLevel"] =
    state.isFrozen      ? "frozen"
    : pctUsed >= FREEZE_PCT  ? "red"
    : pctUsed >= WARN_ORANGE ? "orange"
    : pctUsed >= WARN_YELLOW ? "yellow"
    : "none";

  const addUsage = useCallback((bytes: number) => {
    setState(prev => {
      const newUsed   = prev.usedBytes + bytes;
      const newPct    = newUsed / prev.quotaBytes;
      const willFreeze = newPct >= FREEZE_PCT;
      return {
        ...prev,
        usedBytes: newUsed,
        isFrozen: willFreeze || prev.isFrozen,
        frozenReason: willFreeze && !prev.isFrozen ? "quota_exceeded" : prev.frozenReason,
        lastActiveAt: new Date().toISOString(),
      };
    });
  }, []);

  const removeUsage = useCallback((bytes: number) => {
    setState(prev => {
      const newUsed = Math.max(0, prev.usedBytes - bytes);
      const newPct  = newUsed / prev.quotaBytes;
      // Auto-unfreeze if drops below 90% after delete
      const autoUnfreeze = prev.frozenReason === "quota_exceeded" && newPct < 0.90;
      return {
        ...prev,
        usedBytes: newUsed,
        isFrozen: autoUnfreeze ? false : prev.isFrozen,
        frozenReason: autoUnfreeze ? "" : prev.frozenReason,
      };
    });
  }, []);

  const touchActive = useCallback(() => {
    setState(prev => ({ ...prev, lastActiveAt: new Date().toISOString() }));
  }, []);

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

  return {
    ...state, pctUsed, usedGB, quotaGB, canUpload, warnLevel,
    addUsage, removeUsage, touchActive, setQuota, applyAddon,
    freeze, unfreeze, setInactiveDaysLimit,
  };
}

// ── HQ helper: read all tenant storage snapshots ───────────────────────────
export function readHQTenantStorage(
  customers: { id: string; name: string; plan: string }[],
  inactiveDaysLimit: number = 30
): HQTenantStorageView[] {
  return customers.map(c => {
    const state = loadState(c.id);
    // Seed realistic mock data if empty (demo purposes)
    const usedBytes = state.usedBytes === 0
      ? Math.round(PLAN_QUOTAS[c.plan] || PLAN_QUOTAS.default) * (0.15 + Math.random() * 0.6)
      : state.usedBytes;
    const pctUsed    = usedBytes / state.quotaBytes;
    const inactiveDays = daysSince(state.lastActiveAt);
    return {
      tenantId:       c.id,
      tenantName:     c.name,
      usedBytes,
      quotaBytes:     state.quotaBytes,
      pctUsed,
      isFrozen:       state.isFrozen,
      frozenReason:   state.frozenReason,
      lastActiveAt:   state.lastActiveAt,
      inactiveDays,
      isInactive:     inactiveDays >= inactiveDaysLimit,
    };
  });
}
