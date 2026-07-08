
-- 1) Avatars: restrict SELECT to owner's folder
DROP POLICY IF EXISTS "avatars read all authenticated" ON storage.objects;
CREATE POLICY "avatars read own"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

-- 2) showcase_likes: no public read; users only see their own like rows
DROP POLICY IF EXISTS "Likes: public read" ON public.showcase_likes;
CREATE POLICY "Likes: self read"
  ON public.showcase_likes
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
