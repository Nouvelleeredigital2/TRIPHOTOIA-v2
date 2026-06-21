// Façade d'analyse photos — unique point d'entrée de l'application active (src/).
//
// P0-A / P1-B : seul le moteur local (Canvas / Web Workers, 100 % navigateur)
// est exposé en production. Les anciens providers distants (HuggingFace,
// Replicate, Clarifai) appelaient des API tierces directement depuis le
// navigateur et exigeaient une clé API côté client : ils sont retirés tant
// qu'aucune frontière serveur authentifiée n'existe. Aucune clé d'API tierce
// n'est demandée ni stockée dans le client.

import { workerAnalysisService } from './workerAnalysisService';
import { PhotoAnalysis } from '../types';
import { validateAnalysisResult } from '../lib/validators';

/**
 * Providers d'analyse réellement supportés en production.
 * Réduit à `local` : voir l'en-tête de fichier (P1-B).
 */
export type AnalysisProvider = 'local';

export interface AnalysisConfig {
  provider: AnalysisProvider;
  model?: string;
}

const DEFAULT_CONFIG: AnalysisConfig = { provider: 'local' };
let _currentConfig: AnalysisConfig = { ...DEFAULT_CONFIG };

export function setAnalysisProvider(config: AnalysisConfig): void {
  // Garde-fou : on ignore toute tentative de configurer un provider non supporté.
  _currentConfig = { provider: 'local', model: config.model };
}

export function getAnalysisConfig(): AnalysisConfig {
  return { ..._currentConfig };
}

// ---------- Dispatcher principal ----------

// P0-1 : le chemin d'analyse actif passe par le pool de Web Workers
// (OffscreenCanvas, proxy ≤1600 px, concurrence bornée 1-4, timeout/annulation
// par fichier). En cas d'échec/timeout d'un worker, `WorkerAnalysisService`
// retombe par fichier sur l'analyse Canvas locale réelle — jamais sur un score
// fabriqué. Plus aucun `getImageData()` pleine résolution sur le thread
// principal dans le chemin nominal.

/**
 * Analyse un lot de photos. 100 % local (Web Workers + fallback Canvas).
 * Retourne un résultat partiel par fichier ; les échecs individuels portent
 * un champ `error` (jamais transformés en score factice).
 */
export async function analyzePhotosBatch(
  files: File[],
  options: { signal?: AbortSignal } = {}
): Promise<Partial<PhotoAnalysis>[]> {
  if (files.length === 0) return [];
  const results = await workerAnalysisService.analyzePhotosBatch(files, options);
  // P0-B : validation Zod à la frontière. Un résultat invalide (NaN, hors plage,
  // sans provenance, mode `demo`…) devient une erreur structurée, jamais un score.
  return results.map((result) => validateAnalysisResult(result));
}
