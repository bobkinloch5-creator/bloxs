-- COMPLETE BLOXSMITH SCHEMA

-- 20260625213653_f223207e-963f-4f95-894b-e9a29e817d7c.sql

-- Extensions
create extension if not exists "pgcrypto";

-- ========== ROLES ==========
do $$ begin
  create type public.app_role as enum ('admin','owner','user');
exception when duplicate_object then null; end $$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'user',
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
drop policy if exists "users read own roles" on public.user_roles;
create policy "users read own roles" on public.user_roles
  for select to authenticated using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- ========== PROFILES ==========
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  display_name text,
  avatar_url text,
  bio text not null default '',
  roblox_username text not null default '',
  plan text not null default 'Free' check (plan in ('Free','Pro','Owner')),
  credits integer not null default 100,
  max_credits integer not null default 100,
  language text not null default 'en',
  is_private boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  plugin_token text unique not null default 'BS-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 12)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
drop policy if exists "profiles read own or public" on public.profiles;
create policy "profiles read own or public" on public.profiles
  for select to authenticated using (id = auth.uid() or is_private = false);
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles
  for insert to authenticated with check (id = auth.uid());

create index if not exists idx_profiles_plugin_token on public.profiles(plugin_token);
create index if not exists idx_profiles_username on public.profiles(username);

-- updated_at trigger
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Auto profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base_username text;
begin
  base_username := coalesce(
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'preferred_username',
    new.raw_user_meta_data->>'full_name',
    split_part(coalesce(new.email,'user'), '@', 1)
  );
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    base_username || '_' || substr(new.id::text, 1, 4),
    coalesce(new.raw_user_meta_data->>'full_name', base_username),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'user')
    on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ========== PROJECTS ==========
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  game_type text not null default 'custom',
  last_model_used text,
  plugin_connected boolean not null default false,
  build_count integer not null default 0,
  thumbnail_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.projects to authenticated;
grant all on public.projects to service_role;
alter table public.projects enable row level security;
drop policy if exists "projects owner all" on public.projects;
create policy "projects owner all" on public.projects
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create index if not exists idx_projects_user on public.projects(user_id);
create index if not exists idx_projects_updated on public.projects(updated_at desc);

drop trigger if exists trg_projects_updated on public.projects;
create trigger trg_projects_updated before update on public.projects
  for each row execute function public.touch_updated_at();

-- ========== CHAT MESSAGES ==========
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null default '',
  status text not null default 'done' check (status in ('thinking','building','sending','done','error')),
  model text,
  actions jsonb not null default '[]'::jsonb,
  error text,
  tokens_used integer not null default 0,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.chat_messages to authenticated;
grant all on public.chat_messages to service_role;
alter table public.chat_messages enable row level security;
drop policy if exists "chat owner all" on public.chat_messages;
create policy "chat owner all" on public.chat_messages
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create index if not exists idx_chat_project on public.chat_messages(project_id, created_at);

-- ========== PLUGIN ACTIONS (queue) ==========
create table if not exists public.plugin_actions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid references public.chat_messages(id) on delete set null,
  kind text not null check (kind in ('script','localscript','modulescript','gui','folder','part','model','terrain','setting','delete','run')),
  parent_path text not null default 'ServerScriptService',
  name text not null default 'New',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','sent','done','failed')),
  result jsonb,
  error text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  completed_at timestamptz
);
grant select, insert, update, delete on public.plugin_actions to authenticated;
grant all on public.plugin_actions to service_role;
alter table public.plugin_actions enable row level security;
drop policy if exists "actions owner all" on public.plugin_actions;
create policy "actions owner all" on public.plugin_actions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create index if not exists idx_actions_project_status on public.plugin_actions(project_id, status, position);

-- ========== BUILD HISTORY ==========
create table if not exists public.build_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt text not null,
  model text,
  files_count integer not null default 0,
  credits_used integer not null default 0,
  plugin_status text not null default 'Disconnected' check (plugin_status in ('Connected','Disconnected')),
  applied boolean not null default false,
  errors_count integer not null default 0,
  created_at timestamptz not null default now()
);
grant select, insert ON public.build_history to authenticated;
grant all on public.build_history to service_role;
alter table public.build_history enable row level security;
drop policy if exists "builds owner all" on public.build_history;
create policy "builds owner all" on public.build_history
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create index if not exists idx_builds_user on public.build_history(user_id, created_at desc);
create index if not exists idx_builds_project on public.build_history(project_id, created_at desc);

-- ========== DAILY USAGE ==========
create table if not exists public.daily_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  messages_used integer not null default 0,
  builds_used integer not null default 0,
  plugin_sends_used integer not null default 0,
  scans_used integer not null default 0,
  credits_used integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, usage_date)
);
grant select, insert, update on public.daily_usage to authenticated;
grant all on public.daily_usage to service_role;
alter table public.daily_usage enable row level security;
drop policy if exists "usage owner read" on public.daily_usage;
create policy "usage owner read" on public.daily_usage
  for select to authenticated using (user_id = auth.uid());

drop trigger if exists trg_usage_updated on public.daily_usage;
create trigger trg_usage_updated before update on public.daily_usage
  for each row execute function public.touch_updated_at();

-- ========== PLUGIN SESSIONS ==========
create table if not exists public.plugin_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  place_id text,
  studio_version text,
  last_seen timestamptz not null default now(),
  online boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id)
);
grant select on public.plugin_sessions to authenticated;
grant all on public.plugin_sessions to service_role;
alter table public.plugin_sessions enable row level security;
drop policy if exists "sessions owner read" on public.plugin_sessions;
create policy "sessions owner read" on public.plugin_sessions
  for select to authenticated using (user_id = auth.uid());

-- ========== STUDIO ERRORS ==========
create table if not exists public.studio_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  action_id uuid references public.plugin_actions(id) on delete set null,
  source text not null default 'plugin',
  level text not null default 'error' check (level in ('warning','error','fatal')),
  message text not null,
  stack text,
  created_at timestamptz not null default now()
);
grant select, insert on public.studio_errors to authenticated;
grant all on public.studio_errors to service_role;
alter table public.studio_errors enable row level security;
drop policy if exists "errors owner read" on public.studio_errors;
create policy "errors owner read" on public.studio_errors
  for select to authenticated using (user_id = auth.uid());

create index if not exists idx_studio_errors_user on public.studio_errors(user_id, created_at desc);

-- ========== Backfill profiles for existing auth users (safe no-op normally) ==========
insert into public.profiles (id, username)
select u.id, split_part(coalesce(u.email,'user'), '@', 1) || '_' || substr(u.id::text,1,4)
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;


-- 20260625213709_055aa625-30d7-44d7-8dae-7a32dce0912b.sql

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;


-- 20260625223913_46a808f2-2b64-4553-b052-23662aae3f47.sql

-- Restrict profiles SELECT to owner only; create safe public view for non-sensitive columns
DROP POLICY IF EXISTS "profiles read own or public" ON public.profiles;
CREATE POLICY "profiles read own" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());

CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = true) AS
SELECT id, username, display_name, avatar_url, bio, roblox_username
FROM public.profiles
WHERE is_private = false;

GRANT SELECT ON public.public_profiles TO authenticated, anon;

-- Revoke direct EXECUTE on has_role from end-user roles; RLS policies still work
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;


-- 20260625231848_0b3887f2-37cf-404f-88b4-28f352158880.sql

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


-- 20260625231907_180f34c4-9c98-4c9c-8386-c66cd19e5fe3.sql
REVOKE EXECUTE ON FUNCTION public.refresh_my_credits() FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.refresh_my_credits();

-- 20260625232515_fad1113b-fffb-443b-9672-05e4955af9ec.sql
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'owner';

-- 20260625234422_d6fd3315-92bc-45a4-8e9a-cf0ebe64cf9a.sql
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

-- 20260625235026_5077b10b-417a-4d46-bd39-6d294ac0d82b.sql
create table if not exists public.plugin_pair_codes (
  code text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  plugin_token text,
  project_id uuid,
  claimed_at timestamptz,
  picked_up_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes')
);

create index if not exists plugin_pair_codes_user_idx on public.plugin_pair_codes(user_id);

grant select on public.plugin_pair_codes to authenticated;
grant all on public.plugin_pair_codes to service_role;

alter table public.plugin_pair_codes enable row level security;

drop policy if exists "owner reads own pair codes" on public.plugin_pair_codes;
create policy "owner reads own pair codes" on public.plugin_pair_codes
  for select to authenticated using (user_id = auth.uid());

-- 20260626001438_a2686da5-6661-4cf5-835c-096a8e79fef1.sql

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


-- 20260626003337_8b5b971a-37ed-4158-b78e-6a6b6103218b.sql
REVOKE ALL ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_my_plugin_token() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.regenerate_my_plugin_token() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_plugin_token() TO authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_my_plugin_token() TO authenticated;

REVOKE ALL ON TABLE public.profiles FROM anon, authenticated;

GRANT SELECT (
  id, username, display_name, avatar_url, bio, roblox_username,
  plan, credits, max_credits, language, is_private, settings,
  created_at, updated_at, is_admin, credits_reset_at
) ON public.profiles TO authenticated;

GRANT UPDATE (
  display_name, avatar_url, bio, roblox_username, language, is_private, settings
) ON public.profiles TO authenticated;

GRANT ALL ON TABLE public.profiles TO service_role;

-- 20260626005751_8bb956b1-ac62-401e-bcc7-c9bdfaf0ccac.sql
REVOKE EXECUTE ON FUNCTION public.get_my_plugin_token() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.regenerate_my_plugin_token() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_my_plugin_token() TO service_role;
GRANT EXECUTE ON FUNCTION public.regenerate_my_plugin_token() TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

-- 20260626022049_e7874399-6e39-4eac-aa05-ffcbb8abe234.sql

-- 1) Add donator role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'donator';

-- 2) Donation claims table
CREATE TABLE IF NOT EXISTS public.donation_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  paypal_reference text NOT NULL,
  amount_note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_note text,
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS donation_claims_user_id_idx ON public.donation_claims(user_id);
CREATE INDEX IF NOT EXISTS donation_claims_status_idx ON public.donation_claims(status);

GRANT SELECT, INSERT, UPDATE ON public.donation_claims TO authenticated;
GRANT ALL ON public.donation_claims TO service_role;

