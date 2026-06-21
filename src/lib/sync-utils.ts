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

export type ShareApprovalStatus = 'approved' | 'rejected' | 'favorite';

export interface DbShareApproval {
  file_hash: string;
  status: ShareApprovalStatus;
  client_note: string | null;
  updated_at: string;
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
  notes?: string
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
    analysis: photo.analysis
      ? (photo.analysis as unknown as Record<string, unknown>)
      : null,
  };

  await supabase
    .from('photo_metadata')
    .upsert(row, { onConflict: 'user_id,file_hash', ignoreDuplicates: false });
}

/**
 * Synchronise en lot les métadonnées d'un ensemble de photos avant un partage.
 * Garantit que les lignes photo_metadata existent côté cloud, sinon la galerie
 * publique serait vide même si le lien est créé (A-04).
 *
 * Retourne le nombre de photos réellement synchronisées (avec un fileHash valide).
 */
export async function syncPhotosForShare(
  userId: string,
  photos: Photo[],
  userTags: Record<string, string[]>,
  photoNotes: Record<string, string>
): Promise<{ synced: number; skipped: number; error: string | null }> {
  if (!supabase)
    return {
      synced: 0,
      skipped: photos.length,
      error: 'Supabase non configuré',
    };

  const rows: DbPhotoMetadata[] = [];
  let skipped = 0;
  for (const photo of photos) {
    if (!photo.fileHash) {
      skipped += 1;
      continue;
    }
    rows.push({
      user_id: userId,
      file_hash: photo.fileHash,
      file_name: photo.file.name,
      file_size: photo.file.size,
      rating: photo.analysis?.rating ?? 0,
      is_pick: photo.analysis?.isPick ?? false,
      is_rejected: photo.analysis?.isRejected ?? false,
      color_label: photo.analysis?.colorLabel ?? null,
      user_tags: userTags[photo.id] ?? [],
      notes: photoNotes[photo.id] ?? null,
      analysis: photo.analysis
        ? (photo.analysis as unknown as Record<string, unknown>)
        : null,
    });
  }

  if (rows.length === 0) {
    return { synced: 0, skipped, error: null };
  }

  const { error } = await supabase
    .from('photo_metadata')
    .upsert(rows, { onConflict: 'user_id,file_hash', ignoreDuplicates: false });

  if (error) {
    return { synced: 0, skipped, error: error.message };
  }
  return { synced: rows.length, skipped, error: null };
}

/**
 * Charge toutes les métadonnées cloud pour un utilisateur.
 */
export async function loadCloudMetadata(
  userId: string
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

// ── Shared photo storage (A-02) ─────────────────────────────────────────────────

const SHARED_BUCKET = 'shared-photos';

/** Chemin objet déterministe d'une image partagée. */
function sharedPhotoPath(userId: string, fileHash: string): string {
  return `${userId}/${fileHash}`;
}

/**
 * P1-1 (confidentialité) : produit un dérivé JPEG redimensionné pour le partage.
 * Le ré-encodage via <canvas> supprime EXIF/GPS (les originaux ne doivent jamais
 * fuiter de métadonnées de localisation dans une galerie partagée). Robuste :
 * en cas d'indisponibilité du canvas/décodage, on retombe sur le fichier
 * d'origine plutôt que d'échouer l'upload.
 */
export async function buildSharePreview(
  file: File,
  maxDim = 2048,
  quality = 0.85
): Promise<Blob> {
  try {
    // Environnements sans décodage image (Node/jsdom) : repli sur l'original.
    if (
      typeof document === 'undefined' ||
      typeof createImageBitmap === 'undefined'
    ) {
      return file;
    }
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(
        1,
        maxDim / Math.max(bitmap.width, bitmap.height || 1)
      );
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
      );
      return blob ?? file;
    } finally {
      bitmap.close?.();
    }
  } catch {
    return file;
  }
}

/**
 * P1-C : le bucket `shared-photos` est désormais PRIVÉ (migration
 * `20260617120000_treephoto_private_shared_bucket`). On n'émet plus d'URL
 * publique durable (devinable, non révocable, sans expiration) côté client.
 *
 * Le partage anonyme par image est donc désactivé tant qu'une edge function
 * n'expose pas, après validation serveur du token de partage, une URL signée
 * courte. La galerie affiche un placeholder (cf. `SharedThumb`) plutôt qu'une
 * URL publique morte. `_userId`/`_fileHash` sont conservés pour compat d'appel.
 */
export function getSharedPhotoUrl(
  _userId: string,
  _fileHash: string
): string | null {
  return null;
}

/**
 * P1-1 : récupère les URLs signées des photos d'un partage pour un visiteur
 * ANONYME, via l'Edge Function `shared-gallery` (token validé serveur, URLs
 * signées courtes du bucket privé). Retourne une map { fileHash -> url }.
 * Robuste : map vide en cas d'erreur (la galerie retombe alors sur le placeholder).
 */
