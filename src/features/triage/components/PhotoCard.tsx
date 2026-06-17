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
  const needsReview =
    hasAnalysis && !analysis?.isPick && !analysis?.isRejected && !isRejected;

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
          isDragOver ? 'ring-dashed ring-2 ring-primary' : ''
        } ${
          isMultiSelected
            ? 'shadow-lg ring-2 ring-blue-500'
            : isSelected
              ? 'shadow-lg ring-2 ring-primary'
              : isRejected
                ? 'bg-destructive/5 opacity-50'
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
        <div className="relative aspect-square overflow-hidden">
          <img
            src={photo.previewUrl}
            alt={photo.file.name}
            className="h-full w-full object-cover"
          />

          {/* Checkbox multi-select */}
          {(isMultiSelectMode || isMultiSelected) && (
            <button
              className="absolute right-2 top-2 z-20"
              onClick={(e) => {
                e.stopPropagation();
                onToggleMultiSelect?.();
              }}
              title={isMultiSelected ? 'Désélectionner' : 'Sélectionner'}
            >
              <div
                className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-colors ${
                  isMultiSelected
                    ? 'border-blue-500 bg-blue-500'
                    : 'border-white bg-white/80 hover:border-blue-400'
                }`}
              >
                {isMultiSelected && <Check className="h-3 w-3 text-white" />}
              </div>
            </button>
          )}

          <div className="absolute left-2 top-2 flex flex-col gap-1">
            {/* Notation par étoiles */}
            {hasAnalysis && (
              /* Wrapper qui stoppe la propagation ; le contrôle réel est StarRating. */
              /* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */
              <div
                className="rounded-md bg-black/60 px-2 py-1 backdrop-blur-sm"
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
              <Badge
                variant="default"
                className="border-green-700 bg-green-600 text-xs text-white"
              >
                Meilleure
              </Badge>
            )}

            {isFavorite && (
              <Badge className="border-violet-700 bg-violet-600 text-xs text-white">
                Favorite
              </Badge>
            )}

            {analysis?.isPick && !isFavorite && (
              <Badge className="border-green-700 bg-green-600 text-xs text-white">
                🎯 Pick
              </Badge>
            )}

            {needsReview && (
              <Badge className="border-amber-700 bg-amber-600 text-xs text-white">
                A revoir
              </Badge>
            )}

            {(isRejected || analysis?.isRejected) && (
              <Badge
                variant="destructive"
                className="border-red-700 bg-red-600 text-xs text-white"
              >
                ❌ Rejetée
              </Badge>
            )}

            {isInDevelopmentQueue && (
              <Badge
                variant="outline"
                className="border-purple-700 bg-purple-600 text-xs text-white"
              >
                Dév.
              </Badge>
            )}

            {showGroupInfo && group && (
              <Badge
                variant="outline"
                className="border-blue-700 bg-blue-600 text-xs text-white"
              >
                Groupe ({group.photos.length})
              </Badge>
            )}
          </div>

          {hasAnalysis &&
            !isMultiSelectMode &&
            !isMultiSelected &&
            analysis?.sharpnessScore !== undefined && (
              <div className="absolute right-2 top-2">
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
                      ? 'border-green-700 bg-green-600 text-white'
                      : analysis.sharpnessScore > 0.4
                        ? 'border-yellow-700 bg-yellow-600 text-white'
                        : 'border-red-700 bg-red-600 text-white'
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
                className="h-3.5 w-3.5 rounded-full border-2 border-white/80 shadow"
                style={{
                  backgroundColor: COLOR_LABEL_META[analysis.colorLabel].dot,
                }}
                title={COLOR_LABEL_META[analysis.colorLabel].label}
              />
            </div>
          )}

          <div className="absolute bottom-2 left-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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
              variant={
                isRejected || analysis?.isRejected ? 'destructive' : 'outline'
              }
              className="flex-1 text-xs"
              onClick={(event) => {
                event.stopPropagation();
                togglePhotoReject(photo.id);
              }}
            >
              {isRejected || analysis?.isRejected ? '❌' : 'X'}
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
                  ? 'border-purple-700 bg-purple-600 text-white hover:bg-purple-700'
                  : 'border-gray-300 bg-white/90 text-gray-900 hover:bg-white'
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
                  ? 'border-green-700 bg-green-600 text-white hover:bg-green-700'
                  : 'border-red-700 bg-red-600 text-white hover:bg-red-700'
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
                className="h-8 border-blue-700 bg-blue-600 px-2 text-xs text-white hover:bg-blue-700"
              >
                Meilleure
              </Button>
            )}
          </div>
        </div>

        <CardContent className="bg-white/95 p-3 backdrop-blur-sm">
          <div className="space-y-2">
            <p
              className="truncate text-sm font-medium text-gray-900"
              title={photo.file.name}
            >
              {photo.file.name}
            </p>
            <p className="text-xs font-medium text-gray-700">
              {formatFileSize(photo.file.size)}
            </p>

            {hasAnalysis && analysis?.tags && analysis.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {analysis.tags.slice(0, 3).map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="border-gray-300 bg-gray-100 text-xs text-gray-900"
                  >
                    {tag}
                  </Badge>
                ))}
                {analysis.tags.length > 3 && (
                  <Badge
                    variant="outline"
                    className="border-gray-300 bg-gray-100 text-xs text-gray-900"
                  >
                    +{analysis.tags.length - 3}
                  </Badge>
                )}
              </div>
            )}

            {hasAnalysis && (
              <div className="space-y-1">
                {analysis?.isBlurry && (
                  <Badge
                    variant="destructive"
                    className="border-red-700 bg-red-600 text-xs text-white"
                  >
                    Floue
                  </Badge>
                )}
                {analysis?.hasOpenEyes === false && (
                  <Badge
                    variant="secondary"
                    className="border-yellow-700 bg-yellow-600 text-xs text-white"
                  >
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
