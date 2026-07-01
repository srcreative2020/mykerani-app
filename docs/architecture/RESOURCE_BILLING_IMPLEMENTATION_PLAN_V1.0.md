# RESOURCE BILLING IMPLEMENTATION PLAN V1.0

**STATUS: LOCKED**
**Version: 1.0**
**Approved: 2026**

---

## TUJUAN DOKUMEN

Dokumen ini adalah pelan pelaksanaan rasmi untuk semua Workstream Resource Billing dalam MyKerani.
Sprint Plan, Workstream, dan skop adalah LOCKED. Tiada pengubahan dibenarkan tanpa kelulusan eksplisit pemilik produk.

---

## OVERVIEW SPRINT

| Batch  | Workstream | Tajuk                              | Status     |
|--------|------------|------------------------------------|------------|
| Batch 1 | WS1       | Resource Credit Consumption        | COMPLETE   |
| Batch 1 | WS2       | Tenant Resource Ledger             | COMPLETE   |
| Batch 2 | WS3       | Storage Ledger Logging             | COMPLETE   |
| Batch 2 | WS4       | HQ Resource Profit Summary         | COMPLETE   |
| Batch 3 | WS5       | Commercial Resource Display        | PENDING    |
| Batch 4 | WS6       | Billing Statement & Export         | FUTURE     |
| Batch 4 | WS7       | Admin Billing Controls (HQ)        | FUTURE     |

---

## BATCH 1 — COMPLETE

### WS1: Resource Credit Consumption

**Tujuan:** Satu-satunya laluan untuk menolak kredit AI dan OCR.

**Deliverables:**
1. DB — `consume_resource_credit_v2(p_tenant_id uuid, p_workspace_id uuid, p_credit_type credit_type, p_amount bigint DEFAULT 1, p_description text DEFAULT NULL) RETURNS TABLE(ok boolean, txn_id uuid)`
   - WHERE clause: `workspace_id = p_workspace_id` sahaja (bukan tenant_id)
   - Memanggil `ensure_resource_wallet()` jika wallet belum wujud
   - `SELECT FOR UPDATE` untuk mengelak race condition
   - Menyimpan rekod ke `resource_wallet_transactions`
   - Menolak baki dalam `resource_wallets`
   - Internal tenant bypass via `is_internal` metadata
2. DB — DROP overload lama `consume_resource_credit_v2(uuid, uuid, text, numeric, text)`
   - Hanya tinggal satu overload: `(uuid, uuid, credit_type, bigint, text)`
3. `server.ts` — semua 4 call sites (AI, OCR, Bank Statement, Voice) memanggil RPC ini

**Bukan skop WS1:**
- Paparan UI ledger
- Laporan HQ
- Storage ledger

---

### WS2: Tenant Resource Ledger

**Tujuan:** Tenant boleh melihat sejarah transaksi kredit mereka.

**Deliverables:**
1. DB — `get_tenant_resource_ledger(p_workspace_id uuid, p_credit_type text DEFAULT NULL, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)`
   - Returns: `txn_id, credit_type, activity_type, amount bigint, description, metadata, created_at, running_balance numeric, job_ref`
   - `col_` prefix pada semua kolum intermediate CTE untuk mengelak ambiguity PL/pgSQL
   - `running_balance` = SUM(amount) OVER (PARTITION BY credit_type ORDER BY created_at)
2. `hqService.ts` — `getTenantResourceLedger(workspaceId, creditType?, limit?, offset?)`
3. `TenantResourceLedger.tsx` — komponen UI yang memaparkan ledger dengan:
   - Tab: Semua | AI | OCR | Storage
   - Kolum: Jenis | Aktiviti | Jumlah | Baki Berjalan | Penerangan | Masa

**Bukan skop WS2:**
- Anggaran billing dalam MYR (WS5)
- Export ledger (WS6)

---

## BATCH 2 — COMPLETE

