// Helpers globaux partagés entre tous les fichiers de test

// Supprime les warnings React act() qui polluent les logs en environnement de test
import { expect } from 'vitest';

// Assure que les imports d'assertion étendus sont correctement chargés
// (complète le setup.ts qui importe @testing-library/jest-dom/vitest)
expect.extend({});
