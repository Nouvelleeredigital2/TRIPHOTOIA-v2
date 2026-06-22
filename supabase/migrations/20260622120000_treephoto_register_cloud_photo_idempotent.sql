-- P1-9 (PART SERVEUR) — idempotence de l'enregistrement d'une photo cloud.
--
-- ⚠️ NON DÉPLOYÉE PAR DÉFAUT. À appliquer puis VALIDER sur un environnement de
-- STAGING (voir le bloc « VALIDATION STAGING » en bas) avant toute mise en prod.
-- Tant qu'elle n'est pas déployée, le client NE DOIT PAS envoyer p_content_hash
-- (la signature 7-args actuelle le rejetterait). Voir le drapeau côté client :
-- src/features/ingestion/IngestionTab.tsx (passage de `contentHashes`).
--
-- ── Problème (audit P1-9) ────────────────────────────────────────────────────
-- register_cloud_photo insère TOUJOURS une nouvelle ligne. Sur un retry réseau
-- (le client renvoie le lot après une coupure), la même photo logique est
-- ré-enregistrée avec un nouvel uuid → ligne DOUBLON + 4 jobs d'analyse en
-- double. La contrainte unique existante (project_id, storage_path) ne protège
-- pas : storage_path contient le photo_id généré, donc différent à chaque essai.
--
-- ── Solution ─────────────────────────────────────────────────────────────────
-- Clé de CONTENU = SHA-256 déjà calculé côté client (c'est l'id local de la
-- photo, cf. IngestionTab : `id = fileHash`). On ajoute photos.content_hash, un
-- index unique partiel (project_id, content_hash), et un upsert
-- ON CONFLICT DO NOTHING. Sur conflit (retry ou concurrence), on RENVOIE la
-- ligne existante SANS ré-enfiler de jobs → l'appel devient idempotent et sûr.

-- 1) Colonne de hash de contenu. Nullable : compat lignes existantes et clients
--    qui ne fournissent pas encore le hash (comportement inchangé pour eux).
alter table public.photos
  add column if not exists content_hash text;

-- 2) Unicité partielle par projet sur les photos hashées. Partielle pour ne pas
--    contraindre les anciennes lignes (content_hash null) ni bloquer les clients
--    legacy. Deux photos de contenu identique dans le MÊME projet sont refusées.
create unique index if not exists photos_project_content_hash_uniq
  on public.photos (project_id, content_hash)
  where content_hash is not null;

-- 3) Version idempotente. On DROPpe l'ancienne signature (7 args) pour éviter une
--    surcharge ambiguë avec la nouvelle (8 args, p_content_hash en dernier).
drop function if exists public.register_cloud_photo(
  uuid, uuid, text, text, bigint, text, integer
);

create or replace function public.register_cloud_photo(
  p_project_id uuid,
  p_photo_id uuid,
  p_original_filename text,
  p_storage_path text,
  p_file_size bigint default null,
  p_mime_type text default null,
  p_semantic_delay_ms integer default 5000,
  p_content_hash text default null
)
returns public.photos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row public.photos%rowtype;
  v_delay interval := make_interval(secs => greatest(0, coalesce(p_semantic_delay_ms, 0)) / 1000.0);
  v_payload jsonb := jsonb_build_object(
    'storage_path', p_storage_path,
    'original_filename', p_original_filename
  );
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_project_member(p_project_id) then
    raise exception 'not_authorized';
  end if;
  if coalesce(trim(p_original_filename), '') = '' then
    raise exception 'empty_filename';
  end if;
  if coalesce(trim(p_storage_path), '') = '' then
    raise exception 'empty_storage_path';
  end if;
  -- Le chemin doit appartenir au projet ciblé (anti-confusion inter-projets).
  if position('/projects/' || p_project_id::text || '/' in p_storage_path) = 0 then
    raise exception 'storage_path_project_mismatch';
  end if;

  -- Insertion idempotente. Quand p_content_hash est fourni et qu'une photo de
  -- même contenu existe déjà pour ce projet, l'index partiel arbitre le conflit
  -- et DO NOTHING n'insère rien (v_row vide, FOUND = false).
  -- Quand p_content_hash est null (clients legacy), la ligne n'entre pas dans
  -- l'index partiel : insertion normale, comportement historique préservé.
  insert into public.photos (
    id, project_id, original_filename, file_size, mime_type, storage_path,
    analysis_status, content_hash
  ) values (
    p_photo_id, p_project_id, p_original_filename, p_file_size, p_mime_type,
    p_storage_path, 'pending', p_content_hash
  )
  on conflict (project_id, content_hash) where content_hash is not null
  do nothing
  returning * into v_row;

  if not found then
    -- Doublon (retry ou course concurrente) : la ligne gagnante est déjà
    -- committée → on la récupère et on s'arrête. NE PAS ré-enfiler les jobs.
    select * into v_row
      from public.photos
     where project_id = p_project_id
       and content_hash = p_content_hash;
    return v_row;
  end if;

  -- Première insertion seulement : enfilage atomique des jobs d'analyse.
  insert into public.jobs (project_id, photo_id, job_type, payload, run_after) values
    (p_project_id, p_photo_id, 'generate_thumbnail', v_payload, now()),
    (p_project_id, p_photo_id, 'quality_analysis',   v_payload, now()),
    (p_project_id, p_photo_id, 'perceptual_hash',    v_payload, now()),
    (p_project_id, p_photo_id, 'semantic_embedding', v_payload, now() + v_delay);

  return v_row;
end;
$$;

revoke execute on function public.register_cloud_photo(
  uuid, uuid, text, text, bigint, text, integer, text
) from public;
revoke execute on function public.register_cloud_photo(
  uuid, uuid, text, text, bigint, text, integer, text
) from anon;
grant execute on function public.register_cloud_photo(
  uuid, uuid, text, text, bigint, text, integer, text
) to authenticated;

-- ── VALIDATION STAGING (à exécuter manuellement après déploiement) ───────────
-- Prérequis : un projet de test + un membre authentifié (auth.uid() non null).
--
-- 1) Premier appel → crée la photo + 4 jobs :
--    select public.register_cloud_photo(
--      '<project_id>', gen_random_uuid(), 'a.jpg',
--      'organizations/<org>/projects/<project_id>/originals/x-a.jpg',
--      1024, 'image/jpeg', 5000, 'HASH_A');
--    -- attendu : 1 ligne photos (content_hash=HASH_A), 4 lignes jobs.
--
-- 2) Retry du MÊME hash (photo_id différent) → AUCUN doublon, AUCUN job ajouté :
--    select public.register_cloud_photo(
--      '<project_id>', gen_random_uuid(), 'a.jpg',
--      'organizations/<org>/projects/<project_id>/originals/y-a.jpg',
--      1024, 'image/jpeg', 5000, 'HASH_A');
--    select count(*) from public.photos where project_id='<project_id>' and content_hash='HASH_A'; -- = 1
--    select count(*) from public.jobs   where project_id='<project_id>';                            -- = 4 (pas 8)
--
-- 3) Concurrence : lancer 2x l'appel (2) en parallèle (deux sessions / pgbench)
--    → toujours 1 photo, 4 jobs (l'index partiel sérialise via verrou).
--
-- 4) Legacy (sans hash) : appel à 7 valeurs avec p_content_hash omis/null
--    → insertion normale, 1 photo + 4 jobs (compat préservée).
--
-- Rollback : drop de l'index + de la colonne, puis recréer la fonction 7-args
-- depuis 20260614100000_treephoto_register_cloud_photo_rpcs.sql.
