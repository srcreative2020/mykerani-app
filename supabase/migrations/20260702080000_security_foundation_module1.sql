-- HQ Foundation Module 1: Security Foundation.
-- Net-new, additive only. Confirmed via live schema check that none of these
-- objects exist in production prior to this migration.

-- 1. HQ feature flags — boolean switches HQ can flip without a deploy.
-- Used here to gate the Chip Asia webhook fail-closed enforcement: ships
-- disabled (shadow mode) so the real verification path runs and logs
-- outcomes without blocking any live payment confirmation, until HQ
-- reviews the shadow log and explicitly flips the flag.
CREATE TABLE IF NOT EXISTS public.hq_feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  description text NOT NULL DEFAULT '',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hq_feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hq_manage_feature_flags ON public.hq_feature_flags;
CREATE POLICY hq_manage_feature_flags ON public.hq_feature_flags
  FOR ALL USING (is_hq_user()) WITH CHECK (is_hq_user());

INSERT INTO public.hq_feature_flags (key, enabled, description)
VALUES (
  'chip_asia_webhook_enforce',
  false,
  'When true, the Chip Asia webhook rejects (401) any payload that fails signature verification or arrives before the public key is cached. When false (shadow mode), verification still runs and is logged to payment_webhook_events, but the payload is processed regardless of the result.'
)
ON CONFLICT (key) DO NOTHING;

-- 2. Payment webhook event log — every Chip Asia webhook call, with its
-- verification outcome, is recorded here regardless of enforcement mode.
-- This is the audit trail that lets HQ confirm shadow-mode is safe to
-- flip to enforcing (i.e. zero/near-zero "would_have_blocked" false
-- positives against real traffic) before the flag is turned on.
CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway text NOT NULL DEFAULT 'chip_asia',
  transaction_reference text,
  signature_present boolean NOT NULL DEFAULT false,
  public_key_cached boolean NOT NULL DEFAULT false,
  verification_result text NOT NULL CHECK (verification_result IN ('verified', 'failed', 'skipped_no_key', 'skipped_no_signature')),
  would_have_blocked boolean NOT NULL DEFAULT false,
  enforced boolean NOT NULL DEFAULT false,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hq_read_payment_webhook_events ON public.payment_webhook_events;
CREATE POLICY hq_read_payment_webhook_events ON public.payment_webhook_events
  FOR SELECT USING (is_hq_user());

-- Server writes with the service role key, which bypasses RLS, so no
-- INSERT policy is required for the webhook handler itself.

-- 3. Dual-approval queue — shared primitive reused by Payment Foundation,
-- Data Masking reveal-requests, and other HQ actions that must require a
-- second HQ approver before taking effect (never auto-approved by AI/system).
CREATE TABLE IF NOT EXISTS public.pending_hq_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL,
  target_table text,
  target_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text
);

ALTER TABLE public.pending_hq_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hq_manage_pending_actions ON public.pending_hq_actions;
CREATE POLICY hq_manage_pending_actions ON public.pending_hq_actions
  FOR ALL USING (is_hq_user()) WITH CHECK (is_hq_user());

-- Requester (the second approver requirement is enforced in application/RPC
-- logic: the row's requested_by may not also be its reviewed_by).
CREATE OR REPLACE FUNCTION public.review_pending_hq_action(
  p_action_id uuid, p_approve boolean, p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_requested_by uuid;
  v_status text;
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;

  select requested_by, status into v_requested_by, v_status
  from public.pending_hq_actions where id = p_action_id;

  if v_requested_by is null then
    raise exception 'Pending action not found';
  end if;
  if v_status <> 'pending' then
    raise exception 'Pending action already reviewed';
  end if;
  if v_requested_by = auth.uid() then
    raise exception 'Dual approval required: requester may not approve their own action';
  end if;

  update public.pending_hq_actions
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = coalesce(p_note, '')
  where id = p_action_id;
end;
$function$;
