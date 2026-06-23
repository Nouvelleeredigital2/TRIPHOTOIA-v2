import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/raw/raw-decoder', () => ({
  rawFileToProxyFile: vi.fn(),
  isRawFilename: () => false,
}));

import { interpretColorSpace, isWideGamut } from '../../lib/color/color-space';
import { exportDropsColorProfile } from '../../lib/export-utils';
import type { ExportOptions } from '../../lib/export-utils';
import type { ColorSpace, Photo } from '../../types';

describe('interpretColorSpace', () => {
  it('priorise le profil ICC', () => {
    expect(interpretColorSpace({ iccProfileName: 'Adobe RGB (1998)' })).toBe(
      'Adobe RGB'
    );
    expect(interpretColorSpace({ iccProfileName: 'Display P3' })).toBe(
      'Display P3'
    );
    expect(interpretColorSpace({ iccProfileName: 'ProPhoto RGB' })).toBe(
      'ProPhoto RGB'
    );
    expect(interpretColorSpace({ iccProfileName: 'sRGB IEC61966-2.1' })).toBe(
      'sRGB'
    );
  });

  it('utilise InteropIndex puis le tag EXIF ColorSpace', () => {
    expect(interpretColorSpace({ interopIndex: 'R03' })).toBe('Adobe RGB');
    expect(interpretColorSpace({ interopIndex: 'R98' })).toBe('sRGB');
    expect(interpretColorSpace({ exifColorSpace: 1 })).toBe('sRGB');
  });

  it('ne devine pas un Uncalibrated sans indice (→ unknown)', () => {
    expect(interpretColorSpace({ exifColorSpace: 0xffff })).toBe('unknown');
    expect(interpretColorSpace({})).toBe('unknown');
  });

  it('le profil ICC prime sur un tag EXIF contradictoire', () => {
    expect(
      interpretColorSpace({
        exifColorSpace: 1,
        iccProfileName: 'Adobe RGB (1998)',
      })
    ).toBe('Adobe RGB');
  });
});

describe('isWideGamut', () => {
  it('classe correctement les espaces larges', () => {
    expect(isWideGamut('Adobe RGB')).toBe(true);
    expect(isWideGamut('Display P3')).toBe(true);
    expect(isWideGamut('ProPhoto RGB')).toBe(true);
    expect(isWideGamut('sRGB')).toBe(false);
    expect(isWideGamut('unknown')).toBe(false);
  });
});

describe('exportDropsColorProfile', () => {
  const photoWith = (cs?: ColorSpace): Photo => ({
    id: 'p',
    file: new File(['x'], 'p.jpg', { type: 'image/jpeg' }),
    previewUrl: 'p.jpg',
    analysis: {},
    metadata: cs ? { colorSpace: cs } : undefined,
  });
  const opt = (o: Partial<ExportOptions> = {}): ExportOptions => ({
    format: 'jpeg',
    quality: 90,
    ...o,
  });

  it('large gamut + conversion → profil perdu', () => {
    expect(
      exportDropsColorProfile(photoWith('Adobe RGB'), opt({ format: 'jpeg' }))
    ).toBe(true);
  });

  it('large gamut + export original sans filigrane → profil préservé', () => {
    expect(
      exportDropsColorProfile(
        photoWith('Display P3'),
        opt({ format: 'original' })
      )
    ).toBe(false);
  });

  it('original + filigrane → ré-encodage → profil perdu', () => {
    expect(
      exportDropsColorProfile(
        photoWith('Adobe RGB'),
        opt({
          format: 'original',
          watermark: {
            text: '©',
            position: 'bottom-right',
            size: 20,
            opacity: 80,
            color: '#fff',
          },
        })
      )
    ).toBe(true);
  });

  it('sRGB ou inconnu → pas de perte signalée', () => {
    expect(
      exportDropsColorProfile(photoWith('sRGB'), opt({ format: 'jpeg' }))
    ).toBe(false);
    expect(
      exportDropsColorProfile(photoWith(undefined), opt({ format: 'jpeg' }))
    ).toBe(false);
  });
});
