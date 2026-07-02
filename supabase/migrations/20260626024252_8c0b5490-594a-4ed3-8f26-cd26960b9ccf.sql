
-- Tighten user_roles writes: only owner can manage admin/owner roles
DROP POLICY IF EXISTS "admins insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "admins delete roles" ON public.user_roles;

CREATE POLICY "owner manages all roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "admins manage mod and donator" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'))
    AND role IN ('moderator','donator')
  );

CREATE POLICY "admins remove mod and donator" ON public.user_roles
  FOR DELETE TO authenticated
  USING (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'))
    AND role IN ('moderator','donator')
  );

-- Harden profile trigger: only OWNER can change is_admin / plan / credits / max_credits.
-- Regular admins can still update other profile fields (ban, banned_reason, etc.).
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_service boolean := (current_setting('role', true) = 'service_role')
                       OR (current_user = 'service_role')
                       OR (auth.uid() IS NULL);
  caller_is_owner boolean := false;
  caller_is_admin boolean := false;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    caller_is_owner := public.has_role(auth.uid(), 'owner');
    caller_is_admin := caller_is_owner OR public.has_role(auth.uid(), 'admin');
  END IF;

  IF is_service THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'cannot change profile id'; END IF;
  IF NEW.username IS DISTINCT FROM OLD.username THEN RAISE EXCEPTION 'not allowed to change username'; END IF;
  IF NEW.plugin_token IS DISTINCT FROM OLD.plugin_token THEN RAISE EXCEPTION 'plugin_token can only be rotated via regenerate_my_plugin_token()'; END IF;

  -- Owner-only fields
  IF NOT caller_is_owner THEN
    IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN RAISE EXCEPTION 'only owner can change is_admin'; END IF;
    IF NEW.plan IS DISTINCT FROM OLD.plan THEN RAISE EXCEPTION 'only owner can change plan'; END IF;
    IF NEW.max_credits IS DISTINCT FROM OLD.max_credits THEN RAISE EXCEPTION 'only owner can change max_credits'; END IF;
  END IF;

  -- Admin-or-owner fields (credits, ban). Non-admins cannot change any of these on any row.
  IF NOT caller_is_admin THEN
    IF NEW.credits IS DISTINCT FROM OLD.credits THEN RAISE EXCEPTION 'not allowed to change credits'; END IF;
    IF NEW.credits_reset_at IS DISTINCT FROM OLD.credits_reset_at THEN RAISE EXCEPTION 'not allowed to change credits_reset_at'; END IF;
    IF NEW.banned IS DISTINCT FROM OLD.banned THEN RAISE EXCEPTION 'not allowed to change ban status'; END IF;
    IF NEW.banned_reason IS DISTINCT FROM OLD.banned_reason THEN RAISE EXCEPTION 'not allowed to change ban reason'; END IF;
    IF NEW.banned_at IS DISTINCT FROM OLD.banned_at THEN RAISE EXCEPTION 'not allowed to change ban time'; END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Make sure the owner profile is correctly flagged (self-heal in case it got toggled)
UPDATE public.profiles
   SET is_admin = true, plan = 'Owner'
 WHERE id IN (SELECT user_id FROM public.user_roles WHERE role = 'owner');
