import React from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Photo, DuplicateGroup, COLOR_LABEL_META } from '../../../types';
import { formatFileSize } from '../../../lib/utils';
import { StarRating } from '../../../components/ui/star-rating';
import { usePhotoStore } from '../../../store/photoStore';

interface PhotoCardProps {
  photo: Photo;
  isSelected: boolean;
  isRejected: boolean;
  isBestInGroup: boolean;
  onSelect: () => void;
  onToggleReject: () => void;
  onSetAsBest: () => void;
  inCollection: boolean;
  onToggleCollection: () => void;
  showGroupInfo?: boolean;
  group?: DuplicateGroup;
  isInDevelopmentQueue?: boolean;
  onToggleDevelopment?: () => void;
  /** Multi-select */
  isMultiSelected?: boolean;
  isMultiSelectMode?: boolean;
  onToggleMultiSelect?: () => void;
  /** Drag-and-drop reorder (collection mode) */
  draggable?: boolean;
  isDragOver?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}

export function PhotoCard({
  photo,
  isSelected,
  isRejected,
  isBestInGroup,
  onSelect,
  onToggleReject,
  onSetAsBest,
  inCollection,
  onToggleCollection,
  showGroupInfo = false,
  group,
  isInDevelopmentQueue = false,
  onToggleDevelopment = () => {},
  isMultiSelected = false,
  isMultiSelectMode = false,
  onToggleMultiSelect,
  draggable = false,
  isDragOver = false,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: PhotoCardProps) {
  const hasAnalysis = photo.analysis && !photo.analysis.error;
  const analysis = photo.analysis;
  const isFavorite = analysis?.isPick === true && (analysis.rating ?? 0) >= 5;
  const needsReview = hasAnalysis && !analysis?.isPick && !analysis?.isRejected && !isRejected;

  const setPhotoRating = usePhotoStore((state) => state.setPhotoRating);
  const togglePhotoPick = usePhotoStore((state) => state.togglePhotoPick);
  const togglePhotoReject = usePhotoStore((state) => state.togglePhotoReject);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.2 }}
      draggable={draggable}
      onDragStartCapture={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      style={{ opacity: isDragOver ? 0.5 : undefined }}
    >
      <Card
        className={`group cursor-pointer transition-all duration-200 hover:shadow-lg ${
          isDragOver ? 'ring-2 ring-primary ring-dashed' : ''
        } ${
          isMultiSelected
            ? 'ring-2 ring-blue-500 shadow-lg'
            : isSelected
            ? 'ring-2 ring-primary shadow-lg'
            : isRejected
            ? 'opacity-50 bg-destructive/5'
            : ''
        }`}
        onClick={(e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            onToggleMultiSelect?.();
          } else {
            onSelect();
          }
        }}
        role="button"
        tabIndex={0}
        aria-pressed={isSelected}
        aria-label={`Photo ${photo.file.name}${isSelected ? ' (sélectionnée)' : ''}${isRejected ? ' (rejetée)' : ''}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (e.ctrlKey || e.metaKey) onToggleMultiSelect?.();
            else onSelect();
          }
        }}
      >
        <div className="aspect-square relative overflow-hidden">
          <img
            src={photo.previewUrl}
            alt={photo.file.name}
            className="w-full h-full object-cover"
          />

          {/* Checkbox multi-select */}
          {(isMultiSelectMode || isMultiSelected) && (
            <button
              className="absolute top-2 right-2 z-20"
              onClick={(e) => { e.stopPropagation(); onToggleMultiSelect?.(); }}
              title={isMultiSelected ? 'Désélectionner' : 'Sélectionner'}
            >
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                isMultiSelected
                  ? 'bg-blue-500 border-blue-500'
                  : 'bg-white/80 border-white hover:border-blue-400'
              }`}>
                {isMultiSelected && <Check className="w-3 h-3 text-white" />}
              </div>
            </button>
          )}

          <div className="absolute top-2 left-2 flex flex-col gap-1">
            {/* Notation par étoiles */}
            {hasAnalysis && (
              <div
                className="bg-black/60 backdrop-blur-sm rounded-md px-2 py-1"
                onClick={(e) => e.stopPropagation()}
              >
                <StarRating
                  rating={analysis?.rating || 0}
                  onRatingChange={(rating) => setPhotoRating(photo.id, rating)}
                  size="sm"
                />
              </div>
            )}

            {isBestInGroup && (
              <Badge variant="default" className="text-xs bg-green-600 text-white border-green-700">
                Meilleure
              </Badge>
            )}

            {isFavorite && (
              <Badge className="text-xs bg-violet-600 text-white border-violet-700">
                Favorite
              </Badge>
            )}

            {analysis?.isPick && !isFavorite && (
              <Badge className="text-xs bg-green-600 text-white border-green-700">
                🎯 Pick
              </Badge>
            )}

            {needsReview && (
              <Badge className="text-xs bg-amber-600 text-white border-amber-700">
                A revoir
              </Badge>
            )}

            {(isRejected || analysis?.isRejected) && (
              <Badge variant="destructive" className="text-xs bg-red-600 text-white border-red-700">
                ❌ Rejetée
              </Badge>
            )}

            {isInDevelopmentQueue && (
              <Badge variant="outline" className="text-xs bg-purple-600 text-white border-purple-700">
                Dév.
              </Badge>
            )}

            {showGroupInfo && group && (
              <Badge variant="outline" className="text-xs bg-blue-600 text-white border-blue-700">
                Groupe ({group.photos.length})
              </Badge>
            )}
          </div>

          {hasAnalysis && !isMultiSelectMode && !isMultiSelected && analysis?.sharpnessScore !== undefined && (
            <div className="absolute top-2 right-2">
              <Badge
                variant={
                  analysis.sharpnessScore > 0.7
                    ? 'default'
                    : analysis.sharpnessScore > 0.4
                    ? 'secondary'
                    : 'destructive'
                }
                className={`text-xs ${
                  analysis.sharpnessScore > 0.7
                    ? 'bg-green-600 text-white border-green-700'
                    : analysis.sharpnessScore > 0.4
                    ? 'bg-yellow-600 text-white border-yellow-700'
                    : 'bg-red-600 text-white border-red-700'
                }`}
              >
                {Math.round((analysis.sharpnessScore ?? 0) * 100)}%
              </Badge>
            </div>
          )}

          {/* Label couleur — dot en bas à droite */}
          {analysis?.colorLabel && (
            <div className="absolute bottom-2 right-2 z-10">
              <div
                className="w-3.5 h-3.5 rounded-full border-2 border-white/80 shadow"
                style={{ backgroundColor: COLOR_LABEL_META[analysis.colorLabel].dot }}
                title={COLOR_LABEL_META[analysis.colorLabel].label}
              />
            </div>
          )}

          <div className="absolute bottom-2 left-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="sm"
              variant={analysis?.isPick ? 'default' : 'outline'}
              className="flex-1 text-xs"
              onClick={(event) => {
                event.stopPropagation();
                togglePhotoPick(photo.id);
              }}
            >
              {analysis?.isPick ? '🎯 Pick' : 'P'}
            </Button>

            <Button
              size="sm"
              variant={(isRejected || analysis?.isRejected) ? 'destructive' : 'outline'}
              className="flex-1 text-xs"
              onClick={(event) => {
                event.stopPropagation();
                togglePhotoReject(photo.id);
              }}
            >
              {(isRejected || analysis?.isRejected) ? '❌' : 'X'}
            </Button>

            <Button
              size="sm"
              variant={inCollection ? 'secondary' : 'outline'}
              className="flex-1 text-xs"
              onClick={(event) => {
                event.stopPropagation();
                onToggleCollection();
              }}
            >
              {inCollection ? '✓' : '+'}
            </Button>
            <Button
              size="sm"
              variant={isInDevelopmentQueue ? 'default' : 'outline'}
              onClick={(event) => {
                event.stopPropagation();
                onToggleDevelopment();
              }}
              className={`h-8 px-2 text-xs ${
                isInDevelopmentQueue
                  ? 'bg-purple-600 text-white border-purple-700 hover:bg-purple-700'
                  : 'bg-white/90 text-gray-900 border-gray-300 hover:bg-white'
              }`}
            >
              {isInDevelopmentQueue ? 'Retirer' : 'Développer'}
            </Button>
            <Button
              size="sm"
              variant={isRejected ? 'default' : 'destructive'}
              onClick={(event) => {
                event.stopPropagation();
                onToggleReject();
              }}
              className={`h-8 px-2 text-xs ${
                isRejected
                  ? 'bg-green-600 text-white border-green-700 hover:bg-green-700'
                  : 'bg-red-600 text-white border-red-700 hover:bg-red-700'
              }`}
            >
              {isRejected ? 'Restaurer' : 'Rejeter'}
            </Button>
            {showGroupInfo && group && !isBestInGroup && (
              <Button
                size="sm"
                variant="outline"
                onClick={(event) => {
                  event.stopPropagation();
                  onSetAsBest();
                }}
                className="h-8 px-2 text-xs bg-blue-600 text-white border-blue-700 hover:bg-blue-700"
              >
                Meilleure
              </Button>
            )}
          </div>
        </div>

        <CardContent className="p-3 bg-white/95 backdrop-blur-sm">
          <div className="space-y-2">
            <p className="text-sm font-medium truncate text-gray-900" title={photo.file.name}>
              {photo.file.name}
            </p>
            <p className="text-xs text-gray-700 font-medium">
              {formatFileSize(photo.file.size)}
            </p>

            {hasAnalysis && analysis?.tags && analysis.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {analysis.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs bg-gray-100 text-gray-900 border-gray-300">
                    {tag}
                  </Badge>
                ))}
                {analysis.tags.length > 3 && (
                  <Badge variant="outline" className="text-xs bg-gray-100 text-gray-900 border-gray-300">
                    +{analysis.tags.length - 3}
                  </Badge>
                )}
              </div>
            )}

            {hasAnalysis && (
              <div className="space-y-1">
                {analysis?.isBlurry && (
                  <Badge variant="destructive" className="text-xs bg-red-600 text-white border-red-700">
                    Floue
                  </Badge>
                )}
                {analysis?.hasOpenEyes === false && (
                  <Badge variant="secondary" className="text-xs bg-yellow-600 text-white border-yellow-700">
                    Yeux fermés
                  </Badge>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
