-- TreePhoto — RPC utilisateur manquantes dans l'historique de migrations.
-- Le frontend (src/features/cloud-projects/cloudProjects.ts) appelle
-- create_user_project / ensure_user_organization, et la policy INSERT durcie
-- des organizations (migration 20260531040000) s'appuie sur current_user_id().
-- Ces fonctions existaient sur l'ancienne instance mais n'avaient jamais été
-- versionnées.

-- Wrapper stable autour de auth.uid(), utilisable dans les policies RLS.
create or replace function public.current_user_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select auth.uid();
$$;
grant execute on function public.current_user_id() to anon, authenticated;

-- Garantit que l'utilisateur courant possède une organisation (et sa ligne de
-- membership owner). Retourne l'id de l'organisation.
create or replace function public.ensure_user_organization()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  select o.id into v_org
  from public.organizations o
  where o.owner_id = v_user
  order by o.created_at
  limit 1;

  if v_org is null then
    insert into public.organizations (name, owner_id)
    values ('Mon studio', v_user)
    returning id into v_org;
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org, v_user, 'owner')
  on conflict (organization_id, user_id) do nothing;

  return v_org;
end;
$$;
revoke execute on function public.ensure_user_organization() from public;
grant execute on function public.ensure_user_organization() to authenticated;

-- Crée un projet dans l'organisation de l'utilisateur courant (créée au besoin).
create or replace function public.create_user_project(p_name text, p_project_type text default 'general')
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_name text := trim(p_name);
  v_row public.projects%rowtype;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  if v_name = '' then
    raise exception 'empty_name';
  end if;

  v_org := public.ensure_user_organization();

  if exists (
    select 1 from public.projects p
    where p.organization_id = v_org
      and lower(p.name) = lower(v_name)
  ) then
    raise exception 'duplicate_name';
  end if;

  insert into public.projects (organization_id, name, project_type, created_by)
  values (v_org, v_name, coalesce(nullif(trim(p_project_type), ''), 'general'), v_user)
  returning * into v_row;

  return v_row;
end;
$$;
revoke execute on function public.create_user_project(text, text) from public;
grant execute on function public.create_user_project(text, text) to authenticated;
