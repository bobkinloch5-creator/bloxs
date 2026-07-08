
DROP POLICY IF EXISTS "playtest screenshots owner read" ON storage.objects;
CREATE POLICY "playtest screenshots owner read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'playtest-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "playtest screenshots owner insert" ON storage.objects;
CREATE POLICY "playtest screenshots owner insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'playtest-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "playtest screenshots owner delete" ON storage.objects;
CREATE POLICY "playtest screenshots owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'playtest-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);
