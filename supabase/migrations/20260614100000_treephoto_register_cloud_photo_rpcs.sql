-- P0-1 : RPC d'enregistrement d'une photo cloud + enfilage des jobs.
-- Le frontend (src/features/cloud-projects/cloudUpload.ts) appelle ces RPC après
-- l'upload du fichier dans Storage. Elles étaient absentes des migrations →
-- l'upload échouait (objet orphelin dans le bucket, aucune ligne photos/jobs).
--
-- Insertion ATOMIQUE de la photo + de ses jobs d'analyse, avec contrôle
-- auth.uid() + appartenance au projet + validation du chemin Storage.
-- SECURITY DEFINER, accès anon révoqué, réservé à authenticated.

create or replace function public.register_cloud_photo(
  p_project_id uuid,
  p_photo_id uuid,
  p_original_filename text,
  p_storage_path text,
  p_file_size bigint default null,
  p_mime_type text default null,
  p_semantic_delay_ms integer default 5000
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

  -- Insertion atomique : la photo + ses jobs dans la même transaction (corps PL/pgSQL).
  insert into public.photos (
    id, project_id, original_filename, file_size, mime_type, storage_path, analysis_status
  ) values (
    p_photo_id, p_project_id, p_original_filename, p_file_size, p_mime_type, p_storage_path, 'pending'
  )
  returning * into v_row;

  insert into public.jobs (project_id, photo_id, job_type, payload, run_after) values
    (p_project_id, p_photo_id, 'generate_thumbnail', v_payload, now()),
    (p_project_id, p_photo_id, 'quality_analysis',   v_payload, now()),
    (p_project_id, p_photo_id, 'perceptual_hash',    v_payload, now()),
    (p_project_id, p_photo_id, 'semantic_embedding', v_payload, now() + v_delay);

  return v_row;
end;
$$;
revoke execute on function public.register_cloud_photo(uuid, uuid, text, text, bigint, text, integer) from public;
revoke execute on function public.register_cloud_photo(uuid, uuid, text, text, bigint, text, integer) from anon;
grant execute on function public.register_cloud_photo(uuid, uuid, text, text, bigint, text, integer) to authenticated;

-- Enfilage du job de détection de visages — STRICT opt-in vérifié côté serveur
-- (projects.face_analysis_enabled), indépendamment du flag client.
create or replace function public.enqueue_face_detection_job(
  p_project_id uuid,
  p_photo_id uuid,
  p_storage_path text,
  p_delay_ms integer default 5000
)
returns public.jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_enabled boolean;
  v_row public.jobs%rowtype;
  v_delay interval := make_interval(secs => greatest(0, coalesce(p_delay_ms, 0)) / 1000.0);
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_project_member(p_project_id) then
    raise exception 'not_authorized';
  end if;

  select face_analysis_enabled into v_enabled from public.projects where id = p_project_id;
  if v_enabled is distinct from true then
    raise exception 'face_analysis_not_enabled';
  end if;

  -- La photo doit appartenir au projet.
  if not exists (
    select 1 from public.photos where id = p_photo_id and project_id = p_project_id
  ) then
    raise exception 'photo_not_in_project';
  end if;

  insert into public.jobs (project_id, photo_id, job_type, payload, run_after)
  values (
    p_project_id, p_photo_id, 'face_detection',
    jsonb_build_object('storage_path', p_storage_path),
    now() + v_delay
  )
  returning * into v_row;

  return v_row;
end;
$$;
revoke execute on function public.enqueue_face_detection_job(uuid, uuid, text, integer) from public;
revoke execute on function public.enqueue_face_detection_job(uuid, uuid, text, integer) from anon;
grant execute on function public.enqueue_face_detection_job(uuid, uuid, text, integer) to authenticated;
