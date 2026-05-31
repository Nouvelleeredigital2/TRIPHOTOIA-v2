import { describe, expect, it } from 'vitest';

import { buildExportChapters } from '../../../features/export/exportChapters';
import { Photo, PhotoCollection } from '../../../types';

const makePhoto = (id: string, name = `${id}.jpg`, analysis: Photo['analysis'] = {}): Photo => ({
  id,
  file: new File([''], name, { type: 'image/jpeg' }),
  previewUrl: `${id}.jpg`,
  analysis,
});

const makeCollection = (id: string, name: string, photoIds: string[]): PhotoCollection => ({
  id,
  name,
  photoIds,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

describe('exportChapters', () => {
  it('builds non-empty chapters in collection order', () => {
    const photos = [
      makePhoto('prep-1', 'prep.jpg', { isPick: true }),
      makePhoto('couple-1', 'couple.jpg', { isPick: true }),
    ];

    const chapters = buildExportChapters({
      photos,
      collections: {
        empty: makeCollection('empty', 'Vide', []),
        prep: makeCollection('prep', 'Préparatifs', ['prep-1']),
        couple: makeCollection('couple', 'Couple', ['couple-1']),
      },
      collectionOrder: ['empty', 'prep', 'couple'],
      duplicateGroups: [],
      rejectedPhotoIds: new Set(),
      options: {
        includeRejected: false,
        includeDuplicates: true,
        filterMode: 'picks-only',
        minRating: 3,
      },
    });

    expect(chapters.map((chapter) => [chapter.name, chapter.photos.map((photo) => photo.id)])).toEqual([
      ['Préparatifs', ['prep-1']],
      ['Couple', ['couple-1']],
    ]);
  });

  it('applies export filters inside each chapter', () => {
    const keeper = makePhoto('keeper', 'keeper.jpg', { isPick: true });
    const rejected = makePhoto('rejected', 'rejected.jpg', { isPick: true, isRejected: true });

    const chapters = buildExportChapters({
      photos: [keeper, rejected],
      collections: {
        client: makeCollection('client', 'Client', ['keeper', 'rejected']),
      },
      collectionOrder: ['client'],
      duplicateGroups: [],
      rejectedPhotoIds: new Set(['rejected']),
      options: {
        includeRejected: false,
        includeDuplicates: true,
        filterMode: 'picks-only',
        minRating: 3,
      },
    });

    expect(chapters[0].photos.map((photo) => photo.id)).toEqual(['keeper']);
  });
});
