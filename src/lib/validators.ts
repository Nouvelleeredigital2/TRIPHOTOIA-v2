import { z } from 'zod';
import type { PhotoAnalysis as AppPhotoAnalysis } from '@/types';

// P0-B : provenance obligatoire d'un résultat d'analyse.
export const analysisModeSchema = z.enum([
  'local-pixel',
  'cloud-model',
  'heuristic',
  'demo',
]);

export const analysisProvenanceSchema = z.object({
  engine: z.string().min(1).max(120),
  model: z.string().min(1).max(120),
  modelVersion: z.string().min(1).max(60),
  analysisMode: analysisModeSchema,
  confidence: z.number().finite().min(0).max(1).nullable(),
  isFallback: z.boolean(),
  computedAt: z.string().datetime(),
});

export const photoAnalysisSchema = z.object({
  isBlurry: z.boolean().optional(),
  sharpnessScore: z.number().finite().min(0).max(1).optional(),
  hasOpenEyes: z.boolean().optional(),
  tags: z.array(z.string().max(64)).max(50).optional(),
  perceptualHash: z.string().max(256).optional(),
  compositionScore: z.number().finite().min(0).max(1).optional(),
  suggestedRetouch: z
    .object({
      brightness: z.number().finite(),
      contrast: z.number().finite(),
      saturation: z.number().finite(),
    })
    .optional(),
  provenance: analysisProvenanceSchema.optional(),
  error: z.string().max(2000).optional(),
});

/**
 * P0-B : schéma strict appliqué aux résultats entrant dans l'application depuis
 * le moteur d'analyse. Un résultat « réussi » (sans `error`) doit porter une
 * provenance et n'avoir aucune valeur non finie / hors plage. Un échec doit
 * porter un `error` explicite (jamais transformé en score).
 */
export const analysisResultSchema = photoAnalysisSchema
  .refine((r) => Boolean(r.error) || Boolean(r.provenance), {
    message: 'Un résultat sans erreur doit porter une provenance.',
  })
  .refine((r) => r.provenance?.analysisMode !== 'demo', {
    message: 'Le mode "demo" est interdit en production.',
  });

/**
 * Valide un résultat d'analyse à la frontière. Retourne le résultat validé, ou
 * une erreur structurée — jamais un score fabriqué en cas d'échec de validation.
 */
export function validateAnalysisResult(
  input: unknown
): Partial<AppPhotoAnalysis> {
  const parsed = analysisResultSchema.safeParse(input);
  if (parsed.success) {
    return parsed.data as Partial<AppPhotoAnalysis>;
  }
  return {
    error: `Résultat d'analyse invalide: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
  };
}

export const photoSchema = z.object({
  id: z.string(),
  file: z.instanceof(File),
  previewUrl: z.string(),
  analysis: photoAnalysisSchema.nullable(),
});

export const duplicateGroupSchema = z.object({
  id: z.string(),
  hash: z.string(),
  photos: z.array(photoSchema),
  bestPhotoId: z.string(),
});

export const exportConfigSchema = z.object({
  format: z.enum(['original', 'jpeg', 'png', 'webp']),
  quality: z.number().min(1).max(100),
  maxWidth: z.number().min(100).max(4000).optional(),
  maxHeight: z.number().min(100).max(4000).optional(),
  includeRejected: z.boolean(),
  includeDuplicates: z.boolean(),
  exportPath: z.string().min(1),
});

export type PhotoAnalysis = z.infer<typeof photoAnalysisSchema>;
export type Photo = z.infer<typeof photoSchema>;
export type DuplicateGroup = z.infer<typeof duplicateGroupSchema>;
export type ExportConfig = z.infer<typeof exportConfigSchema>;
