// customerMatching.ts — Customer name matching for AI suggestions
// Pure function, same pattern as businessMatching.ts matchOwnBusiness
// Used post-LLM to pre-fill customerId on receivable suggestions

import type { Customer } from "./profileData";

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

export function matchCustomer(
  text: string,
  customers: Customer[]
): Customer | undefined {
  if (!customers.length || !text) return undefined;
  const active = customers.filter(c => c.isActive !== false);
  for (const c of active) {
    if (fuzzyNameInText(c.name, text)) return c;
  }
  return undefined;
}