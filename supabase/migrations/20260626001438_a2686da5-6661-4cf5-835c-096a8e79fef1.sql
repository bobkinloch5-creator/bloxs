
-- 1. Trigger blocking privilege escalation on profiles
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_service boolean := (current_setting('role', true) = 'service_role')
                       OR (current_user = 'service_role')
                       OR (auth.uid() IS NULL);
  caller_is_admin boolean := false;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    caller_is_admin := public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner');
  END IF;

  IF is_service OR caller_is_admin THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'cannot change profile id';
  END IF;
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'not allowed to change is_admin';
  END IF;
  IF NEW.plan IS DISTINCT FROM OLD.plan THEN
    RAISE EXCEPTION 'not allowed to change plan';
  END IF;
  IF NEW.credits IS DISTINCT FROM OLD.credits THEN
    RAISE EXCEPTION 'not allowed to change credits';
  END IF;
  IF NEW.max_credits IS DISTINCT FROM OLD.max_credits THEN
    RAISE EXCEPTION 'not allowed to change max_credits';
  END IF;
  IF NEW.credits_reset_at IS DISTINCT FROM OLD.credits_reset_at THEN
    RAISE EXCEPTION 'not allowed to change credits_reset_at';
  END IF;
  IF NEW.plugin_token IS DISTINCT FROM OLD.plugin_token THEN
    RAISE EXCEPTION 'plugin_token can only be rotated via regenerate_my_plugin_token()';
  END IF;
  IF NEW.username IS DISTINCT FROM OLD.username THEN
    RAISE EXCEPTION 'not allowed to change username';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_prevent_priv_esc ON public.profiles;
CREATE TRIGGER trg_profiles_prevent_priv_esc
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- 2. Hide plugin_token from direct PostgREST access for authenticated users
REVOKE SELECT (plugin_token), UPDATE (plugin_token) ON public.profiles FROM authenticated;
REVOKE SELECT (plugin_token), UPDATE (plugin_token) ON public.profiles FROM anon;

-- 3. Secure accessor + rotator
CREATE OR REPLACE FUNCTION public.get_my_plugin_token()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT plugin_token FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.regenerate_my_plugin_token()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_token text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  new_token := 'BS-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 12));
  UPDATE public.profiles SET plugin_token = new_token WHERE id = auth.uid();
  RETURN new_token;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_plugin_token() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.regenerate_my_plugin_token() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_plugin_token() TO authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_my_plugin_token() TO authenticated;
