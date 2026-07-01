import React, { useRef, useState } from "react";
import { Upload, Trash2, CheckCircle2, Image, User, Sparkles, AlertCircle } from "lucide-react";
import { useTenantIdentity } from "../context/TenantIdentityContext";
import { TenantAvatar, SYSTEM_AVATARS } from "./TenantAvatar";
import type { PrimaryIdentity } from "../context/TenantIdentityContext";

interface Props {
  initial?: string;
}

export function TenantIdentitySection({ initial = "M" }: Props) {
  const {
    logoUrl, avatarUrl,
    primaryIdentity, systemAvatarIndex,
    saving, error,
    uploadImage, removeImage, setPrimaryIdentity, setSystemAvatarIndex,
    clearError,
  } = useTenantIdentity();

  const logoInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Local preview before upload
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<{ file: File; type: "logo" | "avatar" } | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  function handleFileSelect(file: File, type: "logo" | "avatar") {
    clearError();
    setSuccessMsg(null);
    const url = URL.createObjectURL(file);
    if (type === "logo") setLogoPreview(url);
    else setAvatarPreview(url);
    setPendingFile({ file, type });
  }

  async function handleSaveUpload() {
    if (!pendingFile) return;
    const res = await uploadImage(pendingFile.file, pendingFile.type);
    if (res.success) {
      setSuccessMsg(res.message);
      if (pendingFile.type === "logo") setLogoPreview(null);
      else setAvatarPreview(null);
      setPendingFile(null);
    }
  }

  function handleCancelPreview() {
    if (pendingFile?.type === "logo") setLogoPreview(null);
    else if (pendingFile?.type === "avatar") setAvatarPreview(null);
    setPendingFile(null);
  }

  const logoDisplay = logoPreview ?? logoUrl;
  const avatarDisplay = avatarPreview ?? avatarUrl;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Section header */}
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-800">Identiti Tenant</h3>
          <p className="text-2xs text-slate-400 mt-0.5">Pilih identiti utama yang dipaparkan di seluruh aplikasi</p>
        </div>
      </div>

      <div className="px-6 py-5 space-y-6">

        {/* Error / Success */}
        {error && (
          <div className="flex items-center gap-2 bg-rose-50 border border-rose-100 rounded-xl px-3.5 py-2.5">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <p className="text-xs text-rose-600">{error}</p>
          </div>
        )}
        {successMsg && !error && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3.5 py-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <p className="text-xs text-emerald-700">{successMsg}</p>
          </div>
        )}

        {/* Preview pending upload */}
        {pendingFile && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-center gap-4">
            <div className="shrink-0">
              {pendingFile.type === "logo" && logoPreview && (
                <div className="w-16 h-16 rounded-xl overflow-hidden border border-slate-200">
                  <img src={logoPreview} alt="Preview logo" className="w-full h-full object-cover" />
                </div>
              )}
              {pendingFile.type === "avatar" && avatarPreview && (
                <div className="w-16 h-16 rounded-full overflow-hidden border border-slate-200">
                  <img src={avatarPreview} alt="Preview gambar" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-700">Preview — {pendingFile.type === "logo" ? "Logo Perniagaan" : "Gambar Pemilik"}</p>
              <p className="text-2xs text-slate-400 mt-0.5 truncate">{pendingFile.file.name}</p>
              <p className="text-2xs text-slate-400">{(pendingFile.file.size / 1024).toFixed(0)} KB</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={handleSaveUpload}
                disabled={saving}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50 transition cursor-pointer"
              >
                {saving ? "Muat naik..." : "Simpan"}
              </button>
              <button
                onClick={handleCancelPreview}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                Batal
              </button>
            </div>
          </div>
        )}

        {/* ── Identity Type Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* LOGO */}
          <div className={`border rounded-2xl p-4 space-y-3 transition ${primaryIdentity === "logo" ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200 bg-white"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
                  <Image className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <span className="text-xs font-semibold text-slate-700">Logo Perniagaan</span>
              </div>
              {primaryIdentity === "logo" && (
                <span className="text-2xs bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Utama
                </span>
              )}
            </div>

            {/* Preview */}
            <div className="flex justify-center">
              {logoDisplay ? (
                <div className="w-20 h-20 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                  <img src={logoDisplay} alt="Logo" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center bg-slate-50">
                  <Image className="w-7 h-7 text-slate-300" />
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpg,image/jpeg,image/webp"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f, "logo"); e.target.value = ""; }}
              />
              <button
                onClick={() => logoInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-1.5 py-2 border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                {logoUrl ? "Tukar Logo" : "Muat Naik Logo"}
              </button>
              <div className="flex gap-2">
                {logoUrl && primaryIdentity !== "logo" && (
                  <button
                    onClick={() => setPrimaryIdentity("logo")}
                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    Jadikan Utama
                  </button>
                )}
                {logoUrl && (
                  <button
                    onClick={() => removeImage("logo")}
                    className="p-2 border border-rose-200 hover:bg-rose-50 text-rose-400 hover:text-rose-600 rounded-xl transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* AVATAR */}
          <div className={`border rounded-2xl p-4 space-y-3 transition ${primaryIdentity === "avatar" ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200 bg-white"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
                  <User className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <span className="text-xs font-semibold text-slate-700">Gambar Pemilik</span>
              </div>
              {primaryIdentity === "avatar" && (
                <span className="text-2xs bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Utama
                </span>
              )}
            </div>

            {/* Preview */}
            <div className="flex justify-center">
              {avatarDisplay ? (
                <div className="w-20 h-20 rounded-full overflow-hidden border border-slate-200 shadow-sm">
                  <img src={avatarDisplay} alt="Gambar" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-20 h-20 rounded-full border-2 border-dashed border-slate-200 flex items-center justify-center bg-slate-50">
                  <User className="w-7 h-7 text-slate-300" />
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpg,image/jpeg,image/webp"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f, "avatar"); e.target.value = ""; }}
              />
              <button
                onClick={() => avatarInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-1.5 py-2 border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                {avatarUrl ? "Tukar Gambar" : "Muat Naik Gambar"}
              </button>
              <div className="flex gap-2">
                {avatarUrl && primaryIdentity !== "avatar" && (
                  <button
                    onClick={() => setPrimaryIdentity("avatar")}
                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    Jadikan Utama
                  </button>
                )}
                {avatarUrl && (
                  <button
                    onClick={() => removeImage("avatar")}
                    className="p-2 border border-rose-200 hover:bg-rose-50 text-rose-400 hover:text-rose-600 rounded-xl transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── System Avatar Picker ── */}
        <div className={`border rounded-2xl p-4 space-y-3 transition ${primaryIdentity === "system" ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200 bg-white"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-slate-500" />
              </div>
              <span className="text-xs font-semibold text-slate-700">Avatar Sistem</span>
            </div>
            {primaryIdentity === "system" && (
              <span className="text-2xs bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Utama
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            {SYSTEM_AVATARS.map((sa, i) => (
              <button
                key={i}
                onClick={async () => { await setSystemAvatarIndex(i); await setPrimaryIdentity("system"); }}
                title={sa.label}
                className={`w-10 h-10 rounded-full transition cursor-pointer outline-none ${systemAvatarIndex === i && primaryIdentity === "system" ? "ring-2 ring-emerald-500 ring-offset-2 scale-110" : "hover:scale-105 opacity-80 hover:opacity-100"}`}
                style={{ background: sa.bg }}
              >
                <span className="text-sm font-bold text-white">
                  {initial.charAt(0).toUpperCase()}
                </span>
              </button>
            ))}
          </div>
          {primaryIdentity !== "system" && (
            <button
              onClick={() => setPrimaryIdentity("system")}
              className="w-full py-2 border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              Guna Avatar Sistem
            </button>
          )}
        </div>

        {/* ── Current Identity Preview ── */}
        <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
          <TenantAvatar size="lg" shape={primaryIdentity === "logo" ? "rounded" : "circle"} initial={initial} />
          <div>
            <p className="text-xs font-bold text-slate-700">Identiti Semasa</p>
            <p className="text-2xs text-slate-400 mt-0.5">
              {primaryIdentity === "logo" && "Logo Perniagaan"}
              {primaryIdentity === "avatar" && "Gambar Pemilik"}
              {primaryIdentity === "system" && `Avatar Sistem — ${SYSTEM_AVATARS[systemAvatarIndex]?.label}`}
              {!primaryIdentity && "Default MYKERANI Avatar"}
            </p>
            <p className="text-2xs text-slate-400">Ini dipaparkan di seluruh aplikasi.</p>
          </div>
        </div>

        <p className="text-2xs text-slate-400 text-center">Format: PNG, JPG, JPEG, WEBP · Saiz maksimum: 5MB</p>
      </div>
    </div>
  );
}
