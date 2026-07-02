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
