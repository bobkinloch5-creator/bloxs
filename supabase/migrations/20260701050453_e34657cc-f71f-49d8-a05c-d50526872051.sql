
CREATE TABLE public.ai_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  area TEXT NOT NULL DEFAULT 'general',
  severity TEXT NOT NULL DEFAULT 'medium',
  title TEXT NOT NULL,
  detail TEXT,
  suggested_prompt TEXT,
  auto_fixable BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL DEFAULT 'post_build',
  dismissed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_suggestions TO authenticated;
GRANT ALL ON public.ai_suggestions TO service_role;

ALTER TABLE public.ai_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own project suggestions"
  ON public.ai_suggestions FOR SELECT
  TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));

CREATE POLICY "Users update their own project suggestions"
  ON public.ai_suggestions FOR UPDATE
  TO authenticated
  USING (public.can_edit_project(project_id, auth.uid()))
  WITH CHECK (public.can_edit_project(project_id, auth.uid()));

CREATE POLICY "Users delete their own project suggestions"
  ON public.ai_suggestions FOR DELETE
  TO authenticated
  USING (public.can_edit_project(project_id, auth.uid()));

CREATE INDEX ai_suggestions_project_created_idx ON public.ai_suggestions (project_id, created_at DESC);
