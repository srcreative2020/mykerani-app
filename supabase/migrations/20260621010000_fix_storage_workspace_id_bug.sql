-- ============================================================================
-- MYKERANI Database Hardening Migration Script
-- Module: Fix storage.objects evidence-packages policies comparing against
--         the new row's own random id instead of my_workspace_ids() output
-- Created At: 2026-06-21
-- Description: tenant_upload_own / tenant_read_own / tenant_delete_own on
--              storage.objects (bucket "evidence-packages") all contained:
--                (storage.foldername(name))[1] IN (
--                  SELECT (objects.id)::text FROM my_workspace_ids() ...
--                )
--              The subquery selected objects.id (the freshly generated random
--              UUID of the row being checked) instead of the workspace UUIDs
--              actually returned by my_workspace_ids(). Since a new object's
--              id is unrelated to its path's workspace folder, the IN clause
--              was effectively always false. So document uploads to this
--              bucket ALWAYS failed RLS, even for a real (non-mock), correctly
--              tenant-scoped Supabase Auth user — root cause of the upload
--              still failing for owner@mykerani.my after the
--              evidence_documents table policies and get_tenant_id()/
--              get_user_role() JWT-staleness fixes (both of which were
--              necessary but not sufficient, since the storage upload step
--              runs before the evidence_documents insert and was blocking
--              first). Fixed to correctly select the workspace ids
--              themselves.
-- ============================================================================

DROP POLICY IF EXISTS tenant_upload_own ON storage.objects;
DROP POLICY IF EXISTS tenant_read_own ON storage.objects;
DROP POLICY IF EXISTS tenant_delete_own ON storage.objects;

CREATE POLICY tenant_upload_own ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'evidence-packages'
        AND (storage.foldername(name))[1] IN (SELECT my_workspace_ids()::text)
    );

CREATE POLICY tenant_read_own ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'evidence-packages'
        AND (
            (storage.foldername(name))[1] IN (SELECT my_workspace_ids()::text)
            OR is_hq_user()
        )
    );

CREATE POLICY tenant_delete_own ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'evidence-packages'
        AND (storage.foldername(name))[1] IN (SELECT my_workspace_ids()::text)
    );
