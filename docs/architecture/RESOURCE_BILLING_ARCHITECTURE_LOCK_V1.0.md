# RESOURCE BILLING ARCHITECTURE LOCK V1.0

**STATUS: LOCKED**
**Version: 1.0**
**Approved: 2026**

---

## TUJUAN DOKUMEN

Dokumen ini adalah perlembagaan teknikal untuk semua implementation Resource Billing dalam MyKerani.
Tiada pembangun, agent, atau sprint boleh mengubah mana-mana prinsip dalam dokumen ini tanpa kelulusan eksplisit pemilik produk.

---

## 1. PRINSIP ASAS

### 1.1 Single Ledger Principle

Terdapat SATU sahaja ledger untuk semua transaksi sumber (AI, OCR, Storage):

```
resource_wallet_transactions
```

**DILARANG:**
- Mencipta ledger baharu untuk mana-mana jenis kredit
- Mencipta jadual transaksi berasingan untuk AI, OCR, atau Storage
- Menduplicate data transaksi ke mana-mana jadual lain

### 1.2 Single Source of Truth — Billing Configuration

Semua kadar billing, markup, dan kos purata adalah SATU sumber:

```
commercial_config_items
```

**DILARANG:**
- Membaca kadar dari `ai_cost_rates` untuk pengiraan billing aktif
- Hardcode nilai kadar dalam application code
- Mencipta jadual konfigurasi baharu untuk kadar billing

### 1.3 Single Wallet Principle

Setiap workspace mempunyai SATU wallet:

```
resource_wallets
```

Kolum wallet:
- `ai_credits_balance` — baki kredit AI
- `ocr_credits_balance` — baki kredit OCR
- `notification_credits_balance` — baki kredit notifikasi
- `storage_used_bytes` — penggunaan storage (bytes)

### 1.4 Single Credit Consumption RPC

Terdapat SATU sahaja RPC untuk menolak kredit:

```sql
consume_resource_credit_v2(
  p_tenant_id    uuid,
  p_workspace_id uuid,
  p_credit_type  credit_type,
  p_amount       bigint  DEFAULT 1,
  p_description  text    DEFAULT NULL
)
RETURNS TABLE(ok boolean, txn_id uuid)
```

**DILARANG:**
- Mencipta fungsi consume kredit baharu
- Memanggil UPDATE terus pada `resource_wallets` tanpa melalui RPC ini
- Mencipta overload berbeza untuk RPC ini

---

## 2. SKEMA DATABASE

### 2.1 Jadual Teras (Core Tables)

```sql
-- Wallet per workspace
resource_wallets (
  id                          uuid PRIMARY KEY,
  workspace_id                uuid NOT NULL,
  tenant_id                   uuid NOT NULL,
  ai_credits_balance          bigint NOT NULL DEFAULT 0,
  ocr_credits_balance         bigint NOT NULL DEFAULT 0,
  notification_credits_balance bigint NOT NULL DEFAULT 0,
  storage_used_bytes          bigint NOT NULL DEFAULT 0
)

-- Ledger tunggal semua transaksi
resource_wallet_transactions (
  id            uuid PRIMARY KEY,
  wallet_id     uuid NOT NULL REFERENCES resource_wallets(id),
  credit_type   credit_type NOT NULL,        -- enum: AI | OCR | STORAGE | NOTIFICATION
  activity_type credit_activity_type NOT NULL, -- enum: ALLOCATION | USAGE | REFUND | ADJUSTMENT
  amount        bigint NOT NULL,
  description   varchar(255),
  metadata      jsonb DEFAULT '{}',
  created_at    timestamptz DEFAULT now()
)

-- Single Source of Truth untuk konfigurasi billing
commercial_config_items (
  id          uuid PRIMARY KEY,
  config_key  text NOT NULL,
  scope       text NOT NULL DEFAULT 'global',
  scope_id    uuid,
  value       jsonb NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now()
)
```

### 2.2 Enum Types

```sql
CREATE TYPE credit_type AS ENUM ('AI', 'OCR', 'STORAGE', 'NOTIFICATION');
CREATE TYPE credit_activity_type AS ENUM ('ALLOCATION', 'USAGE', 'REFUND', 'ADJUSTMENT');
```

---

## 3. RPC FUNCTIONS YANG DILULUSKAN

### 3.1 Kredit Consumption
```sql
consume_resource_credit_v2(p_tenant_id, p_workspace_id, p_credit_type, p_amount, p_description)
-- Satu-satunya cara menolak kredit. SECURITY DEFINER.
```

### 3.2 Wallet Initialization
```sql
ensure_resource_wallet(p_tenant_id, p_workspace_id)
-- Mencipta wallet jika belum wujud. Dipanggil oleh consume_resource_credit_v2.
```

