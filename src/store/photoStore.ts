import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { enableMapSet } from 'immer';
import {
  Photo,
  PhotoAnalysis,
  DuplicateGroup,
  UndoAction,
  PhotoCollection,
  RetouchOptions,
  AutoRetouchPreset,
  RETOUCH_OPTION_KEYS,
} from '../types';
import { SMART_COLLECTIONS, matchesRule } from './smartCollections';
import { buildWeddingCollectionDefinitions } from '../features/wedding/weddingTemplate';
import {
  LSHDuplicateDetector,
  hammingDistance,
} from '../lib/lsh-duplicate-detector';
import { GPURetouchProcessor } from '../lib/computer-vision/gpu-retouch';
import { useAiErrorStore } from './aiErrorStore';
import type { CatalogueState } from '../lib/catalogue-persistence';
import {
  createDefaultCollectionsState,
  generateCollectionId,
  loadCollectionsState,
  saveCollectionsState,
} from './collectionsPersistence';
import {
  RETOUCH_HISTORY_LIMIT,
  clampRetouchValue,
  cloneRetouchOptions,
  getDefaultRetouchOptions,
} from './retouchHelpers';

// Enable MapSet plugin for Immer
enableMapSet();

// P1-F : l'historique d'annulation est borné. Sans plafond, `undoStack`
// croissait sans limite et conservait indéfiniment des objets `Photo` complets
// (donc des `File` et des URL blob) pour les suppressions — fuite mémoire sur
// longue session. On plafonne à un nombre explicite d'actions et on libère les
// ressources lourdes des actions évincées.
export const UNDO_STACK_LIMIT = 30;

/** Libère les ressources d'une action d'undo qui sort de l'historique. */
function releaseUndoAction(action: UndoAction): void {
  if (action.type === 'DELETE_PHOTO') {
    const url = action.payload.photo.previewUrl;
    if (url && url.startsWith('blob:') && typeof URL !== 'undefined') {
      URL.revokeObjectURL(url);
    }
  }
}

/** Empile une action d'undo en respectant le plafond et en libérant l'évincé. */
function pushUndo(
  state: { undoStack: UndoAction[] },
  action: UndoAction
): void {
  state.undoStack.push(action);
  if (state.undoStack.length > UNDO_STACK_LIMIT) {
    const evicted = state.undoStack.splice(
      0,
      state.undoStack.length - UNDO_STACK_LIMIT
    );
    evicted.forEach(releaseUndoAction);
  }
}

// Singleton LSH — survit aux re-renders, partagé par toutes les actions du store
const lshDetector = new LSHDuplicateDetector(64, 10, 6);

/** Permet au hook de restauration IDB de réalimenter le LSH sans passer par le store. */
export const lshRebuildFromEntries = (
  entries: { id: string; hash: string }[]
) => lshDetector.rebuild(entries);

// Seuil de similarité (distance de Hamming ≤ 9 sur 64 bits = 85.9%)
const HAMMING_THRESHOLD = 9;

const collectionsState = loadCollectionsState();

export type ExportFilterMode =
  | 'all'
  | 'picks-only'
  | 'favorites-only'
  | 'min-rating';

const gpuRetouchProcessor =
  typeof window !== 'undefined' ? new GPURetouchProcessor() : null;

const loadImageElement = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (error) => reject(error);
    img.src = src;
  });

const generateRetouchedPreview = async (
  baseSrc: string,
  options: RetouchOptions
): Promise<string | null> => {
  if (!gpuRetouchProcessor) {
    return null;
  }

  const image = await loadImageElement(baseSrc);
  const canvas = await gpuRetouchProcessor.applyRetouch(image, options);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error('Unable to generate retouched preview'));
        }
      },
      'image/jpeg',
      0.92
    );
  });

  return URL.createObjectURL(blob);
};

interface PhotoState {
  // Photos data
  photos: Photo[];
  analysisQueue: string[];
  analyzingPhotoIds: Set<string>;
  isProcessing: boolean;
  stopProcessing: boolean;
  processedCount: number;

  // UI state
  activeTab: 'ingestion' | 'triage' | 'development' | 'export';
  pendingExportFilterMode: ExportFilterMode | null;
  selectedPhotoId: string | null;
  userTags: Record<string, string[]>;
  bestPhotoOverrides: Record<string, string>;
  rejectedPhotoIds: Set<string>;
  duplicateGroups: DuplicateGroup[];
  undoStack: UndoAction[];
  retouchSessionPhotoIds: string[];
  retouchActivePhotoId: string | null;
  retouchProcessingIds: Set<string>;
  developmentSelection: Set<string>;
  autoRetouchPreset: AutoRetouchPreset | null;
  autoRetouchError: string | null;
  isAutoRetouchComputing: boolean;

  // Notes utilisateur par photo
  photoNotes: Record<string, string>;

  // Collections
  collections: Record<string, PhotoCollection>;
  collectionOrder: string[];
  activeCollectionId: string;
  activeSmartCollectionId: string | null;

  // Collections actions
  setActiveSmartCollection: (id: string | null) => void;
  createCollection: (name: string, photoIds?: string[]) => string;
  applyWeddingTemplate: () => string[];
  renameCollection: (collectionId: string, name: string) => boolean;
  deleteCollection: (collectionId: string) => void;
  movePhotoToCollection: (
    photoId: string,
    fromCollectionId: string,
    toCollectionId: string
  ) => void;
  setActiveCollection: (collectionId: string) => void;
  addPhotosToCollection: (collectionId: string, photoIds: string[]) => void;
  removePhotosFromCollection: (
    collectionId: string,
    photoIds: string[]
  ) => void;
  setCollectionPhotoIds: (collectionId: string, photoIds: string[]) => void;
  getCollectionById: (collectionId: string) => PhotoCollection | null;
  getActiveCollectionPhotos: () => Photo[];
  isPhotoInActiveCollection: (photoId: string) => boolean;

  // Actions
  addPhotos: (photos: Photo[]) => void;
  setAnalysisQueue: (queue: string[]) => void;
  addToAnalysisQueue: (photoIds: string[]) => void;
  removeFromAnalysisQueue: (photoIds: string[]) => void;
  requeueForAnalysis: (photoIds: string[]) => void;
  setAnalyzingPhotoIds: (ids: Set<string>) => void;
  addAnalyzingPhotoIds: (ids: string[]) => void;
  removeAnalyzingPhotoIds: (ids: string[]) => void;
  setIsProcessing: (processing: boolean) => void;
  setStopProcessing: (stop: boolean) => void;
  setProcessedCount: (count: number) => void;
  incrementProcessedCount: (increment: number) => void;
  setActiveTab: (
    tab: 'ingestion' | 'triage' | 'development' | 'export'
  ) => void;
  setPendingExportFilterMode: (mode: ExportFilterMode | null) => void;
  setSelectedPhotoId: (id: string | null) => void;
  updatePhotoAnalysis: (
    photoId: string,
    analysis: Partial<PhotoAnalysis>
  ) => void;
  updatePhotoMetadata: (
    photoId: string,
    patch: Partial<import('../types').EditableMetadata>
  ) => void;
  updateUserTags: (photoId: string, tags: string[]) => void;
  setPhotoNote: (photoId: string, note: string) => void;
  setBestInGroup: (groupId: string, photoId: string) => void;
  toggleRejectPhoto: (photoId: string) => void;
  removePhoto: (photoId: string) => void;
  setDuplicateGroups: (groups: DuplicateGroup[]) => void;
  detectDuplicates: () => void;
  applyAiSuggestions: (photoId: string) => Promise<void>;
  setPhotoRating: (photoId: string, rating: number) => void;
  togglePhotoPick: (photoId: string) => void;
  togglePhotoReject: (photoId: string) => void;
  unflagPhoto: (photoId: string) => void;
  setColorLabel: (
    photoId: string,
    label: import('../types').ColorLabel | null,
    force?: boolean
  ) => void;
  autoRatePhoto: (photoId: string) => void;
  autoRateAllPhotos: (
    preset?: 'strict' | 'balanced' | 'generous' | 'quality'
  ) => void;
  addUndoAction: (action: UndoAction) => void;
  undo: () => void;
  startRetouchSession: (photoIds: string[]) => Promise<void>;
  setActiveRetouchPhoto: (photoId: string) => void;
  updateRetouchOption: (
    photoId: string,
    option: keyof RetouchOptions,
    value: number
  ) => Promise<void>;
  syncRetouchSettings: (
    fromPhotoId: string,
    toPhotoIds: string[],
    optionsToSync: (keyof RetouchOptions)[]
  ) => Promise<void>;
  resetRetouchOptions: (photoId: string) => Promise<void>;
  applyAutoRetouchPreset: (
    preset: AutoRetouchPreset,
    photoIds?: string[]
  ) => Promise<void>;
  computeAutoRetouchPreset: (photoId: string) => Promise<void>;
  endRetouchSession: () => void;
  toggleDevelopmentSelection: (photoId: string) => void;
  setDevelopmentSelection: (photoIds: string[]) => void;
  clearDevelopmentSelection: () => void;
  getRetouchOptions: (photoId: string) => RetouchOptions;
  getRetouchedPreviewUrl: (photoId: string) => string | null;
  refreshRetouchPreview: (photoId: string) => Promise<void>;
  clearAutoRetouchState: () => void;
  pasteMetadata: (
    photoIds: string[],
    meta: {
      rating?: number;
      isPick?: boolean;
      isRejected?: boolean;
      colorLabel?: import('../types').ColorLabel | null;
    }
  ) => void;
  clearAll: () => void;
  restoreCatalogueState: (saved: CatalogueState) => void;
}

