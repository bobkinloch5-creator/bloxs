
-- Fix 2: include is_public in can_access_project
CREATE OR REPLACE FUNCTION public.can_access_project(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = _project_id
      AND (p.user_id = _user_id OR p.is_public = true)
  ) OR EXISTS (
    SELECT 1 FROM public.project_collaborators c
    WHERE c.project_id = _project_id AND c.user_id = _user_id
  );
$function$;

-- Fix 3: also clear plugin_token when claimed_at is set
CREATE OR REPLACE FUNCTION public.pair_code_clear_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.picked_up_at IS NOT NULL AND (OLD.picked_up_at IS NULL OR OLD.picked_up_at IS DISTINCT FROM NEW.picked_up_at))
     OR (NEW.claimed_at IS NOT NULL AND (OLD.claimed_at IS NULL OR OLD.claimed_at IS DISTINCT FROM NEW.claimed_at))
  THEN
    NEW.plugin_token := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

-- Proactively scrub any lingering tokens on already-claimed rows
UPDATE public.plugin_pair_codes
SET plugin_token = NULL
WHERE plugin_token IS NOT NULL
  AND (claimed_at IS NOT NULL OR picked_up_at IS NOT NULL);
