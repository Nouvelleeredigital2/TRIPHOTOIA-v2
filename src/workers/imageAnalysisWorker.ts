import { PhotoAnalysis, AnalysisProvenance } from '../types';
import { detectFaceEyes } from '../lib/computer-vision/face-detector';
/**
 * Web Worker pour l'analyse d'images en arrière-plan
 * Évite de bloquer le thread principal pendant le traitement
 */

// P0-C : dimension d'analyse maximale. On ne crée jamais un canvas à la
// résolution native d'une photo HD : on redimensionne en conservant le ratio.
const MAX_ANALYSIS_DIM = 1600;

// Provenance : moteur worker à base d'heuristiques pixel (netteté, pHash, tags).
function pixelProvenance(): AnalysisProvenance {
  return {
    engine: 'treephoto-worker-canvas',
    model: 'pixel-heuristics',
    modelVersion: '1.0.0',
    analysisMode: 'local-pixel',
    confidence: null,
    isFallback: false,
    computedAt: new Date().toISOString(),
  };
}

// Provenance enrichie quand la détection visage/landmarks (MediaPipe) a tourné :
// l'ouverture des yeux provient alors d'un EAR réel, avec une confiance mesurée.
function faceLandmarksProvenance(confidence: number): AnalysisProvenance {
  return {
    engine: 'treephoto-worker-canvas+mediapipe',
    model: 'face_landmarker+pixel-heuristics',
    modelVersion: 'tasks-vision-0.10.35',
    analysisMode: 'face-landmarks',
    confidence: Number.isFinite(confidence) ? confidence : null,
    isFallback: false,
    computedAt: new Date().toISOString(),
  };
}

// Version simplifiée de ImageProcessor pour les Web Workers
class WorkerImageProcessor {
  private canvas: OffscreenCanvas;
  private ctx: OffscreenCanvasRenderingContext2D;

  constructor() {
    this.canvas = new OffscreenCanvas(1, 1);
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  }

