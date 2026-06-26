
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
