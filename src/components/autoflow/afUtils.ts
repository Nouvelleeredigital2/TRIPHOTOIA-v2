/**
 * AutoFlow v2 — Utility types and photo adapter
 * Bridges existing Photo store data to the AutoFlow classification model.
 */

import { Photo, DuplicateGroup } from '../../types/index';

export type AfClass = 'keep' | 'review' | 'reject';

/** Lightweight view-model used by all AutoFlow components */
export interface AfPhoto {
  id: string;
  name: string;
  previewUrl?: string;
  /** Gradient colors for placeholder when no previewUrl */
  gradient: [string, string];
  /** 0-100 quality score */
  score: number;
  /** AI classification */
  cls: AfClass;
  isDup: boolean;
  dupGroup?: string;
  isBlurry: boolean;
  isPick: boolean;
  isRejected: boolean;
  isFavorite: boolean;
  rating: number;
  dims?: string;
  iso?: string;
  date?: string;
  sharp: number; // 0-100 sharpness sub-score for dup compare
  expo: number; // 0-100 exposure sub-score
  comp: number; // 0-100 composition sub-score
  suggestion?: string;
}

/** Deterministic gradient per photo id */
function photoGradient(id: string): [string, string] {
  const palettes: [string, string][] = [
    ['#0f2027', '#203a43'],
    ['#1a1a2e', '#16213e'],
    ['#0d1b2a', '#1b263b'],
    ['#1b1b2f', '#162447'],
    ['#0a0a23', '#1c1c3c'],
    ['#141414', '#292929'],
    ['#0f0c29', '#302b63'],
    ['#1c0522', '#3d0b4a'],
    ['#001f3f', '#003366'],
    ['#1a0533', '#2e0854'],
  ];
  let h = 0;
  for (let i = 0; i < id.length; i++)
    h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
  return palettes[Math.abs(h) % palettes.length];
}

/** Derive a 0-100 score from existing PhotoAnalysis */
export function deriveScore(photo: Photo): number {
  const a = photo.analysis;
  if (!a) return 50;

  let score = 50;

  if (a.sharpnessScore !== undefined) {
    score += a.sharpnessScore * 30;
  }
  if (a.compositionScore !== undefined) {
    score += a.compositionScore * 20;
  }
  if (a.rating !== undefined && a.rating > 0) {
    score += (a.rating / 5) * 15;
  }
  if (a.hasOpenEyes !== undefined) {
    score += (a.hasOpenEyes ? 1 : 0.2) * 10;
  }

  // Penalise blur
  if (a.isBlurry) score -= 20;

  return Math.min(100, Math.max(0, Math.round(score)));
}

/** Classify a photo into keep / review / reject.
 *
 * P0-3 : appartenir à un groupe de doublons ne suffit JAMAIS à rejeter
 * automatiquement. Le meilleur représentant du groupe (`isGroupBest`) est au
 * minimum conservé en revue ; les autres membres deviennent des candidats à
 * revue, pas des rejets définitifs. Chaque groupe garde donc ≥ 1 photo non
 * rejetée. Les décisions manuelles de l'utilisateur priment toujours. */
export function classifyPhoto(
  photo: Photo,
  score: number,
  opts: { isDuplicate?: boolean; isGroupBest?: boolean } = {}
): AfClass {
  const { isDuplicate = false, isGroupBest = false } = opts;

  // Décisions manuelles : toujours respectées.
  if (photo.analysis?.isRejected) return 'reject';
  if (photo.analysis?.isPick) return 'keep';

  // Doublon non-meilleur : candidat à revue (jamais rejet auto).
  if (isDuplicate && !isGroupBest) return 'review';

  // Raisons de rejet réelles (flou, score faible) — mais on préserve toujours
  // le meilleur représentant d'un groupe en le laissant en revue.
  if (photo.analysis?.isBlurry || score < 50) {
    return isGroupBest ? 'review' : 'reject';
  }

  if (score >= 82) return 'keep';
  return 'review';
}

