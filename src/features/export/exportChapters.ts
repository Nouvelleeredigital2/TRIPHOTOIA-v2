import { DuplicateGroup, Photo, PhotoCollection } from '../../types';
import { buildPhotosToExport, ExportSelectionOptions } from './exportSelection';

export interface ExportChapter {
  collectionId: string;
  name: string;
  photos: Photo[];
}

interface BuildExportChaptersParams {
  photos: Photo[];
  collections: Record<string, PhotoCollection>;
  collectionOrder: string[];
  duplicateGroups: DuplicateGroup[];
  rejectedPhotoIds: Set<string>;
  options: ExportSelectionOptions;
}

export function buildExportChapters({
  photos,
  collections,
  collectionOrder,
  duplicateGroups,
  rejectedPhotoIds,
  options,
}: BuildExportChaptersParams): ExportChapter[] {
  const photoMap = new Map(photos.map((photo) => [photo.id, photo]));

  return collectionOrder.flatMap((collectionId) => {
    const collection = collections[collectionId];
    if (!collection) {
      return [];
    }

    const chapterPhotos = collection.photoIds
      .map((photoId) => photoMap.get(photoId))
      .filter((photo): photo is Photo => Boolean(photo));

    const exportablePhotos = buildPhotosToExport({
      photos: chapterPhotos,
      duplicateGroups,
      rejectedPhotoIds,
      options,
    });

    if (exportablePhotos.length === 0) {
      return [];
    }

    return [
      {
        collectionId,
        name: collection.name,
        photos: exportablePhotos,
      },
    ];
  });
}
