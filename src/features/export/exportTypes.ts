// Schéma et type du formulaire d'export, extraits de ExportTab pour briser le
// cycle d'import ExportTab ↔ export-presets (P2-2) : les presets référencent le
// type sans dépendre du composant.
import { z } from 'zod';

export const exportSchema = z.object({
  format: z.enum(['original', 'jpeg', 'png', 'webp']),
  quality: z.number().min(1).max(100),
  maxWidth: z.number().min(100).max(8000).optional(),
  maxHeight: z.number().min(100).max(8000).optional(),
  includeRejected: z.boolean(),
  includeDuplicates: z.boolean(),
  // Rename
  renamePattern: z.string(),
  // Filter mode
  filterMode: z.enum(['all', 'picks-only', 'favorites-only', 'min-rating']),
  minRating: z.number().min(1).max(5),
  // Watermark
  watermarkEnabled: z.boolean(),
  watermarkText: z.string(),
  watermarkPosition: z.enum([
    'bottom-left', 'bottom-center', 'bottom-right',
    'top-left', 'top-center', 'top-right',
  ]),
  watermarkSize: z.number().min(10).max(200),
  watermarkOpacity: z.number().min(1).max(100),
  watermarkColor: z.string(),
});

export type ExportFormData = z.infer<typeof exportSchema>;
