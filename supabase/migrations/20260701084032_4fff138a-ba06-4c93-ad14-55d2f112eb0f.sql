
-- ai_suggestions: allow authenticated users to insert suggestions for projects they can edit
CREATE POLICY "Users insert suggestions for editable projects"
  ON public.ai_suggestions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_edit_project(project_id, auth.uid()) AND user_id = auth.uid());

-- model_generations: scope existing policy to authenticated role only
DROP POLICY IF EXISTS "Users manage their own model generations" ON public.model_generations;
CREATE POLICY "Users manage their own model generations"
  ON public.model_generations
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
