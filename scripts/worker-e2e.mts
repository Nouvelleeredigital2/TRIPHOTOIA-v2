// Test E2E one-shot du worker : traite tous les jobs disponibles puis sort.
// Usage : node_modules/.bin/tsx --env-file=.env.local scripts/worker-e2e.mts
import { createClient } from '@supabase/supabase-js';
import { createEmbedder } from '../worker/embedding';
import { createFaceDetector } from '../worker/faceDetection';
import { createDefaultJobProcessors } from '../worker/jobRunner';
import { runWorkerOnce } from '../worker/index';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log('[e2e] SUPABASE_URL =', url);
console.log(
  '[e2e] service key present =',
  Boolean(key),
  key ? `(len ${key.length})` : ''
);
if (!url || !key) {
  console.error('[e2e] env manquante, abandon');
  process.exit(1);
}

const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const processors = createDefaultJobProcessors(
  createEmbedder(process.env),
  createFaceDetector(process.env)
);

let processed = 0;
for (let i = 0; i < 20; i += 1) {
  const did = await runWorkerOnce(client, 'e2e-once', processors);
  if (!did) break;
  processed += 1;
  console.log(`[e2e] job traité #${processed}`);
}
console.log(`[e2e] terminé — ${processed} job(s) traité(s)`);
process.exit(0);
