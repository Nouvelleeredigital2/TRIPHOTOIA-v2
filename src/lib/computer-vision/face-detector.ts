/**
 * Adaptateur MediaPipe FaceLandmarker (chargement paresseux, exécution worker).
 *
 * Sépare l'inférence du modèle (ce fichier, dépend de @mediapipe/tasks-vision et
 * d'un contexte navigateur/worker) du calcul EAR pur (`face-landmarks.ts`,
 * testable). En cas d'indisponibilité (WASM/GPU absent, échec de chargement),
 * on renvoie `null` : l'appelant NE retombe PAS sur l'ancienne heuristique
 * trompeuse — il laisse simplement `hasOpenEyes` indéfini.
 *
 * Le modèle et les binaires WASM sont chargés depuis `MODEL_BASE` (surcharge-able
 * pour héberger les assets en local plutôt que via CDN).
 */

import {
  aggregateFaces,
  computeEyeOpenness,
  type Landmark,
} from './face-landmarks';

export interface FaceEyeResult {
  faceCount: number;
  eyeOpenness: number;
  hasOpenEyes: boolean;
  confidence: number;
}

// Assets servis EN LOCAL par défaut (copiés sous public/mediapipe par
// `pnpm assets:mediapipe`, lancé en predev/prebuild). Aucune dépendance CDN à
// l'exécution → « 100% navigateur » et pas de cold-start réseau. Surcharge
// possible via les variables Vite (p. ex. pour pointer un CDN en secours).
const WASM_BASE =
  (typeof import.meta !== 'undefined' &&
    (import.meta as { env?: Record<string, string> }).env
      ?.VITE_MEDIAPIPE_WASM_BASE) ||
  '/mediapipe/wasm';

const MODEL_URL =
  (typeof import.meta !== 'undefined' &&
    (import.meta as { env?: Record<string, string> }).env
      ?.VITE_FACE_LANDMARKER_MODEL) ||
  '/mediapipe/models/face_landmarker.task';

const MAX_FACES = 10;

// Type minimal du landmarker (évite d'élargir la surface de types importée).
interface FaceLandmarkerLike {
  detect(image: ImageBitmap): { faceLandmarks?: Landmark[][] };
  close?: () => void;
}

let _landmarkerPromise: Promise<FaceLandmarkerLike | null> | null = null;

/**
 * Initialise (une seule fois) le FaceLandmarker. Toute erreur est capturée et
 * mémoïsée en `null` : on n'essaie pas en boucle, et l'analyse continue sans
 * détection de visage plutôt que d'échouer ou de mentir.
 */
async function getLandmarker(): Promise<FaceLandmarkerLike | null> {
  if (_landmarkerPromise) return _landmarkerPromise;

  _landmarkerPromise = (async () => {
    try {
      const vision = await import('@mediapipe/tasks-vision');
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
      const landmarker = await vision.FaceLandmarker.createFromOptions(
        fileset,
        {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'IMAGE',
          numFaces: MAX_FACES,
        }
      );
      return landmarker as unknown as FaceLandmarkerLike;
    } catch (error) {
      console.warn(
        '[face-detector] modèle indisponible, détection des yeux désactivée:',
        error
      );
      return null;
    }
  })();

  return _landmarkerPromise;
}

/**
 * Détecte les visages et calcule l'ouverture des yeux sur un ImageBitmap.
 * Retourne `null` si le modèle est indisponible ou si aucun visage exploitable
 * n'est trouvé (aucune valeur fabriquée).
 */
export async function detectFaceEyes(
  bitmap: ImageBitmap
): Promise<FaceEyeResult | null> {
  const landmarker = await getLandmarker();
  if (!landmarker) return null;

  let detection: { faceLandmarks?: Landmark[][] };
  try {
    detection = landmarker.detect(bitmap);
  } catch (error) {
    console.warn('[face-detector] échec de détection:', error);
    return null;
  }

  const faces = detection.faceLandmarks ?? [];
  if (faces.length === 0) {
    // Modèle disponible mais aucun visage : résultat exploitable (faceCount 0).
    return { faceCount: 0, eyeOpenness: 0, hasOpenEyes: false, confidence: 1 };
  }

  const perFace = faces
    .map((lm) => computeEyeOpenness(lm, 1))
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return aggregateFaces(perFace);
}

/** Réinitialise l'état mémoïsé (tests). */
export function _resetFaceDetectorForTests(): void {
  _landmarkerPromise = null;
}
