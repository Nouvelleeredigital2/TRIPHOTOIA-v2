import { DuplicateDetector } from './duplicate-detection';
import type { ImageHash, DuplicateGroup, DuplicateDetectionConfig } from './duplicate-detection';
import { BlurDetector } from './blur-detection';
import type { BlurAnalysis, BlurDetectionConfig, CalibrationData } from './blur-detection';
import { AutoRetoucher } from './auto-retouch';
import type { RetouchOptions, RetouchAnalysis, RetouchResult, RetouchConfig } from './auto-retouch';
import { PhotoScorer } from './photo-scoring';
import type { PhotoScore, ScoringWeights, ScoringConfig, PhotoRanking } from './photo-scoring';

export { DuplicateDetector, BlurDetector, AutoRetoucher, PhotoScorer };
export type {
  ImageHash,
  DuplicateGroup,
  DuplicateDetectionConfig,
  BlurAnalysis,
  BlurDetectionConfig,
  CalibrationData,
  RetouchOptions,
  RetouchAnalysis,
  RetouchResult,
  RetouchConfig,
  PhotoScore,
  ScoringWeights,
  ScoringConfig,
  PhotoRanking,
};

export interface ComputerVisionConfig {
  duplicateDetection: Partial<DuplicateDetectionConfig>;
  blurDetection: Partial<BlurDetectionConfig>;
  autoRetouch: Partial<RetouchConfig>;
  photoScoring: Partial<ScoringConfig>;
}

export interface PhotoAnalysisResult {
  photoId: string;
  duplicateGroups: DuplicateGroup[];
  blurAnalysis: BlurAnalysis;
  retouchAnalysis: RetouchAnalysis;
  photoScore: PhotoScore;
  recommendations: string[];
  processingTime: number;
}

export class ComputerVisionEngine {
  private duplicateDetector: DuplicateDetector;
  private blurDetector: BlurDetector;
  private autoRetoucher: AutoRetoucher;
  private photoScorer: PhotoScorer;

  constructor(config: Partial<ComputerVisionConfig> = {}) {
    this.duplicateDetector = new DuplicateDetector(config.duplicateDetection);
    this.blurDetector = new BlurDetector(config.blurDetection);
    this.autoRetoucher = new AutoRetoucher(config.autoRetouch);
    this.photoScorer = new PhotoScorer(config.photoScoring);
  }

