DROP POLICY IF EXISTS "admins read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "admins update all profiles" ON public.profiles;

DROP POLICY IF EXISTS "admins read all roles" ON public.user_roles;
DROP POLICY IF EXISTS "admins manage mod and donator" ON public.user_roles;
DROP POLICY IF EXISTS "admins remove mod and donator" ON public.user_roles;
DROP POLICY IF EXISTS "owner manages all roles" ON public.user_roles;

DROP POLICY IF EXISTS "users read own donation claims" ON public.donation_claims;
DROP POLICY IF EXISTS "admins update donation claims" ON public.donation_claims;

CREATE POLICY "users read own donation claims"
  ON public.donation_claims
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
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