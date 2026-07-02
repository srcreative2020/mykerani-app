# ADR-001 — MYKERANI Commercial Resource Model V1.0

| Medan | Nilai |
|---|---|
| **Status** | **LOCKED** |
| **Versi** | 1.0 |
| **Tarikh Dikunci** | 2026-07-02 |
| **Pemilik** | srcreative2020@gmail.com |
| **Lokasi** | `docs/architecture/ADR-001-MYKERANI-Commercial-Resource-Model-V1.0.md` |

---

## Tujuan

Dokumen ini adalah **Single Source of Truth (SSOT)** bagi semua pembangunan berkaitan model komersial MYKERANI.

Sebarang perubahan kepada mana-mana skop berikut **WAJIB merujuk dokumen ini terlebih dahulu** dan mendapat kelulusan pemilik projek sebelum implementasi:

- Subscription Plan
- Billing & Payment
- Resource Wallet
- AI Usage & Cost
- OCR Usage & Cost
- Storage
- Landing Page (pricing section)
- Trial
- Promotion & Coupon
- Add-on
- Tenant Dashboard
- Tenant UI (OwnerDashboard, StaffHomeScreen)
- HQ Console (HQConsoleShell)
- Mobile App (masa hadapan)

---

## Konteks

MYKERANI menggunakan sistem enjin dalaman (AI Ledger, OCR Ledger, Resource Wallet, Cost Engine) yang mengira kos sebenar penggunaan di peringkat HQ. Sistem ini tidak boleh dipaparkan kepada tenant kerana ia adalah infrastruktur perniagaan yang sensitif. Tenant hanya perlu melihat bahasa perniagaan yang mudah difahami tanpa latar belakang teknikal atau perakaunan.

---

## Keputusan

### Prinsip 1 — Enjin Dalaman KEKAL Tidak Diubah

Enjin-enjin berikut adalah infrastruktur teras HQ dan **tidak boleh diubah, dibuang, atau disembunyikan dari HQ**:

| Enjin | Jadual / Sistem |
|---|---|
| AI Ledger | `ai_usage_logs`, `ai_cost_rates` |
| OCR Ledger | (bahagian dari `resource_wallet_transactions` type=OCR) |
| Resource Wallet | `resource_wallets`, `resource_wallet_transactions` |
| Storage Ledger | `resource_wallets.storage_used_bytes`, `storage_ledger` |
| Cost Engine | `commercial_config_items`, `ai_cost_rates` |
| Billing Engine | `payment_transactions`, `tenant_subscriptions` |
| Usage Analytics | `commercial_events`, `event_logs` |

Semua enjin ini kekal berfungsi sepenuhnya di peringkat HQ.

---

### Prinsip 2 — Commercial Layer Berasingan daripada Internal Layer

Sistem MYKERANI mempunyai dua lapisan yang **wajib dipisahkan**:

```
┌─────────────────────────────────────────────────────────┐
│              LAPISAN DALAMAN (HQ SAHAJA)                │
│                                                         │
│  AI Credits · OCR Credits · Resource Wallet · Token     │
│  Storage Credits · Notification Credits · AI Cost       │
│  OCR Cost · Storage Cost · Resource Usage · Profit      │
└─────────────────────────────┬───────────────────────────┘
                              │
                              ▼
              Commercial Translation Layer
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│              LAPISAN TENANT (Paparan Awam)               │
│                                                         │
│  🧾 Bilangan Resit / Invois                             │
│  🏦 Bilangan Muka Surat Penyata Bank                    │
│  👥 Bilangan Pengguna                                   │
│  ☁️  Kapasiti Storan (GB)                               │
│  🤖 AI Financial Assistant                              │
└─────────────────────────────────────────────────────────┘
```

---

### Prinsip 3 — Tenant Hanya Melihat Bahasa Perniagaan

Berikut adalah pemetaan rasmi antara istilah dalaman dan istilah tenant:

| Istilah Dalaman (HQ) | Istilah Tenant (Paparan) |
|---|---|
| `ocr_credits_allowance` (untuk resit/invois) | **Bilangan Resit / Invois** |
| `ocr_credits_allowance` (untuk bank statement) | **Bilangan Muka Surat Penyata Bank** |
| `storage_limit_bytes` | **Kapasiti Storan (GB)** |
| `max_users` dalam `features` JSONB | **Bilangan Pengguna** |
| AI engine (semua model, token, cost) | **AI Financial Assistant** |
| `ai_credits_balance` | *Tersembunyi — dikawal oleh Fair Usage Policy* |
| `resource_wallets` | *Tersembunyi sepenuhnya daripada tenant* |
| `notification_credits_balance` | *Tersembunyi sepenuhnya daripada tenant* |

