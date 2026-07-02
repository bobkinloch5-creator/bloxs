
DROP POLICY IF EXISTS "admins read audit" ON public.admin_audit_logs;
CREATE POLICY "admins read audit"
  ON public.admin_audit_logs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role));

DROP POLICY IF EXISTS "admins manage broadcasts" ON public.admin_broadcasts;
CREATE POLICY "admins manage broadcasts"
  ON public.admin_broadcasts FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role));

DROP POLICY IF EXISTS "admins write settings" ON public.admin_settings;
CREATE POLICY "admins write settings"
  ON public.admin_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role));
