import { useEffect, useCallback, useRef } from 'react';
import { usePhotoStore } from '../store/photoStore';
import { analyzePhotosBatch } from '../../services/geminiService';
import { Photo } from '../types';
import {
  loadAnalysisState,
  saveAnalysisState,
  clearAnalysisState,
} from '../lib/analysis-queue-persistence';
import { useAiErrorStore } from '../store/aiErrorStore';

const hardwareThreads = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
const BATCH_SIZE = Math.min(20, Math.max(5, hardwareThreads * 2));
const ANALYSIS_THROTTLE_MS = 400;

export function usePhotoAnalysis() {
  const {
    photos,
    analysisQueue,
    analyzingPhotoIds,
    isProcessing,
    stopProcessing,
    processedCount,
    setAnalyzingPhotoIds,
    addAnalyzingPhotoIds,
    removeAnalyzingPhotoIds,
    setIsProcessing,
    setStopProcessing,
    incrementProcessedCount,
    updatePhotoAnalysis,
    removeFromAnalysisQueue,
    setActiveTab,
    addPhotos,
    setAnalysisQueue,
  } = usePhotoStore();

  const pushError = useAiErrorStore((state) => state.pushError);
  const resolveErrorsForPhoto = useAiErrorStore((state) => state.resolveErrorsForPhoto);

  const isRestoringRef = useRef(true);
  const persistenceTimeoutRef = useRef<number | null>(null);
  const lastBatchTimeRef = useRef<number>(0);
  const photosRef = useRef<Photo[]>(photos);
  const analysisQueueRef = useRef<string[]>(analysisQueue);

  // Auto-start processing when queue has items
  useEffect(() => {
    if (analysisQueue.length > 0 && !isProcessing) {
      setIsProcessing(true);
      setStopProcessing(false);
    }

    if (analysisQueue.length === 0 && isProcessing) {
      setIsProcessing(false);
      if (photos.some((p) => p.analysis)) {
        setActiveTab('triage');
      }
    }
  }, [analysisQueue.length, isProcessing, photos, setIsProcessing, setActiveTab, setStopProcessing]);

  // Restore persisted queue and photos on mount
  useEffect(() => {
    if (typeof window === 'undefined') {
      isRestoringRef.current = false;
      return;
    }

    let cancelled = false;

    const restoreState = async () => {
      try {
        const { photos: persistedPhotos, queue } = await loadAnalysisState();
        if (cancelled) {
          return;
        }

        if (persistedPhotos.length > 0) {
          const existingIds = new Set(usePhotoStore.getState().photos.map((photo) => photo.id));
          const newPhotos = persistedPhotos.filter((photo) => {
            const isDuplicate = existingIds.has(photo.id);
            if (isDuplicate && typeof URL !== 'undefined') {
              URL.revokeObjectURL(photo.previewUrl);
            }
            return !isDuplicate;
          });

          if (newPhotos.length > 0) {
            addPhotos(newPhotos);
          }
        }

        if (queue.length > 0) {
          const currentQueue = usePhotoStore.getState().analysisQueue;
          if (currentQueue.length === 0) {
            setAnalysisQueue(queue);
          }
        }
      } catch (error) {
        console.warn('[usePhotoAnalysis] Failed to restore persisted analysis queue.', error);
      } finally {
        if (!cancelled) {
          isRestoringRef.current = false;
        }
      }
    };

    restoreState();

    return () => {
      cancelled = true;
    };
  }, [addPhotos, setAnalysisQueue]);

  // Persist queue state when photos or queue change
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    photosRef.current = photos;
    analysisQueueRef.current = analysisQueue;

    if (isRestoringRef.current) {
      return;
    }

    if (persistenceTimeoutRef.current !== null) {
      window.clearTimeout(persistenceTimeoutRef.current);
      persistenceTimeoutRef.current = null;
    }

    persistenceTimeoutRef.current = window.setTimeout(() => {
      const currentPhotos = photosRef.current;
      const currentQueue = analysisQueueRef.current;

      if (!currentPhotos || currentPhotos.length === 0 || currentQueue.length === 0) {
        void clearAnalysisState();
        return;
      }

      const photoMap = new Map(currentPhotos.map((photo) => [photo.id, photo]));
      const pendingQueueIds = currentQueue.filter((id, index, array) => array.indexOf(id) === index && photoMap.has(id));
      const pendingPhotos = pendingQueueIds
        .map((id) => photoMap.get(id)!)
        .filter((photo) => !photo.analysis);

      if (pendingPhotos.length === 0 || pendingQueueIds.length === 0) {
        void clearAnalysisState();
        return;
      }

      void saveAnalysisState(pendingPhotos, pendingQueueIds);
    }, 500);

    return () => {
      if (persistenceTimeoutRef.current !== null) {
        window.clearTimeout(persistenceTimeoutRef.current);
        persistenceTimeoutRef.current = null;
      }
    };
  }, [photos, analysisQueue]);

  useEffect(() => {
    return () => {
      if (persistenceTimeoutRef.current !== null) {
        window.clearTimeout(persistenceTimeoutRef.current);
        persistenceTimeoutRef.current = null;
      }
    };
  }, []);

  // Process the analysis queue
  useEffect(() => {
    let active = true;

    const processQueue = async () => {
      if (!isProcessing || analysisQueue.length === 0 || stopProcessing) {
        if (stopProcessing) {
          // Only remove items if there's something in the queue to avoid an
          // infinite update loop (removing an empty array still creates a new
          // array reference, triggering another effect run).
          if (analysisQueue.length > 0) {
            removeFromAnalysisQueue(analysisQueue);
          }
          setIsProcessing(false);
          void clearAnalysisState();
        }
        return;
      }

      const batchIds = analysisQueue.slice(0, BATCH_SIZE);
      const batchPhotos = batchIds
        .map((id) => photos.find((p) => p.id === id))
        .filter((p): p is Photo => !!p);

      if (batchPhotos.length > 0) {
        addAnalyzingPhotoIds(batchIds);

        try {
          const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
          const elapsed = now - lastBatchTimeRef.current;
          if (elapsed < ANALYSIS_THROTTLE_MS) {
            await new Promise((resolve) => setTimeout(resolve, ANALYSIS_THROTTLE_MS - elapsed));
          }

          console.log(`🔄 Analyse de ${batchPhotos.length} photo(s):`, batchPhotos.map(p => p.file.name));

          const analysisResults = await analyzePhotosBatch(
            batchPhotos.map((p) => p.file)
          );

          lastBatchTimeRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now();

          console.log(`✅ Résultats d'analyse reçus:`, analysisResults.length);

          if (active) {
            // Update photos with analysis results
            batchPhotos.forEach((photo, index) => {
              if (analysisResults[index]) {
                console.log(`✅ Photo ${photo.file.name} analysée avec succès`);
                updatePhotoAnalysis(photo.id, analysisResults[index]);
                resolveErrorsForPhoto(photo.id, 'analysis');
              } else {
                console.warn(`⚠️ Pas de résultat pour ${photo.file.name}`);
                updatePhotoAnalysis(photo.id, { error: 'No analysis result' });
                pushError({
                  message: `Analyses manquantes pour ${photo.file.name}`,
                  photoId: photo.id,
                  source: 'analysis',
                  severity: 'warning',
                  hint: 'Relancer l\'analyse ou vérifier la connexion réseau.',
                });
              }
            });

            incrementProcessedCount(batchPhotos.length);
            removeFromAnalysisQueue(batchIds);
            removeAnalyzingPhotoIds(batchIds);

            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        } catch (error) {
          console.error('❌ Erreur lors de l\'analyse des photos:', error);
          if (active) {
            // Mark photos as having analysis errors
            batchPhotos.forEach((photo) => {
              console.error(`❌ Échec de l'analyse pour ${photo.file.name}`);
              updatePhotoAnalysis(photo.id, { error: 'Analysis failed' });
              pushError({
                message: `Échec de l'analyse pour ${photo.file.name}`,
                photoId: photo.id,
                source: 'analysis',
                severity: 'error',
                details: error instanceof Error ? { message: error.message, stack: error.stack } : error,
                hint: 'Essayez de relancer l\'analyse ou vérifiez les paramètres AI.',
              });
            });
            removeFromAnalysisQueue(batchIds);
            removeAnalyzingPhotoIds(batchIds);

            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        }
      } else {
        // No photos found for the IDs in the queue
        removeFromAnalysisQueue(batchIds);
      }
    };

    processQueue();

    return () => {
      active = false;
    };
  }, [
    isProcessing,
    analysisQueue,
    photos,
    stopProcessing,
    addAnalyzingPhotoIds,
    removeAnalyzingPhotoIds,
    updatePhotoAnalysis,
    incrementProcessedCount,
    removeFromAnalysisQueue,
    setIsProcessing,
  ]);

  const stopProcessingPhotos = useCallback(() => {
    setStopProcessing(true);
  }, [setStopProcessing]);

  return {
    isProcessing,
    processedCount,
    analyzingPhotoIds,
    stopProcessingPhotos,
  };
}

