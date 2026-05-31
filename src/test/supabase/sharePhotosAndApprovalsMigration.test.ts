import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260531000000_treephoto_share_photos_and_approvals.sql',
);

describe('share photos + approvals migration', () => {
  const sql = readFileSync(migrationPath, 'utf8').toLowerCase();

  it('exposes a token-scoped, expiry-aware security-definer reader for shared photos', () => {
    expect(sql).toContain('create or replace function public.get_shared_photos');
    expect(sql).toContain('security definer');
    expect(sql).toContain('where s.token = target_token');
    expect(sql).toContain('s.expires_at is null or s.expires_at > now()');
  });

  it('grants the public read RPC to anon', () => {
    expect(sql).toContain('grant execute on function public.get_shared_photos(text) to anon');
  });

  it('does not expose the photographer private notes through the public reader', () => {
    // The shared-photos function returns the metadata columns but must not select pm.notes.
    const fnStart = sql.indexOf('create or replace function public.get_shared_photos');
    const fnEnd = sql.indexOf('$$;', fnStart);
    const fnBody = sql.slice(fnStart, fnEnd);
    expect(fnBody).not.toContain('pm.notes');
  });

  it('creates the share_approvals table with RLS enabled', () => {
    expect(sql).toContain('create table if not exists public.share_approvals');
    expect(sql).toContain('alter table public.share_approvals enable row level security');
  });

  it('restricts approval reads to the share link owner', () => {
    expect(sql).toContain('create policy "share_approvals_owner_read"');
    expect(sql).toContain('s.user_id = auth.uid()');
  });

  it('lets a client write an approval only for a photo included in a non-expired link', () => {
    expect(sql).toContain('create or replace function public.set_share_approval');
    expect(sql).toContain('photo_not_in_share');
    expect(sql).toContain('invalid_or_expired_token');
    expect(sql).toContain('grant execute on function public.set_share_approval');
  });

  it('lets a returning client and the owner read approvals', () => {
    expect(sql).toContain('create or replace function public.get_share_approvals(target_token text)');
    expect(sql).toContain('create or replace function public.get_share_approvals_for_owner');
  });
});
