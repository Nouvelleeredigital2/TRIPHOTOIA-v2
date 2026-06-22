import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock libraw-wasm : on contrôle ce que renvoie le décodeur sans vrai WASM.
const openMock = vi.fn();
const imageDataMock = vi.fn();
const thumbnailDataMock = vi.fn();
const disposeMock = vi.fn();

vi.mock('libraw-wasm', () => ({
  default: class {
    open = openMock;
    imageData = imageDataMock;
    thumbnailData = thumbnailDataMock;
    dispose = disposeMock;
  },
}));

import {
  decodeRawToRgba,
  extractRawThumbnail,
  isRawFilename,
  RAW_EXTENSIONS,
} from '../../lib/raw/raw-decoder';

const rawFile = (name: string): File =>
  new File([new Uint8Array([1, 2, 3, 4])], name);

beforeEach(() => {
  openMock.mockReset().mockResolvedValue(undefined);
  imageDataMock.mockReset();
  thumbnailDataMock.mockReset();
  disposeMock.mockReset();
});

describe('isRawFilename', () => {
  it('reconnaît les extensions RAW (insensible à la casse)', () => {
    expect(isRawFilename('photo.CR2')).toBe(true);
    expect(isRawFilename('img.nef')).toBe(true);
    expect(isRawFilename('shot.ARW')).toBe(true);
    expect(isRawFilename('file.dng')).toBe(true);
  });

  it('rejette les formats non-RAW et les noms sans extension', () => {
    expect(isRawFilename('photo.jpg')).toBe(false);
    expect(isRawFilename('image.png')).toBe(false);
    expect(isRawFilename('noext')).toBe(false);
  });

  it('couvre les formats constructeurs majeurs', () => {
    for (const ext of ['.cr2', '.cr3', '.nef', '.arw', '.raf', '.rw2', '.orf', '.dng']) {
      expect(RAW_EXTENSIONS).toContain(ext);
    }
  });
});

describe('decodeRawToRgba', () => {
  it('décode du RGB en RGBA 8-bit (alpha opaque)', async () => {
    // 2 pixels RGB : rouge, vert.
    imageDataMock.mockResolvedValue({
      width: 2,
      height: 1,
      colors: 3,
      bits: 8,
      data: new Uint8Array([255, 0, 0, 0, 255, 0]),
    });

    const res = await decodeRawToRgba(rawFile('x.arw'));
    expect(res).not.toBeNull();
    expect(res!.width).toBe(2);
    expect(Array.from(res!.data)).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
    expect(disposeMock).toHaveBeenCalled();
  });

  it('réplique le canal pour une image monochrome (colors=1)', async () => {
    imageDataMock.mockResolvedValue({
      width: 1,
      height: 1,
      colors: 1,
      bits: 8,
      data: new Uint8Array([128]),
    });
    const res = await decodeRawToRgba(rawFile('x.dng'));
    expect(Array.from(res!.data)).toEqual([128, 128, 128, 255]);
  });

  it('retourne null si open échoue (aucun pixel fabriqué)', async () => {
    openMock.mockRejectedValue(new Error('format inconnu'));
    const res = await decodeRawToRgba(rawFile('x.cr2'));
    expect(res).toBeNull();
    expect(disposeMock).toHaveBeenCalled(); // ressources libérées
  });

  it('retourne null si imageData est vide', async () => {
    imageDataMock.mockResolvedValue(undefined);
    expect(await decodeRawToRgba(rawFile('x.nef'))).toBeNull();
  });
});

describe('extractRawThumbnail', () => {
  it('renvoie un Blob JPEG quand une vignette JPEG embarquée existe', async () => {
    thumbnailDataMock.mockResolvedValue({
      format: 'jpeg',
      width: 160,
      height: 120,
      data: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    });
    const blob = await extractRawThumbnail(rawFile('x.cr3'));
    expect(blob).toBeInstanceOf(Blob);
    expect(blob!.type).toBe('image/jpeg');
  });

  it('retourne null si la vignette n’est pas un JPEG', async () => {
    thumbnailDataMock.mockResolvedValue({
      format: 'bitmap',
      width: 1,
      height: 1,
      data: new Uint8Array([0]),
    });
    expect(await extractRawThumbnail(rawFile('x.orf'))).toBeNull();
  });
});
