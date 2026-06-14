import { createDeterministicEmbedder, Embedder } from './embedding';
import { createDeterministicFaceDetector, DetectedFace, FaceDetector } from './faceDetection';

export type WorkerJobType =
  | 'generate_thumbnail'
  | 'quality_analysis'
  | 'perceptual_hash'
  | 'semantic_embedding'
  | 'face_detection';

export type WorkerJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface WorkerJob {
  id: string;
  project_id: string;
  photo_id: string | null;
  job_type: WorkerJobType;
  status: WorkerJobStatus;
  attempts: number;
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
  error_message: string | null;
  run_after: string;
  locked_at: string | null;
  locked_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobProcessorResult {
  result?: Record<string, unknown>;
  photoUpdate?: Record<string, unknown>;
  photoAnalysis?: Record<string, unknown>;
  embedding?: { model: string; vector: number[] };
  faces?: DetectedFace[];
}

export type JobProcessor = (job: WorkerJob) => Promise<JobProcessorResult>;
export type JobProcessorMap = Partial<Record<WorkerJobType, JobProcessor>>;

export interface SupabaseLikeClient {
  from: (table: string) => any;
}

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Worker job failed';
};

const buildThumbnailPath = (job: WorkerJob): string => {
  const source = typeof job.payload.storage_path === 'string'
    ? job.payload.storage_path
    : `projects/${job.project_id}/photos/${job.photo_id ?? job.id}`;
  const withoutExt = source.replace(/\.[^/.]+$/, '');
  return `${withoutExt}_thumb.webp`;
};

const stableHash = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0').repeat(2).slice(0, 16);
};

export const createDefaultJobProcessors = (
  embedder: Embedder = createDeterministicEmbedder(),
  faceDetector: FaceDetector = createDeterministicFaceDetector(),
): Required<JobProcessorMap> => ({
  async generate_thumbnail(job) {
    const thumbnailPath = buildThumbnailPath(job);
    return {
      result: { thumbnail_path: thumbnailPath },
      photoUpdate: {
        thumbnail_path: thumbnailPath,
        analysis_status: 'processing',
      },
    };
  },

  async quality_analysis(job) {
    const score = Number(job.payload.score ?? 70);
    const sharpnessScore = Number(job.payload.sharpness_score ?? score);
    const compositionScore = Number(job.payload.composition_score ?? score);
    const exposureScore = Number(job.payload.exposure_score ?? score);
    const isBlurry = sharpnessScore < 45;

    return {
      result: {
        score,
        sharpness_score: sharpnessScore,
        composition_score: compositionScore,
        exposure_score: exposureScore,
        is_blurry: isBlurry,
      },
      photoAnalysis: {
        photo_id: job.photo_id,
        score,
        sharpness_score: sharpnessScore,
        composition_score: compositionScore,
        exposure_score: exposureScore,
        is_blurry: isBlurry,
        explanation: isBlurry ? 'Image potentiellement floue.' : 'Qualite suffisante pour revue AutoFlow.',
      },
      photoUpdate: { analysis_status: 'completed' },
    };
  },

  async perceptual_hash(job) {
    const source = [
      job.photo_id,
      job.payload.storage_path,
      job.payload.original_filename,
    ].filter(Boolean).join(':');
    const perceptualHash = stableHash(source || job.id);

    return {
      result: { perceptual_hash: perceptualHash },
      photoAnalysis: {
        photo_id: job.photo_id,
        perceptual_hash: perceptualHash,
      },
    };
  },

  async semantic_embedding(job) {
    const storagePath = typeof job.payload.storage_path === 'string'
      ? job.payload.storage_path
      : '';
    const vector = await embedder.embedImage({
      storagePath,
      photoId: job.photo_id,
    });

    return {
      result: { model: embedder.model, dimensions: vector.length },
      embedding: { model: embedder.model, vector },
    };
  },

  async face_detection(job) {
    const storagePath = typeof job.payload.storage_path === 'string'
      ? job.payload.storage_path
      : '';
    const faces = await faceDetector.detect({
      storagePath,
      photoId: job.photo_id,
    });

    return {
      result: { model: faceDetector.model, faces_detected: faces.length },
      faces,
    };
  },
});

