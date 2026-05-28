import { ColorLabel, DuplicateGroup, Photo } from '../../types';

export type TriageFilterType =
  | 'all'
  | 'duplicates'
  | 'rejected'
  | 'selected'
  | 'blurry'
  | 'picks'
  | 'favorites'
  | 'review'
  | `color:${ColorLabel}`
  | `stars:${number}`;

export type TriageSortKey =
  | 'default'
  | 'rating-desc'
  | 'rating-asc'
  | 'sharpness-desc'
  | 'name-asc'
  | 'name-desc'
  | 'size-desc';

interface FilterTriagePhotosParams {
  photos: Photo[];
  duplicateGroups: DuplicateGroup[];
  rejectedPhotoIds: Set<string>;
  selectedPhotoId: string | null;
  activeFilter: TriageFilterType;
  searchTerm: string;
  sortKey: TriageSortKey;
}

export const isFavoritePhoto = (photo: Photo) =>
  photo.analysis?.isPick === true && (photo.analysis?.rating ?? 0) >= 5;

export const isReviewPhoto = (photo: Photo, rejectedPhotoIds: Set<string>) =>
  photo.analysis !== null &&
  !photo.analysis.error &&
  photo.analysis.isPick !== true &&
  photo.analysis.isRejected !== true &&
  !rejectedPhotoIds.has(photo.id);

export function filterTriagePhotos({
  photos,
  duplicateGroups,
  rejectedPhotoIds,
  selectedPhotoId,
  activeFilter,
  searchTerm,
  sortKey,
}: FilterTriagePhotosParams): Photo[] {
  const analyzedPhotos = photos.filter((p) => p.analysis && !p.analysis.error);

  let result: Photo[];
  if (activeFilter === 'duplicates') {
    const duplicatePhotoIds = new Set(
      duplicateGroups.flatMap((group) => group.photos.map((p) => p.id)),
    );
    result = analyzedPhotos.filter((photo) => duplicatePhotoIds.has(photo.id));
  } else if (activeFilter === 'blurry') {
    result = analyzedPhotos.filter((photo) => photo.analysis?.isBlurry === true);
  } else if (activeFilter === 'picks') {
    result = analyzedPhotos.filter((photo) => photo.analysis?.isPick === true);
  } else if (activeFilter === 'favorites') {
    result = analyzedPhotos.filter(isFavoritePhoto);
  } else if (activeFilter === 'review') {
    result = analyzedPhotos.filter((photo) => isReviewPhoto(photo, rejectedPhotoIds));
  } else if (activeFilter === 'rejected') {
    result = analyzedPhotos.filter(
      (photo) => photo.analysis?.isRejected === true || rejectedPhotoIds.has(photo.id),
    );
  } else if (activeFilter === 'selected') {
    result = analyzedPhotos.filter((photo) => selectedPhotoId === photo.id);
  } else if (activeFilter.startsWith('color:')) {
    const label = activeFilter.slice(6) as ColorLabel;
    result = analyzedPhotos.filter((photo) => photo.analysis?.colorLabel === label);
  } else if (activeFilter.startsWith('stars:')) {
    const minStars = parseInt(activeFilter.slice(6), 10);
    result = analyzedPhotos.filter((photo) => (photo.analysis?.rating ?? 0) >= minStars);
  } else {
    result = analyzedPhotos;
  }

  if (searchTerm.trim()) {
    const q = searchTerm.toLowerCase();
    result = result.filter((photo) => {
      if (photo.file.name.toLowerCase().includes(q)) return true;
      if ((photo.analysis?.tags ?? []).some((tag) => tag.toLowerCase().includes(q))) return true;

      const exif = photo.metadata?.exif as Record<string, unknown> | undefined;
      if (!exif) return false;

      const searchable = [
        exif.Make,
        exif.Model,
        exif.LensModel,
        exif.DateTimeOriginal,
        exif.ISOSpeedRatings !== undefined ? `iso ${exif.ISOSpeedRatings}` : null,
        exif.FocalLength !== undefined ? `${exif.FocalLength}mm` : null,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchable.includes(q);
    });
  }

  if (sortKey === 'default') {
    return result;
  }

  return [...result].sort((a, b) => {
    switch (sortKey) {
      case 'rating-desc':
        return (b.analysis?.rating ?? 0) - (a.analysis?.rating ?? 0);
      case 'rating-asc':
        return (a.analysis?.rating ?? 0) - (b.analysis?.rating ?? 0);
      case 'sharpness-desc':
        return (b.analysis?.sharpnessScore ?? 0) - (a.analysis?.sharpnessScore ?? 0);
      case 'name-asc':
        return a.file.name.localeCompare(b.file.name);
      case 'name-desc':
        return b.file.name.localeCompare(a.file.name);
      case 'size-desc':
        return b.file.size - a.file.size;
      default:
        return 0;
    }
  });
}
