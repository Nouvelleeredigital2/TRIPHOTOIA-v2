import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { calculateFileHash } from '../../lib/utils';
import { Photo, PhotoAnalysis } from '../../types';
import { usePhotoStore } from '../../store/photoStore';
import { usePhotoAnalysis } from '../../hooks/usePhotoAnalysis';
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

function IngestionTab() {
  const analyzingPhotoIds = usePhotoStore((state) => state.analyzingPhotoIds);
  const addPhotos = usePhotoStore((state) => state.addPhotos);
  const addPhotosToCollection = usePhotoStore((state) => state.addPhotosToCollection);
  const removePhotosFromCollection = usePhotoStore((state) => state.removePhotosFromCollection);
  const activeCollectionId = usePhotoStore((state) => state.activeCollectionId);
  const collections = usePhotoStore((state) => state.collections);
  const allPhotos = usePhotoStore((state) => state.photos);

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

  const handleFilesSelected = async (files: File[]) => {
    // Calculate file hashes in parallel for fast duplicate detection
    const photosWithHashes = await Promise.all(
      files.map(async (file) => {
        const fileHash = await calculateFileHash(file);
        return {
          id: `${file.name}-${file.lastModified}-${file.size}`,
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





