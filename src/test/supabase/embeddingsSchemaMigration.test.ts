import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(process.cwd(), 'supabase', 'migrations', '20260529120000_treephoto_embeddings_v2.sql');

describe('TreePhoto embeddings schema migration', () => {
  const sql = readFileSync(migrationPath, 'utf8').toLowerCase();

  it('enables the pgvector extension', () => {
    expect(sql).toContain('create extension if not exists "vector"');
  });

  it('creates the photo_embeddings table with a 512-dim vector column', () => {
    expect(sql).toContain('create table if not exists public.photo_embeddings');
    expect(sql).toContain('embedding vector(512) not null');
    expect(sql).toContain('model text not null');
    expect(sql).toContain('references public.photos(id) on delete cascade');
  });

  it('adds an hnsw cosine index for similarity search', () => {
    expect(sql).toContain('using hnsw (embedding vector_cosine_ops)');
  });

  it('enables RLS and member policies on photo_embeddings', () => {
    expect(sql).toContain('alter table public.photo_embeddings enable row level security');
    expect(sql).toContain('create policy "photo_embeddings_members_select"');
    expect(sql).toContain('create policy "photo_embeddings_members_insert"');
    expect(sql).toContain('create policy "photo_embeddings_members_update"');
  });

  it('exposes a security-definer match function scoped to project members', () => {
    expect(sql).toContain('create or replace function public.match_photo_embeddings');
    expect(sql).toContain('security definer');
    expect(sql).toContain('is_project_member(target_project_id)');
    expect(sql).toContain('1 - (e.embedding <=> query_embedding) as similarity');
    expect(sql).toContain('where p.project_id = target_project_id');
  });
});
