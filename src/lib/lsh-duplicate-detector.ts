/**
 * LSH (Locality Sensitive Hashing) pour la détection de doublons O(1) vs O(N²).
 *
 * Principe : L tables de hachage, chacune indexant K bits aléatoires du pHash.
 * Deux photos similaires tombent dans le même bucket avec haute probabilité.
 * Recherche : on ne compare (Hamming) que les candidats du bucket, pas tous.
 */

export interface LSHCandidate {
  id: string;
  hash: string;
}

export class LSHDuplicateDetector {
  private readonly tables: Map<string, string[]>[];
  private readonly bitPositions: number[][];
  private readonly hashMap: Map<string, string> = new Map(); // id → hash
  private readonly L: number;
  private readonly K: number;

  /**
   * @param hashLength  Longueur du pHash en caractères (ex: 64)
   * @param L           Nombre de tables (plus = meilleur rappel, plus lent)
   * @param K           Bits par clé de table (plus = moins de faux positifs)
   */
  constructor(hashLength = 64, L = 10, K = 6) {
    this.L = L;
    this.K = K;
    this.tables = Array.from({ length: L }, () => new Map<string, string[]>());

    // Positions de bits aléatoires — fixes pour la durée de vie de l'instance
    const rng = seededRng(hashLength * L * K);
    this.bitPositions = Array.from({ length: L }, () => {
      const positions = new Set<number>();
      while (positions.size < K) {
        positions.add(Math.floor(rng() * hashLength));
      }
      return Array.from(positions);
    });
  }

  insert(id: string, hash: string): void {
    if (this.hashMap.has(id)) {
      this.remove(id);
    }
    this.hashMap.set(id, hash);
    for (let t = 0; t < this.L; t++) {
      const key = this.bucketKey(t, hash);
      const bucket = this.tables[t].get(key);
      if (bucket) {
        if (!bucket.includes(id)) bucket.push(id);
      } else {
        this.tables[t].set(key, [id]);
      }
    }
  }

  remove(id: string): void {
    const hash = this.hashMap.get(id);
    if (!hash) return;
    this.hashMap.delete(id);
    for (let t = 0; t < this.L; t++) {
      const key = this.bucketKey(t, hash);
      const bucket = this.tables[t].get(key);
      if (!bucket) continue;
      const idx = bucket.indexOf(id);
      if (idx >= 0) bucket.splice(idx, 1);
      if (bucket.length === 0) this.tables[t].delete(key);
    }
  }

  /**
   * Retourne les candidats probables pour un hash donné (union des buckets).
   * Ne contient PAS l'id source — à filtrer en amont si besoin.
   */
  queryCandidates(hash: string): Set<string> {
    const candidates = new Set<string>();
    for (let t = 0; t < this.L; t++) {
      const key = this.bucketKey(t, hash);
      const bucket = this.tables[t].get(key);
      if (bucket) bucket.forEach((id) => candidates.add(id));
    }
    return candidates;
  }

  /** Reconstruit les tables depuis zéro (ex: chargement IDB). */
  rebuild(entries: LSHCandidate[]): void {
    this.tables.forEach((t) => t.clear());
    this.hashMap.clear();
    entries.forEach(({ id, hash }) => this.insert(id, hash));
  }

  size(): number {
    return this.hashMap.size;
  }

  private bucketKey(tableIndex: number, hash: string): string {
    return this.bitPositions[tableIndex].map((pos) => hash[pos] ?? '0').join('');
  }
}

/** Distance de Hamming entre deux hashes binaires (chaînes de '0'/'1'). */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) d++;
  }
  return d;
}

/** Générateur pseudo-aléatoire déterministe pour des positions de bits stables. */
function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}
