-- TreePhoto — durcissement : retirer l'accès anonyme (grant PUBLIC par défaut de
-- Postgres) aux RPC qui ne doivent être appelées que par un utilisateur authentifié.
--
-- Sans ça, ces fonctions SECURITY DEFINER sont exposées au rôle `anon` via PostgREST
-- (advisor 0028). Elles n'étaient pas exploitables (elles lèvent `not_authorized`
-- quand `auth.uid()` est null), mais cette migration réduit la surface d'API publique.
--
-- Idempotent.

revoke execute on function public.rename_user_project(uuid, text) from public;
grant execute on function public.rename_user_project(uuid, text) to authenticated;

revoke execute on function public.archive_user_project(uuid) from public;
grant execute on function public.archive_user_project(uuid) to authenticated;

revoke execute on function public.set_cloud_photo_deleted(uuid, boolean) from public;
grant execute on function public.set_cloud_photo_deleted(uuid, boolean) to authenticated;

revoke execute on function public.get_share_approvals_for_owner(uuid) from public;
grant execute on function public.get_share_approvals_for_owner(uuid) to authenticated;
