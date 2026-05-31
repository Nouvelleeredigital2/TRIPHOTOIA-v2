-- TreePhoto — LOT 1 (partage client) : lecture publique scopée par token + validations client.
--
-- Contexte / problème corrigé :
--   * photo_metadata a une RLS propriétaire uniquement → un client anonyme qui ouvre
--     #/share/:token ne peut PAS lire les métadonnées via un select direct (0 photo).
--   * Les validations client étaient stockées en localStorage → le photographe ne les
--     récupérait jamais.
--
-- Cette migration ajoute :
--   1. get_shared_photos(token)  — RPC security-definer, renvoie UNIQUEMENT les photos
--      du lien (et seulement si le lien n'est pas expiré). N'expose jamais les notes
--      privées du photographe.
--   2. share_approvals           — table des validations client, liée au share_link.
--   3. set_share_approval(...)   — RPC publique : le client enregistre/modifie son choix,
--      validé par token (et seulement pour une photo réellement incluse dans le lien).
--   4. get_share_approvals(token)        — RPC publique : un client qui revient retrouve
--      ses choix précédents.
--   5. get_share_approvals_for_owner(id) — RPC authentifiée : le photographe récupère les
--      validations de son lien.
--
-- Idempotent : create or replace / create table if not exists / drop policy if exists.
-- Dépend de public.set_updated_at() (défini par les migrations cloud précédentes).

-- 1. Lecture publique scopée par token des métadonnées partagées ---------------------
create or replace function public.get_shared_photos(target_token text)
returns table (
  file_hash text,
  file_name text,
  file_size bigint,
  rating smallint,
  is_pick boolean,
  is_rejected boolean,
  color_label text,
  user_tags text[],
  analysis jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select pm.file_hash, pm.file_name, pm.file_size, pm.rating, pm.is_pick,
         pm.is_rejected, pm.color_label, pm.user_tags, pm.analysis
  from public.share_links s
  join public.photo_metadata pm
    on pm.user_id = s.user_id
   and pm.file_hash = any (s.photo_file_hashes)
  where s.token = target_token
    and (s.expires_at is null or s.expires_at > now());
$$;
grant execute on function public.get_shared_photos(text) to anon, authenticated;

-- 2. Table des validations client -----------------------------------------------------
create table if not exists public.share_approvals (
  id uuid primary key default gen_random_uuid(),
  share_link_id uuid references public.share_links(id) on delete cascade not null,
  file_hash text not null,
  status text not null check (status in ('approved', 'rejected', 'favorite')),
  client_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (share_link_id, file_hash)
);
alter table public.share_approvals enable row level security;

-- Le PROPRIÉTAIRE du lien peut lire les validations (via RLS authentifiée).
-- Aucune policy d'écriture publique : les clients écrivent uniquement via la RPC
-- set_share_approval (security definer), jamais en direct sur la table.
drop policy if exists "share_approvals_owner_read" on public.share_approvals;
create policy "share_approvals_owner_read" on public.share_approvals
  for select using (
    exists (
      select 1 from public.share_links s
      where s.id = share_approvals.share_link_id
        and s.user_id = auth.uid()
    )
  );

create index if not exists share_approvals_link_idx on public.share_approvals(share_link_id);

drop trigger if exists share_approvals_set_updated_at on public.share_approvals;
create trigger share_approvals_set_updated_at
  before update on public.share_approvals
  for each row execute function public.set_updated_at();

-- 3. Écriture client d'une validation (scopée par token) ------------------------------
create or replace function public.set_share_approval(
  target_token text,
  target_file_hash text,
  target_status text,
  target_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.share_links%rowtype;
begin
  select * into v_link
  from public.share_links s
  where s.token = target_token
    and (s.expires_at is null or s.expires_at > now());

  if not found then
    raise exception 'invalid_or_expired_token';
  end if;

  if not (target_file_hash = any (v_link.photo_file_hashes)) then
    raise exception 'photo_not_in_share';
  end if;

  if target_status not in ('approved', 'rejected', 'favorite') then
    raise exception 'invalid_status';
  end if;

  insert into public.share_approvals (share_link_id, file_hash, status, client_note)
  values (v_link.id, target_file_hash, target_status, target_note)
  on conflict (share_link_id, file_hash)
  do update set status = excluded.status,
                client_note = excluded.client_note,
                updated_at = now();
end;
$$;
grant execute on function public.set_share_approval(text, text, text, text) to anon, authenticated;

-- 4. Lecture client de ses validations (pour réafficher les choix au retour) ----------
create or replace function public.get_share_approvals(target_token text)
returns table (file_hash text, status text, client_note text, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select a.file_hash, a.status, a.client_note, a.updated_at
  from public.share_links s
  join public.share_approvals a on a.share_link_id = s.id
  where s.token = target_token
    and (s.expires_at is null or s.expires_at > now());
$$;
grant execute on function public.get_share_approvals(text) to anon, authenticated;

-- 5. Lecture propriétaire des validations d'un lien (côté photographe) ----------------
create or replace function public.get_share_approvals_for_owner(target_link_id uuid)
returns table (file_hash text, status text, client_note text, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select a.file_hash, a.status, a.client_note, a.updated_at
  from public.share_approvals a
  join public.share_links s on s.id = a.share_link_id
  where a.share_link_id = target_link_id
    and s.user_id = auth.uid();
$$;
grant execute on function public.get_share_approvals_for_owner(uuid) to authenticated;
