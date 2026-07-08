
-- Ensure uniqueness so we can safely rely on the code
create unique index if not exists profiles_referral_code_key on public.profiles(referral_code) where referral_code is not null;

-- Backfill any missing codes
update public.profiles
set referral_code = 'BS' || upper(substr(md5(random()::text || id::text || clock_timestamp()::text), 1, 8))
where referral_code is null;

-- Auto-assign on insert if missing
create or replace function public.assign_referral_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.referral_code is null then
    new.referral_code := 'BS' || upper(substr(md5(random()::text || new.id::text || clock_timestamp()::text), 1, 8));
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_assign_referral_code on public.profiles;
create trigger profiles_assign_referral_code
before insert on public.profiles
for each row execute function public.assign_referral_code();
