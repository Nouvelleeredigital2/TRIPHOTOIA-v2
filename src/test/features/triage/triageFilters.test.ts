import { describe, expect, it } from 'vitest';

import {
  filterTriagePhotos,
  isFavoritePhoto,
  isReviewPhoto,
  TriageFilterType,
} from '../../../features/triage/triageFilters';
import { DuplicateGroup, Photo } from '../../../types';

const makePhoto = (id: string, overrides: Partial<Photo> = {}): Photo => {
  const file = new File([''], overrides.file?.name ?? `${id}.jpg`, { type: 'image/jpeg' });

  return {
    id,
    file,
    previewUrl: `${id}.jpg`,
    analysis: {},
    ...overrides,
  };
};

const runFilter = (
  activeFilter: TriageFilterType,
  photos: Photo[],
  duplicateGroups: DuplicateGroup[] = [],
  rejectedPhotoIds = new Set<string>(),
) =>
  filterTriagePhotos({
    photos,
    duplicateGroups,
    rejectedPhotoIds,
    selectedPhotoId: null,
    activeFilter,
    searchTerm: '',
    sortKey: 'default',
  }).map((photo) => photo.id);

describe('triageFilters', () => {
  it('keeps AutoFlow review photos separate from picks and rejects', () => {
    const review = makePhoto('review');
    const pick = makePhoto('pick', { analysis: { isPick: true } });
    const reject = makePhoto('reject', { analysis: { isRejected: true } });
    const externalReject = makePhoto('external-reject');

    expect(isReviewPhoto(review, new Set())).toBe(true);
    expect(isReviewPhoto(pick, new Set())).toBe(false);
    expect(isReviewPhoto(reject, new Set())).toBe(false);
    expect(isReviewPhoto(externalReject, new Set(['external-reject']))).toBe(false);
    expect(runFilter('review', [review, pick, reject, externalReject], [], new Set(['external-reject']))).toEqual([
      'review',
    ]);
  });

  it('treats five-star picks as favorites', () => {
    const favorite = makePhoto('favorite', { analysis: { isPick: true, rating: 5 } });
    const fourStarPick = makePhoto('four-star-pick', { analysis: { isPick: true, rating: 4 } });
    const fiveStarReview = makePhoto('five-star-review', { analysis: { rating: 5 } });

    expect(isFavoritePhoto(favorite)).toBe(true);
    expect(isFavoritePhoto(fourStarPick)).toBe(false);
    expect(isFavoritePhoto(fiveStarReview)).toBe(false);
    expect(runFilter('favorites', [favorite, fourStarPick, fiveStarReview])).toEqual(['favorite']);
  });

  it('preserves duplicate filtering while adding Studio Grid filters', () => {
    const duplicateA = makePhoto('duplicate-a');
    const duplicateB = makePhoto('duplicate-b');
    const standalone = makePhoto('standalone');
    const duplicateGroups: DuplicateGroup[] = [
      {
        id: 'group-1',
        hash: 'abc',
        photos: [duplicateA, duplicateB],
        bestPhotoId: duplicateA.id,
      },
    ];

    expect(runFilter('duplicates', [duplicateA, duplicateB, standalone], duplicateGroups)).toEqual([
      'duplicate-a',
      'duplicate-b',
    ]);
  });
});
