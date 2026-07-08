
CREATE TABLE public.kb_seed_progress (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'idle',
  current_index INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  inserted INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  current_title TEXT,
  message TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.kb_seed_progress TO authenticated;
GRANT ALL ON public.kb_seed_progress TO service_role;

ALTER TABLE public.kb_seed_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own seed progress"
  ON public.kb_seed_progress FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
