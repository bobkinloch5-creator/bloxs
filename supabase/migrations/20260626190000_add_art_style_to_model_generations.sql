-- Store the chosen Meshy art style on each generation so the auto-refine step
-- can decide whether PBR textures are compatible (PBR is skipped for sculpture).
ALTER TABLE public.model_generations
  ADD COLUMN IF NOT EXISTS art_style TEXT;
