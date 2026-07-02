
-- 1. Public profiles view (safe columns only) + own-row RLS on profiles
DROP POLICY IF EXISTS "profiles public read" ON public.profiles;
DROP POLICY IF EXISTS "profiles read own" ON public.profiles;
CREATE POLICY "profiles read own"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = off) AS
SELECT id, username, display_name, avatar_url, bio, roblox_username, plan, created_at, is_private, language
FROM public.profiles
WHERE is_private = false;

GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- Revoke the broad anon column grant introduced earlier (view replaces it)
REVOKE SELECT ON public.profiles FROM anon;

-- 2. user_badges: revoke self-insert, add validated RPC
DROP POLICY IF EXISTS "badges insert own" ON public.user_badges;
REVOKE INSERT ON public.user_badges FROM authenticated;

CREATE OR REPLACE FUNCTION public.award_badge(_badge_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  allowed constant text[] := ARRAY[
    'early_builder','first_game','ten_builds','hundred_scripts',
    'plugin_connected','bug_fixer','ui_designer','marketplace_creator'
  ];
  qualifies boolean := false;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (_badge_key = ANY(allowed)) THEN RAISE EXCEPTION 'unknown badge'; END IF;

  -- Server-side eligibility validation
  IF _badge_key = 'first_game' OR _badge_key = 'ten_builds' THEN
    SELECT (COUNT(*) >= CASE WHEN _badge_key = 'ten_builds' THEN 10 ELSE 1 END) INTO qualifies
      FROM public.projects WHERE user_id = uid;
  ELSIF _badge_key = 'hundred_scripts' THEN
    SELECT (COUNT(*) >= 100) INTO qualifies
      FROM public.plugin_actions
      WHERE user_id = uid AND kind IN ('script','localscript','modulescript');
  ELSIF _badge_key = 'plugin_connected' THEN
    SELECT EXISTS(SELECT 1 FROM public.plugin_sessions WHERE user_id = uid) INTO qualifies;
  ELSIF _badge_key = 'bug_fixer' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.plugin_actions
      WHERE user_id = uid AND kind IN ('autofix_project','scan_project')
    ) INTO qualifies;
  ELSIF _badge_key = 'ui_designer' THEN
    SELECT EXISTS(SELECT 1 FROM public.ui_generations WHERE user_id = uid) INTO qualifies;
  ELSIF _badge_key = 'early_builder' THEN
    qualifies := true;
  ELSE
    qualifies := false;
  END IF;

  IF NOT qualifies THEN RETURN false; END IF;

  INSERT INTO public.user_badges (user_id, badge_key)
  VALUES (uid, _badge_key)
  ON CONFLICT (user_id, badge_key) DO NOTHING;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.award_badge(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_badge(text) TO authenticated;

-- 3. Restrict public-role policies to authenticated
DROP POLICY IF EXISTS "Users manage their own pipelines" ON public.agent_pipeline_runs;
CREATE POLICY "Users manage their own pipelines"
  ON public.agent_pipeline_runs FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage their own agent runs" ON public.agent_runs;
CREATE POLICY "Users manage their own agent runs"
  ON public.agent_runs FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage their own project memory" ON public.project_memory;
CREATE POLICY "Users manage their own project memory"
  ON public.project_memory FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. admin_settings: authenticated only, and remove sensitive-key exposure risk
DROP POLICY IF EXISTS "read settings" ON public.admin_settings;
CREATE POLICY "read settings"
  ON public.admin_settings FOR SELECT
  TO authenticated
  USING (key NOT LIKE 'secret.%' AND key NOT LIKE 'internal.%');

-- 5. Revoke EXECUTE on trigger-only SECURITY DEFINER helpers
REVOKE EXECUTE ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, authenticated, anon;
