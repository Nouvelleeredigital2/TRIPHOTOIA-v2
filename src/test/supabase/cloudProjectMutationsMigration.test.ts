import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260531010000_treephoto_cloud_project_mutations.sql'
);

describe('cloud project mutations migration', () => {
  const sql = readFileSync(migrationPath, 'utf8').toLowerCase();

  it('defines rename / archive / soft-delete RPCs as security definer', () => {
    expect(sql).toContain(
      'create or replace function public.rename_user_project'
    );
    expect(sql).toContain(
      'create or replace function public.archive_user_project'
    );
    expect(sql).toContain(
      'create or replace function public.set_cloud_photo_deleted'
    );
    expect(
      (sql.match(/security definer/g) ?? []).length
    ).toBeGreaterThanOrEqual(3);
  });

  it('checks project membership before mutating', () => {
    expect(
      (sql.match(/is_project_member/g) ?? []).length
    ).toBeGreaterThanOrEqual(3);
  });

  it('enforces unique project name on rename (A-40)', () => {
    expect(sql).toContain('duplicate_name');
  });

  it('archives instead of hard-deleting a project (A-39)', () => {
    expect(sql).toContain("status = 'archived'");
  });

  it('soft-deletes photos via is_deleted (A-42)', () => {
    expect(sql).toContain('set is_deleted = p_deleted');
  });

  it('grants execution to authenticated users', () => {
    expect(sql).toContain(
      'grant execute on function public.rename_user_project(uuid, text) to authenticated'
    );
    expect(sql).toContain(
      'grant execute on function public.set_cloud_photo_deleted(uuid, boolean) to authenticated'
    );
  });
});
