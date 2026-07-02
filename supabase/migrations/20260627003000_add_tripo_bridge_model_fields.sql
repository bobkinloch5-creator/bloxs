ALTER TABLE public.model_generations DROP CONSTRAINT IF EXISTS model_generations_mode_check;
ALTER TABLE public.model_generations ADD CONSTRAINT model_generations_mode_check
  CHECK (mode IN ('text','image','animation','texture','refine','tripo_api','tripo_bridge','external_model'));

ALTER TABLE public.model_generations ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE public.model_generations ADD COLUMN IF NOT EXISTS source_format TEXT;
ALTER TABLE public.model_generations ADD COLUMN IF NOT EXISTS bridge_status TEXT;
ALTER TABLE public.model_generations ADD COLUMN IF NOT EXISTS bridge_metadata JSONB;
ALTER TABLE public.model_generations ADD COLUMN IF NOT EXISTS roblox_asset_id TEXT;
ALTER TABLE public.model_generations ADD COLUMN IF NOT EXISTS roblox_operation_path TEXT;
ALTER TABLE public.model_generations ADD COLUMN IF NOT EXISTS roblox_upload_status TEXT;
ALTER TABLE public.model_generations ADD COLUMN IF NOT EXISTS roblox_upload_error TEXT;
