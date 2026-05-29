import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

export type CloudPickStatus = 'unreviewed' | 'pick' | 'reject' | 'review';
export type CloudAnalysisStatus = 'pending' | 'processing' | 'completed' | 'failed';

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

export function buildProjectStats(projectId: string, photos: CloudPhotoRow[]): CloudProjectStats {
  const activePhotos = photos.filter((photo) => photo.project_id === projectId && !photo.is_deleted);

  return {
    totalPhotos: activePhotos.length,
    analyzed: activePhotos.filter((photo) => photo.analysis_status === 'completed').length,
    review: activePhotos.filter((photo) => photo.pick_status === 'review').length,
    picks: activePhotos.filter((photo) => photo.pick_status === 'pick').length,
    rejected: activePhotos.filter((photo) => photo.pick_status === 'reject').length,
  };
}

export function sortProjectsByRecentActivity(projects: CloudProjectRow[]): CloudProjectRow[] {
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

function requireSupabase(client: SupabaseClient | null = supabase): SupabaseClient {
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

  const organizationIds = [...new Set((memberships ?? []).map((row) => row.organization_id as string))];
  if (organizationIds.length === 0) return [];

  const { data: projects, error: projectError } = await db
    .from('projects')
    .select('id, organization_id, name, project_type, status, face_analysis_enabled, created_at, updated_at')
    .in('organization_id', organizationIds)
    .eq('status', 'active')
    .order('updated_at', { ascending: false });

  if (projectError) throw projectError;

  const typedProjects = sortProjectsByRecentActivity((projects ?? []) as CloudProjectRow[]);
  if (typedProjects.length === 0) return [];

  const { data: photos, error: photoError } = await db
    .from('photos')
    .select('project_id, pick_status, analysis_status, is_deleted')
    .in('project_id', typedProjects.map((project) => project.id));

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

  const organization = await ensureDefaultOrganization(userId, db);
  const { data: project, error } = await db
    .from('projects')
    .insert({
      organization_id: organization.id,
      name: trimmedName,
      project_type: 'wedding',
      created_by: userId,
    })
    .select('id, organization_id, name, project_type, status, face_analysis_enabled, created_at, updated_at')
    .single();

  if (error) throw error;

  return {
    ...(project as CloudProjectRow),
    stats: buildProjectStats((project as CloudProjectRow).id, []),
  };
}

export async function fetchCloudProjectPhotos(
  projectId: string,
  client: SupabaseClient | null = supabase
): Promise<CloudProjectPhoto[]> {
  const db = requireSupabase(client);
  const { data, error } = await db
    .from('photos')
    .select('id, project_id, original_filename, storage_path, thumbnail_path, pick_status, analysis_status, is_deleted, created_at')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return mapCloudPhotoRows((data ?? []) as CloudPhotoRow[]);
}

async function ensureDefaultOrganization(
  userId: string,
  db: SupabaseClient
): Promise<CloudOrganizationRow> {
  const { data: memberships, error: membershipError } = await db
    .from('organization_members')
    .select('organization_id, organizations(id, name, owner_id)')
    .eq('user_id', userId)
    .limit(1);

  if (membershipError) throw membershipError;

  const existingOrganization = memberships?.[0]?.organizations;
  if (existingOrganization) {
    return Array.isArray(existingOrganization)
      ? existingOrganization[0] as CloudOrganizationRow
      : existingOrganization as CloudOrganizationRow;
  }

  const { data: organization, error: organizationError } = await db
    .from('organizations')
    .insert({
      name: 'Espace TreePhoto',
      owner_id: userId,
    })
    .select('id, name, owner_id')
    .single();

  if (organizationError) throw organizationError;

  const typedOrganization = organization as CloudOrganizationRow;
  const { error: memberError } = await db
    .from('organization_members')
    .insert({
      organization_id: typedOrganization.id,
      user_id: userId,
      role: 'owner',
    });

  if (memberError) throw memberError;

  return typedOrganization;
}
