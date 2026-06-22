# MyKerani Report Stack — Visibility & Accessibility Audit V1

**Scope:** This audit checks ONLY visibility/accessibility (component existence,
registration, UI reachability, real-vs-placeholder data, navigation path). It
does NOT re-audit calculation logic — that was covered by
`MYKERANI_REPORT_STACK_READINESS_V1.md`.

**Method:** Static code read of `src/components/FinancialReportsAnalytics.tsx`
(nav buttons, `selectedReport` state, title block, content render blocks),
its 3 mount points (`OwnerDashboard.tsx`, `MyKeraniAppTabs.tsx`,
`FinancialRecordsConsole.tsx`), and the lib modules each report calls.

---

## 1. Profit & Loss

| Q | Answer |
|---|---|
| A. Component wujud? | **Ya** — `src/components/ProfitLossReport.tsx`. |
| B. Register dalam FinancialReportsAnalytics? | **Ya** — `selectedReport === "profit_loss"`, content block `FinancialReportsAnalytics.tsx:1617-1624`. |
| C. Tab/menu boleh diakses user? | **Ya** — nav button `id="nav_report_profit_loss"` (`:607-613`), label "9. Penyata Untung Rugi (Profit & Loss Statement)". |
| D. Data sebenar atau placeholder? | **Data sebenar** — props `financialEvents`, `financialEvidencePackages` dihantar terus dari `useFinancials()` context, tiada mock/hardcode. |
| E. Boleh dibuka melalui UI tanpa edit code? | **Ya.** |
| F. Navigation path | `Dashboard → Laporan (tab bawah) → klik "9. Penyata Untung Rugi" (top nav dalam skrin Laporan) → Report` |

## 2. Balance Sheet

| Q | Answer |
|---|---|
| A. Component wujud? | **Ya** — `src/components/BalanceSheetReport.tsx`. |
| B. Register dalam FinancialReportsAnalytics? | **Ya** — `selectedReport === "balance_sheet"`, content block `:1626-1639`. |
| C. Tab/menu boleh diakses user? | **Ya** — nav button `id="nav_report_balance_sheet"` (`:622-628`), label "10. Kunci Kira-Kira (Balance Sheet Statement)". |
| D. Data sebenar atau placeholder? | **Data sebenar** — props `financialEvents`, `cashAccounts`, `bankAccounts`, `debtRecords`, `financialCommitments`, `financialEvidencePackages` semua dari context (selepas P0 fix, cash/bank accounts kini turut dihantar). |
| E. Boleh dibuka melalui UI tanpa edit code? | **Ya.** |
| F. Navigation path | `Dashboard → Laporan → klik "10. Kunci Kira-Kira" → Report` |

## 3. Cash Flow

| Q | Answer |
|---|---|
| A. Component wujud? | **Ya** — `src/components/CashFlowReport.tsx`. |
| B. Register dalam FinancialReportsAnalytics? | **Ya** — `selectedReport === "cash_flow_v1"`, content block `:1641-1652`. |
| C. Tab/menu boleh diakses user? | **Ya** — nav button `id="nav_report_cash_flow_v1"` (`:637-643`), label "11. Penyata Aliran Tunai (Cash Flow Statement)". |
| D. Data sebenar atau placeholder? | **Data sebenar** — props `financialEvents`, `debtRecords`, `financialCommitments`, `financialEvidencePackages` dari context; `assetPurchases`/`ownerTransactions` di-load sendiri via `loadAssetPurchases`/`loadOwnerTransactions`. |
| E. Boleh dibuka melalui UI tanpa edit code? | **Ya.** |
| F. Navigation path | `Dashboard → Laporan → klik "11. Penyata Aliran Tunai" → Report` |

