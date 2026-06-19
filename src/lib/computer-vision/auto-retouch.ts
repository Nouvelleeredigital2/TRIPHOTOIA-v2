export interface RetouchOptions {
  brightness: number; // -100 à 100
  contrast: number; // -100 à 100
  saturation: number; // -100 à 100
  sharpness: number; // 0 à 100
  whiteBalance: {
    temperature: number; // -100 à 100 (froid à chaud)
    tint: number; // -100 à 100 (vert à magenta)
  };
  exposure: number; // -100 à 100
  highlights: number; // -100 à 100
  shadows: number; // -100 à 100
  vibrance: number; // -100 à 100
}

export interface RetouchAnalysis {
  needsBrightness: boolean;
  needsContrast: boolean;
  needsSaturation: boolean;
  needsSharpness: boolean;
  needsWhiteBalance: boolean;
  needsExposure: boolean;
  confidence: number;
  suggestedOptions: RetouchOptions;
}

export interface RetouchResult {
  success: boolean;
  originalImage: Uint8Array;
  retouchedImage: Uint8Array;
  appliedOptions: RetouchOptions;
  analysis: RetouchAnalysis;
  beforeAfterMetrics: {
    brightness: { before: number; after: number };
    contrast: { before: number; after: number };
    saturation: { before: number; after: number };
    sharpness: { before: number; after: number };
  };
}

export interface RetouchConfig {
  autoDetect: boolean;
  intensity: number; // 0-1, intensité des corrections
  preserveOriginal: boolean;
  maxFileSize: number; // Taille max en bytes
  quality: number; // 0-100 pour la compression
}

/** Métriques d'image calculées par calculateImageMetrics. */
interface ImageMetrics {
  brightness: number;
  contrast: number;
  saturation: number;
  sharpness: number;
  whiteBalance: { temperature: number; tint: number };
  exposure: number;
}

export class AutoRetoucher {
  private config: RetouchConfig;

  constructor(config: Partial<RetouchConfig> = {}) {
    this.config = {
      autoDetect: true,
      intensity: 0.7,
      preserveOriginal: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      quality: 90,
      ...config
    };
  }

  /**
   * Analyse une image et suggère des corrections
   */
  async analyzeImage(imageData: Uint8Array, width: number, height: number): Promise<RetouchAnalysis> {
    const metrics = await this.calculateImageMetrics(imageData, width, height);
    const suggestedOptions = this.generateSuggestedOptions(metrics);

    return {
      needsBrightness: this.needsBrightnessCorrection(metrics.brightness),
      needsContrast: this.needsContrastCorrection(metrics.contrast),
      needsSaturation: this.needsSaturationCorrection(metrics.saturation),
      needsSharpness: this.needsSharpnessCorrection(metrics.sharpness),
      needsWhiteBalance: this.needsWhiteBalanceCorrection(metrics.whiteBalance),
      needsExposure: this.needsExposureCorrection(metrics.exposure),
      confidence: this.calculateAnalysisConfidence(metrics),
      suggestedOptions
    };
  }

  /**
   * Applique la retouche automatique à une image
   */
  async retouchImage(
    imageData: Uint8Array,
    width: number,
    height: number,
    options?: Partial<RetouchOptions>
  ): Promise<RetouchResult> {
    const originalImage = this.config.preserveOriginal ? new Uint8Array(imageData) : imageData;

    // Analyser l'image si nécessaire
    let analysis: RetouchAnalysis;
    if (this.config.autoDetect && !options) {
      analysis = await this.analyzeImage(imageData, width, height);
      options = analysis.suggestedOptions;
    } else {
      analysis = await this.analyzeImage(imageData, width, height);
      options = { ...analysis.suggestedOptions, ...options };
    }

    // Appliquer les corrections
    const retouchedImage = await this.applyCorrections(imageData, width, height, options);

    // Calculer les métriques avant/après
    const beforeMetrics = await this.calculateImageMetrics(originalImage, width, height);
    const afterMetrics = await this.calculateImageMetrics(retouchedImage, width, height);

    return {
      success: true,
      originalImage,
      retouchedImage,
      appliedOptions: options as RetouchOptions,
      analysis,
      beforeAfterMetrics: {
        brightness: { before: beforeMetrics.brightness, after: afterMetrics.brightness },
        contrast: { before: beforeMetrics.contrast, after: afterMetrics.contrast },
        saturation: { before: beforeMetrics.saturation, after: afterMetrics.saturation },
        sharpness: { before: beforeMetrics.sharpness, after: afterMetrics.sharpness }
      }
    };
  }

