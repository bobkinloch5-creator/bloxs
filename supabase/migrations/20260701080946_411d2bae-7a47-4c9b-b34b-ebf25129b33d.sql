ALTER TABLE public.model_generations DROP CONSTRAINT IF EXISTS model_generations_mode_check;
ALTER TABLE public.model_generations ADD CONSTRAINT model_generations_mode_check
  CHECK (mode IN ('text','image','animation','texture','refine','rig','tripo_api','tripo_bridge','external_model','preview'));