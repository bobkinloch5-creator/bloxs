
-- Public profile visibility + rate limiting foundation

-- Allow anyone to view non-private profiles (public developer showcase)
DROP POLICY IF EXISTS "profiles public read" ON public.profiles;
CREATE POLICY "profiles public read"
  ON public.profiles FOR SELECT
  TO anon, authenticated
  USING (is_private = false);

GRANT SELECT (id, username, display_name, avatar_url, bio, roblox_username, plan, created_at, is_private)
  ON public.profiles TO anon;

-- Rate limiting table (per user, per action, sliding window)
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  ip_hash text,
  action text NOT NULL,
  count integer NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_user_action ON public.rate_limits(user_id, action, window_start DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limits_ip_action ON public.rate_limits(ip_hash, action, window_start DESC);

GRANT SELECT ON public.rate_limits TO authenticated;
GRANT ALL ON public.rate_limits TO service_role;

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rate_limits read own"
  ON public.rate_limits FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Badges (achievement tracking)
CREATE TABLE IF NOT EXISTS public.user_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_key text NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, badge_key)
);

GRANT SELECT ON public.user_badges TO anon, authenticated;
GRANT INSERT ON public.user_badges TO authenticated;
GRANT ALL ON public.user_badges TO service_role;

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "badges public read"
  ON public.user_badges FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "badges insert own"
  ON public.user_badges FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
