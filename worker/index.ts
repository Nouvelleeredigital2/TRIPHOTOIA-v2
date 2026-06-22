import { createClient } from '@supabase/supabase-js';
import { assertProvidersAllowed, createWorkerConfig } from './config';
import { createEmbedder } from './embedding';
import { createFaceDetector } from './faceDetection';
import { createImageProcessor } from './imageProcessing';
import { createSupabaseStorage } from './storage';
import {
  claimNextJob,
  createDefaultJobProcessors,
  JobProcessorMap,
  processWorkerJob,
  reclaimStuckJobs,
  RpcCapableClient,
} from './jobRunner';

// P1-E : intervalle minimal entre deux balayages de récupération de locks.
const RECLAIM_INTERVAL_MS = 60_000;
const STUCK_JOB_LEASE_SECONDS = 300;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export async function runWorkerOnce(
  client: RpcCapableClient,
  workerId: string,
  processors?: JobProcessorMap
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
  // P0-4 : refuse de démarrer en production avec des providers simulés.
  assertProvidersAllowed(process.env);
  const processors = createDefaultJobProcessors(
    createEmbedder(process.env),
    createFaceDetector(process.env),
    // P0-5 : moteur image réel (sharp) en prod, stub en dev/test selon IMAGE_PROCESSOR.
    createImageProcessor(process.env, createSupabaseStorage)
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
  let lastReclaim = 0;
  while (true) {
    try {
      const processed = await runWorkerOnce(
        client,
        config.workerId,
        processors
      );
      consecutiveErrors = 0;
      if (!processed) {
        // P1-E : à intervalle borné, récupérer les jobs bloqués en `processing`
        // dont le lock a expiré (worker crashé), pour qu'ils soient repris.
        const now = Date.now();
        if (now - lastReclaim >= RECLAIM_INTERVAL_MS) {
          lastReclaim = now;
          try {
            const reclaimed = await reclaimStuckJobs(
              client,
              STUCK_JOB_LEASE_SECONDS
            );
            if (reclaimed > 0) {
              console.warn(
                `[worker] ${reclaimed} job(s) bloqué(s) récupéré(s)`
              );
            }
          } catch (reclaimError) {
            console.error('[worker] reclaim_stuck_jobs a échoué', reclaimError);
          }
        }
        await sleep(config.pollIntervalMs);
      }
    } catch (error) {
      consecutiveErrors += 1;
      console.error(`[worker] erreur itération (#${consecutiveErrors})`, error);
      // Backoff exponentiel plafonné à 60 s pour ne pas marteler en cas de panne.
      const backoff = Math.min(
        config.pollIntervalMs * 2 ** consecutiveErrors,
        60_000
      );
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
