import { supabase } from './supabase';
import type { Photo, PhotoCollection } from '../types';

// ── Types DB ──────────────────────────────────────────────────────────────────

export interface DbPhotoMetadata {
  id?: string;
  user_id: string;
  file_hash: string;
  file_name: string;
  file_size: number | null;
  rating: number;
  is_pick: boolean;
  is_rejected: boolean;
  color_label: string | null;
  user_tags: string[];
  notes: string | null;
  analysis: Record<string, unknown> | null;
  updated_at?: string;
}

export interface DbShareLink {
  id: string;
  user_id: string;
  token: string;
  name: string | null;
  photo_file_hashes: string[];
  created_at: string;
  expires_at: string | null;
}

export interface DbSessionStats {
  session_date: string;
  photos_imported: number;
  photos_rated: number;
  picks_count: number;
  rejects_count: number;
  exports_count: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Calcule le SHA-256 d'un fichier (hex string) */
export async function computeFileHash(file: File): Promise<string> {
  try {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // Fallback si le fichier n'est plus accessible (e.g. rechargement de page)
    return `${file.name}-${file.size}-${file.lastModified}`;
  }
}

// ── Photo metadata sync ───────────────────────────────────────────────────────

/**
 * Upsert les métadonnées d'une photo dans Supabase.
 * Nécessite que photo.fileHash soit défini.
 */
export async function syncPhotoMetadata(
  userId: string,
  photo: Photo,
  userTags?: string[],
  notes?: string,
): Promise<void> {
  if (!supabase || !photo.fileHash) return;

  const row: DbPhotoMetadata = {
    user_id: userId,
    file_hash: photo.fileHash,
    file_name: photo.file.name,
    file_size: photo.file.size,
    rating: photo.analysis?.rating ?? 0,
    is_pick: photo.analysis?.isPick ?? false,
    is_rejected: photo.analysis?.isRejected ?? false,
    color_label: photo.analysis?.colorLabel ?? null,
    user_tags: userTags ?? [],
    notes: notes ?? null,
    analysis: photo.analysis ? (photo.analysis as unknown as Record<string, unknown>) : null,
  };

  await supabase
    .from('photo_metadata')
    .upsert(row, { onConflict: 'user_id,file_hash', ignoreDuplicates: false });
}

/**
 * Charge toutes les métadonnées cloud pour un utilisateur.
 */
export async function loadCloudMetadata(
  userId: string,
): Promise<DbPhotoMetadata[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('photo_metadata')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    console.warn('[sync] loadCloudMetadata error:', error.message);
    return [];
  }
  return (data as DbPhotoMetadata[]) ?? [];
}

// ── Share links ───────────────────────────────────────────────────────────────

/**
 * Crée un lien de partage pour une liste de photos (identifiées par fileHash).
 */
export async function createShareLink(
  userId: string,
  name: string,
  photoFileHashes: string[],
): Promise<DbShareLink | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('share_links')
    .insert({ user_id: userId, name, photo_file_hashes: photoFileHashes })
    .select()
    .single();

  if (error) {
    console.warn('[sync] createShareLink error:', error.message);
    return null;
  }
  return data as DbShareLink;
}

/**
 * Récupère tous les liens de partage d'un utilisateur.
 */
export async function getUserShareLinks(userId: string): Promise<DbShareLink[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('share_links')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return [];
  return (data as DbShareLink[]) ?? [];
}

/**
 * Charge un lien de partage par token (public, sans auth).
 */
export async function getShareLinkByToken(token: string): Promise<DbShareLink | null> {
  if (!supabase) return null;

  // Token-scoped RPC: the share_links table is no longer publicly readable, so a
  // recipient resolves exactly one (non-expired) link via this security-definer function.
  const { data, error } = await supabase.rpc('get_shared_link', { target_token: token });

  if (error) return null;
  const link = Array.isArray(data) ? data[0] : data;
  return (link as DbShareLink | undefined) ?? null;
}

/**
 * Charge les métadonnées photos pour un share link (public).
 */
export async function getSharedPhotos(
  shareLink: DbShareLink,
): Promise<DbPhotoMetadata[]> {
  if (!supabase || !shareLink.photo_file_hashes.length) return [];

  const { data, error } = await supabase
    .from('photo_metadata')
    .select('*')
    .eq('user_id', shareLink.user_id)
    .in('file_hash', shareLink.photo_file_hashes);

  if (error) return [];
  return (data as DbPhotoMetadata[]) ?? [];
}

/**
 * Supprime un lien de partage.
 */
export async function deleteShareLink(linkId: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('share_links').delete().eq('id', linkId);
}

// ── Session stats ─────────────────────────────────────────────────────────────

/**
 * Incrémente les stats du jour (upsert par user_id + session_date).
 */
export async function trackStats(
  userId: string,
  delta: Partial<Omit<DbSessionStats, 'session_date'>>,
): Promise<void> {
  if (!supabase) return;

  const today = new Date().toISOString().slice(0, 10);

  // Récupérer les stats existantes du jour
  const { data: existing } = await supabase
    .from('session_stats')
    .select('*')
    .eq('user_id', userId)
    .eq('session_date', today)
    .single();

  const current = existing as DbSessionStats | null;

  const updated = {
    user_id: userId,
    session_date: today,
    photos_imported: (current?.photos_imported ?? 0) + (delta.photos_imported ?? 0),
    photos_rated: (current?.photos_rated ?? 0) + (delta.photos_rated ?? 0),
    picks_count: (current?.picks_count ?? 0) + (delta.picks_count ?? 0),
    rejects_count: (current?.rejects_count ?? 0) + (delta.rejects_count ?? 0),
    exports_count: (current?.exports_count ?? 0) + (delta.exports_count ?? 0),
  };

  await supabase
    .from('session_stats')
    .upsert(updated, { onConflict: 'user_id,session_date' });
}

/**
 * Charge les stats des N derniers jours.
 */
export async function loadSessionStats(
  userId: string,
  days = 30,
): Promise<DbSessionStats[]> {
  if (!supabase) return [];

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceISO = since.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('session_stats')
    .select('*')
    .eq('user_id', userId)
    .gte('session_date', sinceISO)
    .order('session_date', { ascending: true });

  if (error) return [];
  return (data as DbSessionStats[]) ?? [];
}

// ── Collections cloud ─────────────────────────────────────────────────────────

export async function syncCollections(
  userId: string,
  collections: Record<string, PhotoCollection>,
  collectionOrder: string[],
): Promise<void> {
  if (!supabase) return;

  const rows = collectionOrder.map((id, index) => {
    const col = collections[id];
    if (!col) return null;
    return {
      user_id: userId,
      name: col.name,
      description: col.description ?? null,
      photo_file_hashes: [] as string[], // Les hashes sont résolus via photo_metadata
      display_order: index,
    };
  }).filter(Boolean);

  if (rows.length === 0) return;

  // Upsert simple — on ne gère pas le renommage cross-device dans cette version
  await supabase
    .from('cloud_collections')
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: false });
}
