-- Fix auth signup trigger to ensure ON CONFLICT (id) DO NOTHING so new user registrations never fail due to profile update policy triggers
-- 2026-07-26

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
    CASE WHEN lower(coalesce(new.email, '')) = lower(owner_email) THEN 1000000 ELSE 50 END,
    CASE WHEN lower(coalesce(new.email, '')) = lower(owner_email) THEN 1000000 ELSE 50 END
  )
  ON CONFLICT (id) DO NOTHING;

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
