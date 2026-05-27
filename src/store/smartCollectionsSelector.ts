import { usePhotoStore } from './photoStore';
import { Photo, SmartCollection, SmartCollectionRule, COLOR_LABEL_META } from '../types';

export const SMART_COLLECTIONS: SmartCollection[] = [
  { id: 'sc-5stars',  name: '5 étoiles',      icon: '⭐', rule: { type: 'rating', minValue: 5 } },
  { id: 'sc-4stars',  name: '4 étoiles et +',  icon: '★',  rule: { type: 'rating', minValue: 4 } },
  { id: 'sc-picks',   name: 'Sélections',      icon: '🎯', rule: { type: 'isPick' } },
  { id: 'sc-rejects', name: 'Rejets',          icon: '✕',  rule: { type: 'isRejected' } },
  { id: 'sc-blurry',  name: 'Photos floues',   icon: '◌',  rule: { type: 'isBlurry' } },
  // Color label smart collections
  { id: 'sc-red',     name: COLOR_LABEL_META.red.label,    icon: '🔴', rule: { type: 'colorLabel', label: 'red' } },
  { id: 'sc-yellow',  name: COLOR_LABEL_META.yellow.label, icon: '🟡', rule: { type: 'colorLabel', label: 'yellow' } },
  { id: 'sc-green',   name: COLOR_LABEL_META.green.label,  icon: '🟢', rule: { type: 'colorLabel', label: 'green' } },
  { id: 'sc-blue',    name: COLOR_LABEL_META.blue.label,   icon: '🔵', rule: { type: 'colorLabel', label: 'blue' } },
  { id: 'sc-purple',  name: COLOR_LABEL_META.purple.label, icon: '🟣', rule: { type: 'colorLabel', label: 'purple' } },
];

export function matchesRule(photo: Photo, rule: SmartCollectionRule): boolean {
  switch (rule.type) {
    case 'rating':
      return (photo.analysis?.rating ?? 0) >= rule.minValue;
    case 'isPick':
      return photo.analysis?.isPick === true;
    case 'isRejected':
      return photo.analysis?.isRejected === true;
    case 'isBlurry':
      return photo.analysis?.isBlurry === true;
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

export function useSmartCollections(): ResolvedSmartCollection[] {
  const photos = usePhotoStore((state) => state.photos);

  return SMART_COLLECTIONS.map((sc) => {
    const matched = photos.filter((p) => matchesRule(p, sc.rule));
    return {
      ...sc,
      count: matched.length,
      photoIds: matched.map((p) => p.id),
    };
  });
}
