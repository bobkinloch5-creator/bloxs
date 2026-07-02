
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
