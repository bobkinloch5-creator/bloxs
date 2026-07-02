
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_build_mode text NOT NULL DEFAULT 'smart',
  ADD COLUMN IF NOT EXISTS default_execution_mode text NOT NULL DEFAULT 'safe',
  ADD COLUMN IF NOT EXISTS default_model text,
  ADD COLUMN IF NOT EXISTS default_language text,
  ADD COLUMN IF NOT EXISTS roblox_place_id bigint,
  ADD COLUMN IF NOT EXISTS roblox_universe_id bigint;

DO $$ BEGIN
  ALTER TABLE public.projects
    ADD CONSTRAINT projects_default_build_mode_check CHECK (default_build_mode IN ('fast','smart','deep'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
