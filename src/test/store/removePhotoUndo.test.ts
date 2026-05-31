import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePhotoStore } from '../../store/photoStore';
import type { Photo } from '../../types';

global.URL.createObjectURL = vi.fn(() => 'mocked-url');
global.URL.revokeObjectURL = vi.fn();

const makePhoto = (id: string, overrides: Partial<Photo> = {}): Photo => ({
  id,
  file: new File([''], `${id}.jpg`, { type: 'image/jpeg' }),
  previewUrl: 'mocked-url',
  analysis: null,
  ...overrides,
});

describe('removePhoto cleans collections (A-23)', () => {
  beforeEach(() => usePhotoStore.getState().clearAll());

  it('removes the photo id from every collection', () => {
    const store = usePhotoStore.getState();
    store.addPhotos([makePhoto('p1'), makePhoto('p2')]);
    const colId = store.createCollection('Mariage', ['p1', 'p2']);

    usePhotoStore.getState().removePhoto('p1');

    const s = usePhotoStore.getState();
    expect(s.photos.some((p) => p.id === 'p1')).toBe(false);
    expect(s.collections[colId].photoIds).not.toContain('p1');
    expect(s.collections[colId].photoIds).toContain('p2');
    // La collection active (par défaut) ne référence plus p1 non plus.
    Object.values(s.collections).forEach((c) => expect(c.photoIds).not.toContain('p1'));
  });
});

describe('undo restores a deleted photo (A-22)', () => {
  beforeEach(() => usePhotoStore.getState().clearAll());

  it('re-inserts the photo and its collection memberships', () => {
    const store = usePhotoStore.getState();
    store.addPhotos([makePhoto('p1'), makePhoto('p2')]);
    const colId = store.createCollection('Portraits', ['p1']);

    usePhotoStore.getState().removePhoto('p1');
    expect(usePhotoStore.getState().photos.some((p) => p.id === 'p1')).toBe(false);

    usePhotoStore.getState().undo();

    const s = usePhotoStore.getState();
    expect(s.photos.some((p) => p.id === 'p1')).toBe(true);
    expect(s.collections[colId].photoIds).toContain('p1');
  });

  it('restores the rejected state of a deleted photo', () => {
    const store = usePhotoStore.getState();
    store.addPhotos([makePhoto('r1')]);
    store.togglePhotoReject('r1');
    expect(usePhotoStore.getState().rejectedPhotoIds.has('r1')).toBe(true);

    usePhotoStore.getState().removePhoto('r1');
    usePhotoStore.getState().undo();

    expect(usePhotoStore.getState().rejectedPhotoIds.has('r1')).toBe(true);
  });
});
