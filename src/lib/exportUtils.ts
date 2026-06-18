import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface ExportColumn {
  key: string;
  label: string;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function exportToCSV(rows: Record<string, unknown>[], columns: ExportColumn[], filename: string) {
  const header = columns.map(c => csvEscape(c.label)).join(",");
  const lines = rows.map(row => columns.map(c => csvEscape(row[c.key])).join(","));
  const csv = [header, ...lines].join("\r\n");
  triggerDownload(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), filename);
}

export function exportToJSON(rows: Record<string, unknown>[], filename: string, meta?: Record<string, unknown>) {
  const payload = meta ? { ...meta, rows } : rows;
  triggerDownload(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), filename);
}

export function exportToExcel(rows: Record<string, unknown>[], columns: ExportColumn[], filename: string) {
  const headerCells = columns.map(c => `<th>${c.label}</th>`).join("");
  const bodyRows = rows
    .map(row => `<tr>${columns.map(c => `<td>${row[c.key] ?? ""}</td>`).join("")}</tr>`)
    .join("");
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
  <head><meta charset="utf-8" /><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Sheet1</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>
  <body><table border="1"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></body></html>`;
  triggerDownload(new Blob([html], { type: "application/vnd.ms-excel" }), filename);
}

export function exportToPDF(rows: Record<string, unknown>[], columns: ExportColumn[], filename: string, title: string) {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  autoTable(doc, {
    startY: 22,
    head: [columns.map(c => c.label)],
    body: rows.map(row => columns.map(c => String(row[c.key] ?? ""))),
    styles: { fontSize: 8 },
  });
  doc.save(filename);
}
