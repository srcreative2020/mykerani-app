-- GAP-M4: enable Supabase Realtime broadcasts for role/permission tables so
-- a Staff session reflects role or permission-matrix changes made by an
-- Owner in another session without requiring a manual refresh.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_role_assignments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_role_assignments;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'permission_matrices'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.permission_matrices;
  END IF;
END $$;
