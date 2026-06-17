import { Photo } from '../types';

/**
 * Algorithme de notation automatique basé sur l'analyse IA
 * Critères: netteté, composition, yeux ouverts, suggestions retouche
 */

export interface RatingCriteria {
  sharpnessWeight: number; // Poids netteté (0-1)
  compositionWeight: number; // Poids composition (0-1)
  eyesWeight: number; // Poids yeux ouverts (0-1)
  retouchWeight: number; // Poids besoin retouche (0-1)
}

export const DEFAULT_CRITERIA: RatingCriteria = {
  sharpnessWeight: 0.4, // 40% - Le plus important
  compositionWeight: 0.3, // 30%
  eyesWeight: 0.15, // 15%
  retouchWeight: 0.15, // 15%
};

/**
 * Calcule la note automatique d'une photo (0-5 étoiles)
 */
export function calculateAutoRating(
  photo: Photo,
  criteria: RatingCriteria = DEFAULT_CRITERIA
): number {
  const analysis = photo.analysis;

  if (!analysis || analysis.error) {
    return 0; // Pas d'analyse = pas de note
  }

  let score = 0;
  let totalWeight = 0;

  // 1. Netteté (critère principal)
  if (analysis.sharpnessScore !== undefined) {
    const sharpnessScore = analysis.sharpnessScore;

    // Échelle:
    // > 0.8 = Excellente (1.0)
    // > 0.6 = Très bonne (0.8)
    // > 0.4 = Bonne (0.6)
    // > 0.3 = Moyenne (0.4)
    // < 0.3 = Floue (0.2)

    let normalizedSharpness = 0;
    if (sharpnessScore > 0.8) {
      normalizedSharpness = 1.0;
    } else if (sharpnessScore > 0.6) {
      normalizedSharpness = 0.8;
    } else if (sharpnessScore > 0.4) {
      normalizedSharpness = 0.6;
    } else if (sharpnessScore > 0.3) {
      normalizedSharpness = 0.4;
    } else {
      normalizedSharpness = 0.2;
    }

    score += normalizedSharpness * criteria.sharpnessWeight;
    totalWeight += criteria.sharpnessWeight;
  }

  // 2. Composition (rule-of-thirds / symmetry / leading-lines, 0-1)
  const compositionScore = analysis.compositionScore ?? 0.7;
  score += compositionScore * criteria.compositionWeight;
  totalWeight += criteria.compositionWeight;

  // 3. Yeux ouverts (bonus pour portraits)
  if (analysis.hasOpenEyes !== undefined) {
    const eyesScore = analysis.hasOpenEyes ? 1.0 : 0.3;
    score += eyesScore * criteria.eyesWeight;
    totalWeight += criteria.eyesWeight;
  }

  // 4. Besoin de retouche (moins de retouche = meilleure photo)
  if (analysis.suggestedRetouch) {
    const { brightness, contrast, saturation } = analysis.suggestedRetouch;

    // Calculer l'écart par rapport à l'idéal (1.0)
    const brightnessDeviation = Math.abs(brightness - 1.0);
    const contrastDeviation = Math.abs(contrast - 1.0);
    const saturationDeviation = Math.abs(saturation - 1.0);

    // Moyenne des écarts (0 = parfait, 0.3+ = beaucoup de retouche)
    const averageDeviation =
      (brightnessDeviation + contrastDeviation + saturationDeviation) / 3;

    // Inverser: moins de retouche = meilleur score
    const retouchScore = Math.max(0, 1 - averageDeviation * 3);

    score += retouchScore * criteria.retouchWeight;
    totalWeight += criteria.retouchWeight;
  }

  // Normaliser le score (0-1)
  const normalizedScore = totalWeight > 0 ? score / totalWeight : 0;

  // Convertir en étoiles (0-5)
  // 0.9-1.0  = 5 étoiles (Excellente)
  // 0.75-0.9 = 4 étoiles (Très bonne)
  // 0.6-0.75 = 3 étoiles (Bonne)
  // 0.4-0.6  = 2 étoiles (Moyenne)
  // 0.2-0.4  = 1 étoile (Faible)
  // < 0.2    = 0 étoile (À rejeter)

  if (normalizedScore >= 0.9) return 5;
  if (normalizedScore >= 0.75) return 4;
  if (normalizedScore >= 0.6) return 3;
  if (normalizedScore >= 0.4) return 2;
  if (normalizedScore >= 0.2) return 1;
  return 0;
}

/**
 * Calcule les notes automatiques pour un lot de photos
 */
export function calculateAutoRatings(
  photos: Photo[],
  criteria: RatingCriteria = DEFAULT_CRITERIA
): Map<string, number> {
  const ratings = new Map<string, number>();

  photos.forEach((photo) => {
    const rating = calculateAutoRating(photo, criteria);
    ratings.set(photo.id, rating);
  });

  return ratings;
}