> **Nota:** Ada juga laporan sedia-ada bernama "2. Laporan Kedudukan Aliran
> Tunai Selesa (Cashflow Matrix)" (`selectedReport === "cashflow"`,
> `id="nav_report_cashflow"`) — ini adalah laporan cashflow versi lama/asal,
> **bukan** `CashFlowReport.tsx` (Cash Flow V1 sprint ini). Kedua-dua wujud
> serentak sebagai tab berasingan (#2 lama, #11 baharu) — tidak digantikan,
> tidak konflik, tetapi user akan nampak dua "Cash Flow" yang berlainan dalam
> menu.

## 4. Financial Health

| Q | Answer |
|---|---|
| A. Component wujud? | **Sebahagian.** Tiada component UI baharu — "Financial Health V1" sprint ini hanya menghasilkan fungsi lib `computeFinancialHealthV1()` (`src/lib/financialHealth.ts`), sengaja dibina sebagai wrapper additif, BUKAN component/tab baharu (sebab tab "Skor Kesihatan" sedia wujud). |
| B. Register dalam FinancialReportsAnalytics? | **Tidak untuk V1 wrapper.** `computeFinancialHealthV1` tidak diimport/dipanggil di mana-mana `.tsx` (disahkan via grep — sifar hasil). Hanya `computeFinancialHealthScoring` (fungsi asal, pra-sprint ini) yang digunakan dalam tab "health" (`:265`). |
| C. Tab/menu boleh diakses user? | **Ya, untuk tab asal sahaja** — nav button `id="nav_report_health"` (`:562-568`), label "6. Skor Kesihatan Syarikat & Ramalan Jangka Kelangsungan". Sub-metrik baharu V1 (Evidence Coverage %, Data Completeness %) **tidak ada di mana-mana UI**. |
| D. Data sebenar atau placeholder? | Tab sedia-ada (solvency/quick ratio/runway): **data sebenar**. Sub-metrik V1 baharu: **tidak dipaparkan — bukan placeholder, hanya belum wired**. |
| E. Boleh dibuka melalui UI tanpa edit code? | **Ya untuk skor asas; Tidak untuk Evidence Coverage % / Data Completeness %** — perlu tambah UI rendering dahulu. |
| F. Navigation path (tab asas) | `Dashboard → Laporan → klik "6. Skor Kesihatan" → Report` (skor asas sahaja, tiada Evidence Coverage/Data Completeness) |

## 5. Loan Readiness

| Q | Answer |
|---|---|
| A. Component wujud? | **Ya** (sebagai logik, bukan component berasingan) — `src/lib/loanReadiness.ts`, `computeLoanReadiness()`. |
| B. Register dalam FinancialReportsAnalytics? | **Ya** — diimport (`:32`) dan dipanggil dalam `useMemo` (`:301`), hasilnya `bankReadiness`. |
| C. Tab/menu boleh diakses user? | **Ya** — nav button `id="nav_report_bank_readiness"` (`:592-598`), label "8. Senarai Semak Kesediaan Pembiayaan/Pinjaman". |
| D. Data sebenar atau placeholder? | **Data sebenar** — disahkan content block `selectedReport === "bank_readiness"` (`:1568+`) memaparkan `bankReadiness.checks[].label/.detail/.pass` terus dari fungsi sebenar, tiada hardcode. |
| E. Boleh dibuka melalui UI tanpa edit code? | **Ya.** |
| F. Navigation path | `Dashboard → Laporan → klik "8. Senarai Semak Kesediaan Pembiayaan" → Report` |

## 6. LHDN Readiness

| Q | Answer |
|---|---|
| A. Component wujud? | **Ya** (sebagai logik) — `src/lib/lhdnReadiness.ts`, `computeLhdnReadiness()`. |
| B. Register dalam FinancialReportsAnalytics? | **Ya** — diimport (`:33`) dan dipanggil dalam `useMemo` (`:291`), hasilnya `taxReadiness`. |
| C. Tab/menu boleh diakses user? | **Ya** — nav button `id="nav_report_tax_readiness"` (`:577-583`), label "7. Senarai Semak Kesediaan Cukai LHDN". |
| D. Data sebenar atau placeholder? | **Data sebenar** — disahkan content block `selectedReport === "tax_readiness"` (`:1520-1566`) memaparkan `taxReadiness.checks[].label/.detail/.pass` dan `scorePct`/`scoreGrade` terus dari fungsi sebenar. |
| E. Boleh dibuka melalui UI tanpa edit code? | **Ya.** |
| F. Navigation path | `Dashboard → Laporan → klik "7. Senarai Semak Kesediaan Cukai LHDN" → Report` |

---

## Navigation Path (umum, semua 11 report tab dalam skrin Laporan)

```
Dashboard (OwnerDashboard.tsx, bottom nav)
  → "Laporan" (activeTab === "reports", id="owner_reports_pane")
  → FinancialReportsAnalytics (top nav buttons, id="nav_report_<nama>")
  → Report (content block, id="report_<nama>_view")
```

3 laluan berbeza ke `FinancialReportsAnalytics` wujud dalam codebase (semua
membawa ke skrin Laporan yang sama):

| Laluan | Mount point | Tab label |
|---|---|---|
| TENANT_OWNER (laluan utama) | `OwnerDashboard.tsx:2605` | "Laporan" (bottom nav) |
| MyKerani consumer/legacy tabs | `MyKeraniAppTabs.tsx:285` | "💡 Insights" |
| Financial Records Console (deep nav) | `FinancialRecordsConsole.tsx:2015` | sub-tab "reports" di dalam console |

Screenshot belum diambil sesi ini (audit kod statik sahaja, bukan run app) —
jika diperlukan, boleh jalankan skill `/run` untuk log masuk dan screenshot
setiap path di atas.

---

## G. Report yang SUDAH boleh digunakan user sekarang

1. **Profit & Loss** — penuh, data sebenar, accessible.
2. **Balance Sheet** — penuh, data sebenar (selepas P0 fix cash/bank), accessible.
3. **Cash Flow V1** — penuh, data sebenar, accessible.
4. **Loan Readiness** — penuh, data sebenar, accessible (sebagai tab "8. Senarai Semak Kesediaan Pembiayaan/Pinjaman").
5. **LHDN Readiness** — penuh, data sebenar, accessible (sebagai tab "7. Senarai Semak Kesediaan Cukai LHDN").
6. **Financial Health (skor asas)** — accessible (tab "6. Skor Kesihatan"), tapi ini versi ASAL (solvency/quick ratio/runway sahaja).

Kesemua 6 di atas boleh dibuka oleh user sekarang **tanpa edit code**.

## H. Report yang sudah siap code tetapi BELUM dipaparkan dalam UI

1. **Financial Health V1 sub-metrics** (`computeFinancialHealthV1()` —
   Evidence Coverage % dan Data Completeness %) — fungsi lib sudah siap dan
   diverifikasi (`validateFinancialHealth.ts`: 28/28 PASS), tetapi **tidak
   dipanggil oleh mana-mana `.tsx`** dan tidak ada UI rendering untuk 2
   sub-metrik baharu ini. Tab "6. Skor Kesihatan" sedia ada hanya memaparkan
   skor asas (`computeFinancialHealthScoring`), bukan versi V1.

Tiada lagi item lain dalam senarai ini — semua component/fungsi lib sprint
ini (Balance Sheet, Cash Flow V1, Loan Readiness, LHDN Readiness) sudah
sepenuhnya wired ke UI.
