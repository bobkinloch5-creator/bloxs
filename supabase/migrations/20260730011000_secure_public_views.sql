-- Secure Public Views Migration
-- Resolves Lovable/Supabase schema critical issue (security_definer_view lint=0010).

-- 1. Ensure profiles_public view exists with security_invoker = true
DROP VIEW IF EXISTS public.profiles_public CASCADE;

CREATE VIEW public.profiles_public 
WITH (security_invoker = true) AS
SELECT 
    id,
    username,
    display_name,
    avatar_url,
    bio,
    plan,
    created_at,
    updated_at,
    referral_code
FROM public.profiles;

COMMENT ON VIEW public.profiles_public IS 
  'Sanitized projection of developer profiles. Excludes plugin_token, credits, is_admin, settings, and banned status.';

GRANT SELECT ON public.profiles_public TO anon, authenticated;

-- 2. Create projects_public view with security_invoker = true
DROP VIEW IF EXISTS public.projects_public CASCADE;

CREATE VIEW public.projects_public 
WITH (security_invoker = true) AS
SELECT 
    id,
    name,
    description,
    is_public,
    user_id,
    created_at,
    updated_at
FROM public.projects
WHERE is_public = true;

COMMENT ON VIEW public.projects_public IS 
  'Safe public projection of showcase projects. Excludes internal execution states and private tokens.';

GRANT SELECT ON public.projects_public TO anon, authenticated;

-- 3. Enforce SECURITY INVOKER on any other existing views in the public schema
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT table_name 
        FROM information_schema.views 
        WHERE table_schema = 'public'
    LOOP
        EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true);', r.table_name);
    END LOOP;
END $$;
