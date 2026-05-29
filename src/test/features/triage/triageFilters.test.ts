import { describe, expect, it } from 'vitest';

import {
  buildSavedTriageSearch,
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

  it('searches filename, ai tags, user tags and exif camera fields', () => {
    const named = makePhoto('named', { file: new File([''], 'Laura-party.jpg', { type: 'image/jpeg' }) });
    const aiTagged = makePhoto('ai-tagged', { analysis: { tags: ['ceremony'] } });
    const userTagged = makePhoto('user-tagged');
    const exif = makePhoto('exif', {
      metadata: {
        exif: {
          Model: 'Canon R5',
          LensModel: 'RF 50mm',
          ISOSpeedRatings: 800,
        },
      },
    });

    const ids = (query: string) =>
      filterTriagePhotos({
        photos: [named, aiTagged, userTagged, exif],
        duplicateGroups: [],
        rejectedPhotoIds: new Set(),
        selectedPhotoId: null,
        activeFilter: 'all',
        searchTerm: query,
        sortKey: 'default',
        userTags: { 'user-tagged': ['album'] },
      }).map((photo) => photo.id);

    expect(ids('laura')).toEqual(['named']);
    expect(ids('ceremony')).toEqual(['ai-tagged']);
    expect(ids('album')).toEqual(['user-tagged']);
    expect(ids('canon')).toEqual(['exif']);
    expect(ids('iso 800')).toEqual(['exif']);
  });

  it('can combine advanced date and collection criteria', () => {
    const inCollection = makePhoto('in-collection', {
      lastModified: Date.parse('2026-05-10T10:00:00.000Z'),
    });
    const wrongDate = makePhoto('wrong-date', {
      lastModified: Date.parse('2026-04-10T10:00:00.000Z'),
    });
    const outsideCollection = makePhoto('outside-collection', {
      lastModified: Date.parse('2026-05-11T10:00:00.000Z'),
    });

    const results = filterTriagePhotos({
      photos: [inCollection, wrongDate, outsideCollection],
      duplicateGroups: [],
      rejectedPhotoIds: new Set(),
      selectedPhotoId: null,
      activeFilter: 'all',
      searchTerm: '',
      sortKey: 'default',
      searchCriteria: {
        dateFrom: '2026-05-01',
        dateTo: '2026-05-31',
        collectionPhotoIds: new Set(['in-collection', 'wrong-date']),
      },
    });

    expect(results.map((photo) => photo.id)).toEqual(['in-collection']);
  });

  it('builds a serializable saved search snapshot', () => {
    expect(
      buildSavedTriageSearch({
        id: 'search-1',
        name: 'Picks mai',
        activeFilter: 'picks',
        searchTerm: 'couple',
        sortKey: 'rating-desc',
        criteria: {
          dateFrom: '2026-05-01',
          dateTo: '2026-05-31',
          collectionId: 'collection-client',
        },
        now: '2026-05-28T10:00:00.000Z',
      }),
    ).toEqual({
      id: 'search-1',
      name: 'Picks mai',
      activeFilter: 'picks',
      searchTerm: 'couple',
      sortKey: 'rating-desc',
      criteria: {
        dateFrom: '2026-05-01',
        dateTo: '2026-05-31',
        collectionId: 'collection-client',
      },
      createdAt: '2026-05-28T10:00:00.000Z',
      updatedAt: '2026-05-28T10:00:00.000Z',
    });
  });
});
