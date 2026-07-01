import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";

// ─── Types ───────────────────────────────────────────────────────────────────

export type PrimaryIdentity = "logo" | "avatar" | "system" | null;

export interface TenantIdentityState {
  // stored paths in Supabase Storage
  logoPath: string | null;
  avatarPath: string | null;
  // resolved signed URLs (ephemeral, refreshed on load)
  logoUrl: string | null;
  avatarUrl: string | null;
  // which identity is primary
  primaryIdentity: PrimaryIdentity;
  // system avatar index (0-7)
  systemAvatarIndex: number;
  // the final resolved display URL (null → use system avatar / initial fallback)
  displayUrl: string | null;
  // loading / saving
  loading: boolean;
  saving: boolean;
  error: string | null;
}

export interface TenantIdentityActions {
  uploadImage: (file: File, type: "logo" | "avatar") => Promise<{ success: boolean; message: string }>;
  removeImage: (type: "logo" | "avatar") => Promise<void>;
  setPrimaryIdentity: (p: PrimaryIdentity) => Promise<void>;
  setSystemAvatarIndex: (i: number) => Promise<void>;
  clearError: () => void;
}

const DEFAULT_STATE: TenantIdentityState = {
  logoPath: null,
  avatarPath: null,
  logoUrl: null,
  avatarUrl: null,
  primaryIdentity: null,
  systemAvatarIndex: 0,
  displayUrl: null,
  loading: true,
  saving: false,
  error: null,
};

