// P1-A : politique d'import centralisée et robuste.
//
// Utilisée par toutes les entrées de fichiers (Studio Grid `FileUpload` et
// AutoFlow `AutoFlowImportScreen`, via le puits commun `handleFilesSelected`).
// On n'accepte pas « tout `image/*` » : chaque fichier doit passer extension +
// taille + signature réelle (magic bytes). Les RAW sont désormais acceptés
// (décodés via LibRaw-Wasm en proxy raster à l'ingestion) avec une limite de
// taille dédiée et une vérification de signature RAW. La fonction retourne la
// liste détaillée des fichiers refusés avec leur motif.

/** Taille maximale par fichier image standard (octets). */
export const MAX_IMPORT_FILE_BYTES = 50 * 1024 * 1024; // 50 Mo

/** Taille maximale par fichier RAW (octets) — les RAW haute résolution sont lourds. */
export const MAX_RAW_IMPORT_FILE_BYTES = 200 * 1024 * 1024; // 200 Mo

/** Nombre maximal de fichiers acceptés par lot d'import. */
export const MAX_IMPORT_BATCH = 2000;

/** Extensions réellement décodables par le pipeline navigateur (Canvas). */
export const ALLOWED_IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.bmp',
  '.webp',
  '.avif',
] as const;

/** Types MIME correspondants (pour l'attribut `accept` des inputs). */
export const ALLOWED_IMAGE_MIME = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/bmp',
  'image/webp',
  'image/avif',
] as const;

/**
 * Extensions RAW acceptées à l'import (décodées via LibRaw-Wasm en proxy raster
 * à l'ingestion). Le décodeur (`src/lib/raw/raw-decoder.ts`) en gère davantage ;
 * cette liste est la surface validée par la politique d'import.
 */
export const RAW_IMPORT_EXTENSIONS = [
  '.raw',
  '.cr2',
  '.cr3',
  '.nef',
  '.nrw',
  '.dng',
  '.arw',
  '.sr2',
  '.srf',
  '.raf',
  '.rw2',
  '.orf',
  '.pef',
  '.srw',
  '.dcr',
  '.kdc',
  '.gpr',
] as const;

export interface RejectedFile {
  file: File;
  reason: string;
}