ALTER TABLE public.donation_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own donation claims"
  ON public.donation_claims FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "users create own donation claims"
  ON public.donation_claims FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "admins update donation claims"
  ON public.donation_claims FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE TRIGGER donation_claims_touch_updated_at
  BEFORE UPDATE ON public.donation_claims
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- 20260626023939_84261af7-432f-49bb-8eea-44a1527eeb4c.sql

-- Add moderator role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'moderator';

-- Ban fields on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS banned_reason text,
  ADD COLUMN IF NOT EXISTS banned_at timestamptz;

-- Admin/owner can read & update all profiles
DROP POLICY IF EXISTS "admins read all profiles" ON public.profiles;
CREATE POLICY "admins read all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

DROP POLICY IF EXISTS "admins update all profiles" ON public.profiles;
CREATE POLICY "admins update all profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

-- Admin/owner can read & manage all roles
DROP POLICY IF EXISTS "admins read all roles" ON public.user_roles;
CREATE POLICY "admins read all roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

DROP POLICY IF EXISTS "admins insert roles" ON public.user_roles;
CREATE POLICY "admins insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

DROP POLICY IF EXISTS "admins delete roles" ON public.user_roles;
CREATE POLICY "admins delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));


-- 20260626024004_e644febe-2c54-4fab-bb83-8154db743e09.sql

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
  caller_is_admin boolean := false;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    caller_is_admin := public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner');
  END IF;

  IF is_service OR caller_is_admin THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'cannot change profile id'; END IF;
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN RAISE EXCEPTION 'not allowed to change is_admin'; END IF;
  IF NEW.plan IS DISTINCT FROM OLD.plan THEN RAISE EXCEPTION 'not allowed to change plan'; END IF;
  IF NEW.credits IS DISTINCT FROM OLD.credits THEN RAISE EXCEPTION 'not allowed to change credits'; END IF;
  IF NEW.max_credits IS DISTINCT FROM OLD.max_credits THEN RAISE EXCEPTION 'not allowed to change max_credits'; END IF;
  IF NEW.credits_reset_at IS DISTINCT FROM OLD.credits_reset_at THEN RAISE EXCEPTION 'not allowed to change credits_reset_at'; END IF;
  IF NEW.plugin_token IS DISTINCT FROM OLD.plugin_token THEN RAISE EXCEPTION 'plugin_token can only be rotated via regenerate_my_plugin_token()'; END IF;
  IF NEW.username IS DISTINCT FROM OLD.username THEN RAISE EXCEPTION 'not allowed to change username'; END IF;
  IF NEW.banned IS DISTINCT FROM OLD.banned THEN RAISE EXCEPTION 'not allowed to change ban status'; END IF;
  IF NEW.banned_reason IS DISTINCT FROM OLD.banned_reason THEN RAISE EXCEPTION 'not allowed to change ban reason'; END IF;
  IF NEW.banned_at IS DISTINCT FROM OLD.banned_at THEN RAISE EXCEPTION 'not allowed to change ban time'; END IF;

  RETURN NEW;
END;
$function$;


-- 20260626024252_8c0b5490-594a-4ed3-8f26-cd26960b9ccf.sql

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


-- 20260626024703_1682d8bd-c63d-4277-8e53-87397e874672.sql
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

UPDATE public.profiles
   SET is_admin = true,
       plan = 'Owner',
       max_credits = GREATEST(max_credits, 1000000),
       credits = GREATEST(credits, 1000000)
 WHERE id IN (SELECT user_id FROM public.user_roles WHERE role = 'owner');

UPDATE public.profiles
   SET is_admin = true
 WHERE id IN (SELECT user_id FROM public.user_roles WHERE role = 'admin');

-- 20260626024906_7db72d46-1214-4ee4-975b-1fabeae3fed4.sql
DROP POLICY IF EXISTS "admins read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "admins update all profiles" ON public.profiles;

DROP POLICY IF EXISTS "admins read all roles" ON public.user_roles;
DROP POLICY IF EXISTS "admins manage mod and donator" ON public.user_roles;
DROP POLICY IF EXISTS "admins remove mod and donator" ON public.user_roles;
DROP POLICY IF EXISTS "owner manages all roles" ON public.user_roles;

DROP POLICY IF EXISTS "users read own donation claims" ON public.donation_claims;
DROP POLICY IF EXISTS "admins update donation claims" ON public.donation_claims;

CREATE POLICY "users read own donation claims"
  ON public.donation_claims
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

UPDATE public.profiles
   SET is_admin = true,
       plan = 'Owner',
       max_credits = GREATEST(max_credits, 1000000),
       credits = GREATEST(credits, 1000000)
 WHERE id IN (SELECT user_id FROM public.user_roles WHERE role = 'owner');

UPDATE public.profiles
   SET is_admin = true
 WHERE id IN (SELECT user_id FROM public.user_roles WHERE role = 'admin');

-- 20260626030730_0140af0a-863d-410e-b81c-295281ab8309.sql
ALTER TABLE public.plugin_sessions ADD COLUMN IF NOT EXISTS last_scan jsonb, ADD COLUMN IF NOT EXISTS last_scan_at timestamptz;

-- 20260626121056_1eaa8fb8-b9fe-4bc9-bb2b-064ae18b9960.sql

CREATE TABLE public.model_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('text','image')),
  prompt TEXT,
  image_url TEXT,
  task_id TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  progress INT NOT NULL DEFAULT 0,
  model_url TEXT,
  thumbnail_url TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX model_generations_user_created_idx ON public.model_generations(user_id, created_at DESC);
CREATE INDEX model_generations_project_idx ON public.model_generations(project_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.model_generations TO authenticated;
GRANT ALL ON public.model_generations TO service_role;

ALTER TABLE public.model_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own model generations"
  ON public.model_generations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- 20260626121350_9d3f1b4b-a9f4-43f3-b757-8f865f58a804.sql

ALTER TABLE public.model_generations DROP CONSTRAINT IF EXISTS model_generations_mode_check;
ALTER TABLE public.model_generations ADD CONSTRAINT model_generations_mode_check
  CHECK (mode IN ('text','image','animation'));
ALTER TABLE public.model_generations ADD COLUMN IF NOT EXISTS animation_name TEXT;
ALTER TABLE public.model_generations ADD COLUMN IF NOT EXISTS parent_id UUID
  REFERENCES public.model_generations(id) ON DELETE SET NULL;


-- 20260626124331_98f1ec8e-b2c8-48b2-8b8a-8a3aa97ab7af.sql

ALTER TABLE public.model_generations ADD COLUMN IF NOT EXISTS model_urls jsonb;
ALTER TABLE public.model_generations ADD COLUMN IF NOT EXISTS texture_urls jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'model_generations_mode_check'
      AND conrelid = 'public.model_generations'::regclass
  ) THEN
    ALTER TABLE public.model_generations DROP CONSTRAINT model_generations_mode_check;
  END IF;
END $$;

ALTER TABLE public.model_generations
  ADD CONSTRAINT model_generations_mode_check
  CHECK (mode IN ('text','image','animation','texture','refine'));


-- 20260626124857_9a5e66f0-1a53-4543-a422-3573307a407a.sql

ALTER TABLE public.plugin_actions DROP CONSTRAINT IF EXISTS plugin_actions_kind_check;
ALTER TABLE public.plugin_actions ADD CONSTRAINT plugin_actions_kind_check CHECK (kind IN (
  'script','localscript','modulescript',
  'gui','screengui','frame','textlabel','textbutton','imagelabel',
  'folder','part','model','terrain','tool','sound','team',
  'remoteevent','remotefunction','bindableevent',
  'leaderstats','insert_asset','set_properties',
  'rename','move','delete','setting','run','run_lua'
));

ALTER TABLE public.studio_errors DROP CONSTRAINT IF EXISTS studio_errors_level_check;
ALTER TABLE public.studio_errors ADD CONSTRAINT studio_errors_level_check CHECK (level IN (
  'info','warn','warning','error','fatal'
));


-- 20260626125033_ff7fe415-5da7-448a-9779-965d16390914.sql
ALTER TABLE public.model_generations ALTER COLUMN project_id DROP NOT NULL;

-- 20260626143000_add_plugin_version_to_sessions.sql
ALTER TABLE public.plugin_sessions
ADD COLUMN IF NOT EXISTS plugin_version text;


-- 20260626170600_2f8f3803-5108-4d92-aa77-a6e6e96d94f1.sql
ALTER TABLE public.plugin_sessions
  ADD COLUMN IF NOT EXISTS plugin_version TEXT,
  ADD COLUMN IF NOT EXISTS studio_version TEXT,
  ADD COLUMN IF NOT EXISTS place_id TEXT;

-- 20260626182000_add_chat_message_images.sql
alter table public.chat_messages
  add column if not exists image_url text;


-- 20260626190000_add_art_style_to_model_generations.sql
-- Store the chosen Meshy art style on each generation so the auto-refine step
-- can decide whether PBR textures are compatible (PBR is skipped for sculpture).
ALTER TABLE public.model_generations
  ADD COLUMN IF NOT EXISTS art_style TEXT;


-- 20260627000927_e5c58345-da46-4c43-87a8-f3b4dd9fc5ff.sql
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 20260627003000_add_tripo_bridge_model_fields.sql
ALTER TABLE public.model_generations DROP CONSTRAINT IF EXISTS model_generations_mode_check;
ALTER TABLE public.model_generations ADD CONSTRAINT model_generations_mode_check
  CHECK (mode IN ('text','image','animation','texture','refine','tripo_api','tripo_bridge','external_model'));

ALTER TABLE public.model_generations ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE public.model_generations ADD COLUMN IF NOT EXISTS source_format TEXT;
ALTER TABLE public.model_generations ADD COLUMN IF NOT EXISTS bridge_status TEXT;
ALTER TABLE public.model_generations ADD COLUMN IF NOT EXISTS bridge_metadata JSONB;
ALTER TABLE public.model_generations ADD COLUMN IF NOT EXISTS roblox_asset_id TEXT;
ALTER TABLE public.model_generations ADD COLUMN IF NOT EXISTS roblox_operation_path TEXT;
ALTER TABLE public.model_generations ADD COLUMN IF NOT EXISTS roblox_upload_status TEXT;
ALTER TABLE public.model_generations ADD COLUMN IF NOT EXISTS roblox_upload_error TEXT;


