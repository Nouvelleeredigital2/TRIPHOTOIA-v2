-- P1-1 : RBAC owner/admin/member réellement appliqué.
-- Jusqu'ici, helpers et policies ne vérifiaient que l'appartenance : un simple
-- `member` pouvait renommer/archiver un projet, supprimer des photos, activer
-- l'analyse visage, et écrire dans `jobs`. On distingue désormais les actions
-- d'administration (réservées owner/admin) du triage courant (ouvert aux membres).

-- Helpers de rôle (SECURITY DEFINER, search_path fixé).
create or replace function public.has_organization_role(
  target_organization_id uuid,
  target_roles text[]
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_organization_id
      and m.user_id = (select auth.uid())
      and m.role = any (target_roles)
  ) or exists (
    select 1 from public.organizations o
    where o.id = target_organization_id
      and o.owner_id = (select auth.uid())
  );
$$;

create or replace function public.is_project_manager(target_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = target_project_id
      and public.has_organization_role(p.organization_id, array['owner','admin'])
  );
$$;

revoke execute on function public.has_organization_role(uuid, text[]) from anon;
revoke execute on function public.is_project_manager(uuid) from anon;
grant execute on function public.has_organization_role(uuid, text[]) to authenticated;
grant execute on function public.is_project_manager(uuid) to authenticated;

-- Mutations administratives via RPC : exiger un rôle de gestion.
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
  if not public.is_project_manager(p_project_id) then
    raise exception 'not_authorized';
  end if;

  select organization_id into v_org from public.projects where id = p_project_id;
  if v_org is null then
    raise exception 'project_not_found';
  end if;

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

create or replace function public.archive_user_project(p_project_id uuid)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.projects%rowtype;
begin
  if not public.is_project_manager(p_project_id) then
    raise exception 'not_authorized';
  end if;
  update public.projects set status = 'archived' where id = p_project_id returning * into v_row;
  if v_row.id is null then
    raise exception 'project_not_found';
  end if;
  return v_row;
end;
$$;

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
  if not public.is_project_manager(v_project) then
    raise exception 'not_authorized';
  end if;
  update public.photos set is_deleted = p_deleted where id = p_photo_id;
end;
$$;

revoke execute on function public.rename_user_project(uuid, text) from anon;
revoke execute on function public.archive_user_project(uuid) from anon;
revoke execute on function public.set_cloud_photo_deleted(uuid, boolean) from anon;
grant execute on function public.rename_user_project(uuid, text) to authenticated;
grant execute on function public.archive_user_project(uuid) to authenticated;
grant execute on function public.set_cloud_photo_deleted(uuid, boolean) to authenticated;

-- Mise à jour d'un projet (ex. toggle face_analysis_enabled) : action admin.
drop policy if exists "projects_members_update" on public.projects;
drop policy if exists "projects_managers_update" on public.projects;
create policy "projects_managers_update" on public.projects
  for update using ((select public.is_project_manager(id)))
  with check ((select public.is_project_manager(id)));

-- jobs : les clients ne doivent jamais créer/modifier de jobs (falsification de
-- statut/résultat). Création via register_cloud_photo (SECURITY DEFINER),
-- traitement par le worker (service_role, bypass RLS). On garde la lecture.
drop policy if exists "jobs_members_insert" on public.jobs;
drop policy if exists "jobs_members_update" on public.jobs;
