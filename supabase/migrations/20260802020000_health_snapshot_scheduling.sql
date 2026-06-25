-- Schedule daily health score snapshots via pg_cron (Item 9)
-- The snapshot_customer_health_scores() RPC existed but was never scheduled.
-- This migration attempts to register a daily cron job. If pg_cron extension
-- is not available, the migration succeeds silently with a NOTICE.

DO $$
BEGIN
  -- Try to enable pg_cron (may fail on non-Supabase or restricted environments)
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron extension not available — health snapshot scheduling skipped. Manual snapshots still work via snapshot_customer_health_scores() RPC.';
    RETURN;
  END;

  -- Schedule daily at 02:00 MYT (18:00 UTC, day before)
  BEGIN
    PERFORM cron.schedule(
      'daily-health-snapshot',
      '0 18 * * *',
      $$SELECT public.snapshot_customer_health_scores();$$
    );
    RAISE NOTICE 'Health snapshot cron job scheduled successfully.';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule cron job: %', SQLERRM;
  END;
END;
$$;

-- Also add a UI-callable wrapper so HQ can trigger snapshots manually
-- from the console (the snapshotCustomerHealthScores function in hqService.ts
-- already calls the RPC — this just ensures the RPC is still available).
-- No new RPC needed — snapshot_customer_health_scores() already exists.