### WS3: Storage Ledger Logging

**Tujuan:** Setiap upload dan delete fail direkodkan dalam `resource_wallet_transactions` sebagai STORAGE entries.

**Deliverables:**
1. DB — `log_storage_ledger_entry(p_workspace_id uuid, p_amount_bytes bigint, p_activity_type text DEFAULT 'USAGE', p_description text DEFAULT '', p_metadata jsonb DEFAULT '{}')`
   - Insert ke `resource_wallet_transactions` dengan `credit_type = 'STORAGE'`
   - amount positif = upload, amount negatif = delete/refund
2. DB — `get_hq_storage_ledger_summary()` — HQ view ringkasan storage per workspace
   - Membaca dari `resource_wallet_transactions` WHERE `credit_type = 'STORAGE'`
   - Returns: workspace_id, workspace_name, tenant_id, tenant_name, total_upload_bytes, total_delete_bytes, net_bytes, upload_count, delete_count
3. `hqService.ts` — `HqStorageSummaryRow` type + `getHqStorageLedgerSummary()`
4. `FinancialEvidencePackage.tsx` — memanggil `logStorageLedgerEntry()` selepas upload berjaya
5. `documentStorage.ts` — memanggil `logStorageLedgerEntry()` dengan amount negatif selepas delete berjaya
6. `HQConsoleShell.tsx` — panel "Ringkasan Storan Sumber" dalam HQ Cost Center
   - Sentiasa dipaparkan (dengan empty state jika tiada data)
   - Menunjukkan Muat Naik, Padam, Bersih per workspace

**Bukan skop WS3:**
- Storage quota enforcement
- Storage billing/invoicing

---

### WS4: HQ Resource Profit Summary

**Tujuan:** HQ boleh melihat anggaran keuntungan sumber berdasarkan Single Source of Truth.

**Deliverables:**
1. DB — Seed ke `commercial_config_items`:
   - `avg_ai_cost_usd: {"cost": 0.002}`
   - `avg_ocr_cost_usd: {"cost": 0.001}`
2. DB — `get_hq_resource_profit_summary(p_days integer DEFAULT 30)`
   - Membaca SEMUA kadar dari `commercial_config_items` (bukan `ai_cost_rates`)
   - Returns per credit_type: usage_count, avg_cost_usd, total_cost_usd, markup_pct, billing_usd_myr_rate, estimated_revenue_myr, estimated_cost_myr, estimated_margin_myr
   - `col_usage` CTE dengan `col_` prefix untuk mengelak ambiguity
3. `hqService.ts` — `HqResourceProfitRow` type + `getHqResourceProfitSummary(days)`
4. `HQConsoleShell.tsx` — panel "Untung Sumber — Anggaran 30 Hari"
   - Sentiasa dipaparkan (dengan empty state jika tiada data)
   - Labels: Kos Pembekal (USD) | Kos Sumber (MYR) | Hasil Sumber (MYR) | Markup | Margin Sumber
   - Note: "Berdasarkan commercial_config_items semasa"
5. `HQConsoleShell.tsx` — panel "Dasar Harga Sumber" memaparkan `avg_ai_cost_usd` dan `avg_ocr_cost_usd`

**Bukan skop WS4:**
- Paparan anggaran MYR pada tenant side (WS5)
- Invois billing (WS6)

---

## BATCH 3 — PENDING

### WS5: Commercial Resource Display

**Tujuan:** Tenant boleh melihat anggaran kos MYR bagi setiap penggunaan AI/OCR dalam Lejar Sumber mereka, menggunakan kadar yang sama dari `commercial_config_items`.

**Deliverables:**

