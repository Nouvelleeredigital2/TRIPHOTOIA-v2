import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePhotoStore } from '../../store/photoStore';
import type { Photo } from '../../types';

global.URL.createObjectURL = vi.fn(() => 'mocked-url');
global.URL.revokeObjectURL = vi.fn();

const mk = (id: string): Photo => ({
  id,
  file: new File([''], `${id}.jpg`, { type: 'image/jpeg' }),
  previewUrl: 'mocked-url',
  analysis: null,
});

describe('movePhotoToCollection (A-09)', () => {
  beforeEach(() => usePhotoStore.getState().clearAll());

  it("retire la photo de la source et l'ajoute à la destination", () => {
    const s = usePhotoStore.getState();
    s.addPhotos([mk('p1')]);
    const a = s.createCollection('A', ['p1']);
    const b = s.createCollection('B');
    usePhotoStore.getState().movePhotoToCollection('p1', a, b);
    const st = usePhotoStore.getState();
    expect(st.collections[a].photoIds).not.toContain('p1');
    expect(st.collections[b].photoIds).toContain('p1');
  });
});

describe('deleteCollection undo (A-08)', () => {
  beforeEach(() => usePhotoStore.getState().clearAll());

  it('restaure la collection supprimée à sa position', () => {
    const s = usePhotoStore.getState();
    const a = s.createCollection('Alpha');
    const b = s.createCollection('Beta');
    const orderBefore = [...usePhotoStore.getState().collectionOrder];

    usePhotoStore.getState().deleteCollection(a);
    expect(usePhotoStore.getState().collections[a]).toBeUndefined();

    usePhotoStore.getState().undo();
    const st = usePhotoStore.getState();
    expect(st.collections[a]).toBeDefined();
    expect(st.collectionOrder).toEqual(orderBefore);
    expect(b).toBeTruthy();
  });
});
