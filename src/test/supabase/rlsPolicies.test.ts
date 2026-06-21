import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Cross-migration RLS audit. The per-migration tests assert local intent;
// this suite enforces global invariants over the whole migration set so a new
// table or a loosened policy in any future migration is caught here.

const migrationsDir = join(process.cwd(), 'supabase', 'migrations');

const migrationFiles = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

const rawByFile = migrationFiles.map((f) => ({
  file: f,
  sql: readFileSync(join(migrationsDir, f), 'utf8'),
}));

// Strip `-- ...` line comments so audits never match commentary that merely
// *describes* a removed/insecure pattern (e.g. "the legacy policy used using (true)").
const stripComments = (sql: string): string =>
  sql
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('--');
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join('\n');

const allSql = rawByFile.map((m) => m.sql).join('\n').toLowerCase();
const codeSql = stripComments(allSql);

const matchAll = (re: RegExp, text: string): string[] =>
  [...text.matchAll(re)].map((m) => m[1]);

describe('Supabase RLS policy audit (all migrations)', () => {
  it('has migrations to audit', () => {
    expect(migrationFiles.length).toBeGreaterThan(0);
  });

  it('enables Row Level Security on every table it creates', () => {
    const created = new Set(
      matchAll(/create table if not exists public\.([a-z_]+)/g, codeSql),
    );
    const rlsEnabled = new Set(
      matchAll(/alter table public\.([a-z_]+) enable row level security/g, codeSql),
    );

    expect(created.size).toBeGreaterThan(0);
    const missing = [...created].filter((t) => !rlsEnabled.has(t));
    expect(missing).toEqual([]);
  });

  it('covers the core user-owned business tables', () => {
    const rlsEnabled = new Set(
      matchAll(/alter table public\.([a-z_]+) enable row level security/g, codeSql),
    );
    [
      'organizations',
      'organization_members',
      'projects',
      'photos',
      'photo_analysis',
      'collections',
      'collection_photos',
      'jobs',
      'people',
      'photo_faces',
      'photo_embeddings',
    ].forEach((table) => {
      expect(rlsEnabled.has(table)).toBe(true);
    });
  });

  it('declares no unrestricted policy predicate on any table (no active using (true) / with check (true))', () => {
    // Only commentary may mention these; real policy bodies must be scoped.
    expect(codeSql).not.toMatch(/using\s*\(\s*true\s*\)/);
    expect(codeSql).not.toMatch(/with check\s*\(\s*true\s*\)/);
  });

  it('protects share links behind a token-scoped, expiry-aware accessor', () => {
    expect(codeSql).toContain('create or replace function public.get_shared_link');
    expect(codeSql).toContain('security definer');
    expect(codeSql).toContain('where s.token = target_token');
    // The enumerable public-read policy must never be (re)created.
    expect(codeSql).not.toContain('create policy "share_links_public_read"');
  });

  it('never grants table-policy access via service_role (worker bypasses RLS instead)', () => {
    // service_role may only appear in function execute grants, not in CREATE POLICY ... TO service_role.
    expect(codeSql).not.toMatch(/create policy[^;]*\bto\b[^;]*service_role/);
  });
});
