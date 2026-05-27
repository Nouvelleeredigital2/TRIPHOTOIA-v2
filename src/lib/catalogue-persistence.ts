/**
 * L-02 — Persistance IDB complète du catalogue.
 *
 * Sauvegarde : photos (fichier + analyse) + métadonnées (collections, doublons, tags).
 * Au rechargement : le catalogue complet est restauré, blobs URL recréés.
 */

import { Photo, PhotoAnalysis, PhotoCollection, DuplicateGroup } from '../types';

const DB_NAME = 'triphotoia-catalogue';
const DB_VERSION = 1;
const STORE_PHOTOS = 'photos';
const STORE_META = 'meta';
const META_KEY_CATALOGUE = 'catalogue';

// ---------- Types IDB ----------

interface PersistedPhoto {
  id: string;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  data: ArrayBuffer;
  analysis: PhotoAnalysis | null;
}

interface CatalogueMeta {
  collections: Record<string, PhotoCollection>;
  collectionOrder: string[];
  activeCollectionId: string;
  duplicateGroups: SerializedDuplicateGroup[];
  userTags: Record<string, string[]>;
  photoNotes: Record<string, string>;
  savedAt: string;
}

// DuplicateGroup sans les objets Photo complets (juste les IDs)
interface SerializedDuplicateGroup {
  id: string;
  hash: string;
  photoIds: string[];
  bestPhotoId: string;
}

// ---------- IDB helpers ----------

let _db: IDBDatabase | null = null;

async function openDb(): Promise<IDBDatabase> {
  if (_db) return _db;

  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB non disponible'));
      return;
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PHOTOS)) {
        db.createObjectStore(STORE_PHOTOS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };

    req.onsuccess = () => {
      _db = req.result;
      _db.onversionchange = () => { _db?.close(); _db = null; };
      resolve(_db);
    };
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'));
  });
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('IDB transaction aborted'));
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- API publique ----------

export interface CatalogueState {
  photos: Photo[];
  collections: Record<string, PhotoCollection>;
  collectionOrder: string[];
  activeCollectionId: string;
  duplicateGroups: DuplicateGroup[];
  userTags: Record<string, string[]>;
  photoNotes: Record<string, string>;
}

export async function saveFullCatalogue(state: CatalogueState): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction([STORE_PHOTOS, STORE_META], 'readwrite');
    const photoStore = tx.objectStore(STORE_PHOTOS);
    const metaStore = tx.objectStore(STORE_META);

    // Vider les photos existantes
    await idbReq(photoStore.clear());

    // Sauvegarder chaque photo (fichier + analyse)
    for (const photo of state.photos) {
      let data: ArrayBuffer;
      try {
        data = await photo.file.arrayBuffer();
      } catch {
        continue; // Fichier inaccessible, on skip
      }

      const persisted: PersistedPhoto = {
        id: photo.id,
        name: photo.file.name,
        type: photo.file.type,
        size: photo.file.size,
        lastModified: photo.file.lastModified,
        data,
        analysis: photo.analysis,
      };
      await idbReq(photoStore.put(persisted));
    }

    // Sauvegarder les métadonnées
    const meta: { key: string; value: CatalogueMeta } = {
      key: META_KEY_CATALOGUE,
      value: {
        collections: state.collections,
        collectionOrder: state.collectionOrder,
        activeCollectionId: state.activeCollectionId,
        duplicateGroups: state.duplicateGroups.map((g) => ({
          id: g.id,
          hash: g.hash,
          photoIds: g.photos.map((p) => p.id),
          bestPhotoId: g.bestPhotoId,
        })),
        userTags: state.userTags,
        photoNotes: state.photoNotes,
        savedAt: new Date().toISOString(),
      },
    };
    await idbReq(metaStore.put(meta));
    await txDone(tx);
  } catch (error) {
    console.warn('[catalogue-persistence] saveFullCatalogue failed:', error);
  }
}

export async function loadFullCatalogue(): Promise<CatalogueState | null> {
  try {
    const db = await openDb();
    const tx = db.transaction([STORE_PHOTOS, STORE_META], 'readonly');
    const photoStore = tx.objectStore(STORE_PHOTOS);
    const metaStore = tx.objectStore(STORE_META);

    const [persistedPhotos, metaRecord] = await Promise.all([
      idbReq<PersistedPhoto[]>(photoStore.getAll()),
      idbReq<{ key: string; value: CatalogueMeta } | undefined>(metaStore.get(META_KEY_CATALOGUE)),
    ]);

    if (!persistedPhotos.length && !metaRecord) return null;

    // Reconstruire les photos
    const photos: Photo[] = persistedPhotos.map((p) => {
      const file = new File([p.data], p.name, { type: p.type, lastModified: p.lastModified });
      return {
        id: p.id,
        file,
        previewUrl: URL.createObjectURL(file),
        analysis: p.analysis,
        name: p.name,
        size: p.size,
        type: p.type,
        lastModified: p.lastModified,
      };
    });

    const meta = metaRecord?.value;
    if (!meta) {
      return {
        photos,
        collections: {},
        collectionOrder: [],
        activeCollectionId: '',
        duplicateGroups: [],
        userTags: {},
        photoNotes: {},
      };
    }

    // Reconstruire les DuplicateGroup complets depuis les IDs
    const photoById = new Map(photos.map((p) => [p.id, p]));
    const duplicateGroups: DuplicateGroup[] = meta.duplicateGroups
      .map((sg) => {
        const groupPhotos = sg.photoIds.map((id) => photoById.get(id)).filter((p): p is Photo => Boolean(p));
        if (groupPhotos.length < 2) return null;
        return {
          id: sg.id,
          hash: sg.hash,
          photos: groupPhotos,
          bestPhotoId: sg.bestPhotoId,
        };
      })
      .filter((g): g is DuplicateGroup => g !== null);

    return {
      photos,
      collections: meta.collections ?? {},
      collectionOrder: meta.collectionOrder ?? [],
      activeCollectionId: meta.activeCollectionId ?? '',
      duplicateGroups,
      userTags: meta.userTags ?? {},
      photoNotes: meta.photoNotes ?? {},
    };
  } catch (error) {
    console.warn('[catalogue-persistence] loadFullCatalogue failed:', error);
    return null;
  }
}

export async function clearFullCatalogue(): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction([STORE_PHOTOS, STORE_META], 'readwrite');
    await Promise.all([
      idbReq(tx.objectStore(STORE_PHOTOS).clear()),
      idbReq(tx.objectStore(STORE_META).clear()),
    ]);
    await txDone(tx);
  } catch (error) {
    console.warn('[catalogue-persistence] clearFullCatalogue failed:', error);
  }
}
