
-- Helper: project member (owner OR any collaborator), used to keep sensitive
-- per-project data from leaking to random authenticated users just because
-- the project has is_public = true.
CREATE OR REPLACE FUNCTION public.is_project_member(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = _project_id AND p.user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.project_collaborators c
    WHERE c.project_id = _project_id AND c.user_id = _user_id
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_project_member(uuid, uuid) TO authenticated, service_role;

-- 1) admin_broadcasts: drop anon-readable policy, keep active-broadcast reads for signed-in users only.
DROP POLICY IF EXISTS "read active broadcasts" ON public.admin_broadcasts;
CREATE POLICY "read active broadcasts"
  ON public.admin_broadcasts
  FOR SELECT
  TO authenticated
  USING (active = true);

-- 2) mcp_servers: re-scope the ALL policy from public to authenticated.
DROP POLICY IF EXISTS "Users manage their own MCP servers" ON public.mcp_servers;
CREATE POLICY "Users manage their own MCP servers"
  ON public.mcp_servers
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3) Tighten sensitive per-project SELECTs to project members only.
--    (Comments, activity, assets, project row itself remain viewable on public projects.)
DROP POLICY IF EXISTS "Users read their own project suggestions" ON public.ai_suggestions;
CREATE POLICY "Users read their own project suggestions"
  ON public.ai_suggestions
  FOR SELECT
  TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));

DROP POLICY IF EXISTS "Access project dev sessions" ON public.dev_sessions;
CREATE POLICY "Access project dev sessions"
  ON public.dev_sessions
  FOR SELECT
  TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));

DROP POLICY IF EXISTS "Access project dev tasks" ON public.dev_session_tasks;
CREATE POLICY "Access project dev tasks"
  ON public.dev_session_tasks
  FOR SELECT
  TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));

DROP POLICY IF EXISTS "team chat read with access" ON public.project_chat_messages;
CREATE POLICY "team chat read with access"
  ON public.project_chat_messages
  FOR SELECT
  TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));

-- project_qa_reports: rebuild the SELECT policy to member-only.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
             WHERE schemaname='public' AND tablename='project_qa_reports' AND cmd='SELECT'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.project_qa_reports', pol.policyname);
  END LOOP;
END $$;
CREATE POLICY "qa reports member read"
  ON public.project_qa_reports
  FOR SELECT
  TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));

-- 4) Storage: restrict project-thumbnails SELECT to public projects or members.
DROP POLICY IF EXISTS "project thumbs public read" ON storage.objects;
CREATE POLICY "project thumbs conditional read"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'project-thumbnails'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id::text = split_part(name, '/', 1)
        AND (
          p.is_public = true
          OR (auth.uid() IS NOT NULL AND public.is_project_member(p.id, auth.uid()))
        )
    )
  );
