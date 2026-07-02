REVOKE ALL ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_my_plugin_token() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.regenerate_my_plugin_token() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_plugin_token() TO authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_my_plugin_token() TO authenticated;

REVOKE ALL ON TABLE public.profiles FROM anon, authenticated;

GRANT SELECT (
  id, username, display_name, avatar_url, bio, roblox_username,
  plan, credits, max_credits, language, is_private, settings,
  created_at, updated_at, is_admin, credits_reset_at
) ON public.profiles TO authenticated;

GRANT UPDATE (
  display_name, avatar_url, bio, roblox_username, language, is_private, settings
) ON public.profiles TO authenticated;

GRANT ALL ON TABLE public.profiles TO service_role;