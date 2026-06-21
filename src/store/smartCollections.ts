// Collections intelligentes — logique PURE (aucune dépendance au store).
// Extrait de smartCollectionsSelector pour briser le cycle d'import
// photoStore ↔ smartCollectionsSelector (P2-2) : photoStore importe d'ici,
// et le hook useSmartCollections (qui dépend du store) reste dans le selector.
import {
  COLOR_LABEL_META,
  DuplicateGroup,
  Photo,
  SmartCollection,
  SmartCollectionRule,
} from '../types';

export const SMART_COLLECTIONS: SmartCollection[] = [
  { id: 'sc-all', name: 'Toutes les photos', icon: '▦', rule: { type: 'all' } },
  {
    id: 'sc-unreviewed',
    name: 'Non triées',
    icon: '○',
    rule: { type: 'unreviewed' },
  },
  { id: 'sc-review', name: 'À revoir', icon: '?', rule: { type: 'review' } },
  { id: 'sc-picks', name: 'Picks', icon: '✓', rule: { type: 'isPick' } },
  {
    id: 'sc-favorites',
    name: 'Favorites',
    icon: '★',
    rule: { type: 'isFavorite' },
  },
  {
    id: 'sc-rejected',
    name: 'Rejetées',
    icon: '×',
    rule: { type: 'isRejected' },
  },
  {
    id: 'sc-duplicates',
    name: 'Doublons',
    icon: '≋',
    rule: { type: 'isDuplicate' },
  },
  { id: 'sc-blurry', name: 'Floues', icon: '◌', rule: { type: 'isBlurry' } },
  {
    id: 'sc-ready-export',
    name: 'Prêtes à exporter',
    icon: '⇥',
    rule: { type: 'readyToExport' },
  },
  {
    id: 'sc-5stars',
    name: '5 étoiles',
    icon: '★',
    rule: { type: 'rating', minValue: 5 },
  },
  {
    id: 'sc-4stars',
    name: '4 étoiles et +',
    icon: '★',
    rule: { type: 'rating', minValue: 4 },
  },
  {
    id: 'sc-red',
    name: COLOR_LABEL_META.red.label,
    icon: '●',
    rule: { type: 'colorLabel', label: 'red' },
  },
  {
    id: 'sc-yellow',
    name: COLOR_LABEL_META.yellow.label,
    icon: '●',
    rule: { type: 'colorLabel', label: 'yellow' },
  },
  {
    id: 'sc-green',
    name: COLOR_LABEL_META.green.label,
    icon: '●',
    rule: { type: 'colorLabel', label: 'green' },
  },
  {
    id: 'sc-blue',
    name: COLOR_LABEL_META.blue.label,
    icon: '●',
    rule: { type: 'colorLabel', label: 'blue' },
  },
  {
    id: 'sc-purple',
    name: COLOR_LABEL_META.purple.label,
    icon: '●',
    rule: { type: 'colorLabel', label: 'purple' },
  },
];

interface SmartCollectionContext {
  duplicateGroups?: DuplicateGroup[];
  rejectedPhotoIds?: Set<string>;
}

const getDuplicatePhotoIds = (
  duplicateGroups: DuplicateGroup[] = []
): Set<string> =>
  new Set(
    duplicateGroups.flatMap((group) => group.photos.map((photo) => photo.id))
  );

const isRejectedPhoto = (
  photo: Photo,
  rejectedPhotoIds = new Set<string>()
): boolean =>
  photo.analysis?.isRejected === true || rejectedPhotoIds.has(photo.id);

const isPickPhoto = (photo: Photo): boolean => photo.analysis?.isPick === true;

const isFavoritePhoto = (photo: Photo): boolean =>
  photo.analysis?.isPick === true && (photo.analysis?.rating ?? 0) >= 5;

const isReviewPhoto = (
  photo: Photo,
  rejectedPhotoIds = new Set<string>()
): boolean =>
  Boolean(photo.analysis) &&
  !photo.analysis?.error &&
  !isPickPhoto(photo) &&
  !isRejectedPhoto(photo, rejectedPhotoIds);

export function matchesRule(
  photo: Photo,
  rule: SmartCollectionRule,
  context: SmartCollectionContext = {}
): boolean {
  const duplicatePhotoIds = getDuplicatePhotoIds(context.duplicateGroups);

  switch (rule.type) {
    case 'all':
      return true;
    case 'unreviewed':
      return !photo.analysis || Boolean(photo.analysis.error);
    case 'review':
      return isReviewPhoto(photo, context.rejectedPhotoIds);
    case 'rating':
      return (photo.analysis?.rating ?? 0) >= rule.minValue;
    case 'isPick':
      return isPickPhoto(photo);
    case 'isFavorite':
      return isFavoritePhoto(photo);
    case 'isRejected':
      return isRejectedPhoto(photo, context.rejectedPhotoIds);
    case 'isDuplicate':
      return duplicatePhotoIds.has(photo.id);
    case 'isBlurry':
      return photo.analysis?.isBlurry === true;
    case 'readyToExport':
      return (
        isPickPhoto(photo) &&
        !isRejectedPhoto(photo, context.rejectedPhotoIds) &&
        photo.analysis?.isBlurry !== true &&
        !duplicatePhotoIds.has(photo.id)
      );
    case 'hasTag':
      return photo.analysis?.tags?.includes(rule.tag) ?? false;
    case 'colorLabel':
      return photo.analysis?.colorLabel === rule.label;
  }
}

export interface ResolvedSmartCollection extends SmartCollection {
  count: number;
  photoIds: string[];
}

export function resolveSmartCollections(
  photos: Photo[],
  duplicateGroups: DuplicateGroup[] = [],
  rejectedPhotoIds = new Set<string>()
): ResolvedSmartCollection[] {
  const context: SmartCollectionContext = { duplicateGroups, rejectedPhotoIds };

  return SMART_COLLECTIONS.map((smartCollection) => {
    const matched = photos.filter((photo) =>
      matchesRule(photo, smartCollection.rule, context)
    );
    return {
      ...smartCollection,
      count: matched.length,
      photoIds: matched.map((photo) => photo.id),
    };
  });
}
