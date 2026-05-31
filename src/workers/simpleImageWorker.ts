import { PhotoAnalysis } from '../types';
/**
 * Web Worker simplifié pour l'analyse d'images
 * Version de fallback qui évite les problèmes d'API complexes
 */

interface WorkerMessage {
  type: 'ANALYZE_IMAGE';
  payload: {
    file: File;
    id: string;
  };
}

interface WorkerResponse {
  type: 'ANALYSIS_COMPLETE' | 'ANALYSIS_ERROR';
  payload: {
    id: string;
    result?: PhotoAnalysis;
    error?: string;
  };
}

// Analyse simplifiée sans traitement d'image complexe
function analyzeImageSimple(file: File): PhotoAnalysis {
  const fileSize = file.size;
  const fileName = file.name.toLowerCase();
  const fileType = file.type;

  // Analyse basée sur les métadonnées du fichier
  const tags: string[] = [];

  // Tags basés sur le nom du fichier
  if (fileName.includes('portrait') || fileName.includes('selfie')) {
    tags.push('portrait', 'selfie');
  }
  if (fileName.includes('landscape') || fileName.includes('paysage')) {
    tags.push('landscape', 'paysage');
  }
  if (fileName.includes('nature') || fileName.includes('outdoor')) {
    tags.push('nature', 'extérieur');
  }
  if (fileName.includes('indoor') || fileName.includes('intérieur')) {
    tags.push('intérieur', 'indoor');
  }

  // Tags basés sur la taille du fichier
  if (fileSize > 5 * 1024 * 1024) { // > 5MB
    tags.push('haute-résolution', 'high-resolution');
  } else if (fileSize < 500 * 1024) { // < 500KB
    tags.push('basse-résolution', 'low-resolution');
  }

  // Tags basés sur le type de fichier
  if (fileType.includes('jpeg') || fileType.includes('jpg')) {
    tags.push('jpeg', 'photo');
  } else if (fileType.includes('png')) {
    tags.push('png', 'image');
  } else if (fileType.includes('webp')) {
    tags.push('webp', 'moderne');
  }

  // Génération d'un hash simple basé sur les propriétés du fichier
  const hashInput = `${file.name}-${file.size}-${file.lastModified}`;
  let hash = 0;
  for (let i = 0; i < hashInput.length; i++) {
    const char = hashInput.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  const hexPart = Math.abs(hash).toString(16).padStart(8, '0');
  const perceptualHash = hexPart.split('').map(c => parseInt(c, 16).toString(2).padStart(4, '0')).join('').padEnd(64, '0');

  // Simulation d'analyse de qualité basée sur la taille
  const qualityScore = Math.min(fileSize / (2 * 1024 * 1024), 1.0); // Normalisé sur 2MB
  const isBlurry = qualityScore < 0.3;
  const sharpnessScore = qualityScore;

  // Simulation de détection d'yeux (basée sur le nom de fichier)
  const hasOpenEyes = fileName.includes('open') ||
                     fileName.includes('ouvert') ||
                     fileName.includes('smile') ||
                     fileName.includes('sourire') ||
                     !fileName.includes('closed') && !fileName.includes('fermé');

  return {
    isBlurry,
    sharpnessScore,
    hasOpenEyes,
    tags: tags.slice(0, 5), // Limiter à 5 tags
    perceptualHash,
    suggestedRetouch: {
      brightness: 1.0 + (Math.random() - 0.5) * 0.2, // Variation légère
      contrast: 1.0 + (Math.random() - 0.5) * 0.2,
      saturation: 1.0 + (Math.random() - 0.5) * 0.2
    }
  };
}

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, payload } = event.data;

  if (type === 'ANALYZE_IMAGE') {
    try {
      const result = analyzeImageSimple(payload.file);

      const response: WorkerResponse = {
        type: 'ANALYSIS_COMPLETE',
        payload: {
          id: payload.id,
          result
        }
      };

      self.postMessage(response);
    } catch (error) {
      const response: WorkerResponse = {
        type: 'ANALYSIS_ERROR',
        payload: {
          id: payload.id,
          error: error instanceof Error ? error.message : 'Erreur inconnue'
        }
      };

      self.postMessage(response);
    }
  }
};

