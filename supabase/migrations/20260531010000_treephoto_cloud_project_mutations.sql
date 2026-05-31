-- TreePhoto — LOT 9 : mutations CRUD manquantes côté projets/photos cloud.
--
-- Comme pour create_user_project, on passe par des RPC SECURITY DEFINER : sur les
-- instances Supabase ES256/JWKS, PostgREST ne bascule pas vers le rôle 'authenticated',
-- ce qui empêche les UPDATE directs via RLS. Les RPC vérifient l'appartenance au projet
-- via auth.uid() (helper public.is_project_member défini dans cloud_v1).
--
-- A-39 : renommer / archiver un projet (pas de hard delete — pas de policy DELETE sur
--        projects et cascade destructrice ; l'archivage est le soft-delete attendu).
-- A-40 : unicité du nom de projet dans l'organisation (au renommage).
-- A-42 : suppression logique d'une photo cloud (is_deleted).
--
-- Idempotent (create or replace).

create or replace function public.rename_user_project(p_project_id uuid, p_name text)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.projects%rowtype;
  v_org uuid;
  v_name text := trim(p_name);
begin
  if v_name = '' then
    raise exception 'empty_name';
  end if;
  if not public.is_project_member(p_project_id) then
    raise exception 'not_authorized';
  end if;

  select organization_id into v_org from public.projects where id = p_project_id;
  if v_org is null then
    raise exception 'project_not_found';
  end if;

  -- A-40 : pas de doublon de nom (insensible à la casse) dans la même organisation.
  if exists (
    select 1 from public.projects p
    where p.organization_id = v_org
      and p.id <> p_project_id
      and lower(p.name) = lower(v_name)
  ) then
    raise exception 'duplicate_name';
  end if;

  update public.projects set name = v_name where id = p_project_id returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.rename_user_project(uuid, text) to authenticated;

create or replace function public.archive_user_project(p_project_id uuid)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.projects%rowtype;
begin
  if not public.is_project_member(p_project_id) then
    raise exception 'not_authorized';
  end if;
  update public.projects set status = 'archived' where id = p_project_id returning * into v_row;
  if v_row.id is null then
    raise exception 'project_not_found';
  end if;
  return v_row;
end;
$$;
grant execute on function public.archive_user_project(uuid) to authenticated;

create or replace function public.set_cloud_photo_deleted(p_photo_id uuid, p_deleted boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project uuid;
begin
  select project_id into v_project from public.photos where id = p_photo_id;
  if v_project is null then
    raise exception 'photo_not_found';
  end if;
  if not public.is_project_member(v_project) then
    raise exception 'not_authorized';
  end if;
  update public.photos set is_deleted = p_deleted where id = p_photo_id;
end;
$$;
grant execute on function public.set_cloud_photo_deleted(uuid, boolean) to authenticated;
