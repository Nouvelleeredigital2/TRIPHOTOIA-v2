import { supabase } from '../../lib/supabase';
import type { ActiveCloudProject } from '../../store/cloudProjectStore';

export const PROJECT_PHOTOS_BUCKET = 'project-photos';

// Semantic embedding is the heaviest job; defer it so the cheap analysis jobs
// (thumbnail, quality, perceptual hash) are picked up first by the worker.
export const SEMANTIC_EMBEDDING_DELAY_MS = 5000;
// Face detection runs only when the project opted in; defer it like embeddings.
export const FACE_DETECTION_DELAY_MS = 5000;

interface CloudUploadClient {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        file: File,
        options: { cacheControl: string; upsert: boolean }
      ) => Promise<{ error: Error | null } | { error: unknown }>;
    };
  };
  from: (table: string) => {
    insert: (payload: unknown) => unknown;
  };
}

interface BuildProjectPhotoStoragePathParams {
  organizationId: string;
  projectId: string;
  photoId: string;
  filename: string;
}

interface UploadPhotosToCloudParams {
  activeProject: ActiveCloudProject;
  files: File[];
  localPhotoIds?: string[];
  client?: CloudUploadClient | null;
  createPhotoId?: () => string;
  onProgress?: (progress: number) => void;
  now?: () => Date;
  faceAnalysisEnabled?: boolean;
}

export interface CloudPhotoUploadMapping {
  localPhotoId: string;
  cloudPhotoId: string;
}

interface UploadPhotosToCloudResult {
  uploaded: number;
  photoIds: string[];
  mappings: CloudPhotoUploadMapping[];
}

export function buildProjectPhotoStoragePath({
  organizationId,
  projectId,
  photoId,
  filename,
}: BuildProjectPhotoStoragePathParams): string {
  return [
    'organizations',
    organizationId,
    'projects',
    projectId,
    'originals',
    `${photoId}-${sanitizeFilename(filename)}`,
  ].join('/');
}

export async function uploadPhotosToCloud({
  activeProject,
  files,
  localPhotoIds = [],
  client = supabase,
  createPhotoId = createUuid,
  onProgress,
  now = () => new Date(),
  faceAnalysisEnabled = false,
}: UploadPhotosToCloudParams): Promise<UploadPhotosToCloudResult> {
  if (!client) {
    throw new Error('Supabase non configuré');
  }

  const photoIds: string[] = [];
  const mappings: CloudPhotoUploadMapping[] = [];

  for (const [index, file] of files.entries()) {
    const photoId = createPhotoId();
    const storagePath = buildProjectPhotoStoragePath({
      organizationId: activeProject.organizationId,
      projectId: activeProject.id,
      photoId,
      filename: file.name,
    });

    const { error: uploadError } = await client.storage
      .from(PROJECT_PHOTOS_BUCKET)
      .upload(storagePath, file, { cacheControl: '3600', upsert: false });

    if (uploadError) throw uploadError;

    const photoInsert = client
      .from('photos')
      .insert({
        id: photoId,
        project_id: activeProject.id,
        original_filename: file.name,
        file_size: file.size,
        mime_type: file.type || null,
        storage_path: storagePath,
        analysis_status: 'pending',
      }) as {
        select: (columns: string) => {
          single: () => Promise<{ error: unknown }>;
        };
      };
    const { error: photoError } = await photoInsert.select('id').single();

    if (photoError) throw photoError;

    const jobs: Array<Record<string, unknown>> = [
      {
        project_id: activeProject.id,
        photo_id: photoId,
        job_type: 'generate_thumbnail',
        status: 'pending',
      },
      {
        project_id: activeProject.id,
        photo_id: photoId,
        job_type: 'quality_analysis',
        status: 'pending',
      },
      {
        project_id: activeProject.id,
        photo_id: photoId,
        job_type: 'perceptual_hash',
        status: 'pending',
      },
      {
        project_id: activeProject.id,
        photo_id: photoId,
        job_type: 'semantic_embedding',
        status: 'pending',
        payload: { storage_path: storagePath },
        run_after: new Date(now().getTime() + SEMANTIC_EMBEDDING_DELAY_MS).toISOString(),
      },
    ];

    // Strict opt-in: face detection is only enqueued when the project enabled it.
    if (faceAnalysisEnabled) {
      jobs.push({
        project_id: activeProject.id,
        photo_id: photoId,
        job_type: 'face_detection',
        status: 'pending',
        payload: { storage_path: storagePath },
        run_after: new Date(now().getTime() + FACE_DETECTION_DELAY_MS).toISOString(),
      });
    }

    const jobsInsert = client.from('jobs').insert(jobs) as Promise<{ error: unknown }>;
    const { error: jobsError } = await jobsInsert;

    if (jobsError) throw jobsError;

    photoIds.push(photoId);
    const localPhotoId = localPhotoIds[index];
    if (localPhotoId) {
      mappings.push({ localPhotoId, cloudPhotoId: photoId });
    }
    onProgress?.(Math.round(((index + 1) / files.length) * 100));
  }

  return {
    uploaded: photoIds.length,
    photoIds,
    mappings,
  };
}

function sanitizeFilename(filename: string): string {
  const fallback = 'photo';
  const sanitized = filename
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return sanitized || fallback;
}

function createUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `photo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
