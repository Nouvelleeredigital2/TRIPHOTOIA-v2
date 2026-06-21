import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

export type CloudPickStatus = 'unreviewed' | 'pick' | 'reject' | 'review';
export type CloudAnalysisStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';

export interface CloudProjectRow {
  id: string;
  organization_id: string;
  name: string;
  project_type: string;
  status: string;
  face_analysis_enabled?: boolean;
  created_at: string;
  updated_at: string;
}

export interface CloudPhotoRow {
  id?: string;
  project_id: string;
  original_filename?: string;
  storage_path?: string;
  thumbnail_path?: string | null;
  pick_status: CloudPickStatus;
  analysis_status: CloudAnalysisStatus;
  is_deleted: boolean;
  created_at?: string;
}

export interface CloudProjectPhoto {
  id: string;
  projectId: string;
  originalFilename: string;
  storagePath: string;
  thumbnailPath: string | null;
  pickStatus: CloudPickStatus;
  analysisStatus: CloudAnalysisStatus;
  createdAt: string;
}

export interface CloudOrganizationRow {
  id: string;
  name: string;
  owner_id: string;
}

export interface CloudProjectStats {
  totalPhotos: number;
  analyzed: number;
  review: number;
  picks: number;
  rejected: number;
}

export interface CloudProjectSummary extends CloudProjectRow {
  stats: CloudProjectStats;
}

export function buildProjectStats(
  projectId: string,
  photos: CloudPhotoRow[]
): CloudProjectStats {
  const activePhotos = photos.filter(
    (photo) => photo.project_id === projectId && !photo.is_deleted
  );

  return {
    totalPhotos: activePhotos.length,
    analyzed: activePhotos.filter(
      (photo) => photo.analysis_status === 'completed'
    ).length,
    review: activePhotos.filter((photo) => photo.pick_status === 'review')
      .length,
    picks: activePhotos.filter((photo) => photo.pick_status === 'pick').length,
    rejected: activePhotos.filter((photo) => photo.pick_status === 'reject')
      .length,
  };
}

