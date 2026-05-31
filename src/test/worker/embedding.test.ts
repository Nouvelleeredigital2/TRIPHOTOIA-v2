import { describe, expect, it } from 'vitest';
import {
  EMBEDDING_DIMENSIONS,
  createDeterministicEmbedder,
  createEmbedder,
  deterministicEmbedding,
} from '../../../worker/embedding';

const dot = (a: number[], b: number[]) =>
  a.reduce((sum, value, i) => sum + value * b[i], 0);

describe('deterministic embedder', () => {
  it('produces a normalised vector of the expected dimension', () => {
    const vector = deterministicEmbedding('image:photo-1');
    expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
    const norm = Math.sqrt(dot(vector, vector));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('is stable: same input yields an identical (cosine 1) vector', async () => {
    const embedder = createDeterministicEmbedder();
    const a = await embedder.embedImage({ storagePath: 'projects/p1/photo.jpg' });
    const b = await embedder.embedImage({ storagePath: 'projects/p1/photo.jpg' });
    expect(dot(a, b)).toBeCloseTo(1, 5);
  });

  it('separates distinct inputs (cosine well below 1)', async () => {
    const embedder = createDeterministicEmbedder();
    const a = await embedder.embedImage({ storagePath: 'projects/p1/a.jpg' });
    const b = await embedder.embedImage({ storagePath: 'projects/p1/b.jpg' });
    expect(dot(a, b)).toBeLessThan(0.5);
  });

  it('embeds text case-insensitively', async () => {
    const embedder = createDeterministicEmbedder();
    const a = await embedder.embedText('Bride and groom');
    const b = await embedder.embedText('bride and groom');
    expect(dot(a, b)).toBeCloseTo(1, 5);
  });

  it('rejects empty inputs', async () => {
    const embedder = createDeterministicEmbedder();
    await expect(embedder.embedImage({ storagePath: '' })).rejects.toThrow();
    await expect(embedder.embedText('   ')).rejects.toThrow();
  });
});

describe('createEmbedder', () => {
  it('defaults to the deterministic provider', () => {
    expect(createEmbedder({}).model).toBe('deterministic-v1');
  });

  it('throws on an unknown provider', () => {
    expect(() => createEmbedder({ EMBEDDING_PROVIDER: 'mystery' })).toThrow(/Unknown EMBEDDING_PROVIDER/);
  });

  it('builds a clip embedder with the configured model when Supabase creds are present', () => {
    const embedder = createEmbedder({
      EMBEDDING_PROVIDER: 'clip',
      EMBEDDING_MODEL: 'Xenova/clip-vit-base-patch32',
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    });
    expect(embedder.model).toBe('Xenova/clip-vit-base-patch32');
  });

  it('refuses the clip provider without service-role credentials', () => {
    expect(() => createEmbedder({ EMBEDDING_PROVIDER: 'clip' })).toThrow(/SUPABASE_URL/);
  });
});
