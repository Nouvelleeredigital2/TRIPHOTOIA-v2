export interface PhotoScore {
  overall: number; // Score global 0-100
  sharpness: number; // Netteté 0-100
  exposure: number; // Exposition 0-100
  composition: number; // Composition 0-100
  expression: number; // Expression 0-100
  noise: number; // Bruit 0-100 (plus élevé = moins de bruit)
  color: number; // Qualité des couleurs 0-100
  details: {
    ruleOfThirds: number;
    faceDetection: number;
    eyeOpenness: number;
    smileDetection: number;
    symmetry: number;
    leadingLines: number;
    colorHarmony: number;
    dynamicRange: number;
  };
}

export interface ScoringWeights {
  sharpness: number;
  exposure: number;
  composition: number;
  expression: number;
  noise: number;
  color: number;
}

export interface ScoringConfig {
  weights: ScoringWeights;
  enableFaceDetection: boolean;
  enableCompositionAnalysis: boolean;
  enableColorAnalysis: boolean;
  minScoreThreshold: number;
  autoSelectThreshold: number;
}

export interface PhotoRanking {
  photoId: string;
  score: PhotoScore;
  rank: number;
  isRecommended: boolean;
  reasons: string[];
}

export class PhotoScorer {
  private config: ScoringConfig;

  constructor(config: Partial<ScoringConfig> = {}) {
    this.config = {
      weights: {
        sharpness: 0.25,
        exposure: 0.20,
        composition: 0.20,
        expression: 0.15,
        noise: 0.10,
        color: 0.10
      },
      enableFaceDetection: true,
      enableCompositionAnalysis: true,
      enableColorAnalysis: true,
      minScoreThreshold: 30,
      autoSelectThreshold: 70,
      ...config
    };
  }

  /**
   * Calcule le score complet d'une photo
   */
  async scorePhoto(
    photoId: string,
    imageData: Uint8Array,
    width: number,
    height: number,
    metadata?: any
  ): Promise<PhotoScore> {
    const grayscale = this.convertToGrayscale(imageData, width, height);
    const channels = this.separateChannels(imageData, width, height);

    // Calculer les scores individuels
    const sharpness = await this.calculateSharpnessScore(grayscale, width, height);
    const exposure = this.calculateExposureScore(grayscale);
    const composition = this.calculateCompositionScore(grayscale, width, height);
    const expression = await this.calculateExpressionScore(imageData, width, height);
    const noise = this.calculateNoiseScore(grayscale, width, height);
    const color = this.calculateColorScore(channels);

    // Calculer les détails
    const details = await this.calculateDetailedScores(imageData, width, height, grayscale, channels);

    // Calculer le score global pondéré
    const overall = this.calculateOverallScore({
      sharpness,
      exposure,
      composition,
      expression,
      noise,
      color
    });

    return {
      overall,
      sharpness,
      exposure,
      composition,
      expression,
      noise,
      color,
      details
    };
  }

  /**
   * Classe un groupe de photos et recommande les meilleures
   */
  async rankPhotos(
    photos: Array<{
      id: string;
      imageData: Uint8Array;
      width: number;
      height: number;
      metadata?: any;
    }>
  ): Promise<PhotoRanking[]> {
    const scores = await Promise.all(
      photos.map(photo => this.scorePhoto(photo.id, photo.imageData, photo.width, photo.height, photo.metadata))
    );

    const rankings: PhotoRanking[] = photos.map((photo, index) => ({
      photoId: photo.id,
      score: scores[index],
      rank: 0,
      isRecommended: false,
      reasons: []
    }));

    // Trier par score global
    rankings.sort((a, b) => b.score.overall - a.score.overall);

    // Assigner les rangs
    rankings.forEach((ranking, index) => {
      ranking.rank = index + 1;
      ranking.isRecommended = ranking.score.overall >= this.config.autoSelectThreshold;
      ranking.reasons = this.generateRecommendationReasons(ranking.score);
    });

    return rankings;
  }

  /**
   * Calcule le score de netteté
   */
  private async calculateSharpnessScore(grayscale: number[], width: number, height: number): Promise<number> {
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

    const normalizedSharpness = sharpness / ((width - 2) * (height - 2));
    return Math.min(100, Math.max(0, normalizedSharpness * 2));
  }

