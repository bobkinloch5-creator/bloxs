create extension if not exists vector;

create table if not exists public.kb_chunks (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  title text not null,
  content text not null,
  source text,
  source_hash text unique,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

grant select on public.kb_chunks to authenticated;
grant all    on public.kb_chunks to service_role;

alter table public.kb_chunks enable row level security;

create policy "kb_chunks_select_authenticated"
  on public.kb_chunks
  for select
  to authenticated
  using (true);

create index if not exists kb_chunks_topic_idx on public.kb_chunks (topic);
create index if not exists kb_chunks_embedding_idx
  on public.kb_chunks using hnsw (embedding vector_cosine_ops);

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
security definer
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

grant execute on function public.match_kb_chunks(vector, text, int) to authenticated, service_role;