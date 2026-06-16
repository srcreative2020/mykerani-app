-- ============================================================================
-- MYKERANI Migration v1.0 — STORAGE ONLY
-- Generated: 2026-06-16
-- Description: Storage bucket creation + storage.objects RLS policies.
--              Jalankan fail ini SELEPAS mykerani_migration_main.sql berjaya.
--              Mesti dijalankan sebagai superuser atau service_role.
--
-- CARA JALANKAN DI SUPABASE:
--   Pergi ke: Storage > Policies (atau SQL Editor dengan service_role)
--   Atau gunakan Supabase Dashboard > Storage untuk buat bucket secara manual,
--   kemudian jalankan hanya bahagian CREATE POLICY di bawah.
-- ============================================================================


-- ============================================================================
-- BAHAGIAN A: STORAGE BUCKET
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'evidence-packages',
    'evidence-packages',
    false,
    10485760,
    ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf', 'text/csv']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf', 'text/csv'];


-- ============================================================================
-- BAHAGIAN B: ENABLE RLS
-- ============================================================================

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- BAHAGIAN C: DROP STALE POLICIES (idempotent)
-- ============================================================================

DROP POLICY IF EXISTS "select_evidence_policy" ON storage.objects;
DROP POLICY IF EXISTS "insert_evidence_policy" ON storage.objects;
DROP POLICY IF EXISTS "update_evidence_policy" ON storage.objects;
DROP POLICY IF EXISTS "delete_evidence_policy" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated select for owned tenant workspaces" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated insert for owned tenant workspaces" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated update for owned tenant workspaces" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete for owned tenant workspaces" ON storage.objects;


-- ============================================================================
-- BAHAGIAN D: CREATE RLS POLICIES UNTUK storage.objects
-- ============================================================================

CREATE POLICY "select_evidence_policy" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'evidence-packages' AND
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id::text = split_part(name, '/', 1)
              AND (workspaces.tenant_id = public.get_tenant_id() OR public.get_user_role() = 'HQ_ADMIN')
        )
    );

CREATE POLICY "insert_evidence_policy" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'evidence-packages' AND
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id::text = split_part(name, '/', 1)
              AND (workspaces.tenant_id = public.get_tenant_id() OR public.get_user_role() = 'HQ_ADMIN')
        )
    );

CREATE POLICY "update_evidence_policy" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'evidence-packages' AND
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id::text = split_part(name, '/', 1)
              AND (workspaces.tenant_id = public.get_tenant_id() OR public.get_user_role() = 'HQ_ADMIN')
        )
    )
    WITH CHECK (
        bucket_id = 'evidence-packages' AND
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id::text = split_part(name, '/', 1)
              AND (workspaces.tenant_id = public.get_tenant_id() OR public.get_user_role() = 'HQ_ADMIN')
        )
    );

CREATE POLICY "delete_evidence_policy" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'evidence-packages' AND
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id::text = split_part(name, '/', 1)
              AND (workspaces.tenant_id = public.get_tenant_id() OR public.get_user_role() = 'HQ_ADMIN')
        )
    );