---

### Prinsip 4 — Definisi Kuota Rasmi

#### Resit / Invois / Bil
- 1 fail Resit = **1 kuota**
- 1 fail Invois = **1 kuota**
- 1 fail Bil = **1 kuota**
- Unit: bilangan fail, **bukan** bilangan token atau bilangan halaman

#### Penyata Bank
- Dikira berdasarkan **bilangan muka surat PDF**
- PDF 5 muka surat = **5 kuota**
- PDF 20 muka surat = **20 kuota**
- PDF 100 muka surat = **100 kuota**
- Rasional: melindungi kos OCR dan AI yang bergantung kepada jumlah teks diproses

#### AI Financial Assistant
- **Tidak dijual** berdasarkan AI Credits, Token, atau Prompt Count
- Tenant melihat hanya label **"AI Financial Assistant"**
- Penggunaan sebenar dikawal oleh: AI Ledger + Fair Usage Policy + Cost Engine
- Semua kiraan dalaman tersembunyi daripada tenant

#### Storan
- Dipaparkan dalam unit **GB**
- Contoh: `5 GB`, `20 GB`, `100 GB`
- Nilai diambil daripada `resource_wallets.storage_limit_bytes` ÷ 1,073,741,824

#### Pengguna
- Dipaparkan sebagai bilangan bulat
- Nilai diambil daripada `subscription_plans.features->>'maxUsers'`

---

### Prinsip 5 — Commercial Translation Layer (CTL)

Setiap pautan antara enjin dalaman dan paparan tenant **mesti melalui CTL**. CTL adalah lapisan logic (boleh berupa fungsi helper, hook, atau service) yang:

1. Membaca nilai dalaman dari Supabase
2. Menerjemah kepada unit dan bahasa tenant
3. Tidak pernah mendedahkan nama kolum atau metrik dalaman kepada UI tenant

**Contoh Terjemahan:**

```
OCR Ledger (ocr_credits_allowance: 500)
        ↓ [CTL: jenis == resit]
"Sehingga 500 Resit / Invois sebulan"

Storage Ledger (storage_limit_bytes: 5368709120)
        ↓ [CTL: bytes ÷ 1073741824]
"5 GB Storan"

resource_wallets (max_users: 3 dari features JSONB)
        ↓ [CTL]
"Sehingga 3 Pengguna"
```

---

### Prinsip 6 — HQ Kekal Mengira Semua Kos

HQ tidak kehilangan sebarang metrik. Semua perkara berikut kekal dikira dan dipapar di HQ Console:

- Kos AI sebenar (USD per call × bilangan call)
- Kos OCR sebenar (per halaman)
- Kos Storan sebenar
- Kos Notifikasi
- Kos API / gateway
- Margin keuntungan per tenant
- Penggunaan resource per tenant
- MRR, ARR, churn risk

---

### Prinsip 7 — Larangan Mutlak

Larangan berikut berkuat kuasa serta-merta dan tidak boleh dilanggar tanpa kelulusan pemilik projek:

```
❌  Jangan paparkan "AI Credits" kepada tenant
❌  Jangan paparkan "OCR Credits" kepada tenant
❌  Jangan paparkan "Resource Wallet" kepada tenant
❌  Jangan paparkan "Token" kepada tenant
❌  Jangan paparkan "Notification Credits" kepada tenant
❌  Jangan paparkan kos dalam USD kepada tenant
❌  Jangan hardcode nilai kuota — semua mesti baca dari subscription_plans
❌  Jangan duplicate data plan di luar subscription_plans (termasuk PLAN_QUOTAS dalam storageQuota.ts)
```

---

### Prinsip 8 — Satu Sumber Data Plan

**`subscription_plans`** dalam Supabase adalah satu-satunya sumber data plan yang sah.

