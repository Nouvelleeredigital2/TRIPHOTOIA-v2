-- TreePhoto cloud V2 schema
-- Sprint 16: semantic photo embeddings for image-to-image and text-image search.

create extension if not exists "vector";

create table if not exists public.photo_embeddings (
  photo_id uuid primary key references public.photos(id) on delete cascade,
  model text not null,
  embedding vector(512) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists photo_embeddings_hnsw_idx
  on public.photo_embeddings using hnsw (embedding vector_cosine_ops);

drop trigger if exists photo_embeddings_set_updated_at on public.photo_embeddings;
create trigger photo_embeddings_set_updated_at
  before update on public.photo_embeddings
  for each row execute function public.set_updated_at();

alter table public.photo_embeddings enable row level security;

create policy "photo_embeddings_members_select" on public.photo_embeddings
  for select using (
    exists (
      select 1 from public.photos p
      where p.id = photo_id and (select public.is_project_member(p.project_id))
    )
  );
create policy "photo_embeddings_members_insert" on public.photo_embeddings
  for insert with check (
    exists (
      select 1 from public.photos p
      where p.id = photo_id and (select public.is_project_member(p.project_id))
    )
  );
create policy "photo_embeddings_members_update" on public.photo_embeddings
  for update using (
    exists (
      select 1 from public.photos p
      where p.id = photo_id and (select public.is_project_member(p.project_id))
    )
  ) with check (
    exists (
      select 1 from public.photos p
      where p.id = photo_id and (select public.is_project_member(p.project_id))
    )
  );

-- Cosine similarity search restricted to photos the caller can access.
-- Returns similarity in [0, 1] (1 = identical direction) so the UI can render an explainable score.
create or replace function public.match_photo_embeddings(
  query_embedding vector(512),
  target_project_id uuid,
  match_count integer default 24,
  exclude_photo_id uuid default null
)
returns table (
  photo_id uuid,
  similarity double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.photo_id,
    1 - (e.embedding <=> query_embedding) as similarity
  from public.photo_embeddings e
  join public.photos p on p.id = e.photo_id
  where p.project_id = target_project_id
    and p.is_deleted = false
    and (exclude_photo_id is null or e.photo_id <> exclude_photo_id)
    and (select public.is_project_member(target_project_id))
  order by e.embedding <=> query_embedding
  limit greatest(1, least(match_count, 200));
$$;
