GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

UPDATE public.profiles
   SET is_admin = true,
       plan = 'Owner',
       max_credits = GREATEST(max_credits, 1000000),
       credits = GREATEST(credits, 1000000)
 WHERE id IN (SELECT user_id FROM public.user_roles WHERE role = 'owner');

UPDATE public.profiles
   SET is_admin = true
 WHERE id IN (SELECT user_id FROM public.user_roles WHERE role = 'admin');