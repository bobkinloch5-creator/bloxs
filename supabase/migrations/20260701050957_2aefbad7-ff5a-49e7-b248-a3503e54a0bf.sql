
CREATE TABLE public.dev_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  goal TEXT NOT NULL,
  quality_target TEXT NOT NULL DEFAULT 'polished',
  status TEXT NOT NULL DEFAULT 'active',
  auto_run BOOLEAN NOT NULL DEFAULT true,
  summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  finished_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE public.dev_session_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.dev_sessions(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  position INT NOT NULL DEFAULT 0,
  agent TEXT NOT NULL DEFAULT 'generalist',
  title TEXT NOT NULL,
  instruction TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  finished_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dev_sessions TO authenticated;
GRANT ALL ON public.dev_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dev_session_tasks TO authenticated;
GRANT ALL ON public.dev_session_tasks TO service_role;

ALTER TABLE public.dev_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dev_session_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Access project dev sessions"
  ON public.dev_sessions FOR SELECT
  TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "Edit project dev sessions"
  ON public.dev_sessions FOR INSERT
  TO authenticated
  WITH CHECK (public.can_edit_project(project_id, auth.uid()));
CREATE POLICY "Update project dev sessions"
  ON public.dev_sessions FOR UPDATE
  TO authenticated
  USING (public.can_edit_project(project_id, auth.uid()))
  WITH CHECK (public.can_edit_project(project_id, auth.uid()));
CREATE POLICY "Delete project dev sessions"
  ON public.dev_sessions FOR DELETE
  TO authenticated
  USING (public.can_edit_project(project_id, auth.uid()));

CREATE POLICY "Access project dev tasks"
  ON public.dev_session_tasks FOR SELECT
  TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "Edit project dev tasks"
  ON public.dev_session_tasks FOR INSERT
  TO authenticated
  WITH CHECK (public.can_edit_project(project_id, auth.uid()));
CREATE POLICY "Update project dev tasks"
  ON public.dev_session_tasks FOR UPDATE
  TO authenticated
  USING (public.can_edit_project(project_id, auth.uid()))
  WITH CHECK (public.can_edit_project(project_id, auth.uid()));
CREATE POLICY "Delete project dev tasks"
  ON public.dev_session_tasks FOR DELETE
  TO authenticated
  USING (public.can_edit_project(project_id, auth.uid()));

CREATE INDEX dev_sessions_project_idx ON public.dev_sessions (project_id, created_at DESC);
CREATE INDEX dev_session_tasks_session_idx ON public.dev_session_tasks (session_id, position);
