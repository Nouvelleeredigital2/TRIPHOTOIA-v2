export interface BlurAnalysis {
  score: number;
  isBlurry: boolean;
  confidence: number;
  method: 'laplacian' | 'sobel' | 'gradient' | 'combined';
  details: {
    variance: number;
    maxValue: number;
    meanValue: number;
    edgeCount: number;
    sharpness: number;
  };
}

export interface BlurDetectionConfig {
  laplacianThreshold: number;
  sobelThreshold: number;
  gradientThreshold: number;
  edgeThreshold: number;
  autoCalibration: boolean;
  calibrationSamples: number;
  method: 'laplacian' | 'sobel' | 'gradient' | 'combined';
}

export interface CalibrationData {
  sharpImages: number[];
  blurryImages: number[];
  threshold: number;
  accuracy: number;
}

export class BlurDetector {
  private config: BlurDetectionConfig;
  private calibrationData: CalibrationData | null = null;

  constructor(config: Partial<BlurDetectionConfig> = {}) {
    this.config = {
      laplacianThreshold: 100,
      sobelThreshold: 50,
      gradientThreshold: 30,
      edgeThreshold: 0.1,
      autoCalibration: true,
      calibrationSamples: 50,
      method: 'combined',
      ...config
    };
  }

  /**
   * Analyse le flou d'une image
   */
  async analyzeBlur(imageData: Uint8Array, width: number, height: number): Promise<BlurAnalysis> {
    const methods = this.config.method === 'combined'
      ? ['laplacian', 'sobel', 'gradient'] as const
      : [this.config.method];

    const results: BlurAnalysis[] = [];

    for (const method of methods) {
      const result = await this.analyzeWithMethod(imageData, width, height, method);
      results.push(result);
    }

    return this.combineResults(results);
  }

  /**
   * Analyse avec une méthode spécifique
   */
  private async analyzeWithMethod(
    imageData: Uint8Array,
    width: number,
    height: number,
    method: 'laplacian' | 'sobel' | 'gradient'
  ): Promise<BlurAnalysis> {
    const grayscale = this.convertToGrayscale(imageData, width, height);
    const kernel = this.getKernel(method);
    const filtered = this.applyKernel(grayscale, width, height, kernel);

    const variance = this.calculateVariance(filtered);
    const maxValue = Math.max(...filtered);
    const meanValue = this.calculateMean(filtered);
    const edgeCount = this.countEdges(filtered, width, height);
    const sharpness = this.calculateSharpness(filtered);

    const threshold = this.getThreshold(method);
    const isBlurry = variance < threshold;
    const confidence = this.calculateConfidence(variance, threshold, edgeCount);

    return {
      score: variance,
      isBlurry,
      confidence,
      method,
      details: {
        variance,
        maxValue,
        meanValue,
        edgeCount,
        sharpness
      }
    };
  }

  /**
   * Combine les résultats de plusieurs méthodes
   */
  private combineResults(results: BlurAnalysis[]): BlurAnalysis {
    if (results.length === 1) return results[0];

    const weights = this.getMethodWeights();
    let weightedScore = 0;
    let weightedConfidence = 0;
    let blurryCount = 0;
    let totalWeight = 0;

    const combinedDetails = {
      variance: 0,
      maxValue: 0,
      meanValue: 0,
      edgeCount: 0,
      sharpness: 0
    };

    results.forEach((result, index) => {
      const weight = weights[index] || 1;
      weightedScore += result.score * weight;
      weightedConfidence += result.confidence * weight;
      if (result.isBlurry) blurryCount++;
      totalWeight += weight;

      // Moyenne pondérée des détails
      combinedDetails.variance += result.details.variance * weight;
      combinedDetails.maxValue += result.details.maxValue * weight;
      combinedDetails.meanValue += result.details.meanValue * weight;
      combinedDetails.edgeCount += result.details.edgeCount * weight;
      combinedDetails.sharpness += result.details.sharpness * weight;
    });

    const finalScore = weightedScore / totalWeight;
    const finalConfidence = weightedConfidence / totalWeight;
    const isBlurry = blurryCount > results.length / 2;

    // Normaliser les détails
    Object.keys(combinedDetails).forEach(key => {
      combinedDetails[key as keyof typeof combinedDetails] /= totalWeight;
    });

    return {
      score: finalScore,
      isBlurry,
      confidence: finalConfidence,
      method: 'combined',
      details: combinedDetails
    };
  }

  /**
   * Convertit l'image en niveaux de gris
   */
  private convertToGrayscale(imageData: Uint8Array, width: number, height: number): number[] {
    const grayscale: number[] = [];
    const channels = imageData.length / (width * height);

    for (let i = 0; i < width * height; i++) {
      let pixel = 0;
      for (let c = 0; c < channels; c++) {
        pixel += imageData[i * channels + c];
      }
      grayscale.push(pixel / channels);
    }

    return grayscale;
  }

