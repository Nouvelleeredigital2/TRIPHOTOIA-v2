import JSZip from 'jszip';
import { Photo } from '../types';
import { getRawOriginal } from './raw/raw-originals';
import { rawFileToProxyFile } from './raw/raw-decoder';

// ── P1-8 : garde-fou taille d'export ZIP ─────────────────────────────────────
// Le ZIP est construit intégralement en mémoire (JSZip generateAsync). Sur de
// gros volumes, l'onglet peut saturer/planter. On estime le volume et on avertit
// avant de lancer (l'export vers DOSSIER, lui, streame sur disque et n'est pas
// concerné).

export interface ZipExportAssessment {
  totalBytes: number;
  count: number;
  level: 'ok' | 'warn' | 'high';
  message?: string;
}

const GB = 1024 ** 3;

export function assessZipExport(
  photos: { file?: { size?: number } }[]
): ZipExportAssessment {
  const count = photos.length;
  const totalBytes = photos.reduce((s, p) => s + (p.file?.size ?? 0), 0);
  const gb = totalBytes / GB;

  let level: ZipExportAssessment['level'] = 'ok';
  if (totalBytes > 2 * GB || count > 800) level = 'high';
  else if (totalBytes > GB || count > 300) level = 'warn';

  let message: string | undefined;
  if (level !== 'ok') {
    const head = `Export volumineux : ${count} photos, ~${gb.toFixed(1)} Go. Le ZIP est assemblé en mémoire et peut faire planter l'onglet.`;
    message =
      level === 'high'
        ? `${head} Fortement déconseillé dans le navigateur — préférez l'export vers un dossier. Continuer quand même ?`
        : `${head} Continuer ?`;
  }

  return { totalBytes, count, level, message };
}
import {
  buildXmpSidecar,
  hasExportableMetadata,
  metadataSidecarFilename,
} from './metadata';

/**
 * Joint un sidecar `.xmp` (Dublin Core) à côté de l'image exportée si la photo
 * porte des métadonnées éditables. L'export ré-encode via <canvas> et efface
 * l'EXIF/IPTC binaire ; le sidecar préserve titre/légende/mots-clés/copyright.
 */
/**
 * Contenu du sidecar XMP d'une photo (Dublin Core + décisions de tri), ou `null`
 * si rien à exporter. Décisions portables (note + label) → xmp:Rating/xmp:Label,
 * lues par Lightroom/Bridge/Capture One.
 */
function sidecarContentFor(photo: Photo): string | null {
  const editable = photo.metadata?.editable;
  const decisions = {
    rating: photo.analysis?.rating,
    label: photo.analysis?.colorLabel ?? null,
  };
  if (!hasExportableMetadata(editable, decisions)) return null;
  return buildXmpSidecar(editable ?? {}, decisions);
}

function attachMetadataSidecar(
  bucket: JSZip,
  imageFileName: string,
  photo: Photo
): void {
  const content = sidecarContentFor(photo);
  if (content) {
    bucket.file(metadataSidecarFilename(imageFileName), content);
  }
}

// ── Watermark ─────────────────────────────────────────────────────────────────

export type WatermarkPosition =
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'top-left'
  | 'top-center'
  | 'top-right';

export interface WatermarkOptions {
  text: string;
  position: WatermarkPosition;
  /** Font size in pixels (relative to canvas width, clamped). */
  size: number;
  /** 0–100 */
  opacity: number;
  /** CSS color string, e.g. '#ffffff' */
  color: string;
}

// ── Export options ────────────────────────────────────────────────────────────

export interface ExportOptions {
  format: 'original' | 'jpeg' | 'png' | 'webp';
  quality: number;
  maxWidth?: number;
  maxHeight?: number;
  /**
   * Rename pattern — tokens:
   *   {name}   original filename without extension
   *   {index}  1-based index, zero-padded to 4 digits
   *   {date}   today YYYYMMDD
   *   {rating} star rating (0-5)
   *   {label}  color label key or empty string
   */
  renamePattern?: string;
  watermark?: WatermarkOptions;
}

export interface PhotoExportChapter {
  collectionId: string;
  name: string;
  photos: Photo[];
}

