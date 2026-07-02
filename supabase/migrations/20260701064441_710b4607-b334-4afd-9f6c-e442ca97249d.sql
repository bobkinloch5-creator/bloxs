-- Drop the overly-broad SELECT policy that exposed the whole profiles row
DROP POLICY IF EXISTS "profiles read public safe" ON public.profiles;

-- Safe, read-only projection of the profiles table for cross-user reads.
-- Runs as the view owner (postgres) so the base table can remain locked down.
CREATE OR REPLACE VIEW public.profiles_public AS
  SELECT
    id,
    username,
    display_name,
    avatar_url,
    bio,
    roblox_username,
    roblox_display_name,
    roblox_avatar_url,
    roblox_headshot_url,
    roblox_verified_at,
    roblox_created_at,
    roblox_last_synced_at,
    roblox_public,
    roblox_experiences,
    plan,
    is_private,
    created_at
  FROM public.profiles;

GRANT SELECT ON public.profiles_public TO anon, authenticated;

-- Belt-and-suspenders: revoke leftover column grants on the base table so
-- anon/authenticated cannot SELECT any columns of another user's profile
-- directly. Own-profile reads go through the admin client server-side.
REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT (id, username, display_name, avatar_url, bio, roblox_username, plan, language, is_private, created_at)
  ON public.profiles FROM authenticated;

COMMENT ON VIEW public.profiles_public IS
  'Public, sanitized projection of profiles. Never expose credits, plugin_token, settings, is_admin, banned_*, max_credits, roblox_user_id, or any other sensitive column here.';