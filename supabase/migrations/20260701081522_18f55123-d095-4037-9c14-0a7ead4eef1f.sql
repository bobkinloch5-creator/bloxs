
DO $$
DECLARE
  uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE lower(email) = 'bobkinloch5@gmail.com' LIMIT 1;
  IF uid IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (uid, 'owner') ON CONFLICT DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (uid, 'admin') ON CONFLICT DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (uid, 'user')  ON CONFLICT DO NOTHING;
    UPDATE public.profiles
       SET is_admin = true,
           plan = 'Owner',
           max_credits = GREATEST(COALESCE(max_credits,0), 1000000),
           credits = GREATEST(COALESCE(credits,0), 1000000)
     WHERE id = uid;
  END IF;
END $$;
