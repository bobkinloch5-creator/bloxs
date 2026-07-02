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