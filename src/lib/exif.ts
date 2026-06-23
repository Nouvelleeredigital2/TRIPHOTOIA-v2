import exifr from 'exifr';
import { interpretColorSpace } from './color/color-space';
import type { ColorSpace } from '../types';

// Lecture EXIF réelle à l'import (résiliente : un fichier sans EXIF — PNG/WebP,
// ou illisible — ne bloque jamais l'import, on retourne undefined). On lit aussi
// l'espace colorimétrique (tag EXIF + InteropIndex + profil ICC embarqué).

export interface ReadExifResult {
  exif: Record<string, unknown>;
  /** Espace colorimétrique détecté (absent si indéterminé). */
  colorSpace?: ColorSpace;
}

export async function readExifMetadata(
  file: File
): Promise<ReadExifResult | undefined> {
  try {
    // `icc` + `interop` activés pour récupérer ProfileDescription / InteropIndex
    // en plus de l'EXIF standard.
    const exif = await exifr.parse(file, { icc: true, interop: true });
    if (exif && typeof exif === 'object' && Object.keys(exif).length > 0) {
      const record = exif as Record<string, unknown>;
      const cs = interpretColorSpace({
        exifColorSpace:
          typeof record.ColorSpace === 'number' ? record.ColorSpace : undefined,
        interopIndex:
          typeof record.InteropIndex === 'string'
            ? record.InteropIndex
            : undefined,
        iccProfileName:
          typeof record.ProfileDescription === 'string'
            ? record.ProfileDescription
            : undefined,
      });
      return {
        exif: record,
        colorSpace: cs === 'unknown' ? undefined : cs,
      };
    }
  } catch {
    // EXIF absent/illisible — non bloquant.
  }
  return undefined;
}
