// Semantic embedding abstraction for the TreePhoto worker.
//
// The embedder is intentionally injectable so the job runner stays a set of pure,
// testable processors (mirroring the perceptual_hash design). The default provider
// is deterministic: it derives a stable, L2-normalised vector from an input key
// without downloading any model. That keeps dev/test/beta pipelines working
// end-to-end and gives the "fallback sans embeddings" path something meaningful to
// assert against. A real CLIP provider can be dropped in behind EMBEDDING_PROVIDER
// without changing the job runner contract.

export const EMBEDDING_DIMENSIONS = 512;
export const DETERMINISTIC_EMBEDDING_MODEL = 'deterministic-v1';

export interface ImageEmbedInput {
  storagePath: string;
  photoId?: string | null;
}

export interface Embedder {
  readonly model: string;
  embedImage(input: ImageEmbedInput): Promise<number[]>;
  embedText(input: string): Promise<number[]>;
}

type EmbeddingEnv = Record<string, string | undefined>;

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

const hashSeed = (input: string): number => {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
};

// Deterministic, normalised pseudo-embedding derived from a seed string.
export const deterministicEmbedding = (
  seed: string,
  dimensions = EMBEDDING_DIMENSIONS
): number[] => {
  let state = hashSeed(seed) || 1;
  const vector = new Array<number>(dimensions);
  let sumSquares = 0;

  for (let i = 0; i < dimensions; i += 1) {
    // xorshift32 for repeatable spread across dimensions.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    const value = (state / 0xffffffff) * 2 - 1;
    vector[i] = value;
    sumSquares += value * value;
  }

  const norm = Math.sqrt(sumSquares) || 1;
  for (let i = 0; i < dimensions; i += 1) {
    vector[i] /= norm;
  }
  return vector;
};

export const createDeterministicEmbedder = (
  dimensions = EMBEDDING_DIMENSIONS
): Embedder => ({
  model: DETERMINISTIC_EMBEDDING_MODEL,
  async embedImage(input) {
    const seed = input.storagePath || input.photoId || '';
    if (!seed) {
      throw new Error('embedImage requires a storagePath or photoId');
    }
    return deterministicEmbedding(`image:${seed}`, dimensions);
  },
  async embedText(input) {
    const seed = input.trim();
    if (!seed) {
      throw new Error('embedText requires a non-empty query');
    }
    return deterministicEmbedding(`text:${seed.toLowerCase()}`, dimensions);
  },
});

export const DEFAULT_CLIP_MODEL = 'Xenova/clip-vit-base-patch32';

// Indirect specifier so TypeScript/tsx do not statically resolve an optional dep
// that is only installed on the VPS (`pnpm add @xenova/transformers`).
const TRANSFORMERS_MODULE = '@xenova/transformers';
// @xenova/transformers est un dep optionnel non typé (installé sur le VPS only).

const loadTransformers = async (): Promise<any> => import(TRANSFORMERS_MODULE);

// Loads project image bytes from Supabase storage using the service-role client.
// Lazily imports @supabase/supabase-js so the deterministic path never pulls it in.
const createStorageImageLoader = (env: EmbeddingEnv) => {
  const url = env.SUPABASE_URL?.trim();
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket = env.PROJECT_PHOTOS_BUCKET?.trim() || 'project-photos';
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the clip provider'
    );
  }

  let clientPromise: Promise<{
    storage: {
      from: (b: string) => {
        download: (p: string) => Promise<{ data: Blob | null; error: unknown }>;
      };
    };
  }> | null = null;
  const getClient = async () => {
    if (!clientPromise) {
      clientPromise = import('@supabase/supabase-js').then(
        ({ createClient }) =>
          createClient(url, key, {
            auth: { persistSession: false, autoRefreshToken: false },
          }) as never
      );
    }
    return clientPromise;
  };

  return async (storagePath: string): Promise<Blob> => {
    const client = await getClient();
    const { data, error } = await client.storage
      .from(bucket)
      .download(storagePath);
    if (error || !data) {
      throw new Error(`Failed to download ${storagePath} from storage`);
    }
    return data;
  };
};

// Real CLIP embedder (image + text in a shared space) via Transformers.js.
// All heavy modules are imported lazily on first use; nothing is loaded unless
// EMBEDDING_PROVIDER=clip is set. NOTE: not exercised in CI — validate on the VPS
// after `pnpm add @xenova/transformers` and the first model download.
export const createClipEmbedder = (env: EmbeddingEnv): Embedder => {
  const model = env.EMBEDDING_MODEL?.trim() || DEFAULT_CLIP_MODEL;
  const loadImage = createStorageImageLoader(env);

  // Objets issus de transformers.js (non typé) — types souples assumés.

  let visionPromise: Promise<{
    processor: any;
    model: any;
    RawImage: any;
  }> | null = null;
  let textPromise: Promise<{ tokenizer: any; model: any }> | null = null;

  const getVision = async () => {
    if (!visionPromise) {
      visionPromise = (async () => {
        const tf = await loadTransformers();
        const [processor, visionModel] = await Promise.all([
          tf.AutoProcessor.from_pretrained(model),
          tf.CLIPVisionModelWithProjection.from_pretrained(model),
        ]);
        return { processor, model: visionModel, RawImage: tf.RawImage };
      })();
    }
    return visionPromise;
  };

  const getText = async () => {
    if (!textPromise) {
      textPromise = (async () => {
        const tf = await loadTransformers();
        const [tokenizer, textModel] = await Promise.all([
          tf.AutoTokenizer.from_pretrained(model),
          tf.CLIPTextModelWithProjection.from_pretrained(model),
        ]);
        return { tokenizer, model: textModel };
      })();
    }
    return textPromise;
  };

  return {
    model,
    async embedImage(input) {
      if (!input.storagePath) {
        throw new Error('clip embedImage requires a storagePath');
      }
      const blob = await loadImage(input.storagePath);
      const { processor, model: visionModel, RawImage } = await getVision();
      const image = await RawImage.fromBlob(blob);
      const inputs = await processor(image);
      const { image_embeds } = await visionModel(inputs);
      return Array.from(image_embeds.normalize(2, -1).data as Iterable<number>);
    },
    async embedText(input) {
      const trimmed = input.trim();
      if (!trimmed) {
        throw new Error('clip embedText requires a non-empty query');
      }
      const { tokenizer, model: textModel } = await getText();
      const inputs = tokenizer([trimmed], { padding: true, truncation: true });
      const { text_embeds } = await textModel(inputs);
      return Array.from(text_embeds.normalize(2, -1).data as Iterable<number>);
    },
  };
};

export const createEmbedder = (env: EmbeddingEnv = {}): Embedder => {
  const provider = (env.EMBEDDING_PROVIDER ?? 'deterministic')
    .trim()
    .toLowerCase();
  const dimensions = Number(env.EMBEDDING_DIMENSIONS ?? EMBEDDING_DIMENSIONS);
  const safeDimensions =
    Number.isFinite(dimensions) && dimensions > 0
      ? dimensions
      : EMBEDDING_DIMENSIONS;

  switch (provider) {
    case 'deterministic':
      return createDeterministicEmbedder(safeDimensions);
    case 'clip':
      return createClipEmbedder(env);
    default:
      throw new Error(
        `Unknown EMBEDDING_PROVIDER "${provider}". Supported: deterministic, clip.`
      );
  }
};
