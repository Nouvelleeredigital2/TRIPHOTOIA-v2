import { DuplicateGroup, Photo } from '../../types';

export type ExportFilterMode =
  | 'all'
  | 'picks-only'
  | 'favorites-only'
  | 'min-rating';

export interface ExportSelectionOptions {
  includeRejected: boolean;
  includeDuplicates: boolean;
  filterMode: ExportFilterMode;
  minRating: number;
}

interface BuildPhotosToExportParams {
  photos: Photo[];
  duplicateGroups: DuplicateGroup[];
  rejectedPhotoIds: Set<string>;
  options: ExportSelectionOptions;
}

export function buildDuplicatePhotoIds(
  photos: Photo[],
  duplicateGroups: DuplicateGroup[]
) {
  const activePhotoIds = new Set(photos.map((photo) => photo.id));

  return new Set(
    duplicateGroups
      .filter((group) =>
        group.photos.some((photo) => activePhotoIds.has(photo.id))
      )
      .flatMap((group) => group.photos.map((photo) => photo.id))
  );
}

export function buildPhotosToExport({
  photos,
  duplicateGroups,
  rejectedPhotoIds,
  options,
}: BuildPhotosToExportParams): Photo[] {
  const analyzedPhotos = photos.filter(
    (photo) => photo.analysis && !photo.analysis.error
  );
  const duplicatePhotoIds = buildDuplicatePhotoIds(
    analyzedPhotos,
    duplicateGroups
  );

  return analyzedPhotos.filter((photo) => {
    const isRejected =
      rejectedPhotoIds.has(photo.id) || photo.analysis?.isRejected === true;
    const isDuplicate = duplicatePhotoIds.has(photo.id);
    const isPick = photo.analysis?.isPick === true;
    const isFavorite = isPick && (photo.analysis?.rating ?? 0) >= 5;

    if (isRejected && !options.includeRejected) return false;
    if (isDuplicate && !options.includeDuplicates) return false;
    if (options.filterMode === 'picks-only' && !isPick) return false;
    if (options.filterMode === 'favorites-only' && !isFavorite) return false;
    if (
      options.filterMode === 'min-rating' &&
      (photo.analysis?.rating ?? 0) < options.minRating
    )
      return false;
    return true;
  });
}
