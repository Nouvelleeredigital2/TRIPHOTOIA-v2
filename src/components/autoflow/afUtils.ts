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
  sharp: number;  // 0-100 sharpness sub-score for dup compare
  expo: number;   // 0-100 exposure sub-score
  comp: number;   // 0-100 composition sub-score
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
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
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

/** Classify a photo into keep / review / reject */
export function classifyPhoto(photo: Photo, isDup: boolean, score: number): AfClass {
  if (photo.analysis?.isRejected) return 'reject';
  if (photo.analysis?.isBlurry || score < 50) return 'reject';
  if (isDup) return 'reject';
  if (photo.analysis?.isPick || score >= 82) return 'keep';
  return 'review';
}

/** Convert store Photo[] + DuplicateGroup[] to AfPhoto[] */
export function toAfPhotos(photos: Photo[], duplicateGroups: DuplicateGroup[]): AfPhoto[] {
  const dupMap = new Map<string, string>(); // photoId -> groupId
  duplicateGroups.forEach((g) => {
    g.photos.forEach((p) => dupMap.set(p.id, g.id));
  });

  const suggestions = [
    'Bonne lumiere naturelle. Essayez un recadrage pour ameliorer la composition.',
    'Netteté excellente. Léger ajustement des ombres recommandé.',
    'Exposition correcte. Le sujet est bien isolé du fond.',
    'Composition equilibree. Augmentez légèrement le contraste.',
    'Belle profondeur de champ. Retouchez les hautes lumières.',
    'Image nette. Jouez sur la saturation pour plus de vibrance.',
    'Photo réussie. Peu de corrections nécessaires.',
    'Bon cadrage. Ajustez les tons clairs pour plus de détail.',
  ];

  return photos.map((p) => {
    const score = deriveScore(p);
    const isDup = dupMap.has(p.id);
    const cls = classifyPhoto(p, isDup, score);
    const a = p.analysis;

    const sharp = Math.round((a?.sharpnessScore ?? 0.5) * 100);
    const comp = Math.round((a?.compositionScore ?? 0.5) * 100);
    // Derive expo from suggestedRetouch brightness deviation (lower deviation = better)
    const brightnessDev = a?.suggestedRetouch
      ? Math.abs(a.suggestedRetouch.brightness - 1)
      : 0.1;
    const expo = Math.round(Math.max(0, Math.min(100, (1 - brightnessDev * 2) * 100)));

    let idx = 0;
    for (let i = 0; i < p.id.length; i++) idx = (idx + p.id.charCodeAt(i)) % suggestions.length;

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
      suggestion: suggestions[idx],
    };
  });
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
