-- Migration: Avatar Storage RLS Policies
-- Adds three Storage policies for evidence-packages/avatars/{auth.uid()}/
-- These are additive — existing workspace document policies are untouched.

-- INSERT: authenticated user may upload only into avatars/<own uid>/
CREATE POLICY "avatar_upload_own"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'evidence-packages'
  AND (storage.foldername(name))[1] = 'avatars'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- SELECT: authenticated user may read only their own avatar files
CREATE POLICY "avatar_read_own"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'evidence-packages'
  AND (storage.foldername(name))[1] = 'avatars'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- DELETE: authenticated user may delete only their own avatar files
CREATE POLICY "avatar_delete_own"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'evidence-packages'
  AND (storage.foldername(name))[1] = 'avatars'
  AND (storage.foldername(name))[2] = auth.uid()::text
);
