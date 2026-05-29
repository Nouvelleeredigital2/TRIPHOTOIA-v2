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

export interface TriageSearchCriteria {
  collectionPhotoIds?: Set<string>;
  collectionId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface SavedTriageSearch {
  id: string;
  name: string;
  activeFilter: TriageFilterType;
  searchTerm: string;
  sortKey: TriageSortKey;
  criteria: Omit<TriageSearchCriteria, 'collectionPhotoIds'>;
  createdAt: string;
  updatedAt: string;
}

interface BuildSavedTriageSearchParams {
  id: string;
  name: string;
  activeFilter: TriageFilterType;
  searchTerm: string;
  sortKey: TriageSortKey;
  criteria?: Omit<TriageSearchCriteria, 'collectionPhotoIds'>;
  now?: string;
}

interface FilterTriagePhotosParams {
  photos: Photo[];
  duplicateGroups: DuplicateGroup[];
  rejectedPhotoIds: Set<string>;
  selectedPhotoId: string | null;
  activeFilter: TriageFilterType;
  searchTerm: string;
  sortKey: TriageSortKey;
  userTags?: Record<string, string[]>;
  searchCriteria?: TriageSearchCriteria;
}

export const isFavoritePhoto = (photo: Photo) =>
  photo.analysis?.isPick === true && (photo.analysis?.rating ?? 0) >= 5;

export const isReviewPhoto = (photo: Photo, rejectedPhotoIds: Set<string>) =>
  photo.analysis !== null &&
  !photo.analysis.error &&
  photo.analysis.isPick !== true &&
  photo.analysis.isRejected !== true &&
  !rejectedPhotoIds.has(photo.id);

export function buildSavedTriageSearch({
  id,
  name,
  activeFilter,
  searchTerm,
  sortKey,
  criteria = {},
  now = new Date().toISOString(),
}: BuildSavedTriageSearchParams): SavedTriageSearch {
  return {
    id,
    name: name.trim() || 'Recherche sans nom',
    activeFilter,
    searchTerm,
    sortKey,
    criteria,
    createdAt: now,
    updatedAt: now,
  };
}

const normalizeSearch = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const parsePhotoDate = (photo: Photo): number | null => {
  const exif = photo.metadata?.exif as Record<string, unknown> | undefined;
  const exifDate = exif?.DateTimeOriginal;
  if (typeof exifDate === 'string' && exifDate.trim()) {
    const normalized = exifDate.includes('T')
      ? exifDate
      : exifDate.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
    const timestamp = Date.parse(normalized);
    if (!Number.isNaN(timestamp)) {
      return timestamp;
    }
  }

  return typeof photo.lastModified === 'number' ? photo.lastModified : null;
};

const isInsideDateRange = (photo: Photo, dateFrom?: string, dateTo?: string) => {
  if (!dateFrom && !dateTo) {
    return true;
  }

  const timestamp = parsePhotoDate(photo);
  if (timestamp === null) {
    return false;
  }

  if (dateFrom) {
    const from = Date.parse(`${dateFrom}T00:00:00.000`);
    if (!Number.isNaN(from) && timestamp < from) {
      return false;
    }
  }

  if (dateTo) {
    const to = Date.parse(`${dateTo}T23:59:59.999`);
    if (!Number.isNaN(to) && timestamp > to) {
      return false;
    }
  }

  return true;
};

export function filterTriagePhotos({
  photos,
  duplicateGroups,
  rejectedPhotoIds,
  selectedPhotoId,
  activeFilter,
  searchTerm,
  sortKey,
  userTags = {},
  searchCriteria,
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
    const q = normalizeSearch(searchTerm);
    result = result.filter((photo) => {
      if (normalizeSearch(photo.file.name).includes(q)) return true;
      if ((photo.analysis?.tags ?? []).some((tag) => normalizeSearch(tag).includes(q))) return true;
      if ((userTags[photo.id] ?? []).some((tag) => normalizeSearch(tag).includes(q))) return true;

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
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

      return searchable.includes(q);
    });
  }

  if (searchCriteria?.collectionPhotoIds) {
    result = result.filter((photo) => searchCriteria.collectionPhotoIds?.has(photo.id));
  }

  if (searchCriteria?.dateFrom || searchCriteria?.dateTo) {
    result = result.filter((photo) => isInsideDateRange(photo, searchCriteria.dateFrom, searchCriteria.dateTo));
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
