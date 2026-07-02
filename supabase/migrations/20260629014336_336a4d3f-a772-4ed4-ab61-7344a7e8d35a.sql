CREATE TABLE IF NOT EXISTS public.build_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Milestone',
  summary text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'manual',
  snapshot_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  parts_count int NOT NULL DEFAULT 0,
  scripts_count int NOT NULL DEFAULT 0,
  gui_count int NOT NULL DEFAULT 0,
  size_bytes int NOT NULL DEFAULT 0,
  place_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS build_milestones_project_idx ON public.build_milestones (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS build_milestones_user_idx ON public.build_milestones (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.build_milestones TO authenticated;
GRANT ALL ON public.build_milestones TO service_role;

ALTER TABLE public.build_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "build_milestones_owner_select" ON public.build_milestones
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "build_milestones_owner_insert" ON public.build_milestones
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "build_milestones_owner_update" ON public.build_milestones
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "build_milestones_owner_delete" ON public.build_milestones
  FOR DELETE TO authenticated USING (user_id = auth.uid());

ALTER TABLE public.plugin_actions DROP CONSTRAINT IF EXISTS plugin_actions_kind_check;
ALTER TABLE public.plugin_actions ADD CONSTRAINT plugin_actions_kind_check CHECK (kind IN (
  'script','localscript','modulescript','gui','screengui','frame','textlabel','textbutton','imagelabel',
  'folder','part','model','terrain','tool','sound','team','remoteevent','remotefunction','bindableevent',
  'leaderstats','insert_asset','set_properties','rename','move','delete','setting','run','run_lua',
  'organize_project','autofix_project','scan_project','playtest','snapshot','restore_snapshot'
));