  /**
   * Calcule les métriques d'une image
   */
  private async calculateImageMetrics(imageData: Uint8Array, width: number, height: number): Promise<{
    brightness: number;
    contrast: number;
    saturation: number;
    sharpness: number;
    whiteBalance: { temperature: number; tint: number };
    exposure: number;
  }> {
    const channels = this.separateChannels(imageData, width, height);
    const grayscale = this.convertToGrayscale(imageData, width, height);

    return {
      brightness: this.calculateBrightness(grayscale),
      contrast: this.calculateContrast(grayscale),
      saturation: this.calculateSaturation(channels),
      sharpness: this.calculateSharpness(grayscale, width, height),
      whiteBalance: this.calculateWhiteBalance(channels),
      exposure: this.calculateExposure(grayscale)
    };
  }

  /**
   * Sépare les canaux de couleur
   */
  private separateChannels(imageData: Uint8Array, width: number, height: number): {
    red: number[];
    green: number[];
    blue: number[];
  } {
    const channels = { red: [] as number[], green: [] as number[], blue: [] as number[] };
    const channelsCount = imageData.length / (width * height);

    for (let i = 0; i < width * height; i++) {
      const pixelIndex = i * channelsCount;
      channels.red.push(imageData[pixelIndex] || 0);
      channels.green.push(imageData[pixelIndex + 1] || 0);
      channels.blue.push(imageData[pixelIndex + 2] || 0);
    }

    return channels;
  }

  /**
   * Convertit en niveaux de gris
   */
  private convertToGrayscale(imageData: Uint8Array, width: number, height: number): number[] {
    const grayscale: number[] = [];
    const channelsCount = imageData.length / (width * height);

    for (let i = 0; i < width * height; i++) {
      const pixelIndex = i * channelsCount;
      const r = imageData[pixelIndex] || 0;
      const g = imageData[pixelIndex + 1] || 0;
      const b = imageData[pixelIndex + 2] || 0;

      // Conversion RGB vers grayscale (luminance)
      grayscale.push(0.299 * r + 0.587 * g + 0.114 * b);
    }

    return grayscale;
  }

  /**
   * Calcule la luminosité
   */
  private calculateBrightness(grayscale: number[]): number {
    return grayscale.reduce((sum, value) => sum + value, 0) / grayscale.length;
  }

  /**
   * Calcule le contraste
   */
  private calculateContrast(grayscale: number[]): number {
    const mean = this.calculateBrightness(grayscale);
    const variance = grayscale.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / grayscale.length;
    return Math.sqrt(variance);
  }

  /**
   * Calcule la saturation
   */
  private calculateSaturation(channels: { red: number[]; green: number[]; blue: number[] }): number {
    let totalSaturation = 0;
    const pixelCount = channels.red.length;

    for (let i = 0; i < pixelCount; i++) {
      const r = channels.red[i];
      const g = channels.green[i];
      const b = channels.blue[i];

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max === 0 ? 0 : (max - min) / max;

      totalSaturation += saturation;
    }

    return (totalSaturation / pixelCount) * 100;
  }

