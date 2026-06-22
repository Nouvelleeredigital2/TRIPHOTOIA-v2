import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { calculateFileHash, mapWithConcurrency } from '../../lib/utils';
import { validateImportFiles } from '../../lib/import-policy';
import { isRawFilename, rawFileToProxyFile } from '../../lib/raw/raw-decoder';
import { readExifMetadata } from '../../lib/exif';
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
  const addPhotosToCollection = usePhotoStore(
    (state) => state.addPhotosToCollection
  );
  const removePhotosFromCollection = usePhotoStore(
    (state) => state.removePhotosFromCollection
  );
  const activeCollectionId = usePhotoStore((state) => state.activeCollectionId);
  const collections = usePhotoStore((state) => state.collections);
  const allPhotos = usePhotoStore((state) => state.photos);
  const requeueForAnalysis = usePhotoStore((state) => state.requeueForAnalysis);
  const activeCloudProject = useCloudProjectStore(
    (state) => state.activeProject
  );

  // Calculer les valeurs dérivées avec useMemo pour éviter les boucles infinies
  const activeCollection = useMemo(
    () => collections[activeCollectionId],
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

  const collectionPhotoIds = useMemo(
    () => new Set<string>(activeCollection?.photoIds ?? []),
    [activeCollection?.photoIds]
  );
  const processedInActive = useMemo(
    () =>
      activePhotos.filter((photo) => photo.analysis && !photo.analysis.error)
        .length,
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
          return (
            a.sharpnessScore === undefined && !(a.tags && a.tags.length > 0)
          );
        })
        .map((p) => p.id),
    [activePhotos]
  );

  const handleFilesSelected = async (files: File[]) => {
    // P1-A : politique d'import unique (extension + taille + signature réelle,
    // refus RAW), commune à Studio Grid et AutoFlow (même puits).
    const { accepted, rejected } = await validateImportFiles(files);
    const rejections = [...rejected];

    // Hash SHA-256 intégral des fichiers acceptés, à concurrence bornée. Un échec
    // de hash rejette le fichier (jamais d'ID vide). Aucune URL blob n'est créée
    // avant le hash → pas de fuite pour les fichiers rejetés.
    const hashed = await mapWithConcurrency(accepted, 4, async (file) => {
      try {
        const fileHash = await calculateFileHash(file);
        return { file, fileHash };
      } catch (error) {
        rejections.push({
          file,
          reason:
            error instanceof Error
              ? error.message
              : "Échec du calcul d'empreinte",
        });
        return null;
      }
    });

    // Déduplication par empreinte (intra-lot + contre le catalogue existant) :
    // l'URL blob de prévisualisation n'est créée qu'une seule fois par photo
    // réellement nouvelle, donc jamais pour un doublon (pas de fuite).
    const existingIds = new Set(
      usePhotoStore.getState().photos.map((p) => p.id)
    );
    const seen = new Set<string>();
    let duplicates = 0;
    const photoSeeds = hashed
      .filter((h): h is { file: File; fileHash: string } => h !== null)
      .filter(({ fileHash }) => {
        if (existingIds.has(fileHash) || seen.has(fileHash)) {
          duplicates += 1;
          return false;
        }
        seen.add(fileHash);
        return true;
      });

    // RAW : décodage en proxy JPEG raster (LibRaw-Wasm) à concurrence bornée.
    // L'empreinte/ID reste calculée sur les octets RAW d'origine (dédup correcte) ;
    // l'EXIF est lu sur l'original ; seul le raster (preview + analyse) utilise le
    // proxy. Un RAW non décodable est écarté proprement (jamais d'image fabriquée).
    const rawCount = photoSeeds.filter((s) =>
      isRawFilename(s.file.name)
    ).length;
    const rawToastId =
      rawCount > 0 ? toast.loading(`Décodage RAW… (${rawCount})`) : null;

    // Lecture EXIF réelle en parallèle (non bloquante : undefined si absent).
    const built = await mapWithConcurrency(
      photoSeeds,
      4,
      async ({ file, fileHash }) => {
        let rasterFile = file;
        if (isRawFilename(file.name)) {
          const proxy = await rawFileToProxyFile(file);
          if (!proxy) {
            rejections.push({ file, reason: 'Décodage RAW impossible' });
            return null;
          }
          rasterFile = proxy;
        }
        return {
          // A-14 : ID = SHA-256 du contenu (original RAW pour les RAW).
          id: fileHash,
          file: rasterFile,
          fileHash, // niveau Photo — clé cross-device pour le cloud
          previewUrl: URL.createObjectURL(rasterFile),
          analysis: {
            fileHash,
          } as Partial<PhotoAnalysis>,
          metadata: await readExifMetadata(file),
        };
      }
    );
    if (rawToastId) toast.dismiss(rawToastId);
    const photosWithHashes = built.filter(
      (p): p is NonNullable<typeof p> => p !== null
    );

    if (rejections.length > 0) {
      const sample = rejections
        .slice(0, 3)
        .map((r) => `${r.file.name} : ${r.reason}`);
      toast.error(
        `${rejections.length} fichier${rejections.length > 1 ? 's' : ''} refusé${rejections.length > 1 ? 's' : ''}\n${sample.join('\n')}${rejections.length > 3 ? '\n…' : ''}`
      );
    }
    if (duplicates > 0) {
      toast(
        `${duplicates} doublon${duplicates > 1 ? 's' : ''} ignoré${duplicates > 1 ? 's' : ''}`,
        { icon: 'ℹ️' }
      );
    }
    if (photosWithHashes.length === 0) {
      return;
    }

    addPhotos(photosWithHashes);

    if (activeCloudProject) {
      const toastId = toast.loading(
        `Upload cloud 0 % · ${activeCloudProject.name}`
      );
      uploadPhotosToCloud({
        activeProject: activeCloudProject,
        files: photosWithHashes.map((photo) => photo.file),
        localPhotoIds: photosWithHashes.map((photo) => photo.id),
        // P1-9 (serveur) : idempotence anti-doublon au retry. La RPC idempotente
        // (migration 20260622120000) est déployée et validée → on envoie le
        // SHA-256 de contenu, qui sert de clé de déduplication côté serveur.
        contentHashes: photosWithHashes.map((photo) => photo.fileHash),
        onProgress: (progress) => {
          toast.loading(
            `Upload cloud ${progress} % · ${activeCloudProject.name}`,
            { id: toastId }
          );
        },
      })
        .then((result) => {
          useCloudProjectStore.getState().linkCloudPhotos(result.mappings);
          void queryClient.invalidateQueries({
            queryKey: ['cloud-project-photos', activeCloudProject.id],
          });

          // P1-9 : retour structuré (success/partial/failed) — on informe
          // l'utilisateur des photos partielles ou échouées sans tout bloquer.
          const plural = (n: number) => (n > 1 ? 's' : '');
          if (result.uploaded === 0) {
            toast.error(
              `Aucune photo uploadée (${result.failed} échec${plural(result.failed)})`,
              { id: toastId }
            );
            return;
          }
          let message = `${result.uploaded} photo${plural(result.uploaded)} uploadée${plural(result.uploaded)} dans le projet cloud`;
          const extras: string[] = [];
          if (result.partial > 0) {
            extras.push(`${result.partial} sans détection visages`);
          }
          if (result.failed > 0) {
            extras.push(`${result.failed} échec${plural(result.failed)}`);
          }
          if (extras.length > 0) {
            message += ` (${extras.join(', ')})`;
            toast(message, { id: toastId, icon: '⚠️' });
          } else {
            toast.success(message, { id: toastId });
          }
        })
        .catch((error) => {
          const message =
            error instanceof Error ? error.message : 'Upload cloud impossible';
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
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: 'calc(100vh - 160px)',
        }}
      >
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
      <div className="space-y-2 text-center">
        <h2 className="text-3xl font-bold">Ingestion & Analyse</h2>
        <p className="text-muted-foreground">
          Chargez vos photos pour commencer l&apos;analyse automatique avec
          l&apos;IA
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
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm">
          <span className="font-medium text-amber-700 dark:text-amber-400">
            {unanalyzedIds.length} photo{unanalyzedIds.length > 1 ? 's' : ''}{' '}
            non analysée{unanalyzedIds.length > 1 ? 's' : ''}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto gap-1"
            onClick={() => {
              requeueForAnalysis(unanalyzedIds);
              toast.success('Analyse relancée');
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
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