-- 20260627004500_fix_plugin_action_kind_constraint.sql
ALTER TABLE public.plugin_actions DROP CONSTRAINT IF EXISTS plugin_actions_kind_check;
ALTER TABLE public.plugin_actions ADD CONSTRAINT plugin_actions_kind_check CHECK (kind IN (
  'script',
  'localscript',
  'modulescript',
  'gui',
  'screengui',
  'frame',
  'textlabel',
  'textbutton',
  'imagelabel',
  'folder',
  'part',
  'model',
  'terrain',
  'tool',
  'sound',
  'team',
  'remoteevent',
  'remotefunction',
  'bindableevent',
  'leaderstats',
  'insert_asset',
  'set_properties',
  'rename',
  'move',
  'delete',
  'setting',
  'run',
  'run_lua',
  'organize_project',
  'autofix_project',
  'scan_project'
));


-- 20260627011000_add_ui_generations.sql
create table if not exists public.ui_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  prompt text not null,
  style text not null default 'Modern',
  code text not null,
  concept_image_url text,
  model text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.ui_generations to authenticated;
grant all on public.ui_generations to service_role;

alter table public.ui_generations enable row level security;

drop policy if exists "ui generations owner all" on public.ui_generations;
create policy "ui generations owner all" on public.ui_generations
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists idx_ui_generations_user_created
  on public.ui_generations(user_id, created_at desc);

create index if not exists idx_ui_generations_project_created
  on public.ui_generations(project_id, created_at desc);

drop trigger if exists trg_ui_generations_updated on public.ui_generations;
create trigger trg_ui_generations_updated before update on public.ui_generations
  for each row execute function public.touch_updated_at();


-- 20260627012000_repair_tripo_bridge_schema_cache.sql
alter table public.model_generations add column if not exists source text;
alter table public.model_generations add column if not exists source_format text;
alter table public.model_generations add column if not exists bridge_status text;
alter table public.model_generations add column if not exists bridge_metadata jsonb;
alter table public.model_generations add column if not exists roblox_asset_id text;
alter table public.model_generations add column if not exists roblox_operation_path text;
alter table public.model_generations add column if not exists roblox_upload_status text;
alter table public.model_generations add column if not exists roblox_upload_error text;

notify pgrst, 'reload schema';


-- 20260629012121_9fbf2dd3-1ede-4d2f-bae0-c1da274059a4.sql

-- donation_claims: allow admins to update (approve/reject); block user updates/deletes implicitly
CREATE POLICY "Admins can update donation claims"
  ON public.donation_claims
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete donation claims"
  ON public.donation_claims
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- plugin_pair_codes: scope INSERT/UPDATE/DELETE to owner
CREATE POLICY "Users can insert own pair codes"
  ON public.plugin_pair_codes
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own pair codes"
  ON public.plugin_pair_codes
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own pair codes"
  ON public.plugin_pair_codes
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- plugin_sessions: scope INSERT/UPDATE/DELETE to owner
CREATE POLICY "Users can insert own plugin sessions"
  ON public.plugin_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own plugin sessions"
  ON public.plugin_sessions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own plugin sessions"
  ON public.plugin_sessions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- studio_errors: scope INSERT/DELETE to owner
CREATE POLICY "Users can insert own studio errors"
  ON public.studio_errors
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own studio errors"
  ON public.studio_errors
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());


-- 20260629013624_0c229eb0-2397-4aa1-91af-eee9332b802a.sql
CREATE TABLE public.playtest_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  place_id text,
  summary jsonb not null,
  findings jsonb not null,
  metrics jsonb not null,
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT, DELETE ON public.playtest_reports TO authenticated;
GRANT ALL ON public.playtest_reports TO service_role;
ALTER TABLE public.playtest_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own playtests" ON public.playtest_reports FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users insert own playtests" ON public.playtest_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete own playtests" ON public.playtest_reports FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX playtest_reports_user_created_idx ON public.playtest_reports(user_id, created_at desc);

-- 20260629014336_336a4d3f-a772-4ed4-ab61-7344a7e8d35a.sql
CREATE TABLE IF NOT EXISTS public.build_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Milestone',
  summary text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'manual',
  snapshot_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  parts_count int NOT NULL DEFAULT 0,
  scripts_count int NOT NULL DEFAULT 0,
  gui_count int NOT NULL DEFAULT 0,
  size_bytes int NOT NULL DEFAULT 0,
  place_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS build_milestones_project_idx ON public.build_milestones (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS build_milestones_user_idx ON public.build_milestones (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.build_milestones TO authenticated;
GRANT ALL ON public.build_milestones TO service_role;

ALTER TABLE public.build_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "build_milestones_owner_select" ON public.build_milestones
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "build_milestones_owner_insert" ON public.build_milestones
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "build_milestones_owner_update" ON public.build_milestones
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "build_milestones_owner_delete" ON public.build_milestones
  FOR DELETE TO authenticated USING (user_id = auth.uid());

ALTER TABLE public.plugin_actions DROP CONSTRAINT IF EXISTS plugin_actions_kind_check;
ALTER TABLE public.plugin_actions ADD CONSTRAINT plugin_actions_kind_check CHECK (kind IN (
  'script','localscript','modulescript','gui','screengui','frame','textlabel','textbutton','imagelabel',
  'folder','part','model','terrain','tool','sound','team','remoteevent','remotefunction','bindableevent',
  'leaderstats','insert_asset','set_properties','rename','move','delete','setting','run','run_lua',
  'organize_project','autofix_project','scan_project','playtest','snapshot','restore_snapshot'
));

-- 20260629015117_03f89522-2158-4c0a-ad34-6f19e9dce5e0.sql
CREATE TABLE public.project_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'lore',
  importance INT NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_memory TO authenticated;
GRANT ALL ON public.project_memory TO service_role;

ALTER TABLE public.project_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own project memory"
  ON public.project_memory FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX project_memory_project_idx ON public.project_memory(project_id, importance DESC, updated_at DESC);

CREATE TRIGGER project_memory_touch
  BEFORE UPDATE ON public.project_memory
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 20260629015504_8bb19d81-c0f2-4c5e-9d27-711feebcf92d.sql
CREATE TABLE public.agent_pipeline_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  total_actions INT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_pipeline_runs TO authenticated;
GRANT ALL ON public.agent_pipeline_runs TO service_role;

ALTER TABLE public.agent_pipeline_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own pipelines"
  ON public.agent_pipeline_runs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX agent_pipeline_runs_project_idx
  ON public.agent_pipeline_runs(project_id, created_at DESC);

CREATE TRIGGER agent_pipeline_runs_touch
  BEFORE UPDATE ON public.agent_pipeline_runs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.agent_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pipeline_id UUID NOT NULL REFERENCES public.agent_pipeline_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  summary TEXT,
  actions_count INT NOT NULL DEFAULT 0,
  position INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_runs TO authenticated;
GRANT ALL ON public.agent_runs TO service_role;

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own agent runs"
  ON public.agent_runs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX agent_runs_pipeline_idx
  ON public.agent_runs(pipeline_id, position);

CREATE TRIGGER agent_runs_touch
  BEFORE UPDATE ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 20260629021928_199991d6-b4c2-471c-bb9b-448f1fadff8b.sql
create extension if not exists vector;

create table if not exists public.kb_chunks (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  title text not null,
  content text not null,
  source text,
  source_hash text unique,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

grant select on public.kb_chunks to authenticated;
grant all    on public.kb_chunks to service_role;

alter table public.kb_chunks enable row level security;

create policy "kb_chunks_select_authenticated"
  on public.kb_chunks
  for select
  to authenticated
  using (true);

create index if not exists kb_chunks_topic_idx on public.kb_chunks (topic);
create index if not exists kb_chunks_embedding_idx
  on public.kb_chunks using hnsw (embedding vector_cosine_ops);

create or replace function public.match_kb_chunks(
  query_embedding vector(1536),
  match_topic text,
  match_count int default 5
)
returns table (
  id uuid,
  topic text,
  title text,
  content text,
  source text,
  similarity float
)
language sql
stable
security definer
set search_path = public
as $$
  select
    k.id,
    k.topic,
    k.title,
    k.content,
    k.source,
    1 - (k.embedding <=> query_embedding) as similarity
  from public.kb_chunks k
  where k.embedding is not null
    and k.topic = match_topic
  order by k.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_kb_chunks(vector, text, int) to authenticated, service_role;

-- 20260629021947_9230f369-39ab-4f2b-80a0-16bc9e727583.sql
create or replace function public.match_kb_chunks(
  query_embedding vector(1536),
  match_topic text,
  match_count int default 5
)
returns table (
  id uuid,
  topic text,
  title text,
  content text,
  source text,
  similarity float
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    k.id,
    k.topic,
    k.title,
    k.content,
    k.source,
    1 - (k.embedding <=> query_embedding) as similarity
  from public.kb_chunks k
  where k.embedding is not null
    and k.topic = match_topic
  order by k.embedding <=> query_embedding
  limit match_count;
$$;

-- 20260629022002_0a022171-5bc6-408c-ac93-fdf0b68784ca.sql
create schema if not exists extensions;
alter extension vector set schema extensions;
grant usage on schema extensions to authenticated, service_role, anon;

-- 20260629031615_8d49ea9f-fe6d-4fcc-80c5-2b02d5ddd2b5.sql

ALTER TABLE public.agent_pipeline_runs
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS latest_report_id UUID REFERENCES public.playtest_reports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS repair_actions_count INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS agent_pipeline_runs_awaiting_idx
  ON public.agent_pipeline_runs (user_id, verification_status, completed_at DESC)
  WHERE verification_status = 'awaiting';


-- 20260630003241_ec59507c-25dd-4af0-8e5e-95e68a129623.sql

-- collaborator roles enum
DO $$ BEGIN
  CREATE TYPE public.collab_role AS ENUM ('editor', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.invite_status AS ENUM ('pending', 'accepted', 'declined', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ project_collaborators ============
CREATE TABLE IF NOT EXISTS public.project_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.collab_role NOT NULL DEFAULT 'editor',
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_pc_project ON public.project_collaborators(project_id);
CREATE INDEX IF NOT EXISTS idx_pc_user ON public.project_collaborators(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_collaborators TO authenticated;
GRANT ALL ON public.project_collaborators TO service_role;
ALTER TABLE public.project_collaborators ENABLE ROW LEVEL SECURITY;

-- helper: can the user access this project (owner or collaborator)
CREATE OR REPLACE FUNCTION public.can_access_project(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = _project_id AND p.user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.project_collaborators c
    WHERE c.project_id = _project_id AND c.user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_project(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = _project_id AND p.user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.project_collaborators c
    WHERE c.project_id = _project_id AND c.user_id = _user_id AND c.role = 'editor'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_project_owner(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = _project_id AND p.user_id = _user_id);
$$;

CREATE POLICY "collab view own membership or project access"
  ON public.project_collaborators FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_access_project(project_id, auth.uid()));

CREATE POLICY "collab owner manages"
  ON public.project_collaborators FOR INSERT TO authenticated
  WITH CHECK (public.is_project_owner(project_id, auth.uid()));

CREATE POLICY "collab owner update"
  ON public.project_collaborators FOR UPDATE TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()))
  WITH CHECK (public.is_project_owner(project_id, auth.uid()));

CREATE POLICY "collab owner or self delete"
  ON public.project_collaborators FOR DELETE TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()) OR user_id = auth.uid());

-- ============ project_invites ============
CREATE TABLE IF NOT EXISTS public.project_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_username text NOT NULL,
  invitee_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  role public.collab_role NOT NULL DEFAULT 'editor',
  status public.invite_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_inv_project ON public.project_invites(project_id);
CREATE INDEX IF NOT EXISTS idx_inv_invitee ON public.project_invites(invitee_user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_invites TO authenticated;
GRANT ALL ON public.project_invites TO service_role;
ALTER TABLE public.project_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invites visible to owner or invitee"
  ON public.project_invites FOR SELECT TO authenticated
  USING (invited_by = auth.uid() OR invitee_user_id = auth.uid() OR public.is_project_owner(project_id, auth.uid()));

CREATE POLICY "invites owner inserts"
  ON public.project_invites FOR INSERT TO authenticated
  WITH CHECK (public.is_project_owner(project_id, auth.uid()) AND invited_by = auth.uid());

CREATE POLICY "invites owner or invitee update"
  ON public.project_invites FOR UPDATE TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()) OR invitee_user_id = auth.uid())
  WITH CHECK (public.is_project_owner(project_id, auth.uid()) OR invitee_user_id = auth.uid());

CREATE POLICY "invites owner delete"
  ON public.project_invites FOR DELETE TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()));

-- ============ project_chat_messages ============
CREATE TABLE IF NOT EXISTS public.project_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pcm_project ON public.project_chat_messages(project_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_chat_messages TO authenticated;
GRANT ALL ON public.project_chat_messages TO service_role;
ALTER TABLE public.project_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team chat read with access"
  ON public.project_chat_messages FOR SELECT TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "team chat insert with access"
  ON public.project_chat_messages FOR INSERT TO authenticated
  WITH CHECK (public.can_access_project(project_id, auth.uid()) AND user_id = auth.uid());
CREATE POLICY "team chat delete own or owner"
  ON public.project_chat_messages FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_project_owner(project_id, auth.uid()));

-- ============ project_comments ============
CREATE TABLE IF NOT EXISTS public.project_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  anchor text,
  body text NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pcc_project ON public.project_comments(project_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_comments TO authenticated;
GRANT ALL ON public.project_comments TO service_role;
ALTER TABLE public.project_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comments read with access"
  ON public.project_comments FOR SELECT TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "comments insert with access"
  ON public.project_comments FOR INSERT TO authenticated
  WITH CHECK (public.can_access_project(project_id, auth.uid()) AND user_id = auth.uid());
CREATE POLICY "comments update own or owner"
  ON public.project_comments FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_project_owner(project_id, auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_project_owner(project_id, auth.uid()));
CREATE POLICY "comments delete own or owner"
  ON public.project_comments FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_project_owner(project_id, auth.uid()));

-- ============ project_activity ============
CREATE TABLE IF NOT EXISTS public.project_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL,
  summary text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pa_project ON public.project_activity(project_id, created_at DESC);
GRANT SELECT, INSERT ON public.project_activity TO authenticated;
GRANT ALL ON public.project_activity TO service_role;
ALTER TABLE public.project_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity read with access"
  ON public.project_activity FOR SELECT TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "activity insert with access"
  ON public.project_activity FOR INSERT TO authenticated
  WITH CHECK (public.can_access_project(project_id, auth.uid()) AND (user_id = auth.uid() OR user_id IS NULL));

-- ============ extend projects access to collaborators ============
DROP POLICY IF EXISTS "projects owner all" ON public.projects;
CREATE POLICY "projects accessible to owner or collaborator"
  ON public.projects FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_access_project(id, auth.uid()));
