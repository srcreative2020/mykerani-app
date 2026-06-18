-- Module 7: RLS Policy Fix
-- Root cause confirmed live: financial_evidence_packages policies depend
-- solely on get_tenant_id() (JWT user_metadata.tenantId custom claim) with
-- no fallback. Any user whose JWT lacks/has-stale tenantId is blocked
-- outright ("new row violates row-level security policy"), even though
-- they have a valid user_role_assignments membership. The storage.objects
-- layer already has two policy sets; the newer one (insert/select/update/
-- delete_evidence_policy) compares workspaces.name via split_part instead
-- of the uploaded object's own path, which can never match a real workspace
-- name — it is dead weight masked only because the older tenant_upload_own/
-- tenant_read_own/tenant_delete_own policies (using my_workspace_ids() +
-- storage.foldername) already grant access via OR semantics. We add a
-- robust auth.uid()-based fallback policy at the table level (mirroring the
-- storage-layer pattern) and drop the broken/redundant storage policies.

-- 1) Backfill stale/missing tenantId in JWT custom claims from the
--    authoritative user_role_assignments table (one-time data fix; this
--    does not bypass any policy, it fixes the underlying data the existing
--    get_tenant_id() policies were always meant to rely on).
update auth.users u
set raw_user_meta_data = jsonb_set(coalesce(raw_user_meta_data, '{}'::jsonb), '{tenantId}', to_jsonb(ura.tenant_id::text))
from user_role_assignments ura
where ura.user_id = u.id::text
  and (u.raw_user_meta_data->>'tenantId') is null;

-- 2) Add a fallback table-level policy on financial_evidence_packages using
--    the robust auth.uid()-based my_workspace_ids() (same invariant already
--    trusted at the storage layer) so a stale/missing JWT custom claim can
--    no longer outright block a legitimate workspace member.
drop policy if exists financial_evidence_packages_fallback_policy on financial_evidence_packages;
create policy financial_evidence_packages_fallback_policy
  on financial_evidence_packages
  as permissive
  for all
  using (workspace_id in (select my_workspace_ids()))
  with check (workspace_id in (select my_workspace_ids()));

-- 3) Drop the broken/redundant storage.objects policies that compare
--    workspaces.name instead of the uploaded object's own path — the
--    older tenant_upload_own/tenant_read_own/tenant_delete_own policies
--    already correctly grant the same access via storage.foldername(name).
drop policy if exists insert_evidence_policy on storage.objects;
drop policy if exists select_evidence_policy on storage.objects;
drop policy if exists update_evidence_policy on storage.objects;
drop policy if exists delete_evidence_policy on storage.objects;
