
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