  /**
   * Analyse complète d'une photo
   */
  async analyzePhoto(
    photoId: string,
    imageData: Uint8Array,
    width: number,
    height: number,
    metadata?: unknown
  ): Promise<PhotoAnalysisResult> {
    const startTime = performance.now();

    try {
      // Analyses parallèles pour optimiser les performances
      const [
        duplicateGroups,
        blurAnalysis,
        retouchAnalysis,
        photoScore
      ] = await Promise.all([
        this.duplicateDetector.findDuplicates(photoId),
        this.blurDetector.analyzeBlur(imageData, width, height),
        this.autoRetoucher.analyzeImage(imageData, width, height),
        this.photoScorer.scorePhoto(photoId, imageData, width, height, metadata)
      ]);

      // Générer les recommandations
      const recommendations = this.generateRecommendations({
        duplicateGroups,
        blurAnalysis,
        retouchAnalysis,
        photoScore
      });

      const processingTime = performance.now() - startTime;

      return {
        photoId,
        duplicateGroups,
        blurAnalysis,
        retouchAnalysis,
        photoScore,
        recommendations,
        processingTime
      };
    } catch (error) {
      console.error("Erreur lors de l'analyse de la photo:", error);
      throw new Error(`Échec de l'analyse de la photo ${photoId}: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  }

  /**
   * Analyse un groupe de photos et détecte les doublons
   */
  async analyzePhotoGroup(
    photos: Array<{
      id: string;
      imageData: Uint8Array;
      width: number;
      height: number;
      metadata?: unknown;
    }>
  ): Promise<{
    analyses: PhotoAnalysisResult[];
    duplicateGroups: DuplicateGroup[];
    rankings: PhotoRanking[];
  }> {
    const startTime = performance.now();

    try {
      // Analyser chaque photo individuellement
      const analyses = await Promise.all(
        photos.map(photo => this.analyzePhoto(photo.id, photo.imageData, photo.width, photo.height, photo.metadata))
      );

      // Détecter les doublons globaux
      const allDuplicateGroups = new Map<string, DuplicateGroup>();
      analyses.forEach(analysis => {
        analysis.duplicateGroups.forEach(group => {
          allDuplicateGroups.set(group.id, group);
        });
      });

      // Classer les photos
      const rankings = await this.photoScorer.rankPhotos(photos);

      const processingTime = performance.now() - startTime;
      console.log(`Analyse de ${photos.length} photos terminée en ${processingTime.toFixed(2)}ms`);

      return {
        analyses,
        duplicateGroups: Array.from(allDuplicateGroups.values()),
        rankings
      };
    } catch (error) {
      console.error('Erreur lors de l\'analyse du groupe de photos:', error);
      throw new Error(`Échec de l'analyse du groupe: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  }

  /**
   * Calibre les détecteurs avec des données d'entraînement
   */
  async calibrate(trainingData: {
    sharpImages: Array<{ imageData: Uint8Array; width: number; height: number }>;
    blurryImages: Array<{ imageData: Uint8Array; width: number; height: number }>;
    duplicateGroups: Array<{
      images: Array<{ imageData: Uint8Array }>;
    }>;
  }): Promise<void> {
    try {
      // Calibrer le détecteur de flou
      const blurCalibrationData = [
        ...trainingData.sharpImages.map(img => ({ ...img, isSharp: true })),
        ...trainingData.blurryImages.map(img => ({ ...img, isSharp: false }))
      ];
      await this.blurDetector.calibrate(blurCalibrationData);

      // Calibrer le détecteur de doublons
      for (const group of trainingData.duplicateGroups) {
        for (const image of group.images) {
          // Simuler l'ajout d'images pour la calibration
          const mockPhotoId = `calibration_${Math.random().toString(36).substring(2, 11)}`;
          await this.duplicateDetector.analyzeImage(mockPhotoId, image.imageData);
        }
      }

      console.log('Calibration des détecteurs terminée avec succès');
    } catch (error) {
      console.error('Erreur lors de la calibration:', error);
      throw new Error(`Échec de la calibration: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  }

  /**
   * Génère les recommandations basées sur l'analyse
   */
  private generateRecommendations(analysis: {
    duplicateGroups: DuplicateGroup[];
    blurAnalysis: BlurAnalysis;
    retouchAnalysis: RetouchAnalysis;
    photoScore: PhotoScore;
  }): string[] {
    const recommendations: string[] = [];

    // Recommandations basées sur les doublons
    if (analysis.duplicateGroups.length > 0) {
      recommendations.push(`${analysis.duplicateGroups.length} groupe(s) de doublons détecté(s)`);
    }

    // Recommandations basées sur le flou
    if (analysis.blurAnalysis.isBlurry) {
      recommendations.push("Image floue détectée - considérer la retouche ou la suppression");
    }

    // Recommandations basées sur la retouche
    if (analysis.retouchAnalysis.confidence > 0.7) {
      if (analysis.retouchAnalysis.needsBrightness) {
        recommendations.push('Ajustement de luminosité recommandé');
      }
      if (analysis.retouchAnalysis.needsContrast) {
        recommendations.push('Ajustement de contraste recommandé');
      }
      if (analysis.retouchAnalysis.needsSaturation) {
        recommendations.push('Ajustement de saturation recommandé');
      }
      if (analysis.retouchAnalysis.needsSharpness) {
        recommendations.push('Amélioration de la netteté recommandée');
      }
    }

    // Recommandations basées sur le score
    if (analysis.photoScore.overall > 80) {
      recommendations.push('Photo de très bonne qualité');
    } else if (analysis.photoScore.overall < 40) {
      recommendations.push('Photo de qualité médiocre - considérer la suppression');
    }

    // Recommandations spécifiques
    if (analysis.photoScore.details.faceDetection > 0.8) {
      recommendations.push('Visage bien détecté');
    }
    if (analysis.photoScore.details.eyeOpenness > 0.8) {
      recommendations.push('Yeux ouverts détectés');
    }
    if (analysis.photoScore.details.smileDetection > 0.7) {
      recommendations.push('Sourire détecté');
    }

    return recommendations;
  }

  /**
   * Met à jour la configuration
   */
  updateConfig(newConfig: Partial<ComputerVisionConfig>): void {
    if (newConfig.duplicateDetection) {
      this.duplicateDetector.updateConfig(newConfig.duplicateDetection);
    }
    if (newConfig.blurDetection) {
      this.blurDetector.updateConfig(newConfig.blurDetection);
    }
    if (newConfig.autoRetouch) {
      this.autoRetoucher.updateConfig(newConfig.autoRetouch);
    }
    if (newConfig.photoScoring) {
      this.photoScorer.updateConfig(newConfig.photoScoring);
    }
  }

  /**
   * Obtient les statistiques globales
   */
  getStats(): {
    duplicateDetection: unknown;
    blurDetection: unknown;
    photoScoring: unknown;
  } {
    return {
      duplicateDetection: this.duplicateDetector.getStats(),
      blurDetection: this.blurDetector.getCalibrationStats(),
      photoScoring: this.photoScorer.getStats()
    };
  }

  /**
   * Nettoie les ressources
   */
  cleanup(): void {
    // Nettoyer les ressources si nécessaire
    this.blurDetector.resetCalibration();
  }
}
