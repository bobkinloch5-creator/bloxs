
-- collaborator roles enum
DO $$ BEGIN
  CREATE TYPE public.collab_role AS ENUM ('editor', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.invite_status AS ENUM ('pending', 'accepted', 'declined', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ project_collaborators ============
CREATE TABLE IF NOT EXISTS public.project_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.collab_role NOT NULL DEFAULT 'editor',
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_pc_project ON public.project_collaborators(project_id);
CREATE INDEX IF NOT EXISTS idx_pc_user ON public.project_collaborators(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_collaborators TO authenticated;
GRANT ALL ON public.project_collaborators TO service_role;
ALTER TABLE public.project_collaborators ENABLE ROW LEVEL SECURITY;

-- helper: can the user access this project (owner or collaborator)
CREATE OR REPLACE FUNCTION public.can_access_project(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = _project_id AND p.user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.project_collaborators c
    WHERE c.project_id = _project_id AND c.user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_project(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = _project_id AND p.user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.project_collaborators c
    WHERE c.project_id = _project_id AND c.user_id = _user_id AND c.role = 'editor'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_project_owner(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = _project_id AND p.user_id = _user_id);
$$;

CREATE POLICY "collab view own membership or project access"
  ON public.project_collaborators FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_access_project(project_id, auth.uid()));

CREATE POLICY "collab owner manages"
  ON public.project_collaborators FOR INSERT TO authenticated
  WITH CHECK (public.is_project_owner(project_id, auth.uid()));

CREATE POLICY "collab owner update"
  ON public.project_collaborators FOR UPDATE TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()))
  WITH CHECK (public.is_project_owner(project_id, auth.uid()));

CREATE POLICY "collab owner or self delete"
  ON public.project_collaborators FOR DELETE TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()) OR user_id = auth.uid());

-- ============ project_invites ============
CREATE TABLE IF NOT EXISTS public.project_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_username text NOT NULL,
  invitee_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  role public.collab_role NOT NULL DEFAULT 'editor',
  status public.invite_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_inv_project ON public.project_invites(project_id);
CREATE INDEX IF NOT EXISTS idx_inv_invitee ON public.project_invites(invitee_user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_invites TO authenticated;
GRANT ALL ON public.project_invites TO service_role;
ALTER TABLE public.project_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invites visible to owner or invitee"
  ON public.project_invites FOR SELECT TO authenticated
  USING (invited_by = auth.uid() OR invitee_user_id = auth.uid() OR public.is_project_owner(project_id, auth.uid()));

CREATE POLICY "invites owner inserts"
  ON public.project_invites FOR INSERT TO authenticated
  WITH CHECK (public.is_project_owner(project_id, auth.uid()) AND invited_by = auth.uid());

CREATE POLICY "invites owner or invitee update"
  ON public.project_invites FOR UPDATE TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()) OR invitee_user_id = auth.uid())
  WITH CHECK (public.is_project_owner(project_id, auth.uid()) OR invitee_user_id = auth.uid());

CREATE POLICY "invites owner delete"
  ON public.project_invites FOR DELETE TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()));

-- ============ project_chat_messages ============
CREATE TABLE IF NOT EXISTS public.project_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pcm_project ON public.project_chat_messages(project_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_chat_messages TO authenticated;
GRANT ALL ON public.project_chat_messages TO service_role;
ALTER TABLE public.project_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team chat read with access"
  ON public.project_chat_messages FOR SELECT TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "team chat insert with access"
  ON public.project_chat_messages FOR INSERT TO authenticated
  WITH CHECK (public.can_access_project(project_id, auth.uid()) AND user_id = auth.uid());
CREATE POLICY "team chat delete own or owner"
  ON public.project_chat_messages FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_project_owner(project_id, auth.uid()));

-- ============ project_comments ============
CREATE TABLE IF NOT EXISTS public.project_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  anchor text,
  body text NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pcc_project ON public.project_comments(project_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_comments TO authenticated;
GRANT ALL ON public.project_comments TO service_role;
ALTER TABLE public.project_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comments read with access"
  ON public.project_comments FOR SELECT TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "comments insert with access"
  ON public.project_comments FOR INSERT TO authenticated
  WITH CHECK (public.can_access_project(project_id, auth.uid()) AND user_id = auth.uid());
CREATE POLICY "comments update own or owner"
  ON public.project_comments FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_project_owner(project_id, auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_project_owner(project_id, auth.uid()));
CREATE POLICY "comments delete own or owner"
  ON public.project_comments FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_project_owner(project_id, auth.uid()));

-- ============ project_activity ============
CREATE TABLE IF NOT EXISTS public.project_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL,
  summary text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pa_project ON public.project_activity(project_id, created_at DESC);
GRANT SELECT, INSERT ON public.project_activity TO authenticated;
GRANT ALL ON public.project_activity TO service_role;
ALTER TABLE public.project_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity read with access"
  ON public.project_activity FOR SELECT TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "activity insert with access"
  ON public.project_activity FOR INSERT TO authenticated
  WITH CHECK (public.can_access_project(project_id, auth.uid()) AND (user_id = auth.uid() OR user_id IS NULL));

-- ============ extend projects access to collaborators ============
DROP POLICY IF EXISTS "projects owner all" ON public.projects;
CREATE POLICY "projects accessible to owner or collaborator"
  ON public.projects FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_access_project(id, auth.uid()));
CREATE POLICY "projects insert by owner"
  ON public.projects FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "projects update owner or editor"
  ON public.projects FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.can_edit_project(id, auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.can_edit_project(id, auth.uid()));
CREATE POLICY "projects delete owner only"
  ON public.projects FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ============ realtime ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_activity;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_collaborators;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_invites;

-- ============ RPC: accept invite (atomic) ============
CREATE OR REPLACE FUNCTION public.accept_project_invite(_invite_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  inv public.project_invites%ROWTYPE;
BEGIN
  SELECT * INTO inv FROM public.project_invites WHERE id = _invite_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite not found'; END IF;
  IF inv.status <> 'pending' THEN RAISE EXCEPTION 'invite is not pending'; END IF;
  IF inv.invitee_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'not your invite'; END IF;

  INSERT INTO public.project_collaborators (project_id, user_id, role, added_by)
  VALUES (inv.project_id, auth.uid(), inv.role, inv.invited_by)
  ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  UPDATE public.project_invites SET status = 'accepted', responded_at = now() WHERE id = _invite_id;

  INSERT INTO public.project_activity (project_id, user_id, kind, summary)
  VALUES (inv.project_id, auth.uid(), 'collab.joined', 'joined the project');

  RETURN inv.project_id;
END $$;
