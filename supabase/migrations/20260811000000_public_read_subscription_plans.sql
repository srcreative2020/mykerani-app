-- Migration: Public read access for subscription_plans
-- Allows anonymous (unauthenticated) users to SELECT subscription plans.
-- Required for Landing Page to display HQ plan catalog without login.
-- HQ retains full write control via hq_manage_subscription_plans (is_hq_user()).
-- Existing authenticated_read_subscription_plans policy is untouched.

CREATE POLICY "anon_read_subscription_plans"
ON subscription_plans
FOR SELECT
TO anon
USING (true);
