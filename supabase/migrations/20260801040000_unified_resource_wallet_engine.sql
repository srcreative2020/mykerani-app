-- Unified Resource Wallet Calculation Engine
--
-- Root cause being fixed: AI Credits and OCR Credits derived "Used" as
-- (plan.allowance - resource_wallets.<x>_credits_balance) — a single,
-- incrementally-mutated balance column that conflates Package Quota and
-- Purchased Top-up into one number with no way to audit the split, while
-- Storage instead stored actual Usage (storage_used_bytes) separately from
-- its quota (storage_limit_bytes). Three resources, two different shapes
-- of formula, three separate hand-rolled subtractions across
-- aiCredits.ts/storageQuota.ts/HQConsoleShell.tsx. Per
-- MYKERANI_CONSTITUTION.md billing-correctness discipline: Package Quota,
-- Purchased Top-up, and Usage must be three independently-readable numbers
-- for every resource, and Remaining must always be *recomputed* from
-- current state, never trusted as a stale duplicate that HQ package
-- changes, topup approvals, or catalog edits could desync.
--
-- This migration adds a single get_resource_wallet_breakdown() RPC that
-- every UI surface (Owner/Staff dashboards, HQ Console, Resource Wallet,
-- Purchase Approval, Subscription/Package screens) now reads instead of
-- hand-rolling the balance-vs-allowance subtraction per resource type.
--
-- Design note (found live during verification, tenant
-- dd586904-0c10-4d76-96ad-8f7895df5abe / workspace 492deb49-...): a plan
-- CAN be changed on tenant_subscriptions without going through
-- change_subscription_plan()/sync_wallet_entitlement() (e.g. a direct SQL
-- edit, or the one-off 20260629000002_reset_transaction_data.sql data
-- reset), leaving the wallet's actual enforced balance diverged from
-- subscription_plans.allowance for that tenant. A formula that derives
-- Package Quota by live-joining the *current* plan would then report a
-- "Remaining" that doesn't match what consume_resource_credit() actually
-- enforces — a worse bug than the one being fixed. So:
--
--   remaining        = the SAME ground-truth columns
--                       consume_resource_credit/allocate_wallet_credits/
--                       sync_wallet_entitlement already maintain
--                       transactionally (ai_credits_balance,
--                       ocr_credits_balance, storage_limit_bytes -
--                       storage_used_bytes) — read fresh on every call,
--                       never a separately-cached duplicate
--   usage             = SUM of ledger USAGE rows (AI/OCR) or the
--                       evidence-document-synced storage_used_bytes
--                       (STORAGE) — always read-only history, never
--                       written by this function
--   purchased_topup   = SUM of ledger ALLOCATION rows tagged as a
--                       topup/addon purchase (metadata->>'source' IN
--                       ('topup_purchase','addon_purchase_approval'))
--   package_quota     = remaining + usage - purchased_topup (derived, so
--                       the three numbers are self-consistent by
--                       construction: package_quota + purchased_topup -
--                       usage == remaining always holds)
--   plan_allowance    = the CURRENT plan's live allowance for that
--                       resource, returned alongside purely as a
--                       drift-detection signal for HQ — if
--                       plan_allowance != package_quota, the tenant's
--                       wallet has drifted from its nominal plan (e.g. a
--                       plan change applied outside the normal RPC) and
--                       HQ should reconcile it; this column is NEVER used
--                       to compute remaining/usage/package_quota.
--
-- Same formula shape, same three ground-truth inputs, for AI, OCR, and
-- STORAGE. HQ changing a Package only ever ADDs/SUBTRACTs a delta via
-- sync_wallet_entitlement (verified: never overwrites, never resets);
-- HQ approving a Top-up only ever ADDs an ALLOCATION ledger row; neither
-- path can touch usage, because usage is a SUM/read of history this
-- function never updates.
DROP FUNCTION IF EXISTS public.get_resource_wallet_breakdown(uuid);

