
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
