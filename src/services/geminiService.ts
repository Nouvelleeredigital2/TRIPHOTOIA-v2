// Service d'analyse photos — dispatcher local + HuggingFace Inference API

import { LocalAnalysisService } from './localAnalysisService';
import { PhotoAnalysis } from '../types';

export type AnalysisProvider = 'local' | 'huggingface' | 'replicate' | 'clarifai';

export interface AnalysisConfig {
  provider: AnalysisProvider;
  apiKey?: string;
  model?: string;
}

// ---------- Config globale (persiste en mémoire par session) ----------

const DEFAULT_CONFIG: AnalysisConfig = { provider: 'local', model: 'microsoft/resnet-50' };
let _currentConfig: AnalysisConfig = { ...DEFAULT_CONFIG };

export function setAnalysisProvider(config: AnalysisConfig): void {
  _currentConfig = { ...config };
}

export function getAnalysisConfig(): AnalysisConfig {
  return { ..._currentConfig };
}

// ---------- Dispatcher principal ----------

const _localService = new LocalAnalysisService();

/**
 * Analyse un lot de photos. Toujours local (Canvas) + optionnellement HuggingFace pour les tags sémantiques.
 */
export async function analyzePhotosBatch(files: File[]): Promise<Partial<PhotoAnalysis>[]> {
  if (files.length === 0) return [];

  const config = getAnalysisConfig();

  // Étape 1 : analyse locale systématique (flou, netteté, pHash, yeux)
  const localResults = await _localService.analyzePhotosBatch(files);

  // Étape 2 : enrichissement sémantique HuggingFace (tags uniquement)
  if (config.provider === 'huggingface') {
    const tagResults = await fetchHuggingFaceTags(files, config);
    return localResults.map((local, i) => ({
      ...local,
      tags: tagResults[i].length > 0 ? tagResults[i] : (local.tags ?? []),
    }));
  }

  return localResults;
}

// ---------- HuggingFace Inference API ----------

const HF_INFERENCE_URL = 'https://api-inference.huggingface.co/models';

interface HFClassificationResult {
  label: string;
  score: number;
}

async function classifyWithHuggingFace(
  buffer: ArrayBuffer,
  model: string,
  apiKey?: string,
): Promise<HFClassificationResult[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/octet-stream' };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${HF_INFERENCE_URL}/${model}`, {
    method: 'POST',
    headers,
    body: buffer,
  });

  if (response.status === 503) {
    // Modèle en cours de chargement — on retourne un tableau vide
    return [];
  }
  if (!response.ok) {
    throw new Error(`HuggingFace API ${response.status}: ${await response.text()}`);
  }

  const result = await response.json() as HFClassificationResult[];
  return Array.isArray(result) ? result : [];
}

function labelsToTags(results: HFClassificationResult[], threshold = 0.15): string[] {
  return results
    .filter((r) => r.score >= threshold)
    .map((r) => r.label.toLowerCase().replace(/_/g, ' ').split(',')[0].trim())
    .filter((label, index, arr) => arr.indexOf(label) === index)
    .slice(0, 8);
}

async function fetchHuggingFaceTags(files: File[], config: AnalysisConfig): Promise<string[][]> {
  const model = config.model ?? 'microsoft/resnet-50';
  return Promise.all(
    files.map(async (file) => {
      try {
        const buffer = await file.arrayBuffer();
        const results = await classifyWithHuggingFace(buffer, model, config.apiKey);
        return labelsToTags(results);
      } catch (error) {
        console.warn(`[HuggingFace] Échec pour ${file.name}:`, error);
        return [];
      }
    }),
  );
}
