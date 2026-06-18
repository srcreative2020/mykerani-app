-- Billing credit enforcement: wire subscription payments to resource_wallets
-- top-ups, and give server.ts a way to atomically check-and-deduct AI/OCR
-- credits before calling a paid provider. Without this, resource_wallets
-- existed but nothing ever populated or decremented it.

CREATE OR REPLACE FUNCTION public.ensure_resource_wallet(p_tenant_id uuid, p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.resource_wallets (tenant_id, workspace_id)
  VALUES (p_tenant_id, p_workspace_id)
  ON CONFLICT (workspace_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_resource_credit(
  p_tenant_id uuid,
  p_workspace_id uuid,
  p_credit_type credit_type,
  p_amount bigint DEFAULT 1,
  p_description text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_wallet_id uuid;
  v_balance bigint;
BEGIN
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
$$;

-- Top up every workspace under the paying tenant with the plan's monthly
-- allowance whenever a Chip Asia purchase finalizes successfully. Previously
-- this function only activated tenant_subscriptions and never touched
-- resource_wallets, so credits were never granted after payment.
CREATE OR REPLACE FUNCTION public.finalize_chip_asia_transaction(p_transaction_id uuid, p_success boolean, p_reference text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tx public.payment_transactions;
  v_period_end timestamptz;
  v_plan public.subscription_plans;
  v_workspace_id uuid;
  v_wallet_id uuid;
BEGIN
  SELECT * INTO v_tx FROM public.payment_transactions WHERE id = p_transaction_id AND method = 'chip_asia';
  IF v_tx.id IS NULL THEN
    RETURN false;
  END IF;

  v_period_end := now() + interval '30 days';

  UPDATE public.payment_transactions
  SET status = CASE WHEN p_success THEN 'success' ELSE 'failed' END,
      chip_asia_reference = COALESCE(p_reference, chip_asia_reference),
      updated_at = now()
  WHERE id = p_transaction_id;

  IF p_success THEN
    INSERT INTO public.tenant_subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)
    VALUES (v_tx.tenant_id, v_tx.plan_id, 'active', now(), v_period_end)
    ON CONFLICT (tenant_id) DO UPDATE SET
      plan_id = v_tx.plan_id,
      status = 'active',
      current_period_start = now(),
      current_period_end = v_period_end,
      updated_at = now();

    SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_tx.plan_id;

    IF v_plan.id IS NOT NULL THEN
      FOR v_workspace_id IN SELECT id FROM public.workspaces WHERE tenant_id = v_tx.tenant_id LOOP
        INSERT INTO public.resource_wallets (
          tenant_id, workspace_id, ai_credits_balance, ocr_credits_balance,
          storage_limit_bytes, notification_credits_balance
        )
        VALUES (
          v_tx.tenant_id, v_workspace_id, v_plan.ai_credits_allowance, v_plan.ocr_credits_allowance,
          v_plan.storage_credits_allowance_mb * 1024 * 1024, v_plan.notification_credits_allowance
        )
        ON CONFLICT (workspace_id) DO UPDATE SET
          ai_credits_balance = EXCLUDED.ai_credits_balance,
          ocr_credits_balance = EXCLUDED.ocr_credits_balance,
          storage_limit_bytes = EXCLUDED.storage_limit_bytes,
          notification_credits_balance = EXCLUDED.notification_credits_balance,
          updated_at = now()
        RETURNING id INTO v_wallet_id;

        INSERT INTO public.resource_wallet_transactions (wallet_id, credit_type, activity_type, amount, description)
        VALUES (v_wallet_id, 'AI', 'ALLOCATION', v_plan.ai_credits_allowance, 'Subscription renewal top-up');

        INSERT INTO public.resource_wallet_transactions (wallet_id, credit_type, activity_type, amount, description)
        VALUES (v_wallet_id, 'OCR', 'ALLOCATION', v_plan.ocr_credits_allowance, 'Subscription renewal top-up');
      END LOOP;
    END IF;
  ELSE
    UPDATE public.tenant_subscriptions SET status = 'suspended', updated_at = now() WHERE tenant_id = v_tx.tenant_id;
  END IF;

  RETURN true;
END;
$$;

-- These are only ever called from server.ts using the service-role key, never
-- directly by tenant-facing clients (unlike finalize_chip_asia_transaction,
-- which PostgREST also exposes to anon/authenticated by historical default).
-- Restrict execution to service_role so a client can't drain or top up an
-- arbitrary tenant's wallet by guessing UUIDs.
REVOKE EXECUTE ON FUNCTION public.ensure_resource_wallet(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_resource_credit(uuid, uuid, credit_type, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_resource_wallet(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_resource_credit(uuid, uuid, credit_type, bigint, text) TO service_role;
