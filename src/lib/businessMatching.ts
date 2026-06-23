// Single source of truth for matching free-text transaction descriptions
// (bank statement lines, OCR merchant/vendor names, AI Chat / voice note
// text) against the user's own registered businesses and branches.
//
// Used identically by: Bank Statement import, OCR Receipt/Invoice review,
// and AI Chat transaction confirmation in both OwnerDashboard.tsx and
// StaffHomeScreen.tsx (Owner-Staff Parity Rule). Do not duplicate this
// logic anywhere else — extend this file instead.

export type Business = { id: string; businessName: string; isActive?: boolean };
export type BusinessBranch = { id: string; businessId: string; branchName: string; isActive?: boolean };

export type BranchMatchResult = {
  business: Business;
  branch?: BusinessBranch;
  ambiguous: boolean;
  candidateLabels: string[];
};

export const normalizeForMatch = (s: string) =>
  s.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

// Legal-entity suffixes that appear on registered business names but are
// almost never spoken/typed/printed by counterparties on receipts, invoices,
// bank statements, or in chat — e.g. "SULAIMAN & ROKIAH ENTERPRISE" is
// referred to in the wild as just "SULAIMAN ROKIAH" or its brand/branch name.
const LEGAL_SUFFIXES = ["SDN BHD", "SDN", "BHD", "ENTERPRISE", "RESOURCES", "TRADING", "PLT"];

const stripLegalSuffixes = (normName: string): string => {
  let out = normName;
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of LEGAL_SUFFIXES) {
      if (out === suffix) continue;
      if (out.endsWith(` ${suffix}`)) {
        out = out.slice(0, -(suffix.length + 1)).trim();
        changed = true;
      }
    }
  }
  return out;
};

// Tolerates truncated names — bank statements/OCR frequently cut off the
// last few characters of a long name (e.g. "SERVIC*" for "SERVICE", or
// "SR CREATIVE PRI" for "SR CREATIVE PRINT"). Beyond exact substring
// containment, allow either side to match on a prefix of the other as long
// as at least `MIN_OVERLAP` characters and no more than `MAX_TRUNCATION`
// trailing characters are missing.
const MIN_OVERLAP = 4;
const MAX_TRUNCATION = 3;

const fuzzyNameInText = (normText: string, normName: string): boolean => {
  if (normName.length < 3 || !normText) return false;
  if (normText.includes(normName) || normName.includes(normText)) return true;
  for (let cut = 1; cut <= MAX_TRUNCATION; cut++) {
    const truncated = normName.slice(0, normName.length - cut);
    if (truncated.length < MIN_OVERLAP) break;
    if (normText.includes(truncated)) return true;
  }
  for (let cut = 1; cut <= MAX_TRUNCATION; cut++) {
    const truncated = normText.slice(0, normText.length - cut);
    if (truncated.length < MIN_OVERLAP) break;
    if (normName.includes(truncated)) return true;
  }
  return false;
};

const namesMatch = (normDesc: string, rawName: string): boolean => {
  const normName = normalizeForMatch(rawName || "");
  if (normName.length < 3) return false;
  if (fuzzyNameInText(normDesc, normName)) return true;
  const stripped = stripLegalSuffixes(normName);
  if (stripped.length >= 3 && stripped !== normName && fuzzyNameInText(normDesc, stripped)) return true;
  return false;
};

export const matchOwnBusiness = (description: string, ownBusinesses: Business[]): Business | undefined => {
  const normDesc = normalizeForMatch(description);
  if (!normDesc) return undefined;
  return ownBusinesses.find((b) => namesMatch(normDesc, b.businessName || ""));
};

// Branch / brand names are how counterparties actually refer to a business
// in the wild (e.g. "KILANG CETAK SR", a branch of "SULAIMAN & ROKIAH
// ENTERPRISE") — so branch matching runs FIRST, across every registered
// business's branches, with no requirement that the parent legal business
// name appear anywhere in the text. Only when no branch matches at all do
// we fall back to matching the business name itself.
export const matchOwnBusinessAndBranch = (
  description: string,
  ownBusinesses: Business[],
  branchesByBusinessId: Record<string, BusinessBranch[]>
): BranchMatchResult | undefined => {
  const normDesc = normalizeForMatch(description);
  if (!normDesc) return undefined;

  const branchHits: { business: Business; branch: BusinessBranch }[] = [];
  for (const business of ownBusinesses) {
    const branches = (branchesByBusinessId[business.id] || []).filter((br) => br.isActive !== false);
    for (const branch of branches) {
      if (namesMatch(normDesc, branch.branchName || "")) {
        branchHits.push({ business, branch });
      }
    }
  }

  if (branchHits.length === 1) {
    const { business, branch } = branchHits[0];
    return { business, branch, ambiguous: false, candidateLabels: [] };
  }
  if (branchHits.length > 1) {
    return {
      business: branchHits[0].business,
      ambiguous: true,
      candidateLabels: branchHits.map((hit) => hit.branch.branchName),
    };
  }

  const business = matchOwnBusiness(description, ownBusinesses);
  if (!business) return undefined;
  return { business, ambiguous: false, candidateLabels: [] };
};
