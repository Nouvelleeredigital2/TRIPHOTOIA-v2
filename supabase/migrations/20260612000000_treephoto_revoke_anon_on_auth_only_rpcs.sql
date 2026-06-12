-- TreePhoto — correctif du durcissement 20260531030000 : sur Supabase, les
-- privilèges par défaut accordent EXECUTE explicitement à anon (en plus du
-- grant implicite PUBLIC). Le `revoke ... from public` ne retirait donc pas
-- l'accès anonyme. On révoque explicitement anon sur les RPC auth-only.
-- Les RPC de partage scopées par token (get_shared_link, get_shared_photos,
-- get_share_approvals, set_share_approval) restent volontairement anonymes.

revoke execute on function public.rename_user_project(uuid, text) from anon;
revoke execute on function public.archive_user_project(uuid) from anon;
revoke execute on function public.set_cloud_photo_deleted(uuid, boolean) from anon;
revoke execute on function public.get_share_approvals_for_owner(uuid) from anon;
revoke execute on function public.create_user_project(text, text) from anon;
revoke execute on function public.ensure_user_organization() from anon;
