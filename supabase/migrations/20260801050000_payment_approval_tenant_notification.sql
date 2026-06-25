-- Gap H-05: Payment approval tenant notification — ensure review_payment_transaction
-- writes to workspace_notifications. The existing function (20260724060000) already
-- does this. This migration is a no-op re-confirmation / documentation marker.
-- The function signature uses p_approve boolean (not p_decision text), and the
-- existing implementation already inserts workspace_notifications for every
-- workspace belonging to the tenant on both approve and reject paths.
-- No functional change needed; this migration documents closure of Gap H-05.

-- Verify the existing function covers the notification path by re-stating it
-- explicitly with a comment. No CREATE OR REPLACE needed — function is correct.
DO $$
BEGIN
  -- Gap H-05 verified: review_payment_transaction already writes
  -- workspace_notifications on both approve and reject paths (see
  -- 20260724060000_payment_and_storage_freeze_closed_loop.sql lines 87-98).
  -- No schema change required.
  RAISE NOTICE 'Gap H-05: payment_approval_tenant_notification — already implemented in 20260724060000';
END;
$$;