export async function fetchSharedGalleryUrls(
  token: string
): Promise<Record<string, string>> {
  if (!supabase) return {};
  try {
    const { data, error } = await supabase.functions.invoke('shared-gallery', {
      body: { token },
    });
    const photos = (data as { photos?: { hash: string; url: string | null }[] })
      ?.photos;
    if (error || !Array.isArray(photos)) return {};
    const map: Record<string, string> = {};
    for (const p of photos) {
      if (p?.hash && p.url) map[p.hash] = p.url;
    }
    return map;
  } catch {
    return {};
  }
}

/**
 * Génère une URL signée courte pour un objet partagé. Ne fonctionne que pour le
 * PROPRIÉTAIRE authentifié (policy `shared_photos_owner_select`) — utile pour sa
 * propre prévisualisation. Retourne null pour un visiteur anonyme ou en cas
 * d'erreur. (Le partage anonyme nécessitera une edge function dédiée.)
 */
export async function getSignedSharedPhotoUrl(
  userId: string,
  fileHash: string,
  expiresInSeconds = 300
): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage
    .from(SHARED_BUCKET)
    .createSignedUrl(sharedPhotoPath(userId, fileHash), expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/**
 * Upload (idempotent, upsert) les images des photos partagées vers le bucket public,
 * sous le préfixe du propriétaire. À appeler avant createShareLink pour que la galerie
 * publique affiche les vraies images (A-02).
 */
export async function uploadSharedPhotos(
  userId: string,
  photos: Photo[]
): Promise<{ uploaded: number; failed: number; failedNames: string[] }> {
  if (!supabase) return { uploaded: 0, failed: 0, failedNames: [] };

  let uploaded = 0;
  const failedNames: string[] = [];

  for (const photo of photos) {
    if (!photo.fileHash) {
      failedNames.push(photo.file.name);
      continue;
    }
    try {
      // P1-1 : on partage un dérivé JPEG redimensionné SANS EXIF/GPS,
      // jamais l'original (évite toute fuite de métadonnées de localisation).
      const derivative = await buildSharePreview(photo.file);
      const { error } = await supabase.storage
        .from(SHARED_BUCKET)
        .upload(sharedPhotoPath(userId, photo.fileHash), derivative, {
          upsert: true,
          contentType: 'image/jpeg',
        });
      if (error) {
        failedNames.push(photo.file.name);
      } else {
        uploaded += 1;
      }
    } catch {
      failedNames.push(photo.file.name);
    }
  }

  return { uploaded, failed: failedNames.length, failedNames };
}

// ── Share links ───────────────────────────────────────────────────────────────

/**
 * Crée un lien de partage pour une liste de photos (identifiées par fileHash).
 */
export async function createShareLink(
  userId: string,
  name: string,
  photoFileHashes: string[]
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
export async function getUserShareLinks(
  userId: string
): Promise<DbShareLink[]> {
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
export async function getShareLinkByToken(
  token: string
): Promise<DbShareLink | null> {
  if (!supabase) return null;

  // Token-scoped RPC: the share_links table is no longer publicly readable, so a
  // recipient resolves exactly one (non-expired) link via this security-definer function.
  const { data, error } = await supabase.rpc('get_shared_link', {
    target_token: token,
  });

  if (error) return null;
  const link = Array.isArray(data) ? data[0] : data;
  return (link as DbShareLink | undefined) ?? null;
}

/**
 * Charge les métadonnées photos pour un share link (public, sans auth).
 *
 * Utilise la RPC security-definer `get_shared_photos`, car `photo_metadata` est en
 * RLS propriétaire : un client anonyme ne peut pas faire de select direct. La RPC
 * ne renvoie que les photos du lien (non expiré) et n'expose pas les notes privées.
 *
 * Repli : si la RPC n'est pas encore déployée (migration non appliquée), on tente
 * l'ancien select direct — utile pour le propriétaire qui prévisualise son propre
 * partage en étant connecté.
 */
export async function getSharedPhotos(
  shareLink: DbShareLink
): Promise<DbPhotoMetadata[]> {
  if (!supabase || !shareLink.photo_file_hashes.length) return [];

  const { data, error } = await supabase.rpc('get_shared_photos', {
    target_token: shareLink.token,
  });

  if (!error && Array.isArray(data)) {
    return (data as Array<Omit<DbPhotoMetadata, 'user_id' | 'notes'>>).map(
      (row) => ({
        ...row,
        user_id: shareLink.user_id,
        notes: null,
      })
    );
  }

  // Repli (RPC absente) : select direct — ne fonctionne que pour le propriétaire connecté.
  const fallback = await supabase
    .from('photo_metadata')
    .select('*')
    .eq('user_id', shareLink.user_id)
    .in('file_hash', shareLink.photo_file_hashes);

  if (fallback.error) {
    console.warn(
      '[sync] getSharedPhotos error:',
      error?.message ?? fallback.error.message
    );
    return [];
  }
  return (fallback.data as DbPhotoMetadata[]) ?? [];
}

/**
 * Enregistre/MAJ la validation client d'une photo, scopée par token (public).
 * Retourne true en cas de succès.
 */
export async function setShareApproval(
  token: string,
  fileHash: string,
  status: ShareApprovalStatus,
  clientNote?: string | null
): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.rpc('set_share_approval', {
    target_token: token,
    target_file_hash: fileHash,
    target_status: status,
    target_note: clientNote ?? null,
  });
  if (error) {
    console.warn('[sync] setShareApproval error:', error.message);
    return false;
  }
  return true;
}

/**
 * Charge les validations déjà enregistrées pour un lien (public, côté client).
 */
export async function getShareApprovals(
  token: string
): Promise<DbShareApproval[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('get_share_approvals', {
    target_token: token,
  });
  if (error || !Array.isArray(data)) return [];
  return data as DbShareApproval[];
}

/**
 * Charge les validations d'un lien côté propriétaire (photographe, authentifié).
 */
export async function getShareApprovalsForOwner(
  linkId: string
): Promise<DbShareApproval[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('get_share_approvals_for_owner', {
    target_link_id: linkId,
  });
  if (error || !Array.isArray(data)) return [];
  return data as DbShareApproval[];
}

/**
 * Supprime un lien de partage ET révoque réellement l'accès aux images (P1-2).
 *
 * Le bucket `shared-photos` est public et les chemins sont stables
 * (`<user_id>/<file_hash>`) : supprimer la seule ligne `share_links` laissait les
 * objets accessibles à quiconque avait l'URL. On purge donc les objets Storage,
 * avec comptage de références : un objet n'est supprimé que si plus AUCUN autre
 * lien non expiré du même utilisateur ne le référence (évite de casser un partage
 * encore actif qui pointe sur la même photo).
 *
 * NB : l'expiration passive d'un lien ne déclenche pas cette purge (pas de trigger
 * Storage côté SQL) ; un job planifié devra balayer les liens expirés, ou migrer
 * vers un bucket privé + URLs signées via Edge Function.
 */
export async function deleteShareLink(linkId: string): Promise<void> {
  if (!supabase) return;

  const { data: link } = await supabase
    .from('share_links')
    .select('user_id, photo_file_hashes')
    .eq('id', linkId)
    .maybeSingle();

  await supabase.from('share_links').delete().eq('id', linkId);

  const userId = (link as { user_id?: string } | null)?.user_id;
  const hashes =
    (link as { photo_file_hashes?: string[] } | null)?.photo_file_hashes ?? [];
  if (!userId || hashes.length === 0) return;

  // Hashes encore référencés par un autre lien non expiré du même utilisateur.
  const { data: remaining } = await supabase
    .from('share_links')
    .select('photo_file_hashes, expires_at')
    .eq('user_id', userId);

  const now = Date.now();
  const stillReferenced = new Set<string>();
  for (const row of (remaining as Array<{
    photo_file_hashes?: string[];
    expires_at?: string | null;
  }>) ?? []) {
    const notExpired =
      !row.expires_at || new Date(row.expires_at).getTime() > now;
    if (notExpired)
      (row.photo_file_hashes ?? []).forEach((h) => stillReferenced.add(h));
  }

  const toPurge = hashes.filter((h) => !stillReferenced.has(h));
  if (toPurge.length > 0) {
    await supabase.storage
      .from(SHARED_BUCKET)
      .remove(toPurge.map((h) => sharedPhotoPath(userId, h)));
  }
}

// ── Session stats ─────────────────────────────────────────────────────────────

/**
 * Incrémente les stats du jour (upsert par user_id + session_date).
 */
export async function trackStats(
  userId: string,
  delta: Partial<Omit<DbSessionStats, 'session_date'>>
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
    photos_imported:
      (current?.photos_imported ?? 0) + (delta.photos_imported ?? 0),
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
  days = 30
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
  collectionOrder: string[]
): Promise<void> {
  if (!supabase) return;

  const rows = collectionOrder
    .map((id, index) => {
      const col = collections[id];
      if (!col) return null;
      return {
        user_id: userId,
        name: col.name,
        description: col.description ?? null,
        photo_file_hashes: [] as string[], // Les hashes sont résolus via photo_metadata
        display_order: index,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) return;

  // A-06 : upsert sur la clé réelle (user_id, name) — l'ancien onConflict:'id' sans id
  // ne pouvait jamais matcher (toujours des inserts / échecs silencieux). Nécessite la
  // contrainte unique(user_id, name) ajoutée par la migration cloud_collections_unique.
  const { error } = await supabase
    .from('cloud_collections')
    .upsert(rows, { onConflict: 'user_id,name', ignoreDuplicates: false });
  if (error) {
    console.warn('[sync] syncCollections error:', error.message);
  }
}
