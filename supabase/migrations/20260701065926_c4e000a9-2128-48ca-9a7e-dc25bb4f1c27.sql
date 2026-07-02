
-- Storage policies for project-thumbnails bucket
DROP POLICY IF EXISTS "project thumbs public read" ON storage.objects;
CREATE POLICY "project thumbs public read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'project-thumbnails');

DROP POLICY IF EXISTS "project thumbs owner write" ON storage.objects;
CREATE POLICY "project thumbs owner write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-thumbnails'
    AND public.can_edit_project((split_part(name, '/', 1))::uuid, auth.uid())
  );

DROP POLICY IF EXISTS "project thumbs owner update" ON storage.objects;
CREATE POLICY "project thumbs owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'project-thumbnails'
    AND public.can_edit_project((split_part(name, '/', 1))::uuid, auth.uid())
  );

DROP POLICY IF EXISTS "project thumbs owner delete" ON storage.objects;
CREATE POLICY "project thumbs owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-thumbnails'
    AND public.can_edit_project((split_part(name, '/', 1))::uuid, auth.uid())
  );

-- Security fix: drop the broad SELECT policy and revert the sanitized view
-- to run with definer privileges so it can read the base table while sensitive
-- columns remain ungranted to anon/authenticated (memory covers this).
DROP POLICY IF EXISTS "profiles read safe columns" ON public.profiles;

REVOKE SELECT (id, username, display_name, avatar_url, bio, roblox_username, roblox_display_name,
               roblox_avatar_url, roblox_headshot_url, roblox_verified_at, roblox_created_at,
               roblox_last_synced_at, roblox_public, roblox_experiences, plan, is_private, created_at)
  ON public.profiles FROM anon, authenticated;

DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public
  WITH (security_invoker = false) AS
  SELECT id, username, display_name, avatar_url, bio, roblox_username, roblox_display_name,
         roblox_avatar_url, roblox_headshot_url, roblox_verified_at, roblox_created_at,
         roblox_last_synced_at, roblox_public, roblox_experiences, plan, is_private, created_at
    FROM public.profiles;

COMMENT ON VIEW public.profiles_public IS
  'Sanitized cross-user projection of profiles. Owner (postgres) runs the query so sensitive columns are never granted to anon/authenticated. Do not expose credits, plugin_token, settings, is_admin, banned_*, max_credits, roblox_user_id.';

GRANT SELECT ON public.profiles_public TO anon, authenticated;
