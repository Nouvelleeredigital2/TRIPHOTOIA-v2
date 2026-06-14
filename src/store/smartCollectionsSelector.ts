// Hook React des collections intelligentes. La logique pure vit dans
// ./smartCollections (sans dépendance au store) ; ce fichier ne fait que
// brancher le store. Re-export pour compat des imports existants.
import { usePhotoStore } from './photoStore';
import { resolveSmartCollections, type ResolvedSmartCollection } from './smartCollections';

export {
  SMART_COLLECTIONS,
  matchesRule,
  resolveSmartCollections,
  type ResolvedSmartCollection,
} from './smartCollections';

export function useSmartCollections(): ResolvedSmartCollection[] {
  const photos = usePhotoStore((state) => state.photos);
  const duplicateGroups = usePhotoStore((state) => state.duplicateGroups);
  const rejectedPhotoIds = usePhotoStore((state) => state.rejectedPhotoIds);

  return resolveSmartCollections(photos, duplicateGroups, rejectedPhotoIds);
}
