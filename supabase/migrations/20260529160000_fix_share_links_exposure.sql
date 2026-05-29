-- Security fix: the legacy `share_links_public_read` policy used `using (true)`,
-- exposing every share link (token, user_id, photo_file_hashes) to anonymous users.
-- Replace it with a token-scoped, security-definer RPC that returns only the
-- requested link's shared photo hashes (and only while it is not expired).
--
-- Idempotent and guarded: only runs when the legacy `share_links` table exists.

do $$
begin
  if to_regclass('public.share_links') is null then
    return;
  end if;

  -- Remove the over-permissive public read policy.
  execute 'drop policy if exists "share_links_public_read" on public.share_links';
end
$$;

-- Token-scoped accessor. SECURITY DEFINER so the public share page can resolve a
-- single token without any broad table read. Returns nothing for unknown/expired
-- tokens, so the table can no longer be enumerated by anonymous callers.
create or replace function public.get_shared_link(target_token text)
returns table (
  id uuid,
  user_id uuid,
  token text,
  name text,
  photo_file_hashes text[],
  created_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.user_id, s.token, s.name, s.photo_file_hashes, s.created_at, s.expires_at
  from public.share_links s
  where s.token = target_token
    and (s.expires_at is null or s.expires_at > now());
$$;

-- Allow anonymous + authenticated callers to resolve a token, nothing else.
grant execute on function public.get_shared_link(text) to anon, authenticated;
