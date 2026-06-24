-- Repository capture of production-only migration "payment_slips_storage_policies"
-- (remote version 20260618004146). Idempotent.

DROP POLICY IF EXISTS tenant_owner_upload_payment_slip ON storage.objects;
CREATE POLICY tenant_owner_upload_payment_slip ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'payment-slips' AND EXISTS (
      SELECT 1 FROM public.user_role_assignments ura
      WHERE (ura.user_id)::text = (auth.uid())::text
        AND (ura.role)::text = 'TENANT_OWNER'::text
        AND (storage.foldername(objects.name))[1] = (ura.tenant_id)::text
    )
  );

DROP POLICY IF EXISTS tenant_select_own_payment_slip ON storage.objects;
CREATE POLICY tenant_select_own_payment_slip ON storage.objects
  FOR SELECT USING (
    bucket_id = 'payment-slips' AND EXISTS (
      SELECT 1 FROM public.user_role_assignments ura
      WHERE (ura.user_id)::text = (auth.uid())::text
        AND (storage.foldername(objects.name))[1] = (ura.tenant_id)::text
    )
  );

DROP POLICY IF EXISTS hq_select_payment_slip ON storage.objects;
CREATE POLICY hq_select_payment_slip ON storage.objects
  FOR SELECT USING (bucket_id = 'payment-slips' AND is_hq_user());
