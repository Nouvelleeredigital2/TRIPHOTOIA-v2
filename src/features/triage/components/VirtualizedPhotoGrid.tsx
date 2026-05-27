import React, { useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { PhotoCard } from './PhotoCard';
import { Photo, DuplicateGroup } from '../../../types';

type VirtualizedItem =
  | { type: 'group'; id: string; data: { group: DuplicateGroup; photos: Photo[] } }
  | { type: 'photo'; id: string; data: Photo };

interface VirtualizedPhotoGridProps {
  photos: Photo[];
  selectedPhotoId: string | null;
  rejectedPhotoIds: Set<string>;
  bestPhotoOverrides: Record<string, string>;
  duplicateGroups: DuplicateGroup[];
  onSelectPhoto: (id: string) => void;
  onToggleRejectPhoto: (id: string) => void;
  onSetBestInGroup: (groupId: string, photoId: string) => void;
  parentRef: React.RefObject<HTMLDivElement>;
  collectionPhotoIds?: Set<string>;
  onToggleCollection?: (photoId: string) => void;
  developmentSelection?: Set<string>;
  onToggleDevelopment?: (photoId: string) => void;
  /** Multi-select */
  multiSelection?: Set<string>;
  onToggleMultiSelect?: (photoId: string) => void;
  /** Drag-and-drop reorder (active collection mode) */
  draggablePhotoIds?: Set<string>;
  dragOverPhotoId?: string | null;
  onPhotoDragStart?: (photoId: string, e: React.DragEvent) => void;
  onPhotoDragOver?: (photoId: string, e: React.DragEvent) => void;
  onPhotoDragLeave?: (photoId: string) => void;
  onPhotoDrop?: (photoId: string, e: React.DragEvent) => void;
  onPhotoDragEnd?: () => void;
}

export function VirtualizedPhotoGrid({
  photos,
  selectedPhotoId,
  rejectedPhotoIds,
  bestPhotoOverrides,
  duplicateGroups,
  onSelectPhoto,
  onToggleRejectPhoto,
  onSetBestInGroup,
  parentRef,
  collectionPhotoIds = new Set(),
  onToggleCollection = () => {},
  developmentSelection = new Set(),
  onToggleDevelopment = () => {},
  multiSelection = new Set(),
  onToggleMultiSelect = () => {},
  draggablePhotoIds,
  dragOverPhotoId,
  onPhotoDragStart,
  onPhotoDragOver,
  onPhotoDragLeave,
  onPhotoDrop,
  onPhotoDragEnd,
}: VirtualizedPhotoGridProps) {
  const isMultiSelectMode = multiSelection.size > 0;
  const { groupedPhotos, standalonePhotos } = useMemo(() => {
    const groupedPhotoIds = new Set<string>();
    const groups: Array<{ type: 'group'; group: DuplicateGroup; photos: Photo[] }> = [];
    const standalone: Photo[] = [];

    duplicateGroups.forEach((group) => {
      const groupPhotos = group.photos.filter((photo) => photos.some((entry) => entry.id === photo.id));
      if (groupPhotos.length > 0) {
        groupPhotos.forEach((photo) => groupedPhotoIds.add(photo.id));
        groups.push({ type: 'group', group, photos: groupPhotos });
      }
    });

    photos.forEach((photo) => {
      if (!groupedPhotoIds.has(photo.id)) {
        standalone.push(photo);
      }
    });

    return { groupedPhotos: groups, standalonePhotos: standalone };
  }, [photos, duplicateGroups]);

  const virtualItems: VirtualizedItem[] = useMemo(() => {
    const items: VirtualizedItem[] = [];

    groupedPhotos.forEach((groupData) => {
      items.push({
        type: 'group',
        id: groupData.group.id,
        data: groupData,
      });
    });

    standalonePhotos.forEach((photo) => {
      items.push({
        type: 'photo',
        id: photo.id,
        data: photo,
      });
    });

    return items;
  }, [groupedPhotos, standalonePhotos]);

  const virtualizer = useVirtualizer({
    count: virtualItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 300,
    overscan: 5,
  });

  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        overflow: 'auto',
      }}
      ref={parentRef}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = virtualItems[virtualItem.index];

          if (item.type === 'group') {
            const { group, photos: groupPhotos } = item.data;
            const bestPhotoId = bestPhotoOverrides[group.id] || group.bestPhotoId;

            return (
              <div
                key={item.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                className="p-4"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Groupe de doublons ({groupPhotos.length} photos)</h3>
                    <div className="text-sm text-muted-foreground">Hash: {group.hash.substring(0, 8)}...</div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {groupPhotos.map((photo) => (
                      <PhotoCard
                        key={photo.id}
                        photo={photo}
                        isSelected={selectedPhotoId === photo.id}
                        isRejected={rejectedPhotoIds.has(photo.id)}
                        isBestInGroup={bestPhotoId === photo.id}
                        onSelect={() => onSelectPhoto(photo.id)}
                        onToggleReject={() => onToggleRejectPhoto(photo.id)}
                        onSetAsBest={() => onSetBestInGroup(group.id, photo.id)}
                        inCollection={collectionPhotoIds.has(photo.id)}
                        onToggleCollection={() => onToggleCollection(photo.id)}
                        isInDevelopmentQueue={developmentSelection.has(photo.id)}
                        onToggleDevelopment={() => onToggleDevelopment(photo.id)}
                        isMultiSelected={multiSelection.has(photo.id)}
                        isMultiSelectMode={isMultiSelectMode}
                        onToggleMultiSelect={() => onToggleMultiSelect(photo.id)}
                        showGroupInfo
                        group={group}
                      />
                    ))}
                  </div>
                </div>
              </div>
            );
          }

          const photo = item.data;
          const isRejected = rejectedPhotoIds.has(photo.id);

          return (
            <div
              key={item.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
              className="p-4"
            >
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <PhotoCard
                  photo={photo}
                  isSelected={selectedPhotoId === photo.id}
                  isRejected={isRejected}
                  isBestInGroup={false}
                  onSelect={() => onSelectPhoto(photo.id)}
                  onToggleReject={() => onToggleRejectPhoto(photo.id)}
                  onSetAsBest={() => undefined}
                  inCollection={collectionPhotoIds.has(photo.id)}
                  onToggleCollection={() => onToggleCollection(photo.id)}
                  isInDevelopmentQueue={developmentSelection.has(photo.id)}
                  onToggleDevelopment={() => onToggleDevelopment(photo.id)}
                  isMultiSelected={multiSelection.has(photo.id)}
                  isMultiSelectMode={isMultiSelectMode}
                  onToggleMultiSelect={() => onToggleMultiSelect(photo.id)}
                  showGroupInfo={false}
                  draggable={draggablePhotoIds?.has(photo.id)}
                  isDragOver={dragOverPhotoId === photo.id}
                  onDragStart={(e) => onPhotoDragStart?.(photo.id, e)}
                  onDragOver={(e) => onPhotoDragOver?.(photo.id, e)}
                  onDragLeave={() => onPhotoDragLeave?.(photo.id)}
                  onDrop={(e) => onPhotoDrop?.(photo.id, e)}
                  onDragEnd={onPhotoDragEnd}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


