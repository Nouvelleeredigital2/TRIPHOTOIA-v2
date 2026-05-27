import { Photo } from '../types';

const DB_NAME = 'tri-photo-analysis';
const DB_VERSION = 1;
const PHOTO_STORE = 'pendingPhotos';
const META_STORE = 'analysisMeta';
const META_KEY = 'analysisQueue';

type PersistedPhoto = {
  id: string;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  data: ArrayBuffer;
};

type QueueMeta = {
  key: string;
  value: string[];
};

const isIndexedDBSupported = (): boolean => typeof indexedDB !== 'undefined';

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });

const openDatabase = (): Promise<IDBDatabase> =>
  new Promise<IDBDatabase>((resolve, reject) => {
    if (!isIndexedDBSupported()) {
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        db.createObjectStore(PHOTO_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });

const transactionComplete = (tx: IDBTransaction): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
  });

const filterPendingForPersistence = (photos: readonly Photo[], queue: readonly string[]): Photo[] => {
  if (queue.length === 0) {
    return [];
  }

  const queueSet = new Set(queue);
  return photos.filter((photo) => !photo.analysis && queueSet.has(photo.id));
};

export const loadAnalysisState = async (): Promise<{ photos: Photo[]; queue: string[] }> => {
  try {
    const db = await openDatabase();
    const tx = db.transaction([PHOTO_STORE, META_STORE], 'readonly');
    const photoStore = tx.objectStore(PHOTO_STORE);
    const metaStore = tx.objectStore(META_STORE);

    const [persistedPhotos, meta] = await Promise.all([
      requestToPromise<readonly PersistedPhoto[]>(photoStore.getAll()),
      requestToPromise<QueueMeta | undefined>(metaStore.get(META_KEY))
        .then((value) => value as QueueMeta | undefined)
        .catch(() => undefined),
    ]);

    const bufferedPhotos = Array.from(persistedPhotos ?? []);

    const reconstructedPhotos: Photo[] = bufferedPhotos.map((persisted) => {
      const file = new File([persisted.data], persisted.name, {
        type: persisted.type,
        lastModified: persisted.lastModified,
      });

      return {
        id: persisted.id,
        file,
        previewUrl: URL.createObjectURL(file),
        analysis: null,
        name: persisted.name,
        size: persisted.size,
        type: persisted.type,
        lastModified: persisted.lastModified,
      };
    });

    const rawQueue = Array.isArray(meta?.value) ? meta!.value : [];
    const queueSet = new Set(rawQueue);
    const validQueue = rawQueue.filter((id) => queueSet.has(id) && reconstructedPhotos.some((photo) => photo.id === id));

    return {
      photos: reconstructedPhotos,
      queue: validQueue,
    };
  } catch (error) {
    console.warn('[analysis-queue-persistence] loadAnalysisState failed', error);
    return { photos: [], queue: [] };
  }
};

export const saveAnalysisState = async (photos: Photo[], queue: string[]): Promise<void> => {
  if (!isIndexedDBSupported()) {
    return;
  }

  const uniqueQueue = Array.from(new Set(queue));
  const pendingPhotos = filterPendingForPersistence(photos, uniqueQueue);

  if (uniqueQueue.length === 0 || pendingPhotos.length === 0) {
    await clearAnalysisState();
    return;
  }

  try {
    const db = await openDatabase();
    const tx = db.transaction([PHOTO_STORE, META_STORE], 'readwrite');
    const photoStore = tx.objectStore(PHOTO_STORE);
    const metaStore = tx.objectStore(META_STORE);

    await Promise.all([
      requestToPromise(photoStore.clear()),
      requestToPromise(metaStore.delete(META_KEY)).catch(() => undefined),
    ]);

    for (const photo of pendingPhotos) {
      const arrayBuffer = await photo.file.arrayBuffer();
      const persisted: PersistedPhoto = {
        id: photo.id,
        name: photo.file.name,
        type: photo.file.type,
        size: photo.file.size,
        lastModified: photo.file.lastModified,
        data: arrayBuffer,
      };
      await requestToPromise(photoStore.put(persisted));
    }

    const meta: QueueMeta = { key: META_KEY, value: uniqueQueue };
    await requestToPromise(metaStore.put(meta));

    await transactionComplete(tx);
  } catch (error) {
    console.warn('[analysis-queue-persistence] saveAnalysisState failed', error);
  }
};

export const clearAnalysisState = async (): Promise<void> => {
  if (!isIndexedDBSupported()) {
    return;
  }

  try {
    const db = await openDatabase();
    const tx = db.transaction([PHOTO_STORE, META_STORE], 'readwrite');
    await Promise.all([
      requestToPromise(tx.objectStore(PHOTO_STORE).clear()),
      requestToPromise(tx.objectStore(META_STORE).delete(META_KEY)).catch(() => undefined),
    ]);
    await transactionComplete(tx);
  } catch (error) {
    console.warn('[analysis-queue-persistence] clearAnalysisState failed', error);
  }
};
