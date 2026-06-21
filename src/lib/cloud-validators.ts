import { z } from 'zod';

// P1-7 : validation runtime des réponses RPC Supabase aux frontières cloud.
// Les réponses étaient simplement castées (`as CloudProjectRow`) ; un payload
// inattendu (schéma modifié, null, champ manquant) entrait silencieusement.
// On valide désormais avec Zod et on lève une erreur explicite et traçable.

export const cloudProjectRowSchema = z.object({
  id: z.string().min(1),
  organization_id: z.string().min(1),
  name: z.string(),
  project_type: z.string(),
  status: z.string(),
  face_analysis_enabled: z.boolean().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type CloudProjectRowParsed = z.infer<typeof cloudProjectRowSchema>;

/** Normalise une réponse RPC (ligne ou tableau setof) en un seul objet. */
export function unwrapRpcRow(data: unknown): unknown {
  return Array.isArray(data) ? data[0] : data;
}

/**
 * Valide une ligne projet renvoyée par une RPC. Lève une erreur explicite
 * (jamais de cast silencieux) si le payload ne correspond pas au schéma.
 */
export function parseCloudProjectRow(data: unknown): CloudProjectRowParsed {
  const parsed = cloudProjectRowSchema.safeParse(unwrapRpcRow(data));
  if (!parsed.success) {
    throw new Error(
      `Réponse RPC projet invalide: ${parsed.error.issues
        .map((i) => `${i.path.join('.') || '(racine)'}: ${i.message}`)
        .join('; ')}`
    );
  }
  return parsed.data;
}