/**
 * Analyse la distribution des notes pour ajustement
 */
export function analyzeRatingDistribution(ratings: number[]): {
  average: number;
  median: number;
  distribution: Record<number, number>;
} {
  const distribution: Record<number, number> = {
    0: 0,
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };

  ratings.forEach((rating) => {
    distribution[rating] = (distribution[rating] || 0) + 1;
  });

  const average = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  const sorted = [...ratings].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  return { average, median, distribution };
}

/**
 * Ajuste les notes pour avoir une distribution plus équilibrée
 * Utile si trop de photos ont la même note
 */
export function adjustRatingDistribution(
  photos: Photo[],
  targetDistribution?: Partial<Record<number, number>>
): Map<string, number> {
  const ratings = calculateAutoRatings(photos);

  // Si pas de distribution cible, retourner les notes brutes
  if (!targetDistribution) {
    return ratings;
  }

  // Trier les photos par score décroissant
  const sortedPhotos = [...photos].sort((a, b) => {
    const scoreA = calculatePhotoScore(a);
    const scoreB = calculatePhotoScore(b);
    return scoreB - scoreA;
  });

  // Distribuer les notes selon la cible
  const adjustedRatings = new Map<string, number>();
  let index = 0;

  // Distribuer 5 étoiles
  const fiveStarsCount =
    targetDistribution[5] || Math.ceil(photos.length * 0.1); // 10%
  for (let i = 0; i < Math.min(fiveStarsCount, sortedPhotos.length); i++) {
    adjustedRatings.set(sortedPhotos[index++].id, 5);
  }

  // Distribuer 4 étoiles
  const fourStarsCount =
    targetDistribution[4] || Math.ceil(photos.length * 0.2); // 20%
  for (
    let i = 0;
    i < Math.min(fourStarsCount, sortedPhotos.length - index);
    i++
  ) {
    adjustedRatings.set(sortedPhotos[index++].id, 4);
  }

  // Distribuer 3 étoiles
  const threeStarsCount =
    targetDistribution[3] || Math.ceil(photos.length * 0.3); // 30%
  for (
    let i = 0;
    i < Math.min(threeStarsCount, sortedPhotos.length - index);
    i++
  ) {
    adjustedRatings.set(sortedPhotos[index++].id, 3);
  }

  // Distribuer 2 étoiles
  const twoStarsCount = targetDistribution[2] || Math.ceil(photos.length * 0.2); // 20%
  for (
    let i = 0;
    i < Math.min(twoStarsCount, sortedPhotos.length - index);
    i++
  ) {
    adjustedRatings.set(sortedPhotos[index++].id, 2);
  }

  // Reste = 1 étoile ou 0
  while (index < sortedPhotos.length) {
    const photo = sortedPhotos[index];
    const rating = photo.analysis?.isBlurry ? 0 : 1;
    adjustedRatings.set(photo.id, rating);
    index++;
  }

  return adjustedRatings;
}

/**
 * Calcule un score global pour une photo (0-1)
 */
function calculatePhotoScore(photo: Photo): number {
  const analysis = photo.analysis;
  if (!analysis || analysis.error) return 0;

  let score = 0;
  let count = 0;

  if (analysis.sharpnessScore !== undefined) {
    score += analysis.sharpnessScore;
    count++;
  }

  if (analysis.hasOpenEyes !== undefined) {
    score += analysis.hasOpenEyes ? 1 : 0.3;
    count++;
  }

  if (analysis.suggestedRetouch) {
    const { brightness, contrast, saturation } = analysis.suggestedRetouch;
    const deviation =
      (Math.abs(brightness - 1) +
        Math.abs(contrast - 1) +
        Math.abs(saturation - 1)) /
      3;
    score += Math.max(0, 1 - deviation * 2);
    count++;
  }

  return count > 0 ? score / count : 0;
}

/**
 * Suggestions de notation automatique
 */
export const AUTO_RATING_PRESETS = {
  strict: {
    name: 'Strict',
    description: 'Seules les meilleures photos obtiennent 5 étoiles',
    distribution: { 5: 0.05, 4: 0.15, 3: 0.3, 2: 0.3, 1: 0.2 },
  },
  balanced: {
    name: 'Équilibré',
    description: 'Distribution équilibrée des notes',
    distribution: { 5: 0.1, 4: 0.2, 3: 0.3, 2: 0.2, 1: 0.2 },
  },
  generous: {
    name: 'Généreux',
    description: 'Plus de photos avec notes élevées',
    distribution: { 5: 0.15, 4: 0.25, 3: 0.3, 2: 0.2, 1: 0.1 },
  },
  quality: {
    name: 'Qualité pure',
    description: 'Basé uniquement sur la netteté',
    distribution: null, // Utilise algorithme brut
  },
};
