/** Labels couleur style Lightroom : rouge, jaune, vert, bleu, violet */
export type ColorLabel = 'red' | 'yellow' | 'green' | 'blue' | 'purple';

export const COLOR_LABEL_META: Record<
  ColorLabel,
  { label: string; bg: string; ring: string; dot: string }
> = {
  red: {
    label: 'Rouge',
    bg: 'bg-red-500',
    ring: 'ring-red-500',
    dot: '#ef4444',
  },
  yellow: {
    label: 'Jaune',
    bg: 'bg-yellow-400',
    ring: 'ring-yellow-400',
    dot: '#facc15',
  },
  green: {
    label: 'Vert',
    bg: 'bg-green-500',
    ring: 'ring-green-500',
    dot: '#22c55e',
  },
  blue: {
    label: 'Bleu',
    bg: 'bg-blue-500',
    ring: 'ring-blue-500',
    dot: '#3b82f6',
  },
  purple: {
    label: 'Violet',
    bg: 'bg-purple-500',
    ring: 'ring-purple-500',
    dot: '#a855f7',
  },
};

export const COLOR_LABEL_KEYS = Object.keys(COLOR_LABEL_META) as ColorLabel[];

/**
 * P0-B : mode d'analyse réellement utilisé pour produire un résultat.
 * - `local-pixel` : analyse réelle des pixels (Canvas / Web Worker).
 * - `cloud-model` : modèle distant authentifié (non disponible actuellement).
 * - `heuristic`  : heuristique pixel non calibrée (ex. tags dérivés de mesures).
 * - `demo`       : démonstration — INTERDIT en build production.
 */
export type AnalysisMode = 'local-pixel' | 'cloud-model' | 'heuristic' | 'demo';

/**
 * P0-B : provenance obligatoire d'un résultat d'analyse. Permet de distinguer
 * un résultat réel d'un repli, et interdit qu'une valeur fabriquée passe pour
 * une analyse. `confidence` vaut `null` quand aucune confiance calibrée n'est
 * disponible (jamais inventée).
 */
export interface AnalysisProvenance {
  engine: string;
  model: string;
  modelVersion: string;
  analysisMode: AnalysisMode;
  confidence: number | null;
  isFallback: boolean;
  computedAt: string; // ISO 8601
}

export interface PhotoAnalysis {
  isBlurry?: boolean;
  sharpnessScore?: number;
  hasOpenEyes?: boolean;
  tags?: string[];
  perceptualHash?: string;
  fileHash?: string; // SHA-256 hash for exact duplicate detection
  compositionScore?: number; // 0-1, overall rule-of-thirds / symmetry / leading-lines score
  suggestedRetouch?: {
    brightness: number;
    contrast: number;
    saturation: number;
  };
  provenance?: AnalysisProvenance; // P0-B : traçabilité du résultat
  rating?: number; // 0-5 stars (0 = no rating)
  isPick?: boolean; // Lightroom-style "Pick" flag
  isRejected?: boolean; // Lightroom-style "Reject" flag (X)
  colorLabel?: ColorLabel | null;
  error?: string;
}

export interface RetouchOptions {
  temperature: number;
  tint: number;
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  clarity: number;
  texture: number;
  dehaze: number;
  vibrance: number;
  saturation: number;
  midtoneContrast: number;
  sharpness: number;
}

export interface AutoRetouchPreset {
  options: Partial<RetouchOptions>;
  confidence: number;
}

export interface PhotoRetouchState {
  history: RetouchOptions[];
  currentOptions: RetouchOptions;
  originalPreviewUrl?: string;
  previewUrl?: string;
  lastUpdated?: string;
  lastAutoPreset?: Partial<RetouchOptions>;
  autoPresetConfidence?: number;
}

export const RETOUCH_OPTION_KEYS = [
  'temperature',
  'tint',
  'exposure',
  'contrast',
  'highlights',
  'shadows',
  'whites',
  'blacks',
  'clarity',
  'texture',
  'dehaze',
  'vibrance',
  'saturation',
  'midtoneContrast',
  'sharpness',
] as const;

export type RetouchOptionKey = (typeof RETOUCH_OPTION_KEYS)[number];