  /**
   * Obtient le kernel pour une méthode donnée
   */
  private getKernel(method: 'laplacian' | 'sobel' | 'gradient'): number[][] {
    switch (method) {
      case 'laplacian':
        return [
          [0, -1, 0],
          [-1, 4, -1],
          [0, -1, 0]
        ];
      case 'sobel':
        return [
          [-1, -2, -1],
          [0, 0, 0],
          [1, 2, 1]
        ];
      case 'gradient':
        return [
          [-1, 0, 1],
          [-2, 0, 2],
          [-1, 0, 1]
        ];
      default:
        return [
          [0, -1, 0],
          [-1, 4, -1],
          [0, -1, 0]
        ];
    }
  }

  /**
   * Applique un kernel à l'image
   */
  private applyKernel(image: number[], width: number, height: number, kernel: number[][]): number[] {
    const result: number[] = [];
    const kernelSize = kernel.length;
    const offset = Math.floor(kernelSize / 2);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let validPixels = 0;

        for (let ky = 0; ky < kernelSize; ky++) {
          for (let kx = 0; kx < kernelSize; kx++) {
            const px = x + kx - offset;
            const py = y + ky - offset;

            if (px >= 0 && px < width && py >= 0 && py < height) {
              const pixelIndex = py * width + px;
              sum += image[pixelIndex] * kernel[ky][kx];
              validPixels++;
            }
          }
        }

        result.push(Math.abs(sum / validPixels));
      }
    }

    return result;
  }

  /**
   * Calcule la variance d'un tableau de valeurs
   */
  private calculateVariance(values: number[]): number {
    const mean = this.calculateMean(values);
    const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
    return this.calculateMean(squaredDiffs);
  }

  /**
   * Calcule la moyenne d'un tableau de valeurs
   */
  private calculateMean(values: number[]): number {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  /**
   * Compte le nombre de bords détectés
   */
  private countEdges(filtered: number[], _width: number, _height: number): number {
    const threshold = this.config.edgeThreshold * 255;
    let edgeCount = 0;

    for (let i = 0; i < filtered.length; i++) {
      if (filtered[i] > threshold) {
        edgeCount++;
      }
    }

    return edgeCount;
  }

  /**
   * Calcule la netteté de l'image
   */
  private calculateSharpness(filtered: number[]): number {
    const maxValue = Math.max(...filtered);
    const meanValue = this.calculateMean(filtered);
    return maxValue > 0 ? meanValue / maxValue : 0;
  }

  /**
   * Obtient le seuil pour une méthode donnée
   */
  private getThreshold(method: 'laplacian' | 'sobel' | 'gradient'): number {
    if (this.calibrationData) {
      return this.calibrationData.threshold;
    }

    switch (method) {
      case 'laplacian':
        return this.config.laplacianThreshold;
      case 'sobel':
        return this.config.sobelThreshold;
      case 'gradient':
        return this.config.gradientThreshold;
      default:
        return this.config.laplacianThreshold;
    }
  }

  /**
   * Calcule la confiance de la détection
   */
  private calculateConfidence(variance: number, threshold: number, edgeCount: number): number {
    const varianceConfidence = Math.min(variance / threshold, 1);
    const edgeConfidence = Math.min(edgeCount / 1000, 1); // Normalisé
    const distanceConfidence = Math.abs(variance - threshold) / threshold;

    return (varianceConfidence + edgeConfidence + (1 - distanceConfidence)) / 3;
  }

  /**
   * Obtient les poids des méthodes pour la combinaison
   */
  private getMethodWeights(): number[] {
    return [0.5, 0.3, 0.2]; // Laplacian, Sobel, Gradient
  }

  /**
   * Calibre automatiquement les seuils
   */
  async calibrate(sampleImages: { imageData: Uint8Array; width: number; height: number; isSharp: boolean }[]): Promise<void> {
    if (!this.config.autoCalibration || sampleImages.length < this.config.calibrationSamples) {
      return;
    }

    const sharpScores: number[] = [];
    const blurryScores: number[] = [];

    for (const sample of sampleImages) {
      const analysis = await this.analyzeBlur(sample.imageData, sample.width, sample.height);

      if (sample.isSharp) {
        sharpScores.push(analysis.score);
      } else {
        blurryScores.push(analysis.score);
      }
    }

    if (sharpScores.length > 0 && blurryScores.length > 0) {
      const sharpMean = this.calculateMean(sharpScores);
      const blurryMean = this.calculateMean(blurryScores);
      const threshold = (sharpMean + blurryMean) / 2;

      // Calculer l'accuracy
      const correctSharp = sharpScores.filter(score => score >= threshold).length;
      const correctBlurry = blurryScores.filter(score => score < threshold).length;
      const accuracy = (correctSharp + correctBlurry) / sampleImages.length;

      this.calibrationData = {
        sharpImages: sharpScores,
        blurryImages: blurryScores,
        threshold,
        accuracy
      };
    }
  }

  /**
   * Met à jour la configuration
   */
  updateConfig(newConfig: Partial<BlurDetectionConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Obtient les statistiques de calibration
   */
  getCalibrationStats(): CalibrationData | null {
    return this.calibrationData;
  }

  /**
   * Réinitialise la calibration
   */
  resetCalibration(): void {
    this.calibrationData = null;
  }
}