CREATE POLICY "projects insert by owner"
  ON public.projects FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "projects update owner or editor"
  ON public.projects FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.can_edit_project(id, auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.can_edit_project(id, auth.uid()));
CREATE POLICY "projects delete owner only"
  ON public.projects FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ============ realtime ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_activity;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_collaborators;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_invites;

-- ============ RPC: accept invite (atomic) ============
CREATE OR REPLACE FUNCTION public.accept_project_invite(_invite_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  inv public.project_invites%ROWTYPE;
BEGIN
  SELECT * INTO inv FROM public.project_invites WHERE id = _invite_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite not found'; END IF;
  IF inv.status <> 'pending' THEN RAISE EXCEPTION 'invite is not pending'; END IF;
  IF inv.invitee_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'not your invite'; END IF;

  INSERT INTO public.project_collaborators (project_id, user_id, role, added_by)
  VALUES (inv.project_id, auth.uid(), inv.role, inv.invited_by)
  ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  UPDATE public.project_invites SET status = 'accepted', responded_at = now() WHERE id = _invite_id;

  INSERT INTO public.project_activity (project_id, user_id, kind, summary)
  VALUES (inv.project_id, auth.uid(), 'collab.joined', 'joined the project');

  RETURN inv.project_id;
END $$;


-- 20260630003300_b3879e81-2b73-47d1-b2ff-d98ae389b1be.sql

REVOKE EXECUTE ON FUNCTION public.can_access_project(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_edit_project(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_project_owner(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.accept_project_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_project_invite(uuid) TO authenticated;


-- 20260630004421_fa84cff9-16b6-4855-9440-111f9fb416d2.sql

CREATE TABLE IF NOT EXISTS public.project_qa_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  overall_score int NOT NULL DEFAULT 0,
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_used text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qa_project ON public.project_qa_reports(project_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.project_qa_reports TO authenticated;
GRANT ALL ON public.project_qa_reports TO service_role;
ALTER TABLE public.project_qa_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qa read with access" ON public.project_qa_reports FOR SELECT TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "qa insert with access" ON public.project_qa_reports FOR INSERT TO authenticated
  WITH CHECK (public.can_access_project(project_id, auth.uid()) AND user_id = auth.uid());
CREATE POLICY "qa delete own or owner" ON public.project_qa_reports FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_project_owner(project_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.project_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  prompt text NOT NULL,
  data_url text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pa_project_kind ON public.project_assets(project_id, kind, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.project_assets TO authenticated;
GRANT ALL ON public.project_assets TO service_role;
ALTER TABLE public.project_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assets read with access" ON public.project_assets FOR SELECT TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "assets insert with access" ON public.project_assets FOR INSERT TO authenticated
  WITH CHECK (public.can_access_project(project_id, auth.uid()) AND user_id = auth.uid());
CREATE POLICY "assets delete own or owner" ON public.project_assets FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_project_owner(project_id, auth.uid()));


-- 20260630122339_f4e63b0d-9161-4730-85ae-ff531f2dfdcc.sql

CREATE TABLE public.build_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  prompt text NOT NULL,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  est_credits integer NOT NULL DEFAULT 0,
  est_seconds integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  model_used text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  executed_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.build_plans TO authenticated;
GRANT ALL ON public.build_plans TO service_role;

ALTER TABLE public.build_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own build plans"
  ON public.build_plans
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_build_plans_project ON public.build_plans(project_id, created_at DESC);

CREATE TRIGGER build_plans_touch
  BEFORE UPDATE ON public.build_plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- 20260701045500_16a80201-0af0-4192-b667-268109983f89.sql

CREATE TABLE public.execution_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'plugin',
  total INT NOT NULL DEFAULT 0,
  ok_count INT NOT NULL DEFAULT 0,
  fail_count INT NOT NULL DEFAULT 0,
  skip_count INT NOT NULL DEFAULT 0,
  repair_count INT NOT NULL DEFAULT 0,
  retry_count INT NOT NULL DEFAULT 0,
  duration_ms INT NOT NULL DEFAULT 0,
  plan JSONB NOT NULL DEFAULT '[]'::jsonb,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.execution_reports TO authenticated;
GRANT ALL ON public.execution_reports TO service_role;

ALTER TABLE public.execution_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own execution reports"
  ON public.execution_reports FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX execution_reports_user_project_created_idx
  ON public.execution_reports (user_id, project_id, created_at DESC);


-- 20260701050453_e34657cc-f71f-49d8-a05c-d50526872051.sql

CREATE TABLE public.ai_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  area TEXT NOT NULL DEFAULT 'general',
  severity TEXT NOT NULL DEFAULT 'medium',
  title TEXT NOT NULL,
  detail TEXT,
  suggested_prompt TEXT,
  auto_fixable BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL DEFAULT 'post_build',
  dismissed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_suggestions TO authenticated;
GRANT ALL ON public.ai_suggestions TO service_role;

ALTER TABLE public.ai_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own project suggestions"
  ON public.ai_suggestions FOR SELECT
  TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));

CREATE POLICY "Users update their own project suggestions"
  ON public.ai_suggestions FOR UPDATE
  TO authenticated
  USING (public.can_edit_project(project_id, auth.uid()))
  WITH CHECK (public.can_edit_project(project_id, auth.uid()));

CREATE POLICY "Users delete their own project suggestions"
  ON public.ai_suggestions FOR DELETE
  TO authenticated
  USING (public.can_edit_project(project_id, auth.uid()));

CREATE INDEX ai_suggestions_project_created_idx ON public.ai_suggestions (project_id, created_at DESC);


-- 20260701050957_2aefbad7-ff5a-49e7-b248-a3503e54a0bf.sql

CREATE TABLE public.dev_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  goal TEXT NOT NULL,
  quality_target TEXT NOT NULL DEFAULT 'polished',
  status TEXT NOT NULL DEFAULT 'active',
  auto_run BOOLEAN NOT NULL DEFAULT true,
  summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  finished_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE public.dev_session_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.dev_sessions(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  position INT NOT NULL DEFAULT 0,
  agent TEXT NOT NULL DEFAULT 'generalist',
  title TEXT NOT NULL,
  instruction TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  finished_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dev_sessions TO authenticated;
GRANT ALL ON public.dev_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dev_session_tasks TO authenticated;
GRANT ALL ON public.dev_session_tasks TO service_role;

ALTER TABLE public.dev_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dev_session_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Access project dev sessions"
  ON public.dev_sessions FOR SELECT
  TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "Edit project dev sessions"
  ON public.dev_sessions FOR INSERT
  TO authenticated
  WITH CHECK (public.can_edit_project(project_id, auth.uid()));
CREATE POLICY "Update project dev sessions"
  ON public.dev_sessions FOR UPDATE
  TO authenticated
  USING (public.can_edit_project(project_id, auth.uid()))
  WITH CHECK (public.can_edit_project(project_id, auth.uid()));
CREATE POLICY "Delete project dev sessions"
  ON public.dev_sessions FOR DELETE
  TO authenticated
  USING (public.can_edit_project(project_id, auth.uid()));

CREATE POLICY "Access project dev tasks"
  ON public.dev_session_tasks FOR SELECT
  TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "Edit project dev tasks"
  ON public.dev_session_tasks FOR INSERT
  TO authenticated
  WITH CHECK (public.can_edit_project(project_id, auth.uid()));
CREATE POLICY "Update project dev tasks"
  ON public.dev_session_tasks FOR UPDATE
  TO authenticated
  USING (public.can_edit_project(project_id, auth.uid()))
  WITH CHECK (public.can_edit_project(project_id, auth.uid()));
CREATE POLICY "Delete project dev tasks"
  ON public.dev_session_tasks FOR DELETE
  TO authenticated
  USING (public.can_edit_project(project_id, auth.uid()));

CREATE INDEX dev_sessions_project_idx ON public.dev_sessions (project_id, created_at DESC);
CREATE INDEX dev_session_tasks_session_idx ON public.dev_session_tasks (session_id, position);


-- 20260701053039_4be53b49-d4dd-4db2-9d82-a790661597ea.sql

-- Broadcasts
CREATE TABLE IF NOT EXISTS public.admin_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  level text NOT NULL DEFAULT 'info',
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
GRANT SELECT ON public.admin_broadcasts TO authenticated, anon;
GRANT ALL ON public.admin_broadcasts TO service_role;
ALTER TABLE public.admin_broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read active broadcasts" ON public.admin_broadcasts FOR SELECT USING (active = true);
CREATE POLICY "admins manage broadcasts" ON public.admin_broadcasts FOR ALL
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

-- Audit log
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  target_type text,
  target_id text,
  previous_value jsonb,
  new_value jsonb,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_logs_created_at_idx ON public.admin_audit_logs (created_at DESC);
GRANT SELECT ON public.admin_audit_logs TO authenticated;
GRANT ALL ON public.admin_audit_logs TO service_role;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read audit" ON public.admin_audit_logs FOR SELECT
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

-- Settings key/value
CREATE TABLE IF NOT EXISTS public.admin_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_settings TO authenticated, anon;
GRANT ALL ON public.admin_settings TO service_role;
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read settings" ON public.admin_settings FOR SELECT USING (true);
CREATE POLICY "admins write settings" ON public.admin_settings FOR ALL
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

-- Seed default settings
INSERT INTO public.admin_settings (key, value) VALUES
  ('maintenance', '{"enabled": false, "message": ""}'::jsonb),
  ('registration', '{"open": true}'::jsonb),
  ('features', '{"experimental": false, "voice": true, "toolbox": true}'::jsonb),
  ('default_model', '{"id": "google/gemini-2.5-flash"}'::jsonb)
ON CONFLICT (key) DO NOTHING;


-- 20260701054004_3921b318-7e2b-4d70-af4e-6fcce7d7dd16.sql

-- Public profile visibility + rate limiting foundation

-- Allow anyone to view non-private profiles (public developer showcase)
DROP POLICY IF EXISTS "profiles public read" ON public.profiles;
CREATE POLICY "profiles public read"
  ON public.profiles FOR SELECT
  TO anon, authenticated
  USING (is_private = false);

GRANT SELECT (id, username, display_name, avatar_url, bio, roblox_username, plan, created_at, is_private)
  ON public.profiles TO anon;

-- Rate limiting table (per user, per action, sliding window)
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  ip_hash text,
  action text NOT NULL,
  count integer NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_user_action ON public.rate_limits(user_id, action, window_start DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limits_ip_action ON public.rate_limits(ip_hash, action, window_start DESC);

GRANT SELECT ON public.rate_limits TO authenticated;
GRANT ALL ON public.rate_limits TO service_role;

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rate_limits read own"
  ON public.rate_limits FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Badges (achievement tracking)
CREATE TABLE IF NOT EXISTS public.user_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_key text NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, badge_key)
);

GRANT SELECT ON public.user_badges TO anon, authenticated;
GRANT INSERT ON public.user_badges TO authenticated;
GRANT ALL ON public.user_badges TO service_role;

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "badges public read"
  ON public.user_badges FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "badges insert own"
  ON public.user_badges FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());


-- 20260701055159_e120a776-736b-4e89-90c0-2daf30df849c.sql

-- 1. Public profiles view (safe columns only) + own-row RLS on profiles
DROP POLICY IF EXISTS "profiles public read" ON public.profiles;
DROP POLICY IF EXISTS "profiles read own" ON public.profiles;
CREATE POLICY "profiles read own"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = off) AS
SELECT id, username, display_name, avatar_url, bio, roblox_username, plan, created_at, is_private, language
FROM public.profiles
WHERE is_private = false;

GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- Revoke the broad anon column grant introduced earlier (view replaces it)
REVOKE SELECT ON public.profiles FROM anon;

-- 2. user_badges: revoke self-insert, add validated RPC
DROP POLICY IF EXISTS "badges insert own" ON public.user_badges;
REVOKE INSERT ON public.user_badges FROM authenticated;

CREATE OR REPLACE FUNCTION public.award_badge(_badge_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  allowed constant text[] := ARRAY[
    'early_builder','first_game','ten_builds','hundred_scripts',
    'plugin_connected','bug_fixer','ui_designer','marketplace_creator'
  ];
  qualifies boolean := false;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (_badge_key = ANY(allowed)) THEN RAISE EXCEPTION 'unknown badge'; END IF;

  -- Server-side eligibility validation
  IF _badge_key = 'first_game' OR _badge_key = 'ten_builds' THEN
    SELECT (COUNT(*) >= CASE WHEN _badge_key = 'ten_builds' THEN 10 ELSE 1 END) INTO qualifies
      FROM public.projects WHERE user_id = uid;
  ELSIF _badge_key = 'hundred_scripts' THEN
    SELECT (COUNT(*) >= 100) INTO qualifies
      FROM public.plugin_actions
      WHERE user_id = uid AND kind IN ('script','localscript','modulescript');
  ELSIF _badge_key = 'plugin_connected' THEN
    SELECT EXISTS(SELECT 1 FROM public.plugin_sessions WHERE user_id = uid) INTO qualifies;
  ELSIF _badge_key = 'bug_fixer' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.plugin_actions
      WHERE user_id = uid AND kind IN ('autofix_project','scan_project')
    ) INTO qualifies;
  ELSIF _badge_key = 'ui_designer' THEN
    SELECT EXISTS(SELECT 1 FROM public.ui_generations WHERE user_id = uid) INTO qualifies;
  ELSIF _badge_key = 'early_builder' THEN
    qualifies := true;
  ELSE
    qualifies := false;
  END IF;

  IF NOT qualifies THEN RETURN false; END IF;

  INSERT INTO public.user_badges (user_id, badge_key)
  VALUES (uid, _badge_key)
  ON CONFLICT (user_id, badge_key) DO NOTHING;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.award_badge(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_badge(text) TO authenticated;

-- 3. Restrict public-role policies to authenticated
DROP POLICY IF EXISTS "Users manage their own pipelines" ON public.agent_pipeline_runs;
CREATE POLICY "Users manage their own pipelines"
  ON public.agent_pipeline_runs FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage their own agent runs" ON public.agent_runs;
CREATE POLICY "Users manage their own agent runs"
  ON public.agent_runs FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage their own project memory" ON public.project_memory;
CREATE POLICY "Users manage their own project memory"
  ON public.project_memory FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. admin_settings: authenticated only, and remove sensitive-key exposure risk
DROP POLICY IF EXISTS "read settings" ON public.admin_settings;
CREATE POLICY "read settings"
  ON public.admin_settings FOR SELECT
  TO authenticated
  USING (key NOT LIKE 'secret.%' AND key NOT LIKE 'internal.%');

-- 5. Revoke EXECUTE on trigger-only SECURITY DEFINER helpers
REVOKE EXECUTE ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, authenticated, anon;


-- 20260701055230_69bed4cc-35cd-4e4d-8446-770b647287bd.sql

-- Drop the security-definer view; replace with column-level grants on the base table
DROP VIEW IF EXISTS public.public_profiles;

-- Reset SELECT grants on profiles
REVOKE SELECT ON public.profiles FROM anon, authenticated;

-- Safe display columns visible to everyone (subject to row policy)
GRANT SELECT (id, username, display_name, avatar_url, bio, roblox_username, plan, created_at, is_private, language)
  ON public.profiles TO anon, authenticated;

-- Row policy: anyone can see rows that are NOT private (columns are restricted by grants above)
DROP POLICY IF EXISTS "profiles read public safe" ON public.profiles;
CREATE POLICY "profiles read public safe"
  ON public.profiles FOR SELECT
  TO anon, authenticated
  USING (is_private = false);

-- Own-row policy remains (grants would still cap columns; own-full-row reads go through supabaseAdmin)
-- Already created in prior migration as "profiles read own"

-- Recreate view as security_invoker so the linter is happy; view will pass through RLS + column grants
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = on) AS
SELECT id, username, display_name, avatar_url, bio, roblox_username, plan, created_at, is_private, language
FROM public.profiles
WHERE is_private = false;

GRANT SELECT ON public.public_profiles TO anon, authenticated;


-- 20260701062751_537b7a12-6ca1-46ec-92b5-0585dcfeeb53.sql

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS roblox_user_id bigint,
  ADD COLUMN IF NOT EXISTS roblox_display_name text,
  ADD COLUMN IF NOT EXISTS roblox_avatar_url text,
  ADD COLUMN IF NOT EXISTS roblox_headshot_url text,
  ADD COLUMN IF NOT EXISTS roblox_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS roblox_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS roblox_last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS roblox_public boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS roblox_experiences jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_roblox_user_id_unique
  ON public.profiles (roblox_user_id)
  WHERE roblox_user_id IS NOT NULL;


-- 20260701064441_710b4607-b334-4afd-9f6c-e442ca97249d.sql
-- Drop the overly-broad SELECT policy that exposed the whole profiles row
DROP POLICY IF EXISTS "profiles read public safe" ON public.profiles;

-- Safe, read-only projection of the profiles table for cross-user reads.
-- Runs as the view owner (postgres) so the base table can remain locked down.
CREATE OR REPLACE VIEW public.profiles_public AS
  SELECT
    id,
    username,
    display_name,
    avatar_url,
    bio,
    roblox_username,
    roblox_display_name,
    roblox_avatar_url,
    roblox_headshot_url,
    roblox_verified_at,
    roblox_created_at,
    roblox_last_synced_at,
    roblox_public,
    roblox_experiences,
    plan,
    is_private,
    created_at
  FROM public.profiles;

GRANT SELECT ON public.profiles_public TO anon, authenticated;

-- Belt-and-suspenders: revoke leftover column grants on the base table so
-- anon/authenticated cannot SELECT any columns of another user's profile
-- directly. Own-profile reads go through the admin client server-side.
REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT (id, username, display_name, avatar_url, bio, roblox_username, plan, language, is_private, created_at)
  ON public.profiles FROM authenticated;

COMMENT ON VIEW public.profiles_public IS
  'Public, sanitized projection of profiles. Never expose credits, plugin_token, settings, is_admin, banned_*, max_credits, roblox_user_id, or any other sensitive column here.';

-- 20260701065357_ee7efcb2-705a-418c-a5f6-ea019b75d503.sql

-- 1) profiles_public: rebuild as SECURITY INVOKER, expose safe columns only.
DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public
  WITH (security_invoker = true) AS
  SELECT id, username, display_name, avatar_url, bio, roblox_username, roblox_display_name,
         roblox_avatar_url, roblox_headshot_url, roblox_verified_at, roblox_created_at,
         roblox_last_synced_at, roblox_public, roblox_experiences, plan, is_private, created_at
    FROM public.profiles;

COMMENT ON VIEW public.profiles_public IS
  'Public, sanitized projection of profiles. Never expose credits, plugin_token, settings, is_admin, banned_*, max_credits, roblox_user_id, or any other sensitive column here.';

GRANT SELECT ON public.profiles_public TO anon, authenticated;

-- Grant only safe columns on the base table so the invoker-scoped view can read them.
GRANT SELECT (id, username, display_name, avatar_url, bio, roblox_username, roblox_display_name,
              roblox_avatar_url, roblox_headshot_url, roblox_verified_at, roblox_created_at,
              roblox_last_synced_at, roblox_public, roblox_experiences, plan, is_private, created_at)
  ON public.profiles TO anon, authenticated;

-- Row-level: allow reading any row's safe columns; column privileges above block sensitive ones.
DROP POLICY IF EXISTS "profiles read safe columns" ON public.profiles;
CREATE POLICY "profiles read safe columns" ON public.profiles
  FOR SELECT TO anon, authenticated
  USING (true);

-- 2) plugin_pair_codes: clear plugin_token once pairing completes or code expires.
CREATE OR REPLACE FUNCTION public.pair_code_clear_token()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.picked_up_at IS NOT NULL AND (OLD.picked_up_at IS NULL OR OLD.picked_up_at IS DISTINCT FROM NEW.picked_up_at) THEN
    NEW.plugin_token := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pair_code_clear_token ON public.plugin_pair_codes;
