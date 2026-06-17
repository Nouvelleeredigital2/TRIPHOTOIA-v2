// import { createHash } from 'crypto'; // Node.js crypto - not available in browser

export interface ImageHash {
  perceptual: string;
  cryptographic: string;
  dhash?: string;
  phash?: string;
}

export interface DuplicateGroup {
  id: string;
  photos: string[];
  representative: string;
  similarity: number;
  confidence: number;
}

export interface DuplicateDetectionConfig {
  hammingThreshold: number;
  phashSize: number;
  dhashSize: number;
  enableCryptographic: boolean;
  enablePerceptual: boolean;
}

export class DuplicateDetector {
  private config: DuplicateDetectionConfig;
  private hashIndex: Map<string, string[]> = new Map();
  private photoHashes: Map<string, ImageHash> = new Map();

  constructor(config: Partial<DuplicateDetectionConfig> = {}) {
    this.config = {
      hammingThreshold: 10,
      phashSize: 64,
      dhashSize: 64,
      enableCryptographic: true,
      enablePerceptual: true,
      ...config,
    };
  }

  /**
   * Génère un hash perceptuel pHash pour une image
   */
  async generatePHash(imageData: Uint8Array): Promise<string> {
    // Simulation d'un pHash - dans une vraie implémentation,
    // on utiliserait une librairie comme sharp ou opencv
    const hash = this.simplePerceptualHash(imageData);
    return hash;
  }

  /**
   * Génère un hash perceptuel dHash pour une image
   */
  async generateDHash(imageData: Uint8Array): Promise<string> {
    // Simulation d'un dHash - dans une vraie implémentation,
    // on calculerait la différence entre pixels adjacents
    const hash = this.simpleDifferenceHash(imageData);
    return hash;
  }

