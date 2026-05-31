import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { parseEmbedding } from './cloudSemanticSearch';

export const DEFAULT_FACE_GROUP_THRESHOLD = 0.8;

export interface FaceRecord {
  id: string;
  photoId: string;
  personId: string | null;
  embedding: number[];
}

export interface AnonymousFaceGroup {
  groupId: string;
  faceIds: string[];
  photoIds: string[];
  size: number;
}

function requireSupabase(client: SupabaseClient | null = supabase): SupabaseClient {
  if (!client) {
    throw new Error('Supabase non configuré');
  }
  return client;
}

const cosineSimilarity = (a: number[], b: number[]): number => {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

// Pure greedy single-link clustering of anonymous (unassigned) faces.
// Produces anonymous groups for display; it never names anyone.
export function clusterFacesIntoGroups(
  faces: FaceRecord[],
  threshold = DEFAULT_FACE_GROUP_THRESHOLD,
): AnonymousFaceGroup[] {
  const anonymous = faces.filter((face) => face.personId == null);
  const used = new Set<string>();
  const groups: AnonymousFaceGroup[] = [];

  for (const seed of anonymous) {
    if (used.has(seed.id)) continue;
    used.add(seed.id);
    const members: FaceRecord[] = [seed];

    for (const other of anonymous) {
      if (used.has(other.id)) continue;
      if (cosineSimilarity(seed.embedding, other.embedding) >= threshold) {
        used.add(other.id);
        members.push(other);
      }
    }

    groups.push({
      groupId: `group-${seed.id}`,
      faceIds: members.map((member) => member.id),
      photoIds: [...new Set(members.map((member) => member.photoId))],
      size: members.length,
    });
  }

  return groups.sort((a, b) => b.size - a.size);
}

interface SetFaceAnalysisParams {
  projectId: string;
  enabled: boolean;
  client?: SupabaseClient | null;
}

// Strict opt-in toggle for a project.
export async function setProjectFaceAnalysis({
  projectId,
  enabled,
  client = supabase,
}: SetFaceAnalysisParams): Promise<void> {
  const db = requireSupabase(client);
  const { error } = await db
    .from('projects')
    .update({ face_analysis_enabled: enabled })
    .eq('id', projectId);
  if (error) throw error;
}

interface FetchProjectFacesParams {
  projectId: string;
  client?: SupabaseClient | null;
}

export async function fetchProjectFaces({
  projectId,
  client = supabase,
}: FetchProjectFacesParams): Promise<FaceRecord[]> {
  const db = requireSupabase(client);
  const { data, error } = await db
    .from('photo_faces')
    .select('id, photo_id, person_id, embedding, photos!inner(project_id)')
    .eq('photos.project_id', projectId);
  if (error) throw error;

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    photoId: String(row.photo_id),
    personId: (row.person_id as string | null) ?? null,
    embedding: parseEmbedding(row.embedding) ?? [],
  }));
}

interface NameGroupParams {
  projectId: string;
  faceIds: string[];
  displayName: string;
  client?: SupabaseClient | null;
}

// Manual naming only: a confirmed person is created with the name the user typed,
// then the selected faces are assigned to it. There is no automatic naming path.
export async function nameAnonymousGroup({
  projectId,
  faceIds,
  displayName,
  client = supabase,
}: NameGroupParams): Promise<{ personId: string }> {
  const db = requireSupabase(client);
  const trimmed = displayName.trim();
  if (!trimmed) {
    throw new Error('Le nom de la personne est obligatoire');
  }
  if (faceIds.length === 0) {
    throw new Error('Aucun visage à associer');
  }

  const { data, error } = await db
    .from('people')
    .insert({ project_id: projectId, display_name: trimmed, status: 'confirmed' })
    .select('id')
    .single();
  if (error) throw error;

  const personId = String((data as { id: string }).id);
  const { error: assignError } = await db
    .from('photo_faces')
    .update({ person_id: personId })
    .in('id', faceIds);
  if (assignError) throw assignError;

  return { personId };
}

interface DeletePersonParams {
  personId: string;
  client?: SupabaseClient | null;
}

// Remove all face data tied to a person, then the person record itself.
export async function deletePersonFaces({
  personId,
  client = supabase,
}: DeletePersonParams): Promise<void> {
  const db = requireSupabase(client);
  const { error: facesError } = await db
    .from('photo_faces')
    .delete()
    .eq('person_id', personId);
  if (facesError) throw facesError;

  const { error: personError } = await db
    .from('people')
    .delete()
    .eq('id', personId);
  if (personError) throw personError;
}

interface DeleteAllParams {
  projectId: string;
  client?: SupabaseClient | null;
}

export async function deleteAllProjectFaces({
  projectId,
  client = supabase,
}: DeleteAllParams): Promise<void> {
  const db = requireSupabase(client);
  const { data: photos, error: photosError } = await db
    .from('photos')
    .select('id')
    .eq('project_id', projectId);
  if (photosError) throw photosError;

  const photoIds = ((photos ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (photoIds.length > 0) {
    const { error: facesError } = await db
      .from('photo_faces')
      .delete()
      .in('photo_id', photoIds);
    if (facesError) throw facesError;
  }

  const { error: peopleError } = await db
    .from('people')
    .delete()
    .eq('project_id', projectId);
  if (peopleError) throw peopleError;
}

interface PhotosForPersonParams {
  personId: string;
  client?: SupabaseClient | null;
}

// Filtering by a validated person: only confirmed people return photos.
export async function fetchPhotosForConfirmedPerson({
  personId,
  client = supabase,
}: PhotosForPersonParams): Promise<string[]> {
  const db = requireSupabase(client);
  const { data: person, error: personError } = await db
    .from('people')
    .select('status')
    .eq('id', personId)
    .maybeSingle();
  if (personError) throw personError;

  if (!person || (person as { status: string }).status !== 'confirmed') {
    return [];
  }

  const { data: faces, error } = await db
    .from('photo_faces')
    .select('photo_id')
    .eq('person_id', personId);
  if (error) throw error;

  return [...new Set(((faces ?? []) as Array<{ photo_id: string }>).map((row) => row.photo_id))];
}
