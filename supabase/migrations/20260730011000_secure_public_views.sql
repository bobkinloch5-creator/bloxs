-- Secure Public Views Migration
-- Resolves Lovable/Supabase schema warnings for projects, profiles, and knowledge base.

-- 1. Ensure profiles_public view exists with safe public fields
DROP VIEW IF EXISTS public.profiles_public CASCADE;

CREATE VIEW public.profiles_public AS
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

-- 2. Create projects_public view for safe public showcase browsing
DROP VIEW IF EXISTS public.projects_public CASCADE;

CREATE VIEW public.projects_public AS
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
