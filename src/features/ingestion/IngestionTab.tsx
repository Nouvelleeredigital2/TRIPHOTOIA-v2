import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { calculateFileHash } from '../../lib/utils';
import { Photo, PhotoAnalysis } from '../../types';
import { usePhotoStore } from '../../store/photoStore';
import { usePhotoAnalysis } from '../../hooks/usePhotoAnalysis';
import { Button } from '../../components/ui/button';
import { RefreshCw } from 'lucide-react';
import { FileUpload } from './components/FileUpload';
import { AnalysisProgress } from './components/AnalysisProgress';
import { PhotoList } from './components/PhotoList';
import { ApiSelector } from '../../components/ApiSelector';
import { AnalysisStats } from '../../components/AnalysisStats';
import { DuplicateDetector } from '../../components/DuplicateDetector';
import { AnalysisMetrics } from '../../components/AnalysisMetrics';
import { RealTimeAnalysis } from '../../components/RealTimeAnalysis';
import { DuplicateTest } from '../../components/DuplicateTest';
import { AutoRatingPanel } from '../../components/AutoRatingPanel';
import { AutoFlowImportScreen } from '../../components/autoflow/AutoFlowImportScreen';
import { useCloudProjectStore } from '../../store/cloudProjectStore';
import { uploadPhotosToCloud } from '../cloud-projects/cloudUpload';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';

function IngestionTab() {
  const queryClient = useQueryClient();
  const analyzingPhotoIds = usePhotoStore((state) => state.analyzingPhotoIds);
  const addPhotos = usePhotoStore((state) => state.addPhotos);
  const addPhotosToCollection = usePhotoStore((state) => state.addPhotosToCollection);
  const removePhotosFromCollection = usePhotoStore((state) => state.removePhotosFromCollection);
  const activeCollectionId = usePhotoStore((state) => state.activeCollectionId);
  const collections = usePhotoStore((state) => state.collections);
  const allPhotos = usePhotoStore((state) => state.photos);
  const requeueForAnalysis = usePhotoStore((state) => state.requeueForAnalysis);
  const activeCloudProject = useCloudProjectStore((state) => state.activeProject);

  // Calculer les valeurs dérivées avec useMemo pour éviter les boucles infinies
  const activeCollection = useMemo(() =>
    collections[activeCollectionId],
    [collections, activeCollectionId]
  );

  const activePhotos = useMemo(() => {
    if (!activeCollection) {
      return allPhotos;
    }
    const photoMap = new Map(allPhotos.map((photo) => [photo.id, photo]));
    return activeCollection.photoIds
      .map((id) => photoMap.get(id))
      .filter((photo): photo is Photo => Boolean(photo));
  }, [activeCollection, allPhotos]);
  const { isProcessing, stopProcessingPhotos } = usePhotoAnalysis();

  const collectionPhotoIds = useMemo(() => new Set<string>(activeCollection?.photoIds ?? []), [activeCollection?.photoIds]);
  const processedInActive = useMemo(
    () => activePhotos.filter((photo) => photo.analysis && !photo.analysis.error).length,
    [activePhotos]
  );

  // Photos jamais analysées réellement (au-delà du seul fileHash posé à l'import) — A-17.
  const unanalyzedIds = useMemo(
    () =>
      activePhotos
        .filter((p) => {
          const a = p.analysis;
          if (!a) return true;
          if (a.error) return false; // les erreurs se relancent via le filtre « Erreurs »
          return a.sharpnessScore === undefined && !(a.tags && a.tags.length > 0);
        })
        .map((p) => p.id),
    [activePhotos]
  );

  const handleFilesSelected = async (files: File[]) => {
    // Calculate file hashes in parallel for fast duplicate detection
    const photosWithHashes = await Promise.all(
      files.map(async (file) => {
        const fileHash = await calculateFileHash(file);
        return {
          // A-14 : ID = SHA-256 du contenu. Deux fichiers différents (même nom/taille/date)
          // ne collisionnent plus ; un même fichier réimporté est dédupliqué par addPhotos.
          id: fileHash,
          file,
          fileHash,  // niveau Photo — clé cross-device pour le cloud
          previewUrl: URL.createObjectURL(file),
          analysis: {
            fileHash, // Add the cryptographic hash immediately
          } as Partial<PhotoAnalysis>,
        };


      })
    );

    addPhotos(photosWithHashes);

    if (activeCloudProject) {
      const toastId = toast.loading(`Upload cloud 0 % · ${activeCloudProject.name}`);
      uploadPhotosToCloud({
        activeProject: activeCloudProject,
        files,
        localPhotoIds: photosWithHashes.map((photo) => photo.id),
        onProgress: (progress) => {
          toast.loading(`Upload cloud ${progress} % · ${activeCloudProject.name}`, { id: toastId });
        },
      })
        .then((result) => {
          useCloudProjectStore.getState().linkCloudPhotos(result.mappings);
          void queryClient.invalidateQueries({ queryKey: ['cloud-project-photos', activeCloudProject.id] });
          toast.success(`${result.uploaded} photo${result.uploaded > 1 ? 's' : ''} uploadée${result.uploaded > 1 ? 's' : ''} dans le projet cloud`, { id: toastId });
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : 'Upload cloud impossible';
          toast.error(message, { id: toastId });
        });
    }
  };

  const handleToggleCollectionPhoto = (photoId: string) => {
    if (!activeCollectionId) {
      return;
    }

    if (collectionPhotoIds.has(photoId)) {
      removePhotosFromCollection(activeCollectionId, [photoId]);
    } else {
      addPhotosToCollection(activeCollectionId, [photoId]);
    }
  };

  /* ── Empty state: show AutoFlow v2 import screen ── */
  if (activePhotos.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 160px)' }}>
        {/* API selector stays accessible */}
        <div style={{ padding: '0 0 8px' }}>
          <ApiSelector />
        </div>
        <AutoFlowImportScreen
          onFilesSelected={handleFilesSelected}
          disabled={isProcessing}
        />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold">Ingestion & Analyse</h2>
        <p className="text-muted-foreground">
          Chargez vos photos pour commencer l&apos;analyse automatique avec l&apos;IA
        </p>
      </div>

      <ApiSelector />

      <FileUpload
        onFilesSelected={handleFilesSelected}
        disabled={isProcessing}
      />

      {activePhotos.length > 0 && (
        <AnalysisProgress
          total={activePhotos.length}
          processed={processedInActive}
          isProcessing={isProcessing}
          analyzingPhotoIds={analyzingPhotoIds}
          onStop={stopProcessingPhotos}
        />
      )}

      {/* A-17 : relancer l'analyse des photos jamais analysées (après un arrêt) */}
      {!isProcessing && unanalyzedIds.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm">
          <span className="font-medium text-amber-700 dark:text-amber-400">
            {unanalyzedIds.length} photo{unanalyzedIds.length > 1 ? 's' : ''} non analysée{unanalyzedIds.length > 1 ? 's' : ''}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto gap-1"
            onClick={() => {
              requeueForAnalysis(unanalyzedIds);
              toast.success("Analyse relancée");
            }}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Relancer l&apos;analyse
          </Button>
        </div>
      )}

      <DuplicateTest />

      <AnalysisStats />

      {processedInActive > 0 && <AutoRatingPanel />}

      <DuplicateDetector />

      <AnalysisMetrics />

      <RealTimeAnalysis />

      <PhotoList
        photos={activePhotos}
        analyzingPhotoIds={analyzingPhotoIds}
        collectionPhotoIds={collectionPhotoIds}
        onToggleCollection={handleToggleCollectionPhoto}
      />
    </motion.div>
  );
}

export default IngestionTab;



