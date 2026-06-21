import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Map asynchrone à concurrence bornée, préservant l'ordre des résultats.
 * Utilisé pour le hashing à l'import : éviter de charger des centaines de
 * fichiers en mémoire simultanément (cf. P0-2) tout en gardant du parallélisme.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await fn(items[index], index);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * SHA-256 INTÉGRAL du contenu du fichier.
 *
 * Ce digest sert d'identité de photo et de clé de déduplication / synchronisation
 * (cf. P0-2 de l'audit). L'ancienne version ne hashait que le 1er + le dernier Mo
 * pour les gros fichiers : deux fichiers distincts de même taille partageant ces
 * zones pouvaient collisionner. On hashe désormais la totalité des octets.
 *
 * `crypto.subtle.digest` n'expose pas d'API incrémentale ; on lit donc le fichier
 * en entier. Le pic mémoire est borné par la concurrence côté appelant (l'import
 * limite le nombre de fichiers traités en parallèle).
 */
export async function calculateFileHash(file: File): Promise<string> {
  // P1-A : ne retourne jamais ''. En cas d'échec, on lève une erreur structurée
  // pour que l'appelant rejette le fichier (un ID vide provoquerait des
  // collisions d'identité entre photos).
  try {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hex = toHex(hashBuffer);
    if (!hex) {
      throw new Error('digest vide');
    }
    return hex;
  } catch (error) {
    throw new Error(
      `Échec du calcul d'empreinte pour « ${file.name} »: ${error instanceof Error ? error.message : 'erreur inconnue'}`
    );
  }
}
