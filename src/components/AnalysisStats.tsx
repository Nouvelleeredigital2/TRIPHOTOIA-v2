import React, { useMemo } from 'react';
import { usePhotoStore } from '../store/photoStore';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Photo } from '../types';

export function AnalysisStats() {
  const isProcessing = usePhotoStore((state) => state.isProcessing);
  const analyzingPhotoIds = usePhotoStore((state) => state.analyzingPhotoIds);

  // Utiliser des sélecteurs optimisés pour éviter les boucles infinies
  const collections = usePhotoStore((state) => state.collections);
  const activeCollectionId = usePhotoStore((state) => state.activeCollectionId);
  const allPhotos = usePhotoStore((state) => state.photos);

  // Calculer les valeurs dérivées avec useMemo
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

  const photosWithAnalysis = activePhotos.filter((photo) => photo.analysis && !photo.analysis.error);
  const photosWithErrors = activePhotos.filter((photo) => photo.analysis?.error);
  const photosWithoutAnalysis = activePhotos.filter((photo) => !photo.analysis);
  const totalPhotos = activePhotos.length;
  const processedCount = photosWithAnalysis.length;

  const progressPercentage = totalPhotos > 0 ? Math.round((processedCount / totalPhotos) * 100) : 0;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          📊 Statistiques d&apos;Analyse
          {isProcessing && (
            <Badge variant="default" className="animate-pulse">
              En cours...
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Barre de progression */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Progression</span>
            <span>{processedCount} / {totalPhotos} ({progressPercentage}%)</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>

        {/* Statistiques détaillées */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-green-600">✅ Analysées</span>
              <span className="font-semibold">{photosWithAnalysis.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-red-600">❌ Erreurs</span>
              <span className="font-semibold">{photosWithErrors.length}</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-yellow-600">⏳ En attente</span>
              <span className="font-semibold">{photosWithoutAnalysis.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-blue-600">🔄 En cours</span>
              <span className="font-semibold">{analyzingPhotoIds.size}</span>
            </div>
          </div>
        </div>

        {/* Messages d&apos;erreur */}
        {photosWithErrors.length > 0 && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <h4 className="text-sm font-semibold text-red-800 mb-2">
              Erreurs d&apos;Analyse ({photosWithErrors.length})
            </h4>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {photosWithErrors.slice(0, 5).map(photo => (
                <div key={photo.id} className="text-xs text-red-700">
                  <span className="font-medium">{photo.file.name}:</span> {photo.analysis?.error}
                </div>
              ))}
              {photosWithErrors.length > 5 && (
                <div className="text-xs text-red-600">
                  ... et {photosWithErrors.length - 5} autres erreurs
                </div>
              )}
            </div>
          </div>
        )}

        {/* État de l&apos;analyse */}
        {isProcessing && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 text-blue-800">
              <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full" />
              <span className="text-sm font-medium">
                Analyse en cours... {analyzingPhotoIds.size} photo(s) en traitement
              </span>
            </div>
          </div>
        )}

        {/* Message de fin */}
        {!isProcessing && totalPhotos > 0 && photosWithoutAnalysis.length === 0 && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 text-green-800">
              <span className="text-lg">🎉</span>
              <span className="text-sm font-medium">
                Analyse terminée ! Toutes les photos ont été traitées.
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
