create or replace function public.match_kb_chunks(
  query_embedding vector(1536),
  match_topic text,
  match_count int default 5
)
returns table (
  id uuid,
  topic text,
  title text,
  content text,
  source text,
  similarity float
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    k.id,
    k.topic,
    k.title,
    k.content,
    k.source,
    1 - (k.embedding <=> query_embedding) as similarity
  from public.kb_chunks k
  where k.embedding is not null
    and k.topic = match_topic
  order by k.embedding <=> query_embedding
  limit match_count;
$$;