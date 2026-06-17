import { describe, it, expect } from 'vitest';
import { sanitizeLoadedAnalysis } from '@/lib/catalogue-persistence';
import type { PhotoAnalysis } from '@/types';

// P1-F : les analyses relues depuis IndexedDB sont validées ; les données
// corrompues sont rejetées proprement (jamais réinjectées comme un score).

describe('sanitizeLoadedAnalysis (P1-F)', () => {
  it('laisse passer null', () => {
    expect(sanitizeLoadedAnalysis(null)).toBeNull();
  });

  it('conserve une analyse valide, y compris ses champs utilisateur', () => {
    const valid: PhotoAnalysis = {
      sharpnessScore: 0.5,
      isBlurry: false,
      rating: 5,
      isPick: true,
    };
    const out = sanitizeLoadedAnalysis(valid);
    expect(out).toBe(valid);
    expect(out?.rating).toBe(5);
  });

  it('rejette une analyse corrompue (score non fini) en erreur structurée', () => {
    const corrupt = { sharpnessScore: Number.NaN } as unknown as PhotoAnalysis;
    const out = sanitizeLoadedAnalysis(corrupt);
    expect(out?.error).toBeTruthy();
    expect(out?.sharpnessScore).toBeUndefined();
  });

  it('rejette un score hors plage', () => {
    const out = sanitizeLoadedAnalysis({ sharpnessScore: 2 } as PhotoAnalysis);
    expect(out?.error).toBeTruthy();
  });

  it('préserve une analyse déjà en erreur', () => {
    const out = sanitizeLoadedAnalysis({ error: 'boom' });
    expect(out?.error).toBe('boom');
  });
});
