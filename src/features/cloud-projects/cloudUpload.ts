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
  // Direct table inserts are kept for backward compat but not used by uploadPhotosToCloud
  // (which uses RPCs to work around ES256/JWKS role-switching issues in new Supabase projects).
  from?: (table: string) => { insert: (payload: unknown) => unknown };
  rpc: (name: string, params?: Record<string, unknown>) => PromiseLike<{ error: unknown }>;
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

    // Sur les nouvelles instances Supabase ES256/JWKS, PostgREST n'effectue pas la
    // bascule de rôle anon→authenticated, ce qui bloque les INSERTs directs via RLS.
    // On passe par la RPC register_cloud_photo (SECURITY DEFINER) qui insère la photo
    // et ses jobs côté serveur, avec vérification auth.uid() + is_project_member.
    const { error: photoError } = await (client.rpc('register_cloud_photo', {
      p_project_id: activeProject.id,
      p_photo_id: photoId,
      p_original_filename: file.name,
      p_storage_path: storagePath,
      p_file_size: file.size,
      p_mime_type: file.type || null,
      p_semantic_delay_ms: SEMANTIC_EMBEDDING_DELAY_MS,
    }) as Promise<{ error: unknown }>);

    if (photoError) throw photoError;

    // Opt-in face detection : enfilé séparément si activé, car la RPC principale
    // n'inclut pas ce job (opt-in par projet).
    if (faceAnalysisEnabled) {
      const faceJobInsert = client.rpc('enqueue_face_detection_job', {
        p_project_id: activeProject.id,
        p_photo_id: photoId,
        p_storage_path: storagePath,
        p_delay_ms: FACE_DETECTION_DELAY_MS,
      }) as Promise<{ error: unknown }>;
      const { error: faceError } = await faceJobInsert;
      if (faceError) throw faceError;
    }

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
