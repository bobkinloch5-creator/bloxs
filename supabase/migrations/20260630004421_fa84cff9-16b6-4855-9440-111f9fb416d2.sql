
CREATE TABLE IF NOT EXISTS public.project_qa_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  overall_score int NOT NULL DEFAULT 0,
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_used text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qa_project ON public.project_qa_reports(project_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.project_qa_reports TO authenticated;
GRANT ALL ON public.project_qa_reports TO service_role;
ALTER TABLE public.project_qa_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qa read with access" ON public.project_qa_reports FOR SELECT TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "qa insert with access" ON public.project_qa_reports FOR INSERT TO authenticated
  WITH CHECK (public.can_access_project(project_id, auth.uid()) AND user_id = auth.uid());
CREATE POLICY "qa delete own or owner" ON public.project_qa_reports FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_project_owner(project_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.project_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  prompt text NOT NULL,
  data_url text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pa_project_kind ON public.project_assets(project_id, kind, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.project_assets TO authenticated;
GRANT ALL ON public.project_assets TO service_role;
ALTER TABLE public.project_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assets read with access" ON public.project_assets FOR SELECT TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "assets insert with access" ON public.project_assets FOR INSERT TO authenticated
  WITH CHECK (public.can_access_project(project_id, auth.uid()) AND user_id = auth.uid());
CREATE POLICY "assets delete own or owner" ON public.project_assets FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_project_owner(project_id, auth.uid()));
