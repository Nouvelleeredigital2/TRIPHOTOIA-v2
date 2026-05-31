export interface WeddingCollectionDefinition {
  id: string;
  name: string;
  description: string;
}

export const WEDDING_COLLECTION_TEMPLATE: readonly WeddingCollectionDefinition[] = [
  {
    id: 'wedding-preparatifs',
    name: 'Préparatifs',
    description: 'Préparatifs, détails de début de journée et ambiance avant cérémonie.',
  },
  {
    id: 'wedding-ceremonie',
    name: 'Cérémonie',
    description: 'Moments clés de la cérémonie et réactions importantes.',
  },
  {
    id: 'wedding-couple',
    name: 'Couple',
    description: 'Portraits du couple et images fortes de couple.',
  },
  {
    id: 'wedding-famille',
    name: 'Famille',
    description: 'Portraits de famille et photos intergénérationnelles.',
  },
  {
    id: 'wedding-groupes',
    name: 'Groupes',
    description: 'Photos de groupes formelles ou spontanées.',
  },
  {
    id: 'wedding-cocktail',
    name: 'Cocktail',
    description: 'Cocktail, invités, interactions et moments documentaires.',
  },
  {
    id: 'wedding-details',
    name: 'Détails',
    description: 'Décoration, lieu, alliances, robe, fleurs et éléments éditoriaux.',
  },
  {
    id: 'wedding-soiree',
    name: 'Soirée',
    description: 'Discours, repas, danse, fête et fin de reportage.',
  },
  {
    id: 'wedding-best-of',
    name: 'Best of',
    description: 'Sélection courte des images les plus fortes du reportage.',
  },
  {
    id: 'wedding-album',
    name: 'Album',
    description: 'Candidates pour la maquette album.',
  },
  {
    id: 'wedding-client',
    name: 'Client',
    description: 'Sélection prête pour livraison client.',
  },
] as const;

export const normalizeWeddingCollectionName = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export function buildWeddingCollectionDefinitions(existingNames = new Set<string>()) {
  const normalizedExistingNames = new Set(
    Array.from(existingNames).map((name) => normalizeWeddingCollectionName(name)),
  );

  return WEDDING_COLLECTION_TEMPLATE.filter(
    (collection) => !normalizedExistingNames.has(normalizeWeddingCollectionName(collection.name)),
  );
}
