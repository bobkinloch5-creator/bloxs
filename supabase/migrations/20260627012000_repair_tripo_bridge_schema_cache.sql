alter table public.model_generations add column if not exists source text;
alter table public.model_generations add column if not exists source_format text;
alter table public.model_generations add column if not exists bridge_status text;
alter table public.model_generations add column if not exists bridge_metadata jsonb;
alter table public.model_generations add column if not exists roblox_asset_id text;
alter table public.model_generations add column if not exists roblox_operation_path text;
alter table public.model_generations add column if not exists roblox_upload_status text;
alter table public.model_generations add column if not exists roblox_upload_error text;

notify pgrst, 'reload schema';
