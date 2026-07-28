-- Enable Supabase Realtime for plugin_actions so the web Execution Log panel
-- reflects every AI action (queued -> executing -> applied/failed) instantly,
-- instead of relying only on interval polling.
--
-- REPLICA IDENTITY FULL is required so UPDATE and DELETE change events include
-- the row's project_id/user_id, which the client channel filters on
-- (filter: project_id=eq.<id>). Without it, status-change UPDATEs would be
-- dropped by the filter and the log would only see INSERTs.

ALTER TABLE public.plugin_actions REPLICA IDENTITY FULL;

DO $$
BEGIN
  -- Add the table to the realtime publication only if it isn't already a member,
  -- so this migration is safe to re-run.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'plugin_actions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.plugin_actions;
  END IF;
END
$$;
