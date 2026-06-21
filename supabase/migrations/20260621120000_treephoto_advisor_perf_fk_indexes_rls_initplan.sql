-- Advisor remediation (performance) on TreePhoto cloud DB.
-- Appliquée sur le projet staging via le MCP Supabase puis versionnée ici.
-- 1) Covering indexes for unindexed foreign keys.
-- 2) RLS policies: wrap auth.uid() in (select auth.uid()) so it is evaluated
--    once per query instead of once per row (advisor 0003 auth_rls_initplan).
--    Predicates are preserved verbatim; only the auth.uid() call site is wrapped.

-- 1) Unindexed foreign keys
create index if not exists jobs_photo_id_idx on public.jobs (photo_id);
create index if not exists projects_created_by_idx on public.projects (created_by);
create index if not exists share_links_user_id_idx on public.share_links (user_id);

-- 2) RLS init-plan: own-row policies (ALL)
drop policy if exists "cloud_collections_own" on public.cloud_collections;
create policy "cloud_collections_own" on public.cloud_collections
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "photo_metadata_own" on public.photo_metadata;
create policy "photo_metadata_own" on public.photo_metadata
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "session_stats_own" on public.session_stats;
create policy "session_stats_own" on public.session_stats
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "share_links_owner" on public.share_links;
create policy "share_links_owner" on public.share_links
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 2b) RLS init-plan: share_approvals owner read (SELECT), EXISTS predicate preserved
drop policy if exists "share_approvals_owner_read" on public.share_approvals;
create policy "share_approvals_owner_read" on public.share_approvals
  for select
  using (
    exists (
      select 1
      from public.share_links s
      where s.id = share_approvals.share_link_id
        and s.user_id = (select auth.uid())
    )
  );
