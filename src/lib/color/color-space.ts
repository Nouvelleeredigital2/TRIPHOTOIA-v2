/**
 * Détection et interprétation de l'espace colorimétrique d'une image.
 *
 * LIMITE ASSUMÉE : le navigateur (`<canvas>`) ne fait pas de vraie gestion
 * couleur (CMS) contrôlable — il suppose sRGB et ignore/efface le profil ICC au
 * ré-encodage. On ne peut donc pas *convertir* fidèlement entre espaces ici. Ce
 * module se limite à ce qui est fiable et utile :
 *   1. détecter l'espace d'une image importée (EXIF + profil ICC),
 *   2. le tracer dans les métadonnées,
 *   3. prévenir quand un export va PERDRE le profil (image large gamut ré-encodée).
 * L'export `original` (octets bruts) préserve le profil ; les conversions le perdent.
 */

import type { ColorSpace } from '../../types';

export type { ColorSpace };

export interface ColorSpaceSignals {
  /** Tag EXIF ColorSpace (1 = sRGB, 0xFFFF = Uncalibrated). */
  exifColorSpace?: number;
  /** EXIF InteropIndex ('R98' = sRGB, 'R03' = Adobe RGB). */
  interopIndex?: string;
  /** Description du profil ICC embarqué (ex. "Adobe RGB (1998)", "Display P3"). */
  iccProfileName?: string;
}

/**
 * Interprète les signaux disponibles en un espace colorimétrique. Ordre de
 * confiance : profil ICC > InteropIndex > tag EXIF ColorSpace. Retourne
 * `unknown` plutôt que de deviner (ex. Uncalibrated sans autre indice).
 */
export function interpretColorSpace(signals: ColorSpaceSignals): ColorSpace {
  const icc = signals.iccProfileName?.toLowerCase().trim() ?? '';
  if (icc) {
    if (icc.includes('adobe rgb') || icc.includes('adobergb'))
      return 'Adobe RGB';
    if (icc.includes('display p3') || icc.includes('displayp3'))
      return 'Display P3';
    if (icc.includes('prophoto')) return 'ProPhoto RGB';
    if (icc.includes('2020')) return 'Rec. 2020';
    if (icc.includes('srgb') || icc.includes('iec61966')) return 'sRGB';
  }

  if (signals.interopIndex === 'R03') return 'Adobe RGB';
  if (signals.interopIndex === 'R98') return 'sRGB';

  if (signals.exifColorSpace === 1) return 'sRGB';
  // 0xFFFF (Uncalibrated) ou 2 (Adobe RGB selon certains boîtiers) : ambigu sans
  // profil ICC → on ne devine pas.
  return 'unknown';
}

/** Espaces plus larges que sRGB : un ré-encodage sRGB altère visiblement les couleurs. */
export function isWideGamut(cs: ColorSpace): boolean {
  return (
    cs === 'Adobe RGB' ||
    cs === 'Display P3' ||
    cs === 'ProPhoto RGB' ||
    cs === 'Rec. 2020'
  );
}
