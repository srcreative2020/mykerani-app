-- MyKerani Pricing Template v1.0: seed the real 4 subscription tiers
-- (TRIAL, STARTER, GROWTH, ENTERPRISE) so tenant owners have real plans to
-- choose from instead of an empty subscription_plans table, and add a
-- tenant-callable RPC to self-activate the free TRIAL plan without going
-- through Chip Asia / manual payment.

INSERT INTO public.subscription_plans (
  name, monthly_price_myr, annual_price_myr, ai_credits_allowance, ocr_credits_allowance,
  storage_credits_allowance_mb, notification_credits_allowance, features
)
SELECT * FROM (VALUES
  (
    'TRIAL', 0, 0, 20, 20, 1024, 50,
    jsonb_build_object(
      'maxUsers', 1, 'featured', false, 'isTrial', true, 'trialDays', 30, 'isCustomPricing', false,
      'featureList', jsonb_build_array(
        '1 Company', '1 User', 'Income Tracking', 'Expense Tracking',
        'Basic Dashboard', 'Financial Health Score', '30 Days Trial'
      ),
      'limitations', jsonb_build_array(
        'No Receivable Management', 'No Payable Management', 'No AI Features',
        'No Advanced Reports', 'No Export'
      )
    )
  ),
  (
    'STARTER', 29, 29 * 12, 100, 100, 5120, 200,
    jsonb_build_object(
      'maxUsers', 3, 'featured', false, 'isTrial', false, 'trialDays', 0, 'isCustomPricing', false,
      'featureList', jsonb_build_array(
        '1 Company', 'Up to 3 Users', 'Income Management', 'Expense Management',
        'Receivable Management', 'Payable Management', 'Basic Reports',
        'Financial Health Dashboard', 'Document Storage'
      ),
      'limitations', jsonb_build_array(
        'Limited AI Credits', 'Limited Reports', 'No Cashflow Forecast'
      )
    )
  ),
  (
    'GROWTH', 79, 79 * 12, 500, 300, 20480, 500,
    jsonb_build_object(
      'maxUsers', 10, 'featured', true, 'isTrial', false, 'trialDays', 0, 'isCustomPricing', false,
      'featureList', jsonb_build_array(
        '1 Company', 'Up to 10 Users', 'Income Management', 'Expense Management',
        'Receivable Management', 'Payable Management', 'Debt Management',
        'Bank Account Management', 'Cashflow Monitoring', 'Advanced Reports',
        'AI Financial Assistant', 'AI Insights', 'Priority Support'
      ),
      'limitations', jsonb_build_array('Limited Monthly AI Credits')
    )
  ),
  (
    'ENTERPRISE', 0, 0, 5000, 5000, 102400, 5000,
    jsonb_build_object(
      'maxUsers', 999, 'featured', false, 'isTrial', false, 'trialDays', 0, 'isCustomPricing', true,
      'featureList', jsonb_build_array(
        'Unlimited Users', 'Multi Branch', 'Advanced Role Permissions',
        'Advanced Financial Analytics', 'Unlimited Reports', 'Higher AI Credits',
        'Dedicated Support', 'Custom Onboarding', 'Custom Integrations',
        'SLA Support', 'Future Enterprise Features'
      ),
      'limitations', jsonb_build_array('Contact Sales for Custom Quotation')
    )
  )
) AS v(name, monthly_price_myr, annual_price_myr, ai_credits_allowance, ocr_credits_allowance, storage_credits_allowance_mb, notification_credits_allowance, features)
WHERE NOT EXISTS (SELECT 1 FROM public.subscription_plans sp WHERE sp.name = v.name);

-- Lets a tenant owner self-activate the free TRIAL plan exactly once,
-- mirroring create_payment_transaction's TENANT_OWNER gate, without routing
-- through Chip Asia / manual payment approval.
CREATE OR REPLACE FUNCTION public.start_trial_subscription(p_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_plan public.subscription_plans;
  v_period_end timestamptz;
  v_workspace_id uuid;
  v_wallet_id uuid;
  v_rows int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_role_assignments ura
    WHERE ura.user_id = auth.uid()::text AND ura.tenant_id = p_tenant_id AND ura.role = 'TENANT_OWNER'
  ) THEN
    RAISE EXCEPTION 'Permission denied: tenant owner access required';
  END IF;

  SELECT * INTO v_plan FROM public.subscription_plans
   WHERE (features->>'isTrial')::boolean IS TRUE
   ORDER BY monthly_price_myr ASC LIMIT 1;
  IF v_plan.id IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (SELECT 1 FROM public.tenant_subscriptions ts WHERE ts.tenant_id = p_tenant_id) THEN
    RETURN false;
  END IF;

  v_period_end := now() + make_interval(days => COALESCE((v_plan.features->>'trialDays')::int, 30));

  INSERT INTO public.tenant_subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end, is_trial)
  VALUES (p_tenant_id, v_plan.id, 'active', now(), v_period_end, true)
  ON CONFLICT (tenant_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN false;
  END IF;

  FOR v_workspace_id IN SELECT id FROM public.workspaces WHERE tenant_id = p_tenant_id LOOP
    INSERT INTO public.resource_wallets (
      tenant_id, workspace_id, ai_credits_balance, ocr_credits_balance,
      storage_limit_bytes, notification_credits_balance
    )
    VALUES (
      p_tenant_id, v_workspace_id, v_plan.ai_credits_allowance, v_plan.ocr_credits_allowance,
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
    VALUES (v_wallet_id, 'AI', 'ALLOCATION', v_plan.ai_credits_allowance, 'Trial activation top-up');
    INSERT INTO public.resource_wallet_transactions (wallet_id, credit_type, activity_type, amount, description)
    VALUES (v_wallet_id, 'OCR', 'ALLOCATION', v_plan.ocr_credits_allowance, 'Trial activation top-up');
  END LOOP;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_trial_subscription(uuid) TO authenticated, service_role;