CREATE TRIGGER trg_pair_code_clear_token
  BEFORE UPDATE ON public.plugin_pair_codes
  FOR EACH ROW EXECUTE FUNCTION public.pair_code_clear_token();

-- Sweep already-claimed or expired rows.
UPDATE public.plugin_pair_codes
   SET plugin_token = NULL
 WHERE plugin_token IS NOT NULL
   AND (picked_up_at IS NOT NULL OR expires_at < now());

-- 3) admin_settings: restrict SELECT to admin/owner roles only.
DROP POLICY IF EXISTS "read settings" ON public.admin_settings;
CREATE POLICY "admins read settings" ON public.admin_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role));


-- 20260701065851_d967b0d2-9c6d-4f85-80f7-436f22066d09.sql

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_build_mode text NOT NULL DEFAULT 'smart',
  ADD COLUMN IF NOT EXISTS default_execution_mode text NOT NULL DEFAULT 'safe',
  ADD COLUMN IF NOT EXISTS default_model text,
  ADD COLUMN IF NOT EXISTS default_language text,
  ADD COLUMN IF NOT EXISTS roblox_place_id bigint,
  ADD COLUMN IF NOT EXISTS roblox_universe_id bigint;

DO $$ BEGIN
  ALTER TABLE public.projects
    ADD CONSTRAINT projects_default_build_mode_check CHECK (default_build_mode IN ('fast','smart','deep'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- 20260701065926_c4e000a9-2128-48ca-9a7e-dc25bb4f1c27.sql

-- Storage policies for project-thumbnails bucket
DROP POLICY IF EXISTS "project thumbs public read" ON storage.objects;
CREATE POLICY "project thumbs public read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'project-thumbnails');

DROP POLICY IF EXISTS "project thumbs owner write" ON storage.objects;
CREATE POLICY "project thumbs owner write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-thumbnails'
    AND public.can_edit_project((split_part(name, '/', 1))::uuid, auth.uid())
  );

DROP POLICY IF EXISTS "project thumbs owner update" ON storage.objects;
CREATE POLICY "project thumbs owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'project-thumbnails'
    AND public.can_edit_project((split_part(name, '/', 1))::uuid, auth.uid())
  );

