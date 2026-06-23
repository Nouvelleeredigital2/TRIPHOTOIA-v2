/**
 * Décodeur RAW (LibRaw compilé en WASM, exécution Web Worker interne).
 *
 * Première brique du support RAW pro (CR2/CR3/NEF/ARW/RAF/RW2/ORF/DNG…). Le
 * navigateur ne sait pas décoder le RAW via `createImageBitmap` : on passe par
 * LibRaw-Wasm qui démosaïque et renvoie des pixels RGB exploitables par le
 * pipeline existant (preview + analyse).
 *
 * Honnêteté : toute erreur de décodage retourne `null` (jamais de pixels
 * fabriqués). Le décodage RAW est lourd (CPU + mémoire) — réservé à un Web
 * Worker, jamais le thread principal.
 */

import LibRaw from 'libraw-wasm';

/** Extensions RAW prises en charge par le décodeur. */
export const RAW_EXTENSIONS = [
  '.raw',
  '.cr2',
  '.cr3',
  '.nef',
  '.nrw',
  '.arw',
  '.sr2',
  '.srf',
  '.dng',
  '.raf',
  '.rw2',
  '.orf',
  '.pef',
  '.srw',
  '.kdc',
  '.dcr',
  '.gpr',
] as const;

const RAW_EXT_SET = new Set<string>(RAW_EXTENSIONS);

/** Vrai si le nom de fichier porte une extension RAW connue. */
export function isRawFilename(name: string): boolean {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return false;
  return RAW_EXT_SET.has(name.slice(dot).toLowerCase());
}

export interface DecodedRaw {
  width: number;
  height: number;
  /** RGBA 8-bit, prêt pour ImageData / OffscreenCanvas. */
  data: Uint8ClampedArray;
}

/**
 * Décode un fichier RAW en pixels RGBA 8-bit.
 *
 * @param file    fichier RAW.
 * @param halfSize décode en demi-résolution (proxy rapide pour preview/analyse).
 * @returns les pixels RGBA, ou `null` si le décodage échoue (format non géré,
 *          fichier corrompu, mémoire insuffisante…). Aucune valeur fabriquée.
 */
export async function decodeRawToRgba(
  file: File,
  halfSize = false
): Promise<DecodedRaw | null> {
  const raw = new LibRaw();
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    await raw.open(buf, {
      outputColor: 1, // sRGB
      outputBps: 8,
      useCameraWb: true,
      halfSize,
      userFlip: -1, // respecte l'orientation enregistrée
    });

    const img = await raw.imageData();
    if (!img || !img.width || !img.height || !img.data) return null;

    return toRgba(img.data, img.width, img.height, img.colors);
  } catch (error) {
    console.warn('[raw-decoder] décodage RAW échoué:', error);
    return null;
  } finally {
    raw.dispose();
  }
}

/**
 * Extrait l'aperçu JPEG embarqué du RAW (instantané, sans démosaïçage) lorsqu'il
 * existe — utile pour une vignette immédiate. Retourne `null` sinon.
 */
export async function extractRawThumbnail(file: File): Promise<Blob | null> {
  const raw = new LibRaw();
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    await raw.open(buf);
    const thumb = await raw.thumbnailData();
    if (!thumb || thumb.format !== 'jpeg' || !thumb.data?.length) return null;
    return new Blob([thumb.data], { type: 'image/jpeg' });
  } catch (error) {
    console.warn('[raw-decoder] extraction vignette RAW échouée:', error);
    return null;
  } finally {
    raw.dispose();
  }
}

/**
 * Décode un RAW et le ré-encode en un fichier JPEG « proxy » raster, utilisable
 * tel quel par tout le pipeline navigateur (preview, worker d'analyse via
 * `createImageBitmap`, pHash, export). Décodé en demi-résolution par défaut
 * (proxy léger ; le worker redimensionne de toute façon à ≤1600px). Retourne
 * `null` si le décodage échoue — l'appelant écarte alors le fichier proprement.
 *
 * L'empreinte/ID de la photo reste calculée sur les octets RAW d'origine par
 * l'ingestion : le proxy ne sert que de représentation raster.
 */
export async function rawFileToProxyFile(
  file: File,
  halfSize = true,
  quality = 0.92
): Promise<File | null> {
  const decoded = await decodeRawToRgba(file, halfSize);
  if (!decoded) return null;

  const { width, height, data } = decoded;
  try {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.putImageData(new ImageData(data, width, height), 0, 0);
    const blob = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality,
    });
    const proxyName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], proxyName, { type: 'image/jpeg' });
  } catch (error) {
    console.warn('[raw-decoder] encodage du proxy JPEG échoué:', error);
    return null;
  }
}

/** Convertit un buffer RGB (ou RGBA) en RGBA 8-bit contigu. */
function toRgba(
  src: Uint8Array | Uint16Array,
  width: number,
  height: number,
  colors: number
): DecodedRaw {
  const pxCount = width * height;
  const out = new Uint8ClampedArray(pxCount * 4);
  // LibRaw outputBps:8 → Uint8 ; on borne défensivement au cas où.
  const to8 = (v: number): number => (v > 255 ? 255 : v < 0 ? 0 : v);

  if (colors >= 3) {
    for (let i = 0; i < pxCount; i++) {
      const s = i * colors;
      const d = i * 4;
      out[d] = to8(src[s]);
      out[d + 1] = to8(src[s + 1]);
      out[d + 2] = to8(src[s + 2]);
      out[d + 3] = 255;
    }
  } else {
    // Image monochrome : réplique le canal sur RGB.
    for (let i = 0; i < pxCount; i++) {
      const g = to8(src[i]);
      const d = i * 4;
      out[d] = g;
      out[d + 1] = g;
      out[d + 2] = g;
      out[d + 3] = 255;
    }
  }

  return { width, height, data: out };
}
