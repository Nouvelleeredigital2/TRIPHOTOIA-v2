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

  constructor(
    // P0-C : pool borné. Par défaut (nb. cœurs - 1), plafonné entre 1 et 4 pour
    // éviter la saturation mémoire/CPU sur de gros lots.
    maxWorkers: number = Math.max(
      1,
      Math.min(4, (navigator.hardwareConcurrency ?? 4) - 1)
    )
  ) {
    this.maxWorkers = Math.max(1, Math.min(4, maxWorkers));
    this.initializeWorkers();
  }

  /**
   * Crée un Web Worker d'analyse pixel réel. P0-B : aucun fallback vers un
   * worker simulé — en cas d'échec total, le service retombe sur l'analyse
   * locale Canvas réelle (`fallbackAnalysis`), jamais sur des scores fabriqués.
   */
  private createWorker(): Worker {
    const worker = new Worker(
      new URL('../workers/imageAnalysisWorker.ts', import.meta.url),
      { type: 'module' }
    );
    worker.onmessage = this.handleWorkerMessage.bind(this);
    worker.onerror = this.handleWorkerError.bind(this);
    return worker;
  }

  /**
   * Initialise les Web Workers
   */
  private initializeWorkers(): void {
    for (let i = 0; i < this.maxWorkers; i++) {
      try {
        this.workers.push(this.createWorker());
      } catch (error) {
        console.warn(
          'Impossible de créer un Web Worker, utilisation du mode synchrone:',
          error
        );
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
      task.reject(new Error(payload.error || "Erreur d'analyse"));
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
    }

    // P0-C : retrait à l'index exact + terminaison + nettoyage des listeners,
    // puis remplacement borné par la taille du pool.
    this.replaceWorker(worker);
    this.processNextTask();
  }

  /**
   * Remplace un worker fautif. P0-C : on retire le worker en erreur à son index
   * exact, on le termine, puis on le remplace sans dépasser la taille du pool.
   */
  private replaceWorker(faulty: Worker): void {
    const index = this.workers.indexOf(faulty);
    try {
      faulty.onmessage = null;
      faulty.onerror = null;
      faulty.terminate();
    } catch {
      // worker déjà terminé : rien à faire.
    }

    if (index !== -1) {
      this.workers.splice(index, 1);
    }
    this.activeWorkers.delete(faulty);
    this.workerTaskMap.delete(faulty);

    // On ne remplace que si l'on reste sous la taille maximale du pool.
    if (this.workers.length < this.maxWorkers) {
      try {
        this.workers.push(this.createWorker());
      } catch (error) {
        console.error('Impossible de remplacer le worker:', error);
      }
    }
  }

  private findWorkerByTask(taskId: string): Worker | undefined {
    for (const [worker, assignedTaskId] of this.workerTaskMap.entries()) {
      if (assignedTaskId === taskId) return worker;
    }
    return undefined;
  }

  private failTask(taskId: string, error: Error): void {
    const task = this.extractTask(taskId);
    if (task) {
      task.reject(error);
    }
  }

  private extractTask(taskId: string): PendingTask | undefined {
    const taskIndex = this.pendingTasks.findIndex((task) => task.id === taskId);
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

    const availableWorker = this.workers.find(
      (worker) => !this.activeWorkers.has(worker)
    );
    if (!availableWorker) return;

    const taskIndex = this.pendingTasks.findIndex(
      (task) => task.status === 'pending'
    );
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
        id: task.id,
      },
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
      console.warn(
        "Aucun Web Worker disponible, utilisation de l'analyse synchrone"
      );
      return this.fallbackAnalysis(files);
    }

    try {
      const promises = files.map((file, index) => {
        const id = `${file.name}-${file.size}-${file.lastModified}-${index}`;

        return new Promise<PhotoAnalysis>((resolvePromise, rejectPromise) => {
          const handleTimeout = () => {
            console.warn(`⏱️ Timeout pour ${file.name}`);
            // P0-C : le timeout n'affecte que cette photo. Le worker bloqué est
            // terminé puis remplacé (jamais réutilisé avec une tâche périmée).
            const stuck = this.findWorkerByTask(id);
            this.failTask(id, new Error(`Timeout pour ${file.name}`));
            if (stuck) {
              this.replaceWorker(stuck);
            }
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
            },
          };

          this.pendingTasks.push(task);
          this.processNextTask();
        });
      });

      // P0-C / P0-B : résultat par fichier (jamais « tout ou rien »). Un échec
      // ou un timeout isolé n'invalide pas le lot : seules les photos en échec
      // retombent sur l'analyse locale réelle (Canvas), jamais sur un score
      // fabriqué.
      const settled = await Promise.allSettled(promises);

      const failedIndexes: number[] = [];
      settled.forEach((outcome, index) => {
        if (outcome.status === 'rejected') failedIndexes.push(index);
      });

      let fallbackByIndex = new Map<number, PhotoAnalysis>();
      if (failedIndexes.length > 0) {
        const fallbackResults = await this.fallbackAnalysis(
          failedIndexes.map((i) => files[i])
        );
        fallbackByIndex = new Map(
          failedIndexes.map((i, k) => [i, fallbackResults[k]])
        );
      }

      return settled.map((outcome, index) =>
        outcome.status === 'fulfilled'
          ? outcome.value
          : (fallbackByIndex.get(index) ?? { error: 'Analyse échouée' })
      );
    } catch (error) {
      console.error("Erreur lors de l'analyse avec Web Workers:", error);
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
   * Termine tous les workers et rejette proprement les tâches en attente.
   * P0-C : aucune tâche pendante, timer ou listener ne survit à la destruction.
   */
  dispose(): void {
    this.workers.forEach((worker) => {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    });
    this.workers = [];
    this.activeWorkers.clear();
    this.workerTaskMap.clear();

    const pending = this.pendingTasks;
    this.pendingTasks = [];
    pending.forEach((task) => {
      clearTimeout(task.timeoutId);
      task.reject(new Error('Analyse annulée (service arrêté)'));
    });
  }

  /** @deprecated Utiliser {@link dispose}. Conservé pour compatibilité. */
  cleanup(): void {
    this.dispose();
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
      pendingTasks: this.pendingTasks.length,
    };
  }
}

// Instance singleton
export const workerAnalysisService = new WorkerAnalysisService();
