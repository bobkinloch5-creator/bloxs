DO $$
DECLARE
  target_id uuid;
BEGIN
  SELECT id INTO target_id FROM auth.users WHERE lower(email) = lower('bobkinloch5@gmail.com') LIMIT 1;
  IF target_id IS NULL THEN
    RAISE NOTICE 'No auth.users row for bobkinloch5@gmail.com yet — they must sign up first, then re-run.';
    RETURN;
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (target_id, 'owner') ON CONFLICT DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (target_id, 'admin') ON CONFLICT DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (target_id, 'user')  ON CONFLICT DO NOTHING;

  UPDATE public.profiles
     SET is_admin = true,
         plan = COALESCE(NULLIF(plan,''), 'Owner'),
         credits = GREATEST(COALESCE(credits,0), 1000000),
         max_credits = GREATEST(COALESCE(max_credits,0), 1000000)
   WHERE id = target_id;
END $$;