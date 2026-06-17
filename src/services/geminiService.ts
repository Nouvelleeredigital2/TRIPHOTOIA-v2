// Façade d'analyse photos — unique point d'entrée de l'application active (src/).
//
// P0-A / P1-B : seul le moteur local (Canvas / Web Workers, 100 % navigateur)
// est exposé en production. Les anciens providers distants (HuggingFace,
// Replicate, Clarifai) appelaient des API tierces directement depuis le
// navigateur et exigeaient une clé API côté client : ils sont retirés tant
// qu'aucune frontière serveur authentifiée n'existe. Aucune clé d'API tierce
// n'est demandée ni stockée dans le client.

import { LocalAnalysisService } from './localAnalysisService';
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

const _localService = new LocalAnalysisService();

/**
 * Analyse un lot de photos. 100 % local (Canvas + Web Workers).
 * Retourne un résultat partiel par fichier ; les échecs individuels portent
 * un champ `error` (jamais transformés en score factice).
 */
export async function analyzePhotosBatch(
  files: File[]
): Promise<Partial<PhotoAnalysis>[]> {
  if (files.length === 0) return [];
  const results = await _localService.analyzePhotosBatch(files);
  // P0-B : validation Zod à la frontière. Un résultat invalide (NaN, hors plage,
  // sans provenance, mode `demo`…) devient une erreur structurée, jamais un score.
  return results.map((result) => validateAnalysisResult(result));
}
