import React from "react";
import { useTenantIdentity } from "../context/TenantIdentityContext";

// ─── System Avatar Palette (8 options) ───────────────────────────────────────

export const SYSTEM_AVATARS = [
  { label: "Hijau", bg: "linear-gradient(135deg,#22c55e 0%,#16a34a 100%)", text: "#ffffff" },
  { label: "Indigo", bg: "linear-gradient(135deg,#6366f1 0%,#4f46e5 100%)", text: "#ffffff" },
  { label: "Biru", bg: "linear-gradient(135deg,#3b82f6 0%,#2563eb 100%)", text: "#ffffff" },
  { label: "Ungu", bg: "linear-gradient(135deg,#a855f7 0%,#7c3aed 100%)", text: "#ffffff" },
  { label: "Merah", bg: "linear-gradient(135deg,#f43f5e 0%,#e11d48 100%)", text: "#ffffff" },
  { label: "Oren", bg: "linear-gradient(135deg,#f97316 0%,#ea580c 100%)", text: "#ffffff" },
  { label: "Kuning", bg: "linear-gradient(135deg,#eab308 0%,#ca8a04 100%)", text: "#ffffff" },
  { label: "Slate", bg: "linear-gradient(135deg,#64748b 0%,#475569 100%)", text: "#ffffff" },
] as const;

// ─── Size map ─────────────────────────────────────────────────────────────────

const SIZE_MAP = {
  "2xs": { wrapper: "w-5 h-5", text: "text-2xs" },
  xs:   { wrapper: "w-6 h-6", text: "text-xs" },
  sm:   { wrapper: "w-7 h-7", text: "text-xs" },
  md:   { wrapper: "w-10 h-10", text: "text-sm" },
  lg:   { wrapper: "w-14 h-14", text: "text-xl" },
  xl:   { wrapper: "w-16 h-16", text: "text-2xl" },
} as const;

type AvatarSize = keyof typeof SIZE_MAP;

// ─── Props ───────────────────────────────────────────────────────────────────

interface TenantAvatarProps {
  /** Display size */
  size?: AvatarSize;
  /** Circle for person avatars, rounded square for logos */
  shape?: "circle" | "rounded";
  /** Fallback initial shown when no image */
  initial?: string;
  /** Extra className on the wrapper */
  className?: string;
  /** Whether to show a subtle ring */
  ring?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TenantAvatar({
  size = "md",
  shape = "circle",
  initial = "M",
  className = "",
  ring = false,
}: TenantAvatarProps) {
  const { displayUrl, primaryIdentity, systemAvatarIndex, logoUrl, avatarUrl, loading } = useTenantIdentity();

  const { wrapper, text } = SIZE_MAP[size];
  const radius = shape === "circle" ? "rounded-full" : "rounded-xl";
  const ringClass = ring ? "ring-2 ring-white ring-offset-1" : "";

  // Decide the image URL to show
  let imgUrl: string | null = null;
  if (primaryIdentity === "logo" && logoUrl) imgUrl = logoUrl;
  else if (primaryIdentity === "avatar" && avatarUrl) imgUrl = avatarUrl;
  else if (!primaryIdentity && (logoUrl || avatarUrl)) imgUrl = logoUrl ?? avatarUrl;

  // System avatar style
  const sysAvatar = SYSTEM_AVATARS[systemAvatarIndex] ?? SYSTEM_AVATARS[0];

  const base = `${wrapper} ${radius} ${ringClass} overflow-hidden shrink-0 flex items-center justify-center select-none ${className}`;

  if (loading) {
    return (
      <div className={`${base} bg-slate-100 animate-pulse`} />
    );
  }

  if (imgUrl) {
    return (
      <div className={base}>
        <img
          src={imgUrl}
          alt="Identiti Tenant"
          className="w-full h-full object-cover"
          draggable={false}
        />
      </div>
    );
  }

  // System avatar (gradient) or default MK
  if (primaryIdentity === "system") {
    return (
      <div
        className={base}
        style={{ background: sysAvatar.bg }}
      >
        <span className={`font-bold ${text}`} style={{ color: sysAvatar.text }}>
          {initial.charAt(0).toUpperCase()}
        </span>
      </div>
    );
  }

  // Default MYKERANI avatar — emerald gradient with initial
  return (
    <div
      className={base}
      style={{ background: "linear-gradient(135deg,#22c55e 0%,#16a34a 100%)" }}
    >
      <span className={`font-bold text-white ${text}`}>
        {initial.charAt(0).toUpperCase()}
      </span>
    </div>
  );
}
