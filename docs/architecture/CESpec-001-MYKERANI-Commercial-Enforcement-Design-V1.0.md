# CESpec-001 — MYKERANI Commercial Enforcement Design Specification V1.0

**Status:** DRAFT — Pending Approval Before Implementation  
**Rujukan:** ADR-001, Phase 1 Audit, Phase 2 CTL, Phase 2.5 UX Refinement, Phase 3 Enforcement Audit  
**Tarikh:** 2026-07-02  
**Prinsip:** Enforcement melindungi margin, bukan menghalang pelanggan.

---

## Prinsip Asas

Setiap enforcement mesti lulus ujian ini:

1. **Pelanggan memahami apa berlaku** — tiada mesej teknikal
2. **Pelanggan tahu apa perlu dilakukan** — CTA jelas ke upgrade/support
3. **HQ dilindungi daripada kos tidak berbayar** — server-side check adalah penentu
4. **Sistem tidak menghukum kegagalan teknikal** — error recovery yang adil
5. **Audit trail lengkap** — setiap enforcement dicatat

---

## ENFORCEMENT 1 — AI Financial Assistant Limit

### 1. Nama
**AI Financial Assistant — Fair Usage Enforcement**

### 2. Objektif
| Aspek | Butiran |
|---|---|
| Kenapa wujud | Setiap pertanyaan AI mengenakan kos API kepada HQ (model inference) |
| Risiko tiada enforcement | HQ menanggung kos AI provider tanpa bayaran balik |
| Kos HQ | ~$0.002–0.01 per pertanyaan bergantung panjang konteks |
| Impak pelanggan | Tanpa had, pelanggan mungkin tidak sedar nilai yang digunakan |

### 3. Bila Enforcement Berlaku

| Peringkat | Masa | Lokasi Semasa | Status |
|---|---|---|---|
| Client pre-check | Sebelum hantar ke server | StaffHomeScreen.tsx:581 | ✅ Ada (Staff sahaja) |
| Server pre-check | Sebelum panggil AI provider | server.ts | ❌ TIADA |
| Server post-check | Selepas AI provider menjawab | server.ts:1970 | ✅ Ada (salah tempat) |
| Warning display | Bila baki < 20% | UI | ❌ Tiada proaktif |

**Isu utama:** Check berlaku SELEPAS kos AI provider terkumpul. Setiap pertanyaan oleh tenant yang habis kuota masih mengenakan kos kepada HQ.

### 4. Situasi & Apa Yang Dilihat Pengguna

| Situasi | UX Yang Dicadangkan |
|---|---|
| Baki > 20% | Tiada gangguan |
| Baki tinggal 20% | 🔔 Notification bar kuning (non-blocking) |
| Baki tinggal 10% | 🔔 Notification bar oren, lebih urgent |
| Baki tinggal 5% | 🟠 Banner merah dalam chat (persistent) |
| Baki = 0 (exhausted) | 🔴 Chat diblock, modal CTA upgrade |
| AI provider gagal/timeout | ⚠️ Mesej teknikal-neutral, kuota tidak ditolak |
| Temporary AI abuse | Server-side rate limit (bukan UX change) |

### 5. Apa Yang Berlaku Di Belakang

**Flow yang dicadangkan:**
```
sendChat() dipanggil
  → Client check: aiCredits.used >= aiCredits.total ?
      YA → papar modal "Had AI Financial Assistant dicapai" (tiada server call)
      TIDAK → lanjut ke server
  
  → Server: /api/ai/assistant
      → verifyTenantAccess() ✅
      → isUserSuspended() [perlu tambah]
      → consumeResourceCreditV2("AI") [PINDAH KE SINI — sebelum AI call]
          → ok=false → return 402 (tiada kos AI berlaku)
          → ok=true → panggil AI provider
      → Return response
```

### 6. Semua Pilihan UX

**Option A — Silent Block**
- Bila kuota habis: chat button disabled, tiada penjelasan
- Pengguna keliru kenapa chat tidak berfungsi

**Option B — Error Toast (reactive)**
- Hantar ke server → terima 402 → papar toast "Kuota dicapai"
- Pengguna perlu cuba dahulu untuk tahu

**Option C — Proactive Banner + Graceful Block** *(Dicadangkan)*
- Warning banner muncul pada 20%, 10%, 5%
- Bila 0%: chat input disabled dengan mesej inline + butang "Lihat Pakej"
- Pengguna tahu awal, tidak terkejut

**Option D — Degraded Mode**
- Bila kuota habis: AI masih menjawab tapi dengan model lebih rendah/simple
- Kompleks secara teknikal, tidak konsisten dengan ADR-001

### 7. Analisis Pilihan

| Kriteria | A | B | C | D |
|---|---|---|---|---|
| UX | 2/10 | 5/10 | **9/10** | 6/10 |
| Revenue Protection | 4/10 | 6/10 | **9/10** | 3/10 |
| Customer Satisfaction | 2/10 | 5/10 | **9/10** | 7/10 |
| Dev Complexity | 9/10 | 7/10 | **7/10** | 2/10 |
| Support Impact | 2/10 | 5/10 | **9/10** | 5/10 |
| ADR Compliance | 7/10 | 7/10 | **10/10** | 4/10 |

### 8. Cadangan Terbaik

**Saya mencadangkan Option C.**

Justifikasi:
- Melindungi HQ daripada kos tidak berbayar (server pre-check)
- Pengguna mendapat amaran awal — boleh buat keputusan upgrade sebelum terganggu
- Konsisten antara Owner dan Staff (tambah check ke OwnerDashboard)
- Mesej dalam bahasa pemilik bisnes (tiada "AI credits" / "token")

**Mesej UI:**
- 20%: *"AI Financial Assistant anda hampir mencapai had penggunaan bulan ini."*
- 0%: *"Kuota AI Financial Assistant pelan anda telah digunakan sepenuhnya. Naik taraf pelan untuk meneruskan."*

