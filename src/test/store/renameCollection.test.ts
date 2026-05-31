import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePhotoStore } from '../../store/photoStore';

global.URL.createObjectURL = vi.fn(() => 'mocked-url');
global.URL.revokeObjectURL = vi.fn();

describe('renameCollection enforces unique names in the store (A-07)', () => {
  beforeEach(() => usePhotoStore.getState().clearAll());

  it('rejects a rename that clashes with another collection (case-insensitive)', () => {
    const a = usePhotoStore.getState().createCollection('Alpha');
    const b = usePhotoStore.getState().createCollection('Beta');

    const ok = usePhotoStore.getState().renameCollection(b, '  alpha ');
    expect(ok).toBe(false);
    expect(usePhotoStore.getState().collections[b].name).toBe('Beta');
    // 'Alpha' inchangé aussi
    expect(usePhotoStore.getState().collections[a].name).toBe('Alpha');
  });

  it('accepts a unique rename', () => {
    const b = usePhotoStore.getState().createCollection('Beta');
    const ok = usePhotoStore.getState().renameCollection(b, 'Gamma');
    expect(ok).toBe(true);
    expect(usePhotoStore.getState().collections[b].name).toBe('Gamma');
  });

  it('rejects an empty rename', () => {
    const b = usePhotoStore.getState().createCollection('Beta');
    expect(usePhotoStore.getState().renameCollection(b, '   ')).toBe(false);
    expect(usePhotoStore.getState().collections[b].name).toBe('Beta');
  });
});
