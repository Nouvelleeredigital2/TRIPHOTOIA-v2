import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePhotoStore } from '../../store/photoStore';
import {
  applyAutoFlowMutation,
  type AfPhoto,
} from '../../components/autoflow/afUtils';
import { buildPhotosToExport } from '../../features/export/exportSelection';
import type { Photo } from '../../types';

global.URL.createObjectURL = vi.fn(() => 'mocked-url');
global.URL.revokeObjectURL = vi.fn();

// Decision change-objects exactly as emitted by AutoFlowMode.handleSwipeDecision
// (CLAUDE.md "AutoFlow V1 Contract" — Decision mapping).
const DECISION_CHANGES: Record<
  'pick' | 'reject' | 'favorite',
  Partial<AfPhoto>
> = {
  pick: { isPick: true, isRejected: false, isFavorite: false, cls: 'keep' },
  reject: { isRejected: true, isPick: false, isFavorite: false, cls: 'reject' },
  favorite: {
    rating: 5,
    isPick: true,
    isRejected: false,
    isFavorite: true,
    cls: 'keep',
  },
};

const makePhoto = (id: string): Photo => ({
  id,
  file: new File([''], `${id}.jpg`, { type: 'image/jpeg' }),
  previewUrl: 'mocked-url',
  // Analyzed photo with no decision yet (review state).
  analysis: { rating: 0, isPick: false, isRejected: false },
});

const seedThreePhotos = () => {
  usePhotoStore
    .getState()
    .addPhotos([
      makePhoto('p-pick'),
      makePhoto('p-reject'),
      makePhoto('p-fav'),
    ]);
  applyAutoFlowMutation('p-pick', DECISION_CHANGES.pick, usePhotoStore);
  applyAutoFlowMutation('p-reject', DECISION_CHANGES.reject, usePhotoStore);
  applyAutoFlowMutation('p-fav', DECISION_CHANGES.favorite, usePhotoStore);
};

describe('Local AutoFlow → Export handoff (no cloud project)', () => {
  beforeEach(() => usePhotoStore.getState().clearAll());

  it('persists AutoFlow decisions to the local store per the V1 contract', () => {
    seedThreePhotos();

    const byId = (id: string) =>
      usePhotoStore.getState().photos.find((p) => p.id === id)!.analysis!;

    expect(byId('p-pick')).toMatchObject({ isPick: true, isRejected: false });
    expect(byId('p-reject')).toMatchObject({ isPick: false, isRejected: true });
    expect(byId('p-fav')).toMatchObject({
      isPick: true,
      isRejected: false,
      rating: 5,
    });
    // reject decision must also register in the store's rejected set.
    expect(usePhotoStore.getState().rejectedPhotoIds.has('p-reject')).toBe(
      true
    );
  });

  it('hands off to Export with picks-only filter selecting exactly the picked photos', () => {
    seedThreePhotos();

    // Export-from-AutoFlow handoff: the active tab switch carries this filter mode.
    usePhotoStore.getState().setPendingExportFilterMode('picks-only');
    expect(usePhotoStore.getState().pendingExportFilterMode).toBe('picks-only');

    const s = usePhotoStore.getState();
    const exported = buildPhotosToExport({
      photos: s.photos,
      duplicateGroups: s.duplicateGroups,
      rejectedPhotoIds: s.rejectedPhotoIds,
      options: {
        includeRejected: false,
        includeDuplicates: false,
        filterMode: s.pendingExportFilterMode ?? 'all',
        minRating: 3,
      },
    }).map((p) => p.id);

    expect(exported.sort()).toEqual(['p-fav', 'p-pick']);
  });

  it('recovers a rejected photo when picked or favorited (no stale-snapshot regression)', () => {
    usePhotoStore.getState().addPhotos([makePhoto('p-a'), makePhoto('p-b')]);
    // Put both photos into the rejected state first.
    applyAutoFlowMutation('p-a', DECISION_CHANGES.reject, usePhotoStore);
    applyAutoFlowMutation('p-b', DECISION_CHANGES.reject, usePhotoStore);

    // Now change the decision: pick p-a, favorite p-b — both currently rejected.
    applyAutoFlowMutation('p-a', DECISION_CHANGES.pick, usePhotoStore);
    applyAutoFlowMutation('p-b', DECISION_CHANGES.favorite, usePhotoStore);

    const byId = (id: string) =>
      usePhotoStore.getState().photos.find((p) => p.id === id)!.analysis!;

    // The decision must win — the prior reject must be fully cleared.
    expect(byId('p-a')).toMatchObject({ isPick: true, isRejected: false });
    expect(byId('p-b')).toMatchObject({
      isPick: true,
      isRejected: false,
      rating: 5,
    });
    expect(usePhotoStore.getState().rejectedPhotoIds.has('p-a')).toBe(false);
    expect(usePhotoStore.getState().rejectedPhotoIds.has('p-b')).toBe(false);
  });

  it('keeps decisions idempotent when the same decision is applied twice', () => {
    seedThreePhotos();
    // Re-applying the identical pick decision must not flip the flag back off.
    applyAutoFlowMutation('p-pick', DECISION_CHANGES.pick, usePhotoStore);

    const pick = usePhotoStore
      .getState()
      .photos.find((p) => p.id === 'p-pick')!.analysis!;
    expect(pick).toMatchObject({ isPick: true, isRejected: false });
  });
});
