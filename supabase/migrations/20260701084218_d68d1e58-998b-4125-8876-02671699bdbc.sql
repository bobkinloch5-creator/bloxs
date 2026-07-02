
DROP POLICY IF EXISTS "badges public read" ON public.user_badges;
CREATE POLICY "Authenticated users can read badges"
  ON public.user_badges
  FOR SELECT
  TO authenticated
  USING (true);
REVOKE SELECT ON public.user_badges FROM anon;
