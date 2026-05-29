import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { exportPhotoChaptersAsZip } from '../../lib/export-utils';
import { Photo } from '../../types';

const makePhoto = (id: string, filename: string): Photo => ({
  id,
  file: new File([id], filename, { type: 'image/jpeg' }),
  previewUrl: `${id}.jpg`,
  analysis: {},
});

describe('export-utils', () => {
  it('exports photo chapters as folders in a ZIP file', async () => {
    const blob = await exportPhotoChaptersAsZip(
      [
        { collectionId: 'prep', name: 'Préparatifs', photos: [makePhoto('one', 'one.jpg')] },
        { collectionId: 'client', name: 'Client', photos: [makePhoto('two', 'two.jpg')] },
      ],
      {
        format: 'original',
        quality: 90,
      },
    );

    const zip = await JSZip.loadAsync(blob);

    expect(Object.keys(zip.files).sort()).toEqual([
      '01-Preparatifs/',
      '01-Preparatifs/one.jpg',
      '02-Client/',
      '02-Client/two.jpg',
    ]);
  });
});
