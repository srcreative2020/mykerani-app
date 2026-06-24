-- HQ Foundation Module 7: Data Masking Governance.
-- No masking infrastructure existed at all — HQ_STAFF could see full customer
-- PII (email, phone) in the HQ Console with no distinction from HQ_OWNER.
-- This adds a real per-staff unmask grant: HQ_OWNER always sees unmasked data
-- (override authority); HQ_STAFF sees masked PII unless explicitly granted.

CREATE TABLE IF NOT EXISTS public.hq_data_masking_grants (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  granted_by uuid REFERENCES auth.users(id),
  granted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hq_data_masking_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hq_view_masking_grants ON public.hq_data_masking_grants;
CREATE POLICY hq_view_masking_grants ON public.hq_data_masking_grants
  FOR SELECT USING (is_hq_user());

DROP POLICY IF EXISTS hq_owner_manage_masking_grants ON public.hq_data_masking_grants;
CREATE POLICY hq_owner_manage_masking_grants ON public.hq_data_masking_grants
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_role_assignments ura
      WHERE ura.user_id = auth.uid()::text AND ura.role = 'HQ_OWNER'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_role_assignments ura
      WHERE ura.user_id = auth.uid()::text AND ura.role = 'HQ_OWNER'
    )
  );

CREATE OR REPLACE FUNCTION public.is_unmask_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_role_assignments ura
    WHERE ura.user_id = auth.uid()::text AND ura.role = 'HQ_OWNER'
  )
  OR EXISTS (
    SELECT 1 FROM public.hq_data_masking_grants g
    WHERE g.user_id = auth.uid()
  );
$function$;
