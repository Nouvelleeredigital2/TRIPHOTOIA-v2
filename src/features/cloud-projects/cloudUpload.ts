import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import type { ActiveCloudProject } from '../../store/cloudProjectStore';

export const PROJECT_PHOTOS_BUCKET = 'project-photos';

type CloudUploadClient = Pick<SupabaseClient, 'from' | 'storage'>;

interface BuildProjectPhotoStoragePathParams {
  organizationId: string;
  projectId: string;
  photoId: string;
  filename: string;
}

interface UploadPhotosToCloudParams {
  activeProject: ActiveCloudProject;
  files: File[];
  client?: CloudUploadClient | null;
  createPhotoId?: () => string;
  onProgress?: (progress: number) => void;
}

interface UploadPhotosToCloudResult {
  uploaded: number;
  photoIds: string[];
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
  client = supabase,
  createPhotoId = createUuid,
  onProgress,
}: UploadPhotosToCloudParams): Promise<UploadPhotosToCloudResult> {
  if (!client) {
    throw new Error('Supabase non configuré');
  }

  const photoIds: string[] = [];

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

    const { error: photoError } = await client
      .from('photos')
      .insert({
        id: photoId,
        project_id: activeProject.id,
        original_filename: file.name,
        storage_path: storagePath,
        analysis_status: 'pending',
      })
      .select('id')
      .single();

    if (photoError) throw photoError;

    const { error: jobsError } = await client
      .from('jobs')
      .insert([
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
      ]);

    if (jobsError) throw jobsError;

    photoIds.push(photoId);
    onProgress?.(Math.round(((index + 1) / files.length) * 100));
  }

  return {
    uploaded: photoIds.length,
    photoIds,
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