CREATE OR REPLACE FUNCTION public.get_resource_wallet_breakdown(p_workspace_id uuid)
RETURNS TABLE(
  credit_type text,
  package_quota bigint,
  purchased_topup bigint,
  usage bigint,
  remaining bigint,
  plan_allowance bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wallet record;
  v_plan record;
BEGIN
  IF NOT (
    public.is_hq_user()
    OR EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE workspaces.id = p_workspace_id
        AND workspaces.tenant_id = public.get_tenant_id()
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to read resource wallet breakdown for this workspace';
  END IF;

  SELECT * INTO v_wallet FROM public.resource_wallets WHERE workspace_id = p_workspace_id;
  IF v_wallet IS NULL THEN
    RETURN;
  END IF;

  SELECT sp.* INTO v_plan
    FROM public.tenant_subscriptions ts
    JOIN public.subscription_plans sp ON sp.id = ts.plan_id
   WHERE ts.tenant_id = v_wallet.tenant_id;

  -- AI
  credit_type := 'AI';
  plan_allowance := v_plan.ai_credits_allowance;
  remaining := v_wallet.ai_credits_balance;
  SELECT coalesce(sum(t.amount), 0) INTO purchased_topup
    FROM public.resource_wallet_transactions t
   WHERE t.wallet_id = v_wallet.id AND t.credit_type = 'AI'::credit_type
     AND t.activity_type = 'ALLOCATION'
     AND t.metadata->>'source' IN ('topup_purchase', 'addon_purchase_approval');
  SELECT coalesce(sum(-t.amount), 0) INTO usage
    FROM public.resource_wallet_transactions t
   WHERE t.wallet_id = v_wallet.id AND t.credit_type = 'AI'::credit_type
     AND t.activity_type = 'USAGE';
  package_quota := remaining + usage - purchased_topup;
  RETURN NEXT;

  -- OCR
  credit_type := 'OCR';
  plan_allowance := v_plan.ocr_credits_allowance;
  remaining := v_wallet.ocr_credits_balance;
  SELECT coalesce(sum(t.amount), 0) INTO purchased_topup
    FROM public.resource_wallet_transactions t
   WHERE t.wallet_id = v_wallet.id AND t.credit_type = 'OCR'::credit_type
     AND t.activity_type = 'ALLOCATION'
     AND t.metadata->>'source' IN ('topup_purchase', 'addon_purchase_approval');
  SELECT coalesce(sum(-t.amount), 0) INTO usage
    FROM public.resource_wallet_transactions t
   WHERE t.wallet_id = v_wallet.id AND t.credit_type = 'OCR'::credit_type
     AND t.activity_type = 'USAGE';
  package_quota := remaining + usage - purchased_topup;
  RETURN NEXT;

  -- STORAGE (bytes) — usage is the evidence-document-synced ground truth
  -- (resource_wallets.storage_used_bytes, maintained by
  -- get_workspace_storage_usage), not a ledger SUM, since storage
  -- consumption is measured directly from stored files rather than debited
  -- per-call like AI/OCR.
  credit_type := 'STORAGE';
  plan_allowance := coalesce(v_plan.storage_credits_allowance_mb, 0) * 1024 * 1024;
  usage := v_wallet.storage_used_bytes;
  remaining := greatest(0::bigint, v_wallet.storage_limit_bytes - usage);
  SELECT coalesce(sum(t.amount), 0) INTO purchased_topup
    FROM public.resource_wallet_transactions t
   WHERE t.wallet_id = v_wallet.id AND t.credit_type = 'STORAGE'::credit_type
     AND t.activity_type = 'ALLOCATION'
     AND t.metadata->>'source' IN ('topup_purchase', 'addon_purchase_approval');
  package_quota := remaining + usage - purchased_topup;
  RETURN NEXT;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_resource_wallet_breakdown(uuid) TO authenticated;
