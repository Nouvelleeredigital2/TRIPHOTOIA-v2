import { PhotoAnalysis } from '../types';
/**
 * Web Worker pour l'analyse d'images en arrière-plan
 * Évite de bloquer le thread principal pendant le traitement
 */

// Version simplifiée de ImageProcessor pour les Web Workers
class WorkerImageProcessor {
  private canvas: OffscreenCanvas;
  private ctx: OffscreenCanvasRenderingContext2D;

  constructor() {
    this.canvas = new OffscreenCanvas(1, 1);
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  }

  async analyzeImage(file: File): Promise<PhotoAnalysis> {
    try {
      const image = await this.loadImage(file);
      const imageData = this.getImageData(image);
      
      return {
        isBlurry: this.analyzeBlur(imageData).isBlurry,
        sharpnessScore: this.analyzeBlur(imageData).sharpnessScore,
        hasOpenEyes: this.detectEyes(imageData),
        tags: this.generateTags(imageData),
        perceptualHash: this.generatePerceptualHash(imageData),
        suggestedRetouch: {
          brightness: 1.0,
          contrast: 1.0,
          saturation: 1.0
        }
      };
    } catch (error) {
      console.error('Erreur dans WorkerImageProcessor:', error);
      throw error;
    }
  }

  private loadImage(file: File): Promise<ImageBitmap> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target!.result as ArrayBuffer;
          const blob = new Blob([arrayBuffer], { type: file.type });
          const imageBitmap = await createImageBitmap(blob);
          resolve(imageBitmap);
        } catch (error) {
          console.error('Erreur lors du chargement de l\'image:', error);
          reject(error);
        }
      };
      reader.onerror = (error) => {
        console.error('Erreur FileReader:', error);
        reject(error);
      };
      reader.readAsArrayBuffer(file);
    });
  }

  private getImageData(image: ImageBitmap): ImageData {
    this.canvas.width = image.width;
    this.canvas.height = image.height;
    this.ctx.drawImage(image, 0, 0);
    return this.ctx.getImageData(0, 0, image.width, image.height);
  }

  private analyzeBlur(imageData: ImageData): { isBlurry: boolean; sharpnessScore: number } {
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
            const kernel = [[0, -1, 0], [-1, 4, -1], [0, -1, 0]][ky][kx];
            laplacianValue += gray * kernel;
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

  private getGrayValue(data: Uint8ClampedArray, index: number): number {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  private detectEyes(imageData: ImageData): boolean {
    const { data, width, height } = imageData;
    const centerY = Math.floor(height / 2);
    const eyeRegionHeight = Math.floor(height * 0.3);
    const startY = centerY - Math.floor(eyeRegionHeight / 2);
    const endY = centerY + Math.floor(eyeRegionHeight / 2);

    let darkPixels = 0;
    let totalPixels = 0;

    for (let y = startY; y < endY; y++) {
      for (let x = 0; x < width; x++) {
        const pixelIndex = (y * width + x) * 4;
        const gray = this.getGrayValue(data, pixelIndex);
        
        if (gray < 100) {
          darkPixels++;
        }
        totalPixels++;
      }
    }

    return (darkPixels / totalPixels) > 0.1;
  }

  private generateTags(imageData: ImageData): string[] {
    const { width, height } = imageData;
    const aspectRatio = width / height;
    const tags: string[] = [];

    if (aspectRatio > 1.5) {
      tags.push('landscape', 'wide');
    } else if (aspectRatio < 0.8) {
      tags.push('portrait', 'vertical');
    } else {
      tags.push('square');
    }

    if (width > 2000 || height > 2000) {
      tags.push('high-resolution');
    } else if (width < 800 || height < 800) {
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
          result
        }
      };
      
      self.postMessage(response);
    } catch (error) {
      const response: WorkerResponse = {
        type: 'ANALYSIS_ERROR',
        payload: {
          id: payload.id,
          error: error instanceof Error ? error.message : 'Erreur inconnue'
        }
      };
      
      self.postMessage(response);
    }
  }
};




