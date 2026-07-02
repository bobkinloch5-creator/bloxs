
CREATE OR REPLACE FUNCTION public.pair_code_clear_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only null the token AFTER the plugin has actually retrieved it.
  -- Clearing it on `claimed_at` breaks pairing: pair.poll would then return
  -- "pending" forever because the token it needs to hand back is already gone.
  IF NEW.picked_up_at IS NOT NULL
     AND (OLD.picked_up_at IS NULL OR OLD.picked_up_at IS DISTINCT FROM NEW.picked_up_at)
  THEN
    NEW.plugin_token := NULL;
  END IF;
  RETURN NEW;
END;
$function$;