### 3.3 Tenant Ledger
```sql
get_tenant_resource_ledger(p_workspace_id, p_credit_type, p_limit, p_offset)
-- Paparan lejar untuk tenant. Running balance per credit_type.
```

### 3.4 Storage Ledger Entry
```sql
log_storage_ledger_entry(p_workspace_id, p_amount_bytes, p_activity_type, p_description, p_metadata)
-- Menulis rekod STORAGE ke resource_wallet_transactions.
```

### 3.5 HQ Resource Profit Summary
```sql
get_hq_resource_profit_summary(p_days integer DEFAULT 30)
-- HQ sahaja. Membaca avg cost dari commercial_config_items.
-- BUKAN dari ai_cost_rates.
```

### 3.6 HQ Storage Ledger Summary
```sql
get_hq_storage_ledger_summary()
-- HQ sahaja. Ringkasan storage per workspace dari resource_wallet_transactions.
```

### 3.7 Config Value Reader
```sql
get_config_value(p_config_key text, p_scope text DEFAULT 'global', p_scope_id uuid DEFAULT NULL)
-- Membaca nilai dari commercial_config_items.
```

---

## 4. KONFIGURASI BILLING (commercial_config_items)

Keys yang diluluskan:

| config_key             | value format              | Penerangan                        |
|------------------------|---------------------------|-----------------------------------|
| `billing_usd_myr_rate` | `{"rate": 4.45}`          | Kadar tukar USD ke MYR            |
| `markup_ai_pct`        | `{"pct": 300}`            | Markup AI (%)                     |
| `markup_ocr_pct`       | `{"pct": 500}`            | Markup OCR (%)                    |
| `avg_ai_cost_usd`      | `{"cost": 0.002}`         | Kos purata AI per call (USD)      |
| `avg_ocr_cost_usd`     | `{"cost": 0.001}`         | Kos purata OCR per page (USD)     |
| `credit_per_ai_call`   | `{"credits": 1}`          | Kredit tolak per panggilan AI     |
| `credit_per_ocr_page`  | `{"credits": 1}`          | Kredit tolak per halaman OCR      |
| `min_charge_ai_myr`    | `{"myr": 0.01}`           | Caj minimum AI (MYR)              |
| `min_charge_ocr_myr`   | `{"myr": 0.005}`          | Caj minimum OCR (MYR)             |
| `rounding_rule`        | `{"rule": "ceil"}`        | Peraturan pembundaran             |
| `free_allowance_ai`    | `{"credits": 0}`          | Elaun percuma AI                  |
| `promo_multiplier_ai`  | `{"multiplier": 1.0}`     | Pengganda promosi AI              |

---

## 5. ALIRAN DATA YANG DILULUSKAN

```
Upload fail  →  logStorageLedgerEntry()  →  resource_wallet_transactions (STORAGE, USAGE)
Padam fail   →  logStorageLedgerEntry()  →  resource_wallet_transactions (STORAGE, REFUND)

Panggilan AI  →  server.ts  →  consume_resource_credit_v2()  →  resource_wallet_transactions (AI, USAGE)
Panggilan OCR →  server.ts  →  consume_resource_credit_v2()  →  resource_wallet_transactions (OCR, USAGE)

HQ Cost Center  →  get_hq_resource_profit_summary()  →  commercial_config_items (kadar)
                                                      →  resource_wallet_transactions (kiraan)

Tenant Ledger   →  get_tenant_resource_ledger()  →  resource_wallet_transactions

HQ Storage      →  get_hq_storage_ledger_summary()  →  resource_wallet_transactions
```

---

## 6. PERATURAN KESELAMATAN

- Semua RPC adalah `SECURITY DEFINER` dengan `SET search_path = public`
- HQ-only RPCs disemak dengan `is_hq_user()` dalam RLS
- Tenant data diasingkan dengan `workspace_id` — tiada cross-tenant access
- `commercial_config_items` hanya boleh ditulis oleh HQ melalui dual-approval process

---

## 7. LARANGAN MUTLAK

1. **DILARANG** mencipta ledger kedua untuk mana-mana jenis kredit
2. **DILARANG** mencipta fungsi consume kredit selain `consume_resource_credit_v2`
3. **DILARANG** membaca kadar billing dari `ai_cost_rates` untuk pengiraan aktif
4. **DILARANG** hardcode nilai kadar dalam TypeScript / server code
5. **DILARANG** mengubah skema `resource_wallets` atau `resource_wallet_transactions` tanpa kelulusan
6. **DILARANG** mencipta jadual konfigurasi baharu selain `commercial_config_items`
7. **DILARANG** mengubah document ini tanpa kelulusan eksplisit pemilik produk

---

*Dokumen ini LOCKED. Versi 1.0 diluluskan oleh pemilik produk.*
