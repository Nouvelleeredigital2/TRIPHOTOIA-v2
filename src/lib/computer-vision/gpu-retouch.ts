/**
 * Processeur de retouche GPU-accelerated utilisant Canvas API
 * Fournit des fonctions de retouche d'images optimisées pour le GPU
 */

import { AutoRetouchPreset, RetouchOptions } from '../../types';
import {
  applyToneAndPresenceAdjustments,
  applyUnsharpMask,
  clamp,
  computeAutoRetouchOptions,
} from './retouch-utils';
import {
  RetouchWorkerRequest,
  RetouchWorkerRequestPayload,
  RetouchWorkerResponse,
} from '../../workers/retouchWorkerMessages';
import { WebGLRetouchProcessor } from './webgl-retouch';

type PendingWorkerRequest =
  | {
      kind: 'PROCESS';
      resolve: (data: ImageData) => void;
      reject: (error: Error) => void;
    }
  | {
      kind: 'AUTO';
      resolve: (preset: AutoRetouchPreset) => void;
      reject: (error: Error) => void;
    };

export class GPURetouchProcessor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private worker: Worker | null = null;
  private workerRequestId = 0;
  private pendingWorkerRequests = new Map<number, PendingWorkerRequest>();
  private webgl: WebGLRetouchProcessor;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    this.webgl = new WebGLRetouchProcessor();

    this.initializeWorker();
  }

  /**
   * Applique des retouches GPU-accelerated à une image.
   *
   * Fast path: single WebGL2 fragment shader pass — no getImageData round-trip.
   * Fallback: CSS filter → getImageData → Worker pixel pipeline.
   */
  async applyRetouch(
    image: HTMLImageElement,
    options: RetouchOptions
  ): Promise<HTMLCanvasElement> {
    // V-02: WebGL single-pass (preferred — avoids getImageData latency)
    if (this.webgl.isSupported) {
      try {
        return this.webgl.applyRetouch(image, options);
      } catch (err) {
        console.warn(
          '[GPURetouchProcessor] WebGL path failed, falling back to Canvas:',
          err
        );
      }
    }

    // Canvas 2D + Worker fallback
    const { width, height } = image;

    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.clearRect(0, 0, width, height);

    const filterString = this.buildFilterString(options);
    this.ctx.filter = filterString;
    this.ctx.drawImage(image, 0, 0, width, height);
    this.ctx.filter = 'none';

    const imageData = this.ctx.getImageData(0, 0, width, height);
    const processedData = await this.runRetouchPipeline(imageData, options);
    this.ctx.putImageData(processedData, 0, 0);

    return this.canvas;
  }

  private initializeWorker(): void {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      return;
    }

    try {
      this.worker = new Worker(
        new URL('../../workers/retouchWorker.ts', import.meta.url),
        {
          type: 'module',
        }
      );
      this.worker.addEventListener('message', this.handleWorkerMessage);
      this.worker.addEventListener('error', this.handleWorkerError);
    } catch (error) {
      console.warn(
        'Retouch worker not available, falling back to main thread processing.',
        error
      );
      this.worker = null;
    }
  }

  private handleWorkerMessage = (
    event: MessageEvent<RetouchWorkerResponse>
  ) => {
    const response = event.data;
    const pending = this.pendingWorkerRequests.get(response.id);

    if (!pending) {
      return;
    }

    this.pendingWorkerRequests.delete(response.id);

    if (response.type === 'SUCCESS') {
      if (pending.kind !== 'PROCESS') {
        pending.reject(
          new Error('Incohérence de type de requête process/auto.')
        );
        return;
      }
      try {
        const data = new Uint8ClampedArray(response.data);
        const imageData = new ImageData(data, response.width, response.height);
        pending.resolve(imageData);
      } catch (error) {
        pending.reject(
          error instanceof Error ? error : new Error(String(error))
        );
      }
      return;
    }

    if (response.type === 'AUTO_SUCCESS') {
      if (pending.kind !== 'AUTO') {
        pending.reject(
          new Error('Incohérence de type de requête auto/process.')
        );
        return;
      }
      pending.resolve(response.preset);
      return;
    }

    if (response.type === 'ERROR') {
      pending.reject(new Error(response.error));
      return;
    }

    pending.reject(new Error('Réponse inconnue du worker de retouche.'));
  };

  private handleWorkerError = (event: ErrorEvent) => {
    this.pendingWorkerRequests.forEach(({ reject }) => {
      const reason =
        event.error instanceof Error ? event.error : new Error(event.message);
      reject(reason);
    });
    this.pendingWorkerRequests.clear();

    if (this.worker) {
      this.worker.removeEventListener('message', this.handleWorkerMessage);
      this.worker.removeEventListener('error', this.handleWorkerError);
      this.worker.terminate();
      this.worker = null;
    }
  };

  private async runRetouchPipeline(
    imageData: ImageData,
    options: RetouchOptions
  ): Promise<ImageData> {
    try {
      const workerResult = await this.processImageDataWithWorker(
        imageData,
        options
      );
      if (workerResult) {
        return workerResult;
      }

      return this.processImageDataOnMainThread(imageData, options);
    } catch (error) {
      console.warn(
        'Erreur du worker de retouche, traitement sur le thread principal.',
        error
      );
      const fallbackData = this.ctx.getImageData(
        0,
        0,
        imageData.width,
        imageData.height
      );
      return this.processImageDataOnMainThread(fallbackData, options);
    }
  }

  private async processImageDataWithWorker(
    imageData: ImageData,
    options: RetouchOptions
  ): Promise<ImageData | null> {
    if (!this.worker) {
      this.initializeWorker();
    }

    if (!this.worker) {
      return null;
    }

    return new Promise<ImageData>((resolve, reject) => {
      const id = this.workerRequestId++;
      this.pendingWorkerRequests.set(id, { kind: 'PROCESS', resolve, reject });

      const payload: RetouchWorkerRequest = {
        id,
        type: 'PROCESS',
        width: imageData.width,
        height: imageData.height,
        options,
        data: imageData.data.buffer.slice(0),
      };

      try {
        this.worker!.postMessage(
          payload satisfies RetouchWorkerRequestPayload,
          [payload.data]
        );
      } catch (error) {
        this.pendingWorkerRequests.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private async processAutoPresetWithWorker(
    imageData: ImageData
  ): Promise<AutoRetouchPreset | null> {
    if (!this.worker) {
      this.initializeWorker();
    }

    if (!this.worker) {
      return null;
    }

    try {
      return await new Promise<AutoRetouchPreset>((resolve, reject) => {
        const id = this.workerRequestId++;
        this.pendingWorkerRequests.set(id, { kind: 'AUTO', resolve, reject });

        const payload = {
          id,
          type: 'AUTO_PRESET' as const,
          width: imageData.width,
          height: imageData.height,
          data: imageData.data.buffer.slice(0),
        };

        try {
          this.worker!.postMessage(
            payload satisfies RetouchWorkerRequestPayload,
            [payload.data]
          );
        } catch (error) {
          this.pendingWorkerRequests.delete(id);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    } catch (error) {
      console.warn(
        'Auto preset worker failed, falling back to main thread.',
        error
      );
      return null;
    }
  }

  async computeAutoRetouchPreset(
    image: HTMLImageElement
  ): Promise<AutoRetouchPreset> {
    const { width, height } = image;
    if (width === 0 || height === 0) {
      return { options: {}, confidence: 0 };
    }

    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.drawImage(image, 0, 0, width, height);

    const imageData = this.ctx.getImageData(0, 0, width, height);
    const presetFromWorker = await this.processAutoPresetWithWorker(imageData);
    if (presetFromWorker) {
      return presetFromWorker;
    }

    return computeAutoRetouchOptions(imageData);
  }

  private processImageDataOnMainThread(
    imageData: ImageData,
    options: RetouchOptions
  ): ImageData {
    const workingData = new ImageData(
      new Uint8ClampedArray(imageData.data),
      imageData.width,
      imageData.height
    );
    const adjusted = applyToneAndPresenceAdjustments(workingData, options);

    if (options.sharpness && options.sharpness > 0) {
      const intensity = 1 + options.sharpness / 50;
      return applyUnsharpMask(adjusted, intensity);
    }

    return adjusted;
  }

  /**
   * Construit la chaîne de filtres CSS pour le GPU
   */
  private buildFilterString(options: RetouchOptions): string {
    const filters: string[] = [];

    const exposureFactor = clamp(1 + options.exposure / 100, 0.1, 3);
    if (Math.abs(options.exposure) > 0.01) {
      filters.push(`brightness(${exposureFactor})`);
    }

    const contrastFactor = clamp(1 + options.contrast / 100, 0.1, 3);
    if (Math.abs(options.contrast) > 0.01) {
      filters.push(`contrast(${contrastFactor})`);
    }

    const saturationFactor = clamp(
      1 + (options.saturation + options.vibrance * 0.6) / 100,
      0,
      4
    );
    if (
      Math.abs(options.saturation) > 0.01 ||
      Math.abs(options.vibrance) > 0.01
    ) {
      filters.push(`saturate(${saturationFactor})`);
    }

    if (options.temperature !== 0 || options.tint !== 0) {
      const hueRotate = clamp(
        options.tint * 0.6 + options.temperature * 0.25,
        -180,
        180
      );
      if (hueRotate !== 0) {
        filters.push(`hue-rotate(${hueRotate}deg)`);
      }

      const warmth = clamp(options.temperature / 150, -1, 1);
      if (warmth > 0) {
        filters.push(`sepia(${warmth})`);
      }
    }

    return filters.join(' ');
  }

  /**
   * Applique l'égalisation d'histogramme pour améliorer le contraste
   */
  async applyHistogramEqualization(
    image: HTMLImageElement
  ): Promise<HTMLCanvasElement> {
    const { width, height } = image;
    this.canvas.width = width;
    this.canvas.height = height;

    this.ctx.drawImage(image, 0, 0);

    const imageData = this.ctx.getImageData(0, 0, width, height);
    const equalizedData = this.equalizeHistogram(imageData);

    this.ctx.putImageData(equalizedData, 0, 0);
    return this.canvas;
  }

  /**
   * Égalise l'histogramme pour améliorer le contraste global
   */
  private equalizeHistogram(imageData: ImageData): ImageData {
    const { data, width, height } = imageData;
    const output = new ImageData(new Uint8ClampedArray(data), width, height);

    // Calculate histogram
    const histogram = new Array(256).fill(0);
    const totalPixels = width * height;

    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(
        0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      );
      histogram[gray]++;
    }

    // Calculate cumulative distribution function
    const cdf = new Array(256).fill(0);
    cdf[0] = histogram[0];
    for (let i = 1; i < 256; i++) {
      cdf[i] = cdf[i - 1] + histogram[i];
    }

    // Create equalized values
    const equalizedValues = new Array(256);
    for (let i = 0; i < 256; i++) {
      equalizedValues[i] = Math.round((cdf[i] * 255) / totalPixels);
    }

    // Apply equalization
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(
        0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      );
      const equalized = equalizedValues[gray];

      output.data[i] = equalized; // Red
      output.data[i + 1] = equalized; // Green
      output.data[i + 2] = equalized; // Blue
      output.data[i + 3] = data[i + 3]; // Alpha
    }

    return output;
  }

  /**
   * Applique l'algorithme Gray World pour corriger la balance des blancs
   */
  async applyGrayWorldCorrection(
    image: HTMLImageElement
  ): Promise<HTMLCanvasElement> {
    const { width, height } = image;
    this.canvas.width = width;
    this.canvas.height = height;

    this.ctx.drawImage(image, 0, 0);

    const imageData = this.ctx.getImageData(0, 0, width, height);
    const correctedData = this.grayWorldCorrection(imageData);

    this.ctx.putImageData(correctedData, 0, 0);
    return this.canvas;
  }

  /**
   * Corrige la balance des blancs avec l'algorithme Gray World
   */
  private grayWorldCorrection(imageData: ImageData): ImageData {
    const { data, width, height } = imageData;
    const output = new ImageData(new Uint8ClampedArray(data), width, height);

    // Calculate average color
    let sumR = 0,
      sumG = 0,
      sumB = 0;
    let count = 0;

    for (let i = 0; i < data.length; i += 4) {
      sumR += data[i];
      sumG += data[i + 1];
      sumB += data[i + 2];
      count++;
    }

    const avgR = sumR / count;
    const avgG = sumG / count;
    const avgB = sumB / count;

    // Calculate scaling factors to make average gray (128, 128, 128)
    const scaleR = 128 / avgR;
    const scaleG = 128 / avgG;
    const scaleB = 128 / avgB;

    // Apply correction
    for (let i = 0; i < data.length; i += 4) {
      output.data[i] = Math.min(Math.max(Math.round(data[i] * scaleR), 0), 255);
      output.data[i + 1] = Math.min(
        Math.max(Math.round(data[i + 1] * scaleG), 0),
        255
      );
      output.data[i + 2] = Math.min(
        Math.max(Math.round(data[i + 2] * scaleB), 0),
        255
      );
      output.data[i + 3] = data[i + 3];
    }

    return output;
  }
}