DROP POLICY IF EXISTS "project thumbs owner delete" ON storage.objects;
CREATE POLICY "project thumbs owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-thumbnails'
    AND public.can_edit_project((split_part(name, '/', 1))::uuid, auth.uid())
  );

-- Security fix: drop the broad SELECT policy and revert the sanitized view
-- to run with definer privileges so it can read the base table while sensitive
-- columns remain ungranted to anon/authenticated (memory covers this).
DROP POLICY IF EXISTS "profiles read safe columns" ON public.profiles;

REVOKE SELECT (id, username, display_name, avatar_url, bio, roblox_username, roblox_display_name,
               roblox_avatar_url, roblox_headshot_url, roblox_verified_at, roblox_created_at,
               roblox_last_synced_at, roblox_public, roblox_experiences, plan, is_private, created_at)
  ON public.profiles FROM anon, authenticated;

DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public
  WITH (security_invoker = false) AS
  SELECT id, username, display_name, avatar_url, bio, roblox_username, roblox_display_name,
         roblox_avatar_url, roblox_headshot_url, roblox_verified_at, roblox_created_at,
         roblox_last_synced_at, roblox_public, roblox_experiences, plan, is_private, created_at
    FROM public.profiles;

COMMENT ON VIEW public.profiles_public IS
  'Sanitized cross-user projection of profiles. Owner (postgres) runs the query so sensitive columns are never granted to anon/authenticated. Do not expose credits, plugin_token, settings, is_admin, banned_*, max_credits, roblox_user_id.';

GRANT SELECT ON public.profiles_public TO anon, authenticated;


-- 20260701080946_411d2bae-7a47-4c9b-b34b-ebf25129b33d.sql
ALTER TABLE public.model_generations DROP CONSTRAINT IF EXISTS model_generations_mode_check;
ALTER TABLE public.model_generations ADD CONSTRAINT model_generations_mode_check
  CHECK (mode IN ('text','image','animation','texture','refine','rig','tripo_api','tripo_bridge','external_model','preview'));

-- 20260701081228_929e9044-57a8-42a0-92c3-4c3d0f047c4e.sql
ALTER VIEW public.profiles_public SET (security_invoker = on);

-- 20260701081522_18f55123-d095-4037-9c14-0a7ead4eef1f.sql

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


-- 20260701084032_4fff138a-ba06-4c93-ad14-55d2f112eb0f.sql

-- ai_suggestions: allow authenticated users to insert suggestions for projects they can edit
CREATE POLICY "Users insert suggestions for editable projects"
  ON public.ai_suggestions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_edit_project(project_id, auth.uid()) AND user_id = auth.uid());

-- model_generations: scope existing policy to authenticated role only
DROP POLICY IF EXISTS "Users manage their own model generations" ON public.model_generations;
CREATE POLICY "Users manage their own model generations"
  ON public.model_generations
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- 20260701084218_d68d1e58-998b-4125-8876-02671699bdbc.sql

DROP POLICY IF EXISTS "badges public read" ON public.user_badges;
CREATE POLICY "Authenticated users can read badges"
  ON public.user_badges
  FOR SELECT
  TO authenticated
  USING (true);
REVOKE SELECT ON public.user_badges FROM anon;


-- 20260701084422_b08051b0-fa97-46bb-8a53-f4c9ccd2b19b.sql

DROP POLICY IF EXISTS "admins read audit" ON public.admin_audit_logs;
CREATE POLICY "admins read audit"
  ON public.admin_audit_logs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role));

DROP POLICY IF EXISTS "admins manage broadcasts" ON public.admin_broadcasts;
CREATE POLICY "admins manage broadcasts"
  ON public.admin_broadcasts FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role));

