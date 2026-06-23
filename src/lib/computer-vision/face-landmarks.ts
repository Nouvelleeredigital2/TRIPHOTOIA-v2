/**
 * Eye Aspect Ratio (EAR) à partir de landmarks faciaux MediaPipe FaceLandmarker.
 *
 * Remplace l'ancienne « détection des yeux » heuristique (ratio de pixels sombres
 * dans une bande centrale) par une mesure géométrique réelle calculée sur les
 * landmarks du visage. L'EAR (Soukupová & Čech, 2016) est le rapport entre les
 * distances verticales et horizontales de l'œil : élevé = ouvert, bas = fermé.
 *
 * Ce module est PUR (aucune dépendance au modèle ni au DOM) : il prend des
 * landmarks normalisés et renvoie une mesure. Le chargement/inférence du modèle
 * MediaPipe est fait ailleurs (dans le Web Worker) et alimente ces fonctions.
 *
 * Honnêteté : les seuils EAR (ouvert/fermé) sont des valeurs standard de la
 * littérature, PAS calibrées sur un corpus TreePhoto annoté. La `confidence`
 * renvoyée combine le score de détection du visage et l'écart au seuil — elle
 * est mesurée, pas inventée. Tant qu'aucun corpus n'est annoté, considérer ces
 * valeurs comme « bonne estimation géométrique », au-dessus de l'heuristique
 * pixel mais en-dessous d'un modèle dédié calibré.
 */

/** Point de landmark normalisé (0-1) renvoyé par MediaPipe FaceLandmarker. */
export interface Landmark {
  x: number;
  y: number;
  z?: number;
}

/**
 * Indices des 6 points EAR par œil dans le maillage MediaPipe FaceMesh (468/478).
 * Ordre : [coin externe, haut1, haut2, coin interne, bas1, bas2]
 * (p1, p2, p3, p4, p5, p6) de la formule EAR.
 */
export const LEFT_EYE_EAR_INDICES = [33, 160, 158, 133, 153, 144] as const;
export const RIGHT_EYE_EAR_INDICES = [362, 385, 387, 263, 373, 380] as const;

/** Seuils EAR standard (non calibrés corpus). */
export const EAR_CLOSED = 0.1;
export const EAR_OPEN = 0.3;
/** En-dessous de ce seuil, l'œil est considéré fermé. */
export const EAR_OPEN_THRESHOLD = 0.2;

const dist = (a: Landmark, b: Landmark): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/**
 * EAR d'un œil à partir de ses 6 points (p1..p6).
 * EAR = (|p2-p6| + |p3-p5|) / (2 · |p1-p4|).
 * Retourne `null` si la géométrie est dégénérée (largeur nulle).
 */
export function eyeAspectRatio(points: Landmark[]): number | null {
  if (points.length !== 6) return null;
  const [p1, p2, p3, p4, p5, p6] = points;
  const horizontal = dist(p1, p4);
  if (horizontal <= 1e-6) return null;
  const vertical = dist(p2, p6) + dist(p3, p5);
  const ear = vertical / (2 * horizontal);
  return Number.isFinite(ear) ? ear : null;
}

/** Récupère les 6 points EAR d'un œil depuis le tableau de landmarks complet. */
function pickEye(
  landmarks: Landmark[],
  indices: readonly number[]
): Landmark[] | null {
  const pts: Landmark[] = [];
  for (const i of indices) {
    const p = landmarks[i];
    if (!p) return null;
    pts.push(p);
  }
  return pts;
}

export interface EyeOpennessResult {
  /** EAR moyen des deux yeux (ou de l'œil disponible). */
  ear: number;
  /** Ouverture normalisée 0-1 (EAR mappé entre fermé et ouvert). */
  eyeOpenness: number;
  /** true si les yeux sont estimés ouverts (EAR ≥ seuil). */
  hasOpenEyes: boolean;
  /** Confiance 0-1 : combine le score de détection et l'écart au seuil. */
  confidence: number;
}

/**
 * Calcule l'ouverture des yeux d'un visage à partir de ses landmarks.
 * `detectionScore` (0-1) est le score de présence du visage renvoyé par le
 * détecteur ; il pondère la confiance finale. Retourne `null` si les landmarks
 * des yeux sont indisponibles (on ne fabrique alors aucune valeur).
 */
export function computeEyeOpenness(
  landmarks: Landmark[],
  detectionScore = 1
): EyeOpennessResult | null {
  const left = pickEye(landmarks, LEFT_EYE_EAR_INDICES);
  const right = pickEye(landmarks, RIGHT_EYE_EAR_INDICES);

  const earLeft = left ? eyeAspectRatio(left) : null;
  const earRight = right ? eyeAspectRatio(right) : null;

  const ears = [earLeft, earRight].filter((e): e is number => e !== null);
  if (ears.length === 0) return null;

  const ear = ears.reduce((a, b) => a + b, 0) / ears.length;
  const eyeOpenness = clamp01((ear - EAR_CLOSED) / (EAR_OPEN - EAR_CLOSED));
  const hasOpenEyes = ear >= EAR_OPEN_THRESHOLD;

  // Confiance : score de détection × netteté de la décision (distance au seuil,
  // normalisée par la demi-plage utile). Plus on est loin du seuil, plus c'est sûr.
  const margin = Math.abs(ear - EAR_OPEN_THRESHOLD);
  const decisiveness = clamp01(margin / ((EAR_OPEN - EAR_CLOSED) / 2));
  const confidence = clamp01(detectionScore) * decisiveness;

  return { ear, eyeOpenness, hasOpenEyes, confidence };
}

/**
 * Agrège plusieurs visages : un cliché de groupe a « les yeux ouverts » seulement
 * si TOUS les visages détectés ont les yeux ouverts. La confiance est la plus
 * basse (le visage le plus incertain conditionne le résultat). Retourne `null`
 * si aucun visage exploitable.
 */
export function aggregateFaces(faces: EyeOpennessResult[]): {
  faceCount: number;
  eyeOpenness: number;
  hasOpenEyes: boolean;
  confidence: number;
} | null {
  if (faces.length === 0) return null;
  const hasOpenEyes = faces.every((f) => f.hasOpenEyes);
  const eyeOpenness =
    faces.reduce((a, f) => a + f.eyeOpenness, 0) / faces.length;
  const confidence = Math.min(...faces.map((f) => f.confidence));
  return { faceCount: faces.length, eyeOpenness, hasOpenEyes, confidence };
}