  /**
   * Génère un hash cryptographique simple (compatible navigateur)
   */
  async generateCryptographicHash(imageData: Uint8Array): Promise<string> {
    // Implémentation simplifiée pour le navigateur
    let hash = 0;
    for (let i = 0; i < imageData.length; i++) {
      hash = ((hash << 5) - hash + imageData[i]) & 0xffffffff;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  /**
   * Calcule la distance de Hamming entre deux hashes
   */
  calculateHammingDistance(hash1: string, hash2: string): number {
    if (hash1.length !== hash2.length) {
      throw new Error('Hash lengths must be equal');
    }

    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] !== hash2[i]) {
        distance++;
      }
    }
    return distance;
  }

  /**
   * Calcule la similarité entre deux hashes (0-1, 1 = identique)
   */
  calculateSimilarity(hash1: string, hash2: string): number {
    const distance = this.calculateHammingDistance(hash1, hash2);
    const maxDistance = hash1.length;
    return 1 - distance / maxDistance;
  }

  /**
   * Analyse une image et génère tous les types de hash
   */
  async analyzeImage(
    photoId: string,
    imageData: Uint8Array
  ): Promise<ImageHash> {
    const hashes: ImageHash = {
      perceptual: '',
      cryptographic: '',
    };

    if (this.config.enableCryptographic) {
      hashes.cryptographic = await this.generateCryptographicHash(imageData);
    }

    if (this.config.enablePerceptual) {
      hashes.phash = await this.generatePHash(imageData);
      hashes.dhash = await this.generateDHash(imageData);
      hashes.perceptual = hashes.phash || hashes.dhash || '';
    }

    this.photoHashes.set(photoId, hashes);
    this.updateHashIndex(photoId, hashes);

    return hashes;
  }

  /**
   * Détecte les doublons pour une photo donnée
   */
  findDuplicates(photoId: string): DuplicateGroup[] {
    const photoHash = this.photoHashes.get(photoId);
    if (!photoHash) {
      return [];
    }

    const duplicates: Map<string, string[]> = new Map();
    const processed = new Set<string>();

    // Recherche par hash cryptographique (doublons exacts)
    if (photoHash.cryptographic) {
      const exactDuplicates = this.hashIndex.get(photoHash.cryptographic) || [];
      if (exactDuplicates.length > 1) {
        duplicates.set(photoHash.cryptographic, exactDuplicates);
        exactDuplicates.forEach((id) => processed.add(id));
      }
    }

    // Recherche par hash perceptuel (doublons similaires)
    if (photoHash.perceptual) {
      for (const [hash, photoIds] of this.hashIndex.entries()) {
        if (hash === photoHash.cryptographic) continue; // Déjà traité

        const similarity = this.calculateSimilarity(photoHash.perceptual, hash);
        if (
          similarity >
          1 - this.config.hammingThreshold / this.config.phashSize
        ) {
          const groupId = `perceptual_${hash}`;
          duplicates.set(
            groupId,
            photoIds.filter((id) => !processed.has(id))
          );
        }
      }
    }

    // Convertir en groupes de doublons
    const duplicateGroups: DuplicateGroup[] = [];
    for (const [groupId, photoIds] of duplicates.entries()) {
      if (photoIds.length > 1) {
        const representative = this.selectRepresentative(photoIds);
        const similarity = this.calculateGroupSimilarity(photoIds);

        duplicateGroups.push({
          id: groupId,
          photos: photoIds,
          representative,
          similarity,
          confidence: this.calculateConfidence(photoIds, similarity),
        });
      }
    }

    return duplicateGroups;
  }

  /**
   * Met à jour l'index des hashs
   */
  private updateHashIndex(photoId: string, hashes: ImageHash): void {
    if (hashes.cryptographic) {
      const existing = this.hashIndex.get(hashes.cryptographic) || [];
      if (!existing.includes(photoId)) {
        existing.push(photoId);
        this.hashIndex.set(hashes.cryptographic, existing);
      }
    }

    if (hashes.perceptual) {
      const existing = this.hashIndex.get(hashes.perceptual) || [];
      if (!existing.includes(photoId)) {
        existing.push(photoId);
        this.hashIndex.set(hashes.perceptual, existing);
      }
    }
  }

  /**
   * Sélectionne la photo représentative d'un groupe de doublons
   */
  private selectRepresentative(photoIds: string[]): string {
    // Pour l'instant, retourne la première photo
    // Dans une vraie implémentation, on analyserait la qualité
    return photoIds[0];
  }

  /**
   * Calcule la similarité moyenne d'un groupe
   */
  private calculateGroupSimilarity(photoIds: string[]): number {
    if (photoIds.length < 2) return 1;

    let totalSimilarity = 0;
    let comparisons = 0;

    for (let i = 0; i < photoIds.length; i++) {
      for (let j = i + 1; j < photoIds.length; j++) {
        const hash1 = this.photoHashes.get(photoIds[i]);
        const hash2 = this.photoHashes.get(photoIds[j]);

        if (hash1?.perceptual && hash2?.perceptual) {
          totalSimilarity += this.calculateSimilarity(
            hash1.perceptual,
            hash2.perceptual
          );
          comparisons++;
        }
      }
    }

    return comparisons > 0 ? totalSimilarity / comparisons : 0;
  }

  /**
   * Calcule la confiance d'un groupe de doublons
   */
  private calculateConfidence(photoIds: string[], similarity: number): number {
    // Facteurs: nombre de photos, similarité, cohérence des hashs
    const countFactor = Math.min(photoIds.length / 5, 1); // Max 1 pour 5+ photos
    const similarityFactor = similarity;
    const consistencyFactor = this.calculateConsistency(photoIds);

    return (countFactor + similarityFactor + consistencyFactor) / 3;
  }

  /**
   * Calcule la cohérence d'un groupe (écart-type des similarités)
   */
  private calculateConsistency(photoIds: string[]): number {
    if (photoIds.length < 3) return 1;

    const similarities: number[] = [];
    for (let i = 0; i < photoIds.length; i++) {
      for (let j = i + 1; j < photoIds.length; j++) {
        const hash1 = this.photoHashes.get(photoIds[i]);
        const hash2 = this.photoHashes.get(photoIds[j]);

        if (hash1?.perceptual && hash2?.perceptual) {
          similarities.push(
            this.calculateSimilarity(hash1.perceptual, hash2.perceptual)
          );
        }
      }
    }

    if (similarities.length === 0) return 0;

    const mean = similarities.reduce((a, b) => a + b, 0) / similarities.length;
    const variance =
      similarities.reduce((acc, sim) => acc + Math.pow(sim - mean, 2), 0) /
      similarities.length;
    const stdDev = Math.sqrt(variance);

    // Plus l'écart-type est faible, plus le groupe est cohérent
    return Math.max(0, 1 - stdDev);
  }

  /**
   * Hash perceptuel simplifié (simulation)
   */
  private simplePerceptualHash(imageData: Uint8Array): string {
    // Simulation d'un pHash basique
    let hash = '';
    const step = Math.max(
      1,
      Math.floor(imageData.length / this.config.phashSize)
    );

    for (let i = 0; i < this.config.phashSize; i++) {
      const index = (i * step) % imageData.length;
      hash += imageData[index] > 128 ? '1' : '0';
    }

    return hash;
  }

  /**
   * Hash de différence simplifié (simulation)
   */
  private simpleDifferenceHash(imageData: Uint8Array): string {
    // Simulation d'un dHash basique
    let hash = '';
    const step = Math.max(
      1,
      Math.floor(imageData.length / this.config.dhashSize)
    );

    for (let i = 0; i < this.config.dhashSize - 1; i++) {
      const index1 = (i * step) % imageData.length;
      const index2 = ((i + 1) * step) % imageData.length;
      hash += imageData[index1] > imageData[index2] ? '1' : '0';
    }

    return hash;
  }

  /**
   * Met à jour la configuration
   */
  updateConfig(newConfig: Partial<DuplicateDetectionConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Obtient les statistiques de détection
   */
  getStats(): {
    totalPhotos: number;
    totalGroups: number;
    averageGroupSize: number;
  } {
    const totalPhotos = this.photoHashes.size;
    const groups = Array.from(this.hashIndex.values()).filter(
      (ids) => ids.length > 1
    );
    const totalGroups = groups.length;
    const averageGroupSize =
      totalGroups > 0
        ? groups.reduce((sum, ids) => sum + ids.length, 0) / totalGroups
        : 0;

    return { totalPhotos, totalGroups, averageGroupSize };
  }

  /**
   * Nettoie les données pour une photo
   */
  removePhoto(photoId: string): void {
    const hashes = this.photoHashes.get(photoId);
    if (hashes) {
      // Retirer des index
      if (hashes.cryptographic) {
        const ids = this.hashIndex.get(hashes.cryptographic) || [];
        const filtered = ids.filter((id) => id !== photoId);
        if (filtered.length > 0) {
          this.hashIndex.set(hashes.cryptographic, filtered);
        } else {
          this.hashIndex.delete(hashes.cryptographic);
        }
      }

      if (hashes.perceptual) {
        const ids = this.hashIndex.get(hashes.perceptual) || [];
        const filtered = ids.filter((id) => id !== photoId);
        if (filtered.length > 0) {
          this.hashIndex.set(hashes.perceptual, filtered);
        } else {
          this.hashIndex.delete(hashes.perceptual);
        }
      }

      // Retirer des hashs stockés
      this.photoHashes.delete(photoId);
    }
  }
}
