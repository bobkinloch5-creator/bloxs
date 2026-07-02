
-- Drop the security-definer view; replace with column-level grants on the base table
DROP VIEW IF EXISTS public.public_profiles;

-- Reset SELECT grants on profiles
REVOKE SELECT ON public.profiles FROM anon, authenticated;

-- Safe display columns visible to everyone (subject to row policy)
GRANT SELECT (id, username, display_name, avatar_url, bio, roblox_username, plan, created_at, is_private, language)
  ON public.profiles TO anon, authenticated;

-- Row policy: anyone can see rows that are NOT private (columns are restricted by grants above)
DROP POLICY IF EXISTS "profiles read public safe" ON public.profiles;
CREATE POLICY "profiles read public safe"
  ON public.profiles FOR SELECT
  TO anon, authenticated
  USING (is_private = false);

-- Own-row policy remains (grants would still cap columns; own-full-row reads go through supabaseAdmin)
-- Already created in prior migration as "profiles read own"

-- Recreate view as security_invoker so the linter is happy; view will pass through RLS + column grants
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = on) AS
SELECT id, username, display_name, avatar_url, bio, roblox_username, plan, created_at, is_private, language
FROM public.profiles
WHERE is_private = false;

GRANT SELECT ON public.public_profiles TO anon, authenticated;
