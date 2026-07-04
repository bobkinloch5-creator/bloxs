CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ── Build snapshots (Undo / checkpoints) ─────────────────────────────
CREATE TABLE public.build_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  label text NOT NULL DEFAULT 'Auto snapshot',
  kind text NOT NULL DEFAULT 'auto',
  workspace_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  size_bytes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_build_snapshots_project ON public.build_snapshots(project_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.build_snapshots TO authenticated;
GRANT ALL ON public.build_snapshots TO service_role;
ALTER TABLE public.build_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Snapshots: project members read" ON public.build_snapshots FOR SELECT TO authenticated USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Snapshots: project members write" ON public.build_snapshots FOR INSERT TO authenticated WITH CHECK (public.can_edit_project(project_id, auth.uid()) AND user_id = auth.uid());
CREATE POLICY "Snapshots: owner delete" ON public.build_snapshots FOR DELETE TO authenticated USING (public.is_project_owner(project_id, auth.uid()));

-- ── Showcase gallery ─────────────────────────────────────────────────
CREATE TABLE public.showcase_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  cover_url text,
  roblox_place_id bigint,
  tags text[] NOT NULL DEFAULT '{}',
  likes integer NOT NULL DEFAULT 0,
  views integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_showcase_created ON public.showcase_posts(created_at DESC) WHERE is_published;
CREATE INDEX idx_showcase_user ON public.showcase_posts(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.showcase_posts TO authenticated;
GRANT SELECT ON public.showcase_posts TO anon;
GRANT ALL ON public.showcase_posts TO service_role;
ALTER TABLE public.showcase_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Showcase: public read published" ON public.showcase_posts FOR SELECT USING (is_published = true);
CREATE POLICY "Showcase: owner read own" ON public.showcase_posts FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Showcase: owner insert" ON public.showcase_posts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Showcase: owner update" ON public.showcase_posts FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Showcase: owner delete" ON public.showcase_posts FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER trg_showcase_touch BEFORE UPDATE ON public.showcase_posts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.showcase_likes (
  post_id uuid NOT NULL REFERENCES public.showcase_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.showcase_likes TO authenticated;
GRANT SELECT ON public.showcase_likes TO anon;
GRANT ALL ON public.showcase_likes TO service_role;
ALTER TABLE public.showcase_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Likes: public read" ON public.showcase_likes FOR SELECT USING (true);
CREATE POLICY "Likes: self insert" ON public.showcase_likes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Likes: self delete" ON public.showcase_likes FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ── Template marketplace (free) ──────────────────────────────────────
CREATE TABLE public.game_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'other',
  cover_url text,
  actions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  prompt text NOT NULL DEFAULT '',
  downloads integer NOT NULL DEFAULT 0,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_templates_public ON public.game_templates(created_at DESC) WHERE is_public;
CREATE INDEX idx_templates_category ON public.game_templates(category);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_templates TO authenticated;
GRANT SELECT ON public.game_templates TO anon;
GRANT ALL ON public.game_templates TO service_role;
ALTER TABLE public.game_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Templates: public read" ON public.game_templates FOR SELECT USING (is_public = true);
CREATE POLICY "Templates: owner read own" ON public.game_templates FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Templates: owner insert" ON public.game_templates FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Templates: owner update" ON public.game_templates FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Templates: owner delete" ON public.game_templates FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER trg_templates_touch BEFORE UPDATE ON public.game_templates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── Referrals ────────────────────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;
UPDATE public.profiles SET referral_code = 'BS' || upper(substr(md5(id::text), 1, 8)) WHERE referral_code IS NULL;

CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id uuid NOT NULL,
  referred_user_id uuid NOT NULL UNIQUE,
  code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_referrals_referrer ON public.referrals(referrer_user_id);
GRANT SELECT, INSERT ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Referrals: self read either side" ON public.referrals FOR SELECT TO authenticated USING (referrer_user_id = auth.uid() OR referred_user_id = auth.uid());
CREATE POLICY "Referrals: self insert as referred" ON public.referrals FOR INSERT TO authenticated WITH CHECK (referred_user_id = auth.uid());

-- ── Search indexes (fuzzy) ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_chat_messages_content_trgm ON public.chat_messages USING gin (content extensions.gin_trgm_ops) WHERE content IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_plugin_actions_name_trgm ON public.plugin_actions USING gin (name extensions.gin_trgm_ops) WHERE name IS NOT NULL;
