import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(process.cwd(), 'supabase', 'migrations', '20260528102000_treephoto_cloud_v1.sql');

describe('TreePhoto cloud schema migration', () => {
  const sql = readFileSync(migrationPath, 'utf8').toLowerCase();

  it('creates the minimal business tables for cloud projects', () => {
    [
      'organizations',
      'organization_members',
      'projects',
      'photos',
      'photo_analysis',
      'collections',
      'collection_photos',
      'jobs',
    ].forEach((table) => {
      expect(sql).toContain(`create table if not exists public.${table}`);
    });
  });

  it('declares the V1 status constraints used by AutoFlow', () => {
    expect(sql).toContain("pick_status in ('unreviewed', 'pick', 'reject', 'review')");
    expect(sql).toContain("autoflow_class in ('keep', 'review', 'reject')");
    expect(sql).toContain("status in ('pending', 'processing', 'completed', 'failed')");
  });

  it('enables RLS and member policies on each table', () => {
    [
      'organizations',
      'organization_members',
      'projects',
      'photos',
      'photo_analysis',
      'collections',
      'collection_photos',
      'jobs',
    ].forEach((table) => {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`create policy "${table}_members_select"`);
    });
  });

  it('adds indexes for membership, project access and job polling', () => {
    expect(sql).toContain('organization_members_user_idx');
    expect(sql).toContain('projects_org_idx');
    expect(sql).toContain('photos_project_status_idx');
    expect(sql).toContain('jobs_polling_idx');
  });
});
