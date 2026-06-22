import { createDeterministicEmbedder, Embedder } from './embedding';
import {
  createDeterministicFaceDetector,
  DetectedFace,
  FaceDetector,
} from './faceDetection';
import {
  createStubImageProcessor,
  ImageProcessor,
} from './imageProcessing';

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
  // Le query-builder Supabase est chaîné dynamiquement (.select().eq()...) ;
  // on garde un type minimal volontairement souple ici.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
}

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Worker job failed';
};

const storagePathOf = (job: WorkerJob): string =>
  typeof job.payload.storage_path === 'string' ? job.payload.storage_path : '';

// P0-5 : thumbnail/quality/hash délèguent à un `ImageProcessor` injectable. Par
// défaut = stub (dev/test : miniature = chemin, qualité par défaut, hash dérivé
// du chemin). En production, `assertProvidersAllowed` refuse le stub : seul le
// moteur réel `sharp` (IMAGE_PROCESSOR=sharp) traite les pixels et téléverse une
// vraie miniature — un job ne peut donc être `completed` sans artefact réel.
export const createDefaultJobProcessors = (
  embedder: Embedder = createDeterministicEmbedder(),
  faceDetector: FaceDetector = createDeterministicFaceDetector(),
  imageProcessor: ImageProcessor = createStubImageProcessor()
): Required<JobProcessorMap> => ({
  async generate_thumbnail(job) {
    const { thumbnailPath } = await imageProcessor.thumbnail(storagePathOf(job));
    return {
      result: { thumbnail_path: thumbnailPath, processor: imageProcessor.kind },
      photoUpdate: {
        thumbnail_path: thumbnailPath,
        analysis_status: 'processing',
      },
    };
  },

  async quality_analysis(job) {
    const q = await imageProcessor.quality(storagePathOf(job));
    return {
      result: {
        score: q.score,
        sharpness_score: q.sharpnessScore,
        exposure_score: q.exposureScore,
        is_blurry: q.isBlurry,
        processor: imageProcessor.kind,
      },
      photoAnalysis: {
        photo_id: job.photo_id,
        score: q.score,
        sharpness_score: q.sharpnessScore,
        exposure_score: q.exposureScore,
        is_blurry: q.isBlurry,
        explanation: q.isBlurry
          ? 'Image potentiellement floue.'
          : 'Qualite suffisante pour revue AutoFlow.',
      },
      photoUpdate: { analysis_status: 'completed' },
    };
  },

  async perceptual_hash(job) {
    const perceptualHash = await imageProcessor.perceptualHash(
      storagePathOf(job)
    );
    return {
      result: { perceptual_hash: perceptualHash, processor: imageProcessor.kind },
      photoAnalysis: {
        photo_id: job.photo_id,
        perceptual_hash: perceptualHash,
      },
    };
  },

  async semantic_embedding(job) {
    const storagePath =
      typeof job.payload.storage_path === 'string'
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
    const storagePath =
      typeof job.payload.storage_path === 'string'
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

export const defaultJobProcessors: Required<JobProcessorMap> =
  createDefaultJobProcessors();

// P0-3 : réclamation atomique d'un job via la RPC SQL `claim_next_job`, qui
// utilise FOR UPDATE SKIP LOCKED. Remplace l'ancien couple SELECT + UPDATE non
// atomique : deux workers ne peuvent plus prendre le même job, et il n'y a plus
// d'erreur `.single()` sur 0 ligne lorsqu'un autre worker a gagné la course.
export interface RpcCapableClient extends SupabaseLikeClient {
  rpc: (
    name: string,
    params?: Record<string, unknown>
  ) => PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
}

export async function claimNextJob(
  client: RpcCapableClient,
  workerId: string
): Promise<WorkerJob | null> {
  const { data, error } = await client.rpc('claim_next_job', {
    p_worker_id: workerId,
  });
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
  result: Record<string, unknown>
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
  errorMessage: string
): Promise<void> {
  // P1-E : on délègue à la RPC `fail_or_retry_job` qui réessaie avec un backoff
  // exponentiel borné tant que `attempts < max_attempts`, puis bascule le job en
  // `dead_letter`. Repli (environnement sans RPC, p. ex. tests) : échec terminal.
  const rpcClient = client as Partial<RpcCapableClient>;
  if (typeof rpcClient.rpc === 'function') {
    const { error } = await rpcClient.rpc('fail_or_retry_job', {
      p_job_id: jobId,
      p_error: errorMessage,
    });
    if (error) throw error;
    return;
  }

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

/**
 * P1-E : récupère les jobs bloqués en `processing` dont le lock a expiré (worker
 * crashé). Renvoie le nombre de jobs remis en file. Best-effort : une erreur est
 * journalisée sans interrompre la boucle.
 */
export async function reclaimStuckJobs(
  client: RpcCapableClient,
  leaseSeconds = 300
): Promise<number> {
  const { data, error } = await client.rpc('reclaim_stuck_jobs', {
    p_lease_seconds: leaseSeconds,
  });
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

export async function applyWorkerResult(
  client: SupabaseLikeClient,
  job: WorkerJob,
  workerResult: JobProcessorResult
): Promise<void> {
  if (job.photo_id && workerResult.photoAnalysis) {
    const { error } = await client.from('photo_analysis').upsert({
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
    const { error } = await client.from('photo_embeddings').upsert({
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
  processors: JobProcessorMap = defaultJobProcessors
): Promise<void> {
  try {
    const processor =
      processors[job.job_type] ?? defaultJobProcessors[job.job_type];
    // Garde-fou : un job_type inconnu doit échouer avec un message explicite
    // (et non un « processor is not a function »), pour que error_message soit
    // exploitable côté supervision — sans jamais laisser le job bloqué.
    if (typeof processor !== 'function') {
      throw new Error(`Unknown job type "${job.job_type}"`);
    }
    const workerResult = await processor(job);
    await applyWorkerResult(client, job, workerResult);
    await markJobCompleted(client, job.id, workerResult.result ?? {});
  } catch (error) {
    await markJobFailed(client, job.id, toErrorMessage(error));
  }
}