DROP POLICY IF EXISTS "admins write settings" ON public.admin_settings;
CREATE POLICY "admins write settings"
  ON public.admin_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role));


-- 20260701084941_f1620250-7fc6-4abd-952b-e88d40df275f.sql

ALTER TABLE public.model_generations ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;


-- 20260701085816_73ab8353-a53c-4ee5-b44e-26329419faa7.sql

-- Fix 2: include is_public in can_access_project
CREATE OR REPLACE FUNCTION public.can_access_project(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = _project_id
      AND (p.user_id = _user_id OR p.is_public = true)
  ) OR EXISTS (
    SELECT 1 FROM public.project_collaborators c
    WHERE c.project_id = _project_id AND c.user_id = _user_id
  );
$function$;

-- Fix 3: also clear plugin_token when claimed_at is set
CREATE OR REPLACE FUNCTION public.pair_code_clear_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.picked_up_at IS NOT NULL AND (OLD.picked_up_at IS NULL OR OLD.picked_up_at IS DISTINCT FROM NEW.picked_up_at))
     OR (NEW.claimed_at IS NOT NULL AND (OLD.claimed_at IS NULL OR OLD.claimed_at IS DISTINCT FROM NEW.claimed_at))
  THEN
    NEW.plugin_token := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

-- Proactively scrub any lingering tokens on already-claimed rows
UPDATE public.plugin_pair_codes
SET plugin_token = NULL
WHERE plugin_token IS NOT NULL
  AND (claimed_at IS NOT NULL OR picked_up_at IS NOT NULL);


-- 20260701131815_468a27f0-70d2-4321-952a-44937778af69.sql

CREATE OR REPLACE FUNCTION public.pair_code_clear_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only null the token AFTER the plugin has actually retrieved it.
  -- Clearing it on `claimed_at` breaks pairing: pair.poll would then return
  -- "pending" forever because the token it needs to hand back is already gone.
  IF NEW.picked_up_at IS NOT NULL
     AND (OLD.picked_up_at IS NULL OR OLD.picked_up_at IS DISTINCT FROM NEW.picked_up_at)
  THEN
    NEW.plugin_token := NULL;
  END IF;
  RETURN NEW;
END;
$function$;


-- 20260701151145_068cac9d-c71c-4364-bf64-77469d378fb8.sql

CREATE TABLE public.mcp_servers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  token TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  tools JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'unknown',
  status_message TEXT,
  last_tested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcp_servers TO authenticated;
GRANT ALL ON public.mcp_servers TO service_role;

ALTER TABLE public.mcp_servers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own MCP servers"
  ON public.mcp_servers
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX mcp_servers_user_id_idx ON public.mcp_servers(user_id);

CREATE TRIGGER touch_mcp_servers_updated_at
  BEFORE UPDATE ON public.mcp_servers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- 20260702124507_7fc3b74c-576a-43dc-8380-0997865d0691.sql
CREATE OR REPLACE FUNCTION public.current_user_has_role(_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = _role
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_has_role(public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_has_role(public.app_role) TO authenticated, service_role;

-- 20260702125622_b578afff-3ce9-427c-aea5-c0a6432fbd73.sql

-- Helper: project member (owner OR any collaborator), used to keep sensitive
-- per-project data from leaking to random authenticated users just because
-- the project has is_public = true.
CREATE OR REPLACE FUNCTION public.is_project_member(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = _project_id AND p.user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.project_collaborators c
    WHERE c.project_id = _project_id AND c.user_id = _user_id
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_project_member(uuid, uuid) TO authenticated, service_role;

-- 1) admin_broadcasts: drop anon-readable policy, keep active-broadcast reads for signed-in users only.
DROP POLICY IF EXISTS "read active broadcasts" ON public.admin_broadcasts;
CREATE POLICY "read active broadcasts"
  ON public.admin_broadcasts
  FOR SELECT
  TO authenticated
  USING (active = true);

-- 2) mcp_servers: re-scope the ALL policy from public to authenticated.
DROP POLICY IF EXISTS "Users manage their own MCP servers" ON public.mcp_servers;
CREATE POLICY "Users manage their own MCP servers"
  ON public.mcp_servers
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3) Tighten sensitive per-project SELECTs to project members only.
--    (Comments, activity, assets, project row itself remain viewable on public projects.)
DROP POLICY IF EXISTS "Users read their own project suggestions" ON public.ai_suggestions;
CREATE POLICY "Users read their own project suggestions"
  ON public.ai_suggestions
  FOR SELECT
  TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));

DROP POLICY IF EXISTS "Access project dev sessions" ON public.dev_sessions;
CREATE POLICY "Access project dev sessions"
  ON public.dev_sessions
  FOR SELECT
  TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));

DROP POLICY IF EXISTS "Access project dev tasks" ON public.dev_session_tasks;
CREATE POLICY "Access project dev tasks"
  ON public.dev_session_tasks
  FOR SELECT
  TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));

DROP POLICY IF EXISTS "team chat read with access" ON public.project_chat_messages;
CREATE POLICY "team chat read with access"
  ON public.project_chat_messages
  FOR SELECT
  TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));

-- project_qa_reports: rebuild the SELECT policy to member-only.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
             WHERE schemaname='public' AND tablename='project_qa_reports' AND cmd='SELECT'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.project_qa_reports', pol.policyname);
  END LOOP;
END $$;
CREATE POLICY "qa reports member read"
  ON public.project_qa_reports
  FOR SELECT
  TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));

-- 4) Storage: restrict project-thumbnails SELECT to public projects or members.
DROP POLICY IF EXISTS "project thumbs public read" ON storage.objects;
CREATE POLICY "project thumbs conditional read"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'project-thumbnails'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id::text = split_part(name, '/', 1)
        AND (
          p.is_public = true
          OR (auth.uid() IS NOT NULL AND public.is_project_member(p.id, auth.uid()))
        )
    )
  );


-- 20260703211810_d36779e5-8856-4f9a-a714-8f56182e8720.sql
-- Narrow SELECT policies from can_access_project (which allows any authenticated user
-- for public projects) to is_project_member (owner + collaborators only).
DROP POLICY IF EXISTS "activity read with access" ON public.project_activity;
CREATE POLICY "activity read members only" ON public.project_activity
  FOR SELECT USING (public.is_project_member(project_id, auth.uid()));

DROP POLICY IF EXISTS "assets read with access" ON public.project_assets;
CREATE POLICY "assets read members only" ON public.project_assets
  FOR SELECT USING (public.is_project_member(project_id, auth.uid()));

DROP POLICY IF EXISTS "comments read with access" ON public.project_comments;
CREATE POLICY "comments read members only" ON public.project_comments
  FOR SELECT USING (public.is_project_member(project_id, auth.uid()));

-- Fix storage.objects thumbnail read policy: the join previously referenced
-- p.name (the projects table) instead of the storage object's name.
DROP POLICY IF EXISTS "project thumbs conditional read" ON storage.objects;
CREATE POLICY "project thumbs conditional read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'project-thumbnails'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id::text = split_part(storage.objects.name, '/', 1)
        AND (
          p.is_public = true
          OR (auth.uid() IS NOT NULL AND public.is_project_member(p.id, auth.uid()))
        )
    )
  );


