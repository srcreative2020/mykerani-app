-- ============================================================================
-- MYKERANI Database Hardening Migration Script
-- Module: Storage Security Hardening (Supabase Storage)
-- Created At: 2026-06-11
-- Description: Establishes a highly secure, private storage bucket for
--              financial evidence. Implements strict row-level security (RLS)
--              policies on `storage.objects` to enforce tenant and workspace
--              isolation, and limits upload, download, and delete access.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SECURE STORAGE BUCKET CREATION & CONFIGURATION
-- ----------------------------------------------------------------------------

-- Enforce and guarantee the 'evidence-packages' bucket is private and secured in storage.buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'evidence-packages', 
    'evidence-packages', 
    false, -- SECURE BUCKET: Must be private (public = false) - files can only be accessed via signed URLs or authenticated requests
    10485760, -- Hard size limit of 10MB (10 * 1024 * 1024 bytes)
    ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf', 'text/csv'] -- Restricted and audited file formats
)
ON CONFLICT (id) DO UPDATE 
SET public = false, 
    file_size_limit = 10485760, 
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf', 'text/csv'];


-- ----------------------------------------------------------------------------
-- 2. HARDEN storage.objects ROW LEVEL SECURITY (RLS)
-- ----------------------------------------------------------------------------

-- Ensure RLS is active on the storage tables
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;


-- ----------------------------------------------------------------------------
-- 3. DROP OVERLAPPING & STALE STORAGE POLICIES
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "select_evidence_policy" ON storage.objects;
DROP POLICY IF EXISTS "insert_evidence_policy" ON storage.objects;
DROP POLICY IF EXISTS "update_evidence_policy" ON storage.objects;
DROP POLICY IF EXISTS "delete_evidence_policy" ON storage.objects;

DROP POLICY IF EXISTS "Allow authenticated select for owned tenant workspaces" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated insert for owned tenant workspaces" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated update for owned tenant workspaces" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete for owned tenant workspaces" ON storage.objects;


-- ----------------------------------------------------------------------------
-- 4. IMPLEMENT TENANT & WORKSPACE ISOLATION POLICIES ON storage.objects
-- ----------------------------------------------------------------------------

-- SELECT Policy (Download / Read / Signed URL access):
-- Authenticated users can only read/download objects if:
-- 1. The object belongs to the 'evidence-packages' bucket.
-- 2. AND the workspace ID (first level directory in name format: 'workspace_id/filename')
--    belongs to the user's active tenant, OR they are an HQ_ADMIN.
CREATE POLICY "select_evidence_policy" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'evidence-packages' AND (
            EXISTS (
                SELECT 1 FROM public.workspaces
                WHERE workspaces.id::text = split_part(name, '/', 1)
                  AND (workspaces.tenant_id = public.get_tenant_id() OR public.get_user_role() = 'HQ_ADMIN')
            )
        )
    );

-- INSERT Policy (Upload):
-- Authenticated users can only upload files if:
-- 1. The destination bucket of the request is 'evidence-packages'.
-- 2. AND the destination folder corresponds to a workspace ID residing within their active tenant.
CREATE POLICY "insert_evidence_policy" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'evidence-packages' AND (
            EXISTS (
                SELECT 1 FROM public.workspaces
                WHERE workspaces.id::text = split_part(name, '/', 1)
                  AND (workspaces.tenant_id = public.get_tenant_id() OR public.get_user_role() = 'HQ_ADMIN')
            )
        )
    );

-- UPDATE Policy (Overwrites):
-- Authenticated users can update files if both the current file directory and the updated file directory
-- reside in an active workspace within their authorized tenant boundary.
CREATE POLICY "update_evidence_policy" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'evidence-packages' AND (
            EXISTS (
                SELECT 1 FROM public.workspaces
                WHERE workspaces.id::text = split_part(name, '/', 1)
                  AND (workspaces.tenant_id = public.get_tenant_id() OR public.get_user_role() = 'HQ_ADMIN')
            )
        )
    )
    WITH CHECK (
        bucket_id = 'evidence-packages' AND (
            EXISTS (
                SELECT 1 FROM public.workspaces
                WHERE workspaces.id::text = split_part(name, '/', 1)
                  AND (workspaces.tenant_id = public.get_tenant_id() OR public.get_user_role() = 'HQ_ADMIN')
            )
        )
    );

-- DELETE Policy (Purges):
-- Authenticated users can only purge storage references if the workspace directory matches
-- a active workspace inside their verified tenant container.
CREATE POLICY "delete_evidence_policy" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'evidence-packages' AND (
            EXISTS (
                SELECT 1 FROM public.workspaces
                WHERE workspaces.id::text = split_part(name, '/', 1)
                  AND (workspaces.tenant_id = public.get_tenant_id() OR public.get_user_role() = 'HQ_ADMIN')
            )
        )
    );