const TenantIdentityCtx = createContext<TenantIdentityState & TenantIdentityActions>({
  ...DEFAULT_STATE,
  uploadImage: async () => ({ success: false, message: "" }),
  removeImage: async () => {},
  setPrimaryIdentity: async () => {},
  setSystemAvatarIndex: async () => {},
  clearError: () => {},
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BUCKET = "evidence-packages";
const AVATAR_FOLDER = "avatars";
const SIGNED_URL_TTL = 604800; // 7 days

async function getSignedUrl(path: string): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

function resolveDisplayUrl(
  state: Pick<TenantIdentityState, "primaryIdentity" | "logoUrl" | "avatarUrl">
): string | null {
  if (state.primaryIdentity === "logo") return state.logoUrl;
  if (state.primaryIdentity === "avatar") return state.avatarUrl;
  return null;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function TenantIdentityProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<TenantIdentityState>(DEFAULT_STATE);
  const userIdRef = useRef<string | null>(null);

  // Load from auth.user_metadata
  const loadIdentity = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setState(s => ({ ...s, loading: false }));
      return;
    }
    userIdRef.current = user.id;
    const meta = user.user_metadata || {};
    const logoPath: string | null = meta.identityLogoPath ?? null;
    const avatarPath: string | null = meta.identityAvatarPath ?? null;
    const primaryIdentity: PrimaryIdentity = meta.identityPrimary ?? null;
    const systemAvatarIndex: number = meta.identitySystemIdx ?? 0;

    // Resolve signed URLs in parallel
    const [logoUrl, avatarUrl] = await Promise.all([
      logoPath ? getSignedUrl(logoPath) : Promise.resolve(null),
      avatarPath ? getSignedUrl(avatarPath) : Promise.resolve(null),
    ]);

    const displayUrl = resolveDisplayUrl({ primaryIdentity, logoUrl, avatarUrl });

    setState({
      logoPath,
      avatarPath,
      logoUrl,
      avatarUrl,
      primaryIdentity,
      systemAvatarIndex,
      displayUrl,
      loading: false,
      saving: false,
      error: null,
    });
  }, []);

  useEffect(() => {
    loadIdentity();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadIdentity();
      } else {
        setState({ ...DEFAULT_STATE, loading: false });
      }
    });
    return () => subscription.unsubscribe();
  }, [loadIdentity]);

  // Persist to auth.user_metadata
  const persistMeta = useCallback(async (patch: Record<string, unknown>) => {
    const { error } = await supabase.auth.updateUser({ data: patch });
    return error;
  }, []);

  const uploadImage = useCallback(async (file: File, type: "logo" | "avatar") => {
    const uid = userIdRef.current;
    if (!uid) return { success: false, message: "Sila log masuk semula." };

    const ALLOWED = ["image/png", "image/jpg", "image/jpeg", "image/webp"];
    if (!ALLOWED.includes(file.type)) {
      return { success: false, message: "Format tidak disokong. Gunakan PNG, JPG, JPEG atau WEBP." };
    }
    if (file.size > 5 * 1024 * 1024) {
      return { success: false, message: "Saiz fail melebihi 5MB." };
    }

    setState(s => ({ ...s, saving: true, error: null }));

    const ext = file.name.split(".").pop() ?? "jpg";
    const prefix = type === "logo" ? "logo" : "photo";
    const path = `${AVATAR_FOLDER}/${uid}/${prefix}_${Date.now()}.${ext}`;

    // Remove old file if exists
    const oldPath = type === "logo" ? state.logoPath : state.avatarPath;
    if (oldPath) {
      await supabase.storage.from(BUCKET).remove([oldPath]);
    }

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: false, contentType: file.type });

    if (upErr) {
      setState(s => ({ ...s, saving: false, error: upErr.message }));
      return { success: false, message: upErr.message };
    }

    const signedUrl = await getSignedUrl(path);
    const metaKey = type === "logo" ? "identityLogoPath" : "identityAvatarPath";
    const err = await persistMeta({ [metaKey]: path });
    if (err) {
      setState(s => ({ ...s, saving: false, error: err.message }));
      return { success: false, message: err.message };
    }

    setState(s => {
      const next = {
        ...s,
        saving: false,
        [type === "logo" ? "logoPath" : "avatarPath"]: path,
        [type === "logo" ? "logoUrl" : "avatarUrl"]: signedUrl,
      };
      next.displayUrl = resolveDisplayUrl({ primaryIdentity: next.primaryIdentity, logoUrl: next.logoUrl, avatarUrl: next.avatarUrl });
      return next;
    });

    return { success: true, message: `${type === "logo" ? "Logo" : "Gambar"} berjaya dimuat naik.` };
  }, [state.logoPath, state.avatarPath, persistMeta]);

  const removeImage = useCallback(async (type: "logo" | "avatar") => {
    const path = type === "logo" ? state.logoPath : state.avatarPath;
    if (path) {
      await supabase.storage.from(BUCKET).remove([path]);
    }
    const metaKey = type === "logo" ? "identityLogoPath" : "identityAvatarPath";
    await persistMeta({ [metaKey]: null });

    setState(s => {
      const next = {
        ...s,
        [type === "logo" ? "logoPath" : "avatarPath"]: null,
        [type === "logo" ? "logoUrl" : "avatarUrl"]: null,
      };
      // If primary was this type, clear primary
      if (next.primaryIdentity === type) {
        next.primaryIdentity = null;
        persistMeta({ identityPrimary: null });
      }
      next.displayUrl = resolveDisplayUrl({ primaryIdentity: next.primaryIdentity, logoUrl: next.logoUrl, avatarUrl: next.avatarUrl });
      return next;
    });
  }, [state.logoPath, state.avatarPath, persistMeta]);

  const setPrimaryIdentity = useCallback(async (p: PrimaryIdentity) => {
    await persistMeta({ identityPrimary: p });
    setState(s => {
      const next = { ...s, primaryIdentity: p };
      next.displayUrl = resolveDisplayUrl({ primaryIdentity: p, logoUrl: next.logoUrl, avatarUrl: next.avatarUrl });
      return next;
    });
  }, [persistMeta]);

  const setSystemAvatarIndex = useCallback(async (i: number) => {
    await persistMeta({ identitySystemIdx: i });
    setState(s => ({ ...s, systemAvatarIndex: i }));
  }, [persistMeta]);

  const clearError = useCallback(() => {
    setState(s => ({ ...s, error: null }));
  }, []);

  return (
    <TenantIdentityCtx.Provider value={{
      ...state,
      uploadImage,
      removeImage,
      setPrimaryIdentity,
      setSystemAvatarIndex,
      clearError,
    }}>
      {children}
    </TenantIdentityCtx.Provider>
  );
}

export function useTenantIdentity() {
  return useContext(TenantIdentityCtx);
}