export const defaultJobProcessors: Required<JobProcessorMap> = createDefaultJobProcessors();

// P0-3 : réclamation atomique d'un job via la RPC SQL `claim_next_job`, qui
// utilise FOR UPDATE SKIP LOCKED. Remplace l'ancien couple SELECT + UPDATE non
// atomique : deux workers ne peuvent plus prendre le même job, et il n'y a plus
// d'erreur `.single()` sur 0 ligne lorsqu'un autre worker a gagné la course.
export interface RpcCapableClient extends SupabaseLikeClient {
  rpc: (name: string, params?: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
}

export async function claimNextJob(
  client: RpcCapableClient,
  workerId: string,
): Promise<WorkerJob | null> {
  const { data, error } = await client.rpc('claim_next_job', { p_worker_id: workerId });
  if (error) throw error;
  // La RPC (setof) renvoie un tableau : [job] ou []. On normalise, et on ignore
  // par sécurité une ligne sans id (composite NULL d'anciennes définitions).
  const row = Array.isArray(data) ? data[0] : data;
  const job = (row as WorkerJob | undefined) ?? null;
  return job && job.id ? job : null;
}

export async function markJobCompleted(
  client: SupabaseLikeClient,
  jobId: string,
  result: Record<string, unknown>,
): Promise<void> {
  const { error } = await client
    .from('jobs')
    .update({
      status: 'completed',
      result,
      error_message: null,
      locked_at: null,
      locked_by: null,
    })
    .eq('id', jobId);

  if (error) throw error;
}

export async function markJobFailed(
  client: SupabaseLikeClient,
  jobId: string,
  errorMessage: string,
): Promise<void> {
  const { error } = await client
    .from('jobs')
    .update({
      status: 'failed',
      error_message: errorMessage,
      locked_at: null,
      locked_by: null,
    })
    .eq('id', jobId);

  if (error) throw error;
}

export async function applyWorkerResult(
  client: SupabaseLikeClient,
  job: WorkerJob,
  workerResult: JobProcessorResult,
): Promise<void> {
  if (job.photo_id && workerResult.photoAnalysis) {
    const { error } = await client
      .from('photo_analysis')
      .upsert({
        photo_id: job.photo_id,
        ...workerResult.photoAnalysis,
      });
    if (error) throw error;
  }

  if (job.photo_id && workerResult.photoUpdate) {
    const { error } = await client
      .from('photos')
      .update(workerResult.photoUpdate)
      .eq('id', job.photo_id);
    if (error) throw error;
  }

  if (job.photo_id && workerResult.embedding) {
    const { error } = await client
      .from('photo_embeddings')
      .upsert({
        photo_id: job.photo_id,
        model: workerResult.embedding.model,
        embedding: workerResult.embedding.vector,
      });
    if (error) throw error;
  }

  if (job.photo_id && workerResult.faces && workerResult.faces.length > 0) {
    const rows = workerResult.faces.map((face) => ({
      photo_id: job.photo_id,
      bounding_box: face.boundingBox,
      embedding: face.embedding,
      confidence: face.confidence,
    }));
    const { error } = await client.from('photo_faces').insert(rows);
    if (error) throw error;
  }
}

export async function processWorkerJob(
  client: SupabaseLikeClient,
  job: WorkerJob,
  processors: JobProcessorMap = defaultJobProcessors,
): Promise<void> {
  try {
    const processor = processors[job.job_type] ?? defaultJobProcessors[job.job_type];
    const workerResult = await processor(job);
    await applyWorkerResult(client, job, workerResult);
    await markJobCompleted(client, job.id, workerResult.result ?? {});
  } catch (error) {
    await markJobFailed(client, job.id, toErrorMessage(error));
  }
}
