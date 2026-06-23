import { describe, it, expect } from 'vitest';
import {
  aggregateFaces,
  computeEyeOpenness,
  eyeAspectRatio,
  EAR_OPEN_THRESHOLD,
  LEFT_EYE_EAR_INDICES,
  RIGHT_EYE_EAR_INDICES,
  type Landmark,
} from '../../lib/computer-vision/face-landmarks';

// Construit une géométrie d'œil 6 points avec une ouverture verticale donnée.
// horizontal = 0.1 (p1..p4) ; vertical contrôlé par `openHeight`.
const eyePoints = (openHeight: number): Landmark[] => [
  { x: 0.0, y: 0.0 }, // p1 coin externe
  { x: 0.03, y: -openHeight / 2 }, // p2 haut
  { x: 0.07, y: -openHeight / 2 }, // p3 haut
  { x: 0.1, y: 0.0 }, // p4 coin interne
  { x: 0.07, y: openHeight / 2 }, // p5 bas
  { x: 0.03, y: openHeight / 2 }, // p6 bas
];

// Place les 6 points d'un œil aux bons indices dans un tableau de landmarks.
const placeEye = (
  arr: Landmark[],
  indices: readonly number[],
  pts: Landmark[]
) => {
  indices.forEach((idx, k) => {
    arr[idx] = pts[k];
  });
};

const faceLandmarks = (leftHeight: number, rightHeight: number): Landmark[] => {
  const arr: Landmark[] = new Array(478)
    .fill(null)
    .map(() => ({ x: 0.5, y: 0.5 }));
  placeEye(arr, LEFT_EYE_EAR_INDICES, eyePoints(leftHeight));
  placeEye(arr, RIGHT_EYE_EAR_INDICES, eyePoints(rightHeight));
  return arr;
};

describe('eyeAspectRatio', () => {
  it('augmente avec l’ouverture verticale', () => {
    const open = eyeAspectRatio(eyePoints(0.06))!;
    const closed = eyeAspectRatio(eyePoints(0.01))!;
    expect(open).toBeGreaterThan(closed);
  });

  it('retourne null sur une géométrie dégénérée (largeur nulle)', () => {
    const degenerate: Landmark[] = new Array(6)
      .fill(null)
      .map(() => ({ x: 0.5, y: 0.5 }));
    expect(eyeAspectRatio(degenerate)).toBeNull();
  });

  it('retourne null si le nombre de points est incorrect', () => {
    expect(eyeAspectRatio([{ x: 0, y: 0 }])).toBeNull();
  });
});

describe('computeEyeOpenness', () => {
  it('détecte des yeux ouverts (EAR ≥ seuil) avec une bonne ouverture', () => {
    const res = computeEyeOpenness(faceLandmarks(0.06, 0.06), 0.95)!;
    expect(res).not.toBeNull();
    expect(res.ear).toBeGreaterThanOrEqual(EAR_OPEN_THRESHOLD);
    expect(res.hasOpenEyes).toBe(true);
    expect(res.eyeOpenness).toBeGreaterThan(0.5);
    expect(res.confidence).toBeGreaterThan(0);
    expect(res.confidence).toBeLessThanOrEqual(1);
  });

  it('détecte des yeux fermés (EAR < seuil) avec une faible ouverture', () => {
    const res = computeEyeOpenness(faceLandmarks(0.005, 0.005), 0.95)!;
    expect(res.hasOpenEyes).toBe(false);
    expect(res.eyeOpenness).toBeLessThan(0.5);
  });

  it('ne fabrique aucune valeur si les landmarks des yeux manquent', () => {
    const empty: Landmark[] = new Array(478)
      .fill(null)
      .map(() => ({ x: 0.5, y: 0.5 }));
    // on retire les points d’yeux
    [...LEFT_EYE_EAR_INDICES, ...RIGHT_EYE_EAR_INDICES].forEach((i) => {
      // @ts-expect-error simulate missing landmark
      empty[i] = undefined;
    });
    expect(computeEyeOpenness(empty)).toBeNull();
  });

  it('la confiance dépend du score de détection', () => {
    const high = computeEyeOpenness(faceLandmarks(0.06, 0.06), 1)!;
    const low = computeEyeOpenness(faceLandmarks(0.06, 0.06), 0.3)!;
    expect(high.confidence).toBeGreaterThan(low.confidence);
  });

  it('est déterministe (mêmes landmarks → même résultat)', () => {
    const a = computeEyeOpenness(faceLandmarks(0.05, 0.05), 0.8)!;
    const b = computeEyeOpenness(faceLandmarks(0.05, 0.05), 0.8)!;
    expect(a).toEqual(b);
  });
});

describe('aggregateFaces', () => {
  it('un groupe a les yeux ouverts seulement si TOUS les visages les ont', () => {
    const open = computeEyeOpenness(faceLandmarks(0.06, 0.06), 0.9)!;
    const closed = computeEyeOpenness(faceLandmarks(0.005, 0.005), 0.9)!;

    expect(aggregateFaces([open, open])!.hasOpenEyes).toBe(true);
    expect(aggregateFaces([open, closed])!.hasOpenEyes).toBe(false);
    expect(aggregateFaces([open, open])!.faceCount).toBe(2);
  });

  it('retourne null sans visage', () => {
    expect(aggregateFaces([])).toBeNull();
  });

  it('prend la confiance la plus basse du groupe', () => {
    const a = {
      ear: 0.3,
      eyeOpenness: 0.9,
      hasOpenEyes: true,
      confidence: 0.9,
    };
    const b = {
      ear: 0.3,
      eyeOpenness: 0.9,
      hasOpenEyes: true,
      confidence: 0.4,
    };
    expect(aggregateFaces([a, b])!.confidence).toBe(0.4);
  });
});
