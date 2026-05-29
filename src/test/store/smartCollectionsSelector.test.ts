import { describe, expect, it } from 'vitest';
import { DuplicateGroup, Photo } from '../../types';
import {
  SMART_COLLECTIONS,
  matchesRule,
  resolveSmartCollections,
} from '../../store/smartCollectionsSelector';

const makePhoto = (id: string, overrides: Partial<Photo> = {}): Photo => ({
  id,
  file: new File([''], `${id}.jpg`, { type: 'image/jpeg' }),
  previewUrl: `${id}.jpg`,
  analysis: {},
  ...overrides,
});

const collectionIds = (id: string, photos: Photo[], duplicateGroups: DuplicateGroup[] = [], rejectedPhotoIds = new Set<string>()) =>
  resolveSmartCollections(photos, duplicateGroups, rejectedPhotoIds)
    .find((collection) => collection.id === id)
    ?.photoIds ?? [];

describe('smartCollectionsSelector', () => {
  it('defines the system smart collections required by Sprint 13', () => {
    expect(SMART_COLLECTIONS.slice(0, 9).map((collection) => collection.id)).toEqual([
      'sc-all',
      'sc-unreviewed',
      'sc-review',
      'sc-picks',
      'sc-favorites',
      'sc-rejected',
      'sc-duplicates',
      'sc-blurry',
      'sc-ready-export',
    ]);
  });

  it('keeps system collections updated from photo decisions and analysis', () => {
    const unreviewed = makePhoto('unreviewed', { analysis: null });
    const review = makePhoto('review');
    const pick = makePhoto('pick', { analysis: { isPick: true, rating: 3 } });
    const favorite = makePhoto('favorite', { analysis: { isPick: true, rating: 5 } });
    const rejected = makePhoto('rejected', { analysis: { isRejected: true } });
    const externalReject = makePhoto('external-reject');
    const blurry = makePhoto('blurry', { analysis: { isPick: true, isBlurry: true } });
    const duplicateA = makePhoto('duplicate-a', { analysis: { isPick: true, rating: 5 } });
    const duplicateB = makePhoto('duplicate-b', { analysis: { isPick: true } });
    const photos = [unreviewed, review, pick, favorite, rejected, externalReject, blurry, duplicateA, duplicateB];
    const duplicateGroups: DuplicateGroup[] = [
      {
        id: 'dup-1',
        hash: 'hash',
        photos: [duplicateA, duplicateB],
        bestPhotoId: duplicateA.id,
      },
    ];

    expect(collectionIds('sc-all', photos, duplicateGroups)).toEqual(photos.map((photo) => photo.id));
    expect(collectionIds('sc-unreviewed', photos, duplicateGroups)).toEqual(['unreviewed']);
    expect(collectionIds('sc-review', photos, duplicateGroups, new Set(['external-reject']))).toEqual(['review']);
    expect(collectionIds('sc-picks', photos, duplicateGroups)).toEqual(['pick', 'favorite', 'blurry', 'duplicate-a', 'duplicate-b']);
    expect(collectionIds('sc-favorites', photos, duplicateGroups)).toEqual(['favorite', 'duplicate-a']);
    expect(collectionIds('sc-rejected', photos, duplicateGroups, new Set(['external-reject']))).toEqual(['rejected', 'external-reject']);
    expect(collectionIds('sc-duplicates', photos, duplicateGroups)).toEqual(['duplicate-a', 'duplicate-b']);
    expect(collectionIds('sc-blurry', photos, duplicateGroups)).toEqual(['blurry']);
    expect(collectionIds('sc-ready-export', photos, duplicateGroups)).toEqual(['pick', 'favorite']);
  });

  it('matches duplicate and export-ready rules with duplicate context', () => {
    const duplicate = makePhoto('duplicate', { analysis: { isPick: true, rating: 5 } });
    const standalone = makePhoto('standalone', { analysis: { isPick: true, rating: 5 } });
    const duplicateGroups: DuplicateGroup[] = [
      {
        id: 'dup',
        hash: 'hash',
        photos: [duplicate],
        bestPhotoId: duplicate.id,
      },
    ];

    expect(matchesRule(duplicate, { type: 'isDuplicate' }, { duplicateGroups })).toBe(true);
    expect(matchesRule(standalone, { type: 'isDuplicate' }, { duplicateGroups })).toBe(false);
    expect(matchesRule(duplicate, { type: 'readyToExport' }, { duplicateGroups })).toBe(false);
    expect(matchesRule(standalone, { type: 'readyToExport' }, { duplicateGroups })).toBe(true);
  });
});