- Landing Page: membaca dari `subscription_plans` ✅
- OwnerDashboard (billing): membaca dari `subscription_plans` ✅
- Onboarding wizard: **wajib** membaca dari `subscription_plans`
- `PLAN_QUOTAS` hardcode dalam `storageQuota.ts`: **WAJIB dihapuskan** dan digantikan dengan query `subscription_plans`
- Tiada nilai kuota yang dibenarkan ditulis secara literal dalam kod UI

---

## Implikasi Teknikal

### Yang Perlu Dikekalkan (Jangan Ubah)
- `resource_wallets` dan semua RPCnya
- `resource_wallet_transactions`
- `ai_usage_logs`, `ai_cost_rates`
- `commercial_events`
- `payment_transactions`
- `tenant_subscriptions`
- `subscription_plans` (struktur dan RPC)
- `promotions`, `promotion_redemptions`
- Semua HQ Console modules

### Yang Perlu Diperbaiki (Merujuk ADR Ini)
- `storageQuota.ts` — hapus `PLAN_QUOTAS` hardcode, baca dari `subscription_plans`
- Tenant UI (OwnerDashboard, StaffHomeScreen) — audit semua paparan, pastikan tiada istilah dalaman yang terlepas
- Onboarding wizard — unit kuota mesti pakai bahasa tenant (Resit, Muka Surat, GB)
- Billing screen tenant — tukar "AI Credits" / "OCR Credits" kepada istilah CTL
- Landing Page pricing — audit label plan, pastikan tiada "AI Credits" terpapar

### Journey Engine (Masa Hadapan)
- Semua keputusan journey (trial, kupon, auto-apply) mesti membaca dari `hq_feature_flags` dan `commercial_config_items`
- Tiada nilai hardcode dalam journey logic
- Journey Engine mesti menggunakan CTL sebelum memaparkan apa-apa resource kepada tenant

---

## Sebab Keputusan Ini

1. **Melindungi margin:** Jika tenant tahu kos sebenar AI per call, mereka boleh bandingkan dengan harga pasaran dan mempersoalkan margin.
2. **Fleksibiliti perniagaan:** HQ boleh tukar provider AI, model, atau struktur kos tanpa perlu ubah UI tenant.
3. **Kesederhanaan UX:** Pengguna bukan akauntan tidak perlu faham "kredit" atau "token" — mereka hanya perlu tahu berapa resit boleh diproses.
4. **Keserasian dengan visi:** MYKERANI menggunakan formula "Cakap. Upload. Sahkan." — resit, muka surat, dan GB adalah bahasa yang tenant faham secara semula jadi.
5. **Kawalan HQ:** HQ menentukan semua polisi. Tenant hanya mengikut journey yang dibina dari polisi tersebut.

---

## Proses Perubahan

Sebarang cadangan untuk mengubah model komersial MYKERANI mesti:

1. Cipta dokumen cadangan (proposal) dalam `docs/proposals/`
2. Terangkan sebab perubahan diperlukan
3. Tunjukkan bahawa cadangan tidak melanggar mana-mana prinsip dalam dokumen ini
4. Mendapat kelulusan bertulis daripada pemilik projek (`srcreative2020@gmail.com`)
5. Kemaskini dokumen ini dengan versi baharu sebelum implementasi

**Tiada perubahan model komersial yang dibenarkan tanpa mengikut proses ini.**

---

## Dokumen Berkaitan

| Dokumen | Status | Lokasi |
|---|---|---|
| MYKERANI_VISION.md | LOCKED V1.0 | `/MYKERANI_VISION.md` |
| MYKERANI_CONSTITUTION.md | LOCKED V1.0 | `/MYKERANI_CONSTITUTION.md` |
| MYKERANI_OWNER_STAFF_PARITY_RULE.md | LOCKED V1.0 | `/MYKERANI_OWNER_STAFF_PARITY_RULE.md` |
| MYKERANI_TENANT_ECOSYSTEM_GOVERNANCE_PRINCIPLE.md | LOCKED V1.0 | `/MYKERANI_TENANT_ECOSYSTEM_GOVERNANCE_PRINCIPLE.md` |
| ADR-001 (dokumen ini) | LOCKED V1.0 | `/docs/architecture/ADR-001-MYKERANI-Commercial-Resource-Model-V1.0.md` |

---

*Dokumen ini dikunci pada 2026-07-02. Versi baharu hanya boleh diterbitkan dengan kelulusan pemilik projek.*
