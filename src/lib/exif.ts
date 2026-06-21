import exifr from 'exifr';

// Lecture EXIF réelle à l'import (résiliente : un fichier sans EXIF — PNG/WebP,
// ou illisible — ne bloque jamais l'import, on retourne undefined).

export interface ReadExifResult {
  exif: Record<string, unknown>;
}

export async function readExifMetadata(
  file: File
): Promise<ReadExifResult | undefined> {
  try {
    const exif = await exifr.parse(file);
    if (exif && typeof exif === 'object' && Object.keys(exif).length > 0) {
      return { exif: exif as Record<string, unknown> };
    }
  } catch {
    // EXIF absent/illisible — non bloquant.
  }
  return undefined;
}
