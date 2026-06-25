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