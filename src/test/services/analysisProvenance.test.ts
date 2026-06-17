import { describe, it, expect } from 'vitest';
import { validateAnalysisResult, analysisResultSchema } from '@/lib/validators';
import {
  setAnalysisProvider,
  getAnalysisConfig,
} from '@/services/geminiService';

// P0-B : provenance + validation Zod des résultats d'analyse.

const validProvenance = {
  engine: 'treephoto-local-canvas',
  model: 'pixel-heuristics',
  modelVersion: '1.0.0',
  analysisMode: 'local-pixel' as const,
  confidence: null,
  isFallback: false,
  computedAt: '2026-06-17T10:00:00.000Z',
};

describe('validateAnalysisResult (P0-B)', () => {
  it("n'invente pas de score : une erreur reste une erreur", () => {
    const out = validateAnalysisResult({ error: 'décodage impossible' });
    expect(out.error).toBe('décodage impossible');
    expect(out.sharpnessScore).toBeUndefined();
    expect(out.isBlurry).toBeUndefined();
  });

  it('accepte un résultat de production porteur de provenance', () => {
    const out = validateAnalysisResult({
      isBlurry: false,
      sharpnessScore: 0.82,
      tags: ['sharp'],
      perceptualHash: '1010',
      provenance: validProvenance,
    });
    expect(out.error).toBeUndefined();
    expect(out.provenance?.analysisMode).toBe('local-pixel');
    expect(out.sharpnessScore).toBe(0.82);
  });

  it('rejette un résultat « réussi » sans provenance (→ erreur structurée)', () => {
    const out = validateAnalysisResult({ sharpnessScore: 0.5 });
    expect(out.error).toBeTruthy();
    expect(out.sharpnessScore).toBeUndefined();
  });

  it('rejette un mode "demo" en production (→ erreur)', () => {
    const out = validateAnalysisResult({
      sharpnessScore: 0.5,
      provenance: { ...validProvenance, analysisMode: 'demo' },
    });
    expect(out.error).toBeTruthy();
  });

  it('rejette les scores non finis ou hors plage (NaN, Infinity, > 1)', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 1.5, -0.1]) {
      const out = validateAnalysisResult({
        sharpnessScore: bad,
        provenance: validProvenance,
      });
      expect(out.error, `score ${bad} aurait dû être rejeté`).toBeTruthy();
    }
  });

  it('un score valide réussit le safeParse strict', () => {
    expect(
      analysisResultSchema.safeParse({
        sharpnessScore: 1,
        provenance: validProvenance,
      }).success
    ).toBe(true);
  });
});

describe('façade : providers non implémentés non sélectionnables (P0-A/P1-B)', () => {
  it('force le provider sur "local" même si on tente un provider distant', () => {
    setAnalysisProvider({
      provider: 'huggingface',
      apiKey: 'secret',
    } as unknown as Parameters<typeof setAnalysisProvider>[0]);
    expect(getAnalysisConfig().provider).toBe('local');
    // Aucune clé d'API n'est conservée dans la config.
    expect(
      (getAnalysisConfig() as unknown as Record<string, unknown>).apiKey
    ).toBeUndefined();
  });
});
