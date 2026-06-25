// supplierMatching.ts — Supplier name matching for AI suggestions
// Pure function, same pattern as customerMatching.ts / businessMatching.ts
// Used post-LLM to pre-fill supplierId on payable suggestions

import type { Supplier } from "./profileData";

function normalizeForMatch(s: string): string {
  return (s || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fuzzyNameInText(name: string, text: string): boolean {
  const n = normalizeForMatch(name);
  const t = normalizeForMatch(text);
  if (!n || !t) return false;
  if (n.length < 2) return false;
  if (t.includes(n)) return true;
  const MIN_OVERLAP = 4;
  const MAX_TRUNCATION = 3;
  if (n.length >= MIN_OVERLAP && t.length >= MIN_OVERLAP) {
    if (t.startsWith(n.substring(0, n.length - MAX_TRUNCATION))) return true;
    if (n.startsWith(t.substring(0, t.length - MAX_TRUNCATION))) return true;
  }
  return false;
}

export function matchSupplier(
  text: string,
  suppliers: Supplier[]
): Supplier | undefined {
  if (!suppliers.length || !text) return undefined;
  const active = suppliers.filter(s => s.isActive !== false);
  for (const s of active) {
    if (fuzzyNameInText(s.name, text)) return s;
  }
  return undefined;
}