import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260529160000_fix_share_links_exposure.sql'
);

describe('share_links exposure fix migration', () => {
  const sql = readFileSync(migrationPath, 'utf8').toLowerCase();

  it('drops the over-permissive public read policy', () => {
    expect(sql).toContain('drop policy if exists "share_links_public_read"');
  });

  it('is guarded so it only runs when the legacy table exists', () => {
    expect(sql).toContain("to_regclass('public.share_links') is null");
  });

  it('adds a token-scoped, expiry-aware security-definer accessor', () => {
    expect(sql).toContain('create or replace function public.get_shared_link');
    expect(sql).toContain('security definer');
    expect(sql).toContain('where s.token = target_token');
    expect(sql).toContain('s.expires_at is null or s.expires_at > now()');
  });

  it('does not recreate an unrestricted public read policy', () => {
    expect(sql).not.toContain('create policy "share_links_public_read"');
  });
});
