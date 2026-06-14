import { createClient } from '@supabase/supabase-js';
import { createWorkerConfig } from './config';
import { createEmbedder } from './embedding';
import { createFaceDetector } from './faceDetection';
import {
  claimNextJob,
  createDefaultJobProcessors,
  JobProcessorMap,
  processWorkerJob,
  RpcCapableClient,
} from './jobRunner';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

export async function runWorkerOnce(
  client: RpcCapableClient,
  workerId: string,
  processors?: JobProcessorMap,
): Promise<boolean> {
  // P0-3 : réclamation atomique (FOR UPDATE SKIP LOCKED via RPC). Plus de course
  // possible entre workers, plus d'erreur sur la prise de job.
  const claimedJob = await claimNextJob(client, workerId);
  if (!claimedJob) return false;

  await processWorkerJob(client, claimedJob, processors);
  return true;
}

export async function runWorkerLoop(): Promise<void> {
  const config = createWorkerConfig(process.env);
  const processors = createDefaultJobProcessors(
    createEmbedder(process.env),
    createFaceDetector(process.env),
  );
  const client = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // Boucle résiliente : une erreur sur une itération (réseau, claim, traitement)
  // est journalisée et suivie d'un backoff, sans jamais arrêter le process.
  let consecutiveErrors = 0;
  while (true) {
    try {
      const processed = await runWorkerOnce(client, config.workerId, processors);
      consecutiveErrors = 0;
      if (!processed) {
        await sleep(config.pollIntervalMs);
      }
    } catch (error) {
      consecutiveErrors += 1;
      console.error(`[worker] erreur itération (#${consecutiveErrors})`, error);
      // Backoff exponentiel plafonné à 60 s pour ne pas marteler en cas de panne.
      const backoff = Math.min(config.pollIntervalMs * 2 ** consecutiveErrors, 60_000);
      await sleep(backoff);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runWorkerLoop().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
