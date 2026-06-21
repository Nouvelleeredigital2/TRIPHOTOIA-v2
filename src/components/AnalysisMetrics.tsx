import { useMemo } from 'react';
import { usePhotoStore } from '../store/photoStore';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Photo } from '../types';

export function AnalysisMetrics() {
  // Utiliser des sélecteurs optimisés pour éviter les boucles infinies
  const collections = usePhotoStore((state) => state.collections);
  const activeCollectionId = usePhotoStore((state) => state.activeCollectionId);
  const allPhotos = usePhotoStore((state) => state.photos);

  // Calculer les valeurs dérivées avec useMemo
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

  const photosWithAnalysis = activePhotos.filter(
    (photo) => photo.analysis && !photo.analysis.error
  );

  if (photosWithAnalysis.length === 0) {
    return null;
  }

  // Calculer les statistiques réelles
  const sharpnessScores = photosWithAnalysis.map(
    (photo) => photo.analysis?.sharpnessScore || 0
  );
  const brightnessScores = photosWithAnalysis.map(
    (photo) => photo.analysis?.suggestedRetouch?.brightness || 0
  );
  const contrastScores = photosWithAnalysis.map(
    (photo) => photo.analysis?.suggestedRetouch?.contrast || 0
  );
  const saturationScores = photosWithAnalysis.map(
    (photo) => photo.analysis?.suggestedRetouch?.saturation || 0
  );

  const avgSharpness =
    sharpnessScores.reduce((a, b) => a + b, 0) / sharpnessScores.length;
  const avgBrightness =
    brightnessScores.reduce((a, b) => a + b, 0) / brightnessScores.length;
  const avgContrast =
    contrastScores.reduce((a, b) => a + b, 0) / contrastScores.length;
  const avgSaturation =
    saturationScores.reduce((a, b) => a + b, 0) / saturationScores.length;

  const blurryCount = photosWithAnalysis.filter(
    (photo) => photo.analysis?.isBlurry
  ).length;
  const sharpCount = photosWithAnalysis.filter(
    (photo) => !photo.analysis?.isBlurry
  ).length;
  const eyesDetectedCount = photosWithAnalysis.filter(
    (photo) => photo.analysis?.hasOpenEyes
  ).length;

  // Calculer la distribution des scores
  const sharpnessDistribution = {
    verySharp: sharpnessScores.filter((s) => s > 0.7).length,
    sharp: sharpnessScores.filter((s) => s > 0.4 && s <= 0.7).length,
    moderate: sharpnessScores.filter((s) => s > 0.1 && s <= 0.4).length,
    blurry: sharpnessScores.filter((s) => s <= 0.1).length,
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">📈 Métriques d&apos;Analyse</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Statistiques générales */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {photosWithAnalysis.length}
            </div>
            <div className="text-sm text-gray-600">Photos analysées</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {sharpCount}
            </div>
            <div className="text-sm text-gray-600">Photos nettes</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{blurryCount}</div>
            <div className="text-sm text-gray-600">Photos floues</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {eyesDetectedCount}
            </div>
            <div className="text-sm text-gray-600">Avec yeux</div>
          </div>
        </div>

        {/* Moyennes des scores */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Moyennes des scores</h4>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div>
              <div className="text-sm text-gray-600">Netteté</div>
              <div className="text-lg font-semibold">
                {Math.round(avgSharpness * 100)}%
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Luminosité</div>
              <div className="text-lg font-semibold">
                {Math.round(avgBrightness * 100)}%
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Contraste</div>
              <div className="text-lg font-semibold">
                {Math.round(avgContrast * 100)}%
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Saturation</div>
              <div className="text-lg font-semibold">
                {Math.round(avgSaturation * 100)}%
              </div>
            </div>
          </div>
        </div>

        {/* Distribution de la netteté */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Distribution de la netteté</h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">Très nettes</span>
              <div className="flex items-center gap-2">
                <div className="h-2 w-20 rounded-full bg-gray-200">
                  <div
                    className="h-2 rounded-full bg-green-600"
                    style={{
                      width: `${(sharpnessDistribution.verySharp / photosWithAnalysis.length) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-sm font-medium">
                  {sharpnessDistribution.verySharp}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Nettes</span>
              <div className="flex items-center gap-2">
                <div className="h-2 w-20 rounded-full bg-gray-200">
                  <div
                    className="h-2 rounded-full bg-blue-600"
                    style={{
                      width: `${(sharpnessDistribution.sharp / photosWithAnalysis.length) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-sm font-medium">
                  {sharpnessDistribution.sharp}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Moyennement nettes</span>
              <div className="flex items-center gap-2">
                <div className="h-2 w-20 rounded-full bg-gray-200">
                  <div
                    className="h-2 rounded-full bg-yellow-600"
                    style={{
                      width: `${(sharpnessDistribution.moderate / photosWithAnalysis.length) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-sm font-medium">
                  {sharpnessDistribution.moderate}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Floues</span>
              <div className="flex items-center gap-2">
                <div className="h-2 w-20 rounded-full bg-gray-200">
                  <div
                    className="h-2 rounded-full bg-red-600"
                    style={{
                      width: `${(sharpnessDistribution.blurry / photosWithAnalysis.length) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-sm font-medium">
                  {sharpnessDistribution.blurry}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tags les plus fréquents */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Tags les plus fréquents</h4>
          <div className="flex flex-wrap gap-1">
            {(() => {
              const tagCounts: Record<string, number> = {};
              photosWithAnalysis.forEach((photo) => {
                photo.analysis?.tags?.forEach((tag: string) => {
                  tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                });
              });

              const sortedTags = Object.entries(tagCounts)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10);

              return sortedTags.map(([tag, count]) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag} ({count})
                </Badge>
              ));
            })()}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
