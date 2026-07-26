-- Migration: Update column defaults & handle_new_user trigger to grant 50 credits (not 100)
-- 2026-07-26

ALTER TABLE public.profiles ALTER COLUMN credits SET DEFAULT 50;
ALTER TABLE public.profiles ALTER COLUMN max_credits SET DEFAULT 50;

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

-- Force update all non-admin/non-owner accounts currently at 100 credits down to 50 credits
UPDATE public.profiles
SET credits = 50, max_credits = 50
WHERE plan NOT IN ('Owner', 'Pro', 'Donator')
  AND (is_admin = false OR is_admin IS NULL)
  AND (credits = 100 OR max_credits = 100);
