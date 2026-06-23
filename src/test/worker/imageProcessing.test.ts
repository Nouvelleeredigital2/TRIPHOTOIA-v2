import { describe, it, expect, beforeAll } from 'vitest';
import { Buffer } from 'node:buffer';
import sharp from 'sharp';
import {
  computePerceptualHash,
  computeQuality,
  generateThumbnailBuffer,
  createSharpImageProcessor,
  createStubImageProcessor,
  createImageProcessor,
} from '../../../worker/imageProcessing';
import type { StorageIO } from '../../../worker/storage';

let solid: Buffer; // image uniforme (gris) → floue, bien exposée
let checker: Buffer; // damier fin → très net
let dark: Buffer; // image sombre → sous-exposée
let gradient: Buffer; // dégradé gauche→droite → dHash structuré

beforeAll(async () => {
  solid = await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
    },
  })
    .png()
    .toBuffer();

  const raw = Buffer.alloc(256 * 256 * 3);
  for (let y = 0; y < 256; y += 1) {
    for (let x = 0; x < 256; x += 1) {
      const v = (x + y) % 2 === 0 ? 0 : 255; // damier 1px → haute fréquence
      const i = (y * 256 + x) * 3;
      raw[i] = v;
      raw[i + 1] = v;
      raw[i + 2] = v;
    }
  }
  checker = await sharp(raw, { raw: { width: 256, height: 256, channels: 3 } })
    .png()
    .toBuffer();

  dark = await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 3,
      background: { r: 10, g: 10, b: 10 },
    },
  })
    .png()
    .toBuffer();

  const grad = Buffer.alloc(256 * 256 * 3);
  for (let y = 0; y < 256; y += 1) {
    for (let x = 0; x < 256; x += 1) {
      const v = x; // 0 (gauche) → 255 (droite)
      const i = (y * 256 + x) * 3;
      grad[i] = v;
      grad[i + 1] = v;
      grad[i + 2] = v;
    }
  }
  gradient = await sharp(grad, {
    raw: { width: 256, height: 256, channels: 3 },
  })
    .png()
    .toBuffer();
});

describe('computeQuality (pixels réels)', () => {
  it('mesure une netteté bien plus élevée sur un damier que sur une image uniforme', async () => {
    const sharpQ = await computeQuality(checker);
    const flatQ = await computeQuality(solid);
    expect(sharpQ.sharpnessScore).toBeGreaterThan(flatQ.sharpnessScore);
    expect(flatQ.isBlurry).toBe(true); // variance ~0 sur une image uniforme
    expect(sharpQ.isBlurry).toBe(false);
  });

  it('note l’exposition haut pour un gris médian, bas pour une image sombre', async () => {
    const mid = await computeQuality(solid);
    const low = await computeQuality(dark);
    expect(mid.exposureScore).toBeGreaterThan(low.exposureScore);
    expect(mid.exposureScore).toBeGreaterThan(80); // gris ~128
  });

  it('borne tous les scores entre 0 et 100', async () => {
    for (const q of [
      await computeQuality(checker),
      await computeQuality(dark),
    ]) {
      for (const v of [q.score, q.sharpnessScore, q.exposureScore]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('computePerceptualHash (sur les pixels)', () => {
  it('est déterministe et renvoie 16 hex', async () => {
    const a = await computePerceptualHash(checker);
    const b = await computePerceptualHash(checker);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it('diffère entre deux images visuellement différentes (uni vs dégradé)', async () => {
    const h1 = await computePerceptualHash(solid);
    const h2 = await computePerceptualHash(gradient);
    expect(h1).not.toBe(h2);
    // le dégradé gauche<droite donne des bits à 1 ; l'uni reste à 0
    expect(h2).not.toBe('0000000000000000');
  });
});

describe('generateThumbnailBuffer', () => {
  it('produit un WebP valide et borné', async () => {
    const thumb = await generateThumbnailBuffer(checker, 64);
    // En-tête RIFF....WEBP
    expect(thumb.slice(0, 4).toString('ascii')).toBe('RIFF');
    expect(thumb.slice(8, 12).toString('ascii')).toBe('WEBP');
    const meta = await sharp(thumb).metadata();
    expect(meta.width).toBeLessThanOrEqual(64);
    expect(meta.format).toBe('webp');
  });
});

describe('ImageProcessor — moteur sharp avec Storage en mémoire', () => {
  it('télécharge, traite les pixels et téléverse une vraie miniature', async () => {
    const store = new Map<string, Buffer>();
    store.set('projects/p/photo.jpg', checker);
    const uploads: Array<{ path: string; type: string; bytes: number }> = [];
    const io: StorageIO = {
      async download(path) {
        const b = store.get(path);
        if (!b) throw new Error('not found');
        return b;
      },
      async upload(path, data, contentType) {
        store.set(path, data);
        uploads.push({ path, type: contentType, bytes: data.length });
      },
    };
    const proc = createSharpImageProcessor(io);

    const thumb = await proc.thumbnail('projects/p/photo.jpg');
    expect(thumb.thumbnailPath).toBe('projects/p/photo_thumb.webp');
    expect(uploads).toHaveLength(1);
    expect(uploads[0].type).toBe('image/webp');
    expect(uploads[0].bytes).toBeGreaterThan(0);
    // la miniature uploadée est un vrai WebP
    expect(
      store.get('projects/p/photo_thumb.webp')!.slice(8, 12).toString('ascii')
    ).toBe('WEBP');

    const hash = await proc.perceptualHash('projects/p/photo.jpg');
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    const q = await proc.quality('projects/p/photo.jpg');
    expect(q.sharpnessScore).toBeGreaterThan(0);
  });

  it('createImageProcessor sélectionne sharp ou stub selon IMAGE_PROCESSOR', () => {
    const io: StorageIO = {
      async download() {
        return Buffer.alloc(0);
      },
      async upload() {},
    };
    expect(
      createImageProcessor({ IMAGE_PROCESSOR: 'sharp' }, () => io).kind
    ).toBe('sharp');
    expect(
      createImageProcessor({ IMAGE_PROCESSOR: 'stub' }, () => io).kind
    ).toBe('stub');
    expect(createImageProcessor({}, () => io).kind).toBe('stub'); // défaut
    expect(() =>
      createImageProcessor({ IMAGE_PROCESSOR: 'bogus' }, () => io)
    ).toThrow();
  });
});

describe('stub processor (comportement dev/test conservé)', () => {
  it('ne télécharge rien et renvoie des valeurs par défaut', async () => {
    const stub = createStubImageProcessor();
    expect(stub.kind).toBe('stub');
    expect((await stub.thumbnail('a/b.jpg')).thumbnailPath).toBe(
      'a/b_thumb.webp'
    );
    expect(await stub.perceptualHash('a/b.jpg')).toMatch(/^[0-9a-f]{16}$/);
    expect((await stub.quality('a/b.jpg')).score).toBe(70);
  });
});