### 9. Impak Kepada Sistem

| Komponen | Perubahan |
|---|---|
| `server.ts` | Pindah `consumeResourceCreditV2("AI")` ke SEBELUM AI provider call. Tambah `isUserSuspended()` check. |
| `OwnerDashboard.tsx` | Tambah client-side check dalam `sendChat()` (selaraskan dengan StaffHomeScreen) |
| `notifications.ts` | Sudah ada threshold warning — perlu pastikan ia dipanggil |
| DB/Migration | Tiada perubahan |

**Keutamaan: 🔴 CRITICAL**

---

## ENFORCEMENT 2 — Resit / Invois Limit

### 1. Nama
**Resit / Invois — Upload Quota Enforcement**

### 2. Objektif
| Aspek | Butiran |
|---|---|
| Kenapa wujud | Setiap upload resit mengenakan kos OCR (vision AI) kepada HQ |
| Risiko tiada enforcement | Tenant boleh upload ribuan resit tanpa bayar |
| Kos HQ | ~$0.003–0.01 per fail bergantung saiz |
| Duplikat | Kos berganda tanpa nilai tambah |

### 3. Bila Enforcement Berlaku

| Peringkat | Masa | Status |
|---|---|---|
| Sebelum OCR | server.ts:954 semak kredit | ✅ Ada |
| Sebelum upload | Client-side storage check | ⚠️ Hanya storage, bukan OCR kuota |
| Duplikat check | Sebelum upload | ❌ Tiada |
| Rollback jika gagal | Selepas OCR gagal | ❌ Tiada |

### 4. Situasi & Apa Yang Dilihat Pengguna

| Situasi | UX Yang Dicadangkan |
|---|---|
| Upload biasa (kuota ada) | Proses normal, progress indicator |
| Upload ke-N (tinggal 10 resit) | 🔔 Warning banner dalam Documents tab |
| Upload ke-N+1 (kuota habis) | 🔴 Modal: "Kuota Resit / Invois dicapai" + CTA |
| OCR gagal (selepas deduct) | ⚠️ Mesej neutral + tawaran cuba lagi atau hubungi support |
| Upload fail duplikat | 🟡 Toast: "Dokumen serupa sudah ada. Teruskan?" |
| Batch upload (200 resit) | Progress per-fail, stop bila kuota habis, laporan hasil |

### 5. Apa Yang Berlaku Di Belakang

```
Upload fail dipilih
  → Client: semak storageQuota.canUpload
      NO → papar banner storage frozen
      YES → lanjut
  → Client: [perlu tambah] semak ocrCredits.remaining > 0
      NO → papar modal kuota habis
      YES → lanjut
  
  → Server: /api/ocr/analyze
      → verifyTenantAccess()
      → isUserSuspended()
      → consumeResourceCreditV2("OCR") — 1 kredit per fail
          ok=false → 402, pengguna nampak modal upgrade
          ok=true → panggil OCR/AI provider
      → Jika OCR gagal: [ideal] rollback kredit via reverse transaction
      → Return result
```

**Duplikat check (dicadangkan):** Hash fail (MD5/SHA256) di client sebelum upload, bandingkan dengan `financial_evidence_packages` table. Jika sama, tanya pengguna.

### 6. Semua Pilihan UX (Bila Kuota Habis)

**Option A — Hard Block (tiada peringatan)**
- Upload button disabled serta-merta bila kuota = 0
- Pengguna tidak tahu apa berlaku

**Option B — Modal Upgrade Serta-merta**
- Upload button berfungsi → server balas 402 → modal muncul
- Pengguna kena cuba dahulu

**Option C — Proactive Warning + Soft Block** *(Dicadangkan)*
- Banner muncul apabila < 20 resit berbaki
- Bila 0: upload button disabled + inline mesej + CTA upgrade
- Pengguna ambil tindakan sebelum tersekat

**Option D — Grace Period**
- Benarkan 5 resit tambahan selepas kuota habis (buffer)
- Risiko: HQ menanggung kos buffer tanpa jaminan bayaran

### 7. Analisis Pilihan

| Kriteria | A | B | C | D |
|---|---|---|---|---|
| UX | 2/10 | 5/10 | **9/10** | 7/10 |
| Revenue Protection | 8/10 | 7/10 | **9/10** | 3/10 |
| Customer Satisfaction | 2/10 | 5/10 | **9/10** | 8/10 |
| Dev Complexity | 8/10 | 7/10 | **6/10** | 4/10 |
| Support Impact | 2/10 | 5/10 | **9/10** | 4/10 |
| ADR Compliance | 9/10 | 9/10 | **10/10** | 5/10 |

### 8. Cadangan Terbaik

**Saya mencadangkan Option C** dengan tambahan:
1. Duplikat detection (hash-based, client-side, non-blocking)
2. Rollback kredit jika OCR gagal dalam masa 30 saat (reverse txn)
3. Batch upload stop gracefully bila kuota habis (bukan crash)

**Mesej UI:**
- < 20 berbaki: *"Anda mempunyai {N} Resit / Invois berbaki dalam pelan semasa."*
- = 0: *"Kuota Resit / Invois pelan anda telah digunakan sepenuhnya. Naik taraf pelan atau tambah kuota."*

### 9. Impak Kepada Sistem

| Komponen | Perubahan |
|---|---|
| `FinancialEvidencePackage.tsx` | Tambah client-side OCR quota check sebelum `processFile()` |
| `FinancialEvidencePackage.tsx` | Tambah duplikat hash check (optional tanya user) |
| `server.ts` | Tambah kredit rollback jika OCR gagal |
| DB/Migration | Tiada (guna `consume_resource_credit_v2` yang sedia ada) |

**Keutamaan: 🔴 CRITICAL**

---

## ENFORCEMENT 3 — Muka Surat Penyata Bank

### 1. Nama
**Bank Statement Import — Per-Page Quota Enforcement**

