-- Narrow SELECT policies from can_access_project (which allows any authenticated user
-- for public projects) to is_project_member (owner + collaborators only).
DROP POLICY IF EXISTS "activity read with access" ON public.project_activity;
CREATE POLICY "activity read members only" ON public.project_activity
  FOR SELECT USING (public.is_project_member(project_id, auth.uid()));

DROP POLICY IF EXISTS "assets read with access" ON public.project_assets;
CREATE POLICY "assets read members only" ON public.project_assets
  FOR SELECT USING (public.is_project_member(project_id, auth.uid()));

DROP POLICY IF EXISTS "comments read with access" ON public.project_comments;
CREATE POLICY "comments read members only" ON public.project_comments
  FOR SELECT USING (public.is_project_member(project_id, auth.uid()));

-- Fix storage.objects thumbnail read policy: the join previously referenced
-- p.name (the projects table) instead of the storage object's name.
DROP POLICY IF EXISTS "project thumbs conditional read" ON storage.objects;
CREATE POLICY "project thumbs conditional read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'project-thumbnails'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id::text = split_part(storage.objects.name, '/', 1)
        AND (
          p.is_public = true
          OR (auth.uid() IS NOT NULL AND public.is_project_member(p.id, auth.uid()))
        )
    )
  );
