
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS credits_reset_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours');

-- Flag the owner account as admin (matches by auth email)
UPDATE public.profiles p
SET is_admin = true
FROM auth.users u
WHERE u.id = p.id AND lower(u.email) = lower('bobkinloch5@gmail.com');

-- Function callable by anyone to reset their own credits if window passed
CREATE OR REPLACE FUNCTION public.refresh_my_credits()
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.profiles;
BEGIN
  SELECT * INTO row FROM public.profiles WHERE id = auth.uid();
  IF row IS NULL THEN RETURN NULL; END IF;
  IF row.is_admin THEN RETURN row; END IF;
  IF row.credits_reset_at <= now() THEN
    UPDATE public.profiles
      SET credits = max_credits,
          credits_reset_at = now() + interval '24 hours'
      WHERE id = row.id
      RETURNING * INTO row;
  END IF;
  RETURN row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_my_credits() TO authenticated;
