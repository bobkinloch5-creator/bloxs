UPDATE public.admin_settings SET value = jsonb_set(coalesce(value,'{}'::jsonb), '{enabled}', 'false'::jsonb) WHERE key = 'maintenance';
INSERT INTO public.admin_settings (key, value)
SELECT 'maintenance', '{"enabled": false}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.admin_settings WHERE key = 'maintenance');