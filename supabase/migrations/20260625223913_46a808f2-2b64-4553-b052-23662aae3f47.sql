
-- Restrict profiles SELECT to owner only; create safe public view for non-sensitive columns
DROP POLICY IF EXISTS "profiles read own or public" ON public.profiles;
CREATE POLICY "profiles read own" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());

CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = true) AS
SELECT id, username, display_name, avatar_url, bio, roblox_username
FROM public.profiles
WHERE is_private = false;

GRANT SELECT ON public.public_profiles TO authenticated, anon;

-- Revoke direct EXECUTE on has_role from end-user roles; RLS policies still work
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
