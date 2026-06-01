import { useEffect, useRef, useState } from 'react';
import { usePhotoStore } from '../store/photoStore';
import {
  saveFullCatalogue,
  loadFullCatalogue,
  CatalogueState,
} from '../lib/catalogue-persistence';
import { lshRebuildFromEntries } from '../store/photoStore';

const DEBOUNCE_MS = 2000;

/**
 * Monte une fois au démarrage de l'app.
 * - Restaure le catalogue complet depuis IDB.
 * - Auto-sauvegarde debounce 2s à chaque mutation significative du store.
 * Returns: lastSavedAt (Date | null) — timestamp of the last successful save.
 */
export function useCataloguePersistence(): { lastSavedAt: Date | null } {
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const isRestoredRef = useRef(false);

  const store = usePhotoStore();

  // Restauration initiale
  useEffect(() => {
    if (isRestoredRef.current) return;
    isRestoredRef.current = true;

    loadFullCatalogue().then((saved) => {
      if (!saved || saved.photos.length === 0) return;

      const currentPhotos = usePhotoStore.getState().photos;
      if (currentPhotos.length > 0) return; // L'utilisateur a déjà chargé des photos

      // Restauration transactionnelle unique : photos + collections + ordre + collection
      // active + tags + notes + doublons + rejets (A-47). Évite les divergences et ne
      // pollue pas la pile undo.
      usePhotoStore.getState().restoreCatalogueState(saved);

      // Réalimenter le LSH depuis les photos restaurées
      lshRebuildFromEntries(
        saved.photos
          .filter((p) => p.analysis?.perceptualHash)
          .map((p) => ({ id: p.id, hash: p.analysis!.perceptualHash! })),
      );
    }).catch((err) => {
      console.warn('[useCataloguePersistence] restauration échouée:', err);
    });
  }, []);

  // Auto-sauvegarde debounce sur les mutations du store
  useEffect(() => {
    if (!isRestoredRef.current) return;
    if (store.photos.length === 0) return;

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      const state = usePhotoStore.getState();
      const payload: CatalogueState = {
        photos: state.photos,
        collections: state.collections,
        collectionOrder: state.collectionOrder,
        activeCollectionId: state.activeCollectionId,
        duplicateGroups: state.duplicateGroups,
        userTags: state.userTags,
        photoNotes: state.photoNotes,
      };
      saveFullCatalogue(payload)
        .then(() => {
          setLastSavedAt(new Date());
          // A-52 : notifier les autres onglets qu'une sauvegarde a eu lieu.
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('treephoto:catalogue-saved'));
          }
        })
        .catch((err) => {
          console.warn('[useCataloguePersistence] sauvegarde échouée:', err);
        });
    }, DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [
    store.photos,
    store.duplicateGroups,
    store.userTags,
    store.photoNotes,
    store.collections,
    store.collectionOrder,
    store.activeCollectionId,
  ]);

  return { lastSavedAt };
}
