-- TreePhoto — durcissement RLS : l'INSERT sur public.organizations exigeait
-- WITH CHECK (true) (advisor Supabase 0024), permettant d'insérer une organisation
-- avec un owner_id arbitraire. On aligne sur la policy UPDATE existante : on ne peut
-- insérer qu'une organisation dont on est le propriétaire.
--
-- La création nominale passe par les RPC SECURITY DEFINER (ensure_user_organization /
-- create_user_project) qui bypassent la RLS — aucun impact sur le flux d'inscription.
--
-- Idempotent (alter policy).

alter policy "organizations_owner_insert" on public.organizations
  with check (owner_id = (select public.current_user_id()));