  async analyzeImage(file: File): Promise<PhotoAnalysis> {
    // P0-C : createImageBitmap(file) directement (pas de copie
    // ArrayBuffer -> Blob -> ImageBitmap) et fermeture systématique du bitmap.
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(file);

      if (!bitmap.width || !bitmap.height) {
        throw new Error("Dimensions d'image invalides");
      }

      const imageData = this.getImageData(bitmap);

      // P0-C : la métrique de flou n'est calculée qu'une seule fois.
      const blur = this.analyzeBlur(imageData);

      // P0-2 : vraie détection visage/landmarks (MediaPipe) → ouverture des yeux
      // par EAR réel. Si le modèle est indisponible, `face` vaut null et l'on
      // n'expose AUCUNE estimation d'yeux (pas de repli sur l'ancienne
      // heuristique de pixels sombres, qui était trompeuse).
      const face = await detectFaceEyes(bitmap);

      const base: PhotoAnalysis = {
        isBlurry: blur.isBlurry,
        sharpnessScore: blur.sharpnessScore,
        tags: this.generateTags(imageData, bitmap.width, bitmap.height),
        perceptualHash: this.generatePerceptualHash(imageData),
        suggestedRetouch: {
          brightness: 1.0,
          contrast: 1.0,
          saturation: 1.0,
        },
      };

      if (face) {
        return {
          ...base,
          hasOpenEyes: face.hasOpenEyes,
          faceCount: face.faceCount,
          eyeOpenness: face.eyeOpenness,
          provenance: faceLandmarksProvenance(face.confidence),
        };
      }

      return { ...base, provenance: pixelProvenance() };
    } catch (error) {
      console.error('Erreur dans WorkerImageProcessor:', error);
      throw error;
    } finally {
      bitmap?.close();
    }
  }

  private getImageData(image: ImageBitmap): ImageData {
    // Redimensionnement borné (ratio conservé) avant getImageData.
    const scale = Math.min(
      1,
      MAX_ANALYSIS_DIM / Math.max(image.width, image.height)
    );
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.drawImage(image, 0, 0, width, height);
    return this.ctx.getImageData(0, 0, width, height);
  }

  private analyzeBlur(imageData: ImageData): {
    isBlurry: boolean;
    sharpnessScore: number;
  } {
    const laplacianVariance = this.calculateLaplacianVariance(imageData);
    const sharpnessScore = Math.min(laplacianVariance / 1000, 1.0);
    const isBlurry = sharpnessScore < 0.3;
    return { isBlurry, sharpnessScore };
  }

  private calculateLaplacianVariance(imageData: ImageData): number {
    const { data, width, height } = imageData;
    let sum = 0;
    let sumSquared = 0;
    let count = 0;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let laplacianValue = 0;

        for (let ky = 0; ky < 3; ky++) {
          for (let kx = 0; kx < 3; kx++) {
            const pixelIndex = ((y + ky - 1) * width + (x + kx - 1)) * 4;
            const gray = this.getGrayValue(data, pixelIndex);
            const kernel = [
              [0, -1, 0],
              [-1, 4, -1],
              [0, -1, 0],
            ][ky][kx];
            laplacianValue += gray * kernel;
          }
        }

        sum += laplacianValue;
        sumSquared += laplacianValue * laplacianValue;
        count++;
      }
    }

    const mean = sum / count;
    const variance = sumSquared / count - mean * mean;
    return variance;
  }

  private getGrayValue(data: Uint8ClampedArray, index: number): number {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  private generateTags(
    imageData: ImageData,
    originalWidth: number,
    originalHeight: number
  ): string[] {
    // Le ratio est préservé par le redimensionnement ; les tags de résolution
    // s'appuient en revanche sur les dimensions natives du fichier.
    const aspectRatio = imageData.width / imageData.height;
    const tags: string[] = [];

    if (aspectRatio > 1.5) {
      tags.push('landscape', 'wide');
    } else if (aspectRatio < 0.8) {
      tags.push('portrait', 'vertical');
    } else {
      tags.push('square');
    }

    if (originalWidth > 2000 || originalHeight > 2000) {
      tags.push('high-resolution');
    } else if (originalWidth < 800 || originalHeight < 800) {
      tags.push('low-resolution');
    }

    return tags.slice(0, 5);
  }

  private generatePerceptualHash(imageData: ImageData): string {
    const { data, width, height } = imageData;
    const resized = this.resizeImage(data, width, height, 8, 8);

    let sum = 0;
    for (let i = 0; i < resized.length; i += 4) {
      sum += this.getGrayValue(resized, i);
    }
    const average = sum / (resized.length / 4);

    let hash = '';
    for (let i = 0; i < resized.length; i += 4) {
      const gray = this.getGrayValue(resized, i);
      hash += gray > average ? '1' : '0';
    }

    return hash;
  }

  private resizeImage(
    data: Uint8ClampedArray,
    srcWidth: number,
    srcHeight: number,
    dstWidth: number,
    dstHeight: number
  ): Uint8ClampedArray {
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
}

interface WorkerMessage {
  type: 'ANALYZE_IMAGE';
  payload: {
    file: File;
    id: string;
  };
}

interface WorkerResponse {
  type: 'ANALYSIS_COMPLETE' | 'ANALYSIS_ERROR';
  payload: {
    id: string;
    result?: PhotoAnalysis;
    error?: string;
  };
}

const imageProcessor = new WorkerImageProcessor();

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, payload } = event.data;

  if (type === 'ANALYZE_IMAGE') {
    try {
      const result = await imageProcessor.analyzeImage(payload.file);

      const response: WorkerResponse = {
        type: 'ANALYSIS_COMPLETE',
        payload: {
          id: payload.id,
          result,
        },
      };

      self.postMessage(response);
    } catch (error) {
      const response: WorkerResponse = {
        type: 'ANALYSIS_ERROR',
        payload: {
          id: payload.id,
          error: error instanceof Error ? error.message : 'Erreur inconnue',
        },
      };

      self.postMessage(response);
    }
  }
};