export interface ImportValidationResult {
  accepted: File[];
  rejected: RejectedFile[];
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

/**
 * Détecte une signature d'image réelle à partir des premiers octets. Retourne le
 * format détecté ou `null` si aucune signature image reconnue (ex. MIME falsifié,
 * binaire arbitraire renommé). Authoritative : ne dépend pas du `type` MIME ni de
 * l'extension, qui peuvent mentir.
 */
export async function detectImageSignature(file: File): Promise<string | null> {
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const at = (i: number) => header[i];
  const ascii = (start: number, len: number) =>
    String.fromCharCode(...Array.from(header.slice(start, start + len)));

  // JPEG : FF D8 FF
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'jpeg';
  // PNG : 89 50 4E 47 0D 0A 1A 0A
  if (
    at(0) === 0x89 &&
    at(1) === 0x50 &&
    at(2) === 0x4e &&
    at(3) === 0x47 &&
    at(4) === 0x0d &&
    at(5) === 0x0a &&
    at(6) === 0x1a &&
    at(7) === 0x0a
  ) {
    return 'png';
  }
  // GIF : "GIF87a" / "GIF89a"
  if (ascii(0, 4) === 'GIF8') return 'gif';
  // BMP : "BM"
  if (at(0) === 0x42 && at(1) === 0x4d) return 'bmp';
  // WebP : "RIFF"????"WEBP"
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'webp';
  // AVIF / HEIF-AVIF : box "ftyp" + marque "avif"/"avis"
  if (ascii(4, 4) === 'ftyp') {
    const brand = ascii(8, 4);
    if (brand === 'avif' || brand === 'avis') return 'avif';
  }
  return null;
}

/**
 * Détecte une signature RAW plausible (magic bytes) couvrant les grandes
 * familles : TIFF little/big-endian (CR2/NEF/ARW/DNG/ORF/SR2/PEF/SRW/DCR/GPR),
 * Panasonic RW2 ("IIU\0"), Fujifilm RAF ("FUJIFILM"), Canon CR3 (BMFF "ftyp"+
 * "crx"). Couplée au contrôle d'extension, c'est un filtre suffisant à l'entrée :
 * LibRaw tranche ensuite de façon autoritaire au décodage (un faux RAW échoue
 * proprement et la photo est écartée).
 */
export async function detectRawSignature(file: File): Promise<boolean> {
  const h = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = (start: number, len: number) =>
    String.fromCharCode(...Array.from(h.slice(start, start + len)));

  // TIFF little-endian : "II" 0x2A 0x00 ; Panasonic RW2 : "II" 0x55 0x00.
  if (h[0] === 0x49 && h[1] === 0x49 && (h[2] === 0x2a || h[2] === 0x55)) {
    return true;
  }
  // TIFF big-endian : "MM" 0x00 0x2A ; Olympus ORF : "MMOR".
  if (h[0] === 0x4d && h[1] === 0x4d) return true;
  // Fujifilm RAF.
  if (ascii(0, 8) === 'FUJIFILM') return true;
  // Canon CR3 (ISO BMFF) : box "ftyp" + marque "crx".
  if (ascii(4, 4) === 'ftyp' && ascii(8, 3) === 'crx') return true;
  return false;
}

/**
 * Valide un lot de fichiers selon la politique d'import unique.
 * Vérifie : nombre max par lot, extension autorisée, refus RAW explicite,
 * taille max, et signature réelle (magic bytes — bloque un MIME falsifié).
 */
export async function validateImportFiles(
  files: File[]
): Promise<ImportValidationResult> {
  const accepted: File[] = [];
  const rejected: RejectedFile[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    if (accepted.length >= MAX_IMPORT_BATCH) {
      rejected.push({
        file,
        reason: `Lot limité à ${MAX_IMPORT_BATCH} fichiers`,
      });
      continue;
    }

    const ext = extensionOf(file.name);

    // Branche RAW : extension RAW connue → vérif taille (limite dédiée) +
    // signature RAW. Accepté pour décodage proxy à l'ingestion ; non décodé ici.
    if ((RAW_IMPORT_EXTENSIONS as readonly string[]).includes(ext)) {
      if (file.size === 0) {
        rejected.push({ file, reason: 'Fichier vide' });
        continue;
      }
      if (file.size > MAX_RAW_IMPORT_FILE_BYTES) {
        rejected.push({
          file,
          reason: `Fichier RAW trop volumineux (> ${Math.round(MAX_RAW_IMPORT_FILE_BYTES / (1024 * 1024))} Mo)`,
        });
        continue;
      }
      let isRaw = false;
      try {
        isRaw = await detectRawSignature(file);
      } catch {
        rejected.push({ file, reason: 'Lecture du fichier impossible' });
        continue;
      }
      if (!isRaw) {
        rejected.push({
          file,
          reason: 'Signature RAW non reconnue (fichier corrompu ?)',
        });
        continue;
      }
      accepted.push(file);
      continue;
    }

    if (!(ALLOWED_IMAGE_EXTENSIONS as readonly string[]).includes(ext)) {
      rejected.push({
        file,
        reason: `Extension non autorisée (${ext || 'inconnue'})`,
      });
      continue;
    }

    if (file.size === 0) {
      rejected.push({ file, reason: 'Fichier vide' });
      continue;
    }

    if (file.size > MAX_IMPORT_FILE_BYTES) {
      rejected.push({
        file,
        reason: `Fichier trop volumineux (> ${Math.round(MAX_IMPORT_FILE_BYTES / (1024 * 1024))} Mo)`,
      });
      continue;
    }

    let signature: string | null = null;
    try {
      signature = await detectImageSignature(file);
    } catch {
      rejected.push({ file, reason: 'Lecture du fichier impossible' });
      continue;
    }

    if (!signature) {
      rejected.push({
        file,
        reason: 'Signature de fichier non reconnue (type falsifié ?)',
      });
      continue;
    }

    accepted.push(file);
  }

  return { accepted, rejected };
}