  /**
   * Calcule le score d'exposition
   */
  private calculateExposureScore(grayscale: number[]): number {
    const mean = grayscale.reduce((sum, value) => sum + value, 0) / grayscale.length;
    const histogram = this.calculateHistogram(grayscale);

    // Score basé sur la distribution de l'histogramme
    const underExposed = histogram.slice(0, 64).reduce((sum, count) => sum + count, 0);
    const wellExposed = histogram.slice(64, 192).reduce((sum, count) => sum + count, 0);
    const overExposed = histogram.slice(192, 256).reduce((sum, count) => sum + count, 0);

    const total = underExposed + wellExposed + overExposed;
    const wellExposedRatio = wellExposed / total;

    // Pénaliser les images sous/surexposées
    let score = wellExposedRatio * 100;
    if (underExposed / total > 0.3) score *= 0.7;
    if (overExposed / total > 0.3) score *= 0.7;

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Calcule le score de composition
   */
  private calculateCompositionScore(grayscale: number[], width: number, height: number): number {
    let score = 50; // Score de base

    // Règle des tiers
    const ruleOfThirds = this.analyzeRuleOfThirds(grayscale, width, height);
    score += ruleOfThirds * 0.3;

    // Symétrie
    const symmetry = this.analyzeSymmetry(grayscale, width, height);
    score += symmetry * 0.2;

    // Lignes directrices
    const leadingLines = this.analyzeLeadingLines(grayscale, width, height);
    score += leadingLines * 0.2;

    // Équilibre des masses
    const balance = this.analyzeBalance(grayscale, width, height);
    score += balance * 0.3;

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Calcule le score d'expression (simulation)
   */
  private async calculateExpressionScore(imageData: Uint8Array, width: number, height: number): Promise<number> {
    // Simulation de détection d'expression
    // Dans une vraie implémentation, on utiliserait face-api.js ou TensorFlow
    const grayscale = this.convertToGrayscale(imageData, width, height);
    const mean = grayscale.reduce((sum, value) => sum + value, 0) / grayscale.length;

    // Simulation basée sur la luminosité et les variations
    const variance = this.calculateVariance(grayscale);
    let score = 50;

    // Plus de variation = potentiellement plus d'expression
    if (variance > 1000) score += 20;
    if (variance > 2000) score += 20;

    // Luminosité modérée = meilleure expression
    if (mean > 100 && mean < 200) score += 10;

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Calcule le score de bruit
   */
  private calculateNoiseScore(grayscale: number[], width: number, height: number): number {
    // Estimation du bruit par analyse des variations locales
    let noiseLevel = 0;
    const offset = 1;

    for (let y = offset; y < height - offset; y++) {
      for (let x = offset; x < width - offset; x++) {
        const center = grayscale[y * width + x];
        let localVariance = 0;
        let count = 0;

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const neighbor = grayscale[(y + dy) * width + (x + dx)];
            localVariance += Math.pow(center - neighbor, 2);
            count++;
          }
        }

        noiseLevel += localVariance / count;
      }
    }

    const avgNoise = noiseLevel / ((width - 2) * (height - 2));
    // Convertir en score (plus de bruit = score plus bas)
    const score = Math.max(0, 100 - avgNoise / 10);
    return Math.min(100, score);
  }

  /**
   * Calcule le score de couleur
   */
  private calculateColorScore(channels: { red: number[]; green: number[]; blue: number[] }): number {
    // Analyse de l'harmonie des couleurs
    const colorHarmony = this.analyzeColorHarmony(channels);
    const saturation = this.calculateSaturation(channels);
    const contrast = this.calculateColorContrast(channels);

    let score = 50;
    score += colorHarmony * 0.4;
    score += (saturation / 100) * 0.3;
    score += (contrast / 100) * 0.3;

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Calcule les scores détaillés
   */
  private async calculateDetailedScores(
    imageData: Uint8Array,
    width: number,
    height: number,
    grayscale: number[],
    channels: { red: number[]; green: number[]; blue: number[] }
  ): Promise<PhotoScore['details']> {
    return {
      ruleOfThirds: this.analyzeRuleOfThirds(grayscale, width, height),
      faceDetection: await this.detectFaces(imageData, width, height),
      eyeOpenness: await this.detectEyeOpenness(imageData, width, height),
      smileDetection: await this.detectSmile(imageData, width, height),
      symmetry: this.analyzeSymmetry(grayscale, width, height),
      leadingLines: this.analyzeLeadingLines(grayscale, width, height),
      colorHarmony: this.analyzeColorHarmony(channels),
      dynamicRange: this.calculateDynamicRange(grayscale)
    };
  }

  /**
   * Calcule le score global pondéré
   */
  private calculateOverallScore(scores: {
    sharpness: number;
    exposure: number;
    composition: number;
    expression: number;
    noise: number;
    color: number;
  }): number {
    const weights = this.config.weights;

    return (
      scores.sharpness * weights.sharpness +
      scores.exposure * weights.exposure +
      scores.composition * weights.composition +
      scores.expression * weights.expression +
      scores.noise * weights.noise +
      scores.color * weights.color
    );
  }

  /**
   * Génère les raisons de recommandation
   */
  private generateRecommendationReasons(score: PhotoScore): string[] {
    const reasons: string[] = [];

    if (score.sharpness > 80) reasons.push('Image très nette');
    if (score.exposure > 80) reasons.push('Exposition parfaite');
    if (score.composition > 80) reasons.push('Composition excellente');
    if (score.expression > 80) reasons.push('Expression captivante');
    if (score.noise > 80) reasons.push('Très peu de bruit');
    if (score.color > 80) reasons.push('Couleurs harmonieuses');

    if (score.details.ruleOfThirds > 0.7) reasons.push('Respecte la règle des tiers');
    if (score.details.symmetry > 0.7) reasons.push('Composition symétrique');
    if (score.details.faceDetection > 0.8) reasons.push('Visage bien détecté');
    if (score.details.eyeOpenness > 0.8) reasons.push('Yeux ouverts');
    if (score.details.smileDetection > 0.7) reasons.push('Sourire détecté');

    return reasons;
  }

  // Méthodes utilitaires
  private convertToGrayscale(imageData: Uint8Array, width: number, height: number): number[] {
    const grayscale: number[] = [];
    const channelsCount = imageData.length / (width * height);

    for (let i = 0; i < width * height; i++) {
      const pixelIndex = i * channelsCount;
      const r = imageData[pixelIndex] || 0;
      const g = imageData[pixelIndex + 1] || 0;
      const b = imageData[pixelIndex + 2] || 0;
      grayscale.push(0.299 * r + 0.587 * g + 0.114 * b);
    }

    return grayscale;
  }

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

  private calculateHistogram(grayscale: number[]): number[] {
    const histogram = new Array(256).fill(0);
    grayscale.forEach(value => histogram[Math.floor(value)]++);
    return histogram;
  }

  private calculateVariance(values: number[]): number {
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
    return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / values.length;
  }

  // Méthodes d'analyse de composition (simulations)
  private analyzeRuleOfThirds(grayscale: number[], width: number, height: number): number {
    // Simulation de l'analyse de la règle des tiers
    const thirdWidth = width / 3;
    const thirdHeight = height / 3;

    // Vérifier les points d'intersection des lignes de tiers
    const points = [
      { x: thirdWidth, y: thirdHeight },
      { x: thirdWidth * 2, y: thirdHeight },
      { x: thirdWidth, y: thirdHeight * 2 },
      { x: thirdWidth * 2, y: thirdHeight * 2 }
    ];

    let score = 0;
    points.forEach(point => {
      const pixelIndex = Math.floor(point.y) * width + Math.floor(point.x);
      if (pixelIndex < grayscale.length) {
        // Plus la valeur est différente de la moyenne, plus c'est intéressant
        const value = grayscale[pixelIndex];
        const localMean = this.calculateLocalMean(grayscale, width, height, point.x, point.y, 20);
        score += Math.abs(value - localMean) / 255;
      }
    });

    return Math.min(1, score / points.length);
  }

  private analyzeSymmetry(grayscale: number[], width: number, height: number): number {
    // Simulation de l'analyse de symétrie
    let symmetryScore = 0;
    const centerX = width / 2;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < centerX; x++) {
        const leftPixel = grayscale[y * width + x];
        const rightPixel = grayscale[y * width + (width - 1 - x)];
        const difference = Math.abs(leftPixel - rightPixel);
        symmetryScore += 1 - (difference / 255);
      }
    }

    return symmetryScore / (height * centerX);
  }

