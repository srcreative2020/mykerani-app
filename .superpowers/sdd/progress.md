# MyKerani Tenant Ecosystem Remediation — Progress Ledger

**Branch start commit:** b03faa4da5864d7777e2938533d731bc24d13a2d
**Branch:** main
**Started:** 2026-06-25

## Task Status

- [ ] Task 1: DB Migration — RLS for personal_profiles, vehicles, dependents, businesses, business_branches + asset_owner tables
- [ ] Task 2: DB Migration — Tenant Activity Center (pending_tenant_actions table + RPCs + notifications)
- [ ] Task 3: DB Migration — Asset Purchases & Owner Transactions to Supabase (remove localStorage-only)
- [ ] Task 4: DB Migration — Staff financial operation notifications to Owner + audit writes
- [ ] Task 5: DB Migration — HQ wallet adjustment → tenant notification (C-01 fix)
- [ ] Task 6: Service layer — assetOwnerData.ts migrated to Supabase
- [ ] Task 7: Service layer — Staff resource credit enforcement (aiCredits hooks in StaffHomeScreen)
- [ ] Task 8: UI — Staff Approval Chain + Owner Review UI (C-02 fix)
- [ ] Task 9: UI — Staff Resource Wallet Visibility (C-03 fix)
- [ ] Task 10: UI — Tenant Activity Center UI in OwnerDashboard (C-04 fix)
- [ ] Task 11: UI — Audit writes for Staff financial operations (H-08 fix)
- [ ] Task 12: UI — Duplicate detection for Staff records (M-01 fix)
- [ ] Task 13: UI — Support ticket attachment upload in Owner + Staff UI (H-02 fix)
- [ ] Task 14: UI — Tenant My Account 360 view (H-04 fix)
- [ ] Task 15: UI — StorageBar for StaffHomeScreen (L-05 fix)
- [ ] Task 16: UI — Staff profile view (personal profile + businesses) (L-01 fix)
- [ ] Task 17: Service — NotificationContext check preferences before inserting (M-08 fix)
- [ ] Task 18: Service — duplicate_flags.reviewed_by_user_id set on review (L-04 fix)
- [ ] Task 19: Service — event_logs for Staff actions (M-03 fix)
- [ ] Task 20: Misc fixes — workspace_type set in WorkspaceContext, chat session archival on workspace switch

## Notes

- Governance: MYKERANI_TENANT_ECOSYSTEM_GOVERNANCE_PRINCIPLE.md, MYKERANI_OWNER_STAFF_PARITY_RULE.md, MYKERANI_GOVERNANCE_EXTENSION.md
- Tech stack: React + Supabase + TypeScript + Vite
- Verification: npx tsc --noEmit -p . then npm run build (must not increase error count)
