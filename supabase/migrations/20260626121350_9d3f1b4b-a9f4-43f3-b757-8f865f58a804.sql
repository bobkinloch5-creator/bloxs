
ALTER TABLE public.model_generations DROP CONSTRAINT IF EXISTS model_generations_mode_check;
ALTER TABLE public.model_generations ADD CONSTRAINT model_generations_mode_check
  CHECK (mode IN ('text','image','animation'));
ALTER TABLE public.model_generations ADD COLUMN IF NOT EXISTS animation_name TEXT;
ALTER TABLE public.model_generations ADD COLUMN IF NOT EXISTS parent_id UUID
  REFERENCES public.model_generations(id) ON DELETE SET NULL;