-- 20260704212815_dd315a15-2a1c-47ac-a939-46df4fa0be49.sql
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ── Build snapshots (Undo / checkpoints) ─────────────────────────────
CREATE TABLE public.build_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  label text NOT NULL DEFAULT 'Auto snapshot',
  kind text NOT NULL DEFAULT 'auto',
  workspace_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  size_bytes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_build_snapshots_project ON public.build_snapshots(project_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.build_snapshots TO authenticated;
GRANT ALL ON public.build_snapshots TO service_role;
ALTER TABLE public.build_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Snapshots: project members read" ON public.build_snapshots FOR SELECT TO authenticated USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Snapshots: project members write" ON public.build_snapshots FOR INSERT TO authenticated WITH CHECK (public.can_edit_project(project_id, auth.uid()) AND user_id = auth.uid());
CREATE POLICY "Snapshots: owner delete" ON public.build_snapshots FOR DELETE TO authenticated USING (public.is_project_owner(project_id, auth.uid()));

-- ── Showcase gallery ─────────────────────────────────────────────────
CREATE TABLE public.showcase_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  cover_url text,
  roblox_place_id bigint,
  tags text[] NOT NULL DEFAULT '{}',
  likes integer NOT NULL DEFAULT 0,
  views integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_showcase_created ON public.showcase_posts(created_at DESC) WHERE is_published;
CREATE INDEX idx_showcase_user ON public.showcase_posts(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.showcase_posts TO authenticated;
GRANT SELECT ON public.showcase_posts TO anon;
GRANT ALL ON public.showcase_posts TO service_role;
ALTER TABLE public.showcase_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Showcase: public read published" ON public.showcase_posts FOR SELECT USING (is_published = true);
CREATE POLICY "Showcase: owner read own" ON public.showcase_posts FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Showcase: owner insert" ON public.showcase_posts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Showcase: owner update" ON public.showcase_posts FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Showcase: owner delete" ON public.showcase_posts FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER trg_showcase_touch BEFORE UPDATE ON public.showcase_posts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.showcase_likes (
  post_id uuid NOT NULL REFERENCES public.showcase_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.showcase_likes TO authenticated;
GRANT SELECT ON public.showcase_likes TO anon;
GRANT ALL ON public.showcase_likes TO service_role;
ALTER TABLE public.showcase_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Likes: public read" ON public.showcase_likes FOR SELECT USING (true);
CREATE POLICY "Likes: self insert" ON public.showcase_likes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Likes: self delete" ON public.showcase_likes FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ── Template marketplace (free) ──────────────────────────────────────
CREATE TABLE public.game_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'other',
  cover_url text,
  actions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  prompt text NOT NULL DEFAULT '',
  downloads integer NOT NULL DEFAULT 0,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_templates_public ON public.game_templates(created_at DESC) WHERE is_public;
CREATE INDEX idx_templates_category ON public.game_templates(category);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_templates TO authenticated;
GRANT SELECT ON public.game_templates TO anon;
GRANT ALL ON public.game_templates TO service_role;
ALTER TABLE public.game_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Templates: public read" ON public.game_templates FOR SELECT USING (is_public = true);
CREATE POLICY "Templates: owner read own" ON public.game_templates FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Templates: owner insert" ON public.game_templates FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Templates: owner update" ON public.game_templates FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Templates: owner delete" ON public.game_templates FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER trg_templates_touch BEFORE UPDATE ON public.game_templates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── Referrals ────────────────────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;
UPDATE public.profiles SET referral_code = 'BS' || upper(substr(md5(id::text), 1, 8)) WHERE referral_code IS NULL;

CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id uuid NOT NULL,
  referred_user_id uuid NOT NULL UNIQUE,
  code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_referrals_referrer ON public.referrals(referrer_user_id);
GRANT SELECT, INSERT ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Referrals: self read either side" ON public.referrals FOR SELECT TO authenticated USING (referrer_user_id = auth.uid() OR referred_user_id = auth.uid());
CREATE POLICY "Referrals: self insert as referred" ON public.referrals FOR INSERT TO authenticated WITH CHECK (referred_user_id = auth.uid());

-- ── Search indexes (fuzzy) ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_chat_messages_content_trgm ON public.chat_messages USING gin (content extensions.gin_trgm_ops) WHERE content IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_plugin_actions_name_trgm ON public.plugin_actions USING gin (name extensions.gin_trgm_ops) WHERE name IS NOT NULL;


-- 20260705171515_975cd414-e506-429c-802a-ecdab8a1c0a0.sql
CREATE INDEX IF NOT EXISTS idx_plugin_actions_user_status_created_desc
  ON public.plugin_actions (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_plugin_actions_user_pending_message_order
  ON public.plugin_actions (user_id, message_id, created_at ASC, position ASC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_plugin_actions_user_sent_at
  ON public.plugin_actions (user_id, sent_at DESC)
  WHERE status = 'sent';

CREATE INDEX IF NOT EXISTS idx_plugin_actions_project_user_message_position
  ON public.plugin_actions (project_id, user_id, message_id, position);

CREATE INDEX IF NOT EXISTS idx_plugin_actions_project_created_desc
  ON public.plugin_actions (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_project_user_role_created_desc
  ON public.chat_messages (project_id, user_id, role, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_project_created_asc
  ON public.chat_messages (project_id, created_at ASC);

-- 20260708005557_b54ab0b5-4f27-4bb5-b004-8989f82a3bb5.sql

CREATE TABLE public.kb_seed_progress (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'idle',
  current_index INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  inserted INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  current_title TEXT,
  message TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.kb_seed_progress TO authenticated;
GRANT ALL ON public.kb_seed_progress TO service_role;

ALTER TABLE public.kb_seed_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own seed progress"
  ON public.kb_seed_progress FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);


-- 20260708010554_7cf8c46e-3cb1-48ba-81a5-c3703ae7d981.sql

drop policy if exists "activity read members only" on public.project_activity;
create policy "activity read members only" on public.project_activity
  for select to authenticated
  using (is_project_member(project_id, auth.uid()));

drop policy if exists "assets read members only" on public.project_assets;
create policy "assets read members only" on public.project_assets
  for select to authenticated
  using (is_project_member(project_id, auth.uid()));

drop policy if exists "comments read members only" on public.project_comments;
create policy "comments read members only" on public.project_comments
  for select to authenticated
  using (is_project_member(project_id, auth.uid()));


-- 20260708010711_dc1d1c64-6853-4e3a-8c8a-06da7b5683cb.sql

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


-- 20260708011029_9593a120-1adb-4e89-bc70-e75ced02eb5a.sql

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


-- 20260708012041_adc29715-3bf4-4a52-aadb-19549cfef920.sql

-- 1) Avatars: restrict SELECT to owner's folder
DROP POLICY IF EXISTS "avatars read all authenticated" ON storage.objects;
CREATE POLICY "avatars read own"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

-- 2) showcase_likes: no public read; users only see their own like rows
DROP POLICY IF EXISTS "Likes: public read" ON public.showcase_likes;
CREATE POLICY "Likes: self read"
  ON public.showcase_likes
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());


-- 20260708015057_20fd652a-9d4e-427a-9c5c-29d1b3777ce1.sql
DROP POLICY IF EXISTS "Authenticated users can read badges" ON public.user_badges;
CREATE POLICY "Users can read their own badges"
  ON public.user_badges
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "kb_chunks_select_authenticated" ON public.kb_chunks;

CREATE OR REPLACE FUNCTION public.match_kb_chunks(
  query_embedding extensions.vector,
  match_topic text,
  match_count integer DEFAULT 5
)
RETURNS TABLE(id uuid, topic text, title text, content text, source text, similarity double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public, extensions, pg_catalog'
AS $function$
  select
    k.id,
    k.topic,
    k.title,
    k.content,
    k.source,
    1 - extensions.cosine_distance(k.embedding, query_embedding) as similarity
  from public.kb_chunks k
  where k.embedding is not null
    and k.topic = match_topic
  order by extensions.cosine_distance(k.embedding, query_embedding)
  limit match_count;
$function$;

-- 20260708015541_428e647e-354e-4188-9a9b-80090ebd2a64.sql
-- Replace can_access_project (allows any authed user on public projects) with
-- is_project_member (owner + collaborators only) on all INSERT policies.

DROP POLICY IF EXISTS "activity insert with access" ON public.project_activity;
CREATE POLICY "activity insert members only" ON public.project_activity
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_project_member(project_id, auth.uid())
    AND (user_id = auth.uid() OR user_id IS NULL)
  );

DROP POLICY IF EXISTS "assets insert with access" ON public.project_assets;
CREATE POLICY "assets insert members only" ON public.project_assets
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_project_member(project_id, auth.uid())
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "team chat insert with access" ON public.project_chat_messages;
CREATE POLICY "team chat insert members only" ON public.project_chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_project_member(project_id, auth.uid())
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "comments insert with access" ON public.project_comments;
CREATE POLICY "comments insert members only" ON public.project_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_project_member(project_id, auth.uid())
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "qa insert with access" ON public.project_qa_reports;
CREATE POLICY "qa insert members only" ON public.project_qa_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_project_member(project_id, auth.uid())
    AND user_id = auth.uid()
  );

-- Collaborator list: only the row's own user or actual project members can read.
DROP POLICY IF EXISTS "collab view own membership or project access" ON public.project_collaborators;
CREATE POLICY "collab view own membership or member" ON public.project_collaborators
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_project_member(project_id, auth.uid())
  );

-- 20260708142250_594c615a-be2b-4a5b-9eed-ab03672ad4d8.sql

ALTER TABLE public.playtest_reports
  ADD COLUMN IF NOT EXISTS run_id UUID,
  ADD COLUMN IF NOT EXISTS parent_run_id UUID,
  ADD COLUMN IF NOT EXISTS attempt INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS phase_results JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS screenshot_urls TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'passed',
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS finding_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS auto_triggered BOOLEAN NOT NULL DEFAULT false;

UPDATE public.playtest_reports SET run_id = id WHERE run_id IS NULL;

CREATE INDEX IF NOT EXISTS playtest_reports_run_idx ON public.playtest_reports (run_id, attempt);
CREATE INDEX IF NOT EXISTS playtest_reports_user_run_idx ON public.playtest_reports (user_id, run_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.playtest_loop_state (
  run_id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempt INTEGER NOT NULL DEFAULT 1,
  max_attempts INTEGER NOT NULL DEFAULT 4,
  directive TEXT NOT NULL DEFAULT 'idle', -- idle | wait_for_ai | rerun | stop | passed | stuck
  last_fingerprint TEXT,
  reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.playtest_loop_state TO authenticated;
GRANT ALL ON public.playtest_loop_state TO service_role;

ALTER TABLE public.playtest_loop_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own loop state" ON public.playtest_loop_state;
CREATE POLICY "users read own loop state" ON public.playtest_loop_state
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users update own loop state" ON public.playtest_loop_state;
CREATE POLICY "users update own loop state" ON public.playtest_loop_state
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- 20260708142324_51b8d3b2-9c2b-4275-b949-60b76af8a2dc.sql

DROP POLICY IF EXISTS "playtest screenshots owner read" ON storage.objects;
CREATE POLICY "playtest screenshots owner read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'playtest-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "playtest screenshots owner insert" ON storage.objects;
CREATE POLICY "playtest screenshots owner insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'playtest-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "playtest screenshots owner delete" ON storage.objects;
CREATE POLICY "playtest screenshots owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'playtest-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);


-- 20260726002713_9e31612e-b528-420c-89b4-faec9cc49314.sql
DROP POLICY IF EXISTS "profiles read own or public" ON public.profiles;

-- 20260726094800_reset_credits_50_monthly.sql
-- Migration: Reset all users to 50 credits monthly (2026-07-26)
-- Sets max_credits = 50 and current credits = 50 for all non-admin/owner accounts.
-- Resets the 30-day refill timer starting from today.

-- Step 1: Set max_credits = 50 for all free-tier users (not Owner/Pro/Donator plan)
UPDATE profiles
SET max_credits = 50
WHERE plan NOT IN ('Owner', 'Pro', 'Donator')
  AND (is_admin = false OR is_admin IS NULL);

-- Step 2: Reset current credits to 50 for all free-tier users
UPDATE profiles
SET
  credits = 50,
  credits_reset_at = (NOW() + INTERVAL '30 days')::timestamptz
WHERE plan NOT IN ('Owner', 'Pro', 'Donator')
  AND (is_admin = false OR is_admin IS NULL);

-- Step 3: Ensure Donator/Pro plan users also have at least 50 max_credits
-- (they may have more from top-ups, so only raise, never lower)
UPDATE profiles
SET max_credits = GREATEST(COALESCE(max_credits, 0), 50)
WHERE plan IN ('Donator', 'Pro');


-- 20260726100000_set_default_credits_50.sql
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


-- 20260726110000_fix_auth_new_user_trigger.sql
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


-- 20260727202200_ensure_storage_buckets.sql
-- Ensure avatars storage bucket exists in Supabase Storage
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Enable RLS on storage objects if not enabled
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if present to prevent conflicts
DROP POLICY IF EXISTS "Public Read Avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Upload Avatars" ON storage.objects;

-- Create fast, lightweight RLS policies for avatars bucket
CREATE POLICY "Public Read Avatars" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated Upload Avatars" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');


