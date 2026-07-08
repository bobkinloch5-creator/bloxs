DROP POLICY IF EXISTS "Authenticated users can read badges" ON public.user_badges;
CREATE POLICY "Users can read their own badges"
  ON public.user_badges
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "kb_chunks_select_authenticated" ON public.kb_chunks;

CREATE OR REPLACE FUNCTION public.match_kb_chunks(
  query_embedding extensions.vector,
  match_topic text,
  match_count integer DEFAULT 5
)
RETURNS TABLE(id uuid, topic text, title text, content text, source text, similarity double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public, extensions, pg_catalog'
AS $function$
  select
    k.id,
    k.topic,
    k.title,
    k.content,
    k.source,
    1 - extensions.cosine_distance(k.embedding, query_embedding) as similarity
  from public.kb_chunks k
  where k.embedding is not null
    and k.topic = match_topic
  order by extensions.cosine_distance(k.embedding, query_embedding)
  limit match_count;
$function$;