import { describe, expect, it, vi } from 'vitest';
import {
  formatSimilarityScore,
  parseEmbedding,
  searchPhotosByText,
  searchSimilarToPhoto,
} from '../../../features/cloud-projects/cloudSemanticSearch';

const makeEmbeddingClient = (embedding: unknown) => {
  const maybeSingle = vi.fn().mockResolvedValue({ data: embedding === undefined ? null : { embedding }, error: null });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  return {
    from: vi.fn(() => ({ select })),
    rpc: vi.fn(),
  };
};

describe('parseEmbedding', () => {
  it('parses a JSON string vector', () => {
    expect(parseEmbedding('[0.1, 0.2, 0.3]')).toEqual([0.1, 0.2, 0.3]);
  });
  it('passes through an array', () => {
    expect(parseEmbedding([1, 2])).toEqual([1, 2]);
  });
  it('returns null for invalid input', () => {
    expect(parseEmbedding('not-json')).toBeNull();
    expect(parseEmbedding(null)).toBeNull();
  });
});

describe('formatSimilarityScore', () => {
  it('renders an explainable percentage', () => {
    expect(formatSimilarityScore(0.923)).toBe('92 % similaire');
    expect(formatSimilarityScore(1.4)).toBe('100 % similaire');
    expect(formatSimilarityScore(-0.2)).toBe('0 % similaire');
  });
});

describe('searchSimilarToPhoto', () => {
  it('returns ranked semantic matches via the RPC', async () => {
    const client = makeEmbeddingClient('[0.1, 0.2, 0.3]');
    client.rpc.mockResolvedValue({
      data: [
        { photo_id: 'photo-2', similarity: 0.91 },
        { photo_id: 'photo-3', similarity: 0.72 },
      ],
      error: null,
    });

    const response = await searchSimilarToPhoto({
      projectId: 'project-1',
      photoId: 'photo-1',
      client: client as never,
    });

    expect(client.rpc).toHaveBeenCalledWith('match_photo_embeddings', {
      query_embedding: [0.1, 0.2, 0.3],
      target_project_id: 'project-1',
      match_count: 24,
      exclude_photo_id: 'photo-1',
    });
    expect(response.source).toBe('semantic');
    expect(response.results).toEqual([
      { photoId: 'photo-2', similarity: 0.91 },
      { photoId: 'photo-3', similarity: 0.72 },
    ]);
  });

  it('falls back when the reference photo has no embedding', async () => {
    const client = makeEmbeddingClient(undefined);
    const response = await searchSimilarToPhoto({
      projectId: 'project-1',
      photoId: 'photo-1',
      client: client as never,
    });
    expect(response).toEqual({ source: 'fallback', results: [], reason: 'no-embedding' });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('falls back when the RPC errors (e.g. model/index unavailable)', async () => {
    const client = makeEmbeddingClient('[0.1, 0.2]');
    client.rpc.mockResolvedValue({ data: null, error: { message: 'vector ext missing' } });
    const response = await searchSimilarToPhoto({
      projectId: 'project-1',
      photoId: 'photo-1',
      client: client as never,
    });
    expect(response).toEqual({ source: 'fallback', results: [], reason: 'rpc-error' });
  });

  it('falls back when there are no similar results', async () => {
    const client = makeEmbeddingClient('[0.1, 0.2]');
    client.rpc.mockResolvedValue({ data: [], error: null });
    const response = await searchSimilarToPhoto({
      projectId: 'project-1',
      photoId: 'photo-1',
      client: client as never,
    });
    expect(response.reason).toBe('no-results');
  });
});

describe('searchPhotosByText', () => {
  it('falls back without a configured text embedder', async () => {
    const response = await searchPhotosByText({
      projectId: 'project-1',
      query: 'bride and groom',
      client: { rpc: vi.fn() } as never,
    });
    expect(response).toEqual({ source: 'fallback', results: [], reason: 'no-text-embedder' });
  });

  it('falls back on an empty query', async () => {
    const response = await searchPhotosByText({
      projectId: 'project-1',
      query: '   ',
      embedText: async () => [1, 2, 3],
      client: { rpc: vi.fn() } as never,
    });
    expect(response.reason).toBe('empty-query');
  });

  it('falls back when the text embedder throws', async () => {
    const response = await searchPhotosByText({
      projectId: 'project-1',
      query: 'sunset kiss',
      embedText: async () => {
        throw new Error('model offline');
      },
      client: { rpc: vi.fn() } as never,
    });
    expect(response).toEqual({ source: 'fallback', results: [], reason: 'embed-error' });
  });

  it('runs a semantic match when a text embedder is provided', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ photo_id: 'photo-9', similarity: 0.8 }], error: null });
    const response = await searchPhotosByText({
      projectId: 'project-1',
      query: 'first dance',
      embedText: async () => [0.5, 0.5],
      client: { rpc } as never,
    });
    expect(rpc).toHaveBeenCalledWith('match_photo_embeddings', {
      query_embedding: [0.5, 0.5],
      target_project_id: 'project-1',
      match_count: 24,
      exclude_photo_id: null,
    });
    expect(response.source).toBe('semantic');
    expect(response.results).toEqual([{ photoId: 'photo-9', similarity: 0.8 }]);
  });
});
