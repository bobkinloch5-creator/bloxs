
ALTER TABLE public.model_generations ADD COLUMN IF NOT EXISTS model_urls jsonb;
ALTER TABLE public.model_generations ADD COLUMN IF NOT EXISTS texture_urls jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'model_generations_mode_check'
      AND conrelid = 'public.model_generations'::regclass
  ) THEN
    ALTER TABLE public.model_generations DROP CONSTRAINT model_generations_mode_check;
  END IF;
END $$;

ALTER TABLE public.model_generations
  ADD CONSTRAINT model_generations_mode_check
  CHECK (mode IN ('text','image','animation','texture','refine'));
