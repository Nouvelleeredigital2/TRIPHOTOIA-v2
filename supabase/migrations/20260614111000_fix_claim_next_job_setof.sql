-- Correctif de 20260614110000 : claim_next_job déclarée `returns public.jobs`
-- (composite scalaire) renvoyait une LIGNE de NULLs quand aucun job n'est prêt
-- (RETURN NULL d'un type composite). Côté PostgREST/worker, cet objet non-null
-- était pris pour un job avec id=null → erreur 22P02 sur le job suivant.
-- On passe en `returns setof public.jobs` : ensemble vide quand rien à réclamer.

drop function if exists public.claim_next_job(text);

create or replace function public.claim_next_job(p_worker_id text)
returns setof public.jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.jobs j
  set status = 'processing',
      attempts = j.attempts + 1,
      locked_at = now(),
      locked_by = p_worker_id,
      error_message = null
  where j.id = (
    select id
    from public.jobs
    where status = 'pending'
      and run_after <= now()
    order by created_at
    for update skip locked
    limit 1
  )
  returning j.*;
end;
$$;
revoke execute on function public.claim_next_job(text) from public;
revoke execute on function public.claim_next_job(text) from anon;
grant execute on function public.claim_next_job(text) to service_role;