export const usePhotoStore = create<PhotoState>()(
  devtools(
    immer((set, get) => {
      const persistCollections = () => {
        const { collections, collectionOrder, activeCollectionId } = get();
        saveCollectionsState({
          collections,
          collectionOrder,
          activeCollectionId,
        });
      };

      const ensurePhotoRetouchState = (photo: Photo) => {
        if (!photo.retouch) {
          photo.retouch = {
            history: [],
            currentOptions: getDefaultRetouchOptions(),
            originalPreviewUrl: photo.previewUrl,
            previewUrl: photo.previewUrl,
            lastUpdated: new Date().toISOString(),
          };
        }
      };

      const recordRetouchHistory = (photo: Photo) => {
        ensurePhotoRetouchState(photo);
        if (!photo.retouch) {
          return;
        }

        const { history, currentOptions } = photo.retouch;
        history.push(cloneRetouchOptions(currentOptions));
        if (history.length > RETOUCH_HISTORY_LIMIT) {
          history.splice(0, history.length - RETOUCH_HISTORY_LIMIT);
        }
      };

      const refreshRetouchPreview = async (photoId: string) => {
        const currentState = get();
        const target = currentState.photos.find((p) => p.id === photoId);
        if (!target) {
          return;
        }

        ensurePhotoRetouchState(target);
        if (!target.retouch) {
          return;
        }

        const baseSrc = target.retouch.originalPreviewUrl ?? target.previewUrl;
        if (!baseSrc) {
          return;
        }

        set((state) => {
          state.retouchProcessingIds.add(photoId);
        });

        try {
          const previewUrl = await generateRetouchedPreview(
            baseSrc,
            target.retouch.currentOptions
          );
          if (!previewUrl) {
            return;
          }

          set((state) => {
            const photo = state.photos.find((p) => p.id === photoId);
            if (!photo) {
              return;
            }

            ensurePhotoRetouchState(photo);
            if (!photo.retouch) {
              return;
            }

            if (
              photo.retouch.previewUrl &&
              photo.retouch.previewUrl.startsWith('blob:') &&
              typeof URL !== 'undefined'
            ) {
              URL.revokeObjectURL(photo.retouch.previewUrl);
            }

            photo.retouch.previewUrl = previewUrl;
            photo.retouch.lastUpdated = new Date().toISOString();
          });
        } finally {
          set((state) => {
            state.retouchProcessingIds.delete(photoId);
          });
        }
      };

      return {
        // Initial state
        photos: [],
        analysisQueue: [],
        analyzingPhotoIds: new Set(),
        isProcessing: false,
        stopProcessing: false,
        processedCount: 0,
        activeTab: 'ingestion',
        pendingExportFilterMode: null,
        selectedPhotoId: null,
        userTags: {},
        photoNotes: {},
        bestPhotoOverrides: {},
        rejectedPhotoIds: new Set(),
        duplicateGroups: [],
        undoStack: [],
        retouchSessionPhotoIds: [],
        retouchActivePhotoId: null,
        retouchProcessingIds: new Set(),
        developmentSelection: new Set(),
        autoRetouchPreset: null,
        autoRetouchError: null,
        isAutoRetouchComputing: false,
        collections: collectionsState.collections,
        collectionOrder: collectionsState.collectionOrder,
        activeCollectionId: collectionsState.activeCollectionId,
        activeSmartCollectionId: null,

        // Collections actions
        setActiveSmartCollection: (id) =>
          set((state) => {
            state.activeSmartCollectionId = id;
            // Désactiver la sélection normale quand une smart collection est active
            if (id !== null) {
              state.activeCollectionId =
                state.collectionOrder[0] ?? state.activeCollectionId;
            }
          }),

        createCollection: (name: string, photoIds: string[] = []) => {
          let newCollectionId = generateCollectionId();
          set((state) => {
            while (state.collections[newCollectionId]) {
              newCollectionId = generateCollectionId();
            }

            const sanitizedIds = Array.from(
              new Set(
                photoIds.filter((id) =>
                  state.photos.some((photo) => photo.id === id)
                )
              )
            );

            const trimmedName = name.trim();
            const existingNames = new Set(
              Object.values(state.collections).map((collection) =>
                collection.name.toLowerCase()
              )
            );

            let finalName =
              trimmedName || `Collection ${state.collectionOrder.length + 1}`;
            let suffix = 2;
            while (existingNames.has(finalName.toLowerCase())) {
              finalName = `${trimmedName || `Collection ${state.collectionOrder.length + 1}`} (${suffix++})`;
            }

            const timestamp = new Date().toISOString();
            state.collections[newCollectionId] = {
              id: newCollectionId,
              name: finalName,
              photoIds: sanitizedIds,
              createdAt: timestamp,
              updatedAt: timestamp,
            };
            state.collectionOrder.push(newCollectionId);
            state.activeCollectionId = newCollectionId;
          });
          persistCollections();
          return newCollectionId;
        },

        applyWeddingTemplate: () => {
          const createdIds: string[] = [];
          set((state) => {
            const existingNames = new Set(
              Object.values(state.collections).map(
                (collection) => collection.name
              )
            );
            const definitions =
              buildWeddingCollectionDefinitions(existingNames);
            if (definitions.length === 0) {
              return;
            }

            const previousActiveCollectionId = state.activeCollectionId;
            const timestamp = new Date().toISOString();

            definitions.forEach((definition) => {
              let collectionId = definition.id;
              while (state.collections[collectionId]) {
                collectionId = generateCollectionId();
              }

              state.collections[collectionId] = {
                id: collectionId,
                name: definition.name,
                description: definition.description,
                photoIds: [],
                createdAt: timestamp,
                updatedAt: timestamp,
              };
              state.collectionOrder.push(collectionId);
              createdIds.push(collectionId);
            });

            state.activeCollectionId = previousActiveCollectionId;
            state.activeSmartCollectionId = null;
          });

          if (createdIds.length > 0) {
            persistCollections();
          }

          return createdIds;
        },

        renameCollection: (collectionId: string, name: string) => {
          let didUpdate = false;
          let ok = false;
          set((state) => {
            const collection = state.collections[collectionId];
            if (!collection) {
              return;
            }

            const trimmedName = name.trim();
            if (!trimmedName) {
              return; // ok reste false → nom vide rejeté
            }
            if (trimmedName === collection.name) {
              ok = true; // no-op idempotent : succès, sans persistance
              return;
            }

            // A-07 : unicité du nom garantie au niveau du store (défense en profondeur,
            // indépendamment des validations UI). Refus si un autre nom existe.
            const clash = Object.values(state.collections).some(
              (c) =>
                c.id !== collectionId &&
                c.name.toLowerCase() === trimmedName.toLowerCase()
            );
            if (clash) {
              return; // ok reste false → rejet
            }

            collection.name = trimmedName;
            collection.updatedAt = new Date().toISOString();
            didUpdate = true;
            ok = true;
          });
          if (didUpdate) {
            persistCollections();
          }
          return ok;
        },

        deleteCollection: (collectionId: string) => {
          const before = get();
          // A-08 : capturer pour permettre l'annulation (collection + position + active).
          const snapshot = before.collections[collectionId];
          const index = before.collectionOrder.indexOf(collectionId);
          const wasActive = before.activeCollectionId === collectionId;
          let deleted = false;
          set((state) => {
            if (
              !state.collections[collectionId] ||
              state.collectionOrder.length <= 1
            ) {
              return;
            }

            delete state.collections[collectionId];
            state.collectionOrder = state.collectionOrder.filter(
              (id) => id !== collectionId
            );
            if (state.activeCollectionId === collectionId) {
              state.activeCollectionId = state.collectionOrder[0];
            }
            pushUndo(state, {
              type: 'DELETE_COLLECTION',
              payload: { collection: snapshot, index, wasActive },
            });
            deleted = true;
          });
          if (deleted) {
            persistCollections();
          }
        },

        // A-09 : déplacer une photo d'une collection vers une autre (retire de l'origine,
        // ajoute à la destination) — réutilise les garde-fous d'appartenance existants.
        movePhotoToCollection: (
          photoId: string,
          fromCollectionId: string,
          toCollectionId: string
        ) => {
          if (fromCollectionId === toCollectionId) return;
          let changed = false;
          set((state) => {
            const from = state.collections[fromCollectionId];
            const to = state.collections[toCollectionId];
            const photoExists = state.photos.some((p) => p.id === photoId);
            if (!to || !photoExists) return;
            if (from) {
              const i = from.photoIds.indexOf(photoId);
              if (i !== -1) {
                from.photoIds.splice(i, 1);
                from.updatedAt = new Date().toISOString();
              }
            }
            if (!to.photoIds.includes(photoId)) {
              to.photoIds.push(photoId);
              to.updatedAt = new Date().toISOString();
            }
            changed = true;
          });
          if (changed) persistCollections();
        },

        setActiveCollection: (collectionId: string) => {
          set((state) => {
            if (!state.collections[collectionId]) {
              return;
            }
            state.activeCollectionId = collectionId;
            state.activeSmartCollectionId = null;
          });
          persistCollections();
        },

        addPhotosToCollection: (collectionId: string, photoIds: string[]) => {
          let changed = false;
          set((state) => {
            const collection = state.collections[collectionId];
            if (!collection) {
              return;
            }

            const existing = new Set(collection.photoIds);
            const available = new Set(state.photos.map((photo) => photo.id));

            photoIds.forEach((id) => {
              if (!available.has(id) || existing.has(id)) {
                return;
              }
              collection.photoIds.push(id);
              existing.add(id);
              changed = true;
            });

            if (changed) {
              collection.updatedAt = new Date().toISOString();
            }
          });
          if (changed) {
            persistCollections();
          }
        },

        removePhotosFromCollection: (
          collectionId: string,
          photoIds: string[]
        ) => {
          let changed = false;
          set((state) => {
            const collection = state.collections[collectionId];
            if (!collection || collection.photoIds.length === 0) {
              return;
            }

            const removalSet = new Set(photoIds);
            if (removalSet.size === 0) {
              return;
            }

            const filtered = collection.photoIds.filter((id) => {
              if (removalSet.has(id)) {
                changed = true;
                return false;
              }
              return true;
            });

            if (changed) {
              collection.photoIds = filtered;
              collection.updatedAt = new Date().toISOString();
            }
          });
          if (changed) {
            persistCollections();
          }
        },

        setCollectionPhotoIds: (collectionId: string, photoIds: string[]) => {
          let changed = false;
          set((state) => {
            const collection = state.collections[collectionId];
            if (!collection) {
              return;
            }

            const available = new Set(state.photos.map((photo) => photo.id));
            const uniqueIds = Array.from(
              new Set(photoIds.filter((id) => available.has(id)))
            );
            const isDifferent =
              uniqueIds.length !== collection.photoIds.length ||
              uniqueIds.some((id, index) => collection.photoIds[index] !== id);

            if (!isDifferent) {
              return;
            }

            collection.photoIds = uniqueIds;
            collection.updatedAt = new Date().toISOString();
            changed = true;
          });
          if (changed) {
            persistCollections();
          }
        },

        getCollectionById: (collectionId: string) =>
          get().collections[collectionId] ?? null,

        getActiveCollectionPhotos: () => {
          const state = get();

          // Si une smart collection est active, filtrer les photos selon sa règle
          if (state.activeSmartCollectionId) {
            const sc = SMART_COLLECTIONS.find(
              (c) => c.id === state.activeSmartCollectionId
            );
            if (sc) {
              return state.photos.filter((p) =>
                matchesRule(p, sc.rule, {
                  duplicateGroups: state.duplicateGroups,
                  rejectedPhotoIds: state.rejectedPhotoIds,
                })
              );
            }
          }

          const activeCollection = state.collections[state.activeCollectionId];
          if (!activeCollection) {
            return state.photos;
          }

          const photoMap = new Map(
            state.photos.map((photo) => [photo.id, photo])
          );
          return activeCollection.photoIds
            .map((id) => photoMap.get(id))
            .filter((photo): photo is Photo => Boolean(photo));
        },

        isPhotoInActiveCollection: (photoId: string) => {
          const state = get();
          const activeCollection = state.collections[state.activeCollectionId];
          if (!activeCollection) {
            return false;
          }
          return activeCollection.photoIds.includes(photoId);
        },

        // Actions
        addPhotos: (photos) => {
          let collectionUpdated = false;
          set((state) => {
            const existingIds = new Set(state.photos.map((p) => p.id));
            const newPhotos = photos.filter((p) => !existingIds.has(p.id));
            if (newPhotos.length === 0) {
              return;
            }

            state.photos.push(...newPhotos);
            state.analysisQueue.push(...newPhotos.map((p) => p.id));

            const activeCollection =
              state.collections[state.activeCollectionId];
            if (activeCollection) {
              const collectionIds = new Set(activeCollection.photoIds);
              newPhotos.forEach((photo) => {
                if (!collectionIds.has(photo.id)) {
                  activeCollection.photoIds.push(photo.id);
                  collectionIds.add(photo.id);
                  collectionUpdated = true;
                }
              });
              if (collectionUpdated) {
                activeCollection.updatedAt = new Date().toISOString();
              }
            }
          });
          if (collectionUpdated) {
            persistCollections();
          }
        },

        setAnalysisQueue: (queue) =>
          set((state) => {
            state.analysisQueue = queue;
          }),

        addToAnalysisQueue: (photoIds) =>
          set((state) => {
            state.analysisQueue.push(...photoIds);
          }),

        removeFromAnalysisQueue: (photoIds) =>
          set((state) => {
            state.analysisQueue = state.analysisQueue.filter(
              (id) => !photoIds.includes(id)
            );
          }),

        // A-17 / A-19 : (re)mettre des photos dans la file d'analyse — réinitialise une
        // éventuelle erreur/analyse partielle (en gardant le fileHash) et relance le
        // traitement. Sert au « relancer les non analysées » et au « réanalyser » des erreurs.
        requeueForAnalysis: (photoIds) =>
          set((state) => {
            let added = false;
            const target = new Set(photoIds);
            state.photos.forEach((photo) => {
              if (!target.has(photo.id)) return;
              const fileHash = photo.analysis?.fileHash;
              photo.analysis = (
                fileHash ? { fileHash } : null
              ) as PhotoAnalysis | null;
              if (!state.analysisQueue.includes(photo.id)) {
                state.analysisQueue.push(photo.id);
                added = true;
              }
            });
            if (added) {
              state.isProcessing = true;
              state.stopProcessing = false;
            }
          }),

        setAnalyzingPhotoIds: (ids) =>
          set((state) => {
            state.analyzingPhotoIds = ids;
          }),

        addAnalyzingPhotoIds: (ids) =>
          set((state) => {
            ids.forEach((id) => state.analyzingPhotoIds.add(id));
          }),

        removeAnalyzingPhotoIds: (ids) =>
          set((state) => {
            ids.forEach((id) => state.analyzingPhotoIds.delete(id));
          }),

        setIsProcessing: (processing) =>
          set((state) => {
            state.isProcessing = processing;
          }),

        setStopProcessing: (stop) =>
          set((state) => {
            state.stopProcessing = stop;
          }),

        setProcessedCount: (count) =>
          set((state) => {
            state.processedCount = count;
          }),

        incrementProcessedCount: (increment) =>
          set((state) => {
            state.processedCount += increment;
          }),

        setActiveTab: (tab) =>
          set((state) => {
            state.activeTab = tab;
          }),

        setPendingExportFilterMode: (mode) =>
          set((state) => {
            state.pendingExportFilterMode = mode;
          }),

        setSelectedPhotoId: (id) =>
          set((state) => {
            state.selectedPhotoId = id;
          }),

        updatePhotoMetadata: (photoId, patch) => {
          set((state) => {
            const photo = state.photos.find((p) => p.id === photoId);
            if (!photo) return;
            const meta = photo.metadata ?? {};
            photo.metadata = {
              ...meta,
              editable: { ...(meta.editable ?? {}), ...patch },
            };
          });
        },

        updatePhotoAnalysis: (photoId, analysis) => {
          set((state) => {
            const photoIndex = state.photos.findIndex((p) => p.id === photoId);
            if (photoIndex !== -1) {
              const currentAnalysis = state.photos[photoIndex].analysis ?? {};
              state.photos[photoIndex].analysis = {
                ...currentAnalysis,
                ...analysis,
              } as PhotoAnalysis;
            }
          });

          // Insertion incrémentale dans LSH dès qu'un pHash est disponible
          const newHash = analysis.perceptualHash;
          if (newHash) {
            lshDetector.insert(photoId, newHash);
            // Debounce léger pour regrouper les mises à jour rapides
            const w = window as Window & {
              __duplicateDetectionTimeout?: ReturnType<typeof setTimeout>;
            };
            clearTimeout(w.__duplicateDetectionTimeout);
            w.__duplicateDetectionTimeout = setTimeout(() => {
              get().detectDuplicates();
            }, 300);
          }
        },

        updateUserTags: (photoId, tags) =>
          set((state) => {
            state.userTags[photoId] = tags;
          }),

        setPhotoNote: (photoId, note) =>
          set((state) => {
            const previousNote = state.photoNotes[photoId] ?? '';
            // A-25 : coalescer — une seule entrée undo par session d'édition d'une note.
            // Si la dernière action est déjà un SET_NOTE pour cette photo, on conserve son
            // previousNote (l'état initial) au lieu d'empiler une entrée par frappe.
            const last = state.undoStack[state.undoStack.length - 1];
            if (
              !(
                last &&
                last.type === 'SET_NOTE' &&
                last.payload.photoId === photoId
              )
            ) {
              pushUndo(state, {
                type: 'SET_NOTE',
                payload: { photoId, previousNote },
              });
            }
            if (note.trim() === '') {
              delete state.photoNotes[photoId];
            } else {
              state.photoNotes[photoId] = note;
            }
          }),

        setBestInGroup: (groupId, photoId) =>
          set((state) => {
            const group = state.duplicateGroups.find((g) => g.id === groupId);
            if (group) {
              const previousBestId =
                state.bestPhotoOverrides[groupId] || group.bestPhotoId;
              state.bestPhotoOverrides[groupId] = photoId;
              pushUndo(state, {
                type: 'SET_BEST',
                payload: { groupId, previousBestId, newBestId: photoId },
              });
            }
          }),

        toggleRejectPhoto: (photoId) =>
          set((state) => {
            if (state.rejectedPhotoIds.has(photoId)) {
              state.rejectedPhotoIds.delete(photoId);
            } else {
              state.rejectedPhotoIds.add(photoId);
            }
            pushUndo(state, {
              type: 'TOGGLE_REJECT',
              payload: { photoId },
            });
          }),

        removePhoto: (photoId) => {
          // Snapshot AVANT suppression (état zustand figé = objets simples) pour permettre
          // l'undo (A-22) : photo, position, collections d'appartenance, état rejeté.
          const before = get();
          const removedIndex = before.photos.findIndex(
            (photo) => photo.id === photoId
          );
          if (removedIndex === -1) {
            return;
          }
          const removedPhoto = before.photos[removedIndex];
          const collectionIds = before.collectionOrder.filter((cid) =>
            before.collections[cid]?.photoIds.includes(photoId)
          );
          const wasRejected =
            before.rejectedPhotoIds.has(photoId) ||
            removedPhoto.analysis?.isRejected === true;
          // Capturer les overrides « meilleur du groupe » qui pointaient sur cette photo,
          // pour pouvoir les restaurer à l'annulation (sinon le choix manuel est perdu).
          const bestOverrides: Record<string, string> = {};
          Object.entries(before.bestPhotoOverrides).forEach(
            ([groupId, bestId]) => {
              if (bestId === photoId) bestOverrides[groupId] = bestId;
            }
          );

          set((state) => {
            const photoIndex = state.photos.findIndex(
              (photo) => photo.id === photoId
            );
            if (photoIndex === -1) {
              return;
            }

            lshDetector.remove(photoId);
            state.photos.splice(photoIndex, 1);
            state.analysisQueue = state.analysisQueue.filter(
              (id) => id !== photoId
            );
            state.analyzingPhotoIds.delete(photoId);
            state.rejectedPhotoIds.delete(photoId);

            if (state.selectedPhotoId === photoId) {
              state.selectedPhotoId = null;
            }

            delete state.userTags[photoId];
            delete state.photoNotes[photoId];

            // A-23 : retirer l'ID de TOUTES les collections (évite les références mortes
            // et les compteurs incohérents).
            Object.values(state.collections).forEach((col) => {
              const idx = col.photoIds.indexOf(photoId);
              if (idx !== -1) {
                col.photoIds.splice(idx, 1);
                col.updatedAt = new Date().toISOString();
              }
            });

            Object.entries(state.bestPhotoOverrides).forEach(
              ([groupId, bestId]) => {
                if (bestId === photoId) {
                  delete state.bestPhotoOverrides[groupId];
                }
              }
            );

            state.undoStack = state.undoStack.filter((action) => {
              if (
                action.type === 'TOGGLE_REJECT' &&
                action.payload.photoId === photoId
              ) {
                return false;
              }
              if (
                action.type === 'SET_BEST' &&
                (action.payload.previousBestId === photoId ||
                  action.payload.newBestId === photoId)
              ) {
                return false;
              }
              return true;
            });

            const updatedGroups: DuplicateGroup[] = [];

            state.duplicateGroups.forEach((group) => {
              const filteredPhotos = group.photos.filter(
                (photo) => photo.id !== photoId
              );

              if (filteredPhotos.length <= 1) {
                delete state.bestPhotoOverrides[group.id];
                return;
              }

              const bestPhoto =
                group.bestPhotoId === photoId
                  ? filteredPhotos.reduce((best, current) => {
                      const bestScore = best.analysis?.sharpnessScore ?? 0;
                      const currentScore =
                        current.analysis?.sharpnessScore ?? 0;
                      return currentScore > bestScore ? current : best;
                    }, filteredPhotos[0])
                  : (filteredPhotos.find(
                      (photo) => photo.id === group.bestPhotoId
                    ) ?? filteredPhotos[0]);

              updatedGroups.push({
                ...group,
                photos: filteredPhotos,
                bestPhotoId: bestPhoto.id,
              });
            });

            state.duplicateGroups = updatedGroups;
            state.processedCount = state.photos.filter(
              (photo) => photo.analysis && !photo.analysis.error
            ).length;

            // A-22 : enregistrer l'action pour permettre l'annulation de la suppression.
            pushUndo(state, {
              type: 'DELETE_PHOTO',
              payload: {
                photo: removedPhoto,
                index: removedIndex,
                collectionIds,
                wasRejected,
                bestOverrides,
              },
            });
          });
          persistCollections();
        },

        setDuplicateGroups: (groups) =>
          set((state) => {
            state.duplicateGroups = groups;
          }),

        detectDuplicates: () => {
          const state = get();
          const photos = state.photos.filter((p) => p.analysis?.perceptualHash);

          if (photos.length < 2) {
            set((s) => {
              s.duplicateGroups = [];
            });
            return;
          }

          // S'assurer que le LSH est cohérent avec l'état actuel
          if (lshDetector.size() !== photos.length) {
            lshDetector.rebuild(
              photos.map((p) => ({
                id: p.id,
                hash: p.analysis!.perceptualHash!,
              }))
            );
          }

          const findBestPhoto = (groupPhotos: Photo[]): string =>
            groupPhotos.reduce((best, current) =>
              (current.analysis?.sharpnessScore ?? 0) >
              (best.analysis?.sharpnessScore ?? 0)
                ? current
                : best
            ).id;

          const photoMap = new Map(photos.map((p) => [p.id, p]));
          const assigned = new Set<string>();
          const groups: DuplicateGroup[] = [];

          for (const photo of photos) {
            if (assigned.has(photo.id)) continue;

            const hash = photo.analysis!.perceptualHash!;
            // LSH : récupérer uniquement les candidats du bucket — O(L*K) au lieu de O(N)
            const candidates = lshDetector.queryCandidates(hash);
            candidates.delete(photo.id);

            const groupPhotos: Photo[] = [photo];
            assigned.add(photo.id);

            for (const candidateId of candidates) {
              if (assigned.has(candidateId)) continue;
              const candidate = photoMap.get(candidateId);
              if (!candidate) continue;
              const candidateHash = candidate.analysis!.perceptualHash!;
              if (hammingDistance(hash, candidateHash) <= HAMMING_THRESHOLD) {
                groupPhotos.push(candidate);
                assigned.add(candidateId);
              }
            }

            if (groupPhotos.length > 1) {
              groups.push({
                id: `group-${photo.id}`,
                hash,
                photos: groupPhotos,
                bestPhotoId: findBestPhoto(groupPhotos),
              });
            }
          }

          set((s) => {
            s.duplicateGroups = groups;
          });
        },

        applyAiSuggestions: async (photoId) => {
          const state = get();
          const photo = state.photos.find((p) => p.id === photoId);

          if (!photo?.analysis?.suggestedRetouch) {
            console.warn('❌ Aucune suggestion IA disponible pour cette photo');
            return;
          }

          const { brightness, contrast, saturation } =
            photo.analysis.suggestedRetouch;

          // Convertir les suggestions (0.8-1.2) en valeurs RetouchOptions (-100 à +100)
          const exposureValue = Math.round((brightness - 1) * 100);
          const contrastValue = Math.round((contrast - 1) * 100);
          const saturationValue = Math.round((saturation - 1) * 100);

          console.log(
            `🎨 Application suggestions IA pour ${photo.file.name}:`,
            {
              exposure: exposureValue,
              contrast: contrastValue,
              saturation: saturationValue,
            }
          );

          // Démarrer une session de retouche si nécessaire
          if (!state.retouchSessionPhotoIds.includes(photoId)) {
            await get().startRetouchSession([photoId]);
          }

          // Appliquer les ajustements
          await Promise.all([
            get().updateRetouchOption(photoId, 'exposure', exposureValue),
            get().updateRetouchOption(photoId, 'contrast', contrastValue),
            get().updateRetouchOption(photoId, 'saturation', saturationValue),
          ]);

          console.log('✅ Suggestions IA appliquées avec succès');
        },

        setPhotoRating: (photoId, rating) =>
          set((state) => {
            const photo = state.photos.find((p) => p.id === photoId);
            if (photo) {
              if (!photo.analysis) photo.analysis = {};
              const previousRating = photo.analysis.rating ?? 0;
              const newRating = Math.max(0, Math.min(5, rating));
              pushUndo(state, {
                type: 'SET_RATING',
                payload: { photoId, previousRating, newRating },
              });
              photo.analysis.rating = newRating;
            }
          }),

        togglePhotoPick: (photoId) =>
          set((state) => {
            const photo = state.photos.find((p) => p.id === photoId);
            if (photo) {
              if (!photo.analysis) photo.analysis = {};
              pushUndo(state, {
                type: 'SET_PICK',
                payload: {
                  photoId,
                  previousPick: !!photo.analysis.isPick,
                  previousRejected: !!photo.analysis.isRejected,
                },
              });
              photo.analysis.isPick = !photo.analysis.isPick;
              if (photo.analysis.isPick) {
                photo.analysis.isRejected = false;
                // Garder rejectedPhotoIds cohérent avec analysis.isRejected :
                // sinon une photo rejetée puis pickée resterait « rejetée » pour
                // l'export (exportSelection lit aussi rejectedPhotoIds).
                state.rejectedPhotoIds.delete(photoId);
              }
            }
          }),

        togglePhotoReject: (photoId) =>
          set((state) => {
            const photo = state.photos.find((p) => p.id === photoId);
            if (photo) {
              if (!photo.analysis) photo.analysis = {};
              pushUndo(state, {
                type: 'SET_REJECT',
                payload: {
                  photoId,
                  previousPick: !!photo.analysis.isPick,
                  previousRejected: !!photo.analysis.isRejected,
                },
              });
              photo.analysis.isRejected = !photo.analysis.isRejected;
              if (photo.analysis.isRejected) {
                photo.analysis.isPick = false;
                state.rejectedPhotoIds.add(photoId);
              } else {
                state.rejectedPhotoIds.delete(photoId);
              }
            }
          }),

        unflagPhoto: (photoId) =>
          set((state) => {
            const photo = state.photos.find((p) => p.id === photoId);
            if (photo && photo.analysis) {
              pushUndo(state, {
                type: 'UNFLAG',
                payload: {
                  photoId,
                  previousPick: !!photo.analysis.isPick,
                  previousRejected: !!photo.analysis.isRejected,
                  previousColorLabel: photo.analysis.colorLabel ?? null,
                },
              });
              photo.analysis.isPick = false;
              photo.analysis.isRejected = false;
              photo.analysis.colorLabel = null;
              state.rejectedPhotoIds.delete(photoId);
            }
          }),

        setColorLabel: (photoId, label, force = false) =>
          set((state) => {
            const photo = state.photos.find((p) => p.id === photoId);
            if (photo) {
              if (!photo.analysis) photo.analysis = {};
              if (!force) {
                // Undo seulement pour les actions manuelles (pas bulk)
                pushUndo(state, {
                  type: 'SET_COLOR_LABEL',
                  payload: {
                    photoId,
                    previousLabel: photo.analysis.colorLabel ?? null,
                  },
                });
              }
              photo.analysis.colorLabel = force
                ? label
                : photo.analysis.colorLabel === label
                  ? null
                  : label;
            }
          }),

        autoRatePhoto: (photoId) =>
          set((state) => {
            const photo = state.photos.find((p) => p.id === photoId);
            if (!photo?.analysis || photo.analysis.error) return;

            // Calcul score basé sur analyse
            let score = 0;
            let totalWeight = 0;

            // Netteté (40%)
            if (photo.analysis.sharpnessScore !== undefined) {
              const sharpness = photo.analysis.sharpnessScore;
              let normalizedSharpness = 0;
              if (sharpness > 0.8) normalizedSharpness = 1.0;
              else if (sharpness > 0.6) normalizedSharpness = 0.8;
              else if (sharpness > 0.4) normalizedSharpness = 0.6;
              else if (sharpness > 0.3) normalizedSharpness = 0.4;
              else normalizedSharpness = 0.2;

              score += normalizedSharpness * 0.4;
              totalWeight += 0.4;
            }

            // Composition (30%)
            score += 0.7 * 0.3;
            totalWeight += 0.3;

            // Yeux ouverts (15%)
            if (photo.analysis.hasOpenEyes !== undefined) {
              score += (photo.analysis.hasOpenEyes ? 1.0 : 0.3) * 0.15;
              totalWeight += 0.15;
            }

            // Besoin retouche (15%)
            if (photo.analysis.suggestedRetouch) {
              const { brightness, contrast, saturation } =
                photo.analysis.suggestedRetouch;
              const deviation =
                (Math.abs(brightness - 1) +
                  Math.abs(contrast - 1) +
                  Math.abs(saturation - 1)) /
                3;
              const retouchScore = Math.max(0, 1 - deviation * 3);
              score += retouchScore * 0.15;
              totalWeight += 0.15;
            }

            // Normaliser et convertir en étoiles
            const normalizedScore = totalWeight > 0 ? score / totalWeight : 0;
            let rating = 0;
            if (normalizedScore >= 0.9) rating = 5;
            else if (normalizedScore >= 0.75) rating = 4;
            else if (normalizedScore >= 0.6) rating = 3;
            else if (normalizedScore >= 0.4) rating = 2;
            else if (normalizedScore >= 0.2) rating = 1;

            photo.analysis.rating = rating;
            console.log(
              `🤖 Auto-rating ${photo.file.name}: ${rating} étoile(s) (score: ${normalizedScore.toFixed(2)})`
            );
          }),

        autoRateAllPhotos: (preset = 'balanced') =>
          set((state) => {
            const photos = state.photos.filter(
              (p) => p.analysis && !p.analysis.error
            );

            if (photos.length === 0) {
              console.warn('⚠️ Aucune photo analysée à noter');
              return;
            }

            // Fonction helper pour calculer score
            const calculatePhotoScore = (photo: Photo): number => {
              const analysis = photo.analysis;
              if (!analysis || analysis.error) return 0;

              let score = 0;
              let count = 0;

              if (analysis.sharpnessScore !== undefined) {
                score += analysis.sharpnessScore;
                count++;
              }

              if (analysis.hasOpenEyes !== undefined) {
                score += analysis.hasOpenEyes ? 1 : 0.3;
                count++;
              }

              if (analysis.suggestedRetouch) {
                const { brightness, contrast, saturation } =
                  analysis.suggestedRetouch;
                const deviation =
                  (Math.abs(brightness - 1) +
                    Math.abs(contrast - 1) +
                    Math.abs(saturation - 1)) /
                  3;
                score += Math.max(0, 1 - deviation * 2);
                count++;
              }

              return count > 0 ? score / count : 0;
            };

            // Calculer scores pour toutes les photos
            const photoScores = photos
              .map((photo) => ({
                photo,
                score: calculatePhotoScore(photo),
              }))
              .sort((a, b) => b.score - a.score);

            // Distribution selon preset
            const distributions = {
              strict: { 5: 0.05, 4: 0.15, 3: 0.3, 2: 0.3, 1: 0.2 },
              balanced: { 5: 0.1, 4: 0.2, 3: 0.3, 2: 0.2, 1: 0.2 },
              generous: { 5: 0.15, 4: 0.25, 3: 0.3, 2: 0.2, 1: 0.1 },
              quality: null, // Utilise scores bruts
            };

            const distribution = distributions[preset];

            if (distribution) {
              // Distribuer selon preset
              let index = 0;
              const counts: Record<number, number> = {
                5: Math.ceil(photos.length * distribution[5]),
                4: Math.ceil(photos.length * distribution[4]),
                3: Math.ceil(photos.length * distribution[3]),
                2: Math.ceil(photos.length * distribution[2]),
                1: Math.ceil(photos.length * distribution[1]),
              };

              [5, 4, 3, 2, 1].forEach((rating) => {
                for (
                  let i = 0;
                  i < counts[rating] && index < photoScores.length;
                  i++
                ) {
                  photoScores[index].photo.analysis!.rating = rating;
                  index++;
                }
              });

              // Reste = 0 ou 1 selon si flou
              while (index < photoScores.length) {
                const photo = photoScores[index].photo;
                photo.analysis!.rating = photo.analysis?.isBlurry ? 0 : 1;
                index++;
              }
            } else {
              // Mode quality: utilise scores bruts
              photoScores.forEach(({ photo, score }) => {
                let rating = 0;
                if (score >= 0.9) rating = 5;
                else if (score >= 0.75) rating = 4;
                else if (score >= 0.6) rating = 3;
                else if (score >= 0.4) rating = 2;
                else if (score >= 0.2) rating = 1;
                photo.analysis!.rating = rating;
              });
            }

            console.log(
              `🤖 Auto-rating: ${photos.length} photos notées (preset: ${preset})`
            );

            // Afficher distribution
            const dist: Record<number, number> = {
              0: 0,
              1: 0,
              2: 0,
              3: 0,
              4: 0,
              5: 0,
            };
            photos.forEach((p) => {
              const r = p.analysis?.rating || 0;
              dist[r]++;
            });
            console.log('📊 Distribution:', dist);
          }),

        addUndoAction: (action) =>
          set((state) => {
            pushUndo(state, action);
          }),

        undo: () => {
          const stack = get().undoStack;
          if (stack.length === 0) return;
          const pending = stack[stack.length - 1];

          // A-22 : restauration d'une photo supprimée (réinsertion à sa position +
          // ré-ajout aux collections + LSH + re-détection des doublons).
          if (pending.type === 'DELETE_PHOTO') {
            const { photo, index, collectionIds, wasRejected, bestOverrides } =
              pending.payload;
            set((state) => {
              if (!state.photos.some((p) => p.id === photo.id)) {
                const insertAt = Math.min(
                  Math.max(index, 0),
                  state.photos.length
                );
                state.photos.splice(insertAt, 0, photo);
              }
              collectionIds.forEach((cid) => {
                const col = state.collections[cid];
                if (col && !col.photoIds.includes(photo.id)) {
                  col.photoIds.push(photo.id);
                  col.updatedAt = new Date().toISOString();
                }
              });
              // Restaurer les overrides « meilleur du groupe » qui pointaient sur la photo.
              Object.entries(bestOverrides ?? {}).forEach(
                ([groupId, bestId]) => {
                  state.bestPhotoOverrides[groupId] = bestId;
                }
              );
              if (wasRejected) state.rejectedPhotoIds.add(photo.id);
              if (!photo.analysis) state.analysisQueue.push(photo.id);
              if (photo.analysis?.perceptualHash) {
                lshDetector.insert(photo.id, photo.analysis.perceptualHash);
              }
              state.processedCount = state.photos.filter(
                (p) => p.analysis && !p.analysis.error
              ).length;
              state.undoStack.pop();
            });
            persistCollections();
            get().detectDuplicates();
            return;
          }

          // A-08 : restauration d'une collection supprimée (réinsertion à sa position).
          if (pending.type === 'DELETE_COLLECTION') {
            const { collection, index, wasActive } = pending.payload;
            set((state) => {
              if (collection && !state.collections[collection.id]) {
                state.collections[collection.id] = collection;
                const at = Math.min(
                  Math.max(index, 0),
                  state.collectionOrder.length
                );
                state.collectionOrder.splice(at, 0, collection.id);
                if (wasActive) state.activeCollectionId = collection.id;
              }
              state.undoStack.pop();
            });
            persistCollections();
            return;
          }

          set((state) => {
            if (state.undoStack.length === 0) return;

            const lastAction = state.undoStack[state.undoStack.length - 1];

            switch (lastAction.type) {
              case 'SET_BEST': {
                const { groupId, previousBestId } = lastAction.payload;
                state.bestPhotoOverrides[groupId] = previousBestId;
                break;
              }
              case 'TOGGLE_REJECT': {
                // Legacy — toggle back
                const { photoId } = lastAction.payload;
                if (state.rejectedPhotoIds.has(photoId)) {
                  state.rejectedPhotoIds.delete(photoId);
                } else {
                  state.rejectedPhotoIds.add(photoId);
                }
                break;
              }
              case 'SET_RATING': {
                const { photoId, previousRating } = lastAction.payload;
                const photo = state.photos.find((p) => p.id === photoId);
                if (photo?.analysis) photo.analysis.rating = previousRating;
                break;
              }
              case 'SET_PICK': {
                const { photoId, previousPick, previousRejected } =
                  lastAction.payload;
                const photo = state.photos.find((p) => p.id === photoId);
                if (photo?.analysis) {
                  photo.analysis.isPick = previousPick;
                  photo.analysis.isRejected = previousRejected;
                  // Restaurer rejectedPhotoIds en miroir de previousRejected
                  // (le pick a pu retirer la photo du set ; l'undo doit le rétablir).
                  if (previousRejected) {
                    state.rejectedPhotoIds.add(photoId);
                  } else {
                    state.rejectedPhotoIds.delete(photoId);
                  }
                }
                break;
              }
              case 'SET_REJECT': {
                const { photoId, previousPick, previousRejected } =
                  lastAction.payload;
                const photo = state.photos.find((p) => p.id === photoId);
                if (photo?.analysis) {
                  photo.analysis.isPick = previousPick;
                  photo.analysis.isRejected = previousRejected;
                  if (previousRejected) {
                    state.rejectedPhotoIds.add(photoId);
                  } else {
                    state.rejectedPhotoIds.delete(photoId);
                  }
                }
                break;
              }
              case 'SET_COLOR_LABEL': {
                const { photoId, previousLabel } = lastAction.payload;
                const photo = state.photos.find((p) => p.id === photoId);
                if (photo?.analysis) photo.analysis.colorLabel = previousLabel;
                break;
              }
              case 'UNFLAG': {
                const {
                  photoId,
                  previousPick,
                  previousRejected,
                  previousColorLabel,
                } = lastAction.payload;
                const photo = state.photos.find((p) => p.id === photoId);
                if (photo?.analysis) {
                  photo.analysis.isPick = previousPick;
                  photo.analysis.isRejected = previousRejected;
                  photo.analysis.colorLabel = previousColorLabel;
                  if (previousRejected) {
                    state.rejectedPhotoIds.add(photoId);
                  }
                }
                break;
              }
              case 'SET_NOTE': {
                const { photoId, previousNote } = lastAction.payload;
                if (previousNote.trim() === '') {
                  delete state.photoNotes[photoId];
                } else {
                  state.photoNotes[photoId] = previousNote;
                }
                break;
              }
            }

            state.undoStack.pop();
          });
        },

        startRetouchSession: async (photoIds) => {
          const currentState = get();
          const availableIds = new Set(
            currentState.photos.map((photo) => photo.id)
          );
          const uniqueIds = Array.from(new Set(photoIds)).filter((id) =>
            availableIds.has(id)
          );

          if (uniqueIds.length === 0) {
            return;
          }

          set((state) => {
            state.retouchSessionPhotoIds = uniqueIds;
            state.retouchActivePhotoId = uniqueIds[0] ?? null;
            // 'development' n'est PAS un onglet valide (type Tab = ingestion|triage|export).
            // L'atelier retouche s'affiche en overlay piloté par retouchSessionPhotoIds ;
            // on garde un activeTab valide en arrière-plan.
            state.activeTab = 'triage';
            state.developmentSelection = new Set(uniqueIds);
            state.retouchProcessingIds = new Set();

            uniqueIds.forEach((id) => {
              const photo = state.photos.find((p) => p.id === id);
              if (!photo) {
                return;
              }
              ensurePhotoRetouchState(photo);
              if (photo.retouch) {
                photo.retouch.originalPreviewUrl =
                  photo.retouch.originalPreviewUrl ?? photo.previewUrl;
                photo.retouch.previewUrl =
                  photo.retouch.previewUrl ?? photo.previewUrl;
                photo.retouch.lastUpdated = new Date().toISOString();
              }
            });
          });

          await Promise.all(uniqueIds.map((id) => refreshRetouchPreview(id)));
        },

        setActiveRetouchPhoto: (photoId) =>
          set((state) => {
            if (!state.retouchSessionPhotoIds.includes(photoId)) {
              return;
            }
            state.retouchActivePhotoId = photoId;
          }),

        updateRetouchOption: async (photoId, option, value) => {
          const clampedValue = clampRetouchValue(option, value);
          const exists = get().photos.some((photo) => photo.id === photoId);
          if (!exists) {
            return;
          }

          set((state) => {
            const target = state.photos.find((p) => p.id === photoId);
            if (!target) {
              return;
            }

            ensurePhotoRetouchState(target);
            if (!target.retouch) {
              return;
            }

            const retouch = target.retouch;
            if (retouch.currentOptions[option] === clampedValue) {
              return;
            }

            recordRetouchHistory(target);
            retouch.currentOptions[option] = clampedValue;
            retouch.lastUpdated = new Date().toISOString();
          });

          await refreshRetouchPreview(photoId);
        },

        syncRetouchSettings: async (fromPhotoId, toPhotoIds, optionsToSync) => {
          set((state) => {
            const source = state.photos.find((p) => p.id === fromPhotoId);
            if (source) {
              ensurePhotoRetouchState(source);
            }
          });

          const latestState = get();
          const sourcePhoto = latestState.photos.find(
            (p) => p.id === fromPhotoId
          );
          if (!sourcePhoto || !sourcePhoto.retouch) {
            return;
          }

          const optionKeys =
            optionsToSync && optionsToSync.length > 0
              ? optionsToSync
              : [...RETOUCH_OPTION_KEYS];

          const availableIds = new Set(
            latestState.photos.map((photo) => photo.id)
          );
          const targetIds = Array.from(
            new Set(
              toPhotoIds.filter(
                (id) => id !== fromPhotoId && availableIds.has(id)
              )
            )
          );

          if (targetIds.length === 0) {
            return;
          }

          await Promise.all(
            targetIds.map(async (id) => {
              set((state) => {
                const target = state.photos.find((p) => p.id === id);
                if (!target) {
                  return;
                }

                ensurePhotoRetouchState(target);
                if (!target.retouch) {
                  return;
                }

                recordRetouchHistory(target);
                optionKeys.forEach((key) => {
                  target.retouch!.currentOptions[key] = clampRetouchValue(
                    key,
                    sourcePhoto.retouch!.currentOptions[key]
                  );
                });
                target.retouch.lastUpdated = new Date().toISOString();
              });

              await refreshRetouchPreview(id);
            })
          );
        },

        resetRetouchOptions: async (photoId) => {
          const exists = get().photos.some((photo) => photo.id === photoId);
          if (!exists) {
            return;
          }

          set((state) => {
            const target = state.photos.find((p) => p.id === photoId);
            if (!target) {
              return;
            }

            ensurePhotoRetouchState(target);
            if (!target.retouch) {
              return;
            }

            recordRetouchHistory(target);
            target.retouch.currentOptions = getDefaultRetouchOptions();
            target.retouch.lastUpdated = new Date().toISOString();
            target.retouch.lastAutoPreset = undefined;
            target.retouch.autoPresetConfidence = undefined;
          });

          await refreshRetouchPreview(photoId);
        },

        applyAutoRetouchPreset: async (preset, photoIds) => {
          const store = get();
          const targetIds = (
            photoIds && photoIds.length > 0
              ? photoIds
              : [store.retouchActivePhotoId]
          ).filter(
            (id): id is string => typeof id === 'string' && id.length > 0
          );
          if (targetIds.length === 0) {
            return;
          }

          const aiErrors = useAiErrorStore.getState();

          await Promise.all(
            targetIds.map(async (id) => {
              set((state) => {
                const photo = state.photos.find((p) => p.id === id);
                if (!photo) {
                  return;
                }
                ensurePhotoRetouchState(photo);
                if (!photo.retouch) {
                  return;
                }
                // Capture locale : le narrowing de `photo.retouch` se perd dans
                // les closures (forEach) sous strictNullChecks.
                const retouch = photo.retouch;

                recordRetouchHistory(photo);
                RETOUCH_OPTION_KEYS.forEach((key) => {
                  const nextValue = preset.options[key];
                  if (typeof nextValue === 'number') {
                    retouch.currentOptions[key] = clampRetouchValue(
                      key,
                      nextValue
                    );
                  }
                });
                retouch.lastUpdated = new Date().toISOString();
                retouch.lastAutoPreset = { ...preset.options };
                photo.retouch.autoPresetConfidence = preset.confidence;
              });

              await refreshRetouchPreview(id);

              aiErrors.resolveErrorsForPhoto(id, 'retouch');
            })
          );

          set((state) => {
            state.autoRetouchPreset = preset;
            state.autoRetouchError = null;
            state.isAutoRetouchComputing = false;
          });
        },

        computeAutoRetouchPreset: async (photoId) => {
          const currentState = get();
          const photo = currentState.photos.find((p) => p.id === photoId);
          if (!photo) {
            return;
          }

          const baseSrc = photo.retouch?.originalPreviewUrl ?? photo.previewUrl;
          if (!baseSrc) {
            return;
          }

          set((state) => {
            state.isAutoRetouchComputing = true;
            state.autoRetouchError = null;
          });

          const aiErrors = useAiErrorStore.getState();

          try {
            if (!gpuRetouchProcessor) {
              throw new Error('Retouch processor unavailable');
            }

            const image = await loadImageElement(baseSrc);
            const preset =
              await gpuRetouchProcessor.computeAutoRetouchPreset(image);
            if (!preset) {
              throw new Error('Pré-réglage automatique indisponible.');
            }

            await get().applyAutoRetouchPreset(preset, [photoId]);

            set((state) => {
              state.autoRetouchPreset = preset;
              state.isAutoRetouchComputing = false;
              state.autoRetouchError = null;
            });

            aiErrors.resolveErrorsForPhoto(photoId, 'retouch');
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            set((state) => {
              state.isAutoRetouchComputing = false;
              state.autoRetouchError = message;
            });

            aiErrors.pushError({
              source: 'retouch',
              severity: 'error',
              message: `Échec du preset automatique : ${message}`,
              photoId,
              details:
                error instanceof Error
                  ? { message: error.message, stack: error.stack }
                  : error,
              hint: 'Veuillez vérifier la connexion GPU ou réessayer plus tard.',
            });
          }
        },

        toggleDevelopmentSelection: (photoId) =>
          set((state) => {
            if (state.developmentSelection.has(photoId)) {
              state.developmentSelection.delete(photoId);
            } else {
              state.developmentSelection.add(photoId);
            }
          }),

        setDevelopmentSelection: (photoIds) =>
          set((state) => {
            state.developmentSelection = new Set(photoIds);
          }),

        clearDevelopmentSelection: () =>
          set((state) => {
            state.developmentSelection.clear();
          }),

        endRetouchSession: () =>
          set((state) => {
            state.retouchSessionPhotoIds = [];
            state.retouchActivePhotoId = null;
            state.developmentSelection.clear();
          }),

        getRetouchOptions: (photoId) => {
          const state = get();
          const photo = state.photos.find((p) => p.id === photoId);
          if (!photo) {
            return getDefaultRetouchOptions();
          }
          ensurePhotoRetouchState(photo);
          return photo.retouch?.currentOptions ?? getDefaultRetouchOptions();
        },

        getRetouchedPreviewUrl: (photoId) => {
          const state = get();
          const photo = state.photos.find((p) => p.id === photoId);
          if (!photo) {
            return null;
          }
          ensurePhotoRetouchState(photo);
          return photo.retouch?.previewUrl ?? photo.previewUrl ?? null;
        },

        refreshRetouchPreview: async (photoId) => {
          await refreshRetouchPreview(photoId);
        },

        clearAutoRetouchState: () =>
          set((state) => {
            state.autoRetouchPreset = null;
            state.autoRetouchError = null;
            state.isAutoRetouchComputing = false;
          }),

        pasteMetadata: (photoIds, meta) =>
          set((state) => {
            photoIds.forEach((id) => {
              const photo = state.photos.find((p) => p.id === id);
              if (!photo) return;
              if (!photo.analysis)
                photo.analysis = {} as import('../types').PhotoAnalysis;
              if (meta.rating !== undefined)
                photo.analysis.rating = meta.rating;
              if (meta.isPick !== undefined)
                photo.analysis.isPick = meta.isPick;
              if (meta.isRejected !== undefined)
                photo.analysis.isRejected = meta.isRejected;
              if ('colorLabel' in meta)
                photo.analysis.colorLabel = meta.colorLabel ?? undefined;
            });
          }),

        clearAll: () => {
          set((state) => {
            lshDetector.rebuild([]);
            if (typeof URL !== 'undefined') {
              state.photos.forEach((photo) => {
                // P1-5 : la preview principale du catalogue était oubliée → fuite
                // mémoire sur les gros lots. On la révoque aussi.
                if (photo.previewUrl && photo.previewUrl.startsWith('blob:')) {
                  URL.revokeObjectURL(photo.previewUrl);
                }
                if (
                  photo.retouch?.previewUrl &&
                  photo.retouch.previewUrl.startsWith('blob:')
                ) {
                  URL.revokeObjectURL(photo.retouch.previewUrl);
                }
                if (
                  photo.retouch?.originalPreviewUrl &&
                  photo.retouch.originalPreviewUrl.startsWith('blob:')
                ) {
                  URL.revokeObjectURL(photo.retouch.originalPreviewUrl);
                }
              });
            }

            state.photos = [];
            state.analysisQueue = [];
            state.analyzingPhotoIds.clear();
            state.isProcessing = false;
            state.stopProcessing = false;
            state.processedCount = 0;
            state.activeTab = 'ingestion';
            state.selectedPhotoId = null;
            state.userTags = {};
            state.photoNotes = {};
            state.bestPhotoOverrides = {};
            state.rejectedPhotoIds.clear();
            state.duplicateGroups = [];
            state.undoStack = [];
            state.retouchSessionPhotoIds = [];
            state.retouchActivePhotoId = null;
            state.retouchProcessingIds = new Set();
            state.developmentSelection = new Set();
            state.autoRetouchPreset = null;
            state.autoRetouchError = null;
            state.isAutoRetouchComputing = false;

            // « Effacer tout » supprime aussi les collections (cf. libellé de confirmation).
            const fresh = createDefaultCollectionsState();
            state.collections = fresh.collections;
            state.collectionOrder = fresh.collectionOrder;
            state.activeCollectionId = fresh.activeCollectionId;
            state.activeSmartCollectionId = null;
          });
          // Persiste l'état collections par défaut en localStorage.
          persistCollections();
          // NB : l'effacement IDB (clearFullCatalogue) est délégué à l'appelant, qui doit
          // l'`await` pour n'annoncer le succès qu'après suppression réelle (A-49).
        },

        restoreCatalogueState: (saved: CatalogueState) => {
          // Restauration transactionnelle unique : photos + collections + ordre +
          // collection active + tags + notes + doublons + rejets. N'empile AUCUNE action
          // d'undo (contrairement à un enchaînement d'actions individuelles) et réaligne
          // localStorage sur l'état IDB restauré (source de vérité unique au démarrage).
          set((state) => {
            state.photos = saved.photos;
            // Re-queue uniquement les photos non analysées.
            state.analysisQueue = saved.photos
              .filter((p) => !p.analysis)
              .map((p) => p.id);
            state.duplicateGroups = saved.duplicateGroups ?? [];
            state.userTags = saved.userTags ?? {};
            state.photoNotes = saved.photoNotes ?? {};

            if (
              saved.collections &&
              Object.keys(saved.collections).length > 0
            ) {
              state.collections = saved.collections;
              state.collectionOrder =
                saved.collectionOrder && saved.collectionOrder.length > 0
                  ? saved.collectionOrder
                  : Object.keys(saved.collections);
              const activeValid =
                saved.activeCollectionId &&
                saved.collections[saved.activeCollectionId];
              state.activeCollectionId = activeValid
                ? saved.activeCollectionId
                : state.collectionOrder[0];
            }
            state.activeSmartCollectionId = null;

            state.rejectedPhotoIds = new Set(
              saved.photos
                .filter((p) => p.analysis?.isRejected === true)
                .map((p) => p.id)
            );
            state.processedCount = saved.photos.filter(
              (p) => p.analysis && !p.analysis.error
            ).length;
          });
          persistCollections();
        },
      };
    }),
    {
      name: 'photo-store',
    }
  )
);