### 2. Objektif
| Aspek | Butiran |
|---|---|
| Kenapa wujud | Penyata bank PDF dengan banyak halaman = lebih banyak kos AI inference |
| ADR-001 menetapkan | 1 muka surat = 1 kuota |
| Masalah semasa | 1 kredit OCR untuk seluruh PDF tanpa mengira bilangan halaman |
| Risiko | PDF 50 halaman kos sama dengan PDF 1 halaman — kebocoran hasil |

### 3. Bila Enforcement Berlaku

| Peringkat | Masa | Status |
|---|---|---|
| PDF terima | server.ts:1572 — `pdfPageCount` dikira | ✅ Ada (log sahaja) |
| Kuota deduct | server.ts:1603 — 1 kredit sahaja | ❌ Bukan per halaman |
| Preview sebelum import | UI tunjuk bilangan halaman | ✅ Ada (UI display) |
| Block jika kuota < jumlah halaman | Sebelum import | ❌ Tiada |

### 4. Situasi & Apa Yang Dilihat Pengguna

| Situasi | UX Yang Dicadangkan |
|---|---|
| PDF 2 muka surat, kuota cukup | Tunjuk preview "2 Muka Surat akan diproses" → proceed |
| PDF 30 muka surat, kuota = 20 | Preview: "30 muka surat diperlukan, 20 berbaki" → block + CTA |
| PDF 300 muka surat | Warn terlebih dahulu, minta konfirmasi |
| PDF encrypted | Error: "PDF ini dilindungi kata laluan. Sila nyahsulit dahulu." |
| PDF rosak | Error: "PDF tidak dapat dibaca. Sila muat naik semula." |
| PDF duplikat | Toast: "Penyata serupa pernah dimport. Teruskan?" |
| PDF terlalu besar (>50MB) | Error: "Saiz fail terlalu besar. Had semasa: 50MB." |
| Kuota tepat cukup (baki = halaman) | Proceed dengan amaran: "Ini akan menggunakan semua kuota berbaki" |

### 5. Apa Yang Berlaku Di Belakang

**Flow yang dicadangkan:**
```
User pilih PDF
  → Client: hantar ke server untuk preview (atau baca client-side)
  → Server: extract pdfPageCount
  → Server: semak ocrCredits.remaining >= pdfPageCount
      TIDAK → return { error: "INSUFFICIENT_QUOTA", needed: N, available: M }
              → Client papar modal breakdown
      YA → semak active import conflict
      → consumeResourceCreditV2("OCR", amount=pdfPageCount)  ← N kredit
      → Mulakan background import
      → Return { jobId, totalPages: pdfPageCount }
```

**Nota penting:** `pdfPageCount` sudah dikira di server (baris 1584). Hanya perlu tukar `consume_resource_credit_v2` untuk menerima `p_amount = pdfPageCount` bukan default 1.

### 6. Semua Pilihan UX

**Option A — Block Terus (tanpa preview)**
- Hantar PDF → server balas 402 dengan `needed/available`
- UI papar "kuota tidak cukup" secara tiba-tiba
- Pengguna terkejut dan keliru

**Option B — Preview Dulu, Konfirm Kemudian** *(Dicadangkan)*
- Sebelum import bermula: tunjuk pratonton "PDF ini ada X muka surat. Kuota anda: Y muka surat."
- Pengguna membuat keputusan termaklum
- Butang "Import" diaktifkan hanya jika kuota cukup

**Option C — Import Separa**
- Import sehingga kuota habis, berhenti di tengah
- Pengguna dapat sebahagian hasil — keliru dan tidak berguna
- Risiko data tidak lengkap

**Option D — Estimate Sahaja (tanpa enforce)**
- Tunjuk anggaran kos tapi benarkan terus
- Kebocoran hasil berterusan

### 7. Analisis Pilihan

| Kriteria | A | B | C | D |
|---|---|---|---|---|
| UX | 3/10 | **9/10** | 2/10 | 5/10 |
| Revenue Protection | 7/10 | **9/10** | 5/10 | 1/10 |
| Customer Satisfaction | 3/10 | **10/10** | 3/10 | 7/10 |
| Dev Complexity | 7/10 | **6/10** | 3/10 | 9/10 |
| Support Impact | 3/10 | **9/10** | 2/10 | 3/10 |
| ADR Compliance | 9/10 | **10/10** | 3/10 | 1/10 |

### 8. Cadangan Terbaik

**Saya mencadangkan Option B.**

Justifikasi:
- ADR-001 jelas: 1 muka surat = 1 kuota
- Preview sebelum import memberi kuasa kepada pengguna
- Tidak mengejutkan — pengguna tahu kos sebelum komit
- `pdfPageCount` sudah dikira di server — hanya perlu wire ke UI

**Mesej UI (Preview Modal):**
```
📄 Penyata Bank: cimb_march_2026.pdf

   Bilangan muka surat: 30
   Kuota berbaki: 45 Muka Surat Penyata Bank

   Import ini akan menggunakan 30 kuota.
   Baki selepas import: 15 Muka Surat Penyata Bank.

   [Batalkan]  [Import Sekarang]
```

**Jika kuota tidak cukup:**
```
📄 cimb_march_2026.pdf

   Bilangan muka surat: 30
   Kuota berbaki: 15 Muka Surat Penyata Bank

   ⚠️ Kuota tidak mencukupi (perlukan 30, ada 15).
   Sila tambah kuota atau naik taraf pelan.

   [Batalkan]  [Lihat Pakej]
```

### 9. Impak Kepada Sistem

| Komponen | Perubahan |
|---|---|
| `server.ts:1603` | Tukar `consumeResourceCreditV2("OCR", 1)` → `consumeResourceCreditV2("OCR", pdfPageCount)` |
| `server.ts` | Tambah pre-check: semak remaining >= pdfPageCount sebelum deduct |
| `OCREngineConsole.tsx` / Bank Statement UI | Tambah preview step dengan breakdown kuota |
| `consume_resource_credit_v2` RPC | Sudah menerima `p_amount` — tiada perubahan migration diperlukan |

