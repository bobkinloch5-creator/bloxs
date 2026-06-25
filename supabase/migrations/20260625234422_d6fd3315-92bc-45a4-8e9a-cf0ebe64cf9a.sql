ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS credits_reset_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours');

UPDATE public.profiles p
SET
  is_admin = true,
  plan = 'Owner',
  credits = greatest(coalesce(p.credits, 0), 1000000),
  max_credits = greatest(coalesce(p.max_credits, 0), 1000000)
FROM auth.users u
WHERE u.id = p.id
  AND lower(u.email) = lower('bobkinloch5@gmail.com');

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'owner'::public.app_role
FROM auth.users
WHERE lower(email) = lower('bobkinloch5@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE lower(email) = lower('bobkinloch5@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_username text;
  owner_email constant text := 'bobkinloch5@gmail.com';
BEGIN
  base_username := coalesce(
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'preferred_username',
    new.raw_user_meta_data->>'full_name',
    split_part(coalesce(new.email,'user'), '@', 1)
  );

  INSERT INTO public.profiles (
    id,
    username,
    display_name,
    avatar_url,
    is_admin,
    plan,
    credits,
    max_credits
  )
  VALUES (
    new.id,
    base_username || '_' || substr(new.id::text, 1, 4),
    coalesce(new.raw_user_meta_data->>'full_name', base_username),
    new.raw_user_meta_data->>'avatar_url',
    lower(coalesce(new.email, '')) = lower(owner_email),
    CASE WHEN lower(coalesce(new.email, '')) = lower(owner_email) THEN 'Owner' ELSE 'Free' END,
    CASE WHEN lower(coalesce(new.email, '')) = lower(owner_email) THEN 1000000 ELSE 100 END,
    CASE WHEN lower(coalesce(new.email, '')) = lower(owner_email) THEN 1000000 ELSE 100 END
  )
  ON CONFLICT (id) DO UPDATE SET
    is_admin = public.profiles.is_admin OR (lower(coalesce(new.email, '')) = lower(owner_email)),
    plan = CASE WHEN lower(coalesce(new.email, '')) = lower(owner_email) THEN 'Owner' ELSE public.profiles.plan END,
    max_credits = CASE WHEN lower(coalesce(new.email, '')) = lower(owner_email) THEN greatest(public.profiles.max_credits, 1000000) ELSE public.profiles.max_credits END,
    credits = CASE WHEN lower(coalesce(new.email, '')) = lower(owner_email) THEN greatest(public.profiles.credits, 1000000) ELSE public.profiles.credits END;

  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'user')
    ON CONFLICT DO NOTHING;

  IF lower(coalesce(new.email, '')) = lower(owner_email) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'owner')
      ON CONFLICT DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'admin')
      ON CONFLICT DO NOTHING;
  END IF;

  RETURN new;
END;
$$;