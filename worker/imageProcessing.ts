// P0-5 (fond) : moteur de traitement image RÉEL du worker cloud (sharp/libvips).
//
// Remplace les stubs (miniature = chemin sans image, qualité = score par défaut,
// hash perceptuel dérivé du nom) par un vrai traitement des pixels :
//   - generate_thumbnail : télécharge l'objet, redimensionne, ré-encode WebP, upload
//   - perceptual_hash    : dHash 64 bits calculé sur les pixels (gris 9×8)
//   - quality_analysis   : netteté (variance Laplacienne) + exposition (luminance)
//
// Les fonctions de calcul sont PURES (Buffer → résultat) donc testables sans
// réseau. L'I/O Storage est isolé derrière `StorageIO`.

import { Buffer } from 'node:buffer';
import type { StorageIO } from './storage';

// Import paresseux de sharp (binaire natif lourd) : seul le moteur réel le charge.
const loadSharp = async () => (await import('sharp')).default;

export interface QualityResult {
  score: number; // 0-100 global
  sharpnessScore: number; // 0-100
  exposureScore: number; // 0-100
  isBlurry: boolean;
}

/** Redimensionne et ré-encode en WebP (proxy/miniature). */
export async function generateThumbnailBuffer(
  input: Buffer,
  maxDim = 512
): Promise<Buffer> {
  const sharp = await loadSharp();
  return sharp(input)
    .rotate() // respecte l'orientation EXIF
    .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
}

/**
 * dHash perceptuel 64 bits calculé sur les PIXELS : gris 9×8, comparaison
 * horizontale gauche/droite → 64 bits → 16 hex. Deux images visuellement proches
 * produisent des hashes proches (distance de Hamming faible), contrairement à un
 * hash dérivé du nom de fichier.
 */
export async function computePerceptualHash(input: Buffer): Promise<string> {
  const sharp = await loadSharp();
  const { data } = await sharp(input)
    .grayscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let bits = '';
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const left = data[row * 9 + col];
      const right = data[row * 9 + col + 1];
      bits += left < right ? '1' : '0';
    }
  }
  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

const clamp = (n: number, lo: number, hi: number) =>
  n < lo ? lo : n > hi ? hi : n;

/**
 * Qualité calculée sur les pixels : netteté = variance du Laplacien (plus c'est
 * élevé, plus c'est net), exposition = écart de la luminance moyenne au gris
 * médian. Image bornée à 1024px pour un coût stable.
 */
export async function computeQuality(input: Buffer): Promise<QualityResult> {
  const sharp = await loadSharp();
  const { data, info } = await sharp(input)
    .grayscale()
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;

  // Exposition : luminance moyenne (0-255), idéal autour de 128.
  let sum = 0;
  for (let i = 0; i < data.length; i += 1) sum += data[i];
  const mean = sum / data.length;
  const exposureScore = clamp(100 - (Math.abs(mean - 128) / 128) * 100, 0, 100);

  // Netteté : variance de la réponse Laplacienne.
  let lapSum = 0;
  let lapSumSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const lap =
        4 * data[i] - data[i - 1] - data[i + 1] - data[i - width] - data[i + width];
      lapSum += lap;
      lapSumSq += lap * lap;
      count += 1;
    }
  }
  const lapMean = count > 0 ? lapSum / count : 0;
  const variance = count > 0 ? lapSumSq / count - lapMean * lapMean : 0;
  const sharpnessScore = clamp((variance / 1000) * 100, 0, 100);
  const isBlurry = variance < 100;
  const score = Math.round(sharpnessScore * 0.6 + exposureScore * 0.4);

  return {
    score,
    sharpnessScore: Math.round(sharpnessScore),
    exposureScore: Math.round(exposureScore),
    isBlurry,
  };
}

// ---------- Abstraction ImageProcessor (réel vs stub) ----------

export interface ThumbnailOutcome {
  thumbnailPath: string;
}

export interface ImageProcessor {
  readonly kind: 'sharp' | 'stub';
  /** Génère et téléverse la miniature, renvoie son chemin. */
  thumbnail(storagePath: string): Promise<ThumbnailOutcome>;
  perceptualHash(storagePath: string): Promise<string>;
  quality(storagePath: string): Promise<QualityResult>;
}

const thumbPath = (storagePath: string): string =>
  `${storagePath.replace(/\.[^/.]+$/, '')}_thumb.webp`;

/**
 * Moteur réel : télécharge l'objet, traite les pixels, téléverse la miniature.
 * Un job ne peut donc être `completed` que si l'artefact existe réellement.
 */
export function createSharpImageProcessor(io: StorageIO): ImageProcessor {
  return {
    kind: 'sharp',
    async thumbnail(storagePath) {
      const src = await io.download(storagePath);
      const thumb = await generateThumbnailBuffer(src);
      const path = thumbPath(storagePath);
      await io.upload(path, thumb, 'image/webp');
      return { thumbnailPath: path };
    },
    async perceptualHash(storagePath) {
      const src = await io.download(storagePath);
      return computePerceptualHash(src);
    },
    async quality(storagePath) {
      const src = await io.download(storagePath);
      return computeQuality(src);
    },
  };
}

/**
 * Stub : conserve l'ancien comportement (dev/test uniquement). Interdit en
 * production par `assertProvidersAllowed` (IMAGE_PROCESSOR=stub).
 */
export function createStubImageProcessor(): ImageProcessor {
  const stableHash = (s: string): string => {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0').repeat(2).slice(0, 16);
  };
  return {
    kind: 'stub',
    async thumbnail(storagePath) {
      return { thumbnailPath: thumbPath(storagePath) };
    },
    async perceptualHash(storagePath) {
      return stableHash(storagePath || 'unknown');
    },
    async quality() {
      return { score: 70, sharpnessScore: 70, exposureScore: 70, isBlurry: false };
    },
  };
}

type ImageEnv = Record<string, string | undefined>;

/**
 * Sélectionne le moteur image selon `IMAGE_PROCESSOR` (sharp | stub). `sharp`
 * nécessite l'I/O Storage ; on l'injecte via `makeStorage` (paresseux).
 */
export function createImageProcessor(
  env: ImageEnv,
  makeStorage: (env: ImageEnv) => StorageIO
): ImageProcessor {
  const kind = (env.IMAGE_PROCESSOR ?? 'stub').trim().toLowerCase();
  switch (kind) {
    case 'sharp':
      return createSharpImageProcessor(makeStorage(env));
    case 'stub':
      return createStubImageProcessor();
    default:
      throw new Error(
        `IMAGE_PROCESSOR "${kind}" inconnu. Supportés : sharp, stub.`
      );
  }
}
