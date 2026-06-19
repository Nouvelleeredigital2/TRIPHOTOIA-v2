import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260531020000_treephoto_shared_photos_bucket.sql',
);

describe('shared photos bucket migration (A-02)', () => {
  const sql = readFileSync(migrationPath, 'utf8').toLowerCase();

  it('creates a public shared-photos bucket', () => {
    expect(sql).toContain("'shared-photos'");
    expect(sql).toContain('storage.buckets');
    expect(sql).toContain('public = true');
  });

  it('restricts writes to the owner prefix', () => {
    expect(sql).toContain('shared_photos_owner_insert');
    expect(sql).toContain('(storage.foldername(name))[1] = (select auth.uid())::text');
  });

  it('covers insert/update/delete policies', () => {
    expect(sql).toContain('for insert');
    expect(sql).toContain('for update');
    expect(sql).toContain('for delete');
  });
});
