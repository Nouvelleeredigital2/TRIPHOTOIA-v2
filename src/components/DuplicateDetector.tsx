import { useMemo, useState } from 'react';
import { usePhotoStore } from '../store/photoStore';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { DuplicateGroup } from '../types';
import { DuplicateComparison } from './DuplicateComparison';
import { Maximize2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

export function DuplicateDetector() {
  const [selectedGroup, setSelectedGroup] = useState<DuplicateGroup | null>(
    null
  );
  const [comparisonOpen, setComparisonOpen] = useState(false);

  const removePhoto = usePhotoStore((state) => state.removePhoto);
  const duplicateGroups = usePhotoStore((state) => state.duplicateGroups);
  const bestPhotoOverrides = usePhotoStore((state) => state.bestPhotoOverrides);

  // Utiliser des sélecteurs optimisés pour éviter les boucles infinies
  const collections = usePhotoStore((state) => state.collections);
  const activeCollectionId = usePhotoStore((state) => state.activeCollectionId);

  // Calculer les valeurs dérivées avec useMemo
  const activeCollection = useMemo(
    () => collections[activeCollectionId],
    [collections, activeCollectionId]
  );

  // Filtrer les groupes pour la collection active
  const filteredGroups = useMemo(() => {
    if (!activeCollection) return duplicateGroups;

    return duplicateGroups.filter((group) =>
      group.photos.some((photo) => activeCollection.photoIds.includes(photo.id))
    );
  }, [duplicateGroups, activeCollection]);

  // Calculer la similarité entre deux hash
  const calculateSimilarity = (hash1: string, hash2: string): number => {
    if (!hash1 || !hash2 || hash1.length !== hash2.length) return 0;

    let matches = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] === hash2[i]) matches++;
    }

    return Math.round((matches / hash1.length) * 100);
  };

  const handleRemoveDuplicate = (photoId: string) => {
    if (window.confirm('Supprimer cette photo ?')) {
      removePhoto(photoId);
      toast.success('Photo supprimée');
    }
  };

  const handleCompareGroup = (group: DuplicateGroup) => {
    setSelectedGroup(group);
    setComparisonOpen(true);
  };

  if (filteredGroups.length === 0) {
    return null;
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          🔍 Doublons Détectés
          <Badge variant="secondary">{duplicateGroups.length} groupe(s)</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {filteredGroups.map((group, groupIndex) => {
          const bestPhotoId = bestPhotoOverrides[group.id] || group.bestPhotoId;

          return (
            <div key={group.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold">
                    Groupe {groupIndex + 1} - {group.photos.length} photo(s)
                  </h4>
                  <Badge variant="secondary" className="text-xs">
                    {calculateSimilarity(
                      group.photos[0].analysis?.perceptualHash || '',
                      group.hash
                    )}
                    % similaires
                  </Badge>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCompareGroup(group)}
                >
                  <Maximize2 className="mr-2 h-4 w-4" />
                  Comparer
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                {group.photos.map((photo) => {
                  const isBest = photo.id === bestPhotoId;
                  const similarity = calculateSimilarity(
                    photo.analysis?.perceptualHash || '',
                    group.hash
                  );

                  return (
                    <div key={photo.id} className="group relative">
                      <div
                        className={`aspect-square overflow-hidden rounded-lg ${
                          isBest ? 'ring-2 ring-green-500' : 'bg-muted'
                        }`}
                      >
                        <img
                          src={photo.previewUrl}
                          alt={photo.file.name}
                          className="h-full w-full object-cover"
                        />
                      </div>

                      {/* Badges */}
                      <div className="absolute left-2 top-2 flex flex-col gap-1">
                        {isBest && (
                          <Badge className="bg-green-600 text-xs text-white">
                            Meilleure
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-xs">
                          {similarity}%
                        </Badge>
                      </div>

                      <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 opacity-0 transition-all hover:bg-black/60 hover:opacity-100">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRemoveDuplicate(photo.id)}
                        >
                          <Trash2 className="mr-1 h-3 w-3" />
                          Supprimer
                        </Button>
                      </div>

                      <div
                        className="mt-1 truncate text-xs font-medium"
                        title={photo.file.name}
                      >
                        {photo.file.name}
                      </div>

                      {photo.analysis && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {photo.analysis.isBlurry && (
                            <Badge variant="destructive" className="text-xs">
                              Flou
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs">
                            Netteté:{' '}
                            {Math.round(photo.analysis.sharpnessScore * 100)}%
                          </Badge>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div className="rounded-lg border border-info/20 bg-info/10 p-3 text-sm">
          💡 <strong>Conseil :</strong> Cliquez sur "Comparer" pour voir les
          photos côte à côte et choisir la meilleure. La photo avec le score de
          netteté le plus élevé est automatiquement sélectionnée.
        </div>
      </CardContent>

      {/* Dialog de comparaison */}
      {selectedGroup && (
        <DuplicateComparison
          group={selectedGroup}
          open={comparisonOpen}
          onOpenChange={setComparisonOpen}
        />
      )}
    </Card>
  );
}
