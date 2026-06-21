-- P1-E : reprise des jobs cloud — retry/backoff borné, dead-letter queue,
-- récupération des locks expirés. Migration additive et idempotente.

-- 1) Plafond de tentatives + statut terminal `dead_letter`.
alter table public.jobs
  add column if not exists max_attempts integer not null default 5;

alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs add constraint jobs_status_check
  check (status = any (array['pending','processing','completed','failed','dead_letter']));

-- 2) Échec d'un job : retry avec backoff exponentiel borné tant que
-- attempts < max_attempts, sinon bascule en dead-letter. Atomique.
create or replace function public.fail_or_retry_job(
  p_job_id uuid,
  p_error text,
  p_base_delay_seconds integer default 30
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempts integer;
  v_max integer;
  v_delay integer;
  v_status text;
begin
  select attempts, max_attempts into v_attempts, v_max
    from public.jobs where id = p_job_id;
  if not found then
    return null;
  end if;

  if v_attempts < v_max then
    -- backoff exponentiel borné à 1 h ; `attempts` a déjà été incrémenté au claim.
    v_delay := least(p_base_delay_seconds * (2 ^ greatest(v_attempts - 1, 0))::integer, 3600);
    update public.jobs
       set status = 'pending',
           error_message = p_error,
           run_after = now() + make_interval(secs => v_delay),
           locked_at = null,
           locked_by = null,
           updated_at = now()
     where id = p_job_id;
    v_status := 'pending';
  else
    update public.jobs
       set status = 'dead_letter',
           error_message = p_error,
           locked_at = null,
           locked_by = null,
           updated_at = now()
     where id = p_job_id;
    v_status := 'dead_letter';
  end if;

  return v_status;
end;
$$;

-- 3) Récupération des jobs bloqués en `processing` (worker crashé / lock expiré).
create or replace function public.reclaim_stuck_jobs(
  p_lease_seconds integer default 300
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.jobs
     set status = 'pending',
         locked_at = null,
         locked_by = null,
         updated_at = now()
   where status = 'processing'
     and locked_at is not null
     and locked_at < now() - make_interval(secs => p_lease_seconds);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Réservé au worker (service_role). Pas d'accès anon.
revoke all on function public.fail_or_retry_job(uuid, text, integer) from public, anon;
revoke all on function public.reclaim_stuck_jobs(integer) from public, anon;
grant execute on function public.fail_or_retry_job(uuid, text, integer) to service_role;
grant execute on function public.reclaim_stuck_jobs(integer) to service_role;
