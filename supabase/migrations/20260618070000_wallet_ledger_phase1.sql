-- ============================================================================
-- MYKERANI Database Hardening Migration Script
-- Module: Resource Wallet Architecture — Phase 1
-- Created At: 2026-06-18
-- Description: Implements the approved Phase 1 Wallet Implementation
--              Specification. Scope is strictly limited to:
--                1. Explicit internal-tenant flag (no implicit bypass logic).
--                2. Activating resource_wallet_transactions as the immutable
--                   ledger for every wallet mutation.
--                3. allocate_wallet_credits RPC (the only sanctioned way to
--                   increase a wallet balance/limit outside of consumption).
--                4. consume_resource_credit hardened with an explicit
--                   internal-tenant exemption check (replacing reliance on
--                   incidental null-guard fail-open behavior).
--                5. One-time, ledger-recorded backfill for the single
--                   operational tenant (dd586904-0c10-4d76-96ad-8f7895df5abe)
--                   whose wallet had drained to 0 against an active GROWTH
--                   subscription with no synchronization mechanism in place.
--
--              Out of scope (explicitly NOT touched by this migration):
--              renewal automation, billing screen, OCR screen, storage
--              dashboard, any frontend code. Identity-only test tenants
--              (HQ_STAFF/TENANT_STAFF persona tenants) are untouched — they
--              have no workspace and are not in scope for wallets.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Internal HQ Tenant Flag
-- ----------------------------------------------------------------------------
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tenants.is_internal IS
  'Explicit flag marking MYKERANI''s own internal platform tenant. Internal '
  'tenants are exempt from resource wallet enforcement (no subscription, no '
  'wallet, no AI/OCR credit consumption gating) per Phase 1 Wallet '
  'Architecture policy. This must be checked explicitly wherever wallet '
  'enforcement occurs — it must never be inferred from the absence of a '
  'subscription or wallet row.';

-- Mark the known internal platform tenant by id (exact-id match only, never
-- by name, to avoid accidentally exempting a future operational tenant).
UPDATE public.tenants
   SET is_internal = true
 WHERE id = '7a4e8169-5e56-45c2-bcd3-e5dfd03315b9';