  /**
   * Calcule la netteté
   */
  private calculateSharpness(grayscale: number[], width: number, height: number): number {
    // Utilise le filtre de Laplace pour détecter les bords
    const laplacianKernel = [
      [0, -1, 0],
      [-1, 4, -1],
      [0, -1, 0]
    ];

    let sharpness = 0;
    const offset = 1;

    for (let y = offset; y < height - offset; y++) {
      for (let x = offset; x < width - offset; x++) {
        let sum = 0;
        for (let ky = 0; ky < 3; ky++) {
          for (let kx = 0; kx < 3; kx++) {
            const px = x + kx - offset;
            const py = y + ky - offset;
            const pixelIndex = py * width + px;
            sum += grayscale[pixelIndex] * laplacianKernel[ky][kx];
          }
        }
        sharpness += Math.abs(sum);
      }
    }

    return sharpness / ((width - 2) * (height - 2));
  }

  /**
   * Calcule la balance des blancs
   */
  private calculateWhiteBalance(channels: { red: number[]; green: number[]; blue: number[] }): {
    temperature: number;
    tint: number;
  } {
    const rMean = channels.red.reduce((sum, value) => sum + value, 0) / channels.red.length;
    const gMean = channels.green.reduce((sum, value) => sum + value, 0) / channels.green.length;
    const bMean = channels.blue.reduce((sum, value) => sum + value, 0) / channels.blue.length;

    // Calcul simplifié de la température et de la teinte
    const temperature = ((rMean + bMean) / 2 - gMean) * 2;
    const tint = (rMean - bMean) * 2;

    return {
      temperature: Math.max(-100, Math.min(100, temperature)),
      tint: Math.max(-100, Math.min(100, tint))
    };
  }

  /**
   * Calcule l'exposition
   */
  private calculateExposure(grayscale: number[]): number {
    const mean = this.calculateBrightness(grayscale);
    // Normalise l'exposition (0 = sous-exposé, 128 = correct, 255 = surexposé)
    return (mean - 128) / 128 * 100;
  }

  /**
   * Génère les options suggérées
   */
  private generateSuggestedOptions(metrics: ImageMetrics): RetouchOptions {
    const intensity = this.config.intensity;

    return {
      brightness: this.suggestBrightness(metrics.brightness) * intensity,
      contrast: this.suggestContrast(metrics.contrast) * intensity,
      saturation: this.suggestSaturation(metrics.saturation) * intensity,
      sharpness: this.suggestSharpness(metrics.sharpness) * intensity,
      whiteBalance: {
        temperature: this.suggestTemperature(metrics.whiteBalance.temperature) * intensity,
        tint: this.suggestTint(metrics.whiteBalance.tint) * intensity
      },
      exposure: this.suggestExposure(metrics.exposure) * intensity,
      highlights: 0,
      shadows: 0,
      vibrance: this.suggestVibrance(metrics.saturation) * intensity
    };
  }

  /**
   * Applique les corrections à l'image
   */
  private async applyCorrections(
    imageData: Uint8Array,
    width: number,
    height: number,
    options: Partial<RetouchOptions>
  ): Promise<Uint8Array> {
    const result = new Uint8Array(imageData);
    const channelsCount = imageData.length / (width * height);

    for (let i = 0; i < width * height; i++) {
      const pixelIndex = i * channelsCount;

      // Appliquer les corrections pixel par pixel
      for (let c = 0; c < Math.min(3, channelsCount); c++) {
        let value = imageData[pixelIndex + c];

        // Luminosité
        value = this.adjustBrightness(value, options.brightness);

        // Contraste
        value = this.adjustContrast(value, options.contrast);

        // Exposition
        value = this.adjustExposure(value, options.exposure);

        // Balance des blancs
        if (c === 0) value = this.adjustTemperature(value, options.whiteBalance.temperature);
        if (c === 2) value = this.adjustTint(value, options.whiteBalance.tint);

        // Saturation
        if (c < 3) value = this.adjustSaturation(value, options.saturation, c);

        result[pixelIndex + c] = Math.max(0, Math.min(255, Math.round(value)));
      }
    }

    return result;
  }

  /**
   * Ajuste la luminosité
   */
  private adjustBrightness(value: number, adjustment: number): number {
    return value + (adjustment * 2.55);
  }

