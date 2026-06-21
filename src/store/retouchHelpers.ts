// Helpers de retouche — purs, extraits de photoStore (P2-2) pour alléger le store.
import { RetouchOptions, createDefaultRetouchOptions } from '../types';

export const RETOUCH_HISTORY_LIMIT = 50;

export const cloneRetouchOptions = (
  options: RetouchOptions
): RetouchOptions => ({ ...options });

export const getDefaultRetouchOptions = (): RetouchOptions =>
  createDefaultRetouchOptions();

export const RETOUCH_BOUNDS: Record<
  keyof RetouchOptions,
  { min: number; max: number }
> = {
  temperature: { min: -100, max: 100 },
  tint: { min: -100, max: 100 },
  exposure: { min: -100, max: 100 },
  contrast: { min: -100, max: 100 },
  highlights: { min: -100, max: 100 },
  shadows: { min: -100, max: 100 },
  whites: { min: -100, max: 100 },
  blacks: { min: -100, max: 100 },
  clarity: { min: -100, max: 100 },
  texture: { min: -100, max: 100 },
  dehaze: { min: -100, max: 100 },
  vibrance: { min: -100, max: 100 },
  saturation: { min: -100, max: 100 },
  midtoneContrast: { min: -100, max: 100 },
  sharpness: { min: 0, max: 100 },
};

export const clampRetouchValue = (
  option: keyof RetouchOptions,
  value: number
) => {
  const bounds = RETOUCH_BOUNDS[option];
  if (!bounds) {
    return value;
  }
  return Math.min(Math.max(value, bounds.min), bounds.max);
};