**Keutamaan: 🔴 CRITICAL (ADR-001 compliance)**

---

## ENFORCEMENT 4 — Kapasiti Storan

### 1. Nama
**Storage Capacity — Upload Block Enforcement**

### 2. Objektif
| Aspek | Butiran |
|---|---|
| Kenapa wujud | Supabase Storage mengenakan kos berdasarkan saiz storan |
| Risiko tiada enforcement | Tenant melepasi had storan tanpa bayar tambahan |
| Masalah semasa | `FinancialEvidencePackage.processFile()` tidak semak `canUpload` |
| Gap | Banner "Storan Dibekukan" ada, tapi upload masih berjalan |

### 3. Bila Enforcement Berlaku

| Peringkat | Masa | Threshold | Status |
|---|---|---|---|
| Yellow warning | pctUsed >= 70% | Display warning | ✅ storageQuota.warnLevel |
| Orange warning | pctUsed >= 85% | Display banner | ✅ storageQuota.warnLevel |
| Red/freeze zone | pctUsed >= 95% | `canUpload = false` | ✅ storageQuota (client) |
| Actual upload block | Sebelum processFile() | canUpload check | ❌ TIADA dalam FinancialEvidencePackage |
| HQ manual freeze | HQ action | `is_frozen = true` | ✅ set_tenant_frozen RPC |
| Server-side block | Sebelum Storage write | Tiada route | ❌ Upload terus ke Supabase |

### 4. Situasi & Apa Yang Dilihat Pengguna

| Situasi | UX Yang Dicadangkan |
|---|---|
| Storan < 70% | Normal, tiada gangguan |
| 70–84% | 🟡 Banner kuning kecil "Storan 70% penuh" |
| 85–94% | 🟠 Banner oren lebih ketara + "Lihat Pakej" |
| ≥ 95% (auto-freeze) | 🔴 Upload button disabled, mesej jelas |
| 100% penuh | 🔴 Semua upload blocked, modal upgrade |
| HQ freeze manual | 🔴 Banner "Akaun disekat" + hubungi support |
| Selepas tambah storan | ✅ Banner hilang, upload dibenarkan semula |
| BYOS (bring own storage) | Storan pelanggan — tiada enforcement dari HQ |

### 5. Apa Yang Berlaku Di Belakang

```
processFile(file) dipanggil
  → Semak storageQuota.canUpload
      FALSE (frozen atau ≥95%) → tunjuk modal frozen/upgrade
      TRUE → semak saiz fail vs ruang berbaki
        Fail lebih besar dari ruang berbaki → warn, minta konfirm
        OK → upload ke Supabase Storage
        → update storage usage count
```

**Nota:** Tiada server-side route untuk upload (terus ke Supabase Storage via client SDK). Storage RLS boleh dikonfigurasi untuk enforce di bucket level tapi akan perlukan migration Supabase.

### 6. Semua Pilihan UX

**Option A — Client-only enforcement (add missing check)**
- Tambah `if (!storageQuota.canUpload) return` dalam `processFile()`
- Mudah, tidak perlukan server changes
- Boleh dipintas oleh pengguna teknikal

**Option B — Client + Supabase RLS enforcement** *(Dicadangkan)*
- Client check (Option A) + RLS policy pada bucket `evidence-packages`
- RLS semak `workspace_storage_state.is_frozen` sebelum benarkan write
- Defense-in-depth: dua lapisan enforcement

**Option C — Server-side upload proxy**
- Semua upload melalui `/api/upload` route yang semak storage dulu
- Paling selamat tapi paling kompleks
- Perlu handle multipart, streaming, progress

### 7. Analisis Pilihan

| Kriteria | A | B | C |
|---|---|---|---|
| UX | 7/10 | **8/10** | 7/10 |
| Revenue Protection | 5/10 | **9/10** | **10/10** |
| Customer Satisfaction | 7/10 | **8/10** | 7/10 |
| Dev Complexity | **9/10** | 7/10 | 3/10 |
| Support Impact | 7/10 | **9/10** | 9/10 |
| ADR Compliance | 8/10 | **9/10** | 9/10 |

### 8. Cadangan Terbaik

**Saya mencadangkan Option B (dua fasa):**
- **Fasa 4a (segera):** Tambah client check dalam `processFile()` — 5 minit kerja
- **Fasa 4b (kemudian):** Tambah Supabase Storage RLS policy — migration kecil

Justifikasi: Option A sahaja adalah terlalu lemah (boleh dipintas). Option C terlalu kompleks tanpa faedah tambahan yang ketara dalam konteks MYKERANI (pelanggan SME bukan hacker).

**Mesej UI:**
- Frozen: *"Kapasiti Storan anda telah mencapai had. Sila tambah storan untuk muat naik dokumen baru."*
- 95%: *"Storan hampir penuh. Anda mempunyai kurang 5% ruang berbaki."*

### 9. Impak Kepada Sistem

| Komponen | Perubahan |
|---|---|
| `FinancialEvidencePackage.tsx` | Tambah `if (!storageQuota.canUpload)` check dalam `processFile()` |
| `storageQuota.ts` | Sudah ada `canUpload`, `isFrozen`, `warnLevel` — tiada perubahan |
| Supabase Migration (fasa 4b) | RLS policy pada bucket `evidence-packages` |

**Keutamaan: 🔴 CRITICAL (gap keselamatan)**

---

## ENFORCEMENT 5 — Bilangan Pengguna

### 1. Nama
**Staff User Limit — Create/Invite Enforcement**

### 2. Objektif
| Aspek | Butiran |
|---|---|
| Kenapa wujud | Setiap pengguna tambahan meningkatkan kos platform (support, resources) |
| ADR-001 | "Pengguna: bilangan bulat" — plan menentukan had |
| Masalah semasa | `/api/admin/create-staff` tiada semakan `maxUsers` |
| Impak | Tenant boleh invite staff tanpa had |

