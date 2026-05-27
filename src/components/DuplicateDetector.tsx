import React, { useMemo, useState } from 'react';
import { usePhotoStore } from '../store/photoStore';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Photo, DuplicateGroup } from '../types';
import { DuplicateComparison } from './DuplicateComparison';
import { Maximize2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

export function DuplicateDetector() {
  const [selectedGroup, setSelectedGroup] = useState<DuplicateGroup | null>(null);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  
  const removePhoto = usePhotoStore((state) => state.removePhoto);
  const duplicateGroups = usePhotoStore((state) => state.duplicateGroups);
  const bestPhotoOverrides = usePhotoStore((state) => state.bestPhotoOverrides);

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

  // Filtrer les groupes pour la collection active
  const filteredGroups = useMemo(() => {
    if (!activeCollection) return duplicateGroups;
    
    return duplicateGroups.filter(group => 
      group.photos.some(photo => activeCollection.photoIds.includes(photo.id))
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
        <CardTitle className="text-lg flex items-center gap-2">
          🔍 Doublons Détectés
          <Badge variant="secondary">
            {duplicateGroups.length} groupe(s)
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {filteredGroups.map((group, groupIndex) => {
          const bestPhotoId = bestPhotoOverrides[group.id] || group.bestPhotoId;
          
          return (
          <div key={group.id} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-sm">
                  Groupe {groupIndex + 1} - {group.photos.length} photo(s)
                </h4>
                <Badge variant="secondary" className="text-xs">
                  {calculateSimilarity(group.photos[0].analysis?.perceptualHash || '', group.hash)}% similaires
                </Badge>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleCompareGroup(group)}
              >
                <Maximize2 className="w-4 h-4 mr-2" />
                Comparer
              </Button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {group.photos.map((photo) => {
                const isBest = photo.id === bestPhotoId;
                const similarity = calculateSimilarity(photo.analysis?.perceptualHash || '', group.hash);
                
                return (
                  <div key={photo.id} className="relative group">
                    <div className={`aspect-square rounded-lg overflow-hidden ${
                      isBest ? 'ring-2 ring-green-500' : 'bg-muted'
                    }`}>
                      <img
                        src={photo.previewUrl}
                        alt={photo.file.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    
                    {/* Badges */}
                    <div className="absolute top-2 left-2 flex flex-col gap-1">
                      {isBest && (
                        <Badge className="text-xs bg-green-600 text-white">
                          Meilleure
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-xs">
                        {similarity}%
                      </Badge>
                    </div>
                    
                    <div className="absolute inset-0 bg-black/0 hover:bg-black/60 opacity-0 hover:opacity-100 transition-all rounded-lg flex items-center justify-center">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleRemoveDuplicate(photo.id)}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Supprimer
                      </Button>
                    </div>
                    
                    <div className="mt-1 text-xs font-medium truncate" title={photo.file.name}>
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
                          Netteté: {Math.round(photo.analysis.sharpnessScore * 100)}%
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
        
        <div className="text-sm bg-info/10 border border-info/20 p-3 rounded-lg">
          💡 <strong>Conseil :</strong> Cliquez sur "Comparer" pour voir les photos côte à côte et choisir la meilleure.
          La photo avec le score de netteté le plus élevé est automatiquement sélectionnée.
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


