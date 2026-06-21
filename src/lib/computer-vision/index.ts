import { DuplicateDetector } from './duplicate-detection';
import type {
  ImageHash,
  DuplicateGroup,
  DuplicateDetectionConfig,
} from './duplicate-detection';
import { BlurDetector } from './blur-detection';
import type {
  BlurAnalysis,
  BlurDetectionConfig,
  CalibrationData,
} from './blur-detection';
import { AutoRetoucher } from './auto-retouch';
import type {
  RetouchOptions,
  RetouchAnalysis,
  RetouchResult,
  RetouchConfig,
} from './auto-retouch';
import { PhotoScorer } from './photo-scoring';
import type {
  PhotoScore,
  ScoringWeights,
  ScoringConfig,
  PhotoRanking,
} from './photo-scoring';

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
   * Analyse compl�te d'une photo
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
      // Analyses parall�les pour optimiser les performances
      const [duplicateGroups, blurAnalysis, retouchAnalysis, photoScore] =
        await Promise.all([
          this.duplicateDetector.findDuplicates(photoId),
          this.blurDetector.analyzeBlur(imageData, width, height),
          this.autoRetoucher.analyzeImage(imageData, width, height),
          this.photoScorer.scorePhoto(
            photoId,
            imageData,
            width,
            height,
            metadata
          ),
        ]);

      // G�n�rer les recommandations
      const recommendations = this.generateRecommendations({
        duplicateGroups,
        blurAnalysis,
        retouchAnalysis,
        photoScore,
      });

      const processingTime = performance.now() - startTime;

      return {
        photoId,
        duplicateGroups,
        blurAnalysis,
        retouchAnalysis,
        photoScore,
        recommendations,
        processingTime,
      };
    } catch (error) {
      console.error("Erreur lors de l'analyse de la photo:", error);
      throw new Error(
        `�chec de l'analyse de la photo ${photoId}: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
      );
    }
  }

  /**
   * Analyse un groupe de photos et d�tecte les doublons
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
        photos.map((photo) =>
          this.analyzePhoto(
            photo.id,
            photo.imageData,
            photo.width,
            photo.height,
            photo.metadata
          )
        )
      );

      // D�tecter les doublons globaux
      const allDuplicateGroups = new Map<string, DuplicateGroup>();
      analyses.forEach((analysis) => {
        analysis.duplicateGroups.forEach((group) => {
          allDuplicateGroups.set(group.id, group);
        });
      });

      // Classer les photos
      const rankings = await this.photoScorer.rankPhotos(photos);

      const processingTime = performance.now() - startTime;
      console.log(
        `Analyse de ${photos.length} photos termin�e en ${processingTime.toFixed(2)}ms`
      );

      return {
        analyses,
        duplicateGroups: Array.from(allDuplicateGroups.values()),
        rankings,
      };
    } catch (error) {
      console.error("Erreur lors de l'analyse du groupe de photos:", error);
      throw new Error(
        `�chec de l'analyse du groupe: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
      );
    }
  }

  /**
   * Calibre les d�tecteurs avec des donn�es d'entra�nement
   */
  async calibrate(trainingData: {
    sharpImages: Array<{
      imageData: Uint8Array;
      width: number;
      height: number;
    }>;
    blurryImages: Array<{
      imageData: Uint8Array;
      width: number;
      height: number;
    }>;
    duplicateGroups: Array<{
      images: Array<{ imageData: Uint8Array }>;
    }>;
  }): Promise<void> {
    try {
      // Calibrer le d�tecteur de flou
      const blurCalibrationData = [
        ...trainingData.sharpImages.map((img) => ({ ...img, isSharp: true })),
        ...trainingData.blurryImages.map((img) => ({ ...img, isSharp: false })),
      ];
      await this.blurDetector.calibrate(blurCalibrationData);

      // Calibrer le d�tecteur de doublons
      for (const group of trainingData.duplicateGroups) {
        for (const image of group.images) {
          // Simuler l'ajout d'images pour la calibration
          const mockPhotoId = `calibration_${Math.random().toString(36).substring(2, 11)}`;
          await this.duplicateDetector.analyzeImage(
            mockPhotoId,
            image.imageData
          );
        }
      }

      console.log('Calibration des d�tecteurs termin�e avec succ�s');
    } catch (error) {
      console.error('Erreur lors de la calibration:', error);
      throw new Error(
        `�chec de la calibration: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
      );
    }
  }

  /**
   * G�n�re les recommandations bas�es sur l'analyse
   */
  private generateRecommendations(analysis: {
    duplicateGroups: DuplicateGroup[];
    blurAnalysis: BlurAnalysis;
    retouchAnalysis: RetouchAnalysis;
    photoScore: PhotoScore;
  }): string[] {
    const recommendations: string[] = [];

    // Recommandations bas�es sur les doublons
    if (analysis.duplicateGroups.length > 0) {
      recommendations.push(
        `${analysis.duplicateGroups.length} groupe(s) de doublons d�tect�(s)`
      );
    }

    // Recommandations bas�es sur le flou
    if (analysis.blurAnalysis.isBlurry) {
      recommendations.push(
        'Image floue d�tect�e - consid�rer la retouche ou la suppression'
      );
    }

    // Recommandations bas�es sur la retouche
    if (analysis.retouchAnalysis.confidence > 0.7) {
      if (analysis.retouchAnalysis.needsBrightness) {
        recommendations.push('Ajustement de luminosit� recommand�');
      }
      if (analysis.retouchAnalysis.needsContrast) {
        recommendations.push('Ajustement de contraste recommand�');
      }
      if (analysis.retouchAnalysis.needsSaturation) {
        recommendations.push('Ajustement de saturation recommand�');
      }
      if (analysis.retouchAnalysis.needsSharpness) {
        recommendations.push('Am�lioration de la nettet� recommand�e');
      }
    }

    // Recommandations bas�es sur le score
    if (analysis.photoScore.overall > 80) {
      recommendations.push('Photo de tr�s bonne qualit�');
    } else if (analysis.photoScore.overall < 40) {
      recommendations.push(
        'Photo de qualit� m�diocre - consid�rer la suppression'
      );
    }

    // Recommandations sp�cifiques
    if (analysis.photoScore.details.faceDetection > 0.8) {
      recommendations.push('Visage bien d�tect�');
    }
    if (analysis.photoScore.details.eyeOpenness > 0.8) {
      recommendations.push('Yeux ouverts d�tect�s');
    }
    if (analysis.photoScore.details.smileDetection > 0.7) {
      recommendations.push('Sourire d�tect�');
    }

    return recommendations;
  }

  /**
   * Met � jour la configuration
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
      photoScoring: this.photoScorer.getStats(),
    };
  }

  /**
   * Nettoie les ressources
   */
  cleanup(): void {
    // Nettoyer les ressources si n�cessaire
    this.blurDetector.resetCalibration();
  }
}