/** Convert store Photo[] + DuplicateGroup[] to AfPhoto[] */
export function toAfPhotos(
  photos: Photo[],
  duplicateGroups: DuplicateGroup[]
): AfPhoto[] {
  const dupMap = new Map<string, string>(); // photoId -> groupId
  const groupBest = new Set<string>(); // meilleur représentant par groupe
  duplicateGroups.forEach((g) => {
    g.photos.forEach((p) => dupMap.set(p.id, g.id));
    if (g.bestPhotoId) groupBest.add(g.bestPhotoId);
  });

  return photos.map((p) => {
    const score = deriveScore(p);
    const isDup = dupMap.has(p.id);
    const cls = classifyPhoto(p, score, {
      isDuplicate: isDup,
      isGroupBest: groupBest.has(p.id),
    });
    const a = p.analysis;

    const sharp = Math.round((a?.sharpnessScore ?? 0.5) * 100);
    const comp = Math.round((a?.compositionScore ?? 0.5) * 100);
    // Derive expo from suggestedRetouch brightness deviation (lower deviation = better)
    const brightnessDev = a?.suggestedRetouch
      ? Math.abs(a.suggestedRetouch.brightness - 1)
      : 0.1;
    const expo = Math.round(
      Math.max(0, Math.min(100, (1 - brightnessDev * 2) * 100))
    );

    return {
      id: p.id,
      name: p.file?.name ?? 'photo.jpg',
      previewUrl: p.previewUrl ?? undefined,
      gradient: photoGradient(p.id),
      score,
      cls,
      isDup,
      dupGroup: dupMap.get(p.id),
      isBlurry: a?.isBlurry ?? false,
      isPick: a?.isPick ?? false,
      isRejected: a?.isRejected ?? false,
      isFavorite: Boolean(a?.isPick && (a?.rating ?? 0) >= 5),
      rating: a?.rating ?? 0,
      dims: undefined,
      iso: undefined,
      date: undefined,
      sharp,
      expo,
      comp,
      suggestion: buildSuggestion(p),
    };
  });
}

/**
 * Construit une explication AutoFlow À PARTIR DES MÉTRIQUES réelles (P0-4).
 * Renvoie undefined si aucune métrique exploitable n'est disponible — on
 * n'affiche jamais une phrase fabriquée à partir de l'identifiant du fichier.
 */
export function buildSuggestion(photo: Photo): string | undefined {
  const a = photo.analysis;
  if (!a || a.error) return undefined;

  const parts: string[] = [];

  if (a.isBlurry) {
    parts.push('Image potentiellement floue.');
  } else if (typeof a.sharpnessScore === 'number') {
    parts.push(a.sharpnessScore >= 0.7 ? 'Bonne netteté.' : 'Netteté moyenne.');
  }

  if (typeof a.compositionScore === 'number') {
    parts.push(
      a.compositionScore >= 0.7
        ? 'Composition équilibrée.'
        : 'Composition à retravailler.'
    );
  }

  if (a.suggestedRetouch) {
    const dev = Math.abs(a.suggestedRetouch.brightness - 1);
    if (dev > 0.15) parts.push('Exposition à ajuster.');
  }

  return parts.length > 0 ? parts.join(' ') : undefined;
}

/**
 * Minimal photoStore surface needed to commit an AutoFlow decision locally.
 * Exposed as `getState()` (not a captured snapshot) so each read sees fresh
 * state: `togglePhotoPick`/`togglePhotoReject` have interdependent side effects
 * (picking clears rejected and vice-versa), so the idempotency checks MUST read
 * the post-mutation state between steps. Decoupled from the store module to stay
 * unit-testable — pass the zustand store (which already has `getState`).
 */
export interface AutoFlowStoreState {
  photos: Photo[];
  togglePhotoPick: (photoId: string) => void;
  togglePhotoReject: (photoId: string) => void;
  setPhotoRating: (photoId: string, rating: number) => void;
}

export interface AutoFlowStoreBridge {
  getState: () => AutoFlowStoreState;
}

/**
 * Applies an AutoFlow mutation (AfPhoto changes) back onto the local photo store.
 * This is the local-mode persistence path: every swipe/gallery/dup decision flows
 * through here so that `analysis.isPick/isRejected/rating` reflect the decision
 * even when no cloud project is active. Each idempotency check re-reads fresh
 * state via `getState()`, so applying e.g. a pick/favorite to a currently-rejected
 * photo works (the first toggle's side effect is observed by the second check).
 */
export function applyAutoFlowMutation(
  id: string,
  changes: Partial<AfPhoto>,
  store: AutoFlowStoreBridge,
): void {
  const currentPhoto = () => store.getState().photos.find((p) => p.id === id);
  if (!currentPhoto()) return;
  const { togglePhotoPick, togglePhotoReject, setPhotoRating } = store.getState();
  if ('isPick' in changes) {
    const wantPick = !!changes.isPick;
    if (wantPick !== !!currentPhoto()?.analysis?.isPick) togglePhotoPick(id);
  }
  if ('isRejected' in changes) {
    const wantRej = !!changes.isRejected;
    if (wantRej !== !!currentPhoto()?.analysis?.isRejected) togglePhotoReject(id);
  }
  if ('rating' in changes && typeof changes.rating === 'number') {
    setPhotoRating(id, changes.rating);
  }
}