### 3. Bila Enforcement Berlaku

| Situasi | Bila Semak |
|---|---|
| Invite staff baru | Sebelum invite dihantar |
| Staff pending (belum accept) | Dikira dalam had atau tidak? |
| Staff suspended | Dikira dalam had atau tidak? |
| Owner padam staff | Had berkurang serta-merta |
| HQ override | Boleh naikkan had sementara |
| Upgrade plan | Had naik serta-merta |

### 4. Situasi & Apa Yang Dilihat Pengguna

| Situasi | UX Yang Dicadangkan |
|---|---|
| Had belum penuh (3/5 staff) | Indicator "3/5 pengguna" dalam Pasukan page |
| Had hampir penuh (4/5 staff) | 🟡 Info: "1 slot pengguna berbaki" |
| Had penuh (5/5 staff) | 🔴 "Invite Staf" button disabled + tooltip |
| Invite hantar → had penuh (race condition) | Server balas 402, UI papar mesej |
| Staff pending (belum aktif) | Dikira sebagai 1 slot (prevent gaming) |
| Staff suspended | **Tidak dikira** — slot dilepaskan semula |
| HQ override | Butang aktif semula, badge "Override Aktif" |

**Definisi had yang dicadangkan:**
- Staff **aktif** + staff **pending** = dikira dalam had
- Staff **suspended/deleted** = tidak dikira
- Owner sendiri = tidak dikira (sentiasa 1 slot)

### 5. Apa Yang Berlaku Di Belakang

```
Owner klik "Jemput Staf"
  → UI: query active_staff_count dari user_role_assignments
  → UI: compare vs plan.maxUsers
      count >= maxUsers → disable button, papar mesej
      count < maxUsers → benarkan form

  → Server: /api/admin/create-staff
      → resolveCallerIdentity() ✅
      → [perlu tambah] query count active+pending staff in tenant
      → [perlu tambah] get plan.maxUsers dari tenant_subscriptions → subscription_plans
      → count >= maxUsers → return 403, "Had pengguna dicapai"
      → Proceed dengan invite
```

### 6. Semua Pilihan UX

**Option A — Hard stop (invite button disabled)**
- Bila had penuh: butang disabled, tooltip "Had pengguna dicapai"
- Pengguna perlu upgrade untuk unlock

**Option B — Soft warning + confirm** *(Dicadangkan)*
- Bila 1 slot berbaki: info banner
- Bila 0 slot: butang disabled + modal dengan pilihan upgrade
- Server juga enforce (tidak bergantung client sahaja)

**Option C — Waitlist mode**
- Terima invite tapi status "pending approval" sehingga upgrade
- Kompleks, boleh keliru

### 7. Analisis Pilihan

| Kriteria | A | B | C |
|---|---|---|---|
| UX | 5/10 | **9/10** | 4/10 |
| Revenue Protection | **9/10** | **9/10** | 5/10 |
| Customer Satisfaction | 5/10 | **9/10** | 5/10 |
| Dev Complexity | **8/10** | 7/10 | 3/10 |
| Support Impact | 5/10 | **9/10** | 4/10 |
| ADR Compliance | 9/10 | **10/10** | 6/10 |

### 8. Cadangan Terbaik

**Saya mencadangkan Option B.**

**Mesej UI:**
- 1 slot berbaki: *"Anda mempunyai 1 slot pengguna berbaki dalam pelan semasa."*
- 0 slot: *"Had pengguna pelan semasa dicapai. Naik taraf pelan untuk jemput lebih ramai staf."*

### 9. Impak Kepada Sistem

| Komponen | Perubahan |
|---|---|
| `server.ts:545` | Tambah query count staff + semak `plan.maxUsers` sebelum invite |
| `OwnerDashboard.tsx` (Pasukan tab) | Papar "X/Y pengguna" indicator, disable invite jika penuh |
| DB | Tiada migration — query `user_role_assignments` yang sedia ada |

**Keutamaan: 🟠 HIGH**

---

## ENFORCEMENT 6 — Trial Period

### 1. Nama
**Trial Period — Expiry & Grace Enforcement**

### 2. Objektif
| Aspek | Butiran |
|---|---|
| Kenapa wujud | Trial ada kos (AI/OCR credits seeded, storan, support) |
| Masalah semasa | Tiada enforcement bila trial tamat — tenant terus guna selagi kredit ada |
| Risiko | Unlimited trial de facto jika tidak enforce |

### 3. Situasi & Apa Yang Dilihat Pengguna

| Situasi | Hari | UX Yang Dicadangkan |
|---|---|---|
| Trial aktif | T-7 | 🔔 Banner: "7 hari berbaki dalam tempoh percubaan" |
| Trial hampir tamat | T-3 | 🟠 Banner oren lebih urgent + CTA langgan |
| Trial hari terakhir | T-1 | 🔴 Banner merah + countdown |
| Trial tamat, tiada bayar | T+0 | 🔴 Mode terhad: boleh view, tidak boleh tambah |
| Trial tamat + kupon | T+0 | Tebus kupon → extend trial |
| Trial tamat + HQ extend | T+0 | HQ top up atau extend → normal semula |
| Trial tamat + promotion aktif | T+0 | Auto-apply jika promotion type = trial_extension |
| Trial tamat → bayar | T+0 | Serta-merta unlock semua fungsi |

**Mode "Trial Tamat" yang dicadangkan:**
```
✅ Boleh login
✅ Boleh view semua data sedia ada
✅ Boleh export (CSV/Excel/PDF) — pengguna berhak export data mereka
✅ Boleh buka ticket support
✅ Boleh bayar / upgrade
❌ Tidak boleh upload dokumen baru
❌ Tidak boleh guna AI Financial Assistant
❌ Tidak boleh import penyata bank baru
❌ Tidak boleh jemput staf baru
```

