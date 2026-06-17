import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import {
  exportPhotoChaptersAsZip,
  exportPhotosAsZip,
} from '../../lib/export-utils';
import { Photo } from '../../types';

const makePhoto = (id: string, filename: string): Photo => ({
  id,
  file: new File([id], filename, { type: 'image/jpeg' }),
  previewUrl: `${id}.jpg`,
  analysis: {},
});

describe('export-utils', () => {
  it('exports photo chapters as folders in a ZIP file', async () => {
    const { blob } = await exportPhotoChaptersAsZip(
      [
        {
          collectionId: 'prep',
          name: 'Préparatifs',
          photos: [makePhoto('one', 'one.jpg')],
        },
        {
          collectionId: 'client',
          name: 'Client',
          photos: [makePhoto('two', 'two.jpg')],
        },
      ],
      {
        format: 'original',
        quality: 90,
      }
    );

    const zip = await JSZip.loadAsync(blob);

    expect(Object.keys(zip.files).sort()).toEqual([
      '01-Preparatifs/',
      '01-Preparatifs/one.jpg',
      '02-Client/',
      '02-Client/two.jpg',
    ]);
  });

  it('deduplicates colliding file names within a ZIP (A-30)', async () => {
    const { blob, exported, failed } = await exportPhotosAsZip(
      [
        makePhoto('a', 'IMG.jpg'),
        makePhoto('b', 'IMG.jpg'),
        makePhoto('c', 'IMG.jpg'),
      ],
      { format: 'original', quality: 90 }
    );
    const zip = await JSZip.loadAsync(blob);
    expect(Object.keys(zip.files).sort()).toEqual([
      'IMG-2.jpg',
      'IMG-3.jpg',
      'IMG.jpg',
    ]);
    expect(exported).toBe(3);
    expect(failed).toBe(0);
  });

  it('reports per-photo failures instead of a blanket success (A-29)', async () => {
    // Le format original sans watermark renvoie le fichier tel quel → pas d'échec attendu
    // ici ; on vérifie surtout la forme du résultat exploitée par l'UI.
    const result = await exportPhotosAsZip([makePhoto('a', 'one.jpg')], {
      format: 'original',
      quality: 90,
    });
    expect(result).toMatchObject({ exported: 1, failed: 0, failedNames: [] });
    expect(result.blob).toBeInstanceOf(Blob);
  });
});
