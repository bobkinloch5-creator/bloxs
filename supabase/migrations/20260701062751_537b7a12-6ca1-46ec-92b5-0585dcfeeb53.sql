
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS roblox_user_id bigint,
  ADD COLUMN IF NOT EXISTS roblox_display_name text,
  ADD COLUMN IF NOT EXISTS roblox_avatar_url text,
  ADD COLUMN IF NOT EXISTS roblox_headshot_url text,
  ADD COLUMN IF NOT EXISTS roblox_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS roblox_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS roblox_last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS roblox_public boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS roblox_experiences jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_roblox_user_id_unique
  ON public.profiles (roblox_user_id)
  WHERE roblox_user_id IS NOT NULL;
