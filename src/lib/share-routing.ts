// P2 : routing hash du partage, isolé en fonction pure pour être testable
// indépendamment de `window`. Le listener `hashchange` (App.tsx) s'appuie dessus
// pour prendre en compte une bascule vers `#/share/<token>` sans rechargement.

/**
 * Extrait le token d'une route de partage `#/share/<token>`.
 * Retourne `null` si le hash ne correspond pas exactement au motif attendu
 * (token hexadécimal, tel qu'émis par `createShareLink`).
 */
export function parseShareToken(hash: string): string | null {
  const match = hash.match(/^#\/share\/([a-f0-9]+)$/);
  return match ? match[1] : null;
}