### 4. Apa Yang Berlaku Di Belakang

```
Server middleware (setiap request):
  → Semak tenant_subscriptions WHERE tenant_id = X
      ORDER BY current_period_end DESC LIMIT 1
  → Jika status = 'trial' AND current_period_end < now():
      → Set effective_status = 'trial_expired'
      → Block operasi (AI, OCR, upload, invite)
      → Benarkan view, export, support, payment
```

**Alternatif (lebih mudah):** Supabase scheduled function / trigger yang auto-update `tenant_subscriptions.status` = `'expired'` bila `current_period_end` berlalu. Server kemudian semak `status != 'active' AND status != 'trial_active'`.

### 5. Semua Pilihan UX

**Option A — Hard lock segera**
- Trial tamat → semua fungsi locked kecuali view + bayar
- Terlalu agresif, boleh gusarkan pelanggan

**Option B — Grace period 3 hari** *(Dicadangkan)*
- Trial tamat → 3 hari grace (fungsi penuh tapi dengan banner "Trial Tamat")
- Selepas 3 hari → mode terhad
- Memberi masa pelanggan buat keputusan tanpa tekanan

**Option C — Gradual degradation**
- Hari 1 selepas tamat: upload disabled
- Hari 3: AI disabled
- Hari 7: semua disabled
- Terlalu kompleks dan sukar dikomunikasikan

### 6. Analisis Pilihan

| Kriteria | A | B | C |
|---|---|---|---|
| UX | 4/10 | **9/10** | 5/10 |
| Revenue Protection | **9/10** | 8/10 | 6/10 |
| Customer Satisfaction | 4/10 | **9/10** | 5/10 |
| Dev Complexity | **7/10** | 6/10 | 3/10 |
| Support Impact | 5/10 | **9/10** | 5/10 |
| ADR Compliance | 8/10 | **9/10** | 7/10 |

### 7. Cadangan Terbaik

**Saya mencadangkan Option B (Grace period 3 hari).**

**Mesej UI (Trial Tamat):**
*"Tempoh percubaan anda telah tamat. Anda masih boleh mengakses data sedia ada. Untuk meneruskan penggunaan penuh, sila langgan pelan MYKERANI."*

### 8. Impak Kepada Sistem

| Komponen | Perubahan |
|---|---|
| Supabase Migration | Function/trigger untuk auto-update status bila trial expired |
| `server.ts` | Middleware semak subscription status sebelum benarkan operasi |
| `OwnerDashboard.tsx` | Banner countdown trial + grace period warning |

**Keutamaan: 🟠 HIGH**

---

## ENFORCEMENT 7 — Langganan Tamat / Tidak Diperbaharui

### 1. Nama
**Subscription Expiry — Post-Payment Grace Enforcement**

### 2. Situasi & Apa Yang Dilihat Pengguna

| Situasi | UX Yang Dicadangkan |
|---|---|
| Subscription hampir tamat (7 hari) | 🔔 Banner: "Langganan anda akan tamat dalam 7 hari" |
| Subscription hampir tamat (3 hari) | 🟠 Banner oren + CTA bayar |
| Subscription tamat | 🔴 Mode terhad (sama dengan trial tamat) |
| Gagal bayar automatik | 🟠 Banner + notifikasi email |
| Bayar selepas tamat | Serta-merta unlock |

**Apa yang masih boleh diakses (subscription tamat):**
```
✅ View data sedia ada
✅ Export semua data (data ownership rule — ADR-001)
✅ Bayar / renew
✅ Support
✅ Login/Logout
❌ Upload baru
❌ AI Financial Assistant
❌ Import Penyata Bank
❌ Jemput staf baru
```

### 3. Cadangan Terbaik

Sama dengan trial expiry (Enforcement 6) — gunakan mekanisme yang sama, bezakan hanya pada `status` field.

**Keutamaan: 🟠 HIGH**

---

## ENFORCEMENT 8 — Add-On (Top-Up)

### 1. Nama
**Add-On Purchase — State & Availability Enforcement**

### 2. Situasi & Apa Yang Dilihat Pengguna

| Situasi | UX Yang Dicadangkan |
|---|---|
| Beli top-up AI | Modal pakej → pilih → payment → kredit tambah serta-merta (Chip) / dalam 24j (manual) |
| Beli top-up Penyata Bank | Modal pakej → pilih → payment → kredit tambah |
| Beli top-up Storan | Modal pakej → pilih → payment → kuota naik |
| Beli top-up Pengguna | Modal pakej → pilih → payment → slot naik |
| Top-up gagal (payment fail) | Toast: "Pembayaran tidak berjaya. Sila cuba lagi atau hubungi support." |
| Top-up pending (manual slip) | Banner: "Top-up anda sedang dalam semakan. Dalam masa 24 jam." |
| Top-up expired (tidak digunakan) | Add-on kekal dalam wallet sehingga habis (tiada expiry untuk kuota) |
| Beli top-up ketika trial | Dicadangkan: benarkan — kredit tambah ke wallet |

### 3. Apa Yang Berlaku Di Belakang

```
Beli Add-On:
  → Select pakej dalam modal
  → openAddonPurchaseModal(creditType, amount, label, priceMyr)
  → Chip Asia payment flow / manual slip
  → Setelah payment confirmed:
      → finalize_chip_asia_transaction RPC
      → resource_wallets.ai_credits_balance += amount
      → UI refresh (hook re-fetch)
```

Sistem ini **sudah berfungsi** (fasa sebelum). Gap hanya pada UX untuk status pending.

### 4. Impak Kepada Sistem

| Komponen | Perubahan |
|---|---|
| `OwnerDashboard.tsx` | Tambah "Top-up Pending" status display jika ada pembayaran manual tertangguh |
| DB | Tiada — `addon_packages` dan `payment_transactions` sudah ada |

**Keutamaan: 🟡 MEDIUM**

---

