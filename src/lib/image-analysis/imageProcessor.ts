/**
 * Processeur d'images local utilisant Canvas API
 * Fournit des fonctions d'analyse d'images sans d??pendances externes
 */

import { performanceTracker, analysisCache } from '../performance-tracker';

export interface ImageAnalysisResult {
  isBlurry: boolean;
  sharpnessScore: number;
  hasOpenEyes: boolean;
  tags: string[];
  perceptualHash: string;
  compositionScore?: {
    ruleOfThirdsScore: number;
    symmetryScore: number;
    leadingLinesScore: number;
    overallCompositionScore: number;
  };
  suggestedRetouch: {
    brightness: number;
    contrast: number;
    saturation: number;
  };
  metadata: {
    width: number;
    height: number;
    aspectRatio: number;
    dominantColors: string[];
  };
}

export class ImageProcessor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  }

  /**
   * Analyse complète d'une image avec cache et suivi des performances
   */
  async analyzeImage(file: File): Promise<ImageAnalysisResult> {
    const operationId = performanceTracker.startOperation('analyzeImage', {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type
    });

    try {
      // Check cache first
      const cachedResult = analysisCache.get<ImageAnalysisResult>(file);
      if (cachedResult) {
        performanceTracker.endOperation(operationId, true);
        console.log('📋 Cache hit for:', file.name);
        return cachedResult;
      }

      const image = await this.loadImage(file);
      const imageData = this.getImageData(image);

      // Analyses parallèles avec suivi de performance
      const analysisStartTime = performance.now();

      const [
        blurAnalysis,
        colorAnalysis,
        compositionAnalysis,
        metadata
      ] = await Promise.all([
        this.analyzeBlur(imageData),
        this.analyzeColors(imageData),
        this.analyzeComposition(imageData),
        this.extractMetadata(image)
      ]);

      const analysisDuration = performance.now() - analysisStartTime;

      const result: ImageAnalysisResult = {
        isBlurry: blurAnalysis.isBlurry,
        sharpnessScore: blurAnalysis.sharpnessScore,
        hasOpenEyes: this.detectEyes(imageData),
        tags: this.generateTags(imageData, metadata),
        perceptualHash: this.generatePerceptualHash(imageData),
        compositionScore: compositionAnalysis,
        suggestedRetouch: this.suggestRetouch(imageData, blurAnalysis, colorAnalysis),
        metadata
      };

      // Cache the result
      analysisCache.set(file, result, { analysisDuration }, 300000); // 5 minutes TTL

      performanceTracker.endOperation(operationId, true);
      console.log(`✅ Analysis completed for ${file.name} in ${analysisDuration.toFixed(2)}ms`);

      return result;
    } catch (error) {
      console.error('❌ Analysis failed for:', file.name, error);
      performanceTracker.endOperation(operationId, false);
      throw error;
    }
  }

  /**
   * Charge une image depuis un fichier
   */
  private loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Obtient les donn??es d'image depuis le canvas
   */
  private getImageData(image: HTMLImageElement): ImageData {
    this.canvas.width = image.width;
    this.canvas.height = image.height;
    this.ctx.drawImage(image, 0, 0);
    return this.ctx.getImageData(0, 0, image.width, image.height);
  }

  /**
   * Analyse du flou avec l'algorithme de Laplacian
   */
  private async analyzeBlur(imageData: ImageData): Promise<{
    isBlurry: boolean;
    sharpnessScore: number;
  }> {
    // Combine Laplacian variance, FFT-based analysis, and Sobel gradients for robust sharpness detection
    const laplacianVariance = this.calculateLaplacianVariance(imageData);
    const fftSharpness = await this.calculateFFTSharpness(imageData);
    const sobelSharpness = this.calculateSobelSharpness(imageData);

    // Weighted combination: 40% Laplacian, 30% FFT, 30% Sobel for optimal accuracy
    const combinedSharpness = (laplacianVariance * 0.4 + fftSharpness * 0.3 + sobelSharpness * 0.3) / 1000;
    const sharpnessScore = Math.min(Math.max(combinedSharpness, 0), 1.0);
    const isBlurry = sharpnessScore < 0.3;

    return { isBlurry, sharpnessScore };
  }

  /**
   * Analyse de la composition (règle des tiers, symétrie, lignes directrices)
   */
  private analyzeComposition(imageData: ImageData): {
    ruleOfThirdsScore: number;
    symmetryScore: number;
    leadingLinesScore: number;
    overallCompositionScore: number;
  } {
    const { data, width, height } = imageData;

    // Rule of thirds analysis
    const ruleOfThirdsScore = this.analyzeRuleOfThirds(data, width, height);

    // Symmetry analysis
    const symmetryScore = this.analyzeSymmetry(data, width, height);

    // Leading lines analysis
    const leadingLinesScore = this.analyzeLeadingLines(data, width, height);

    // Overall composition score (weighted average)
    const overallCompositionScore = (ruleOfThirdsScore * 0.4 + symmetryScore * 0.3 + leadingLinesScore * 0.3);

    return {
      ruleOfThirdsScore,
      symmetryScore,
      leadingLinesScore,
      overallCompositionScore
    };
  }

  /**
   * Analyse le respect de la règle des tiers
   */
  private analyzeRuleOfThirds(data: Uint8ClampedArray, width: number, height: number): number {
    // Points d'intérêt de la règle des tiers (intersections des lignes)
    const thirdWidth = width / 3;
    const thirdHeight = height / 3;

    const interestPoints = [
      { x: thirdWidth, y: thirdHeight },
      { x: 2 * thirdWidth, y: thirdHeight },
      { x: thirdWidth, y: 2 * thirdHeight },
      { x: 2 * thirdWidth, y: 2 * thirdHeight }
    ];

    let totalInterest = 0;
    let maxPossible = 0;

    for (const point of interestPoints) {
      const x = Math.floor(point.x);
      const y = Math.floor(point.y);

      if (x >= 0 && x < width && y >= 0 && y < height) {
        const pixelIndex = (y * width + x) * 4;
        const gray = this.getGrayValue(data, pixelIndex);

        // Calculate local contrast around the point
        const contrast = this.calculateLocalContrast(data, width, height, x, y, 20);
        totalInterest += contrast;
        maxPossible += 1;
      }
    }

    return maxPossible > 0 ? totalInterest / maxPossible : 0;
  }

  /**
   * Analyse la symétrie de l'image
   */
  private analyzeSymmetry(data: Uint8ClampedArray, width: number, height: number): number {
    let symmetryScore = 0;
    let totalComparisons = 0;

    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);

    // Compare left and right sides
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < centerX; x++) {
        const leftIndex = (y * width + x) * 4;
        const rightIndex = (y * width + (width - 1 - x)) * 4;

        const leftGray = this.getGrayValue(data, leftIndex);
        const rightGray = this.getGrayValue(data, rightIndex);

        const difference = Math.abs(leftGray - rightGray);
        symmetryScore += (255 - difference) / 255; // Higher score for smaller differences
        totalComparisons++;
      }
    }

    return totalComparisons > 0 ? symmetryScore / totalComparisons : 0;
  }

  /**
   * Analyse les lignes directrices (leading lines)
   */
  private analyzeLeadingLines(data: Uint8ClampedArray, width: number, height: number): number {
    // Use edge detection to find potential leading lines
    const edges = this.detectEdges(data, width, height);

    // Look for diagonal and converging lines
    let lineStrength = 0;
    let totalLines = 0;

    // Analyze diagonal patterns that could be leading lines
    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        const currentIndex = y * width + x;
        const rightIndex = y * width + (x + 1);
        const downIndex = (y + 1) * width + x;

        // Check for diagonal edges (potential leading lines)
        if (edges[currentIndex] && edges[rightIndex] && edges[downIndex]) {
          lineStrength += 1;
          totalLines++;
        }
      }
    }

    return totalLines > 0 ? lineStrength / totalLines : 0;
  }

  /**
   * Détecte les contours avec l'opérateur Sobel
   */
  private detectEdges(data: Uint8ClampedArray, width: number, height: number): boolean[] {
    const edges = new Array(width * height).fill(false);

    const sobelX = [
      [-1, 0, 1],
      [-2, 0, 2],
      [-1, 0, 1]
    ];

    const sobelY = [
      [-1, -2, -1],
      [0, 0, 0],
      [1, 2, 1]
    ];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gx = 0, gy = 0;

        for (let ky = 0; ky < 3; ky++) {
          for (let kx = 0; kx < 3; kx++) {
            const pixelIndex = ((y + ky - 1) * width + (x + kx - 1)) * 4;
            const gray = this.getGrayValue(data, pixelIndex);

            gx += gray * sobelX[ky][kx];
            gy += gray * sobelY[ky][kx];
          }
        }

        const gradient = Math.sqrt(gx * gx + gy * gy);
        edges[y * width + x] = gradient > 50; // Threshold for edge detection
      }
    }

    return edges;
  }

  /**
   * Calcule le contraste local autour d'un point
   */
  private calculateLocalContrast(data: Uint8ClampedArray, width: number, height: number, centerX: number, centerY: number, radius: number): number {
    let min = 255;
    let max = 0;
    let pixelCount = 0;

    for (let y = centerY - radius; y <= centerY + radius; y++) {
      for (let x = centerX - radius; x <= centerX + radius; x++) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          const pixelIndex = (y * width + x) * 4;
          const gray = this.getGrayValue(data, pixelIndex);

          min = Math.min(min, gray);
          max = Math.max(max, gray);
          pixelCount++;
        }
      }
    }

    return pixelCount > 0 ? (max - min) / 255 : 0;
  }

  /**
   * Estimates sharpness using Sobel gradient variance.
   */
  private calculateSobelSharpness(imageData: ImageData): number {
    const { data, width, height } = imageData;

    if (width < 3 || height < 3) {
      return 0;
    }

    const sobelX = [
      [-1, 0, 1],
      [-2, 0, 2],
      [-1, 0, 1]
    ];

    const sobelY = [
      [-1, -2, -1],
      [0, 0, 0],
      [1, 2, 1]
    ];

    let gradientSum = 0;
    let gradientSumSquared = 0;
    let sampleCount = 0;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gx = 0;
        let gy = 0;

        for (let ky = 0; ky < 3; ky++) {
          for (let kx = 0; kx < 3; kx++) {
            const pixelIndex = ((y + ky - 1) * width + (x + kx - 1)) * 4;
            const gray = this.getGrayValue(data, pixelIndex);
            gx += gray * sobelX[ky][kx];
            gy += gray * sobelY[ky][kx];
          }
        }

        const magnitude = Math.sqrt(gx * gx + gy * gy);
        gradientSum += magnitude;
        gradientSumSquared += magnitude * magnitude;
        sampleCount++;
      }
    }

    if (sampleCount === 0) {
      return 0;
    }

    const mean = gradientSum / sampleCount;
    const variance = Math.max((gradientSumSquared / sampleCount) - mean * mean, 0);
    const normalized = Math.min(variance / 5000, 1);

    return normalized * 1000;
  }

  /**
   * Calcule la netteté basée sur l'analyse des hautes fréquences via FFT
   */
  private async calculateFFTSharpness(imageData: ImageData): Promise<number> {
    const { data, width, height } = imageData;

    // Convert to grayscale
    const grayData = new Float64Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      grayData[i / 4] = gray;
    }

    // Apply 2D FFT (simplified implementation)
    const fftResult = this.simpleFFT2D(grayData, width, height);

    // Calculate high-frequency energy (focus on higher frequencies)
    let highFreqEnergy = 0;
    let totalEnergy = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const distance = Math.sqrt(x * x + y * y);
        const magnitude = fftResult[y * width + x];

        totalEnergy += magnitude;

        // Consider frequencies above 20% of maximum as high frequencies
        if (distance > Math.min(width, height) * 0.2) {
          highFreqEnergy += magnitude;
        }
      }
    }

    // Sharpness score based on high-frequency content ratio
    const sharpnessRatio = totalEnergy > 0 ? highFreqEnergy / totalEnergy : 0;
    return sharpnessRatio * 1000; // Scale to match Laplacian variance range
  }

  /**
   * Simplified 2D FFT implementation for sharpness analysis
   */
  private simpleFFT2D(data: Float64Array, width: number, height: number): Float64Array {
    const result = new Float64Array(width * height);

    // This is a simplified FFT approximation for performance
    // In a real implementation, you'd use a proper FFT library
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const value = data[idx];

        // Simple frequency analysis using gradient magnitude
        let gradientSum = 0;
        const neighbors = [
          [-1, -1], [-1, 0], [-1, 1],
          [0, -1],           [0, 1],
          [1, -1],  [1, 0],  [1, 1]
        ];

        for (const [dx, dy] of neighbors) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nidx = ny * width + nx;
            const diff = Math.abs(value - data[nidx]);
            gradientSum += diff;
          }
        }

        // Higher gradient = more high-frequency content = sharper image
        result[idx] = gradientSum / neighbors.length;
      }
    }

    return result;
  }

  /**
   * Calcule la variance de Laplacian pour d??tecter le flou
   */
  private calculateLaplacianVariance(imageData: ImageData): number {
    const { data, width, height } = imageData;
    const laplacianKernel = [
      [0, -1, 0],
      [-1, 4, -1],
      [0, -1, 0]
    ];

    let sum = 0;
    let sumSquared = 0;
    let count = 0;

    // Convertir en niveaux de gris et appliquer le kernel Laplacian
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let laplacianValue = 0;
        
        for (let ky = 0; ky < 3; ky++) {
          for (let kx = 0; kx < 3; kx++) {
            const pixelIndex = ((y + ky - 1) * width + (x + kx - 1)) * 4;
            const gray = this.getGrayValue(data, pixelIndex);
            laplacianValue += gray * laplacianKernel[ky][kx];
          }
        }

        sum += laplacianValue;
        sumSquared += laplacianValue * laplacianValue;
        count++;
      }
    }

    const mean = sum / count;
    const variance = (sumSquared / count) - (mean * mean);
    return variance;
  }

  /**
   * Obtient la valeur de gris d'un pixel
   */
  private getGrayValue(data: Uint8ClampedArray, index: number): number {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    return 0.299 * r + 0.587 * g + 0.114 * b; // Formule de luminance
  }

  /**
   * Analyse les couleurs de l'image
   */
  private analyzeColors(imageData: ImageData): {
    brightness: number;
    contrast: number;
    saturation: number;
  } {
    const { data, width, height } = imageData;
    let totalBrightness = 0;
    let totalSaturation = 0;
    let pixelCount = 0;

    // Calculer la luminosité et la saturation moyennes
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Luminosité (moyenne des composantes RGB)
      const brightness = (r + g + b) / 3;
      totalBrightness += brightness;

      // Saturation (écart-type des composantes RGB)
      const mean = brightness;
      const variance = ((r - mean) ** 2 + (g - mean) ** 2 + (b - mean) ** 2) / 3;
      const saturation = Math.sqrt(variance);
      totalSaturation += saturation;

      pixelCount++;
    }

    const avgBrightness = totalBrightness / pixelCount;
    const avgSaturation = totalSaturation / pixelCount;

    // Calculer le contraste (écart-type de la luminosité)
    let brightnessVariance = 0;
    for (let i = 0; i < data.length; i += 4) {
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      brightnessVariance += (brightness - avgBrightness) ** 2;
    }
    const contrast = Math.sqrt(brightnessVariance / pixelCount);

    // Normaliser les valeurs (0-1)
    const normalizedBrightness = avgBrightness / 255;
    const normalizedContrast = Math.min(contrast / 128, 1); // Normaliser à 128 comme valeur max typique
    const normalizedSaturation = Math.min(avgSaturation / 128, 1);

    return {
      brightness: normalizedBrightness,
      contrast: normalizedContrast,
      saturation: normalizedSaturation
    };
  }

  /**
   * Détecte la présence d'yeux ouverts
   */
  private detectEyes(imageData: ImageData): boolean {
    const { data, width, height } = imageData;

    // Zone centrale où chercher les yeux (tiers supérieur du visage)
    const centerY = Math.floor(height * 0.3);
    const searchHeight = Math.floor(height * 0.2);
    const centerX = Math.floor(width * 0.5);
    const searchWidth = Math.floor(width * 0.3);

    let eyeRegions = 0;
    let totalContrast = 0;

    // Analyser la zone centrale pour détecter des contrastes élevés (yeux)
    for (let y = centerY; y < centerY + searchHeight; y++) {
      for (let x = centerX - searchWidth; x < centerX + searchWidth; x++) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          const index = (y * width + x) * 4;
          const r = data[index];
          const g = data[index + 1];
          const b = data[index + 2];

          // Calculer le contraste local
          const brightness = (r + g + b) / 3;
          const neighbors = this.getNeighborBrightness(data, width, height, x, y);
          const localContrast = Math.abs(brightness - neighbors.avg);

          if (localContrast > 30) { // Seuil de contraste pour les yeux
            eyeRegions++;
            totalContrast += localContrast;
          }
        }
      }
    }

    // Considérer qu'il y a des yeux ouverts s'il y a au moins 2 régions de contraste élevé
    const avgContrast = eyeRegions > 0 ? totalContrast / eyeRegions : 0;
    return eyeRegions >= 2 && avgContrast > 25;
  }

  /**
   * Obtient la luminosité moyenne des voisins d'un pixel
   */
  private getNeighborBrightness(data: Uint8ClampedArray, width: number, height: number, x: number, y: number): { avg: number; count: number } {
    let sum = 0;
    let count = 0;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && !(dx === 0 && dy === 0)) {
          const index = (ny * width + nx) * 4;
          const brightness = (data[index] + data[index + 1] + data[index + 2]) / 3;
          sum += brightness;
          count++;
        }
      }
    }

    return { avg: count > 0 ? sum / count : 0, count };
  }

  /**
   * Génère des tags pour l'image
   */
  private generateTags(imageData: ImageData, metadata: { dominantColors: string[] }): string[] {
    const { data, width, height } = imageData;
    const tags: string[] = [];

    // Analyser les couleurs dominantes
    const colorCounts = new Map<string, number>();
    for (let i = 0; i < data.length; i += 4 * 10) { // Échantillonnage tous les 10 pixels
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Simplifier les couleurs en plages
      const simplifiedR = Math.floor(r / 64) * 64;
      const simplifiedG = Math.floor(g / 64) * 64;
      const simplifiedB = Math.floor(b / 64) * 64;

      const colorKey = `${simplifiedR}-${simplifiedG}-${simplifiedB}`;
      colorCounts.set(colorKey, (colorCounts.get(colorKey) || 0) + 1);
    }

    // Trier les couleurs par fréquence
    const sortedColors = Array.from(colorCounts.entries()).sort((a, b) => b[1] - a[1]);

    // Ajouter des tags basés sur les couleurs dominantes
    if (sortedColors.length > 0) {
      const dominantColor = sortedColors[0][0];
      if (dominantColor.includes('255')) tags.push('clair');
      if (dominantColor.includes('0-0-0')) tags.push('sombre');
      if (dominantColor.includes('255-0-0')) tags.push('rouge');
      if (dominantColor.includes('0-255-0')) tags.push('vert');
      if (dominantColor.includes('0-0-255')) tags.push('bleu');
    }

    // Analyser la composition et ajouter des tags
    const aspectRatio = width / height;
    if (aspectRatio > 1.5) tags.push('paysage');
    else if (aspectRatio < 0.7) tags.push('portrait');
    else tags.push('carré');

    // Ajouter des tags basés sur la luminosité moyenne
    let totalBrightness = 0;
    for (let i = 0; i < data.length; i += 4) {
      totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    const avgBrightness = totalBrightness / (data.length / 4);

    if (avgBrightness > 200) tags.push('lumineux');
    else if (avgBrightness < 50) tags.push('sombre');

    // Ajouter des tags basés sur la saturation
    let totalSaturation = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max === 0 ? 0 : (max - min) / max;
      totalSaturation += saturation;
    }
    const avgSaturation = totalSaturation / (data.length / 4);

    if (avgSaturation > 0.7) tags.push('vif');
    else if (avgSaturation < 0.3) tags.push('pâle');

    return [...new Set(tags)]; // Supprimer les doublons
  }

  /**
   * Génère un hash perceptuel pHash 8×8 = 64 bits pour la détection de doublons.
   *
   * Retourne une chaîne binaire de 64 caractères ('0'/'1') compatible avec le
   * LSH (hashLength=64) et la distance de Hamming bit-à-bit du store.
   */
  private generatePerceptualHash(imageData: ImageData): string {
    const { data, width, height } = imageData;

    // Réduire à 8×8 (= 64 pixels)
    const resized = this.resizeImage(data, width, height, 8, 8);

    // Calculer la luminance moyenne sur les 64 pixels
    let sum = 0;
    const pixelCount = resized.length / 4;
    for (let i = 0; i < resized.length; i += 4) {
      sum += this.getGrayValue(resized, i);
    }
    const average = sum / pixelCount;

    // Hash binaire 64 chars : '1' si pixel > moyenne, '0' sinon
    let hash = '';
    for (let i = 0; i < resized.length; i += 4) {
      hash += this.getGrayValue(resized, i) > average ? '1' : '0';
    }

    return hash; // 64 chars of '0'/'1'
  }

  /**
   * Redimensionne une image
   */
  private resizeImage(data: Uint8ClampedArray, srcWidth: number, srcHeight: number, dstWidth: number, dstHeight: number): Uint8ClampedArray {
    const dstData = new Uint8ClampedArray(dstWidth * dstHeight * 4);
    const xRatio = srcWidth / dstWidth;
    const yRatio = srcHeight / dstHeight;

    for (let y = 0; y < dstHeight; y++) {
      for (let x = 0; x < dstWidth; x++) {
        const srcX = Math.floor(x * xRatio);
        const srcY = Math.floor(y * yRatio);
        const srcIndex = (srcY * srcWidth + srcX) * 4;
        const dstIndex = (y * dstWidth + x) * 4;

        dstData[dstIndex] = data[srcIndex];
        dstData[dstIndex + 1] = data[srcIndex + 1];
        dstData[dstIndex + 2] = data[srcIndex + 2];
        dstData[dstIndex + 3] = data[srcIndex + 3];
      }
    }

    return dstData;
  }

  /**
   * Extrait les métadonnées de l'image
   */
  private extractMetadata(image: HTMLImageElement): {
    width: number;
    height: number;
    aspectRatio: number;
    dominantColors: string[];
  } {
    return {
      width: image.width,
      height: image.height,
      aspectRatio: image.width / image.height,
      dominantColors: [] // Sera rempli par analyzeColors
    };
  }

  /**
   * Suggère des ajustements de retouche optimisés pour GPU
   */
  private suggestRetouch(imageData: ImageData, blurAnalysis: { isBlurry: boolean; sharpnessScore: number }, colorAnalysis: { brightness: number; contrast: number; saturation: number }): {
    brightness: number;
    contrast: number;
    saturation: number;
  } {
    let brightness = 1.0;
    let contrast = 1.0;
    let saturation = 1.0;

    // Ajustements basés sur la luminosité avec égalisation d'histogramme
    if (colorAnalysis.brightness < 0.4) {
      brightness = 1.2; // Éclaircir les images sombres
    } else if (colorAnalysis.brightness > 0.8) {
      brightness = 0.9; // Assombrir les images trop claires
    }

    // Ajustements basés sur le contraste avec algorithme Gray World
    if (colorAnalysis.contrast < 0.3) {
      contrast = 1.3; // Augmenter le contraste
    } else if (colorAnalysis.contrast > 0.7) {
      contrast = 0.8; // Réduire le contraste
    }

    // Ajustements basés sur la saturation
    if (colorAnalysis.saturation < 0.4) {
      saturation = 1.2; // Augmenter la saturation
    } else if (colorAnalysis.saturation > 0.8) {
      saturation = 0.9; // Réduire la saturation
    }

    // Bonus pour les images floues : augmentation de la netteté
    if (blurAnalysis.isBlurry) {
      // Pas de changement de luminosité/contraste pour les images floues
      // mais on peut suggérer une augmentation de netteté via sharpening
    }

    return { brightness, contrast, saturation };
  }
}
