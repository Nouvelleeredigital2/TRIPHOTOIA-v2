/**
 * Service d'analyse utilisant des Web Workers
 * Permet le traitement d'images en arri??re-plan sans bloquer l'UI
 */

import { PhotoAnalysis } from '../types';

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

type TaskStatus = 'pending' | 'processing';

interface PendingTask {
  file: File;
  id: string;
  resolve: (result: PhotoAnalysis) => void;
  reject: (error: Error) => void;
  status: TaskStatus;
  timeoutId: ReturnType<typeof setTimeout>;
}

export class WorkerAnalysisService {
  private workers: Worker[] = [];
  private maxWorkers: number;
  private activeWorkers: Set<Worker> = new Set();
  private pendingTasks: PendingTask[] = [];
  private workerTaskMap: Map<Worker, string> = new Map();

  constructor(maxWorkers: number = navigator.hardwareConcurrency || 4) {
    this.maxWorkers = Math.min(maxWorkers, 8); // Limiter ?? 8 workers max
    this.initializeWorkers();
  }

  /**
   * Initialise les Web Workers
   */
  private initializeWorkers(): void {
    for (let i = 0; i < this.maxWorkers; i++) {
      try {
        // Essayer d'abord le worker complexe, puis le simple en fallback
        let worker: Worker;
        try {
          worker = new Worker(
            new URL('../workers/imageAnalysisWorker.ts', import.meta.url),
            { type: 'module' }
          );
        } catch (complexError) {
          console.warn('Worker complexe ??chou??, utilisation du worker simple:', complexError);
          worker = new Worker(
            new URL('../workers/simpleImageWorker.ts', import.meta.url),
            { type: 'module' }
          );
        }
        
        worker.onmessage = this.handleWorkerMessage.bind(this);
        worker.onerror = this.handleWorkerError.bind(this);
        
        this.workers.push(worker);
      } catch (error) {
        console.warn('Impossible de cr??er un Web Worker, utilisation du mode synchrone:', error);
      }
    }
  }

  /**
   * G??re les messages des workers
   */
  private handleWorkerMessage(event: MessageEvent<WorkerResponse>): void {
    const { type, payload } = event.data;
    const worker = event.target as Worker;

    const task = this.extractTask(payload.id);
    this.activeWorkers.delete(worker);
    this.workerTaskMap.delete(worker);
    if (!task) {
      this.processNextTask();
      return;
    }

    if (type === 'ANALYSIS_COMPLETE' && payload.result) {
      // Convertir le r??sultat en format PhotoAnalysis
      const photoAnalysis: PhotoAnalysis = {
        isBlurry: payload.result.isBlurry,
        sharpnessScore: payload.result.sharpnessScore,
        hasOpenEyes: payload.result.hasOpenEyes,
        tags: payload.result.tags,
        perceptualHash: payload.result.perceptualHash,
        compositionScore: payload.result.compositionScore,
        suggestedRetouch: payload.result.suggestedRetouch,
      };
      
      task.resolve(photoAnalysis);
    } else if (type === 'ANALYSIS_ERROR') {
      task.reject(new Error(payload.error || 'Erreur d\'analyse'));
    }

    // Traiter la prochaine t??che en attente
    this.processNextTask();
  }

  /**
   * G??re les erreurs des workers
   */
  private handleWorkerError(error: ErrorEvent): void {
    console.error('Erreur du Web Worker:', error);

    const worker = error.currentTarget as Worker;
    const taskId = this.workerTaskMap.get(worker);

    if (taskId) {
      this.failTask(taskId, new Error(error.message));
      this.workerTaskMap.delete(worker);
    }

    this.activeWorkers.delete(worker);

    // Red??marrer le worker si possible
    this.restartWorker();
    this.processNextTask();
  }

  /**
   * Red??marre un worker en cas d'erreur
   */
  private restartWorker(): void {
    try {
      // Utiliser le worker simple pour le red??marrage
      const newWorker = new Worker(
        new URL('../workers/simpleImageWorker.ts', import.meta.url),
        { type: 'module' }
      );
      
      newWorker.onmessage = this.handleWorkerMessage.bind(this);
      newWorker.onerror = this.handleWorkerError.bind(this);
      
      this.workers.push(newWorker);
    } catch (error) {
      console.error('Impossible de red??marrer le worker:', error);
    }
  }

