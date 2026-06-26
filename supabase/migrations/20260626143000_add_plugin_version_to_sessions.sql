ALTER TABLE public.plugin_sessions
ADD COLUMN IF NOT EXISTS plugin_version text;
