
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
