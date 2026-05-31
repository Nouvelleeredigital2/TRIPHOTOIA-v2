import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePhotoStore } from '../../store/photoStore';
import type { Photo } from '../../types';
import type { CatalogueState } from '../../lib/catalogue-persistence';

global.URL.createObjectURL = vi.fn(() => 'mocked-url');
global.URL.revokeObjectURL = vi.fn();

const makePhoto = (id: string, overrides: Partial<Photo> = {}): Photo => ({
  id,
  file: new File([''], `${id}.jpg`, { type: 'image/jpeg' }),
  previewUrl: 'mocked-url',
  analysis: null,
  ...overrides,
});

describe('restoreCatalogueState (A-47)', () => {
  beforeEach(() => {
    usePhotoStore.getState().clearAll();
  });

  it('restores photos, collections, order, active collection, tags and notes in one shot', () => {
    const saved: CatalogueState = {
      photos: [makePhoto('p1'), makePhoto('p2', { analysis: { isRejected: true } })],
      collections: {
        'col-a': { id: 'col-a', name: 'Mariage', photoIds: ['p1'], createdAt: 't', updatedAt: 't' },
        'col-b': { id: 'col-b', name: 'Portraits', photoIds: ['p2'], createdAt: 't', updatedAt: 't' },
      },
      collectionOrder: ['col-b', 'col-a'],
      activeCollectionId: 'col-a',
      duplicateGroups: [],
      userTags: { p1: ['plage'] },
      photoNotes: { p1: 'à recadrer' },
    };

    usePhotoStore.getState().restoreCatalogueState(saved);
    const s = usePhotoStore.getState();

    expect(s.photos.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(s.collectionOrder).toEqual(['col-b', 'col-a']);
    expect(s.activeCollectionId).toBe('col-a');
    expect(s.collections['col-a'].name).toBe('Mariage');
    expect(s.userTags.p1).toEqual(['plage']);
    expect(s.photoNotes.p1).toBe('à recadrer');
    // Rejets reconstruits depuis analysis.isRejected
    expect(s.rejectedPhotoIds.has('p2')).toBe(true);
  });

  it('does not pollute the undo stack', () => {
    const saved: CatalogueState = {
      photos: [makePhoto('p1')],
      collections: {},
      collectionOrder: [],
      activeCollectionId: '',
      duplicateGroups: [],
      userTags: {},
      photoNotes: { p1: 'note restaurée' },
    };

    usePhotoStore.getState().restoreCatalogueState(saved);
    expect(usePhotoStore.getState().undoStack).toHaveLength(0);
  });

  it('falls back to a valid active collection when the saved one is missing', () => {
    const saved: CatalogueState = {
      photos: [makePhoto('p1')],
      collections: {
        'col-x': { id: 'col-x', name: 'X', photoIds: [], createdAt: 't', updatedAt: 't' },
      },
      collectionOrder: ['col-x'],
      activeCollectionId: 'does-not-exist',
      duplicateGroups: [],
      userTags: {},
      photoNotes: {},
    };

    usePhotoStore.getState().restoreCatalogueState(saved);
    expect(usePhotoStore.getState().activeCollectionId).toBe('col-x');
  });
});

describe('clearAll resets collections (A-49)', () => {
  it('rebuilds a single default collection', () => {
    usePhotoStore.getState().createCollection('Temporaire');
    expect(Object.keys(usePhotoStore.getState().collections).length).toBeGreaterThan(1);

    usePhotoStore.getState().clearAll();
    const s = usePhotoStore.getState();
    expect(s.collectionOrder).toHaveLength(1);
    expect(s.collections[s.activeCollectionId]).toBeDefined();
    expect(s.photos).toHaveLength(0);
  });
});
