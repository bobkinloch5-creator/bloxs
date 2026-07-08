
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
