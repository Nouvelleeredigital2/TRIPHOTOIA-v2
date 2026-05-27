import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Photo } from '../../../types';
import { formatFileSize } from '../../../lib/utils';
import { AnalyzingBadgeSkeleton } from '../../../components/PhotoGridSkeleton';

interface PhotoListProps {
  photos: Photo[];
  analyzingPhotoIds: Set<string>;
  collectionPhotoIds: Set<string>;
  onToggleCollection: (photoId: string) => void;
}

export function PhotoList({ photos, analyzingPhotoIds, collectionPhotoIds, onToggleCollection }: PhotoListProps) {
  if (photos.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">
        Photos chargées ({photos.length})
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence>
          {photos.map((photo, index) => {
            const isAnalyzing = analyzingPhotoIds.has(photo.id);
            const hasAnalysis = photo.analysis !== null;
            const hasError = photo.analysis?.error;
            const inCollection = collectionPhotoIds.has(photo.id);

            return (
              <motion.div
                key={photo.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2, delay: index * 0.05 }}
              >
                <Card className="overflow-hidden">
                  <div className="aspect-square relative">
                    <img
                      src={photo.previewUrl}
                      alt={photo.file.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 right-2 flex gap-1">
                      {isAnalyzing && (
                        <Badge variant="default" className="text-xs">
                          Analyse...
                        </Badge>
                      )}
                      {hasAnalysis && !hasError && (
                        <Badge variant="secondary" className="text-xs">
                          ✅ Analysée
                        </Badge>
                      )}
                      {hasError && (
                        <Badge variant="destructive" className="text-xs">
                          Erreur
                        </Badge>
                      )}
                    </div>
                    {isAnalyzing && <AnalyzingBadgeSkeleton />}
                  </div>
                  <CardContent className="p-3 space-y-2">
                    <div className="space-y-1">
                      <p className="text-sm font-medium truncate" title={photo.file.name}>
                        {photo.file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(photo.file.size)}
                      </p>
                      {hasAnalysis && !hasError && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {photo.analysis?.tags?.slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="pt-2 flex justify-end">
                      <Button
                        size="sm"
                        variant={inCollection ? 'secondary' : 'outline'}
                        onClick={() => onToggleCollection(photo.id)}
                        className="text-xs"
                      >
                        {inCollection ? 'Retirer de la collection' : 'Ajouter à la collection'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
