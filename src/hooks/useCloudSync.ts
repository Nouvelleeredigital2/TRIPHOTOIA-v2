import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { usePhotoStore } from '../store/photoStore';
import { syncPhotoMetadata, loadCloudMetadata, trackStats } from '../lib/sync-utils';
import { isSupabaseConfigured } from '../lib/supabase';

const DEBOUNCE_MS = 2000;

/**
 * Hook qui synchronise automatiquement les métadonnées photos avec Supabase.
 * Inactif si l'utilisateur n'est pas connecté ou si Supabase n'est pas configuré.
 */
export function useCloudSync() {
  const { user, setSyncStatus } = useAuthStore();
  const pendingRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<number | null>(null);

  const flush = useCallback(async () => {
    if (!user || !isSupabaseConfigured) return;
    const ids = Array.from(pendingRef.current);
    if (ids.length === 0) return;

    pendingRef.current.clear();
    setSyncStatus('syncing');

    try {
      const { photos, userTags, photoNotes } = usePhotoStore.getState();
      await Promise.all(
        ids.map((id) => {
          const photo = photos.find((p) => p.id === id);
          if (!photo) return Promise.resolve();
          return syncPhotoMetadata(user.id, photo, userTags[id], photoNotes[id]);
        }),
      );
      setSyncStatus('synced');
    } catch (err) {
      console.warn('[useCloudSync] sync error:', err);
      setSyncStatus('error');
    }
  }, [user, setSyncStatus]);

  const scheduleSync = useCallback(
    (photoId: string) => {
      pendingRef.current.add(photoId);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(flush, DEBOUNCE_MS);
    },
    [flush],
  );

  // Charger les métadonnées cloud lors du login
  useEffect(() => {
    if (!user || !isSupabaseConfigured) return;

    loadCloudMetadata(user.id).then((rows) => {
      if (rows.length === 0) return;
      const { photos } = usePhotoStore.getState();

      // Merger les métadonnées cloud dans les photos locales qui matchent par fileHash
      const cloudByHash = new Map(rows.map((r) => [r.file_hash, r]));
      photos.forEach((photo) => {
        if (!photo.fileHash) return;
        const cloud = cloudByHash.get(photo.fileHash);
        if (!cloud) return;

        // Local wins sur les modifications récentes — on applique cloud seulement si
        // la photo locale n'a pas d'analysis ou si le cloud est plus récent
        const hasLocalMeta =
          (photo.analysis?.rating ?? 0) > 0 ||
          photo.analysis?.isPick ||
          photo.analysis?.isRejected ||
          photo.analysis?.colorLabel;

        if (!hasLocalMeta && cloud.analysis) {
          usePhotoStore.getState().updatePhotoAnalysis(photo.id, {
            rating: cloud.rating,
            isPick: cloud.is_pick,
            isRejected: cloud.is_rejected,
            colorLabel: (cloud.color_label as import('../types').ColorLabel | null) ?? undefined,
          });
        }
      });
    });
  }, [user]);

  // Surveiller les mutations du store (rating, pick, reject, label)
  useEffect(() => {
    if (!user || !isSupabaseConfigured) return;

    const unsub = usePhotoStore.subscribe((state, prev) => {
      if (state.photos === prev.photos) return;

      // Détecter quelles photos ont changé leurs métadonnées
      const changedIds: string[] = [];
      state.photos.forEach((photo, i) => {
        const prevPhoto = prev.photos[i];
        if (!prevPhoto) return;
        if (photo.id !== prevPhoto.id) return;
        const a = photo.analysis;
        const pa = prevPhoto.analysis;
        if (!a || !pa) return;
        if (
          a.rating !== pa.rating ||
          a.isPick !== pa.isPick ||
          a.isRejected !== pa.isRejected ||
          a.colorLabel !== pa.colorLabel
        ) {
          changedIds.push(photo.id);
        }
      });

      changedIds.forEach((id) => scheduleSync(id));
    });

    return unsub;
  }, [user, scheduleSync]);

  // Tracker les imports
  useEffect(() => {
    if (!user || !isSupabaseConfigured) return;

    let prevCount = usePhotoStore.getState().photos.length;

    const unsub = usePhotoStore.subscribe((state) => {
      const newCount = state.photos.length;
      if (newCount > prevCount) {
        const delta = newCount - prevCount;
        prevCount = newCount;
        trackStats(user.id, { photos_imported: delta }).catch(() => {});
      } else {
        prevCount = newCount;
      }
    });

    return unsub;
  }, [user]);
}
