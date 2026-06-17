import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

export const DEFAULT_SEMANTIC_MATCH_COUNT = 24;

export interface SemanticSearchResult {
  photoId: string;
  similarity: number;
}

export type SemanticSearchSource = 'semantic' | 'fallback';

export type SemanticFallbackReason =
  | 'no-embedding'
  | 'no-text-embedder'
  | 'empty-query'
  | 'embed-error'
  | 'rpc-error'
  | 'no-results';

export interface SemanticSearchResponse {
  source: SemanticSearchSource;
  results: SemanticSearchResult[];
  reason?: SemanticFallbackReason;
}

// pgvector columns come back from PostgREST as a JSON-encoded string; storage-side
// inserts may also leave a plain array. Accept both.
export function parseEmbedding(value: unknown): number[] | null {
  if (Array.isArray(value)) {
    return value.map((entry) => Number(entry));
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.map((entry) => Number(entry))
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

// Explainable score for the UI: cosine similarity in [0, 1] -> integer percent.
export function formatSimilarityScore(similarity: number): string {
  const clamped = Math.max(0, Math.min(1, similarity));
  return `${Math.round(clamped * 100)} % similaire`;
}

function requireSupabase(
  client: SupabaseClient | null = supabase
): SupabaseClient {
  if (!client) {
    throw new Error('Supabase non configuré');
  }
  return client;
}

interface MatchParams {
  projectId: string;
  embedding: number[];
  matchCount: number;
  excludePhotoId?: string | null;
}

async function matchEmbeddings(
  db: SupabaseClient,
  { projectId, embedding, matchCount, excludePhotoId = null }: MatchParams
): Promise<SemanticSearchResponse> {
  const { data, error } = await db.rpc('match_photo_embeddings', {
    query_embedding: embedding,
    target_project_id: projectId,
    match_count: matchCount,
    exclude_photo_id: excludePhotoId,
  });

  if (error) {
    return { source: 'fallback', results: [], reason: 'rpc-error' };
  }

  const results = (
    (data ?? []) as Array<{ photo_id: string; similarity: number }>
  ).map((row) => ({
    photoId: row.photo_id,
    similarity: Number(row.similarity),
  }));

  if (results.length === 0) {
    return { source: 'fallback', results: [], reason: 'no-results' };
  }

  return { source: 'semantic', results };
}

interface SearchSimilarParams {
  projectId: string;
  photoId: string;
  client?: SupabaseClient | null;
  matchCount?: number;
}

// Image-to-image: reuse the reference photo's stored embedding, no model needed at query time.
export async function searchSimilarToPhoto({
  projectId,
  photoId,
  client = supabase,
  matchCount = DEFAULT_SEMANTIC_MATCH_COUNT,
}: SearchSimilarParams): Promise<SemanticSearchResponse> {
  const db = requireSupabase(client);

  const { data, error } = await db
    .from('photo_embeddings')
    .select('embedding')
    .eq('photo_id', photoId)
    .maybeSingle();

  if (error) throw error;

  const embedding = parseEmbedding(
    (data as { embedding?: unknown } | null)?.embedding
  );
  if (!embedding) {
    return { source: 'fallback', results: [], reason: 'no-embedding' };
  }

  return matchEmbeddings(db, {
    projectId,
    embedding,
    matchCount,
    excludePhotoId: photoId,
  });
}

export type TextEmbedder = (query: string) => Promise<number[]>;

/**
 * TextEmbedder branché sur l'Edge Function `embed-text` (CLIP texte, 512d,
 * même espace que les embeddings image). Renvoie null si Supabase n'est pas
 * configuré (l'appelant retombe alors sur le fallback mot-clé V1).
 */
export function createEdgeTextEmbedder(
  client: SupabaseClient | null = supabase
): TextEmbedder | null {
  if (!client) return null;
  return async (query: string): Promise<number[]> => {
    const { data, error } = await client.functions.invoke('embed-text', {
      body: { query },
    });
    if (error) throw error;
    const embedding = (data as { embedding?: unknown } | null)?.embedding;
    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error('embed-text: réponse invalide');
    }
    return embedding.map((value) => Number(value));
  };
}

interface SearchByTextParams {
  projectId: string;
  query: string;
  client?: SupabaseClient | null;
  embedText?: TextEmbedder | null;
  matchCount?: number;
}

// Text-image: embed the query in the shared CLIP space. Without a configured text
// embedder the caller should fall back to the V1 keyword filter.
export async function searchPhotosByText({
  projectId,
  query,
  client = supabase,
  embedText = null,
  matchCount = DEFAULT_SEMANTIC_MATCH_COUNT,
}: SearchByTextParams): Promise<SemanticSearchResponse> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { source: 'fallback', results: [], reason: 'empty-query' };
  }
  if (!embedText) {
    return { source: 'fallback', results: [], reason: 'no-text-embedder' };
  }

  let embedding: number[];
  try {
    embedding = await embedText(trimmed);
  } catch {
    return { source: 'fallback', results: [], reason: 'embed-error' };
  }

  const db = requireSupabase(client);
  return matchEmbeddings(db, { projectId, embedding, matchCount });
}
