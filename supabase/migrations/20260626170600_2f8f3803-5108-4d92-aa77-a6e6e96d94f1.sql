ALTER TABLE public.plugin_sessions
  ADD COLUMN IF NOT EXISTS plugin_version TEXT,
  ADD COLUMN IF NOT EXISTS studio_version TEXT,
  ADD COLUMN IF NOT EXISTS place_id TEXT;