  /**
   * Ajuste le contraste
   */
  private adjustContrast(value: number, adjustment: number): number {
    const factor = (259 * (adjustment + 255)) / (255 * (259 - adjustment));
    return factor * (value - 128) + 128;
  }

  /**
   * Ajuste l'exposition
   */
  private adjustExposure(value: number, adjustment: number): number {
    return value * (1 + adjustment / 100);
  }

  /**
   * Ajuste la température
   */
  private adjustTemperature(value: number, adjustment: number): number {
    return value + (adjustment * 0.5);
  }

  /**
   * Ajuste la teinte
   */
  private adjustTint(value: number, adjustment: number): number {
    return value + (adjustment * 0.3);
  }

  /**
   * Ajuste la saturation
   */
  private adjustSaturation(value: number, adjustment: number, _channel: number): number {
    // Saturation affecte différemment chaque canal
    const factor = 1 + (adjustment / 100);
    return value * factor;
  }

  // Méthodes de suggestion
  private suggestBrightness(brightness: number): number {
    if (brightness < 80) return 20;
    if (brightness > 200) return -20;
    return 0;
  }

  private suggestContrast(contrast: number): number {
    if (contrast < 30) return 30;
    if (contrast > 80) return -20;
    return 0;
  }

  private suggestSaturation(saturation: number): number {
    if (saturation < 20) return 30;
    if (saturation > 80) return -20;
    return 0;
  }

  private suggestSharpness(sharpness: number): number {
    if (sharpness < 50) return 40;
    return 0;
  }

  private suggestTemperature(temperature: number): number {
    if (Math.abs(temperature) > 20) return -temperature * 0.5;
    return 0;
  }

  private suggestTint(tint: number): number {
    if (Math.abs(tint) > 20) return -tint * 0.5;
    return 0;
  }

  private suggestExposure(exposure: number): number {
    if (exposure < -20) return 30;
    if (exposure > 20) return -30;
    return 0;
  }

  private suggestVibrance(saturation: number): number {
    if (saturation < 30) return 20;
    return 0;
  }

  // Méthodes de détection de besoin de correction
  private needsBrightnessCorrection(brightness: number): boolean {
    return brightness < 80 || brightness > 200;
  }

  private needsContrastCorrection(contrast: number): boolean {
    return contrast < 30 || contrast > 80;
  }

  private needsSaturationCorrection(saturation: number): boolean {
    return saturation < 20 || saturation > 80;
  }

  private needsSharpnessCorrection(sharpness: number): boolean {
    return sharpness < 50;
  }

  private needsWhiteBalanceCorrection(whiteBalance: { temperature: number; tint: number }): boolean {
    return Math.abs(whiteBalance.temperature) > 20 || Math.abs(whiteBalance.tint) > 20;
  }

  private needsExposureCorrection(exposure: number): boolean {
    return Math.abs(exposure) > 20;
  }

  private calculateAnalysisConfidence(metrics: ImageMetrics): number {
    let confidence = 0;
    let factors = 0;

    if (this.needsBrightnessCorrection(metrics.brightness)) {
      confidence += 0.2;
      factors++;
    }
    if (this.needsContrastCorrection(metrics.contrast)) {
      confidence += 0.2;
      factors++;
    }
    if (this.needsSaturationCorrection(metrics.saturation)) {
      confidence += 0.2;
      factors++;
    }
    if (this.needsSharpnessCorrection(metrics.sharpness)) {
      confidence += 0.2;
      factors++;
    }
    if (this.needsWhiteBalanceCorrection(metrics.whiteBalance)) {
      confidence += 0.1;
      factors++;
    }
    if (this.needsExposureCorrection(metrics.exposure)) {
      confidence += 0.1;
      factors++;
    }

    return factors > 0 ? confidence / factors : 0;
  }

  /**
   * Met à jour la configuration
   */
  updateConfig(newConfig: Partial<RetouchConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}
