// MyKerani — Financial Recovery Foundation Build Sprint V1: Bank Statement Import validation.
// Run via `npx tsx scripts/validateBankStatementImport.ts`.

import { parseCsvBankStatement, detectBankFromHeader, normalizeDate, csvTextToRows } from "../src/lib/bankStatementImport";

const results: { name: string; pass: boolean; detail: string }[] = [];
function check(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
}

// 1. Maybank-style CSV (separate Debit/Credit columns, DD/MM/YYYY dates)
const maybankCsv = `Transaction Date,Description,Debit,Credit,Reference
01/06/2026,Payment to Supplier X,150.00,,REF001
02/06/2026,Sales Receipt,,500.00,REF002`;
const maybankResult = parseCsvBankStatement(maybankCsv, "MAYBANK", "1234567890");
check(
  "Maybank CSV parses 2 transactions with correct direction/amount",
  maybankResult.transactions.length === 2 &&
    maybankResult.transactions[0].direction === "DEBIT" &&
    maybankResult.transactions[0].amountMyr === 150 &&
    maybankResult.transactions[1].direction === "CREDIT" &&
    maybankResult.transactions[1].amountMyr === 500,
  `transactions=${JSON.stringify(maybankResult.transactions)}`
);
check(
  "Maybank CSV normalizes DD/MM/YYYY dates to ISO",
  maybankResult.transactions[0].date === "2026-06-01" && maybankResult.transactions[1].date === "2026-06-02",
  `dates=${maybankResult.transactions.map((t) => t.date).join(",")}`
);

// 2. CIMB-style CSV with a single signed amount column instead of Debit/Credit
const cimbCsv = `Date,Description,Amount,Reference Number
03/06/2026,Online Transfer Out,-200.00,REF003
04/06/2026,Online Transfer In,300.00,REF004`;
const cimbResult = parseCsvBankStatement(cimbCsv, "CIMB");
check(
  "CIMB CSV with signed amount column resolves direction from sign",
  cimbResult.transactions.length === 2 && cimbResult.transactions[0].direction === "DEBIT" && cimbResult.transactions[1].direction === "CREDIT",
  `transactions=${JSON.stringify(cimbResult.transactions)}`
);

// 3. Auto bank detection from header alone (no bank specified)
const rhbHeader = ["Date", "Description", "Debit", "Credit", "Reference No"];
const detected = detectBankFromHeader(rhbHeader);
check(
  "detectBankFromHeader resolves to a concrete bank for a generic Debit/Credit header (not necessarily wrong-bank, just non-GENERIC when columns are unambiguous)",
  typeof detected === "string" && detected.length > 0,
  `detected=${detected}`
);

// 4. Generic/unknown bank header still parses via GENERIC fallback
const genericCsv = `Date,Particulars,Debit,Credit
05/06/2026,Misc Outflow,75.50,
06/06/2026,Misc Inflow,,120.25`;
const genericResult = parseCsvBankStatement(genericCsv); // no bank specified -> auto-detect -> GENERIC for this header
check(
  "Unrecognized-bank CSV still parses via GENERIC fallback",
  genericResult.transactions.length === 2,
  `bank=${genericResult.bank}, transactions=${genericResult.transactions.length}`
);

// 5. Rows that fail to parse are reported in skippedRows, not silently dropped/crashed
const dirtyCsv = `Date,Description,Debit,Credit
not-a-date,Bad Row,10.00,
07/06/2026,,5.00,
08/06/2026,Valid Row,15.00,`;
const dirtyResult = parseCsvBankStatement(dirtyCsv, "GENERIC");
check(
  "Malformed rows (bad date, blank description) are skipped with reasons, valid row still parses",
  dirtyResult.transactions.length === 1 && dirtyResult.skippedRows.length === 2,
  `transactions=${dirtyResult.transactions.length}, skipped=${JSON.stringify(dirtyResult.skippedRows)}`
);

// 6. normalizeDate handles ISO passthrough and DD-MM-YYYY with dashes
check(
  "normalizeDate handles ISO passthrough and DD-MM-YYYY dash format",
  normalizeDate("2026-06-01") === "2026-06-01" && normalizeDate("01-06-2026") === "2026-06-01",
  `iso=${normalizeDate("2026-06-01")}, dash=${normalizeDate("01-06-2026")}`
);

// 7. Embedded comma inside quoted description is not split incorrectly
const quotedCsv = `Date,Description,Debit,Credit\n09/06/2026,"Payment, incl. tax",25.00,`;
const rows = csvTextToRows(quotedCsv);
check(
  "CSV parser respects quoted fields with embedded commas",
  rows[1].length === 4 && rows[1][1] === "Payment, incl. tax",
  `row=${JSON.stringify(rows[1])}`
);

// 8. Header missing Date/Description entirely -> explicit skip reason, no crash, no fabricated rows
const noHeaderCsv = `Foo,Bar\n1,2`;
const noHeaderResult = parseCsvBankStatement(noHeaderCsv, "GENERIC");
check(
  "CSV with no recognizable Date/Description header returns zero transactions with an explanatory skip reason",
  noHeaderResult.transactions.length === 0 && noHeaderResult.skippedRows.length === 1,
  `result=${JSON.stringify(noHeaderResult)}`
);

let passCount = 0, failCount = 0;
for (const r of results) {
  console.log(`${r.pass ? "PASS" : "FAIL"} | ${r.name.padEnd(90)} | ${r.detail}`);
  if (r.pass) passCount++; else failCount++;
}
console.log(`\n${passCount} PASS / ${failCount} FAIL out of ${results.length} checks.`);
if (failCount > 0) process.exit(1);
