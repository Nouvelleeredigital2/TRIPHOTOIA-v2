-- TreePhoto — tables de sync locale + partage (utilisées par src/lib/sync-utils.ts).
-- Extraites de l'ancien supabase/migration.sql, SANS les tables en conflit
-- (organizations/projects/photos sont définies par le schéma versionné cloud_v1).
-- Inclut le correctif de sécurité share_links : aucune lecture publique de la table,
-- résolution par token via une RPC security-definer scopée.

create table if not exists public.photo_metadata (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  file_hash text not null,
  file_name text not null,
  file_size bigint,
  rating smallint default 0,
  is_pick boolean default false,
  is_rejected boolean default false,
  color_label text,
  user_tags text[] default '{}',
  notes text,
  analysis jsonb,
  updated_at timestamptz default now(),
  unique(user_id, file_hash)
);
alter table public.photo_metadata enable row level security;
create policy "photo_metadata_own" on public.photo_metadata using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists photo_metadata_user_idx on public.photo_metadata(user_id);
create index if not exists photo_metadata_hash_idx on public.photo_metadata(file_hash);

create table if not exists public.cloud_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  description text,
  photo_file_hashes text[] default '{}',
  display_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.cloud_collections enable row level security;
create policy "cloud_collections_own" on public.cloud_collections using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  token text unique not null default encode(gen_random_bytes(16), 'hex'),
  name text,
  photo_file_hashes text[] default '{}',
  created_at timestamptz default now(),
  expires_at timestamptz
);
alter table public.share_links enable row level security;
-- Propriétaire en lecture/écriture seulement. PAS de policy de lecture publique :
-- la résolution d'un lien partagé passe par la RPC get_shared_link ci-dessous.
create policy "share_links_owner" on public.share_links using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.session_stats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  session_date date default current_date,
  photos_imported int default 0,
  photos_rated int default 0,
  picks_count int default 0,
  rejects_count int default 0,
  exports_count int default 0,
  created_at timestamptz default now(),
  unique(user_id, session_date)
);
alter table public.session_stats enable row level security;
create policy "session_stats_own" on public.session_stats using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists photo_metadata_set_updated_at on public.photo_metadata;
create trigger photo_metadata_set_updated_at before update on public.photo_metadata for each row execute function public.set_updated_at();
drop trigger if exists cloud_collections_set_updated_at on public.cloud_collections;
create trigger cloud_collections_set_updated_at before update on public.cloud_collections for each row execute function public.set_updated_at();

create or replace function public.get_shared_link(target_token text)
returns table (id uuid, user_id uuid, token text, name text, photo_file_hashes text[], created_at timestamptz, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, s.user_id, s.token, s.name, s.photo_file_hashes, s.created_at, s.expires_at
  from public.share_links s
  where s.token = target_token and (s.expires_at is null or s.expires_at > now());
$$;
grant execute on function public.get_shared_link(text) to anon, authenticated;
