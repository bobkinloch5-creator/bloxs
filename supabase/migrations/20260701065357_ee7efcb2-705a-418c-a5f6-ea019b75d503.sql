
-- 1) profiles_public: rebuild as SECURITY INVOKER, expose safe columns only.
DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public
  WITH (security_invoker = true) AS
  SELECT id, username, display_name, avatar_url, bio, roblox_username, roblox_display_name,
         roblox_avatar_url, roblox_headshot_url, roblox_verified_at, roblox_created_at,
         roblox_last_synced_at, roblox_public, roblox_experiences, plan, is_private, created_at
    FROM public.profiles;

COMMENT ON VIEW public.profiles_public IS
  'Public, sanitized projection of profiles. Never expose credits, plugin_token, settings, is_admin, banned_*, max_credits, roblox_user_id, or any other sensitive column here.';

GRANT SELECT ON public.profiles_public TO anon, authenticated;

-- Grant only safe columns on the base table so the invoker-scoped view can read them.
GRANT SELECT (id, username, display_name, avatar_url, bio, roblox_username, roblox_display_name,
              roblox_avatar_url, roblox_headshot_url, roblox_verified_at, roblox_created_at,
              roblox_last_synced_at, roblox_public, roblox_experiences, plan, is_private, created_at)
  ON public.profiles TO anon, authenticated;

-- Row-level: allow reading any row's safe columns; column privileges above block sensitive ones.
DROP POLICY IF EXISTS "profiles read safe columns" ON public.profiles;
CREATE POLICY "profiles read safe columns" ON public.profiles
  FOR SELECT TO anon, authenticated
  USING (true);

-- 2) plugin_pair_codes: clear plugin_token once pairing completes or code expires.
CREATE OR REPLACE FUNCTION public.pair_code_clear_token()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.picked_up_at IS NOT NULL AND (OLD.picked_up_at IS NULL OR OLD.picked_up_at IS DISTINCT FROM NEW.picked_up_at) THEN
    NEW.plugin_token := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pair_code_clear_token ON public.plugin_pair_codes;
CREATE TRIGGER trg_pair_code_clear_token
  BEFORE UPDATE ON public.plugin_pair_codes
  FOR EACH ROW EXECUTE FUNCTION public.pair_code_clear_token();

-- Sweep already-claimed or expired rows.
UPDATE public.plugin_pair_codes
   SET plugin_token = NULL
 WHERE plugin_token IS NOT NULL
   AND (picked_up_at IS NOT NULL OR expires_at < now());

-- 3) admin_settings: restrict SELECT to admin/owner roles only.
DROP POLICY IF EXISTS "read settings" ON public.admin_settings;
CREATE POLICY "admins read settings" ON public.admin_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role));
