import { useState, useEffect, useMemo } from 'react';
import { usePhotoStore } from '../store/photoStore';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { PhotoAnalysis, Photo } from '../types';

interface AnalysisDetail {
  name: string;
  analysis: PhotoAnalysis;
  timestamp: string;
}

export function RealTimeAnalysis() {
  const [analysisDetails, setAnalysisDetails] = useState<AnalysisDetail[]>([]);

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

  useEffect(() => {
    const photosWithAnalysis = activePhotos.filter(
      (photo) => photo.analysis && !photo.analysis.error
    );
    const details = photosWithAnalysis.map((photo) => ({
      name: photo.file.name,
      analysis: photo.analysis!,
      timestamp: new Date().toISOString(),
    }));
    setAnalysisDetails(details);
  }, [activePhotos]);

  if (analysisDetails.length === 0) {
    return null;
  }

  const latestUpdate = new Date().toLocaleTimeString();

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">📡 Analyse en temps reel</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="mb-4 text-sm text-gray-600">
          Derniere mise a jour : {latestUpdate}
        </div>

        {analysisDetails.slice(0, 5).map((detail) => {
          const retouch = detail.analysis.suggestedRetouch;

          return (
            <div
              key={`${detail.name}-${detail.timestamp}`}
              className="space-y-2 rounded-lg border p-3"
            >
              <div className="text-sm font-semibold">{detail.name}</div>

              <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                <div>
                  <div className="text-gray-600">Nette</div>
                  <div className="font-mono">
                    {detail.analysis.sharpnessScore !== undefined
                      ? (
                          Math.round(detail.analysis.sharpnessScore * 1000) /
                          1000
                        ).toString()
                      : 'N/A'}
                  </div>
                </div>

                <div>
                  <div className="text-gray-600">Flou</div>
                  <div
                    className={`font-mono ${detail.analysis.isBlurry ? 'text-red-600' : 'text-green-600'}`}
                  >
                    {detail.analysis.isBlurry ? 'OUI' : 'NON'}
                  </div>
                </div>

                <div>
                  <div className="text-gray-600">Yeux</div>
                  <div
                    className={`font-mono ${detail.analysis.hasOpenEyes ? 'text-blue-600' : 'text-gray-600'}`}
                  >
                    {detail.analysis.hasOpenEyes ? 'DETECTES' : 'NON'}
                  </div>
                </div>

                <div>
                  <div className="text-gray-600">Hash</div>
                  <div className="truncate font-mono text-xs">
                    {detail.analysis.perceptualHash
                      ? `${detail.analysis.perceptualHash.substring(0, 8)}...`
                      : 'N/A'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-gray-600">Luminosite</div>
                  <div className="font-mono">
                    {retouch?.brightness !== undefined
                      ? (
                          Math.round(retouch.brightness * 1000) / 1000
                        ).toString()
                      : 'N/A'}
                  </div>
                </div>

                <div>
                  <div className="text-gray-600">Contraste</div>
                  <div className="font-mono">
                    {retouch?.contrast !== undefined
                      ? (Math.round(retouch.contrast * 1000) / 1000).toString()
                      : 'N/A'}
                  </div>
                </div>

                <div>
                  <div className="text-gray-600">Saturation</div>
                  <div className="font-mono">
                    {retouch?.saturation !== undefined
                      ? (
                          Math.round(retouch.saturation * 1000) / 1000
                        ).toString()
                      : 'N/A'}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {detail.analysis.tags?.slice(0, 5).map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          );
        })}

        {analysisDetails.length > 5 ? (
          <div className="text-center text-sm text-gray-500">
            ... et {analysisDetails.length - 5} autres photos
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