// ── Rename helper ─────────────────────────────────────────────────────────────

const todayISO = new Date().toISOString().slice(0, 10).replace(/-/g, '');

/**
 * Expands a rename pattern for a single photo.
 * Falls back to the original name (without extension) when no pattern is given.
 */
function expandPattern(
  pattern: string | undefined,
  photo: Photo,
  index: number
): string {
  const nameWithoutExt = photo.file.name.replace(/\.[^/.]+$/, '');

  if (!pattern || pattern.trim() === '') {
    return nameWithoutExt;
  }

  return (
    pattern
      .replace(/\{name\}/g, nameWithoutExt)
      .replace(/\{index\}/g, String(index + 1).padStart(4, '0'))
      .replace(/\{date\}/g, todayISO)
      .replace(/\{rating\}/g, String(photo.analysis?.rating ?? 0))
      .replace(/\{label\}/g, photo.analysis?.colorLabel ?? '')
      .replace(/\{pick\}/g, photo.analysis?.isPick ? 'pick' : '')
      .replace(/\{session\}/g, 'session')
      // Nettoyer les doubles underscores/tirets issus de tokens vides
      .replace(/[_-]{2,}/g, '_')
      .replace(/^[_-]+|[_-]+$/g, '')
  );
}

/**
 * Generates the final filename for a photo being exported.
 *
 * A-32 : avec un filigrane et le format « original », l'image est ré-encodée en JPEG
 * (cf. processImage) — l'extension doit donc être .jpeg, pas l'extension d'origine.
 */
function getExportFileName(
  photo: Photo,
  options: ExportOptions,
  index: number,
  forcedExt?: string
): string {
  const baseName = expandPattern(options.renamePattern, photo, index);
  // Export de l'octet RAW d'origine → on garde son extension (.arw/.cr2…).
  if (forcedExt) {
    return `${baseName}.${forcedExt}`;
  }
  const watermarkedOriginal =
    options.format === 'original' && !!options.watermark?.text?.trim();
  const ext =
    options.format === 'original'
      ? watermarkedOriginal
        ? 'jpeg'
        : (photo.file.name.split('.').pop() ?? 'jpg')
      : options.format;
  return `${baseName}.${ext}`;
}

/**
 * A-30 : évite les collisions de noms dans un même conteneur (ZIP, dossier de chapitre,
 * répertoire). Si le nom est déjà pris, suffixe « -2 », « -3 », … avant l'extension.
 */
function dedupeFileName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const base = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? '' : name.slice(dot);
  let i = 2;
  let candidate = `${base}-${i}${ext}`;
  while (used.has(candidate)) {
    i += 1;
    candidate = `${base}-${i}${ext}`;
  }
  used.add(candidate);
  return candidate;
}

export interface ExportResult {
  blob: Blob;
  exported: number;
  failed: number;
  failedNames: string[];
}

export interface DirectoryExportResult {
  exported: number;
  failed: number;
  failedNames: string[];
}

function sanitizeZipFolderName(name: string): string {
  const sanitized = name
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitized || 'Chapitre';
}

// ── Watermark draw ────────────────────────────────────────────────────────────

function applyWatermark(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  wm: WatermarkOptions
): void {
  if (!wm.text.trim()) return;

  const { width, height } = canvas;
  const fontSize = Math.max(10, Math.min(wm.size, Math.round(width * 0.08)));
  const margin = Math.round(fontSize * 0.8);

  ctx.save();
  ctx.globalAlpha = wm.opacity / 100;
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = wm.color;
  ctx.textBaseline = 'middle';

  let x: number;
  let y: number;

  const isBottom = wm.position.startsWith('bottom');
  y = isBottom ? height - margin - fontSize / 2 : margin + fontSize / 2;

  if (wm.position.endsWith('left')) {
    x = margin;
    ctx.textAlign = 'left';
  } else if (wm.position.endsWith('right')) {
    x = width - margin;
    ctx.textAlign = 'right';
  } else {
    // center
    x = width / 2;
    ctx.textAlign = 'center';
  }

  // Semi-transparent shadow for readability on any background
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = Math.round(fontSize * 0.4);
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  ctx.fillText(wm.text, x, y);
  ctx.restore();
}

