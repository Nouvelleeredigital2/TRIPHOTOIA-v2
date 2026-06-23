/**
 * Registre EN MÉMOIRE (session uniquement) des fichiers RAW d'origine.
 *
 * À l'ingestion, un RAW est décodé en proxy JPEG (cf. raw-decoder) qui devient le
 * raster `Photo.file`. L'octet RAW d'origine n'est PAS persisté dans IndexedDB
 * (un RAW pèse 20-60 Mo ; multiplié par un reportage entier, ce serait ingérable
 * pour le stockage navigateur). On le conserve donc en mémoire le temps de la
 * session, indexé par `photo.id` (= SHA-256 du contenu RAW), pour permettre un
 * export PLEINE QUALITÉ (octet d'origine ou décodage pleine résolution).
 *
 * Conséquence assumée : après un rechargement de page, l'original n'est plus
 * disponible et l'export RAW retombe sur le proxy (l'appelant le signale).
 */

const originals = new Map<string, File>();

/** Enregistre l'octet RAW d'origine d'une photo (clé = photo.id). */
export function setRawOriginal(photoId: string, file: File): void {
  originals.set(photoId, file);
}

/** Récupère l'original RAW si encore disponible dans la session, sinon undefined. */
export function getRawOriginal(photoId: string): File | undefined {
  return originals.get(photoId);
}

/** Vrai si l'original RAW de cette photo est disponible dans la session. */
export function hasRawOriginal(photoId: string): boolean {
  return originals.has(photoId);
}

/** Oublie un original (ex. photo supprimée) pour libérer la mémoire. */
export function forgetRawOriginal(photoId: string): void {
  originals.delete(photoId);
}

/** Vide tout le registre (tests / réinitialisation). */
export function clearRawOriginals(): void {
  originals.clear();
}

/** Nombre d'originaux en mémoire (diagnostic). */
export function rawOriginalsCount(): number {
  return originals.size;
}
