import { describe, it, expect, beforeEach, vi } from 'vitest';

// libraw-wasm a besoin du navigateur : on mocke le décodeur pour contrôler la
// branche « décodage pleine résolution » sans Worker/OffscreenCanvas.
const rawFileToProxyFile = vi.fn();
vi.mock('../../lib/raw/raw-decoder', () => ({
  rawFileToProxyFile: (...args: unknown[]) => rawFileToProxyFile(...args),
  isRawFilename: () => true,
}));

import { exportSourceFor, type ExportOptions } from '../../lib/export-utils';
import {
  setRawOriginal,
  clearRawOriginals,
  hasRawOriginal,
  forgetRawOriginal,
  rawOriginalsCount,
} from '../../lib/raw/raw-originals';
import type { Photo } from '../../types';

const makePhoto = (id: string): Photo => ({
  id,
  file: new File(['proxy-bytes'], `${id}.jpg`, { type: 'image/jpeg' }),
  previewUrl: `${id}.jpg`,
  analysis: {},
});

const rawFile = (name: string) =>
  new File([new Uint8Array([1, 2, 3])], name, { type: 'image/x-sony-arw' });

const opts = (o: Partial<ExportOptions> = {}): ExportOptions => ({
  format: 'original',
  quality: 90,
  ...o,
});

beforeEach(() => {
  clearRawOriginals();
  rawFileToProxyFile.mockReset();
});

describe('raw-originals (registre session)', () => {
  it('set/get/has/forget/clear/count', () => {
    expect(rawOriginalsCount()).toBe(0);
    setRawOriginal('a', rawFile('a.ARW'));
    expect(hasRawOriginal('a')).toBe(true);
    expect(rawOriginalsCount()).toBe(1);
    forgetRawOriginal('a');
    expect(hasRawOriginal('a')).toBe(false);
  });
});

describe('exportSourceFor', () => {
  it('sans original → renvoie le raster courant (proxy), pas pleine qualité', async () => {
    const photo = makePhoto('p1');
    const src = await exportSourceFor(photo, opts({ format: 'jpeg' }));
    expect(src.file).toBe(photo.file);
    expect(src.fullQuality).toBe(false);
    expect(rawFileToProxyFile).not.toHaveBeenCalled();
  });

  it('format original + RAW original dispo → exporte l’OCTET RAW d’origine avec son extension', async () => {
    const photo = makePhoto('p2');
    const original = rawFile('DSC1.ARW');
    setRawOriginal('p2', original);

    const src = await exportSourceFor(photo, opts({ format: 'original' }));
    expect(src.file).toBe(original); // bytes RAW d'origine, tels quels
    expect(src.forcedExt).toBe('arw');
    expect(src.fullQuality).toBe(true);
    expect(rawFileToProxyFile).not.toHaveBeenCalled(); // pas de ré-encodage
  });

  it('format jpeg + RAW original dispo → décodage PLEINE RÉSOLUTION (halfSize=false)', async () => {
    const photo = makePhoto('p3');
    setRawOriginal('p3', rawFile('DSC2.CR2'));
    const fullRaster = new File(['full'], 'DSC2.jpg', { type: 'image/jpeg' });
    rawFileToProxyFile.mockResolvedValue(fullRaster);

    const src = await exportSourceFor(photo, opts({ format: 'jpeg' }));
    expect(rawFileToProxyFile).toHaveBeenCalledWith(
      expect.any(File),
      false, // pleine résolution
      0.97
    );
    expect(src.file).toBe(fullRaster);
    expect(src.fullQuality).toBe(true);
    expect(src.forcedExt).toBeUndefined();
  });

  it('format original + filigrane → rastérise en pleine résolution (pas l’octet brut)', async () => {
    const photo = makePhoto('p4');
    setRawOriginal('p4', rawFile('DSC3.ARW'));
    const fullRaster = new File(['full'], 'DSC3.jpg', { type: 'image/jpeg' });
    rawFileToProxyFile.mockResolvedValue(fullRaster);

    const src = await exportSourceFor(
      photo,
      opts({ format: 'original', watermark: { text: '©', position: 'bottom-right', size: 24, opacity: 80, color: '#fff' } })
    );
    expect(rawFileToProxyFile).toHaveBeenCalled();
    expect(src.file).toBe(fullRaster);
  });

  it('décodage pleine résolution échoue → repli propre sur le proxy', async () => {
    const photo = makePhoto('p5');
    setRawOriginal('p5', rawFile('DSC4.NEF'));
    rawFileToProxyFile.mockResolvedValue(null);

    const src = await exportSourceFor(photo, opts({ format: 'webp' }));
    expect(src.file).toBe(photo.file); // repli proxy
    expect(src.fullQuality).toBe(false);
  });
});