// ── Export RAW pleine qualité ──────────────────────────────────────────────────

export interface ExportSource {
  /** Octets à encoder (original RAW, décodage pleine résolution, ou proxy). */
  file: File;
  /** Extension forcée pour le nom (l'octet RAW d'origine garde son ext, ex. arw). */
  forcedExt?: string;
  /** true si la source est pleine qualité (original ou décodage pleine résolution). */
  fullQuality: boolean;
}

/**
 * Résout la source d'export d'une photo.
 *
 * - Photo RAW dont l'original est encore en session :
 *   - format `original` sans filigrane → on exporte l'OCTET RAW d'origine tel quel
 *     (pleine qualité absolue), avec son extension d'origine.
 *   - sinon (conversion / filigrane) → décodage PLEINE RÉSOLUTION (q0.97) comme
 *     intermédiaire haute qualité, puis `processImage` encode au format demandé.
 * - Sinon (photo non-RAW, ou RAW dont l'original n'est plus en mémoire après un
 *   rechargement) → le raster courant (`photo.file`, = proxy pour un RAW rechargé).
 */
export async function exportSourceFor(
  photo: Photo,
  options: ExportOptions
): Promise<ExportSource> {
  const original = getRawOriginal(photo.id);
  if (!original) {
    return { file: photo.file, fullQuality: false };
  }

  const wantOriginalBytes =
    options.format === 'original' && !options.watermark?.text?.trim();
  if (wantOriginalBytes) {
    const ext = original.name.split('.').pop()?.toLowerCase() ?? 'raw';
    return { file: original, forcedExt: ext, fullQuality: true };
  }

  // Conversion ou filigrane : décodage pleine résolution (pas le proxy demi-taille).
  const fullRaster = await rawFileToProxyFile(original, false, 0.97);
  if (!fullRaster) {
    return { file: photo.file, fullQuality: false };
  }
  return { file: fullRaster, fullQuality: true };
}

// ── Image processing ──────────────────────────────────────────────────────────

/**
 * Converts, resizes, and optionally watermarks an image.
 */
async function processImage(file: File, options: ExportOptions): Promise<Blob> {
  // If format original AND no watermark → return as-is
  if (options.format === 'original' && !options.watermark?.text) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Canvas context not available'));
      return;
    }

    img.onload = () => {
      let { width, height } = img;

      // Resize
      if (options.maxWidth && width > options.maxWidth) {
        height = (height * options.maxWidth) / width;
        width = options.maxWidth;
      }
      if (options.maxHeight && height > options.maxHeight) {
        width = (width * options.maxHeight) / height;
        height = options.maxHeight;
      }

      canvas.width = Math.round(width);
      canvas.height = Math.round(height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Watermark overlay
      if (options.watermark?.text) {
        applyWatermark(ctx, canvas, options.watermark);
      }

      // Output format — when 'original' with watermark we encode as jpeg
      const outputFormat =
        options.format === 'original' ? 'jpeg' : options.format;
      const mimeType = `image/${outputFormat}`;
      const quality = options.quality / 100;

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl); // P1-5 : libérer la Blob URL après encodage
          if (blob) resolve(blob);
          else reject(new Error('Failed to convert image'));
        },
        mimeType,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;
  });
}

// ── ZIP export ────────────────────────────────────────────────────────────────

export async function exportPhotosAsZip(
  photos: Photo[],
  options: ExportOptions,
  onProgress?: (progress: number) => void
): Promise<ExportResult> {
  const zip = new JSZip();
  const total = photos.length;
  const used = new Set<string>();
  const failedNames: string[] = [];
  let exported = 0;

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    let fileName = getExportFileName(photo, options, i);

    try {
      const src = await exportSourceFor(photo, options);
      fileName = dedupeFileName(
        getExportFileName(photo, options, i, src.forcedExt),
        used
      );
      const processedBlob = await processImage(src.file, options);
      zip.file(fileName, processedBlob);
      attachMetadataSidecar(zip, fileName, photo);
      exported += 1;
    } catch (error) {
      console.error(`Failed to process ${fileName}:`, error);
      failedNames.push(photo.file.name);
    }

    if (onProgress) onProgress(Math.round(((i + 1) / total) * 100));
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  return { blob, exported, failed: failedNames.length, failedNames };
}

