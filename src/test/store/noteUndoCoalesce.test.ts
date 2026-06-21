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

describe('setPhotoNote undo coalescing (A-25)', () => {
  beforeEach(() => usePhotoStore.getState().clearAll());

  it('empile une seule entrée undo pour des frappes successives sur la même photo', () => {
    usePhotoStore.getState().addPhotos([mk('p1')]);
    const s = usePhotoStore.getState();
    s.setPhotoNote('p1', 'a');
    s.setPhotoNote('p1', 'ab');
    s.setPhotoNote('p1', 'abc');

    const noteUndos = usePhotoStore
      .getState()
      .undoStack.filter((u) => u.type === 'SET_NOTE');
    expect(noteUndos).toHaveLength(1);

    // Un seul undo ramène à l'état initial (note absente).
    usePhotoStore.getState().undo();
    expect(usePhotoStore.getState().photoNotes['p1']).toBeUndefined();
  });

  it('sépare les sessions par photo', () => {
    usePhotoStore.getState().addPhotos([mk('p1'), mk('p2')]);
    const s = usePhotoStore.getState();
    s.setPhotoNote('p1', 'x');
    s.setPhotoNote('p2', 'y');
    const noteUndos = usePhotoStore
      .getState()
      .undoStack.filter((u) => u.type === 'SET_NOTE');
    expect(noteUndos).toHaveLength(2);
  });
});
