-- TreePhoto — A-02 : bucket de stockage des images partagées au client.
--
-- Le partage client (chemin "local sync") n'a pas de projet cloud associé : on stocke
-- donc les images des picks dans un bucket public dédié, sous le préfixe du propriétaire.
--   chemin objet : <user_id>/<file_hash>
-- Le file_hash est un SHA-256 non devinable → l'URL publique fait office de capacité
-- (seul le destinataire du lien la reçoit, via get_shared_photos). Le bucket public
-- permet à un client ANONYME d'afficher les miniatures sans session ni URL signée.
--
-- Idempotent.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'shared-photos',
  'shared-photos',
  true,
  52428800, -- 50 Mo / objet
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Lecture : bucket public → l'endpoint /object/public/ contourne la RLS (pas de policy
-- select nécessaire). Écriture : réservée au propriétaire (préfixe = son auth.uid()).
drop policy if exists "shared_photos_owner_insert" on storage.objects;
create policy "shared_photos_owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'shared-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "shared_photos_owner_update" on storage.objects;
create policy "shared_photos_owner_update" on storage.objects
  for update using (
    bucket_id = 'shared-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  ) with check (
    bucket_id = 'shared-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "shared_photos_owner_delete" on storage.objects;
create policy "shared_photos_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'shared-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
