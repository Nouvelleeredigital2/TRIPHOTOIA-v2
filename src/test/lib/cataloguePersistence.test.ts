import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  saveFullCatalogue,
  loadFullCatalogue,
  CatalogueState,
} from '../../lib/catalogue-persistence';
import type { Photo } from '../../types';

// Regression test for the IndexedDB persistence bug: saveFullCatalogue used to
// `await photo.file.arrayBuffer()` (a non-IDB promise) IN THE MIDDLE of an open
// transaction, which let the transaction auto-close → TransactionInactiveError →
// nothing ever persisted (photos vanished on reload). fake-indexeddb enforces the
// same transaction-lifetime semantics as a real browser, so this test would fail
// against the old code.

const makePhoto = (id: string, bytes: number[]): Photo => {
  const file = new File([new Uint8Array(bytes)], `${id}.png`, {
    type: 'image/png',
    lastModified: 1_700_000_000_000,
  });
  return {
    id,
    file,
    previewUrl: `blob:${id}`,
    analysis: { rating: 4, isPick: true } as Photo['analysis'],
  } as Photo;
};

const baseState = (photos: Photo[]): CatalogueState => ({
  photos,
  collections: {},
  collectionOrder: [],
  activeCollectionId: 'collection-default',
  duplicateGroups: [],
  userTags: {},
  photoNotes: {},
});

describe('catalogue persistence (IndexedDB)', () => {
  beforeEach(async () => {
    // Clear any prior catalogue between tests.
    await saveFullCatalogue(baseState([]));
  });

  it('persists photos through an async file read without breaking the transaction', async () => {
    const photos = [makePhoto('a', [1, 2, 3, 4]), makePhoto('b', [5, 6, 7, 8])];

    // Must not throw / swallow a TransactionInactiveError.
    await saveFullCatalogue(baseState(photos));

    const restored = await loadFullCatalogue();
    expect(restored).not.toBeNull();
    expect(restored!.photos.map((p) => p.id).sort()).toEqual(['a', 'b']);
  });

  it('round-trips photo bytes and analysis metadata', async () => {
    await saveFullCatalogue(baseState([makePhoto('x', [10, 20, 30])]));

    const restored = await loadFullCatalogue();
    const photo = restored!.photos.find((p) => p.id === 'x');
    expect(photo).toBeDefined();
    const bytes = new Uint8Array(await photo!.file.arrayBuffer());
    expect([...bytes]).toEqual([10, 20, 30]);
    expect(photo!.analysis?.isPick).toBe(true);
    expect(photo!.analysis?.rating).toBe(4);
  });

  it('replaces the previous catalogue on each save (no stale photos)', async () => {
    await saveFullCatalogue(baseState([makePhoto('old', [1])]));
    await saveFullCatalogue(baseState([makePhoto('new', [2])]));

    const restored = await loadFullCatalogue();
    expect(restored!.photos.map((p) => p.id)).toEqual(['new']);
  });
});
