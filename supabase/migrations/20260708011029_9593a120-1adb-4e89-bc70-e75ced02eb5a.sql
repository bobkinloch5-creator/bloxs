
-- 1) username change support
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username_changed_at timestamptz;

-- 2) Update privilege-escalation trigger to allow self-service username change
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
  is_self boolean := (auth.uid() IS NOT NULL AND auth.uid() = NEW.id);
  dup_count int;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    caller_is_owner := public.has_role(auth.uid(), 'owner');
    caller_is_admin := caller_is_owner OR public.has_role(auth.uid(), 'admin');
  END IF;

  IF is_service THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'cannot change profile id'; END IF;

  -- Username: self-service change, format-checked, unique (case-insensitive),
  -- limited to once every 14 days. Admins/owners can always change it.
  IF NEW.username IS DISTINCT FROM OLD.username THEN
    IF NOT caller_is_admin THEN
      IF NOT is_self THEN RAISE EXCEPTION 'not allowed to change username'; END IF;
      IF NEW.username !~ '^[a-z0-9_]{3,24}$' THEN
        RAISE EXCEPTION 'username must be 3-24 chars, lowercase letters, numbers or underscore';
      END IF;
      IF OLD.username_changed_at IS NOT NULL
         AND OLD.username_changed_at > (now() - interval '14 days') THEN
        RAISE EXCEPTION 'username can only be changed once every 14 days';
      END IF;
      SELECT COUNT(*) INTO dup_count FROM public.profiles
        WHERE lower(username) = lower(NEW.username) AND id <> NEW.id;
      IF dup_count > 0 THEN RAISE EXCEPTION 'username is already taken'; END IF;
      NEW.username_changed_at := now();
    END IF;
  END IF;

  IF NEW.plugin_token IS DISTINCT FROM OLD.plugin_token THEN RAISE EXCEPTION 'plugin_token can only be rotated via regenerate_my_plugin_token()'; END IF;

  IF NOT caller_is_owner THEN
    IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN RAISE EXCEPTION 'only owner can change is_admin'; END IF;
    IF NEW.plan IS DISTINCT FROM OLD.plan THEN RAISE EXCEPTION 'only owner can change plan'; END IF;
    IF NEW.max_credits IS DISTINCT FROM OLD.max_credits THEN RAISE EXCEPTION 'only owner can change max_credits'; END IF;
  END IF;

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

-- 3) Storage RLS for avatars bucket (private bucket; read via signed URLs)
DROP POLICY IF EXISTS "avatars read all authenticated" ON storage.objects;
DROP POLICY IF EXISTS "avatars insert own" ON storage.objects;
DROP POLICY IF EXISTS "avatars update own" ON storage.objects;
DROP POLICY IF EXISTS "avatars delete own" ON storage.objects;

CREATE POLICY "avatars read all authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars insert own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatars update own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatars delete own"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
