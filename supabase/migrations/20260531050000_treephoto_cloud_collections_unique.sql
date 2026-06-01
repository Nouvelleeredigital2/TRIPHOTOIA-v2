-- TreePhoto — A-06 : clé d'upsert réelle pour cloud_collections.
--
-- syncCollections faisait un upsert onConflict:'id' sans fournir d'id → ne pouvait
-- jamais matcher (inserts/échecs silencieux). On ajoute une contrainte unique
-- (user_id, name) pour permettre un upsert idempotent par utilisateur.
--
-- Idempotent : la contrainte n'est ajoutée que si elle n'existe pas déjà.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cloud_collections_user_name_key'
  ) then
    alter table public.cloud_collections
      add constraint cloud_collections_user_name_key unique (user_id, name);
  end if;
end
$$;
