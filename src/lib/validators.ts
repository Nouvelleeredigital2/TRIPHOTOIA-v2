import { z } from 'zod';

export const photoAnalysisSchema = z.object({
  isBlurry: z.boolean().optional(),
  sharpnessScore: z.number().min(0).max(1).optional(),
  hasOpenEyes: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  perceptualHash: z.string().optional(),
  suggestedRetouch: z.object({
    brightness: z.number(),
    contrast: z.number(),
    saturation: z.number(),
  }).optional(),
  error: z.string().optional(),
});

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
