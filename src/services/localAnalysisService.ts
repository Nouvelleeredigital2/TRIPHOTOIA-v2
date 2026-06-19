/**
 * Service d'analyse locale des images
 * Remplace l'API Gemini par une analyse locale utilisant Canvas API
 */

import { ImageProcessor } from '../lib/image-analysis/imageProcessor';
import { PhotoAnalysis } from '../../types';

export class LocalAnalysisService {
  private imageProcessor: ImageProcessor;
  private analysisCache: Map<string, PhotoAnalysis> = new Map();

  constructor() {
    this.imageProcessor = new ImageProcessor();
  }

  /**
   * Analyse un lot de photos localement
   */
  async analyzePhotosBatch(files: File[]): Promise<PhotoAnalysis[]> {
    if (files.length === 0) {
      return [];
    }

    console.log(`🔄 Analyse locale de ${files.length} photo(s)...`);

    try {
      const analyses = await Promise.all(
        files.map(file => this.analyzeSinglePhoto(file))
      );

      console.log(`✅ Analyse terminée pour ${analyses.length} photo(s)`);
      return analyses;
    } catch (error) {
      console.error('Erreur lors de l\'analyse locale:', error);
      return files.map(() => ({
        error: 'Erreur d\'analyse locale'
      }));
    }
  }

  /**
   * Analyse une seule photo
   */
  private async analyzeSinglePhoto(file: File): Promise<PhotoAnalysis> {
    const fileKey = `${file.name}-${file.size}-${file.lastModified}`;

    // Vérifier le cache
    if (this.analysisCache.has(fileKey)) {
      return this.analysisCache.get(fileKey)!;
    }

    try {
      const analysis = await this.imageProcessor.analyzeImage(file);

      // Convertir le résultat en format PhotoAnalysis
      const photoAnalysis: PhotoAnalysis = {
        isBlurry: analysis.isBlurry,
        sharpnessScore: analysis.sharpnessScore,
        hasOpenEyes: analysis.hasOpenEyes,
        tags: analysis.tags,
        perceptualHash: analysis.perceptualHash,
        compositionScore: analysis.compositionScore?.overallCompositionScore,
        suggestedRetouch: analysis.suggestedRetouch,
      };

      // Mettre en cache
      this.analysisCache.set(fileKey, photoAnalysis);

      return photoAnalysis;
    } catch (error) {
      console.error(`Erreur lors de l'analyse de ${file.name}:`, error);
      return {
        error: `Erreur d'analyse: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
      };
    }
  }

  /**
   * Détecte les doublons dans un ensemble de photos
   */
  detectDuplicates(analyses: PhotoAnalysis[]): Array<{
    photos: PhotoAnalysis[];
    similarity: number;
  }> {
    const duplicateGroups: Array<{
      photos: PhotoAnalysis[];
      similarity: number;
    }> = [];

    const processed = new Set<number>();

    for (let i = 0; i < analyses.length; i++) {
      if (processed.has(i) || analyses[i].error || !analyses[i].perceptualHash) {
        continue;
      }

      const group = [analyses[i]];
      processed.add(i);

      for (let j = i + 1; j < analyses.length; j++) {
        if (processed.has(j) || analyses[j].error || !analyses[j].perceptualHash) {
          continue;
        }

        const similarity = this.calculateHashSimilarity(
          analyses[i].perceptualHash!,
          analyses[j].perceptualHash!
        );

        if (similarity > 0.85) { // Seuil de similarité
          group.push(analyses[j]);
          processed.add(j);
        }
      }

      if (group.length > 1) {
        duplicateGroups.push({
          photos: group,
          similarity: this.calculateGroupSimilarity(group)
        });
      }
    }

    return duplicateGroups;
  }

  /**
   * Calcule la similarité entre deux hashes perceptuels
   */
  private calculateHashSimilarity(hash1: string, hash2: string): number {
    if (hash1.length !== hash2.length) {
      return 0;
    }

    let matches = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] === hash2[i]) {
        matches++;
      }
    }

    return matches / hash1.length;
  }

  /**
   * Calcule la similarité moyenne d'un groupe
   */
  private calculateGroupSimilarity(group: PhotoAnalysis[]): number {
    if (group.length < 2) return 1;

    let totalSimilarity = 0;
    let comparisons = 0;

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (group[i].perceptualHash && group[j].perceptualHash) {
          totalSimilarity += this.calculateHashSimilarity(
            group[i].perceptualHash!,
            group[j].perceptualHash!
          );
          comparisons++;
        }
      }
    }

    return comparisons > 0 ? totalSimilarity / comparisons : 0;
  }

  /**
   * Obtient des statistiques d'analyse
   */
  getAnalysisStats(analyses: PhotoAnalysis[]): {
    total: number;
    blurry: number;
    sharp: number;
    withEyes: number;
    duplicateGroups: number;
    averageSharpness: number;
  } {
    const validAnalyses = analyses.filter(a => !a.error);

    const blurry = validAnalyses.filter(a => a.isBlurry).length;
    const sharp = validAnalyses.filter(a => !a.isBlurry).length;
    const withEyes = validAnalyses.filter(a => a.hasOpenEyes).length;

    const averageSharpness = validAnalyses.length > 0
      ? validAnalyses.reduce((sum, a) => sum + (a.sharpnessScore || 0), 0) / validAnalyses.length
      : 0;

    const duplicateGroups = this.detectDuplicates(validAnalyses).length;

    return {
      total: analyses.length,
      blurry,
      sharp,
      withEyes,
      duplicateGroups,
      averageSharpness
    };
  }

  /**
   * Nettoie le cache
   */
  clearCache(): void {
    this.analysisCache.clear();
  }

  /**
   * Obtient la taille du cache
   */
  getCacheSize(): number {
    return this.analysisCache.size;
  }
}

// Instance singleton
export const localAnalysisService = new LocalAnalysisService();