**5.1 — Kadar dari Single Source of Truth**
- `TenantResourceLedger.tsx` memuat `avg_ai_cost_usd`, `avg_ocr_cost_usd`, `billing_usd_myr_rate`, `markup_ai_pct`, `markup_ocr_pct` dari `getConfigValue()` (bukan hardcode)
- Fungsi `estimateMyr(creditType, amount, rates)` menggunakan kadar dari config
- Default fallback dalam kod hanyalah untuk kes config belum dimuat (bukan sebagai hardcode kekal)

**5.2 — Display Anggaran MYR**
- Setiap baris AI USAGE dalam ledger memaparkan: `≈RM{anggaran}` berdasarkan kadar semasa
- Setiap baris OCR USAGE dalam ledger memaparkan: `≈RM{anggaran}` berdasarkan kadar semasa
- Baris STORAGE tidak memaparkan anggaran MYR (storage tidak ada markup model yang sama)
- Baris ALLOCATION dan REFUND tidak memaparkan anggaran MYR (hanya USAGE)

**5.3 — Display Storage dalam Ledger**
- Baris STORAGE memaparkan jumlah dalam format bytes (KB/MB/GB) bukan integer raw
- Baki berjalan STORAGE juga dipaparkan dalam format bytes
- Label yang jelas: Upload (+) atau Padam (-) berdasarkan tanda amount

**5.4 — Tab Navigation**
- Tab "Semua" — semua jenis kredit
- Tab "AI" — tapis AI sahaja
- Tab "OCR" — tapis OCR sahaja
- Tab "Storage" — tapis STORAGE sahaja
- Kiraan badge pada setiap tab (bilangan rekod)

**5.5 — Summary Bar**
- Paparkan baki semasa per jenis kredit di bahagian atas lejar:
  - AI: {baki} kredit
  - OCR: {baki} kredit
  - Storage: {bersih} MB digunakan
- Baki diambil dari `resource_wallets` (bukan dikira semula dari ledger)

**Bukan skop WS5:**
- Export ledger ke CSV/PDF (WS6)
- Invois billing
- Pembayaran atau top-up dari tenant side

---

## BATCH 4 — FUTURE

### WS6: Billing Statement & Export

**Tujuan:** Tenant boleh menjana dan mengeksport penyata billing bulanan.

*(Skop terperinci akan ditentukan dalam sprint berikutnya)*

---

### WS7: Admin Billing Controls (HQ)

**Tujuan:** HQ boleh mengurus kredit tenant secara manual (tambah, tolak, laras) dengan audit trail lengkap.

*(Skop terperinci akan ditentukan dalam sprint berikutnya)*

---

## PERATURAN IMPLEMENTATION

1. Setiap Workstream hanya boleh melaksanakan skop yang dinyatakan di atas
2. Tiada Workstream boleh menyentuh skop Workstream lain
3. Tiada engine, ledger, atau business logic baharu di luar skop
4. Semua implementation MESTI mematuhi `RESOURCE_BILLING_ARCHITECTURE_LOCK_V1.0.md`
5. Build MESTI lulus selepas setiap Batch
6. TypeScript baseline MESTI tidak bertambah
7. UAT mesti lulus sebelum Batch berikutnya dimulakan

---

## DEFINISI ISTILAH

| Istilah             | Maksud                                                              |
|---------------------|---------------------------------------------------------------------|
| Kos Pembekal        | Kos sebenar dari AI/OCR provider (dalam USD)                       |
| Kos Sumber          | Kos pembekal × kadar USD/MYR (dalam MYR)                          |
| Hasil Sumber        | Kos pembekal × (1 + markup%) × kadar USD/MYR (dalam MYR)          |
| Margin Sumber       | Hasil Sumber − Kos Sumber (dalam MYR)                              |
| Untung Sumber       | Jumlah Margin Sumber untuk semua credit types                       |
| Lejar Sumber        | `resource_wallet_transactions` — rekod semua transaksi             |
| Wallet Sumber       | `resource_wallets` — baki semasa per workspace                     |

---

*Dokumen ini LOCKED. Versi 1.0 diluluskan oleh pemilik produk.*
