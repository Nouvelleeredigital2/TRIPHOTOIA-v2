import { describe, expect, it } from 'vitest';

import { buildPhotosToExport, ExportSelectionOptions } from '../../../features/export/exportSelection';
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

const select = (
  photos: Photo[],
  options: Partial<ExportSelectionOptions>,
  duplicateGroups: DuplicateGroup[] = [],
  rejectedPhotoIds = new Set<string>(),
) =>
  buildPhotosToExport({
    photos,
    duplicateGroups,
    rejectedPhotoIds,
    options: {
      includeRejected: false,
      includeDuplicates: false,
      filterMode: 'all',
      minRating: 3,
      ...options,
    },
  }).map((photo) => photo.id);

describe('exportSelection', () => {
  it('exports favorites only as five-star picks and excludes rejected photos', () => {
    const favorite = makePhoto('favorite', { analysis: { isPick: true, rating: 5 } });
    const fourStarPick = makePhoto('four-star-pick', { analysis: { isPick: true, rating: 4 } });
    const fiveStarReview = makePhoto('five-star-review', { analysis: { rating: 5 } });
    const rejectedFavorite = makePhoto('rejected-favorite', {
      analysis: { isPick: true, rating: 5, isRejected: true },
    });

    expect(
      select([favorite, fourStarPick, fiveStarReview, rejectedFavorite], {
        filterMode: 'favorites-only',
      }),
    ).toEqual(['favorite']);
  });

  it('exports picks only without including non-picked five-star photos', () => {
    const pick = makePhoto('pick', { analysis: { isPick: true, rating: 2 } });
    const fiveStarReview = makePhoto('five-star-review', { analysis: { rating: 5 } });

    expect(select([pick, fiveStarReview], { filterMode: 'picks-only' })).toEqual(['pick']);
  });

  it('can include rejected photos and duplicate photos when explicitly requested', () => {
    const duplicateA = makePhoto('duplicate-a', { analysis: { isPick: true } });
    const duplicateB = makePhoto('duplicate-b', { analysis: { isPick: true, isRejected: true } });
    const duplicateGroups: DuplicateGroup[] = [
      {
        id: 'group-1',
        hash: 'abc',
        photos: [duplicateA, duplicateB],
        bestPhotoId: duplicateA.id,
      },
    ];

    expect(select([duplicateA, duplicateB], { filterMode: 'picks-only' }, duplicateGroups)).toEqual([]);
    expect(
      select(
        [duplicateA, duplicateB],
        { filterMode: 'picks-only', includeDuplicates: true, includeRejected: true },
        duplicateGroups,
      ),
    ).toEqual(['duplicate-a', 'duplicate-b']);
  });
});