  private releaseWorkerForTask(taskId: string): void {
    for (const [worker, assignedTaskId] of this.workerTaskMap.entries()) {
      if (assignedTaskId === taskId) {
        this.workerTaskMap.delete(worker);
        this.activeWorkers.delete(worker);
        break;
      }
    }
  }

  private failTask(taskId: string, error: Error): void {
    const task = this.extractTask(taskId);
    if (task) {
      task.reject(error);
    }
  }

  private extractTask(taskId: string): PendingTask | undefined {
    const taskIndex = this.pendingTasks.findIndex(task => task.id === taskId);
    if (taskIndex === -1) {
      return undefined;
    }

    const [task] = this.pendingTasks.splice(taskIndex, 1);
    clearTimeout(task.timeoutId);
    return task;
  }

  /**
   * Traite la prochaine t??che en attente
   */
  private processNextTask(): void {
    if (this.pendingTasks.length === 0) return;

    const availableWorker = this.workers.find(worker => !this.activeWorkers.has(worker));
    if (!availableWorker) return;

    const taskIndex = this.pendingTasks.findIndex(task => task.status === 'pending');
    if (taskIndex === -1) {
      return;
    }

    const task = this.pendingTasks[taskIndex];
    task.status = 'processing';
    this.activeWorkers.add(availableWorker);
    this.workerTaskMap.set(availableWorker, task.id);

    const message: WorkerMessage = {
      type: 'ANALYZE_IMAGE',
      payload: {
        file: task.file,
        id: task.id
      }
    };

    availableWorker.postMessage(message);
  }

  /**
   * Analyse un lot de photos en utilisant les Web Workers
   */
  async analyzePhotosBatch(files: File[]): Promise<PhotoAnalysis[]> {
    if (files.length === 0) {
      return [];
    }

    console.log(`???? Analyse avec Web Workers de ${files.length} photo(s)...`);

    // Si pas de workers disponibles, utiliser l'analyse synchrone
    if (this.workers.length === 0) {
      console.warn('Aucun Web Worker disponible, utilisation de l\'analyse synchrone');
      return this.fallbackAnalysis(files);
    }

    try {
      const promises = files.map((file, index) => {
        const id = `${file.name}-${file.size}-${file.lastModified}-${index}`;

        return new Promise<PhotoAnalysis>((resolvePromise, rejectPromise) => {
          const handleTimeout = () => {
            console.warn(`??? Timeout pour ${file.name}, fallback vers l'analyse locale`);
            this.failTask(id, new Error(`Timeout pour ${file.name}`));
            this.releaseWorkerForTask(id);
            this.processNextTask();
          };

          const timeoutId = setTimeout(handleTimeout, 10000);

          const task: PendingTask = {
            file,
            id,
            status: 'pending',
            timeoutId,
            resolve: (result: PhotoAnalysis) => {
              clearTimeout(timeoutId);
              resolvePromise(result);
            },
            reject: (error: Error) => {
              clearTimeout(timeoutId);
              rejectPromise(error);
            }
          };

          this.pendingTasks.push(task);
          this.processNextTask();
        });
      });

      const results = await Promise.all(promises);
      console.log(`??? Analyse termin??e pour ${results.length} photo(s)`);
      
      return results;
    } catch (error) {
      console.error('Erreur lors de l\'analyse avec Web Workers:', error);
      console.log('???? Fallback vers l\'analyse locale...');
      return this.fallbackAnalysis(files);
    }
  }

  /**
   * Analyse de fallback sans Web Workers
   */
  private async fallbackAnalysis(files: File[]): Promise<PhotoAnalysis[]> {
    // Import dynamique pour ??viter les probl??mes de circular dependencies
    const { localAnalysisService } = await import('./localAnalysisService');
    return localAnalysisService.analyzePhotosBatch(files);
  }

  /**
   * Nettoie les workers
   */
  cleanup(): void {
    this.workers.forEach(worker => {
      worker.terminate();
    });
    this.workers = [];
    this.activeWorkers.clear();
    this.pendingTasks.forEach(task => clearTimeout(task.timeoutId));
    this.pendingTasks = [];
  }

  /**
   * Obtient les statistiques des workers
   */
  getStats(): {
    totalWorkers: number;
    activeWorkers: number;
    pendingTasks: number;
  } {
    return {
      totalWorkers: this.workers.length,
      activeWorkers: this.activeWorkers.size,
      pendingTasks: this.pendingTasks.length
    };
  }
}

// Instance singleton
export const workerAnalysisService = new WorkerAnalysisService();

