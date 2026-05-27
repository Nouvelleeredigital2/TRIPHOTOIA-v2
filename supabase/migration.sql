-- TRIPHOTOIA — Migration initiale Supabase
-- À exécuter dans Supabase > SQL Editor

-- Extensions
create extension if not exists "pgcrypto";

-- ── Table : métadonnées photo ─────────────────────────────────────────────────
create table if not exists photo_metadata (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade not null,
  file_hash    text not null,        -- SHA-256 du fichier (identifiant cross-device)
  file_name    text not null,
  file_size    bigint,
  rating       smallint default 0,
  is_pick      boolean default false,
  is_rejected  boolean default false,
  color_label  text,
  user_tags    text[] default '{}',
  notes        text,
  analysis     jsonb,                -- PhotoAnalysis complète sérialisée
  updated_at   timestamptz default now(),
  unique(user_id, file_hash)
);

alter table photo_metadata enable row level security;

create policy "photo_metadata_own" on photo_metadata
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Index pour requêtes fréquentes
create index if not exists photo_metadata_user_idx on photo_metadata(user_id);
create index if not exists photo_metadata_hash_idx on photo_metadata(file_hash);

-- ── Table : collections cloud ─────────────────────────────────────────────────
create table if not exists cloud_collections (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users(id) on delete cascade not null,
  name              text not null,
  description       text,
  photo_file_hashes text[] default '{}',
  display_order     int default 0,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

alter table cloud_collections enable row level security;

create policy "cloud_collections_own" on cloud_collections
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Table : liens de partage ──────────────────────────────────────────────────
create table if not exists share_links (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id) on delete cascade not null,
  token               text unique not null default encode(gen_random_bytes(16), 'hex'),
  name                text,
  photo_file_hashes   text[] default '{}',
  created_at          timestamptz default now(),
  expires_at          timestamptz
);

alter table share_links enable row level security;

-- Propriétaire : lecture + écriture
create policy "share_links_owner" on share_links
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Public : lecture seule (pour la page de partage sans auth)
create policy "share_links_public_read" on share_links
  for select using (true);

-- ── Table : stats de sessions ─────────────────────────────────────────────────
create table if not exists session_stats (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users(id) on delete cascade not null,
  session_date     date default current_date,
  photos_imported  int default 0,
  photos_rated     int default 0,
  picks_count      int default 0,
  rejects_count    int default 0,
  exports_count    int default 0,
  created_at       timestamptz default now(),
  unique(user_id, session_date)
);

alter table session_stats enable row level security;

create policy "session_stats_own" on session_stats
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Trigger : updated_at automatique ─────────────────────────────────────────
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger photo_metadata_updated_at
  before update on photo_metadata
  for each row execute function update_updated_at();

create trigger cloud_collections_updated_at
  before update on cloud_collections
  for each row execute function update_updated_at();
