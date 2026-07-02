
-- donation_claims: allow admins to update (approve/reject); block user updates/deletes implicitly
CREATE POLICY "Admins can update donation claims"
  ON public.donation_claims
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete donation claims"
  ON public.donation_claims
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- plugin_pair_codes: scope INSERT/UPDATE/DELETE to owner
CREATE POLICY "Users can insert own pair codes"
  ON public.plugin_pair_codes
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own pair codes"
  ON public.plugin_pair_codes
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own pair codes"
  ON public.plugin_pair_codes
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- plugin_sessions: scope INSERT/UPDATE/DELETE to owner
CREATE POLICY "Users can insert own plugin sessions"
  ON public.plugin_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own plugin sessions"
  ON public.plugin_sessions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own plugin sessions"
  ON public.plugin_sessions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- studio_errors: scope INSERT/DELETE to owner
CREATE POLICY "Users can insert own studio errors"
  ON public.studio_errors
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own studio errors"
  ON public.studio_errors
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
