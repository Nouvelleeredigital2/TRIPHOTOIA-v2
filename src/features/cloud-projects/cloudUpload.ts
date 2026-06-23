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
      // P1-D : compensation — suppression de l'objet orphelin si l'enregistrement
      // DB échoue après un upload Storage réussi.
      remove: (paths: string[]) => Promise<{ error: unknown }>;
    };
  };
  // Direct table inserts are kept for backward compat but not used by uploadPhotosToCloud
  // (which uses RPCs to work around ES256/JWKS role-switching issues in new Supabase projects).
  from?: (table: string) => { insert: (payload: unknown) => unknown };
  rpc: (
    name: string,
    params?: Record<string, unknown>
  ) => PromiseLike<{ error: unknown }>;
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
  // P1-9 (serveur) : SHA-256 de contenu par fichier, clé d'idempotence côté RPC.
  // À ne fournir QUE lorsque la migration idempotente
  // (20260622120000_treephoto_register_cloud_photo_idempotent.sql) est déployée :
  // la signature actuelle de register_cloud_photo (7 args) rejetterait
  // p_content_hash. Absent par défaut → comportement et payload inchangés.
  contentHashes?: string[];
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

// P1-9 : statut par photo. `success` = photo + jobs OK ; `partial` = photo créée
// mais un job secondaire (ex. détection visages) n'a pas été programmé ;
// `failed` = upload ou enregistrement principal échoué (objet orphelin nettoyé).
export type CloudUploadStatus = 'success' | 'partial' | 'failed';

export interface CloudPhotoUploadOutcome {
  localPhotoId?: string;
  cloudPhotoId?: string;
  status: CloudUploadStatus;
  error?: string;
}

interface UploadPhotosToCloudResult {
  uploaded: number; // photos réellement créées (success + partial)
  partial: number;
  failed: number;
  photoIds: string[];
  mappings: CloudPhotoUploadMapping[];
  results: CloudPhotoUploadOutcome[];
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
  contentHashes = [],
  client = supabase as unknown as CloudUploadClient | null,
  createPhotoId = createUuid,
  onProgress,
  faceAnalysisEnabled = false,
}: UploadPhotosToCloudParams): Promise<UploadPhotosToCloudResult> {
  if (!client) {
    throw new Error('Supabase non configuré');
  }

  const photoIds: string[] = [];
  const mappings: CloudPhotoUploadMapping[] = [];
  const results: CloudPhotoUploadOutcome[] = [];
  let partial = 0;
  let failed = 0;

  const errMessage = (e: unknown): string =>
    e instanceof Error
      ? e.message
      : typeof e === 'string'
        ? e
        : 'Échec inconnu';
  const reportProgress = (index: number) =>
    onProgress?.(Math.round(((index + 1) / files.length) * 100));

  for (const [index, file] of files.entries()) {
    const localPhotoId = localPhotoIds[index];
    const photoId = createPhotoId();
    const storagePath = buildProjectPhotoStoragePath({
      organizationId: activeProject.organizationId,
      projectId: activeProject.id,
      photoId,
      filename: file.name,
    });

    // 1) Upload Storage. P1-9 : un échec n'interrompt plus tout le lot — la photo
    // est marquée `failed` et on passe à la suivante.
    const { error: uploadError } = await client.storage
      .from(PROJECT_PHOTOS_BUCKET)
      .upload(storagePath, file, { cacheControl: '3600', upsert: false });

    if (uploadError) {
      failed++;
      results.push({
        localPhotoId,
        status: 'failed',
        error: errMessage(uploadError),
      });
      reportProgress(index);
      continue;
    }

    // 2) Enregistrement principal (RPC register_cloud_photo, SECURITY DEFINER).
    // Sur les nouvelles instances ES256/JWKS, PostgREST n'effectue pas la bascule
    // de rôle anon→authenticated ; la RPC insère la photo + ses jobs côté serveur
    // avec vérification auth.uid() + is_project_member.
    const registerArgs: Record<string, unknown> = {
      p_project_id: activeProject.id,
      p_photo_id: photoId,
      p_original_filename: file.name,
      p_storage_path: storagePath,
      p_file_size: file.size,
      p_mime_type: file.type || null,
      p_semantic_delay_ms: SEMANTIC_EMBEDDING_DELAY_MS,
    };
    // P1-9 (serveur) : clé d'idempotence. Envoyée uniquement si un hash de contenu
    // est fourni (donc migration idempotente déployée). Sinon argument omis →
    // la RPC legacy (7 args) reste appelée à l'identique.
    const contentHash = contentHashes[index];
    if (contentHash) {
      registerArgs.p_content_hash = contentHash;
    }
    const { error: photoError } = await (client.rpc(
      'register_cloud_photo',
      registerArgs
    ) as Promise<{ error: unknown }>);

    if (photoError) {
      // P1-D : compensation. L'upload a réussi mais l'enregistrement a échoué →
      // on supprime l'objet orphelin (best-effort) puis on marque la photo échouée.
      try {
        await client.storage.from(PROJECT_PHOTOS_BUCKET).remove([storagePath]);
      } catch {
        // nettoyage best-effort : ne pas masquer l'erreur d'origine
      }
      failed++;
      results.push({
        localPhotoId,
        status: 'failed',
        error: errMessage(photoError),
      });
      reportProgress(index);
      continue;
    }

    // La photo est créée : on l'enregistre (id + mapping) AVANT les jobs
    // secondaires, pour ne pas la « perdre » si l'un d'eux échoue.
    photoIds.push(photoId);
    if (localPhotoId) {
      mappings.push({ localPhotoId, cloudPhotoId: photoId });
    }

    // 3) Job secondaire opt-in (détection visages). P1-9 : NON bloquant — son
    // échec ne doit pas faire échouer une photo déjà enregistrée → statut `partial`.
    let status: CloudUploadStatus = 'success';
    let outcomeError: string | undefined;
    if (faceAnalysisEnabled) {
      const { error: faceError } = await (client.rpc(
        'enqueue_face_detection_job',
        {
          p_project_id: activeProject.id,
          p_photo_id: photoId,
          p_storage_path: storagePath,
          p_delay_ms: FACE_DETECTION_DELAY_MS,
        }
      ) as Promise<{ error: unknown }>);
      if (faceError) {
        status = 'partial';
        partial++;
        outcomeError = `Détection visages non programmée: ${errMessage(faceError)}`;
      }
    }

    results.push({
      localPhotoId,
      cloudPhotoId: photoId,
      status,
      error: outcomeError,
    });
    reportProgress(index);
  }

  return {
    uploaded: photoIds.length,
    partial,
    failed,
    photoIds,
    mappings,
    results,
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
