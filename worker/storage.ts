// Accès Storage Supabase pour le worker (download + upload), côté service-role.
// Import paresseux de @supabase/supabase-js pour ne pas le charger sur les
// chemins qui n'en ont pas besoin (stub/tests).

import { Buffer } from 'node:buffer';

export interface StorageIO {
  /** Télécharge un objet et renvoie ses octets. */
  download(path: string): Promise<Buffer>;
  /** Téléverse des octets (upsert) avec un content-type. */
  upload(path: string, data: Buffer, contentType: string): Promise<void>;
}

type StorageEnv = Record<string, string | undefined>;

export function createSupabaseStorage(env: StorageEnv): StorageIO {
  const url = env.SUPABASE_URL?.trim();
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket = env.PROJECT_PHOTOS_BUCKET?.trim() || 'project-photos';
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis pour le moteur image sharp'
    );
  }

  // Client Supabase chaîné dynamiquement (storage non typé finement ici).
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let clientPromise: Promise<any> | null = null;
  const getClient = async () => {
    if (!clientPromise) {
      clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
        createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      );
    }
    return clientPromise;
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return {
    async download(path: string): Promise<Buffer> {
      const client = await getClient();
      const { data, error } = await client.storage.from(bucket).download(path);
      if (error || !data) {
        throw new Error(`Téléchargement Storage échoué : ${path}`);
      }
      const arrayBuffer = await (data as Blob).arrayBuffer();
      return Buffer.from(arrayBuffer);
    },
    async upload(path: string, data: Buffer, contentType: string): Promise<void> {
      const client = await getClient();
      const { error } = await client.storage
        .from(bucket)
        .upload(path, data, { contentType, upsert: true });
      if (error) {
        throw new Error(`Upload Storage échoué : ${path}`);
      }
    },
  };
}