## ENFORCEMENT 9 — Promotion & Coupon

### 1. Nama
**Promotion & Coupon — Validity & Application Enforcement**

### 2. Situasi & Apa Yang Dilihat Pengguna

| Situasi | UX Yang Dicadangkan |
|---|---|
| Kupon sah | Toast: *"🎁 Bonus {N} Resit / Invois dikreditkan!"* atau *"🎁 Tempoh percubaan dilanjutkan {N} hari!"* |
| Kupon tamat | Error: *"Kod promosi ini telah tamat tempoh."* |
| Kupon sudah digunakan | Error: *"Anda telah menebus kod promosi ini."* |
| Kupon tidak wujud | Error: *"Kod promosi tidak sah."* |
| Auto coupon (dari landing page) | Auto-apply semasa daftar, toast confirmation |
| Campaign coupon (UTM) | Sama dengan auto coupon |
| Referral coupon | Kedua-dua pihak dapat bonus — show notification kepada kedua |
| HQ disable coupon | Butang "Tebus Kod Promosi" tersembunyi |

**Cadangan mesej bonus yang spesifik (bukan generik):**
```
kind = 'wallet_credit', credit_type = 'OCR' → "🎁 Bonus 500 Muka Surat Penyata Bank dikreditkan!"
kind = 'wallet_credit', credit_type = 'AI'  → "🎁 Bonus AI Financial Assistant dikreditkan!"
kind = 'trial_extension_days'               → "🎁 Tempoh percubaan dilanjutkan 30 hari!"
```

### 3. Impak Kepada Sistem

| Komponen | Perubahan |
|---|---|
| `OwnerDashboard.tsx:757` | Papar mesej bonus yang spesifik berdasarkan `res.kind` dan `res.credit_type` |
| DB | `promotions.credit_type` perlu ada (semak sama ada field ini wujud) |

**Keutamaan: 🟡 MEDIUM**

---

## ENFORCEMENT 10 — Plan Downgrade

### 1. Nama
**Plan Downgrade — Resource Adjustment Enforcement**

### 2. Situasi & Apa Yang Dilihat Pengguna

| Resource | Apa berlaku semasa downgrade |
|---|---|
| Staf berlebihan | Inform owner: "Plan baru: max 2 staf. Anda ada 4 staf. Sila suspend 2 sebelum downgrade." |
| Storage berlebihan | Data tidak padam — tapi freeze upload hingga storage dalam had baru |
| Kredit AI | Baki kredit kekal, kredit renewal ikut plan baru |
| Kredit Penyata Bank | Baki kredit kekal, kredit renewal ikut plan baru |
| Add-on | Add-on kekal sehingga habis |

### 3. Cadangan

**Downgrade dengan Pre-condition Check:**
- Sebelum benarkan downgrade, semak sama ada syarat dipenuhi (staf, storage)
- Jika tidak → papar senarai "perkara perlu diselesaikan dahulu"
- Jika ya → proceed downgrade

**Mesej UI:**
```
⚠️ Sebelum turun taraf ke Plan Starter:

☐ Kurangkan staf kepada maksimum 2 (semasa: 4)
☐ Pastikan storan di bawah 5 GB (semasa: 8.3 GB)

Kredit berbaki anda akan dikekalkan.
```

**Keutamaan: 🟡 MEDIUM**

---

## ENFORCEMENT 11 — Plan Upgrade

### 1. Nama
**Plan Upgrade — Immediate Effect Enforcement**

### 2. Apa Yang Berubah Selepas Upgrade

| Perkara | Bila Berubah |
|---|---|
| Kredit baru (AI + OCR) | Serta-merta selepas payment confirmed |
| Had storan | Serta-merta |
| Had pengguna | Serta-merta |
| Subscription status | Serta-merta (`status = 'active'`) |
| UI refresh | Perlu explicit refresh atau hook re-fetch |

### 3. Cadangan

**Selepas upgrade berjaya:**
```
✅ Toast: "Tahniah! Plan {nama} kini aktif."
✅ Papar kredit baru dalam Bil & Langganan
✅ Semua fungsi yang sebelum ini disabled → enabled serta-merta
✅ Confetti/celebration animation (optional)
```

**Impak kepada sistem:**
- `finalize_chip_asia_transaction` sudah handle ini — perlu pastikan UI refresh hooks selepas success

**Keutamaan: 🟡 MEDIUM**

---

## ENFORCEMENT 12 — Suspended Tenant

### 1. Nama
**Tenant Suspension — Access Control Enforcement**

### 2. Apa Yang Masih Boleh Dibuat (Suspended)

```
✅ Login (perlu nampak mesej suspension)
✅ View data (read-only)
✅ Export data (data ownership rule)
✅ Bayar invois tertunggak
✅ Hubungi support
✅ Lihat sebab suspension (jika ada)
❌ Upload
❌ AI
❌ Import Penyata Bank
❌ Tambah staf
❌ Ubah tetapan
```

### 3. Situasi & Apa Yang Dilihat Pengguna

| Situasi | UX Yang Dicadangkan |
|---|---|
| Login ke akaun suspended | Banner merah fullscreen: "Akaun anda telah disekat" + sebab + hubungi support |
| Cuba upload/AI ketika suspended | Redirect ke banner suspension, bukan error generic |
| HQ unsuspend | Banner hilang serta-merta (Supabase realtime) |
| Bayar semua tertunggak | Auto-unsuspend atau trigger HQ review |

### 4. Impak Kepada Sistem

| Komponen | Perubahan |
|---|---|
| `server.ts` | `isUserSuspended()` sudah ada untuk OCR/Stmt — tambah ke AI routes |
| `AuthContext.tsx` | Semak suspension status semasa login, papar banner |
| `OwnerDashboard.tsx` | Suspension banner UI |

**Keutamaan: 🟠 HIGH (security)**

---

## ENFORCEMENT 13 — HQ Manual Override

