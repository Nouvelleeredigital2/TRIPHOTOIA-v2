-- Advisor remediation (security): worker-only job-queue functions must not be
-- callable by signed-in users via the REST API. They are invoked exclusively by
-- the worker using the service_role key (which keeps its own EXECUTE grant) and
-- are not referenced by any RLS policy, so revoking `authenticated` is safe.
--
-- Appliquée sur staging via MCP puis versionnée. Worker smoke re-vérifié OK après.
--
-- NON touché volontairement :
--  * helpers RLS (is_organization_member, has_organization_role, is_project_member,
--    is_project_manager, can_access_project_storage_object) — évalués DANS les
--    policies RLS ; révoquer leur EXECUTE casserait l'évaluation pour authenticated.
--  * fonctions de partage (get_shared_link/photos, get_share_approvals[_for_owner],
--    set_share_approval) — doivent rester anon-callable (partage public par token).
--  * RPC applicatives (create/rename/archive_user_project, register_cloud_photo,
--    enqueue_face_detection_job, set_cloud_photo_deleted, name_face_group,
--    match_photo_embeddings, ensure_user_organization) — API authentifiée du front.
--
-- Restant (hors SQL) : activer "Leaked password protection" dans le dashboard
-- Auth (Supabase → Authentication → Policies) — non configurable via migration.

revoke execute on function public.claim_next_job(text) from authenticated;
revoke execute on function public.fail_or_retry_job(uuid, text, integer) from authenticated;
revoke execute on function public.reclaim_stuck_jobs(integer) from authenticated;
