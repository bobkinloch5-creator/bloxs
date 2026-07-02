
ALTER TABLE public.agent_pipeline_runs
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS latest_report_id UUID REFERENCES public.playtest_reports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS repair_actions_count INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS agent_pipeline_runs_awaiting_idx
  ON public.agent_pipeline_runs (user_id, verification_status, completed_at DESC)
  WHERE verification_status = 'awaiting';