export function sortProjectsByRecentActivity(
  projects: CloudProjectRow[]
): CloudProjectRow[] {
  return [...projects].sort((a, b) => {
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
}

export function mapCloudPhotoRows(rows: CloudPhotoRow[]): CloudProjectPhoto[] {
  return rows
    .filter((row) => !row.is_deleted)
    .map((row) => ({
      id: row.id ?? '',
      projectId: row.project_id,
      originalFilename: row.original_filename ?? '',
      storagePath: row.storage_path ?? '',
      thumbnailPath: row.thumbnail_path ?? null,
      pickStatus: row.pick_status,
      analysisStatus: row.analysis_status,
      createdAt: row.created_at ?? '',
    }));
}

function requireSupabase(
  client: SupabaseClient | null = supabase
): SupabaseClient {
  if (!client) {
    throw new Error('Supabase non configuré');
  }
  return client;
}

export async function fetchCloudProjects(
  userId: string,
  client: SupabaseClient | null = supabase
): Promise<CloudProjectSummary[]> {
  const db = requireSupabase(client);
  const { data: memberships, error: membershipError } = await db
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId);

  if (membershipError) throw membershipError;

  const organizationIds = [
    ...new Set((memberships ?? []).map((row) => row.organization_id as string)),
  ];
  if (organizationIds.length === 0) return [];

  const { data: projects, error: projectError } = await db
    .from('projects')
    .select(
      'id, organization_id, name, project_type, status, face_analysis_enabled, created_at, updated_at'
    )
    .in('organization_id', organizationIds)
    .eq('status', 'active')
    .order('updated_at', { ascending: false });

  if (projectError) throw projectError;

  const typedProjects = sortProjectsByRecentActivity(
    (projects ?? []) as CloudProjectRow[]
  );
  if (typedProjects.length === 0) return [];

  const { data: photos, error: photoError } = await db
    .from('photos')
    .select('project_id, pick_status, analysis_status, is_deleted')
    .in(
      'project_id',
      typedProjects.map((project) => project.id)
    );

  if (photoError) throw photoError;

  const typedPhotos = (photos ?? []) as CloudPhotoRow[];
  return typedProjects.map((project) => ({
    ...project,
    stats: buildProjectStats(project.id, typedPhotos),
  }));
}

export async function createCloudProject(
  userId: string,
  projectName: string,
  client: SupabaseClient | null = supabase
): Promise<CloudProjectSummary> {
  const db = requireSupabase(client);
  const trimmedName = projectName.trim();
  if (!trimmedName) {
    throw new Error('Le nom du projet est obligatoire');
  }

  // Sur les nouvelles instances Supabase (ES256/JWKS), PostgREST ne bascule pas
  // vers le rôle 'authenticated', ce qui empêche les INSERTs directs via RLS.
  // On passe par des RPCs SECURITY DEFINER qui font les inserts côté serveur
  // après avoir vérifié l'identité via auth.uid().
  const { data, error } = await db.rpc('create_user_project', {
    p_name: trimmedName,
    p_project_type: 'wedding',
  });

  if (error) throw error;

  const project = Array.isArray(data) ? data[0] : data;
  const projectRow = project as CloudProjectRow;

  return {
    ...projectRow,
    stats: buildProjectStats(projectRow.id, []),
  };
}

/** A-39 : renommer un projet cloud (RPC SECURITY DEFINER, unicité du nom côté serveur). */
export async function renameCloudProject(
  projectId: string,
  name: string,
  client: SupabaseClient | null = supabase
): Promise<CloudProjectRow> {
  const db = requireSupabase(client);
  const { data, error } = await db.rpc('rename_user_project', {
    p_project_id: projectId,
    p_name: name.trim(),
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as CloudProjectRow;
}

/** A-39 : archiver un projet cloud (soft-delete — disparaît de la liste active). */
export async function archiveCloudProject(
  projectId: string,
  client: SupabaseClient | null = supabase
): Promise<void> {
  const db = requireSupabase(client);
  const { error } = await db.rpc('archive_user_project', {
    p_project_id: projectId,
  });
  if (error) throw error;
}

/** A-42 : suppression logique d'une photo cloud (is_deleted = true). */
export async function setCloudPhotoDeleted(
  photoId: string,
  deleted: boolean,
  client: SupabaseClient | null = supabase
): Promise<void> {
  const db = requireSupabase(client);
  const { error } = await db.rpc('set_cloud_photo_deleted', {
    p_photo_id: photoId,
    p_deleted: deleted,
  });
  if (error) throw error;
}

/**
 * A-40 : message d'erreur lisible pour les exceptions des RPC projet.
 */
export function describeCloudProjectError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('duplicate_name')) return 'Un projet porte déjà ce nom.';
  if (message.includes('empty_name'))
    return 'Le nom du projet est obligatoire.';
  if (message.includes('not_authorized'))
    return "Vous n'avez pas accès à ce projet.";
  if (message.includes('project_not_found')) return 'Projet introuvable.';
  if (message.includes('photo_not_found')) return 'Photo introuvable.';
  return message;
}

export async function fetchCloudProjectPhotos(
  projectId: string,
  client: SupabaseClient | null = supabase
): Promise<CloudProjectPhoto[]> {
  const db = requireSupabase(client);
  const { data, error } = await db
    .from('photos')
    .select(
      'id, project_id, original_filename, storage_path, thumbnail_path, pick_status, analysis_status, is_deleted, created_at'
    )
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return mapCloudPhotoRows((data ?? []) as CloudPhotoRow[]);
}

// ensureDefaultOrganization est remplacé par la RPC create_user_project /
// ensure_user_organization côté serveur (SECURITY DEFINER) — nécessaire car
// les nouvelles instances Supabase ES256 ne basculent pas vers le rôle
// 'authenticated' dans PostgREST, empêchant les INSERTs directs via RLS.
