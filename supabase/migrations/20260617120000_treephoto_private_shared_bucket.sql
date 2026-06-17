-- P1-C : partage client privé.
--
-- Le bucket `shared-photos` était public (URL publiques durables, devinables à
-- partir de user_id/file_hash, sans expiration ni révocation effective). Faute
-- d'edge function de transformation/signature pour servir les destinataires
-- anonymes, le comportement sûr (cf. prompt §10.8) est de rendre le bucket privé
-- et de supprimer l'accès public durable. Le partage anonyme par URL publique
-- est ainsi désactivé ; sa réactivation passera par une edge function qui valide
-- le token côté serveur et renvoie une URL signée courte.
--
-- Migration idempotente.

update storage.buckets set public = false where id = 'shared-photos';

-- Le propriétaire authentifié peut lire ses propres objets partagés (préfixe
-- `<user_id>/...`) afin de générer des URLs signées pour sa propre
-- prévisualisation. Aucun accès direct pour `anon`.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'shared_photos_owner_select'
  ) then
    create policy "shared_photos_owner_select"
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'shared-photos'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;
