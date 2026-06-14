-- P1-6 : nommage de groupe de visages transactionnel.
-- L'ancien flux (insert people PUIS update photo_faces en 2 appels) laissait une
-- personne orpheline si l'assignation échouait, et rien ne garantissait que les
-- visages appartenaient au même projet que la personne. Cette RPC fait tout dans
-- une seule transaction (corps PL/pgSQL) et vérifie l'appartenance projet.

create or replace function public.name_face_group(
  p_project_id uuid,
  p_face_ids uuid[],
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_name text := trim(p_display_name);
  v_person uuid;
  v_matched integer;
  v_expected integer := coalesce(array_length(p_face_ids, 1), 0);
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  if v_name = '' then
    raise exception 'empty_name';
  end if;
  if v_expected = 0 then
    raise exception 'no_faces';
  end if;
  if not public.is_project_member(p_project_id) then
    raise exception 'not_authorized';
  end if;

  -- Tous les visages doivent appartenir à des photos du projet ciblé.
  select count(*) into v_matched
  from public.photo_faces f
  join public.photos p on p.id = f.photo_id
  where f.id = any (p_face_ids)
    and p.project_id = p_project_id;

  if v_matched <> v_expected then
    raise exception 'faces_not_in_project';
  end if;

  insert into public.people (project_id, display_name, status)
  values (p_project_id, v_name, 'confirmed')
  returning id into v_person;

  update public.photo_faces set person_id = v_person where id = any (p_face_ids);

  return v_person;
end;
$$;
revoke execute on function public.name_face_group(uuid, uuid[], text) from public;
revoke execute on function public.name_face_group(uuid, uuid[], text) from anon;
grant execute on function public.name_face_group(uuid, uuid[], text) to authenticated;
