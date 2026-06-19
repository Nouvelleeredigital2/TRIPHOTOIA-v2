-- P0-3 : prise de job atomique pour le worker.
-- L'ancien schéma (SELECT puis UPDATE WHERE status='pending' avec .single())
-- permettait à deux workers de lire le même job ; le perdant levait une erreur
-- non rattrapée qui pouvait arrêter le process. claim_next_job verrouille et
-- réclame un seul job en une opération atomique via FOR UPDATE SKIP LOCKED.

create or replace function public.claim_next_job(p_worker_id text)
returns public.jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.jobs%rowtype;
begin
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
  returning j.* into v_row;

  if v_row.id is null then
    return null;
  end if;
  return v_row;
end;
$$;
-- Appelée par le worker (service_role, qui bypass la RLS). On retire l'accès
-- public/anon par hygiène ; service_role conserve ses privilèges intrinsèques.
revoke execute on function public.claim_next_job(text) from public;
revoke execute on function public.claim_next_job(text) from anon;
grant execute on function public.claim_next_job(text) to service_role;
