// Persistance des collections (localStorage) — logique pure extraite de
// photoStore (P2-2) pour alléger le store et isoler cette responsabilité.
// Aucune dépendance au store : juste lecture/écriture + valeurs par défaut.
import { PhotoCollection } from '../types';

export const COLLECTIONS_STORAGE_KEY = 'photo-collections-state';

export type CollectionsSnapshot = {
  collections: Record<string, PhotoCollection>;
  collectionOrder: string[];
  activeCollectionId: string;
};

export const generateCollectionId = (): string => {
  const globalCrypto =
    typeof globalThis !== 'undefined'
      ? (globalThis as { crypto?: Crypto }).crypto
      : undefined;
  if (globalCrypto?.randomUUID) {
    return `collection-${globalCrypto.randomUUID()}`;
  }
  if (globalCrypto?.getRandomValues) {
    const buffer = new Uint32Array(1);
    globalCrypto.getRandomValues(buffer);
    return `collection-${buffer[0].toString(36)}`;
  }
  return `collection-${Math.random().toString(36).slice(2, 10)}`;
};

export const createDefaultCollection = (): PhotoCollection => {
  const timestamp = new Date().toISOString();
  return {
    id: 'collection-default',
    name: 'Collection principale',
    photoIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

export const createDefaultCollectionsState = (): CollectionsSnapshot => {
  const defaultCollection = createDefaultCollection();
  return {
    collections: { [defaultCollection.id]: defaultCollection },
    collectionOrder: [defaultCollection.id],
    activeCollectionId: defaultCollection.id,
  };
};

export const loadCollectionsState = (): CollectionsSnapshot => {
  if (typeof window === 'undefined' || !window?.localStorage) {
    return createDefaultCollectionsState();
  }

  try {
    const persisted = window.localStorage.getItem(COLLECTIONS_STORAGE_KEY);
    if (!persisted) {
      return createDefaultCollectionsState();
    }

    const parsed = JSON.parse(persisted) as Partial<CollectionsSnapshot>;
    if (
      !parsed.collections ||
      !parsed.collectionOrder ||
      !parsed.activeCollectionId
    ) {
      return createDefaultCollectionsState();
    }

    if (!parsed.collections[parsed.activeCollectionId]) {
      parsed.activeCollectionId =
        parsed.collectionOrder[0] ?? createDefaultCollection().id;
    }

    return {
      collections: parsed.collections,
      collectionOrder: parsed.collectionOrder,
      activeCollectionId: parsed.activeCollectionId!,
    };
  } catch (error) {
    console.warn(
      "Impossible de charger l'état des collections, réinitialisation.",
      error
    );
    return createDefaultCollectionsState();
  }
};

export const saveCollectionsState = (snapshot: CollectionsSnapshot) => {
  if (typeof window === 'undefined' || !window?.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(
      COLLECTIONS_STORAGE_KEY,
      JSON.stringify(snapshot)
    );
  } catch (error) {
    console.warn("Impossible de sauvegarder l'état des collections.", error);
  }
};