### 1. Nama
**HQ Override — Temporary Limit Extension**

### 2. Apa Yang Boleh Di-override

| Override | Cara | Audit |
|---|---|---|
| Extend trial | `promotions` table (trial_extension_days) | ✅ Sudah ada |
| Tambah kredit AI | HQ console → resource wallet top-up | ✅ Sudah ada |
| Tambah kredit OCR | HQ console → resource wallet top-up | ✅ Sudah ada |
| Freeze/unfreeze tenant | `set_tenant_frozen` RPC | ✅ Sudah ada |
| Suspend/unsuspend user | `profiles.is_suspended` | ✅ Sudah ada |
| Naikkan user limit | Override `maxUsers` dalam commercial_config | ⚠️ Perlu config |
| Naikkan storage limit | Override quota dalam `workspace_storage_state` | ⚠️ Perlu verify |

### 3. Bagaimana Dipaparkan Kepada Tenant

```
Jika ada override aktif:
  → Tag/badge kecil: "🔧 Override HQ Aktif"
  → Tidak perlu tunjuk butiran (pelanggan tidak perlu tahu mekanisme)
  → Support boleh rujuk audit log jika diperlukan
```

### 4. Impak Kepada Sistem

Kebanyakan override sudah ada. Gap utama:
- `commercial_config_items` table wujud tapi kosong — perlu seed nilai
- `hq_feature_flags` tidak ada flag `trial_enabled` / `coupons_enabled`

**Keutamaan: 🟡 MEDIUM**

---

## ENFORCEMENT 14 — Error Recovery

### 1. Nama
**Transient Error — Graceful Recovery & Credit Fairness**

### 2. Situasi & UX

| Scenario | Apa Berlaku Sekarang | Cadangan |
|---|---|---|
| OCR gagal (selepas deduct kredit) | Kredit hilang, tiada hasil | Rollback kredit dalam 60 saat jika no response |
| AI timeout | HTTP 504, kredit mungkin sudah ditolak | Tambah try-catch rollback |
| Payment timeout | Order pending, kredit belum masuk | Status "Pending" kepada user |
| Supabase down | Semua operasi gagal | Friendly error: "Sistem sedang menjalani penyelenggaraan" |
| API timeout | Bergantung pada mana | Generic: "Permintaan mengambil masa terlalu lama. Sila cuba lagi." |

### 3. Prinsip Credit Fairness

```
PRINSIP: Kredit hanya ditolak jika perkhidmatan berjaya dihantar.

Jika gagal kerana:
  - Provider timeout (>30s) → rollback kredit
  - Provider error (5xx) → rollback kredit
  - Pengguna cancel → rollback kredit (jika belum process)
  
Jika gagal kerana:
  - Input pengguna tidak sah (PDF rosak, gambar blur) → kredit TIDAK rollback
    (sistem telah cuba, kegagalan bukan salah HQ)
  - Pengguna hantar fail yang sama berkali-kali → tanpa rollback
```

### 4. Impak Kepada Sistem

| Komponen | Perubahan |
|---|---|
| `server.ts` | Tambah try-catch rollback dalam OCR route |
| `server.ts` | Tambah rollback dalam AI route jika provider timeout |
| Migration | Baru: `reverse_resource_credit(txn_id)` RPC yang neutralize txn |

**Keutamaan: 🟡 MEDIUM**

---

## RINGKASAN KEUTAMAAN IMPLEMENTASI

### 🔴 CRITICAL (Perlu dalam Phase 4)

| # | Enforcement | Gap | Impak |
|---|---|---|---|
| 1 | AI Credit check SEBELUM AI call | Kos terkumpul bila kuota 0 | Revenue leak |
| 2 | AI Suspension check | User suspended guna AI | Security |
| 3 | Bank Statement per-page quota | 1 kredit untuk 50 halaman | Revenue leak (ADR-001) |
| 4 | FinancialEvidencePackage storage check | Upload berlaku ketika frozen | Security |

### 🟠 HIGH (Segera selepas Critical)

| # | Enforcement | Gap |
|---|---|---|
| 5 | Staff user limit | Boleh invite unlimited staff |
| 6 | Trial expiry enforcement | Tenant guna platform lepas trial tamat |
| 7 | Subscription expiry enforcement | Sama dengan trial |
| 8 | Suspended tenant AI block | Pengguna suspended guna AI |
| 9 | OwnerDashboard AI client check | Tidak konsisten dengan StaffHomeScreen |

### 🟡 MEDIUM (Phase 5 atau later)

| # | Enforcement | Gap |
|---|---|---|
| 10 | Credit rollback jika OCR gagal | Kredit hilang tanpa hasil |
| 11 | Add-on pending status display | UI tidak tunjuk status pending |
| 12 | Promotion mesej spesifik | "kuota tambahan" terlalu generik |
| 13 | Plan downgrade pre-condition | Boleh downgrade tanpa selesaikan constraint |
| 14 | commercial_config_items seeding | Table kosong |
| 15 | Duplikat upload detection | Boleh upload fail sama berkali-kali |

### 🟢 LOW (Nice to have)

| # | Enforcement |
|---|---|
| 16 | Supabase Realtime untuk storage freeze |
| 17 | `consume_resource_credit` v1 cleanup |
| 18 | Upgrade plan celebration animation |

---

## PENGESAHAN

- ✅ Tiada kod diubah
- ✅ Tiada database diubah
- ✅ Tiada API diubah
- ✅ Tiada architecture diubah
- ✅ Tiada Business Logic diubah
- ✅ Tiada Resource Wallet diubah
- ✅ Tiada AI Ledger diubah
- ✅ Tiada OCR Ledger diubah
- ✅ Tiada Billing Engine diubah

Dokumen ini adalah Commercial Enforcement Design Specification sahaja.
Implementasi hanya boleh bermula selepas kelulusan eksplisit diberikan.

---

*CESpec-001 V1.0 — DRAFT | Pending Approval*