// ── Directory export (File System Access API) ─────────────────────────────────

export async function exportPhotoChaptersAsZip(
  chapters: PhotoExportChapter[],
  options: ExportOptions,
  onProgress?: (progress: number) => void
): Promise<ExportResult> {
  const zip = new JSZip();
  const total = chapters.reduce(
    (sum, chapter) => sum + chapter.photos.length,
    0
  );
  let processed = 0;
  let exported = 0;
  const failedNames: string[] = [];

  for (let chapterIndex = 0; chapterIndex < chapters.length; chapterIndex++) {
    const chapter = chapters[chapterIndex];
    const folderName = `${String(chapterIndex + 1).padStart(2, '0')}-${sanitizeZipFolderName(chapter.name)}`;
    const folder = zip.folder(folderName);

    if (!folder) {
      continue;
    }

    // Anti-collision par dossier de chapitre (A-30).
    const used = new Set<string>();

    for (let photoIndex = 0; photoIndex < chapter.photos.length; photoIndex++) {
      const photo = chapter.photos[photoIndex];
      let fileName = getExportFileName(photo, options, photoIndex);

      try {
        const src = await exportSourceFor(photo, options);
        fileName = dedupeFileName(
          getExportFileName(photo, options, photoIndex, src.forcedExt),
          used
        );
        const processedBlob = await processImage(src.file, options);
        folder.file(fileName, processedBlob);
        attachMetadataSidecar(folder, fileName, photo);
        exported += 1;
      } catch (error) {
        console.error(`Failed to process ${folderName}/${fileName}:`, error);
        failedNames.push(`${chapter.name}/${photo.file.name}`);
      }

      processed++;
      if (onProgress) {
        onProgress(total === 0 ? 100 : Math.round((processed / total) * 100));
      }
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  return { blob, exported, failed: failedNames.length, failedNames };
}

export function supportsDirectoryExport(): boolean {
  return 'showDirectoryPicker' in window;
}

export async function exportPhotosToDirectory(
  photos: Photo[],
  options: ExportOptions,
  onProgress?: (progress: number) => void
): Promise<DirectoryExportResult> {
  type ShowDirectoryPicker = (opts?: {
    mode?: string;
  }) => Promise<FileSystemDirectoryHandle>;
  const pick = (
    window as unknown as { showDirectoryPicker: ShowDirectoryPicker }
  ).showDirectoryPicker;
  const dirHandle = await pick({ mode: 'readwrite' });

  const total = photos.length;
  const used = new Set<string>();
  const failedNames: string[] = [];
  let exported = 0;

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    let fileName = getExportFileName(photo, options, i);
    try {
      const src = await exportSourceFor(photo, options);
      fileName = dedupeFileName(
        getExportFileName(photo, options, i, src.forcedExt),
        used
      );
      const blob = await processImage(src.file, options);
      const fileHandle = await dirHandle.getFileHandle(fileName, {
        create: true,
      });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();

      // Sidecar XMP (note/label/champs éditables) à côté du fichier exporté.
      const sidecar = sidecarContentFor(photo);
      if (sidecar) {
        const xmpHandle = await dirHandle.getFileHandle(
          metadataSidecarFilename(fileName),
          { create: true }
        );
        const xmpWritable = await xmpHandle.createWritable();
        await xmpWritable.write(sidecar);
        await xmpWritable.close();
      }
      exported += 1;
    } catch (error) {
      console.error(`[export] failed to write ${fileName}:`, error);
      failedNames.push(photo.file.name);
    }
    if (onProgress) onProgress(Math.round(((i + 1) / total) * 100));
  }

  return { exported, failed: failedNames.length, failedNames };
}

// ── Misc helpers ──────────────────────────────────────────────────────────────

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function generateZipFileName(collectionName?: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const baseName = collectionName || 'photos';
  return `${baseName}_${timestamp}.zip`;
}
