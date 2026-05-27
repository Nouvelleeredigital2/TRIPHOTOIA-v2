import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { DuplicateGroup } from '../../lib/computer-vision';

interface DuplicateGroupCardProps {
  group: DuplicateGroup;
  photos: Array<{ id: string; name: string; thumbnail?: string }>;
  onSelectBest?: (groupId: string, photoId: string) => void;
  onViewGroup?: (groupId: string) => void;
  onDeleteGroup?: (groupId: string) => void;
}

export const DuplicateGroupCard: React.FC<DuplicateGroupCardProps> = ({
  group,
  photos,
  onSelectBest,
  onViewGroup,
  onDeleteGroup
}) => {
  const groupPhotos = photos.filter(photo => group.photos.includes(photo.id));
  const representativePhoto = groupPhotos.find(photo => photo.id === group.representative);

  const getSimilarityColor = (similarity: number) => {
    if (similarity >= 0.9) return 'text-red-600';
    if (similarity >= 0.8) return 'text-orange-600';
    if (similarity >= 0.7) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'bg-green-100 text-green-800';
    if (confidence >= 0.7) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span>Groupe de Doublons</span>
            <Badge variant="outline">
              {group.photos.length} photo{group.photos.length > 1 ? 's' : ''}
            </Badge>
          </div>
          <div className="flex space-x-2">
            <Badge className={getConfidenceColor(group.confidence)}>
              Confiance: {(group.confidence * 100).toFixed(1)}%
            </Badge>
            {onDeleteGroup && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onDeleteGroup(group.id)}
                className="text-red-600 hover:text-red-700"
              >
                🗑️
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Photo représentative */}
        {representativePhoto && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Photo représentative</h4>
            <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
              <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center">
                {representativePhoto.thumbnail ? (
                  <img
                    src={representativePhoto.thumbnail}
                    alt={representativePhoto.name}
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : (
                  <span className="text-2xl">📷</span>
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{representativePhoto.name}</p>
                <p className="text-xs text-gray-500">Sélectionnée automatiquement</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onSelectBest?.(group.id, representativePhoto.id)}
              >
                ✅ Meilleure
              </Button>
            </div>
          </div>
        )}

        {/* Métriques de similarité */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Métriques</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>Similarité</span>
                <span className={`font-mono ${getSimilarityColor(group.similarity)}`}>
                  {(group.similarity * 100).toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{ width: `${group.similarity * 100}%` }}
                />
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>Confiance</span>
                <span className={`font-mono ${getSimilarityColor(group.confidence)}`}>
                  {(group.confidence * 100).toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-600 h-2 rounded-full"
                  style={{ width: `${group.confidence * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Liste des photos du groupe */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Photos du groupe</h4>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {groupPhotos.map((photo, index) => (
              <div
                key={photo.id}
                className={`flex items-center space-x-3 p-2 rounded-lg ${
                  photo.id === group.representative
                    ? 'bg-blue-50 border border-blue-200'
                    : 'bg-gray-50'
                }`}
              >
                <div className="w-8 h-8 bg-gray-200 rounded flex items-center justify-center">
                  {photo.thumbnail ? (
                    <img
                      src={photo.thumbnail}
                      alt={photo.name}
                      className="w-full h-full object-cover rounded"
                    />
                  ) : (
                    <span className="text-sm">📷</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{photo.name}</p>
                  <p className="text-xs text-gray-500">
                    {photo.id === group.representative ? 'Représentante' : `Doublon ${index + 1}`}
                  </p>
                </div>
                {photo.id !== group.representative && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onSelectBest?.(group.id, photo.id)}
                    className="text-xs"
                  >
                    Choisir
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex space-x-2 pt-2">
          {onViewGroup && (
            <Button
              size="sm"
              onClick={() => onViewGroup(group.id)}
              className="flex-1"
            >
              👁️ Voir le groupe
            </Button>
          )}
          {onSelectBest && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onSelectBest(group.id, group.representative)}
            >
              ✅ Valider
            </Button>
          )}
        </div>

        {/* Informations supplémentaires */}
        <div className="text-xs text-gray-500 space-y-1">
          <p>ID du groupe: {group.id}</p>
          <p>Photos: {group.photos.join(', ')}</p>
        </div>
      </CardContent>
    </Card>
  );
};
