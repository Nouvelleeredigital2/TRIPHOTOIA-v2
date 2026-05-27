import React, { useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '../../../lib/utils';
import { Photo } from '../../../types';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';

interface FilmstripProps {
  photos: Photo[];
  activePhotoId: string | null;
  processingIds: Set<string>;
  developmentSelection: Set<string>;
  onSelect: (photoId: string) => void;
  onToggleDevelopment: (photoId: string) => void;
}

export const Filmstrip: React.FC<FilmstripProps> = ({
  photos,
  activePhotoId,
  processingIds,
  developmentSelection,
  onSelect,
  onToggleDevelopment,
}) => {
  const parentRef = useRef<HTMLDivElement | null>(null);

  const estimateSize = useCallback(() => 120, []);

  const rowVirtualizer = useVirtualizer({
    count: photos.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan: 8,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  const handleToggleDevelopment = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>, photoId: string) => {
      event.stopPropagation();
      onToggleDevelopment(photoId);
    },
    [onToggleDevelopment]
  );

  const renderCard = useCallback(
    (photo: Photo, isActive: boolean, isSelected: boolean, isProcessing: boolean) => (
      <div
        className={cn(
          'group relative rounded-md border p-2 bg-background/70 hover:bg-background/90 transition-colors cursor-pointer',
          isActive ? 'border-primary shadow-md' : 'border-border/50'
        )}
        onClick={() => onSelect(photo.id)}
      >
        <div className="flex items-center gap-3">
          <div className="relative h-16 w-16 overflow-hidden rounded">
            <img src={photo.previewUrl} alt={photo.file.name} className="h-full w-full object-cover" />
            {isProcessing && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{photo.file.name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {photo.retouch?.lastUpdated && (
                <span>Maj : {new Date(photo.retouch.lastUpdated).toLocaleTimeString()}</span>
              )}
              {photo.analysis?.isBlurry && <Badge variant="destructive">Floue</Badge>}
            </div>
          </div>
        </div>

        <Button
          variant={isSelected ? 'default' : 'outline'}
          size="sm"
          className={cn(
            'mt-3 w-full text-xs transition-all',
            isSelected ? 'bg-purple-600 hover:bg-purple-700' : 'hover:bg-background'
          )}
          onClick={(event) => handleToggleDevelopment(event, photo.id)}
        >
          {isSelected ? 'Retirer du lot' : 'Ajouter au lot'}
        </Button>
      </div>
    ),
    [handleToggleDevelopment, onSelect]
  );

  return (
    <div ref={parentRef} className="h-full overflow-y-auto pr-2" style={{ contain: 'strict' }}>
      <div
        style={{ height: totalSize, position: 'relative', width: '100%' }}
        className="relative"
      >
        {virtualItems.map((virtualRow) => {
          const photo = photos[virtualRow.index];
          if (!photo) {
            return null;
          }

          const isActive = activePhotoId === photo.id;
          const isSelected = developmentSelection.has(photo.id);
          const isProcessing = processingIds.has(photo.id);

          return (
            <div
              key={photo.id}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              className="absolute left-0 w-full" 
              style={{
                transform: `translateY(${virtualRow.start}px)`,
                paddingBottom: '0.75rem',
              }}
            >
              {renderCard(photo, isActive, isSelected, isProcessing)}
            </div>
          );
        })}
      </div>
    </div>
  );
};
