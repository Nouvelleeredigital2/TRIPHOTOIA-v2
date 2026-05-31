-- Sécurité : fixe le search_path de la fonction trigger set_updated_at
-- (advisor Supabase "function_search_path_mutable"). Sans impact fonctionnel
-- (la fonction n'utilise que now(), résolu via pg_catalog).
alter function public.set_updated_at() set search_path = '';
