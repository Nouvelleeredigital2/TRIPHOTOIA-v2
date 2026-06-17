// P1-A : politique d'import centralisée et robuste.
//
// Utilisée par toutes les entrées de fichiers (Studio Grid `FileUpload` et
// AutoFlow `AutoFlowImportScreen`, via le puits commun `handleFilesSelected`).
// On n'accepte pas « tout `image/*` » : chaque fichier doit passer extension +
// taille + signature réelle (magic bytes). Les formats RAW sont explicitement
// refusés tant qu'aucun décodeur RAW n'existe. La fonction retourne la liste
// détaillée des fichiers refusés avec leur motif.

/** Taille maximale par fichier (octets). */
export const MAX_IMPORT_FILE_BYTES = 50 * 1024 * 1024; // 50 Mo

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

/** Extensions RAW explicitement refusées (pas de décodeur RAW). */
export const REJECTED_RAW_EXTENSIONS = [
  '.raw',
  '.cr2',
  '.cr3',
  '.nef',
  '.dng',
  '.arw',
  '.raf',
  '.rw2',
  '.orf',
  '.sr2',
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

    if ((REJECTED_RAW_EXTENSIONS as readonly string[]).includes(ext)) {
      rejected.push({ file, reason: 'Format RAW non pris en charge' });
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
