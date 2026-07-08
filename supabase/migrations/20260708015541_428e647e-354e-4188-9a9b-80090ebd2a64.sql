-- Replace can_access_project (allows any authed user on public projects) with
-- is_project_member (owner + collaborators only) on all INSERT policies.

DROP POLICY IF EXISTS "activity insert with access" ON public.project_activity;
CREATE POLICY "activity insert members only" ON public.project_activity
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_project_member(project_id, auth.uid())
    AND (user_id = auth.uid() OR user_id IS NULL)
  );

DROP POLICY IF EXISTS "assets insert with access" ON public.project_assets;
CREATE POLICY "assets insert members only" ON public.project_assets
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_project_member(project_id, auth.uid())
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "team chat insert with access" ON public.project_chat_messages;
CREATE POLICY "team chat insert members only" ON public.project_chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_project_member(project_id, auth.uid())
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "comments insert with access" ON public.project_comments;
CREATE POLICY "comments insert members only" ON public.project_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_project_member(project_id, auth.uid())
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "qa insert with access" ON public.project_qa_reports;
CREATE POLICY "qa insert members only" ON public.project_qa_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_project_member(project_id, auth.uid())
    AND user_id = auth.uid()
  );

-- Collaborator list: only the row's own user or actual project members can read.
DROP POLICY IF EXISTS "collab view own membership or project access" ON public.project_collaborators;
CREATE POLICY "collab view own membership or member" ON public.project_collaborators
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_project_member(project_id, auth.uid())
  );