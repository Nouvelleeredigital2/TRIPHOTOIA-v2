import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260529140000_treephoto_faces_v2.sql'
);

describe('TreePhoto faces schema migration', () => {
  const sql = readFileSync(migrationPath, 'utf8').toLowerCase();

  it('adds a strict opt-in flag defaulting to false', () => {
    expect(sql).toContain(
      'add column if not exists face_analysis_enabled boolean not null default false'
    );
  });

  it('creates the people table with a nullable (never auto-filled) display name', () => {
    expect(sql).toContain('create table if not exists public.people');
    expect(sql).toContain("status in ('unconfirmed', 'confirmed')");
    // display_name has no NOT NULL and no default -> stays null until manually set.
    expect(sql).toMatch(/display_name text(?!\s+not null)/);
  });

  it('creates the photo_faces table with a 128-dim face embedding', () => {
    expect(sql).toContain('create table if not exists public.photo_faces');
    expect(sql).toContain('embedding vector(128) not null');
    expect(sql).toContain(
      'person_id uuid references public.people(id) on delete set null'
    );
    expect(sql).toContain('using hnsw (embedding vector_cosine_ops)');
  });

  it('enables RLS with member policies including delete for face data removal', () => {
    ['people', 'photo_faces'].forEach((table) => {
      expect(sql).toContain(
        `alter table public.${table} enable row level security`
      );
      expect(sql).toContain(`create policy "${table}_members_select"`);
      expect(sql).toContain(`create policy "${table}_members_delete"`);
    });
  });

  it('extends the jobs type constraint with face_detection', () => {
    expect(sql).toContain('drop constraint if exists jobs_job_type_check');
    expect(sql).toContain("'face_detection'");
  });
});
