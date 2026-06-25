REVOKE EXECUTE ON FUNCTION public.refresh_my_credits() FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.refresh_my_credits();