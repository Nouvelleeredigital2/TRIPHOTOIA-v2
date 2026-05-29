import { createClient } from '@supabase/supabase-js';
import { createWorkerConfig } from './config';
import { createEmbedder } from './embedding';
import { createFaceDetector } from './faceDetection';
import {
  createDefaultJobProcessors,
  JobProcessorMap,
  markJobProcessing,
  pollNextPendingJob,
  processWorkerJob,
  SupabaseLikeClient,
} from './jobRunner';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

export async function runWorkerOnce(
  client: SupabaseLikeClient,
  workerId: string,
  processors?: JobProcessorMap,
): Promise<boolean> {
  const pendingJob = await pollNextPendingJob(client);
  if (!pendingJob) return false;

  const claimedJob = await markJobProcessing(client, pendingJob, workerId);
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

  while (true) {
    const processed = await runWorkerOnce(client, config.workerId, processors);
    if (!processed) {
      await sleep(config.pollIntervalMs);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runWorkerLoop().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