  private analyzeLeadingLines(grayscale: number[], width: number, height: number): number {
    // Simulation de la détection de lignes directrices
    // Utilise un filtre de détection de bords simple
    let lineScore = 0;
    const sobelX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
    const sobelY = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gx = 0, gy = 0;

        for (let ky = 0; ky < 3; ky++) {
          for (let kx = 0; kx < 3; kx++) {
            const pixelIndex = (y + ky - 1) * width + (x + kx - 1);
            const pixel = grayscale[pixelIndex];
            gx += pixel * sobelX[ky][kx];
            gy += pixel * sobelY[ky][kx];
          }
        }

        const magnitude = Math.sqrt(gx * gx + gy * gy);
        if (magnitude > 50) { // Seuil pour détecter les bords
          lineScore += magnitude / 255;
        }
      }
    }

    return Math.min(1, lineScore / (width * height));
  }

  private analyzeBalance(grayscale: number[], width: number, height: number): number {
    // Simulation de l'analyse d'équilibre des masses
    const leftHalf = grayscale.slice(0, Math.floor(grayscale.length / 2));
    const rightHalf = grayscale.slice(Math.floor(grayscale.length / 2));

    const leftMean = leftHalf.reduce((sum, value) => sum + value, 0) / leftHalf.length;
    const rightMean = rightHalf.reduce((sum, value) => sum + value, 0) / rightHalf.length;

    const balance = 1 - Math.abs(leftMean - rightMean) / 255;
    return Math.max(0, balance);
  }

  private analyzeColorHarmony(channels: { red: number[]; green: number[]; blue: number[] }): number {
    // Simulation de l'analyse d'harmonie des couleurs
    const rMean = channels.red.reduce((sum, value) => sum + value, 0) / channels.red.length;
    const gMean = channels.green.reduce((sum, value) => sum + value, 0) / channels.green.length;
    const bMean = channels.blue.reduce((sum, value) => sum + value, 0) / channels.blue.length;

    // Calculer la variance des couleurs (plus de variance = plus d'harmonie potentielle)
    const colorVariance = this.calculateVariance([rMean, gMean, bMean]);
    return Math.min(1, colorVariance / 10000);
  }

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

  private calculateColorContrast(channels: { red: number[]; green: number[]; blue: number[] }): number {
    // Simulation du calcul de contraste des couleurs
    const rVariance = this.calculateVariance(channels.red);
    const gVariance = this.calculateVariance(channels.green);
    const bVariance = this.calculateVariance(channels.blue);

    return (rVariance + gVariance + bVariance) / 3;
  }

  private calculateDynamicRange(grayscale: number[]): number {
    let min = 255;
    let max = 0;
    for (const v of grayscale) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return (max - min) / 255;
  }

  private calculateLocalMean(grayscale: number[], width: number, height: number, centerX: number, centerY: number, radius: number): number {
    let sum = 0;
    let count = 0;

    for (let y = Math.max(0, centerY - radius); y < Math.min(height, centerY + radius); y++) {
      for (let x = Math.max(0, centerX - radius); x < Math.min(width, centerX + radius); x++) {
        const pixelIndex = y * width + x;
        sum += grayscale[pixelIndex];
        count++;
      }
    }

    return count > 0 ? sum / count : 0;
  }

  // Méthodes de détection (simulations)
  private async detectFaces(imageData: Uint8Array, width: number, height: number): Promise<number> {
    // Simulation de détection de visages
    // Dans une vraie implémentation, on utiliserait face-api.js
    return Math.random() * 0.5 + 0.3; // Simulation
  }

  private async detectEyeOpenness(imageData: Uint8Array, width: number, height: number): Promise<number> {
    // Simulation de détection d'ouverture des yeux
    return Math.random() * 0.4 + 0.6; // Simulation
  }

  private async detectSmile(imageData: Uint8Array, width: number, height: number): Promise<number> {
    // Simulation de détection de sourire
    return Math.random() * 0.3 + 0.4; // Simulation
  }

  /**
   * Met à jour la configuration
   */
  updateConfig(newConfig: Partial<ScoringConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Obtient les statistiques de scoring
   */
  getStats(): { totalPhotos: number; averageScore: number; recommendations: number } {
    // Cette méthode devrait être implémentée avec un système de persistance
    return { totalPhotos: 0, averageScore: 0, recommendations: 0 };
  }
}