-- ----------------------------------------------------------------------------
-- 2 & 4. consume_resource_credit — ledger logging (already present) +
--         explicit internal-tenant exemption (new)
-- ----------------------------------------------------------------------------
-- The existing function body already inserts a USAGE row into
-- resource_wallet_transactions on every successful decrement — that part of
-- "Resource Wallet Ledger Activation" was already implemented correctly and
-- is preserved unchanged below. What was missing was an EXPLICIT internal-
-- tenant short-circuit (previously, calls with a null tenant/workspace from
-- the application layer would fail open incidentally — this replaces that
-- incidental behavior with a deliberate, auditable check).
CREATE OR REPLACE FUNCTION public.consume_resource_credit(
  p_tenant_id uuid,
  p_workspace_id uuid,
  p_credit_type credit_type,
  p_amount bigint DEFAULT 1,
  p_description text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wallet_id uuid;
  v_balance bigint;
  v_is_internal boolean;
BEGIN
  -- Explicit internal-tenant exemption. HQ's own platform tenant never
  -- requires a wallet, subscription, or credit consumption gate.
  SELECT is_internal INTO v_is_internal
    FROM public.tenants
   WHERE id = p_tenant_id;

  IF v_is_internal IS TRUE THEN
    RETURN true;
  END IF;

  PERFORM public.ensure_resource_wallet(p_tenant_id, p_workspace_id);

  SELECT id,
         CASE p_credit_type
           WHEN 'AI' THEN ai_credits_balance
           WHEN 'OCR' THEN ocr_credits_balance
           WHEN 'NOTIFICATION' THEN notification_credits_balance
           ELSE 0
         END
    INTO v_wallet_id, v_balance
    FROM public.resource_wallets
   WHERE workspace_id = p_workspace_id
   FOR UPDATE;

  IF v_wallet_id IS NULL OR v_balance < p_amount THEN
    RETURN false;
  END IF;

  IF p_credit_type = 'AI' THEN
    UPDATE public.resource_wallets SET ai_credits_balance = ai_credits_balance - p_amount, updated_at = now() WHERE id = v_wallet_id;
  ELSIF p_credit_type = 'OCR' THEN
    UPDATE public.resource_wallets SET ocr_credits_balance = ocr_credits_balance - p_amount, updated_at = now() WHERE id = v_wallet_id;
  ELSIF p_credit_type = 'NOTIFICATION' THEN
    UPDATE public.resource_wallets SET notification_credits_balance = notification_credits_balance - p_amount, updated_at = now() WHERE id = v_wallet_id;
  ELSE
    RETURN false;
  END IF;

  INSERT INTO public.resource_wallet_transactions (wallet_id, credit_type, activity_type, amount, description)
  VALUES (v_wallet_id, p_credit_type, 'USAGE', -p_amount, p_description);

  RETURN true;
END;
$function$;

-- ensure_resource_wallet: defensive internal-tenant guard so a wallet row is
-- never created for the internal platform tenant even if invoked directly.
CREATE OR REPLACE FUNCTION public.ensure_resource_wallet(
  p_tenant_id uuid,
  p_workspace_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_internal boolean;
BEGIN
  SELECT is_internal INTO v_is_internal
    FROM public.tenants
   WHERE id = p_tenant_id;

  IF v_is_internal IS TRUE THEN
    RETURN;
  END IF;

  INSERT INTO public.resource_wallets (tenant_id, workspace_id)
  VALUES (p_tenant_id, p_workspace_id)
  ON CONFLICT (workspace_id) DO NOTHING;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 3. allocate_wallet_credits RPC
-- ----------------------------------------------------------------------------
-- The sanctioned way to increase a wallet's balance/limit outside of normal
-- consumption (backfills, and — in a future, out-of-scope phase — renewals
-- and top-up purchases). Every call is recorded as an ALLOCATION row in
-- resource_wallet_transactions. Refuses internal tenants explicitly, since
-- they must never hold a wallet at all.
CREATE OR REPLACE FUNCTION public.allocate_wallet_credits(
  p_tenant_id uuid,
  p_workspace_id uuid,
  p_credit_type credit_type,
  p_amount bigint,
  p_reason text,
  p_source text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wallet_id uuid;
  v_is_internal boolean;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'allocate_wallet_credits: p_amount must be a positive integer';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'allocate_wallet_credits: p_reason is mandatory for audit accountability';
  END IF;

  SELECT is_internal INTO v_is_internal
    FROM public.tenants
   WHERE id = p_tenant_id;

  IF v_is_internal IS TRUE THEN
    RAISE EXCEPTION 'allocate_wallet_credits: tenant % is internal and must never hold a wallet', p_tenant_id;
  END IF;

  PERFORM public.ensure_resource_wallet(p_tenant_id, p_workspace_id);

  SELECT id INTO v_wallet_id
    FROM public.resource_wallets
   WHERE workspace_id = p_workspace_id
   FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_credit_type = 'AI' THEN
    UPDATE public.resource_wallets SET ai_credits_balance = ai_credits_balance + p_amount, updated_at = now() WHERE id = v_wallet_id;
  ELSIF p_credit_type = 'OCR' THEN
    UPDATE public.resource_wallets SET ocr_credits_balance = ocr_credits_balance + p_amount, updated_at = now() WHERE id = v_wallet_id;
  ELSIF p_credit_type = 'NOTIFICATION' THEN
    UPDATE public.resource_wallets SET notification_credits_balance = notification_credits_balance + p_amount, updated_at = now() WHERE id = v_wallet_id;
  ELSIF p_credit_type = 'STORAGE' THEN
    UPDATE public.resource_wallets SET storage_limit_bytes = storage_limit_bytes + p_amount, updated_at = now() WHERE id = v_wallet_id;
  ELSE
    RETURN false;
  END IF;

  INSERT INTO public.resource_wallet_transactions (wallet_id, credit_type, activity_type, amount, description, metadata)
  VALUES (
    v_wallet_id,
    p_credit_type,
    'ALLOCATION',
    p_amount,
    p_reason,
    jsonb_build_object('source', p_source, 'reason', p_reason)
  );

  RETURN true;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 5. Backfill for operational tenant dd586904-0c10-4d76-96ad-8f7895df5abe
-- ----------------------------------------------------------------------------
-- This tenant is the only operational tenant in production today: it has an
-- active workspace, an active GROWTH subscription, and real AI usage history
-- — but its wallet had drained to 0 with no synchronization mechanism to
-- replenish it against its plan entitlement (GROWTH: 500 AI / 300 OCR /
-- 20480 MB storage). Performed via allocate_wallet_credits so the correction
-- is fully auditable in resource_wallet_transactions rather than a blind
-- UPDATE — these are the first ledger rows ever written for this wallet,
-- establishing the balance == SUM(transactions) invariant going forward.
DO $$
DECLARE
  v_wallet_id uuid;
  v_already_backfilled boolean;
BEGIN
  SELECT id INTO v_wallet_id
    FROM public.resource_wallets
   WHERE workspace_id = '492deb49-357d-4818-bfea-da82a592e9df'::uuid;

  -- Idempotency guard: never double-allocate if this migration is re-applied.
  SELECT EXISTS (
    SELECT 1 FROM public.resource_wallet_transactions
     WHERE wallet_id = v_wallet_id
       AND activity_type = 'ALLOCATION'
       AND metadata->>'source' = 'migration_backfill'
  ) INTO v_already_backfilled;

  IF NOT v_already_backfilled THEN
    PERFORM public.allocate_wallet_credits(
      'dd586904-0c10-4d76-96ad-8f7895df5abe'::uuid,
      '492deb49-357d-4818-bfea-da82a592e9df'::uuid,
      'AI'::credit_type,
      500,
      'Wallet never synced to GROWTH plan entitlement at signup; no renewal mechanism existed prior to Phase 1 implementation',
      'migration_backfill'
    );

    PERFORM public.allocate_wallet_credits(
      'dd586904-0c10-4d76-96ad-8f7895df5abe'::uuid,
      '492deb49-357d-4818-bfea-da82a592e9df'::uuid,
      'OCR'::credit_type,
      300,
      'Wallet never synced to GROWTH plan entitlement at signup; no renewal mechanism existed prior to Phase 1 implementation',
      'migration_backfill'
    );

    PERFORM public.allocate_wallet_credits(
      'dd586904-0c10-4d76-96ad-8f7895df5abe'::uuid,
      '492deb49-357d-4818-bfea-da82a592e9df'::uuid,
      'STORAGE'::credit_type,
      21474836480, -- 20480 MB expressed in bytes, per GROWTH plan's storage_credits_allowance_mb
      'Wallet never synced to GROWTH plan entitlement at signup; no renewal mechanism existed prior to Phase 1 implementation',
      'migration_backfill'
    );
  END IF;
END $$;