export const DEFAULT_RETOUCH_OPTIONS: RetouchOptions = {
  temperature: 0,
  tint: 0,
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  clarity: 0,
  texture: 0,
  dehaze: 0,
  vibrance: 0,
  saturation: 0,
  midtoneContrast: 0,
  sharpness: 0,
};

export const createDefaultRetouchOptions = (): RetouchOptions => ({
  ...DEFAULT_RETOUCH_OPTIONS,
});

// ── Presets utilisateur ──────────────────────────────────────────────────────

export interface RetouchPreset {
  id: string;
  name: string;
  options: RetouchOptions;
  createdAt: string;
  /** true = preset livré avec l'app, non supprimable */
  isBuiltIn?: boolean;
}

export interface Photo {
  id: string;
  file: File;
  fileHash?: string;
  previewUrl: string;
  analysis: PhotoAnalysis | null;
  name?: string;
  size?: number;
  type?: string;
  lastModified?: number;
  metadata?: {
    width?: number;
    height?: number;
    exif?: unknown;
  };
  retouch?: PhotoRetouchState;
  computerVisionAnalysis?: {
    duplicateGroups: string[];
    blurScore: number;
    isBlurry: boolean;
    retouchRecommended: boolean;
    overallScore: number;
    recommendations: string[];
  };
}

export interface DuplicateGroup {
  id: string;
  hash: string;
  photos: Photo[];
  bestPhotoId: string;
}

type SetBestAction = {
  type: 'SET_BEST';
  payload: { groupId: string; previousBestId: string; newBestId: string };
};

type ToggleRejectAction = {
  type: 'TOGGLE_REJECT';
  payload: { photoId: string };
};

type SetRatingAction = {
  type: 'SET_RATING';
  payload: { photoId: string; previousRating: number; newRating: number };
};

type SetPickAction = {
  type: 'SET_PICK';
  payload: {
    photoId: string;
    previousPick: boolean;
    previousRejected: boolean;
  };
};

type SetRejectAction = {
  type: 'SET_REJECT';
  payload: {
    photoId: string;
    previousPick: boolean;
    previousRejected: boolean;
  };
};

type SetColorLabelAction = {
  type: 'SET_COLOR_LABEL';
  payload: { photoId: string; previousLabel: ColorLabel | null };
};

type UnflagAction = {
  type: 'UNFLAG';
  payload: {
    photoId: string;
    previousPick: boolean;
    previousRejected: boolean;
    previousColorLabel: ColorLabel | null;
  };
};

type SetNoteAction = {
  type: 'SET_NOTE';
  payload: { photoId: string; previousNote: string };
};

type DeletePhotoAction = {
  type: 'DELETE_PHOTO';
  payload: {
    photo: Photo;
    index: number;
    collectionIds: string[];
    wasRejected: boolean;
    /** Overrides « meilleur du groupe » qui pointaient sur cette photo (groupId → photoId). */
    bestOverrides: Record<string, string>;
  };
};

type DeleteCollectionAction = {
  type: 'DELETE_COLLECTION';
  payload: {
    collection: PhotoCollection;
    index: number;
    wasActive: boolean;
  };
};

export type UndoAction =
  | SetBestAction
  | ToggleRejectAction
  | SetRatingAction
  | SetPickAction
  | SetRejectAction
  | SetColorLabelAction
  | UnflagAction
  | SetNoteAction
  | DeletePhotoAction
  | DeleteCollectionAction;

export interface PhotoCollection {
  id: string;
  name: string;
  photoIds: string[];
  createdAt: string;
  updatedAt: string;
  description?: string;
}

export type SmartCollectionRule =
  | { type: 'all' }
  | { type: 'unreviewed' }
  | { type: 'review' }
  | { type: 'rating'; minValue: number }
  | { type: 'isPick' }
  | { type: 'isFavorite' }
  | { type: 'isRejected' }
  | { type: 'isDuplicate' }
  | { type: 'isBlurry' }
  | { type: 'readyToExport' }
  | { type: 'hasTag'; tag: string }
  | { type: 'colorLabel'; label: ColorLabel };

export interface SmartCollection {
  id: string;
  name: string;
  icon: string;
  rule: SmartCollectionRule;
}
