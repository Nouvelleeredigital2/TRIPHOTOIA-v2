import { describe, expect, it } from 'vitest';

import {
  WEDDING_COLLECTION_TEMPLATE,
  buildWeddingCollectionDefinitions,
} from '../../../features/wedding/weddingTemplate';

describe('weddingTemplate', () => {
  it('defines the wedding chapter collections in delivery order', () => {
    expect(
      WEDDING_COLLECTION_TEMPLATE.map((collection) => collection.name)
    ).toEqual([
      'Préparatifs',
      'Cérémonie',
      'Couple',
      'Famille',
      'Groupes',
      'Cocktail',
      'Détails',
      'Soirée',
      'Best of',
      'Album',
      'Client',
    ]);
  });

  it('builds stable ids and keeps existing chapters out of the creation payload', () => {
    expect(
      buildWeddingCollectionDefinitions(new Set(['couple', 'album'])).map(
        (collection) => collection.id
      )
    ).toEqual([
      'wedding-preparatifs',
      'wedding-ceremonie',
      'wedding-famille',
      'wedding-groupes',
      'wedding-cocktail',
      'wedding-details',
      'wedding-soiree',
      'wedding-best-of',
      'wedding-client',
    ]);
  });
});
